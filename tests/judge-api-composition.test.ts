import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { createJudgeAuthorizationPolicy } from '../apps/api/src/modules/authz/judge.js';
import {
  InMemoryJudgeJobRepository,
  publicJudgeJob,
  registerJudgeModule,
} from '../apps/api/src/modules/judge/index.js';

const auth = (request: FastifyRequest) =>
  typeof request.headers['x-user-id'] === 'string'
    ? {
        userId: request.headers['x-user-id'],
        sessionId: 'test-session',
        strength: 'password' as const,
      }
    : undefined;

async function appWithQualification(enabled = true) {
  const app = Fastify();
  const repository = new InMemoryJudgeJobRepository();
  const ownerBySubmission = new Map([['submission-owner', 'owner']]);
  const policy = createJudgeAuthorizationPolicy({
    resolveSubmissionOwner: (submissionId) =>
      ownerBySubmission.get(submissionId) ?? null,
  });
  await registerJudgeModule(app, {
    repository,
    authorizationPolicy: policy,
    getAuthContext: auth,
    qualificationMode: enabled,
    ...(enabled ? { qualificationControlKey: 'test-control-key' } : {}),
  });
  const job = (
    await repository.enqueue({
      submissionId: 'submission-owner',
      ownerUserId: 'owner',
      problemId: 'problem',
      problemRevisionId: 'revision',
      testdataVersionRef: 'testdata-v1',
      languageId: 'javascript',
    })
  ).job;
  return { app, job, repository };
}

