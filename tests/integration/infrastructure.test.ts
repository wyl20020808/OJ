import { createHash } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';
import { loadConfig } from '../../apps/api/src/config.js';
import { checkCache, createCache } from '../../packages/cache/src/index.js';
import {
  checkDatabase,
  createDatabase,
} from '../../packages/database/src/index.js';
import {
  createStorage,
  ensureBucket,
} from '../../packages/storage/src/index.js';
import { PostgresSubmissionRepository } from '../../apps/api/src/modules/submission/repository.js';

const config = loadConfig();
const database = createDatabase({ url: config.databaseUrl });
const cache = createCache({ url: config.redisUrl });
const storage = createStorage({
  endpoint: config.s3Endpoint,
  region: config.s3Region,
  accessKey: config.s3AccessKey,
  secretKey: config.s3SecretKey,
  bucket: config.s3Bucket,
});

async function cleanupSubmissionFixture(submissionId: string) {
  await database.pool.query(
    'DELETE FROM submission_dispatches WHERE submission_id=$1',
    [submissionId],
  );
  await database.pool.query(
    'DELETE FROM submission_evaluations WHERE submission_id=$1',
    [submissionId],
  );
  await database.pool.query('DELETE FROM submissions WHERE id=$1', [
    submissionId,
  ]);
}

beforeAll(async () => {
  await cache.connect();
  await ensureBucket(storage);
});
afterAll(async () => {
  await database.pool.end();
  cache.disconnect();
  storage.client.destroy();
});

