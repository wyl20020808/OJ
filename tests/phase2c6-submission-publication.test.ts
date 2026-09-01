import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  InMemorySubmissionRepository,
  authoritativeSubmissionOutcome,
  publicSubmissionEvaluation,
  registerSubmissionModule,
  type PublishEvaluationInput,
} from '../apps/api/src/modules/submission/index.js';

const input = {
  ownerUserId: 'owner',
  problemId: 'problem',
  problemRevisionId: 'revision',
  testdataVersionRef: 'testdata-v1',
  languageId: 'cpp20',
  source: 'int main(){}',
};
const digests = new Map<string, string>();
const publish = (
  submissionId: string,
  overrides: Partial<PublishEvaluationInput> = {},
) => {
  const evaluationGeneration = overrides.evaluationGeneration ?? 1;
  const attemptGeneration = overrides.attemptGeneration ?? 1;
  const status = overrides.status ?? 'COMPLETED_WITH_VERDICT';
  const verdict = overrides.verdict ?? 'AC';
  const evaluationRecordDigest =
    overrides.evaluationRecordDigest ??
    `${evaluationGeneration}:${attemptGeneration}:${status}:${verdict}`;
  digests.set(
    `${submissionId}:${evaluationGeneration}`,
    evaluationRecordDigest,
  );
  return {
    submissionId,
    judgeJobId: overrides.judgeJobId ?? `job-${evaluationGeneration}`,
    evaluationGeneration,
    attemptGeneration,
    status,
    ...(status === 'COMPLETED_WITH_VERDICT' ? { verdict } : {}),
    testcaseSetId: 'set-1',
    manifestHash: 'a'.repeat(64),
    ...(status === 'COMPLETED_WITH_VERDICT'
      ? { verdictRecordDigest: 'b'.repeat(64) }
      : {}),
    evaluationRecordDigest,
    completedAt: '2026-09-01T00:00:01.000Z',
  } as PublishEvaluationInput;
};

