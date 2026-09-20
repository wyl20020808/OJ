import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  artifactManifestBytes,
  assertJudgeArtifact,
  builtinCheckerConfigSha256,
  createJudgeArtifact,
  testcaseSetManifestHash,
  InMemoryJudgeJobRepository,
  type ArtifactManifest,
} from '@ojplatform/judge-runtime';
import { artifactJudgeServiceInput } from '../apps/api/src/modules/submission/judge-service-client.js';
import { buildJudgeService } from '../apps/judge-service/src/app.js';
import { InMemoryJudgeServiceStateRepository } from '../apps/judge-service/src/repository.js';
import { InMemoryJudgeNodeRepository } from '../apps/judge-service/src/node-repository.js';
import type { JudgeNodeCapabilities } from '../apps/judge-service/src/node-model.js';
import {
  InMemoryJudgeDataRepository,
  PostgresJudgeDataRepository,
} from '../apps/api/src/modules/problem-judge-data/repository.js';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
function fixture(): ArtifactManifest {
  const manifest: ArtifactManifest = {
    formatVersion: 'judge-artifact-v1',
    judgeDataVersionId: 'version-1',
    createdAt: '2026-09-05T00:00:00.000Z',
    problemId: 'problem-1',
    problemRevisionId: 'revision-1',
    testdataVersionId: 'data-1',
    testcaseSetId: 'set-1',
    executionProfileId: 'cpp20-gcc-13-v1',
    manifestHash: '',
    entries: [
      {
        index: 0,
        testcaseId: 'case-1',
        testdataVersionId: 'data-1',
        input: {
          objectId: 'input-1',
          sizeBytes: 100 * 1024 * 1024,
          sha256: sha('input'),
        },
        expectedOutput: {
          objectId: 'output-1',
          sizeBytes: 2,
          sha256: sha('5\n'),
        },
        inputSha256: sha('input'),
        expectedOutputSha256: sha('5\n'),
        executionProfileId: 'cpp20-gcc-13-v1',
        checkerType: 'EXACT_BYTES',
        checkerVersion: 'builtin-v1',
        checkerConfigSha256: builtinCheckerConfigSha256('EXACT_BYTES'),
        timeLimitMs: 1000,
        memoryLimitBytes: 67108864,
        outputLimitBytes: 65536,
      },
    ],
  };
  manifest.manifestHash = testcaseSetManifestHash({
    ...manifest,
    entries: manifest.entries.map((e) => ({
      ...e,
      input: '',
      expectedOutput: '',
    })),
  });
  return manifest;
}

