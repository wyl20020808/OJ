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
    const submission = await repository.create({
      ownerUserId: `integration-${crypto.randomUUID()}`,
      problemId: 'integration-problem',
      problemRevisionId: 'integration-revision',
      testdataVersionRef: 'integration-testdata',
      languageId: 'cpp20',
      source: 'integration-source',
    });
    await repository.beginEvaluation!(submission.id, 'integration-job-1');
    await repository.publishEvaluation!({
      submissionId: submission.id,
      judgeJobId: 'integration-job-1',
      evaluationGeneration: 1,
      attemptGeneration: 1,
      status: 'COMPLETED_WITH_VERDICT',
      verdict: 'AC',
      evaluationRecordDigest: 'integration-evaluation-1',
      verdictRecordDigest: 'b'.repeat(64),
    });
    const rejudge = await repository.startRejudge!(
      submission.id,
      'integration-job-2',
    );
    expect(rejudge.evaluationGeneration).toBe(2);
    const history = await repository.listEvaluationHistory!(submission.id);
    expect(history).toHaveLength(2);
    expect(await repository.getEvaluation!(submission.id)).toMatchObject({
      evaluationGeneration: 2,
      status: 'REJUDGE_PENDING',
      current: true,
    });
  });
});
