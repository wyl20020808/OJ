import { createHash, timingSafeEqual } from 'node:crypto';
import { Transform } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import {
  artifactManifestBytes,
  createJudgeArtifact,
  JUDGE_ARTIFACT_FORMAT,
  BUILTIN_CHECKER_VERSION,
  builtinCheckerConfigSha256,
  type JudgeArtifactReference,
} from '@ojplatform/judge-runtime';
import {
  JudgeDataError,
  type JudgeDataRepository,
  type JudgeDataVersion,
} from './model.js';
import type { ByteStorage } from './storage.js';

export function publishedArtifact(
  version: JudgeDataVersion,
): JudgeArtifactReference {
  // PostgreSQL timestamp storage is second-precision in the local schema.
  // Canonicalize before hashing so publish and later dispatch produce one ID.
  const createdAt = new Date(version.publishedAt);
  createdAt.setUTCMilliseconds(0);
  return createJudgeArtifact({
    formatVersion: JUDGE_ARTIFACT_FORMAT,
    judgeDataVersionId: version.versionId,
    createdAt: createdAt.toISOString(),
    problemId: version.problemId,
    problemRevisionId: version.problemRevisionId,
    testdataVersionId: version.testdataVersionId,
    testcaseSetId: version.testcaseSetId,
    executionProfileId: version.executionProfileId,
    manifestHash: version.manifestSha256,
    entries: version.testcases.map((testcase) => ({
      index: testcase.ordinal,
      testcaseId: testcase.testcaseId,
      testdataVersionId: version.testdataVersionId,
      input: {
        objectId: testcase.input.objectId,
        sizeBytes: testcase.input.sizeBytes,
        sha256: testcase.input.sha256,
      },
      expectedOutput: {
        objectId: testcase.expectedOutput.objectId,
        sizeBytes: testcase.expectedOutput.sizeBytes,
        sha256: testcase.expectedOutput.sha256,
      },
      inputSha256: testcase.input.sha256,
      expectedOutputSha256: testcase.expectedOutput.sha256,
      executionProfileId: version.executionProfileId,
      checkerType: version.checker,
      checkerVersion: BUILTIN_CHECKER_VERSION,
      checkerConfigSha256: builtinCheckerConfigSha256(version.checker),
      timeLimitMs: testcase.effectiveTimeLimitMs,
      memoryLimitBytes: testcase.effectiveMemoryLimitBytes,
      // The qualified cpp20 profile has a 64 KiB capture ceiling. Historical
      // authoring limits above it never enlarged the Supervisor capture.
      outputLimitBytes: Math.min(testcase.effectiveOutputLimitBytes, 64 * 1024),
    })),
  });
}

export async function ensurePublishedArtifact(
  repo: JudgeDataRepository,
  version: JudgeDataVersion,
) {
  const artifact = publishedArtifact(version);
  const existing = await repo.getArtifact(artifact.id);
  return existing ?? repo.saveArtifact(artifact);
}

/** Dedicated read-only service access; ordinary browser sessions never authorize it. */
export async function registerJudgeArtifactDataRoutes(
  app: FastifyInstance,
  repo: JudgeDataRepository,
  storage: ByteStorage,
  readToken: string | undefined,
) {
  const authorized = (value: unknown) => {
    if (!readToken || typeof value !== 'string') return false;
    const actual = Buffer.from(value);
    const expected = Buffer.from(readToken);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  };
  app.get(
    '/internal/judge-artifacts/v1/:artifactId/:objectId',
    async (request, reply) => {
      if (!authorized(request.headers['x-judge-artifact-token']))
        return reply.code(401).send({ code: 'UNAUTHENTICATED' });
      const { artifactId, objectId } = request.params as {
        artifactId: string;
        objectId: string;
      };
      if (
        !/^[a-f0-9]{64}$/.test(artifactId) ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(objectId)
      )
        return reply.code(400).send({ code: 'INVALID_ARTIFACT_CONTRACT' });
      const artifact = await repo.getArtifact(artifactId);
      if (!artifact)
        return reply.code(404).send({ code: 'ARTIFACT_UNAVAILABLE' });
      reply.header('cache-control', 'private, no-store');
      reply.header('x-judge-artifact-id', artifact.id);
      reply.header('x-judge-artifact-format', artifact.formatVersion);
      if (objectId === 'manifest') {
        reply.header('x-content-sha256', artifact.sha256);
        return reply
          .type('application/json')
          .send(artifactManifestBytes(artifact.manifest));
      }
      const version = await repo.getVersion(
        artifact.manifest.problemId,
        artifact.judgeDataVersionId,
      );
      const object = version?.testcases
        .flatMap((t) => [t.input, t.expectedOutput])
        .find((ref) => ref.objectId === objectId);
      if (!object)
        return reply.code(404).send({ code: 'ARTIFACT_UNAVAILABLE' });
      const metadata = artifact.manifest.entries
        .flatMap((t) => [t.input, t.expectedOutput])
        .find((ref) => ref.objectId === objectId);
      if (
        !metadata ||
        metadata.sizeBytes !== object.sizeBytes ||
        metadata.sha256 !== object.sha256
      )
        return reply.code(409).send({ code: 'ARTIFACT_CHECKSUM_MISMATCH' });
      if (!storage.open)
        throw new JudgeDataError(
          'ARTIFACT_UNAVAILABLE',
          'Artifact unavailable',
          503,
        );
      const source = await storage.open(object);
      let bytes = 0;
      const digest = createHash('sha256');
      const bounded = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > object.sizeBytes)
            callback(
              new JudgeDataError(
                'ARTIFACT_CHECKSUM_MISMATCH',
                'Artifact integrity failure',
                409,
              ),
            );
          else {
            digest.update(chunk);
            callback(null, chunk);
          }
        },
        flush(callback) {
          if (
            bytes !== object.sizeBytes ||
            digest.digest('hex') !== object.sha256
          )
            callback(
              new JudgeDataError(
                'ARTIFACT_CHECKSUM_MISMATCH',
                'Artifact integrity failure',
                409,
              ),
            );
          else callback();
        },
      });
      source.once('error', (error) => bounded.destroy(error));
      bounded.once('close', () => source.destroy());
      request.log.info(
        { artifactId, objectId, sizeBytes: object.sizeBytes },
        'artifact fetch',
      );
      reply
        .header('content-length', object.sizeBytes)
        .header('x-content-sha256', object.sha256);
      return reply.type('application/octet-stream').send(source.pipe(bounded));
    },
  );
}
