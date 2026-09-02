import {
  id,
  now,
  canonicalManifestHash,
  effective,
  validateDefaults,
  validateLimit,
  validateObjectRef,
  JudgeDataError,
  type JudgeDataRepository,
  type JudgeDraft,
  type DraftTestcase,
  type JudgeDataHandoff,
} from './model.js';
import type { ByteStorage } from './storage.js';
import { parseZip } from './zip.js';
export class ProblemJudgeDataService {
  constructor(
    private readonly repo: JudgeDataRepository,
    private readonly storage: ByteStorage,
    private readonly problemExists: (id: string) => Promise<boolean>,
    private readonly can: (
      action: string,
      user: unknown,
      problemId: string,
    ) => Promise<boolean>,
    private readonly resolveIdentity: (problemId: string) => Promise<{
      problemRevisionId: string;
      testdataVersionId: string;
      testcaseSetId: string;
      executionProfileId: 'cpp20-gcc-13-v1';
    }> = async (problemId) => ({
      problemRevisionId: `problem:${problemId}:current-revision`,
      testdataVersionId: `judge-data:${problemId}`,
      testcaseSetId: `judge-data:${problemId}`,
      executionProfileId: 'cpp20-gcc-13-v1',
    }),
  ) {}
  private async auth(action: string, user: unknown, p: string) {
    if (!user)
      throw new JudgeDataError('UNAUTHORIZED', 'Authentication required', 401);
    if (!(await this.can(action, user, p)))
      throw new JudgeDataError('FORBIDDEN', 'Forbidden', 403);
    if (!(await this.problemExists(p)))
      throw new JudgeDataError('NOT_FOUND', 'Problem not found', 404);
  }
  async draft(problemId: string, user: unknown) {
    await this.auth('view', user, problemId);
    return (await this.repo.getDraft(problemId)) ?? undefined;
  }
  async metadata(problemId: string, user: unknown) {
    await this.auth('view', user, problemId);
    const draft = await this.repo.getDraft(problemId);
    const versions = await this.repo.listVersions(problemId);
    return {
      problemId,
      draftRevision: draft?.revision ?? null,
      draftStatus: draft?.status ?? null,
      testcaseCount: draft?.testcases.length ?? 0,
      versions: versions.map((v) => ({
        versionId: v.versionId,
        versionNumber: v.versionNumber,
        manifestSha256: v.manifestSha256,
        testcaseCount: v.testcaseCount,
        checker: v.checker,
        publishedAt: v.publishedAt,
      })),
    };
  }
  async versions(problemId: string, user: unknown) {
    await this.auth('view', user, problemId);
    return this.repo.listVersions(problemId);
  }
  async version(problemId: string, versionId: string, user: unknown) {
    await this.auth('view', user, problemId);
    const v = await this.repo.getVersion(problemId, versionId);
    if (!v) throw new JudgeDataError('NOT_FOUND', 'Version not found', 404);
    return v;
  }
  async testcase(problemId: string, testcaseId: string, user: unknown) {
    await this.auth('view', user, problemId);
    const draft = await this.repo.getDraft(problemId);
    const found =
      draft?.testcases.find((c) => c.testcaseId === testcaseId) ??
      (await this.repo.listVersions(problemId))
        .flatMap((v) => v.testcases)
        .find((c) => c.testcaseId === testcaseId);
    if (!found)
      throw new JudgeDataError('NOT_FOUND', 'Testcase not found', 404);
    return {
      ...found,
      input: { ...found.input },
      expectedOutput: { ...found.expectedOutput },
    };
  }
  async saveConfig(problemId: string, body: unknown, user: unknown) {
    await this.auth('manage', user, problemId);
    const old = await this.repo.getDraft(problemId);
    const defaults = validateDefaults(body);
    const identity = old ?? {
      problemId,
      ...(await this.resolveIdentity(problemId)),
    };
    const draft: JudgeDraft = {
      problemId,
      problemRevisionId: identity.problemRevisionId,
      testdataVersionId: identity.testdataVersionId,
      testcaseSetId: identity.testcaseSetId,
      executionProfileId: identity.executionProfileId,
      status: 'DRAFT',
      revision: old?.revision ?? 0,
      defaults,
      testcases: old?.testcases ?? [],
      updatedAt: now(),
      updatedBy: (user as { userId: string }).userId,
    };
    return this.repo.saveDraft(draft, old?.revision);
  }
  private async saveCase(problemId: string, c: DraftTestcase, user: unknown) {
    await this.auth('manage', user, problemId);
    const old = await this.repo.getDraft(problemId);
    if (old?.testcases.some((x) => x.testcaseId === c.testcaseId))
      throw new JudgeDataError('DUPLICATE', 'Duplicate testcase', 409);
    const identity = old ?? {
      problemId,
      ...(await this.resolveIdentity(problemId)),
    };
    const draft: JudgeDraft = {
      problemId,
      problemRevisionId: identity.problemRevisionId,
      testdataVersionId: identity.testdataVersionId,
      testcaseSetId: identity.testcaseSetId,
      executionProfileId: identity.executionProfileId,
      status: 'DRAFT',
      revision: old?.revision ?? 0,
      defaults:
        old?.defaults ??
        validateDefaults({
          timeLimitMs: 1000,
          memoryLimitBytes: 64 * 1024 * 1024,
          outputLimitBytes: 64 * 1024,
          checker: 'EXACT_BYTES',
          allowedLanguageProfiles: ['cpp20-gcc-13-v1'],
        }),
      testcases: [...(old?.testcases ?? []), c].sort(
        (a, b) => a.ordinal - b.ordinal,
      ),
      updatedAt: now(),
      updatedBy: (user as { userId: string }).userId,
    };
    return this.repo.saveDraft(draft, old?.revision);
  }
  async addTestcase(problemId: string, body: unknown, user: unknown) {
    await this.auth('manage', user, problemId);
    const b = body as Record<string, unknown>;
    const old = await this.repo.getDraft(problemId);
    const defaults =
      old?.defaults ??
      validateDefaults({
        timeLimitMs: 1000,
        memoryLimitBytes: 64 * 1024 * 1024,
        outputLimitBytes: 64 * 1024,
        checker: 'EXACT_BYTES',
        allowedLanguageProfiles: ['cpp20-gcc-13-v1'],
      });
    const input = validateObjectRef(b.input);
    const expectedOutput = validateObjectRef(b.expectedOutput);
    const c: DraftTestcase = {
      testcaseId: typeof b.testcaseId === 'string' ? b.testcaseId : id(),
      ordinal: Number.isInteger(b.ordinal)
        ? Number(b.ordinal)
        : (old?.testcases.length ?? 0),
      label: typeof b.label === 'string' ? b.label : null,
      input,
      expectedOutput,
      timeLimitMsOverride:
        b.timeLimitMsOverride == null
          ? null
          : validateDefaults({
              timeLimitMs: b.timeLimitMsOverride,
              memoryLimitBytes: defaults.memoryLimitBytes,
              outputLimitBytes: defaults.outputLimitBytes,
              checker: defaults.checker,
              allowedLanguageProfiles: defaults.allowedLanguageProfiles,
            }).timeLimitMs,
      memoryLimitBytesOverride:
        b.memoryLimitBytesOverride == null
          ? null
          : validateLimit(b.memoryLimitBytesOverride),
      outputLimitBytesOverride:
        b.outputLimitBytesOverride == null
          ? null
          : validateLimit(b.outputLimitBytesOverride),
      effectiveTimeLimitMs: effective(
        b.timeLimitMsOverride == null
          ? null
          : validateLimit(b.timeLimitMsOverride, 600_000),
        defaults.timeLimitMs,
      ),
      effectiveMemoryLimitBytes: effective(
        b.memoryLimitBytesOverride == null
          ? null
          : validateLimit(b.memoryLimitBytesOverride),
        defaults.memoryLimitBytes,
      ),
      effectiveOutputLimitBytes: effective(
        b.outputLimitBytesOverride == null
          ? null
          : validateLimit(b.outputLimitBytesOverride),
        defaults.outputLimitBytes,
      ),
      createdAt: now(),
      updatedAt: now(),
    };
    return this.saveCase(problemId, c, user);
  }
  async addPair(
    problemId: string,
    input: Uint8Array,
    output: Uint8Array,
    fileNames: { input: string; output: string },
    user: unknown,
  ) {
    await this.auth('manage', user, problemId);
    if (
      input.byteLength > 16 * 1024 * 1024 ||
      output.byteLength > 16 * 1024 * 1024
    )
      throw new JudgeDataError('UPLOAD_TOO_LARGE', 'Upload too large', 413);
    for (const name of [fileNames.input, fileNames.output]) {
      if (
        !name ||
        name.length > 255 ||
        name.includes('\\') ||
        name.startsWith('/') ||
        name.split('/').includes('..')
      )
        throw new JudgeDataError('UNSAFE_ARCHIVE', 'Unsafe file name');
    }
    const base = `judge-data/problems/${problemId}/draft/${id()}`;
    const refs = await Promise.all([
      this.storage.put(input, `${base}/input`, fileNames.input, problemId),
      this.storage.put(output, `${base}/output`, fileNames.output, problemId),
    ]);
    const old = await this.repo.getDraft(problemId);
    const ordinal = old?.testcases.length ?? 0;
    const c: DraftTestcase = {
      testcaseId: id(),
      ordinal,
      label: null,
      input: refs[0]!,
      expectedOutput: refs[1]!,
      timeLimitMsOverride: null,
      memoryLimitBytesOverride: null,
      outputLimitBytesOverride: null,
      effectiveTimeLimitMs: old?.defaults.timeLimitMs ?? 1000,
      effectiveMemoryLimitBytes:
        old?.defaults.memoryLimitBytes ?? 64 * 1024 * 1024,
      effectiveOutputLimitBytes: old?.defaults.outputLimitBytes ?? 64 * 1024,
      createdAt: now(),
      updatedAt: now(),
    };
    return this.saveCase(problemId, c, user);
  }
  async addZip(problemId: string, bytes: Uint8Array, user: unknown) {
    await this.auth('manage', user, problemId);
    const pairs = parseZip(bytes);
    const old = await this.repo.getDraft(problemId);
    const defaults =
      old?.defaults ??
      validateDefaults({
        timeLimitMs: 1000,
        memoryLimitBytes: 64 * 1024 * 1024,
        outputLimitBytes: 64 * 1024,
        checker: 'EXACT_BYTES',
        allowedLanguageProfiles: ['cpp20-gcc-13-v1'],
      });
    const base = `judge-data/problems/${problemId}/draft/${id()}`;
    const uploaded = await Promise.all(
      pairs.map(async (p, index) => {
        const refs = await Promise.all([
          this.storage.put(
            p.input,
            `${base}/${index}/input`,
            `${p.name}.in`,
            problemId,
          ),
          this.storage.put(
            p.output,
            `${base}/${index}/output`,
            `${p.name}.out`,
            problemId,
          ),
        ]);
        return {
          refs,
          name: p.name,
          ordinal: (old?.testcases.length ?? 0) + index,
        };
      }),
    );
    const timestamp = now();
    const testcases: DraftTestcase[] = uploaded.map(
      ({ refs, name, ordinal }) => ({
        testcaseId: id(),
        ordinal,
        label: name,
        input: refs[0]!,
        expectedOutput: refs[1]!,
        timeLimitMsOverride: null,
        memoryLimitBytesOverride: null,
        outputLimitBytesOverride: null,
        effectiveTimeLimitMs: defaults.timeLimitMs,
        effectiveMemoryLimitBytes: defaults.memoryLimitBytes,
        effectiveOutputLimitBytes: defaults.outputLimitBytes,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    const identity = old ?? {
      problemId,
      ...(await this.resolveIdentity(problemId)),
    };
    const draft: JudgeDraft = {
      problemId,
      problemRevisionId: identity.problemRevisionId,
      testdataVersionId: identity.testdataVersionId,
      testcaseSetId: identity.testcaseSetId,
      executionProfileId: identity.executionProfileId,
      status: 'DRAFT',
      revision: old?.revision ?? 0,
      defaults,
      testcases: [...(old?.testcases ?? []), ...testcases],
      updatedAt: timestamp,
      updatedBy: (user as { userId: string }).userId,
    };
    return {
      imported: pairs.length,
      draft: await this.repo.saveDraft(draft, old?.revision),
    };
  }
  async updateTestcase(
    problemId: string,
    testcaseId: string,
    body: unknown,
    user: unknown,
  ) {
    await this.auth('manage', user, problemId);
    const draft = await this.repo.getDraft(problemId);
    if (!draft) throw new JudgeDataError('NOT_FOUND', 'Draft not found', 404);
    const current = draft.testcases.find((c) => c.testcaseId === testcaseId);
    if (!current)
      throw new JudgeDataError('NOT_FOUND', 'Testcase not found', 404);
    const b = body as Record<string, unknown>;
    const time =
      b.timeLimitMsOverride === undefined
        ? current.timeLimitMsOverride
        : b.timeLimitMsOverride === null
          ? null
          : validateLimit(b.timeLimitMsOverride, 600_000);
    const memory =
      b.memoryLimitBytesOverride === undefined
        ? current.memoryLimitBytesOverride
        : b.memoryLimitBytesOverride === null
          ? null
          : validateLimit(b.memoryLimitBytesOverride);
    const output =
      b.outputLimitBytesOverride === undefined
        ? current.outputLimitBytesOverride
        : b.outputLimitBytesOverride === null
          ? null
          : validateLimit(b.outputLimitBytesOverride);
    const next: DraftTestcase = {
      ...current,
      label:
        b.label === undefined
          ? current.label
          : typeof b.label === 'string'
            ? b.label
            : null,
      ordinal:
        b.ordinal === undefined
          ? current.ordinal
          : Number.isSafeInteger(b.ordinal) && Number(b.ordinal) >= 0
            ? Number(b.ordinal)
            : (() => {
                throw new JudgeDataError(
                  'VALIDATION_FAILED',
                  'Invalid ordinal',
                );
              })(),
      timeLimitMsOverride: time,
      memoryLimitBytesOverride: memory,
      outputLimitBytesOverride: output,
      effectiveTimeLimitMs: effective(time, draft.defaults.timeLimitMs),
      effectiveMemoryLimitBytes: effective(
        memory,
        draft.defaults.memoryLimitBytes,
      ),
      effectiveOutputLimitBytes: effective(
        output,
        draft.defaults.outputLimitBytes,
      ),
      updatedAt: now(),
    };
    draft.testcases = draft.testcases
      .map((c) => (c.testcaseId === testcaseId ? next : c))
      .sort((a, b) => a.ordinal - b.ordinal);
    draft.status = 'DRAFT';
    delete draft.manifestSha256;
    draft.updatedBy = (user as { userId: string }).userId;
    return this.repo.saveDraft(draft, draft.revision);
  }
  async deleteTestcase(problemId: string, testcaseId: string, user: unknown) {
    await this.auth('manage', user, problemId);
    const draft = await this.repo.getDraft(problemId);
    if (!draft) throw new JudgeDataError('NOT_FOUND', 'Draft not found', 404);
    if (!draft.testcases.some((c) => c.testcaseId === testcaseId))
      throw new JudgeDataError('NOT_FOUND', 'Testcase not found', 404);
    draft.testcases = draft.testcases
      .filter((c) => c.testcaseId !== testcaseId)
      .map((c, ordinal) => ({ ...c, ordinal }));
    draft.status = 'DRAFT';
    delete draft.manifestSha256;
    draft.updatedBy = (user as { userId: string }).userId;
    return this.repo.saveDraft(draft, draft.revision);
  }
  async validate(problemId: string, user: unknown) {
    await this.auth('manage', user, problemId);
    const d = await this.repo.getDraft(problemId);
    if (!d || !d.testcases.length)
      throw new JudgeDataError(
        'VALIDATION_FAILED',
        'At least one testcase required',
      );
    for (const c of d.testcases) {
      await this.storage.verify(c.input);
      await this.storage.verify(c.expectedOutput);
    }
    const hash = canonicalManifestHash(d, d.testcases);
    d.status = 'VALIDATED';
    d.manifestSha256 = hash;
    return this.repo.saveDraft(d, d.revision);
  }
  async publish(problemId: string, user: unknown, expectedRevision?: number) {
    await this.auth('publish', user, problemId);
    const d = await this.repo.getDraft(problemId);
    if (!d || d.status !== 'VALIDATED' || !d.manifestSha256)
      throw new JudgeDataError('VALIDATION_FAILED', 'Draft must be validated');
    const computed = canonicalManifestHash(d, d.testcases);
    if (computed !== d.manifestSha256)
      throw new JudgeDataError('INTEGRITY_MISMATCH', 'Manifest changed', 409);
    for (const c of d.testcases) {
      await this.storage.verify(c.input);
      await this.storage.verify(c.expectedOutput);
    }
    return this.repo.publish(
      d,
      (user as { userId: string }).userId,
      expectedRevision ?? d.revision,
    );
  }
  handoff(
    v: Awaited<ReturnType<JudgeDataRepository['getVersion']>>,
  ): JudgeDataHandoff {
    if (!v) throw new JudgeDataError('NOT_FOUND', 'Version not found', 404);
    return {
      problemId: v.problemId,
      judgeDataVersionId: v.versionId,
      problemRevisionId: v.problemRevisionId ?? 'product-current-revision',
      testdataVersionId: v.testdataVersionId ?? v.versionId,
      testcaseSetId: v.testcaseSetId ?? v.versionId,
      manifestSha256: v.manifestSha256,
      checker: v.checker,
      executionProfileId: 'cpp20-gcc-13-v1',
      allowedLanguageProfiles: ['cpp20-gcc-13-v1'],
      testcases: v.testcases.map((c) => ({
        testcaseId: c.testcaseId,
        ordinal: c.ordinal,
        input: c.input,
        expectedOutput: c.expectedOutput,
        inputSha256: c.input.sha256,
        expectedOutputSha256: c.expectedOutput.sha256,
        timeLimitMs: c.effectiveTimeLimitMs,
        memoryLimitBytes: c.effectiveMemoryLimitBytes,
        outputLimitBytes: c.effectiveOutputLimitBytes,
      })),
    };
  }
}
