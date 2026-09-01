import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import pg from 'pg';
import { RedisJudgeJobRepository } from '../apps/api/src/modules/judge/repository.js';
import { publicationFromJudgeJob } from '../apps/api/src/modules/submission/publication.js';
import { PostgresSubmissionRepository } from '../apps/api/src/modules/submission/repository.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:56379';
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://ojplatform:ojplatform_dev@127.0.0.1:55432/ojplatform';
const prefix = process.env.PHASE2C6_QUEUE_PREFIX ?? 'oj:judge:phase2c6-real';
const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});
const pool = new pg.Pool({ connectionString: databaseUrl });
const createdSubmissionIds: string[] = [];

async function insertSubmission(job: {
  submissionId: string;
  ownerUserId: string;
  problemId: string;
  problemRevisionId: string;
  testdataVersionRef: string;
  languageId: string;
}) {
  await pool.query(
    "INSERT INTO submissions (id,owner_user_id,problem_id,problem_revision_id,testdata_version_ref,language_id,source,status) VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING') ON CONFLICT (id) DO NOTHING",
    [
      job.submissionId,
      job.ownerUserId,
      job.problemId,
      job.problemRevisionId,
      job.testdataVersionRef,
      job.languageId,
      'phase2c6-qualified-source-not-public',
    ],
  );
  createdSubmissionIds.push(job.submissionId);
}

async function main() {
  await redis.connect();
  const queue = new RedisJudgeJobRepository(redis, prefix);
  const submissions = new PostgresSubmissionRepository(pool);
  const ids = (await redis.keys(`${prefix}:job:*`)).map((key) =>
    key.slice(`${prefix}:job:`.length),
  );
  const jobs = [];
  for (const id of ids) {
    try {
      jobs.push(await queue.getById(id));
    } catch (error) {
      throw new Error(`invalid real queue job ${id}`, { cause: error });
    }
  }
  const expected = new Map([
    ['ac', 'AC'],
    ['wa', 'WA'],
    ['ce', 'CE'],
    ['re', 'RE'],
    ['tle', 'TLE'],
    ['mle', 'MLE'],
    ['token', 'AC'],
  ]);
  const selected = [...expected.entries()].map(([label, verdict]) => {
    const job = jobs.find((item) => item?.id.includes(`phase2c5-${label}-`));
    if (!job) throw new Error(`missing real ${label} job`);
    return { job, verdict };
  });
  const cancelled = jobs.find((item) =>
    item?.id.includes('phase2c5-cancelled-'),
  );
  if (!cancelled) throw new Error('missing real cancelled job');

  for (const { job, verdict } of selected) {
    await insertSubmission(job);
    await submissions.beginEvaluation!(job.submissionId, job.id);
    const publication = publicationFromJudgeJob(job);
    if (!publication) throw new Error(`missing publication: ${job.id}`);
    const stored = await submissions.publishEvaluation!(publication);
    if (
      stored.verdict !== verdict ||
      stored.status !== 'COMPLETED_WITH_VERDICT'
    )
      throw new Error(`wrong public verdict for ${job.id}`);
    const duplicate = await submissions.publishEvaluation!(publication);
    if (duplicate.evaluationRecordDigest !== stored.evaluationRecordDigest)
      throw new Error(`duplicate publication changed ${job.id}`);
  }

  await insertSubmission(cancelled);
  await submissions.beginEvaluation!(cancelled.submissionId, cancelled.id);
  const cancelledPublication = publicationFromJudgeJob(cancelled);
  if (!cancelledPublication || cancelledPublication.status !== 'CANCELLED')
    throw new Error('cancelled job became verdict publication');
  const cancelledEvaluation =
    await submissions.publishEvaluation!(cancelledPublication);
  if (cancelledEvaluation.verdict)
    throw new Error('cancelled evaluation has verdict');

  const infraId = `phase2c6-infra-${randomUUID()}`;
  await pool.query(
    "INSERT INTO submissions (id,owner_user_id,problem_id,problem_revision_id,testdata_version_ref,language_id,source,status) VALUES ($1,'phase2c6-owner','phase2c6-problem','phase2c6-revision','phase2c6-testdata','cpp20','phase2c6-infra-source','PENDING')",
    [infraId],
  );
  createdSubmissionIds.push(infraId);
  const infraJob = {
    id: `phase2c6-infra-job-${randomUUID()}`,
    submissionId: infraId,
    evaluationGeneration: 1,
    attempt: 1,
    status: 'FAILED_TERMINAL' as const,
    completedAt: new Date().toISOString(),
  };
  await submissions.beginEvaluation!(infraId, infraJob.id);
  const infraPublication = publicationFromJudgeJob(infraJob as never);
  if (!infraPublication || infraPublication.status !== 'INFRA_FAILED')
    throw new Error('infra failure became verdict publication');
  const infraEvaluation =
    await submissions.publishEvaluation!(infraPublication);
  if (infraEvaluation.verdict) throw new Error('infra evaluation has verdict');

  const restarted = new PostgresSubmissionRepository(
    new pg.Pool({ connectionString: databaseUrl }),
  );
  try {
    const persisted = await restarted.getEvaluation!(
      selected[0]!.job.submissionId,
    );
    if (persisted?.verdict !== 'AC')
      throw new Error('repository restart lost evaluation');
  } finally {
    const restartPool = (restarted as unknown as { pool?: pg.Pool }).pool;
    await restartPool?.end();
  }
  console.log(
    JSON.stringify({
      REAL_VERDICTS: selected.length,
      CANCEL: 'PASS',
      INFRA: 'PASS',
      DUPLICATE: 'PASS',
      RESTART: 'PASS',
    }),
  );
}

try {
  await main();
} finally {
  if (createdSubmissionIds.length)
    await pool.query('DELETE FROM submissions WHERE id = ANY($1::text[])', [
      createdSubmissionIds,
    ]);
  await redis.quit();
  await pool.end();
}
