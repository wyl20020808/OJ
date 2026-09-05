import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadConfig } from '../../apps/api/src/config.js';
import { SubmissionDispatchStore } from '../../apps/api/src/modules/submission/dispatch.js';
import { createHash } from 'node:crypto';
import {
  builtinCheckerConfigSha256,
  createJudgeArtifact,
  testcaseSetManifestHash,
  type ArtifactManifest,
} from '@ojplatform/judge-runtime';
import { PostgresJudgeDataRepository } from '../../apps/api/src/modules/problem-judge-data/repository.js';

let client: pg.Client;
let store: SubmissionDispatchStore;
beforeEach(async () => {
  client = new pg.Client({
    connectionString: loadConfig().databaseUrl,
    connectionTimeoutMillis: 3000,
  });
  await client.connect();
  await client.query('BEGIN');
  // Session-owned tables keep the real migration and store SQL away from business data.
  await client.query(`CREATE TEMP TABLE submissions (
    id text PRIMARY KEY, status text NOT NULL, judge_data_version_id text,
    updated_at timestamptz NOT NULL DEFAULT now()
  ); CREATE TEMP TABLE submission_evaluations (submission_id text, judge_job_id text);
  SET LOCAL search_path TO pg_temp;
  INSERT INTO submissions(id,status,judge_data_version_id) VALUES
    ('orphan','PENDING','version-1'), ('existing','PENDING','version-1'),
    ('terminal','EXECUTION_COMPLETED','version-1'), ('legacy','PENDING',NULL);
  INSERT INTO submission_evaluations VALUES ('existing','job-existing');`);
  await client.query(
    await readFile(
      'packages/database/migrations/0021_submission_dispatch.sql',
      'utf8',
    ),
  );
  const namespace = await client.query(
    "SELECT relnamespace=pg_my_temp_schema() AS isolated FROM pg_class WHERE oid='submission_dispatches'::regclass",
  );
  expect(namespace.rows[0].isolated).toBe(true);
  store = new SubmissionDispatchStore(client);
});
afterEach(async () => {
  if (client) {
    try {
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  }
});

const row = async () =>
  (
    await client.query(`SELECT d.*,s.status AS submission_status,s.dispatch_failure_code
  FROM submission_dispatches d JOIN submissions s ON s.id=d.submission_id WHERE d.submission_id='orphan'`)
  ).rows[0];
const makeDue = () =>
  client.query(
    "UPDATE submission_dispatches SET next_attempt_at=now()-interval '1 second' WHERE submission_id='orphan'",
  );

describe('dispatch outbox PostgreSQL transaction isolation', () => {
  it('persists canonical immutable artifacts through the formal artifact migration', async () => {
    await client.query(
      "CREATE TEMP TABLE judge_data_versions(version_id text PRIMARY KEY); INSERT INTO judge_data_versions VALUES ('version-1')",
    );
    await client.query(
      await readFile(
        'packages/database/migrations/0020_judge_artifacts.sql',
        'utf8',
      ),
    );
    const digest = createHash('sha256').update('1\n').digest('hex');
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
          input: { objectId: 'input-1', sizeBytes: 2, sha256: digest },
          expectedOutput: {
            objectId: 'output-1',
            sizeBytes: 2,
            sha256: digest,
          },
          inputSha256: digest,
          expectedOutputSha256: digest,
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
      entries: manifest.entries.map((entry) => ({
        ...entry,
        input: '',
        expectedOutput: '',
      })),
    });
    const artifact = createJudgeArtifact(manifest);
    const repository = new PostgresJudgeDataRepository(client);
    expect(await repository.saveArtifact(artifact)).toEqual(artifact);
    expect(await repository.saveArtifact(artifact)).toEqual(artifact);
    expect(await repository.getArtifact(artifact.id)).toEqual(artifact);
    const conflicting = createJudgeArtifact({
      ...manifest,
      createdAt: '2026-09-06T00:00:00.000Z',
    });
    await expect(repository.saveArtifact(conflicting)).rejects.toThrow(
      'Published artifact conflict',
    );
    expect(
      (await client.query('SELECT count(*)::int AS n FROM judge_artifacts'))
        .rows[0].n,
    ).toBe(1);
    await client.query(
      "UPDATE judge_artifacts SET reference_metadata=jsonb_set(reference_metadata,'{inputBytes}','0'::jsonb)",
    );
    await expect(repository.getArtifact(artifact.id)).rejects.toThrow(
      'INVALID_ARTIFACT_CONTRACT',
    );
  });

  it('backfills only version-bound orphan submissions and permits only one outstanding claim', async () => {
    expect(await store.due()).toEqual(['orphan']);
    const claims = await Promise.all([
      store.claim('orphan'),
      store.claim('orphan'),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await row()).toMatchObject({
      state: 'DELIVERING',
      attempts: 1,
      request_id: 'orphan',
    });
    expect(await store.due()).toEqual([]);
  });

  it('fences stale completion and failure after lease recovery', async () => {
    const old = (await store.claim('orphan'))!;
    await client.query(
      "UPDATE submission_dispatches SET lease_until=now()-interval '1 second' WHERE submission_id='orphan'",
    );
    expect(await store.due()).toEqual(['orphan']);
    const current = (await store.claim('orphan'))!;
    expect(current.claimId).not.toBe(old.claimId);
    await store.success('orphan', old, 'old-artifact', 'old-job');
    await store.failure('orphan', old, 'OLD_FAILURE', false);
    expect(await row()).toMatchObject({
      state: 'DELIVERING',
      attempts: 2,
      claim_id: current.claimId,
      failure_code: null,
    });
    await store.success('orphan', current, 'artifact-1', 'job-1');
    expect(await row()).toMatchObject({
      state: 'SUCCEEDED',
      judge_job_id: 'job-1',
      artifact_id: 'artifact-1',
      claim_id: null,
    });
    expect(await store.claim('orphan')).toBeUndefined();
  });

  it('persists failure, exhausts retry budget and permits explicit retry without another submission', async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const claim = (await store.claim('orphan'))!;
      expect(claim.attempts).toBe(attempt);
      await store.failure('orphan', claim, 'JUDGE_DISPATCH_UNAVAILABLE', true);
      expect(await row()).toMatchObject({
        state: attempt < 5 ? 'RETRY' : 'FAILED',
        submission_status:
          attempt < 5 ? 'RETRYABLE_FAILURE' : 'PROTOCOL_FAILURE',
        dispatch_failure_code: 'JUDGE_DISPATCH_UNAVAILABLE',
      });
      await makeDue();
    }
    expect(await store.due()).toEqual([]);
    await store.retry('orphan');
    expect((await store.claim('orphan'))?.attempts).toBe(1);
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM submissions WHERE id='orphan'",
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it('does not overwrite an evaluation after uncertain dispatch completion', async () => {
    const claim = (await store.claim('orphan'))!;
    await client.query(
      "INSERT INTO submission_evaluations VALUES ('orphan','job-1')",
    );
    await client.query(
      "UPDATE submissions SET status='EXECUTION_COMPLETED' WHERE id='orphan'",
    );
    await store.failure('orphan', claim, 'JUDGE_DISPATCH_TIMEOUT', true);
    expect(await row()).toMatchObject({
      state: 'RETRY',
      submission_status: 'EXECUTION_COMPLETED',
    });
    await makeDue();
    const retried = (await store.claim('orphan'))!;
    await store.success('orphan', retried, 'artifact-1', 'job-1');
    expect(await row()).toMatchObject({
      state: 'SUCCEEDED',
      submission_status: 'EXECUTION_COMPLETED',
      dispatch_failure_code: null,
    });
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM submission_evaluations WHERE submission_id='orphan'",
        )
      ).rows[0].n,
    ).toBe(1);
  });
});
