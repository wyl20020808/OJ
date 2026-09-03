import {
  id,
  now,
  canonicalManifestHash,
  effective,
  sha256,
  validateDefaults,
  validateLimit,
  validateObjectRef,
  JudgeDataError,
  type JudgeDataRepository,
  type JudgeDraft,
  type DraftTestcase,
  type ObjectRef,
  type JudgeDataVersion,
  type JudgeDataHandoff,
} from './model.js';
import type { ByteStorage } from './storage.js';
import { parseZip } from './zip.js';
import { MAX_TESTCASE_PAYLOAD_BYTES } from './limits.js';
import {
  TESTCASE_SET_MAX_EXPECTED_OUTPUT_BYTES,
  TESTCASE_SET_MAX_INPUT_BYTES,
  TESTCASE_SET_MAX_SIZE,
} from '../judge/testcase-set.js';

type PublicObjectRef = Omit<ObjectRef, 'key'>;
const publicRef = (ref: ObjectRef): PublicObjectRef => ({
  objectId: ref.objectId,
  fileName: ref.fileName,
  sizeBytes: ref.sizeBytes,
  sha256: ref.sha256,
});
const publicCase = (testcase: DraftTestcase) => ({
  ...testcase,
  input: publicRef(testcase.input),
  expectedOutput: publicRef(testcase.expectedOutput),
});
const publicDraft = (draft: JudgeDraft) => ({
  ...draft,
  testcases: draft.testcases.map(publicCase),
});
const publicVersion = (version: JudgeDataVersion) => ({
  ...version,
  testcases: version.testcases.map(publicCase),
});
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
    }>,
    private readonly guardGuestMutation?: (
      action: 'manage' | 'publish',
      user: unknown,
    ) => Promise<void>,
  ) {}
  private assertDraftRef(problemId: string, ref: { key: string }) {
    const prefix = `judge-data/problems/${problemId}/draft/`;
    const parts = ref.key.split('/');
    if (
      !ref.key.startsWith(prefix) ||
      ref.key.length > 1024 ||
      ref.key.includes('\\') ||
      ref.key.includes('\0') ||
      parts.some((part) => part === '.' || part === '..' || part === '')
    )
      throw new JudgeDataError(
        'INVALID_PAIR',
        'Object is not owned by problem draft',
      );
  }
  private async auth(action: string, user: unknown, p: string) {
    if (!user)
      throw new JudgeDataError('UNAUTHORIZED', 'Authentication required', 401);
    if (!(await this.can(action, user, p)))
      throw new JudgeDataError('FORBIDDEN', 'Forbidden', 403);
    if (action === 'manage' || action === 'publish')
      try {
        await this.guardGuestMutation?.(action, user);
      } catch {
        throw new JudgeDataError('RATE_LIMITED', 'Request rate limited', 429);
      }
    if (!(await this.problemExists(p)))
      throw new JudgeDataError('NOT_FOUND', 'Problem not found', 404);
  }
  async draft(problemId: string, user: unknown) {
    await this.auth('view', user, problemId);
    const draft = await this.repo.getDraft(problemId);
    return draft ? publicDraft(draft) : undefined;
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
    return (await this.repo.listVersions(problemId)).map(publicVersion);
  }
  async version(problemId: string, versionId: string, user: unknown) {
    await this.auth('view', user, problemId);
    const v = await this.repo.getVersion(problemId, versionId);
    if (!v) throw new JudgeDataError('NOT_FOUND', 'Version not found', 404);
    return publicVersion(v);
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
      input: publicRef(found.input),
      expectedOutput: publicRef(found.expectedOutput),
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
      testcases: (old?.testcases ?? []).map((testcase) => ({
        ...testcase,
        effectiveTimeLimitMs: effective(
          testcase.timeLimitMsOverride,
          defaults.timeLimitMs,
        ),
        effectiveMemoryLimitBytes: effective(
          testcase.memoryLimitBytesOverride,
          defaults.memoryLimitBytes,
        ),
        effectiveOutputLimitBytes: effective(
          testcase.outputLimitBytesOverride,
          defaults.outputLimitBytes,
        ),
      })),
      updatedAt: now(),
      updatedBy: (user as { userId: string }).userId,
    };
    return publicDraft(await this.repo.saveDraft(draft, old?.revision));
  }
  private async saveCase(problemId: string, c: DraftTestcase, user: unknown) {
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
          checker: 'TOKEN_WHITESPACE',
          allowedLanguageProfiles: ['cpp20-gcc-13-v1'],
        }),
      testcases: [...(old?.testcases ?? []), c]
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((testcase, ordinal) => ({ ...testcase, ordinal })),
      updatedAt: now(),
      updatedBy: (user as { userId: string }).userId,
    };
    return publicDraft(await this.repo.saveDraft(draft, old?.revision));
  }
  async addTestcase(problemId: string, body: unknown, user: unknown) {
    await this.auth('manage', user, problemId);
    const b = body as Record<string, unknown>;
    const old = await this.repo.getDraft(problemId);
    if ((old?.testcases.length ?? 0) >= TESTCASE_SET_MAX_SIZE)
      throw new JudgeDataError('VALIDATION_FAILED', 'Too many testcases');
    const defaults =
      old?.defaults ??
      validateDefaults({
        timeLimitMs: 1000,
        memoryLimitBytes: 64 * 1024 * 1024,
        outputLimitBytes: 64 * 1024,
        checker: 'TOKEN_WHITESPACE',
        allowedLanguageProfiles: ['cpp20-gcc-13-v1'],
      });
    const input = validateObjectRef(b.input);
    const expectedOutput = validateObjectRef(b.expectedOutput);
    this.assertDraftRef(problemId, input);
    this.assertDraftRef(problemId, expectedOutput);
    await Promise.all([
      this.storage.verify(input),
      this.storage.verify(expectedOutput),
    ]);
    const c: DraftTestcase = {
      testcaseId: typeof b.testcaseId === 'string' ? b.testcaseId : id(),
      ordinal:
        b.ordinal === undefined
          ? (old?.testcases.length ?? 0)
          : Number.isSafeInteger(b.ordinal) && Number(b.ordinal) >= 0
            ? Number(b.ordinal)
            : (() => {
                throw new JudgeDataError(
                  'VALIDATION_FAILED',
                  'Invalid ordinal',
                );
              })(),
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
    const inputMatch = /^(.*)\.in$/i.exec(fileNames.input);
    const outputMatch = /^(.*)\.(?:out|ans|txt)$/i.exec(fileNames.output);
    if (
      !inputMatch?.[1] ||
      !outputMatch?.[1] ||
      inputMatch[1].normalize('NFKC').toLowerCase() !==
        outputMatch[1].normalize('NFKC').toLowerCase()
    )
      throw new JudgeDataError(
        'INVALID_PAIR',
        'Input and output files must use matching testcase names',
      );
    const old = await this.repo.getDraft(problemId);
    if ((old?.testcases.length ?? 0) >= TESTCASE_SET_MAX_SIZE)
      throw new JudgeDataError('VALIDATION_FAILED', 'Too many testcases');
    if (
      input.byteLength > MAX_TESTCASE_PAYLOAD_BYTES ||
      output.byteLength > MAX_TESTCASE_PAYLOAD_BYTES
    )
      throw new JudgeDataError('UPLOAD_TOO_LARGE', 'Upload too large', 413);
    for (const name of [fileNames.input, fileNames.output]) {
      if (
        !name ||
        name.length > 255 ||
        name.includes('\\') ||
        name.includes('\0') ||
        name.startsWith('/') ||
        name
          .split('/')
          .some((part) => part === '.' || part === '..' || part === '')
      )
        throw new JudgeDataError('UNSAFE_ARCHIVE', 'Unsafe file name');
    }
    const base = `judge-data/problems/${problemId}/draft/${id()}`;
    const refs = await this.uploadPair(
      problemId,
      input,
      output,
      base,
      fileNames,
    );
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
    try {
      return await this.saveCase(problemId, c, user);
    } catch (error) {
      if (this.storage.remove)
        await Promise.all(refs.map((ref) => this.storage.remove!(ref)));
      throw error;
    }
  }
  private async uploadPair(
    problemId: string,
    input: Uint8Array,
    output: Uint8Array,
    base: string,
    fileNames: { input: string; output: string },
  ) {
    const refs: Awaited<ReturnType<ByteStorage['put']>>[] = [];
    try {
      refs.push(
        await this.storage.put(
          input,
          `${base}/input`,
          fileNames.input,
          problemId,
        ),
      );
      refs.push(
        await this.storage.put(
          output,
          `${base}/output`,
          fileNames.output,
          problemId,
        ),
      );
      return [refs[0]!, refs[1]!] as const;
    } catch (error) {
      if (this.storage.remove)
        await Promise.all(refs.map((ref) => this.storage.remove!(ref)));
      throw error;
    }
  }
  async addZip(problemId: string, bytes: Uint8Array, user: unknown) {
    await this.auth('manage', user, problemId);
    const pairs = parseZip(bytes);
    const old = await this.repo.getDraft(problemId);
    if ((old?.testcases.length ?? 0) + pairs.length > TESTCASE_SET_MAX_SIZE)
      throw new JudgeDataError('VALIDATION_FAILED', 'Too many testcases');
    const defaults =
      old?.defaults ??
      validateDefaults({
        timeLimitMs: 1000,
        memoryLimitBytes: 64 * 1024 * 1024,
        outputLimitBytes: 64 * 1024,
        checker: 'TOKEN_WHITESPACE',
        allowedLanguageProfiles: ['cpp20-gcc-13-v1'],
      });
    const base = `judge-data/problems/${problemId}/draft/${id()}`;
    const uploaded: {
      refs: readonly [ObjectRef, ObjectRef];
      name: string;
      ordinal: number;
    }[] = [];
    try {
      for (const [index, p] of pairs.entries()) {
        const refs = await this.uploadPair(
          problemId,
          p.input,
          p.output,
          `${base}/${index}`,
          { input: `${p.name}.in`, output: `${p.name}.out` },
        );
        uploaded.push({
          refs,
          name: p.name,
          ordinal: (old?.testcases.length ?? 0) + index,
        });
      }
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
        draft: publicDraft(await this.repo.saveDraft(draft, old?.revision)),
      };
    } catch (error) {
      if (this.storage.remove)
        await Promise.all(
          uploaded.flatMap(({ refs }) =>
            refs.map((ref) => this.storage.remove!(ref)),
          ),
        );
      throw error;
    }
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
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((testcase, ordinal) => ({ ...testcase, ordinal }));
    draft.status = 'DRAFT';
    delete draft.manifestSha256;
    draft.updatedBy = (user as { userId: string }).userId;
    return publicDraft(await this.repo.saveDraft(draft, draft.revision));
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
    return publicDraft(await this.repo.saveDraft(draft, draft.revision));
  }
  async validate(problemId: string, user: unknown) {
    await this.auth('manage', user, problemId);
    const d = await this.repo.getDraft(problemId);
    if (!d || !d.testcases.length)
      throw new JudgeDataError(
        'VALIDATION_FAILED',
        'At least one testcase required',
      );
    if (
      d.testcases.length > TESTCASE_SET_MAX_SIZE ||
      d.testcases.some((testcase, index) => testcase.ordinal !== index) ||
      new Set(d.testcases.map((testcase) => testcase.testcaseId)).size !==
        d.testcases.length
    )
      throw new JudgeDataError('VALIDATION_FAILED', 'Invalid testcase order');
    for (const c of d.testcases) {
      this.assertDraftRef(problemId, c.input);
      this.assertDraftRef(problemId, c.expectedOutput);
      await this.storage.verify(c.input);
      await this.storage.verify(c.expectedOutput);
      if (
        c.input.sizeBytes > TESTCASE_SET_MAX_INPUT_BYTES ||
        c.expectedOutput.sizeBytes > TESTCASE_SET_MAX_EXPECTED_OUTPUT_BYTES
      )
        throw new JudgeDataError(
          'TESTCASE_SIZE_EXCEEDED',
          `Testcase #${c.ordinal + 1} exceeds the Judge execution byte limit`,
        );
      if (!this.storage.get)
        throw new JudgeDataError(
          'STORAGE_UNAVAILABLE',
          'Judge Data retrieval is unavailable',
          503,
        );
      const [input, expectedOutput] = await Promise.all([
        this.storage.get(c.input),
        this.storage.get(c.expectedOutput),
      ]);
      if (
        input.byteLength !== c.input.sizeBytes ||
        expectedOutput.byteLength !== c.expectedOutput.sizeBytes ||
        sha256(input) !== c.input.sha256 ||
        sha256(expectedOutput) !== c.expectedOutput.sha256
      )
        throw new JudgeDataError(
          'INTEGRITY_MISMATCH',
          'Judge Data object integrity mismatch',
          409,
        );
    }
    const hash = canonicalManifestHash(d, d.testcases);
    d.status = 'VALIDATED';
    d.manifestSha256 = hash;
    return publicDraft(await this.repo.saveDraft(d, d.revision));
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
      this.assertDraftRef(problemId, c.input);
      this.assertDraftRef(problemId, c.expectedOutput);
      await this.storage.verify(c.input);
      await this.storage.verify(c.expectedOutput);
    }
    return publicVersion(
      await this.repo.publish(
        d,
        (user as { userId: string }).userId,
        expectedRevision ?? d.revision,
      ),
    );
  }
  handoff(
    v: Awaited<ReturnType<JudgeDataRepository['getVersion']>>,
  ): JudgeDataHandoff {
    if (!v) throw new JudgeDataError('NOT_FOUND', 'Version not found', 404);
    return {
      problemId: v.problemId,
      judgeDataVersionId: v.versionId,
      problemRevisionId: v.problemRevisionId,
      testdataVersionId: v.testdataVersionId,
      testcaseSetId: v.testcaseSetId,
      manifestSha256: v.manifestSha256,
      checker: v.checker,
      executionProfileId: v.executionProfileId,
      allowedLanguageProfiles: [...v.allowedLanguageProfiles],
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
