import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import {
  MemoryByteStorage,
  type JudgeDataRepository,
  type JudgeDataVersion,
} from '../apps/api/src/modules/problem-judge-data/index.js';
import { sha256 } from '../apps/api/src/modules/problem-judge-data/model.js';
import { ProductJudgeDataSubmissionBridge } from '../apps/api/src/modules/judge/product-judge-data-bridge.js';
import {
  InMemorySubmissionRepository,
  registerSubmissionModule,
} from '../apps/api/src/modules/submission/index.js';
import {
  BUILTIN_CHECKER_VERSION,
  builtinCheckerConfigSha256,
  createTestcaseSetManifest,
} from '@ojplatform/judge-runtime';

const published = async () => {
  const storage = new MemoryByteStorage();
  const input = await storage.put(
    Buffer.from('2 3\n'),
    'private/input',
    'case.in',
    'problem-1',
  );
  const output = await storage.put(
    Buffer.from('5\n'),
    'private/output',
    'case.out',
    'problem-1',
  );
  const version: JudgeDataVersion = {
    versionId: 'judge-data-v1',
    problemId: 'problem-1',
    versionNumber: 1,
    manifestSha256: '',
    testcaseCount: 1,
    checker: 'EXACT_BYTES',
    createdAt: '2026-09-02T00:00:00.000Z',
    publishedAt: '2026-09-02T00:00:00.000Z',
    publishedBy: 'author',
    testcases: [
      {
        testcaseId: 'case-1',
        ordinal: 0,
        label: null,
        input,
        expectedOutput: output,
        timeLimitMsOverride: null,
        memoryLimitBytesOverride: null,
        outputLimitBytesOverride: null,
        effectiveTimeLimitMs: 1000,
        effectiveMemoryLimitBytes: 64 * 1024 * 1024,
        effectiveOutputLimitBytes: 64 * 1024,
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
      },
    ],
    problemRevisionId: 'revision-1',
    testdataVersionId: 'testdata-v1',
    testcaseSetId: 'set-v1',
    executionProfileId: 'cpp20-gcc-13-v1',
    allowedLanguageProfiles: ['cpp20-gcc-13-v1'],
  };
  const versions = [version];
  const repository: JudgeDataRepository = {
    getDraft: async () => undefined,
    saveDraft: async () => {
      throw new Error('unused');
    },
    publish: async () => {
      throw new Error('unused');
    },
    getVersion: async (problemId, versionId) =>
      versions.find(
        (item) => item.problemId === problemId && item.versionId === versionId,
      ),
    listVersions: async () => versions,
  };
  version.manifestSha256 = createTestcaseSetManifest({
    problemId: version.problemId,
    problemRevisionId: version.problemRevisionId,
    testdataVersionId: version.testdataVersionId,
    testcaseSetId: version.testcaseSetId,
    entries: [
      {
        testcaseId: 'case-1',
        testdataVersionId: version.testdataVersionId,
        input: '2 3\n',
        inputSha256: input.sha256,
        executionProfileId: 'cpp20-gcc-13-v1',
        expectedOutput: '5\n',
        expectedOutputSha256: output.sha256,
        checkerType: 'EXACT_BYTES',
        checkerVersion: BUILTIN_CHECKER_VERSION,
        checkerConfigSha256: builtinCheckerConfigSha256('EXACT_BYTES'),
      },
    ],
  }).manifestHash;
  const bridge = new ProductJudgeDataSubmissionBridge(repository, storage);
  const binding = await bridge.bind('problem-1', 'revision-1', 'cpp20');
  const manifest = await bridge.manifest({
    id: 'submission-1',
    ownerUserId: 'guest-1',
    problemId: 'problem-1',
    problemRevisionId: 'revision-1',
    languageId: 'cpp20',
    source: 'int main() {}',
    status: 'PENDING',
    createdAt: version.createdAt,
    updatedAt: version.createdAt,
    ...binding,
  });
  return { binding, bridge, input, manifest, storage, version, versions };
};

describe('Product Judge Data submission bridge', () => {
  it('binds and materializes exactly one published version without a latest lookup', async () => {
    const { binding, bridge, manifest, version } = await published();
    expect(binding).toMatchObject({
      judgeDataVersionId: version.versionId,
      judgeDataVersionNumber: 1,
      judgeDataManifestSha256: manifest.manifestHash,
      testdataVersionRef: version.testdataVersionId,
    });
    expect(manifest).toMatchObject({
      manifestHash: binding.judgeDataManifestSha256,
      testdataVersionId: 'testdata-v1',
    });
    await expect(
      bridge.bind('problem-1', 'revision-1', 'python'),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_LANGUAGE',
    });
  });

  it('fails closed when a retrieved private object differs from its frozen hash', async () => {
    const { binding, bridge, input, storage, version } = await published();
    storage.objects.set(input.objectId, Buffer.from('tampered\n'));
    await expect(
      bridge.manifest({
        id: 'submission-1',
        ownerUserId: 'guest-1',
        problemId: 'problem-1',
        problemRevisionId: 'revision-1',
        languageId: 'cpp20',
        source: 'int main() {}',
        status: 'PENDING',
        createdAt: version.createdAt,
        updatedAt: version.createdAt,
        ...binding,
      }),
    ).rejects.toMatchObject({ code: 'INTEGRITY_MISMATCH' });
    expect(sha256('2 3\n')).toBe(input.sha256);
  });

  it('keeps an existing submission on v1 after v2 becomes selectable', async () => {
    const { binding, bridge, manifest, version, versions } = await published();
    versions.unshift({
      ...version,
      versionId: 'judge-data-v2',
      versionNumber: 2,
    });
    expect(
      await bridge.manifest({
        id: 'submission-v1',
        ownerUserId: 'guest-1',
        problemId: version.problemId,
        problemRevisionId: version.problemRevisionId,
        languageId: 'cpp20',
        source: 'int main() {}',
        status: 'PENDING',
        createdAt: version.createdAt,
        updatedAt: version.createdAt,
        ...binding,
      }),
    ).toMatchObject({ manifestHash: manifest.manifestHash });
  });

  it('binds a Guest-owned API submission before constructing the Judge payload', async () => {
    const { bridge } = await published();
    const app = Fastify();
    const repository = new InMemorySubmissionRepository();
    let dispatchedManifest = '';
    await registerSubmissionModule(app, {
      repository,
      authorizationPolicy: {
        canSubmit: () => true,
        canViewSubmission: () => true,
        listOwnSubmissions: () => true,
      },
      problemResolver: {
        getRevision: async () => ({
          problemId: 'problem-1',
          revisionId: 'revision-1',
          testdataVersionRef: 'revision-testdata',
        }),
      },
      judgeDataResolver: bridge,
      getAuthContext: async () => ({
        userId: 'guest-1',
        sessionId: 'guest-session',
        strength: 'guest',
      }),
      onCreated: async (submission) => {
        dispatchedManifest = (await bridge.manifest(submission)).manifestHash;
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      payload: {
        problemId: 'problem-1',
        problemRevisionId: 'revision-1',
        languageId: 'cpp20',
        source: 'int main() {}',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      ownerUserId: 'guest-1',
      judgeDataVersionId: 'judge-data-v1',
      judgeDataVersionNumber: 1,
      testdataVersionRef: 'testdata-v1',
    });
    expect(dispatchedManifest).toHaveLength(64);
    await app.close();
  });
});