describe('Phase 2C.6 authoritative submission publication', () => {
  it('publishes exactly the qualified verdict taxonomy and keeps non-verdict states verdict-free', async () => {
    for (const verdict of ['AC', 'WA', 'CE', 'RE', 'TLE', 'MLE'] as const) {
      const repo = new InMemorySubmissionRepository();
      const submission = await repo.create(input);
      await repo.beginEvaluation!(submission.id, 'job-1');
      const evaluation = await repo.publishEvaluation!(
        publish(submission.id, { verdict }),
      );
      expect(evaluation).toMatchObject({
        status: 'COMPLETED_WITH_VERDICT',
        verdict,
        current: true,
      });
    }
    for (const status of [
      'CANCELLED',
      'INFRA_FAILED',
      'NO_VERDICT',
      'INCOMPLETE',
    ] as const) {
      const repo = new InMemorySubmissionRepository();
      const submission = await repo.create(input);
      await repo.beginEvaluation!(submission.id, 'job-1');
      const evaluation = await repo.publishEvaluation!(
        publish(submission.id, {
          status,
          evaluationRecordDigest: `${status}:digest`,
        }),
      );
      expect(evaluation).toMatchObject({ status });
      expect(evaluation).not.toHaveProperty('verdict');
    }
  });

  it('is idempotent for an identical terminal publication and rejects conflicting or stale attempts', async () => {
    const repo = new InMemorySubmissionRepository();
    const submission = await repo.create(input);
    await repo.beginEvaluation!(submission.id, 'job-1');
    const first = publish(submission.id);
    await expect(repo.publishEvaluation!(first)).resolves.toMatchObject({
      verdict: 'AC',
    });
    await expect(repo.publishEvaluation!(first)).resolves.toMatchObject({
      verdict: 'AC',
    });
    await expect(
      repo.publishEvaluation!(publish(submission.id, { verdict: 'WA' })),
    ).rejects.toThrow('CONFLICTING_PUBLICATION');
    await expect(
      repo.publishEvaluation!(
        publish(submission.id, {
          attemptGeneration: 0,
          evaluationRecordDigest: 'old',
        }),
      ),
    ).rejects.toThrow('CONFLICTING_PUBLICATION');
  });

  it('keeps retry in one evaluation, then preserves immutable rejudge history and rejects late old generation publication', async () => {
    const repo = new InMemorySubmissionRepository();
    const submission = await repo.create(input);
    await repo.beginEvaluation!(submission.id, 'job-1');
    await repo.publishEvaluation!(
      publish(submission.id, {
        status: 'RUNNING',
        attemptGeneration: 1,
        evaluationRecordDigest: 'running-1',
      }),
    );
    await repo.publishEvaluation!(
      publish(submission.id, {
        verdict: 'WA',
        attemptGeneration: 2,
        evaluationRecordDigest: 'retry-2',
      }),
    );
    const rejudge = await repo.startRejudge!(submission.id, 'job-2');
    expect(rejudge).toMatchObject({
      evaluationGeneration: 2,
      current: true,
      status: 'REJUDGE_PENDING',
    });
    await expect(
      repo.publishEvaluation!(
        publish(submission.id, {
          evaluationGeneration: 1,
          judgeJobId: 'job-1',
          verdict: 'WA',
          evaluationRecordDigest: 'retry-2',
        }),
      ),
    ).rejects.toThrow('STALE_EVALUATION');
    await repo.publishEvaluation!(
      publish(submission.id, {
        evaluationGeneration: 2,
        judgeJobId: 'job-2',
        verdict: 'AC',
        evaluationRecordDigest: 'rejudge-ac',
      }),
    );
    expect(await repo.getEvaluation!(submission.id)).toMatchObject({
      evaluationGeneration: 2,
      verdict: 'AC',
      current: true,
    });
    expect(await repo.listEvaluationHistory!(submission.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evaluationGeneration: 1,
          verdict: 'WA',
          current: false,
        }),
        expect.objectContaining({
          evaluationGeneration: 2,
          verdict: 'AC',
          current: true,
        }),
      ]),
    );
  });

  it('has a safe public projection and a current-only outcome adapter without raw execution facts', async () => {
    const repo = new InMemorySubmissionRepository();
    const submission = await repo.create(input);
    await repo.beginEvaluation!(submission.id, 'job-1');
    const evaluation = await repo.publishEvaluation!(publish(submission.id));
    const publicValue = publicSubmissionEvaluation(evaluation);
    const outcome = authoritativeSubmissionOutcome(submission, evaluation);
    expect(publicValue).toEqual(
      expect.objectContaining({ verdict: 'AC', evaluationGeneration: 1 }),
    );
    expect(outcome).toEqual(
      expect.objectContaining({
        submissionId: submission.id,
        verdict: 'AC',
        problemId: 'problem',
      }),
    );
    expect(JSON.stringify({ publicValue, outcome })).not.toMatch(
      /source|stdout|stderr|lease|worker|cgroup|raw/i,
    );
    expect(
      authoritativeSubmissionOutcome(submission, {
        ...evaluation,
        current: false,
      }),
    ).toBeUndefined();
  });

  it('exposes safe immutable history and rejects an unrelated rejudge command', async () => {
    const repo = new InMemorySubmissionRepository();
    const submission = await repo.create(input);
    await repo.beginEvaluation!(submission.id, 'job-1');
    await repo.publishEvaluation!(publish(submission.id));
    const app = Fastify();
    await registerSubmissionModule(app, {
      repository: repo,
      authorizationPolicy: {
        canSubmit: () => true,
        canViewSubmission: (user, value) => user.userId === value.ownerUserId,
        listOwnSubmissions: () => true,
      },
      problemResolver: { getRevision: async () => undefined },
      getAuthContext: async (request) =>
        typeof request.headers['x-user-id'] === 'string'
          ? { userId: request.headers['x-user-id'], strength: 'password' }
          : undefined,
      evaluationHistory: (submissionId) =>
        repo.listEvaluationHistory!(submissionId),
      onRejudge: async (value) => {
        const next = await repo.startRejudge!(value.id, 'job-2');
        expect(next.evaluationGeneration).toBe(2);
      },
    });
    const owner = await app.inject({
      method: 'GET',
      url: `/api/submissions/${submission.id}/evaluations`,
      headers: { 'x-user-id': 'owner' },
    });
    expect(owner.statusCode).toBe(200);
    expect(owner.json().items).toEqual([
      expect.objectContaining({ verdict: 'AC', current: true }),
    ]);
    expect(JSON.stringify(owner.json())).not.toMatch(
      /source|digest|lease|worker|stdout|stderr/i,
    );
    const unrelated = await app.inject({
      method: 'POST',
      url: `/api/submissions/${submission.id}/rejudge`,
      headers: { 'x-user-id': 'other' },
    });
    expect(unrelated.statusCode).toBe(403);
    const rejudge = await app.inject({
      method: 'POST',
      url: `/api/submissions/${submission.id}/rejudge`,
      headers: { 'x-user-id': 'owner' },
    });
    expect(rejudge.statusCode).toBe(200);
    await app.close();
  });
});
