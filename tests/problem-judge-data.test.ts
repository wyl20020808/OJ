import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import {
  builtinCheckerConfigSha256,
  BUILTIN_CHECKER_VERSION,
  TESTCASE_SET_MAX_INPUT_BYTES,
  TESTCASE_SET_MAX_EXPECTED_OUTPUT_BYTES,
  testcaseSetManifestHash,
} from '@ojplatform/judge-runtime';
import {
  InMemoryJudgeDataRepository,
  MemoryByteStorage,
  ProblemJudgeDataService,
  JudgeDataError,
  canonicalManifestHash,
  parseZip,
  registerProblemJudgeDataRoutes,
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

const makeZip = (
  entries: {
    name: string;
    data: Uint8Array;
    dataDescriptor?: boolean;
    directory?: boolean;
  }[],
) => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.data);
    const descriptorLength = entry.dataDescriptor ? 16 : 0;
    const local = Buffer.alloc(
      30 + name.length + data.length + descriptorLength,
    );
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.dataDescriptor ? 0x08 : 0, 6);
    local.writeUInt16LE(0, 8);
    if (!entry.dataDescriptor) {
      local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(data.length, 22);
    }
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    data.copy(local, 30 + name.length);
    if (entry.dataDescriptor) {
      const descriptorOffset = 30 + name.length + data.length;
      local.writeUInt32LE(0x08074b50, descriptorOffset);
      local.writeUInt32LE(data.length, descriptorOffset + 8);
      local.writeUInt32LE(data.length, descriptorOffset + 12);
    }
    locals.push(local);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.dataDescriptor ? 0x08 : 0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    if (entry.directory) central.writeUInt32LE(0x10, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length;
  }
  const body = Buffer.concat(locals);
  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(body.length, 16);
  return Uint8Array.from(Buffer.concat([body, central, eocd]));
};