describe('immutable artifact contract', () => {
  it('preserves one immutable artifact per version across canonical key ordering', async () => {
    const repo = new InMemoryJudgeDataRepository();
    const artifact = createJudgeArtifact(fixture());
    await repo.saveArtifact(artifact);
    const reordered = {
      ...artifact,
      manifest: JSON.parse(artifactManifestBytes(artifact.manifest).toString()),
    };
    expect(await repo.saveArtifact(reordered)).toEqual(artifact);
    const changed = createJudgeArtifact({
      ...fixture(),
      createdAt: '2026-09-06T00:00:00.000Z',
    });
    await expect(repo.saveArtifact(changed)).rejects.toThrow(
      'Artifact identity conflict',
    );
    reordered.manifest.entries[0].input.sizeBytes = 0;
    expect(await repo.getArtifact(artifact.id)).toEqual(artifact);
  });

  it('rejects inconsistent persisted artifact metadata and manifest bytes', async () => {
    const artifact = createJudgeArtifact(fixture());
    const row = {
      reference_metadata: artifact,
      manifest_text: artifactManifestBytes(artifact.manifest).toString(),
    };
    const repo = new PostgresJudgeDataRepository({
      query: async () => ({ rows: [row] }),
    });
    expect(await repo.getArtifact(artifact.id)).toEqual(artifact);
    row.manifest_text += ' ';
    await expect(repo.getArtifact(artifact.id)).rejects.toThrow(
      'Stored artifact integrity failure',
    );
  });

  it('keeps 100 MiB input metadata below 2 KiB without inline content', () => {
    const artifact = createJudgeArtifact(fixture());
    expect(artifact.id).toBe(
      'fe868ba9f0c989f1da9429a7fc3a9ae7a8c35349631a2b0ccd0bf908d0abdb86',
    );
    expect(artifact.inputBytes).toBe(100 * 1024 * 1024);
    expect(JSON.stringify(artifact).length).toBeLessThan(2048);
    expect(artifact.manifest.entries[0]?.input).toEqual({
      objectId: 'input-1',
      sizeBytes: 104857600,
      sha256: sha('input'),
    });
  });

  it('dispatches, persists and claims 100 MiB by reference with idempotent retry', async () => {
    const artifact = createJudgeArtifact(fixture());
    const input = artifactJudgeServiceInput(
      {
        id: 'submission-1',
        ownerUserId: 'author-1',
        problemId: 'problem-1',
        problemRevisionId: 'revision-1',
        testdataVersionRef: 'data-1',
        languageId: 'cpp20',
        source: 'int main(){}',
        status: 'PENDING',
        createdAt: artifact.createdAt,
        updatedAt: artifact.createdAt,
      },
      artifact,
      'request-1',
    );
    expect(JSON.stringify(input).length).toBeLessThan(4096);
    expect(input).not.toHaveProperty('testcaseSet');
    expect(input).not.toHaveProperty('testcaseInput');
    const queue = new InMemoryJudgeJobRepository();
    const nodes = new InMemoryJudgeNodeRepository();
    const capabilities: JudgeNodeCapabilities = {
      languageProfiles: ['cpp20-gcc-13-v1'],
      checkers: ['EXACT_BYTES'],
      executionModes: ['REAL_SANDBOXED_EXECUTION' as const],
      sandboxContractVersion: '2C.3',
      architecture: 'amd64',
      resourceClass: 'standard-v1',
    };
    await nodes.register({
      nodeId: 'legacy-node',
      incarnation: 'inc-1',
      runtimeVersion: 'test',
      maxConcurrentJobs: 1,
      capabilities,
    });
    const app = await buildJudgeService({
      queue,
      nodes,
      state: new InMemoryJudgeServiceStateRepository(),
      serviceToken: 'service-test-token',
      nodeToken: 'node-test-token',
      logger: false,
    });
    try {
      const create = () =>
        app.inject({
          method: 'POST',
          url: '/v1/jobs',
          headers: { 'x-judge-service-token': 'service-test-token' },
          payload: input,
        });
      const first = await create();
      expect(first.statusCode).toBe(201);
      const retried = await create();
      expect(retried.statusCode).toBe(200);
      expect(retried.json().judgeJobId).toBe(first.json().judgeJobId);
      const persisted = await queue.getById(first.json().judgeJobId as string);
      expect(persisted?.judgeArtifact?.id).toBe(artifact.id);
      expect(persisted).not.toHaveProperty('testcaseSet');
      persisted!.judgeArtifact!.manifest.entries[0]!.input.sizeBytes = 0;
      expect(
        (await queue.getById(persisted!.id))?.judgeArtifact?.inputBytes,
      ).toBe(104857600);
      expect(
        (await queue.getById(persisted!.id))?.judgeArtifact?.manifest.entries[0]
          ?.input.sizeBytes,
      ).toBe(104857600);
      const legacyClaim = await app.inject({
        method: 'POST',
        url: '/v1/nodes/legacy-node/assignments/claim',
        headers: { 'x-judge-node-token': 'node-test-token' },
        payload: { incarnation: 'inc-1' },
      });
      expect(legacyClaim.json().assignment).toBeNull();
      await nodes.register({
        nodeId: 'artifact-node',
        incarnation: 'inc-1',
        runtimeVersion: 'test',
        maxConcurrentJobs: 1,
        capabilities: {
          ...capabilities,
          artifactContractVersion: 'artifact-execution-v1',
        },
      });
      const claim = await app.inject({
        method: 'POST',
        url: '/v1/nodes/artifact-node/assignments/claim',
        headers: { 'x-judge-node-token': 'node-test-token' },
        payload: { incarnation: 'inc-1' },
      });
      expect(claim.statusCode).toBe(200);
      expect(claim.json().job.judgeArtifact.id).toBe(artifact.id);
      expect(claim.json().job).not.toHaveProperty('testcaseSet');
      expect(claim.rawPayload.length).toBeLessThan(8192);
      const conflicting = await app.inject({
        method: 'POST',
        url: '/v1/jobs',
        headers: { 'x-judge-service-token': 'service-test-token' },
        payload: {
          ...input,
          sourceBytes: 'int main(){return 1;}',
          sourceSha256: sha('int main(){return 1;}'),
        },
      });
      expect(conflicting.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });

  it('dispatches a later evaluation generation without reusing generation 1 identity', async () => {
    const artifact = createJudgeArtifact(fixture());
    const submission = {
      id: 'submission-rejudge',
      ownerUserId: 'author-1',
      problemId: 'problem-1',
      problemRevisionId: 'revision-1',
      testdataVersionRef: 'data-1',
      languageId: 'cpp20',
      source: 'int main(){}',
      status: 'PENDING' as const,
      createdAt: artifact.createdAt,
      updatedAt: artifact.createdAt,
    };
    const first = artifactJudgeServiceInput(
      submission,
      artifact,
      'submission:submission-rejudge',
      1,
    );
    const rejudge = {
      ...artifactJudgeServiceInput(
        submission,
        artifact,
        'rejudge:submission-rejudge',
        2,
      ),
      evaluationGeneration: 2,
    };
    expect(first.clientRequestId).toBe(
      'submission:submission-rejudge:evaluation:1',
    );
    expect(rejudge.clientRequestId).toBe(
      'submission:submission-rejudge:evaluation:2',
    );
    const queue = new InMemoryJudgeJobRepository();
    const app = await buildJudgeService({
      queue,
      state: new InMemoryJudgeServiceStateRepository(),
      serviceToken: 'service-test-token',
      nodeToken: 'node-test-token',
      logger: false,
    });
    try {
      const send = (payload: Record<string, unknown>) =>
        app.inject({
          method: 'POST',
          url: '/v1/jobs',
          headers: { 'x-judge-service-token': 'service-test-token' },
          payload,
        });
      const created = await send(first);
      expect(created.statusCode).toBe(201);
      const second = await send(rejudge);
      expect(second.statusCode).toBe(201);
      expect(second.json()).toMatchObject({
        externalSubmissionId: submission.id,
        evaluationGeneration: 2,
      });
      expect(second.json().judgeJobId).not.toBe(
        created.json().judgeJobId as string,
      );
      const history = await app.inject({
        method: 'GET',
        url: `/v1/jobs/${created.json().judgeJobId as string}/history`,
        headers: { 'x-judge-service-token': 'service-test-token' },
      });
      expect(history.json().items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ evaluationGeneration: 1 }),
          expect.objectContaining({ evaluationGeneration: 2 }),
        ]),
      );
    } finally {
      await app.close();
    }
  });
  it('preserves digest when database reorders JSON keys', () => {
    const manifest = fixture();
    const reordered = Object.fromEntries(
      Object.entries(manifest).reverse(),
    ) as ArtifactManifest;
    reordered.entries = manifest.entries.map(
      (entry) =>
        Object.fromEntries(Object.entries(entry).reverse()) as typeof entry,
    );
    expect(artifactManifestBytes(reordered)).toEqual(
      artifactManifestBytes(manifest),
    );
    expect(createJudgeArtifact(reordered).id).toBe(
      createJudgeArtifact(manifest).id,
    );
  });
  it.each([
    'formatVersion',
    'contentLength',
    'sha256',
    'inputBytes',
    'testcaseCount',
  ])('rejects changed %s', (field) => {
    const artifact = createJudgeArtifact(fixture());
    expect(() =>
      assertJudgeArtifact({ ...artifact, [field]: 'wrong' }),
    ).toThrow('INVALID_ARTIFACT_CONTRACT');
  });
  it('rejects substituted metadata, inline bytes, traversal and oversized entries', () => {
    for (const change of [
      { input: 'inline hidden testcase' },
      { input: { objectId: '../secret', sizeBytes: 1, sha256: sha('input') } },
      { input: { objectId: 'manifest', sizeBytes: 1, sha256: sha('input') } },
      {
        input: {
          objectId: 'input-1',
          sizeBytes: 104857601,
          sha256: sha('input'),
        },
      },
      { timeLimitMs: 600001 },
      { checkerConfigSha256: sha('wrong') },
    ]) {
      const artifact = createJudgeArtifact(fixture());
      Object.assign(artifact.manifest.entries[0]!, change);
      expect(() => assertJudgeArtifact(artifact)).toThrow(
        'INVALID_ARTIFACT_CONTRACT',
      );
    }
  });
});