describe('real local infrastructure', () => {
  it('connects, queries, closes, and reconnects PostgreSQL', async () => {
    await checkDatabase(database.pool);
    const reconnect = createDatabase({ url: config.databaseUrl });
    await checkDatabase(reconnect.pool);
    await reconnect.pool.end();
  });

  it('pings and reconnects Redis', async () => {
    await checkCache(cache);
    cache.disconnect();
    const reconnect = createCache({ url: config.redisUrl });
    await reconnect.connect();
    await checkCache(reconnect);
    reconnect.disconnect();
    await cache.connect();
  });

  it('puts, gets, verifies, and deletes a temporary MinIO object', async () => {
    const key = `qualification/${crypto.randomUUID()}`;
    const body = Buffer.from('ojplatform-infrastructure-smoke');
    const digest = createHash('sha256').update(body).digest('hex');
    await storage.client.send(
      new PutObjectCommand({ Bucket: storage.bucket, Key: key, Body: body }),
    );
    const response = await storage.client.send(
      new GetObjectCommand({ Bucket: storage.bucket, Key: key }),
    );
    const downloaded = Buffer.from(await response.Body!.transformToByteArray());
    expect(createHash('sha256').update(downloaded).digest('hex')).toBe(digest);
    await storage.client.send(
      new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }),
    );
    await expect(
      storage.client.send(
        new HeadObjectCommand({ Bucket: storage.bucket, Key: key }),
      ),
    ).rejects.toBeDefined();
  });

  it('reports every real dependency ready through the API', async () => {
    const app = await buildApp({
      logger: false,
      withInfrastructure: true,
      config,
    });
    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      dependencies: { postgres: 'ok', redis: 'ok', storage: 'ok' },
    });
    await app.close();
  });

  it('persists authoritative evaluation history and current projection', async () => {
    const repository = new PostgresSubmissionRepository(database.pool);
    const ownerUserId = crypto.randomUUID();
    const submission = await repository.create({
      ownerUserId,
      problemId: 'integration-problem',
      problemRevisionId: 'integration-revision',
      testdataVersionRef: 'integration-testdata',
      languageId: 'cpp20',
      source: 'integration-source',
    });
    try {
      await repository.beginEvaluation!(submission.id, 'integration-job-1');
      await repository.publishEvaluation!({
        submissionId: submission.id,
        judgeJobId: 'integration-job-1',
        evaluationGeneration: 1,
        attemptGeneration: 1,
        status: 'COMPLETED_WITH_VERDICT',
        verdict: 'WA',
        evaluationRecordDigest: 'integration-evaluation-1',
        verdictRecordDigest: 'b'.repeat(64),
      });
      const rejudge = await repository.startRejudge!(
        submission.id,
        'integration-job-2',
      );
      expect(rejudge.evaluationGeneration).toBe(2);
      await expect(
        repository.startRejudge!(submission.id, 'integration-job-2'),
      ).resolves.toMatchObject({ evaluationGeneration: 2 });
      await expect(
        repository.startRejudge!(submission.id, 'integration-job-conflict'),
      ).rejects.toThrow('EVALUATION_ALREADY_EXISTS');
      await expect(
        repository.publishEvaluation!({
          submissionId: submission.id,
          judgeJobId: 'integration-job-1',
          evaluationGeneration: 1,
          attemptGeneration: 1,
          status: 'COMPLETED_WITH_VERDICT',
          verdict: 'WA',
          evaluationRecordDigest: 'integration-evaluation-1',
          verdictRecordDigest: 'b'.repeat(64),
        }),
      ).rejects.toThrow('STALE_EVALUATION');
      await repository.publishEvaluation!({
        submissionId: submission.id,
        judgeJobId: 'integration-job-2',
        evaluationGeneration: 2,
        attemptGeneration: 2,
        status: 'COMPLETED_WITH_VERDICT',
        verdict: 'AC',
        evaluationRecordDigest: 'integration-evaluation-2',
        verdictRecordDigest: 'c'.repeat(64),
      });
      const cancelledRejudge = await repository.startRejudge!(
        submission.id,
        'integration-job-3',
      );
      await repository.cancelEvaluation!(
        submission.id,
        cancelledRejudge.judgeJobId,
      );
      const history = await repository.listEvaluationHistory!(submission.id);
      expect(history).toEqual([
        expect.objectContaining({
          evaluationGeneration: 1,
          verdict: 'WA',
          current: false,
        }),
        expect.objectContaining({
          evaluationGeneration: 2,
          verdict: 'AC',
          current: false,
        }),
        expect.objectContaining({
          evaluationGeneration: 3,
          status: 'CANCELLED',
          current: true,
        }),
      ]);
      expect(await repository.getEvaluation!(submission.id)).toMatchObject({
        evaluationGeneration: 3,
        status: 'CANCELLED',
        current: true,
      });
      const app = await buildApp({
        logger: false,
        withInfrastructure: true,
        config,
      });
      try {
        const response = await app.inject({
          method: 'GET',
          url: `/api/evaluations?limit=20&submitterId=${ownerUserId}`,
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().items).toEqual([
          expect.objectContaining({
            submissionId: submission.id,
            submitter: { id: ownerUserId, displayName: 'Unknown user' },
          }),
        ]);
      } finally {
        await app.close();
      }
    } finally {
      await cleanupSubmissionFixture(submission.id);
    }
  });

  it('serializes concurrent rejudge commands into one current generation', async () => {
    const repository = new PostgresSubmissionRepository(database.pool);
    const submission = await repository.create({
      ownerUserId: crypto.randomUUID(),
      problemId: 'integration-problem',
      problemRevisionId: 'integration-revision',
      testdataVersionRef: 'integration-testdata',
      languageId: 'cpp20',
      source: 'integration-source',
    });
    try {
      await repository.beginEvaluation!(
        submission.id,
        'integration-race-job-1',
      );
      await repository.publishEvaluation!({
        submissionId: submission.id,
        judgeJobId: 'integration-race-job-1',
        evaluationGeneration: 1,
        attemptGeneration: 1,
        status: 'COMPLETED_WITH_VERDICT',
        verdict: 'AC',
        evaluationRecordDigest: 'integration-race-evaluation-1',
        verdictRecordDigest: 'd'.repeat(64),
      });
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, index) =>
          repository.startRejudge!(
            submission.id,
            `integration-race-job-${index + 2}`,
          ),
        ),
      );
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(await repository.listEvaluationHistory!(submission.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ evaluationGeneration: 1, current: false }),
          expect.objectContaining({
            evaluationGeneration: 2,
            current: true,
            status: 'REJUDGE_PENDING',
          }),
        ]),
      );
    } finally {
      await cleanupSubmissionFixture(submission.id);
    }
  });
});