describe('problem judge data backend', () => {
  it('inherits defaults and freezes published testcase data', async () => {
    const { svc, storage, repo } = service();
    const input = new Uint8Array([1, 2]);
    const output = new Uint8Array([3]);
    const refs = await Promise.all([
      storage.put(input, 'judge-data/problems/p-1/draft/i', '01.in', 'p-1'),
      storage.put(output, 'judge-data/problems/p-1/draft/o', '01.out', 'p-1'),
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
        memoryLimitBytesOverride: 2048,
        outputLimitBytesOverride: 128,
      },
      user,
    );
    const draft = await svc.validate('p-1', user);
    expect(draft.status).toBe('VALIDATED');
    expect(draft.testcases[0]?.effectiveTimeLimitMs).toBe(500);
    expect(draft.testcases[0]?.effectiveMemoryLimitBytes).toBe(2048);
    expect(draft.testcases[0]?.effectiveOutputLimitBytes).toBe(128);
    expect((draft.testcases[0]?.input as { key?: string }).key).toBeUndefined();
    const version = await svc.publish('p-1', user);
    expect(version.testcaseCount).toBe(1);
    expect(await svc.versions('p-1', user)).toHaveLength(1);
    expect(await svc.draft('p-1', user)).toBeUndefined();
    version.testcases[0]!.label = 'mutated locally';
    expect(
      (await svc.version('p-1', version.versionId, user)).testcases[0]?.label,
    ).not.toBe('mutated locally');
    const internalVersion = await repo.getVersion('p-1', version.versionId);
    expect(svc.handoff(internalVersion).manifestSha256).toBe(
      version.manifestSha256,
    );
    await svc.saveConfig(
      'p-1',
      {
        timeLimitMs: 3000,
        memoryLimitBytes: 2048,
        outputLimitBytes: 128,
        checker: 'EXACT_BYTES',
        allowedLanguageProfiles: ['cpp20-gcc-13-v1'],
      },
      user,
    );
    await svc.addTestcase(
      'p-1',
      { input: refs[0], expectedOutput: refs[1] },
      user,
    );
    await svc.validate('p-1', user);
    const version2 = await svc.publish('p-1', user);
    expect(version2.versionNumber).toBe(2);
    expect(
      (await svc.versions('p-1', user)).map((v) => v.versionNumber),
    ).toEqual([2, 1]);
  });

  it('rejects testcase data that the Judge manifest cannot execute', async () => {
    const { svc } = service();
    await expect(
      svc.addPair(
        'p-1',
        Buffer.alloc(TESTCASE_SET_MAX_INPUT_BYTES + 1),
        Uint8Array.of(3),
        { input: '01.in', output: '01.out' },
        user,
      ),
    ).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE', status: 413 });
  });

  it('accepts exact 100 MiB testcase payload boundary', async () => {
    const { svc, storage } = service();
    const input = new Uint8Array(TESTCASE_SET_MAX_INPUT_BYTES);
    const output = new Uint8Array(TESTCASE_SET_MAX_EXPECTED_OUTPUT_BYTES);
    const draft = await svc.addPair(
      'p-1',
      input,
      output,
      { input: 'boundary.in', output: 'boundary.out' },
      user,
    );
    expect(draft.testcases[0]?.input.sizeBytes).toBe(
      TESTCASE_SET_MAX_INPUT_BYTES,
    );
    expect(draft.testcases[0]?.expectedOutput.sizeBytes).toBe(
      TESTCASE_SET_MAX_EXPECTED_OUTPUT_BYTES,
    );
    expect(storage.objects.size).toBe(2);
  });

  it('uses the canonical 2C.4 manifest hash and rejects stale revisions', async () => {
    const { svc, storage, repo } = service();
    const input = await storage.put(
      new Uint8Array([1]),
      'judge-data/problems/p-1/draft/i',
      '1.in',
      'p-1',
    );
    const output = await storage.put(
      new Uint8Array([2]),
      'judge-data/problems/p-1/draft/o',
      '1.out',
      'p-1',
    );
    await svc.addTestcase('p-1', { input, expectedOutput: output }, user);
    const draft = await svc.validate('p-1', user);
    const persisted = await repo.getDraft('p-1');
    expect(draft.manifestSha256).toBe(
      canonicalManifestHash(
        persisted ?? (draft as never),
        persisted?.testcases ?? [],
      ),
    );
    const persistedCase = persisted?.testcases[0];
    if (!persistedCase) throw new Error('draft testcase was not persisted');
    expect(draft.manifestSha256).toBe(
      testcaseSetManifestHash({
        problemId: 'p-1',
        problemRevisionId: identity.problemRevisionId,
        testdataVersionId: identity.testdataVersionId,
        testcaseSetId: identity.testcaseSetId,
        executionProfileId: identity.executionProfileId,
        entries: [
          {
            index: 0,
            testcaseId: persistedCase.testcaseId,
            testdataVersionId: identity.testdataVersionId,
            input: '',
            inputSha256: persistedCase.input.sha256,
            expectedOutputSha256: persistedCase.expectedOutput.sha256,
            executionProfileId: identity.executionProfileId,
            checkerType: persisted?.defaults.checker,
            checkerVersion: BUILTIN_CHECKER_VERSION,
            checkerConfigSha256: builtinCheckerConfigSha256(
              persisted?.defaults.checker ?? 'TOKEN_WHITESPACE',
            ),
          },
        ],
      }),
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

  it('imports paired ZIP entries and rejects unsafe or ambiguous names', async () => {
    const { svc } = service();
    const archive = makeZip([
      { name: '01.in', data: Uint8Array.from([1]) },
      { name: '01.out', data: Uint8Array.from([2]) },
    ]);
    expect(parseZip(archive)).toHaveLength(1);
    expect((await svc.addZip('p-1', archive, user)).imported).toBe(1);
    expect(
      parseZip(
        makeZip([
          { name: '02.in', data: Uint8Array.from([1]), dataDescriptor: true },
          { name: '02.out', data: Uint8Array.from([2]), dataDescriptor: true },
        ]),
      ),
    ).toHaveLength(1);
    expect(
      parseZip(
        makeZip([
          { name: '__MACOSX/', data: new Uint8Array(), directory: true },
          { name: '__MACOSX/info.txt', data: Uint8Array.of(1) },
          { name: 'notes.md', data: Uint8Array.of(2) },
          { name: '03.in', data: Uint8Array.of(3) },
          { name: '03.out', data: Uint8Array.of(4) },
        ]),
      ).map((pair) => pair.name),
    ).toEqual(['3']);
    expect(
      parseZip(
        makeZip([
          { name: '04.in', data: Uint8Array.of(1) },
          { name: '04.ans', data: Uint8Array.of(2) },
          { name: '05.in', data: Uint8Array.of(3) },
          { name: '05.txt', data: Uint8Array.of(4) },
        ]),
      ).map((pair) => pair.name),
    ).toEqual(['4', '5']);
    expect(() =>
      parseZip(
        makeZip([
          { name: '../1.in', data: Uint8Array.from([1]) },
          { name: '../1.out', data: Uint8Array.from([2]) },
        ]),
      ),
    ).toThrow('Unsafe archive path');
    expect(() =>
      parseZip(
        makeZip([
          { name: '1.in', data: Uint8Array.from([1]) },
          { name: '01.in', data: Uint8Array.from([1]) },
          { name: '1.out', data: Uint8Array.from([2]) },
        ]),
      ),
    ).toThrow('Duplicate input pair');
    expect(() =>
      parseZip(makeZip([{ name: '1.in', data: Uint8Array.of(1) }])),
    ).toThrow('Missing input/output pair');
    expect(() =>
      parseZip(
        makeZip([
          { name: '/1.in', data: Uint8Array.of(1) },
          { name: '/1.out', data: Uint8Array.of(2) },
        ]),
      ),
    ).toThrow('Unsafe archive path');
    expect(() => parseZip(Uint8Array.of(1, 2, 3))).toThrow('Invalid archive');
  });

  it('accepts matching answer suffixes for a single testcase pair', async () => {
    const { svc } = service();
    const draft = await svc.addPair(
      'p-1',
      Uint8Array.of(1),
      Uint8Array.of(2),
      { input: 'single.in', output: 'single.ans' },
      user,
    );
    expect(draft.testcases[0]?.expectedOutput.fileName).toBe('single.ans');
    await expect(
      svc.addPair(
        'p-1',
        Uint8Array.of(1),
        Uint8Array.of(2),
        { input: 'single.in', output: 'other.txt' },
        user,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PAIR' });
  });

  it('defaults new judge data to whitespace-token checking', async () => {
    const { svc } = service();
    const draft = await svc.addPair(
      'p-1',
      Uint8Array.from([1]),
      Uint8Array.from([2]),
      { input: '1.in', output: '1.out' },
      user,
    );
    expect(draft.defaults.checker).toBe('TOKEN_WHITESPACE');
  });

  it('recomputes inherited limits when defaults change and fails closed for storage', async () => {
    const { svc, storage } = service();
    const [input, output] = await Promise.all([
      storage.put(
        Uint8Array.of(1),
        'judge-data/problems/p-1/draft/i',
        '1.in',
        'p-1',
      ),
      storage.put(
        Uint8Array.of(2),
        'judge-data/problems/p-1/draft/o',
        '1.out',
        'p-1',
      ),
    ]);
    await svc.addTestcase('p-1', { input, expectedOutput: output }, user);
    const changed = await svc.saveConfig(
      'p-1',
      {
        timeLimitMs: 3000,
        memoryLimitBytes: 4096,
        outputLimitBytes: 512,
        checker: 'TOKEN_WHITESPACE',
        allowedLanguageProfiles: ['cpp20-gcc-13-v1'],
      },
      user,
    );
    expect(changed.testcases[0]).toMatchObject({
      effectiveTimeLimitMs: 3000,
      effectiveMemoryLimitBytes: 4096,
      effectiveOutputLimitBytes: 512,
    });

    const unavailable = new ProblemJudgeDataService(
      new InMemoryJudgeDataRepository(),
      new MemoryByteStorage(true),
      async () => true,
      async () => true,
      async () => identity,
    );
    await expect(
      unavailable.addPair(
        'p-1',
        Uint8Array.of(1),
        Uint8Array.of(2),
        { input: '1.in', output: '1.out' },
        user,
      ),
    ).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE', status: 503 });
  });

  it('requires an exact CSRF cookie match for mutations', async () => {
    const { svc } = service();
    const app = Fastify();
    await registerProblemJudgeDataRoutes(app, {
      service: svc,
      getAuth: async () => user,
      resolveProblemId: async (key) => (key === 'p-slug' ? 'p-1' : undefined),
    });
    const body = {
      timeLimitMs: 1000,
      memoryLimitBytes: 1024,
      outputLimitBytes: 128,
      checker: 'EXACT_BYTES',
      allowedLanguageProfiles: ['cpp20-gcc-13-v1'],
    };
    try {
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/api/problems/p-slug/judge-data/draft/config',
            payload: body,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/api/problems/p-slug/judge-data/draft/config',
            headers: { 'x-csrf-token': 'token', cookie: 'oj_csrf=token' },
            payload: body,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/api/problems/p-1/judge-data/draft/config',
            headers: { 'x-csrf-token': 'token', cookie: 'xoj_csrf=token' },
            payload: body,
          })
        ).statusCode,
      ).toBe(403);
    } finally {
      await app.close();
    }
  });
});