describe('Lead Judge API composition', () => {
  it('uses authoritative submission ownership and a whitelisted public projection', async () => {
    const { app, job, repository } = await appWithQualification();
    const claim = await repository.claimById(job.id, 'fixture', 30_000);
    expect(claim).toBeTruthy();
    const owner = await app.inject({
      method: 'GET',
      url: `/api/judge/jobs/${job.id}`,
      headers: { 'x-user-id': 'owner' },
    });
    const unrelated = await app.inject({
      method: 'GET',
      url: `/api/judge/jobs/${job.id}`,
      headers: { 'x-user-id': 'other' },
    });
    expect(owner.statusCode).toBe(200);
    expect(unrelated.statusCode).toBe(403);
    expect(owner.json()).toMatchObject({ id: job.id, status: 'LEASED_FAKE' });
    expect(JSON.stringify(owner.json())).not.toMatch(
      /leaseToken|leaseOwner|leaseExpiresAt|ownerUserId|source|redis|password/i,
    );
    await app.close();
  });

  it('keeps qualification controls absent by default and rejects unauthenticated, forged, or unrelated calls', async () => {
    const disabled = await appWithQualification(false);
    const missing = await disabled.app.inject({
      method: 'POST',
      url: `/api/qualification/judge/${disabled.job.id}/claim`,
    });
    expect(missing.statusCode).toBe(404);
    await disabled.app.close();

    const { app, job } = await appWithQualification();
    for (const headers of [
      {},
      { 'x-user-id': 'owner' },
      { 'x-ojplatform-qualification-control': 'test-control-key' },
      {
        'x-user-id': 'other',
        'x-ojplatform-qualification-control': 'test-control-key',
      },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/qualification/judge/${job.id}/claim`,
        headers,
      });
      expect(response.statusCode).not.toBe(200);
    }
    const allowed = await app.inject({
      method: 'POST',
      url: `/api/qualification/judge/${job.id}/claim`,
      headers: {
        'x-user-id': 'owner',
        'x-ojplatform-qualification-control': 'test-control-key',
      },
    });
    expect(allowed.statusCode).toBe(200);
    await app.close();
  });

  it('fails closed for an unknown internal state and never treats it as success', async () => {
    const app = Fastify();
    await registerJudgeModule(app, {
      repository: {
        enqueue: async () => {
          throw new Error('not used');
        },
        getById: async () =>
          ({
            id: 'unknown',
            submissionId: 'submission-owner',
            ownerUserId: 'owner',
            status: 'FUTURE_INTERNAL_STATE',
            attempt: 0,
          }) as never,
        getBySubmissionId: async () => undefined,
        claim: async () => undefined,
        claimById: async () => undefined,
        complete: async () => {
          throw new Error('not used');
        },
        retry: async () => {
          throw new Error('not used');
        },
        recoverStale: async () => 0,
        failTerminal: async () => {
          throw new Error('not used');
        },
      },
      authorizationPolicy: createJudgeAuthorizationPolicy({
        resolveSubmissionOwner: () => 'owner',
      }),
      getAuthContext: auth,
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/judge/jobs/unknown',
      headers: { 'x-user-id': 'owner' },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('does not include internal fixture identifiers in a public job', () => {
    expect(
      publicJudgeJob({
        id: 'job',
        submissionId: 'submission',
        ownerUserId: 'owner',
        problemId: 'problem',
        problemRevisionId: 'revision',
        testdataVersionRef: 'testdata',
        languageId: 'javascript',
        idempotencyKey: 'submission:submission',
        status: 'SUCCEEDED_FAKE',
        executionMode: 'SAFE_FIXTURE_QUALIFICATION',
        attempt: 1,
        maxAttempts: 3,
        syntheticFixtureId: 'internal-fixture-id',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual(expect.objectContaining({ id: 'job', synthetic: true }));
  });

  it('projects verdict metadata without expected output, stdout, or lease secrets', () => {
    const publicJob = publicJudgeJob({
      id: 'job-verdict',
      submissionId: 'submission-verdict',
      ownerUserId: 'owner',
      problemId: 'problem',
      problemRevisionId: 'revision',
      testdataVersionRef: 'testdata-v1',
      languageId: 'cpp20',
      idempotencyKey: 'submission:submission-verdict',
      executionMode: 'REAL_SANDBOXED_EXECUTION',
      attempt: 1,
      maxAttempts: 3,
      leaseToken: 'lease-secret',
      leaseOwner: 'worker-secret',
      rawExecutionResult: {
        protocol_version: '2C.4',
        execution_set_request_id: 'job-verdict:1',
        execution_set_attempt_id: 'job-verdict:1:attempt',
        judge_job_id: 'job-verdict',
        submission_id: 'submission-verdict',
        attempt: 1,
        result_generation: 1,
        correlation_id: 'job-verdict',
        language_profile_id: 'cpp20-gcc-13-v1',
        source_sha256: 'a'.repeat(64),
        pipeline_outcome: 'PIPELINE_COMPLETED',
        compile: {
          stdout: 'compiler output',
          stderr: '',
          stdout_bytes: 15,
          stderr_bytes: 0,
          stdout_sha256: 'b'.repeat(64),
          stderr_sha256: 'c'.repeat(64),
          stdout_truncated: false,
          stderr_truncated: false,
        },
        verdict_record: {
          record_version: '2C.5-builtin-v1',
          digest: 'd'.repeat(64),
          compile_verdict: undefined,
          overall_user_verdict: 'AC',
          evaluation_state: 'COMPLETE',
          cases: [
            {
              testcase_index: 0,
              testcase_id: 'case-1',
              verdict: 'AC',
              evaluation_state: 'COMPLETE',
              reason_code: 'CHECKER_MATCH',
              digest: 'e'.repeat(64),
              expected_output: 'must-not-leak',
              actual_stdout: 'must-not-leak',
            },
          ],
        },
        started_at: '2026-09-01T00:00:00.000Z',
        completed_at: '2026-09-01T00:00:01.000Z',
        clean: true,
      },
      status: 'COMPLETED',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:01.000Z',
      completedAt: '2026-09-01T00:00:01.000Z',
    });
    const encoded = JSON.stringify(publicJob);
    expect(publicJob).toMatchObject({
      rawExecution: {
        verdict: {
          engineVersion: '2C.5-builtin-v1',
          overallUserVerdict: 'AC',
          cases: [{ verdict: 'AC', testcaseId: 'case-1' }],
        },
      },
    });
    expect(encoded).not.toContain('must-not-leak');
    expect(encoded).not.toMatch(
      /lease-secret|worker-secret|expected_output|actual_stdout/i,
    );
  });
});
