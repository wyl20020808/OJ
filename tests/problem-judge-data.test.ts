import { describe, expect, it } from 'vitest';
import {
  InMemoryJudgeDataRepository,
  MemoryByteStorage,
  ProblemJudgeDataService,
  JudgeDataError,
  canonicalManifestHash,
} from '../apps/api/src/modules/problem-judge-data/index.js';

const user = { userId: 'author-1', strength: 'password' };
const identity = {
  problemRevisionId: 'revision-1',
  testdataVersionId: 'testdata-v1',
  testcaseSetId: 'set-1',
  executionProfileId: 'cpp20-gcc-13-v1' as const,
};
const service = (allowed = true) => {
  const repo = new InMemoryJudgeDataRepository();
  const storage = new MemoryByteStorage();
  const svc = new ProblemJudgeDataService(
    repo,
    storage,
    async () => true,
    async () => allowed,
    async () => identity,
  );
  return { repo, storage, svc };
};

describe('problem judge data backend', () => {
  it('inherits defaults and freezes published testcase data', async () => {
    const { svc, storage } = service();
    const input = new Uint8Array([1, 2]);
    const output = new Uint8Array([3]);
    const refs = await Promise.all([
      storage.put(input, 'draft/i', '01.in', 'p-1'),
      storage.put(output, 'draft/o', '01.out', 'p-1'),
    ]);
    await svc.saveConfig(
      'p-1',
      {
        timeLimitMs: 2000,
        memoryLimitBytes: 1024,
        outputLimitBytes: 256,
        checker: 'EXACT_BYTES',
        allowedLanguageProfiles: ['cpp20-gcc-13-v1'],
      },
      user,
    );
    await svc.addTestcase(
      'p-1',
      {
        input: refs[0],
        expectedOutput: refs[1],
        timeLimitMsOverride: 500,
      },
      user,
    );
    const draft = await svc.validate('p-1', user);
    expect(draft.status).toBe('VALIDATED');
    expect(draft.testcases[0]?.effectiveTimeLimitMs).toBe(500);
    const version = await svc.publish('p-1', user);
    expect(version.testcaseCount).toBe(1);
    expect(await svc.versions('p-1', user)).toHaveLength(1);
    expect(await svc.draft('p-1', user)).toBeUndefined();
    version.testcases[0]!.label = 'mutated locally';
    expect(
      (await svc.version('p-1', version.versionId, user)).testcases[0]?.label,
    ).not.toBe('mutated locally');
  });

  it('uses the canonical 2C.4 manifest hash and rejects stale revisions', async () => {
    const { svc, storage } = service();
    const input = await storage.put(new Uint8Array([1]), 'i', '1.in', 'p-1');
    const output = await storage.put(new Uint8Array([2]), 'o', '1.out', 'p-1');
    await svc.addTestcase('p-1', { input, expectedOutput: output }, user);
    const draft = await svc.validate('p-1', user);
    expect(draft.manifestSha256).toBe(
      canonicalManifestHash(draft, draft.testcases),
    );
    await expect(
      svc.publish('p-1', user, draft.revision - 1),
    ).rejects.toMatchObject({ code: 'STALE_PUBLISH_CONFLICT' });
  });

  it('denies unauthorized users before revealing problem existence', async () => {
    const { svc } = service(false);
    await expect(svc.draft('missing', user)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(svc.saveConfig('p-1', {}, user)).rejects.toBeInstanceOf(
      JudgeDataError,
    );
  });
});
