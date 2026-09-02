/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  id,
  now,
  manifestHash,
  effective,
  validateDefaults,
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
    const draft: JudgeDraft = {
      problemId,
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
    const draft: JudgeDraft = {
      problemId,
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
    const input = b.input as any;
    const expectedOutput = b.expectedOutput as any;
    if (!input?.objectId || !expectedOutput?.objectId)
      throw new JudgeDataError(
        'INVALID_PAIR',
        'Input and expected output references are required',
      );
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
          : Number(b.memoryLimitBytesOverride),
      outputLimitBytesOverride:
        b.outputLimitBytesOverride == null
          ? null
          : Number(b.outputLimitBytesOverride),
      effectiveTimeLimitMs: effective(
        Number(b.timeLimitMsOverride) || null,
        defaults.timeLimitMs,
      ),
      effectiveMemoryLimitBytes: effective(
        Number(b.memoryLimitBytesOverride) || null,
        defaults.memoryLimitBytes,
      ),
      effectiveOutputLimitBytes: effective(
        Number(b.outputLimitBytesOverride) || null,
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
    const result = [];
    for (const p of pairs)
      result.push(
        await this.addPair(
          problemId,
          p.input,
          p.output,
          { input: `${p.name}.in`, output: `${p.name}.out` },
          user,
        ),
      );
    return { imported: pairs.length, draft: result.at(-1) };
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
    const hash = manifestHash(
      problemId,
      (await this.repo.listVersions(problemId)).length + 1,
      d.defaults,
      d.testcases,
    );
    d.status = 'VALIDATED';
    d.manifestSha256 = hash;
    return this.repo.saveDraft(d, d.revision);
  }
  async publish(problemId: string, user: unknown, expectedRevision?: number) {
    await this.auth('publish', user, problemId);
    const d = await this.repo.getDraft(problemId);
    if (!d || d.status !== 'VALIDATED' || !d.manifestSha256)
      throw new JudgeDataError('VALIDATION_FAILED', 'Draft must be validated');
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
