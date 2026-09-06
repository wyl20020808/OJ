import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { buildApp } from '../apps/api/src/app.js';
import {
  InMemorySubmissionRepository,
  registerSubmissionModule,
} from '../apps/api/src/modules/submission/index.js';
import { createSubmissionAuthorizationPolicy } from '../apps/api/src/modules/authz/index.js';

describe('admin cross-owner submission source access V2', () => {
  it('allows owner and explicit capability, denies other and anonymous', async () => {
    const permissions = new Map<string, ReadonlySet<string>>([
      ['admin', new Set(['submission:view:any'])],
    ]);
    const repository = new InMemorySubmissionRepository();
    const app = Fastify({ logger: false });
    await registerSubmissionModule(app, {
      repository,
      authorizationPolicy: {
        canSubmit: () => true,
        canViewSubmission: (context, submission) =>
          createSubmissionAuthorizationPolicy({
            hasPermissions: (userId, required) =>
              required.every((permission) =>
                permissions.get(userId)?.has(permission),
              ),
          }).canViewSubmission(
            {
              id: context.userId,
              status: 'active',
              ...(context.capabilities
                ? { capabilities: context.capabilities }
                : {}),
            },
            {
              id: submission.id,
              ownerUserId: submission.ownerUserId,
              problemId: submission.problemId,
              problemRevisionId: '',
              status: 'PENDING',
            },
          ),
        listOwnSubmissions: () => true,
      },
      problemResolver: { getRevision: async () => undefined },
      getAuthContext: async (request) => {
        const userId = request.headers['x-user-id'];
        return typeof userId === 'string'
          ? {
              userId,
              sessionId: 'session',
              strength: 'password',
              ...(userId === 'admin'
                ? { capabilities: { canViewAnySubmission: true } }
                : {}),
            }
          : undefined;
      },
      evaluationHistory: (submissionId) =>
        repository.listEvaluationHistory!(submissionId),
    });
    try {
      const submission = await repository.create({
        ownerUserId: 'owner',
        problemId: 'problem',
        problemRevisionId: 'revision',
        testdataVersionRef: 'data-v1',
        languageId: 'cpp20',
        source: 'int main() { return 0; }',
      });
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/submissions/${submission.id}`,
            headers: { 'x-user-id': 'owner' },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/submissions/${submission.id}`,
            headers: { 'x-user-id': 'admin' },
          })
        ).json().source,
      ).toBe('int main() { return 0; }');
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/submissions/${submission.id}`,
            headers: { 'x-user-id': 'other' },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/submissions/${submission.id}`,
          })
        ).statusCode,
      ).toBe(401);

      await repository.beginEvaluation!(submission.id, 'job-1');
      await repository.publishEvaluation!({
        submissionId: submission.id,
        judgeJobId: 'job-1',
        evaluationGeneration: 1,
        attemptGeneration: 1,
        status: 'COMPLETED_WITH_VERDICT',
        verdict: 'AC',
        evaluationRecordDigest: 'record-1',
      });
      const adminEvaluation = await app.inject({
        method: 'GET',
        url: `/api/submissions/${submission.id}/evaluations/1`,
        headers: { 'x-user-id': 'admin' },
      });
      expect(adminEvaluation.statusCode).toBe(200);
      expect(adminEvaluation.json().submission).toMatchObject({
        id: submission.id,
      });
    } finally {
      await app.close();
    }
  });

  it('carries authenticated operator capability into the real Product endpoint', async () => {
    const app = await buildApp({
      logger: false,
      operatorUsernames: new Set(['source-admin']),
    });
    const cookies = (response: { headers: Record<string, unknown> }) => {
      const value = response.headers['set-cookie'];
      return (Array.isArray(value) ? value : value ? [value] : [])
        .map(String)
        .map((item) => item.split(';', 1)[0] ?? '');
    };
    const headers = (values: string[]) => ({
      cookie: values.join('; '),
      'x-csrf-token':
        values
          .find((value) => value.startsWith('oj_csrf='))
          ?.slice('oj_csrf='.length) ?? '',
    });
    const login = async (username: string) => {
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username,
          email: `${username}@example.test`,
          displayName: username,
          password: 'correct-horse-battery-staple',
        },
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          identity: username,
          password: 'correct-horse-battery-staple',
        },
      });
      return cookies(response);
    };
    try {
      const owner = await login('source-owner');
      const admin = await login('source-admin');
      const createdProblem = await app.inject({
        method: 'POST',
        url: '/api/problems',
        headers: headers(owner),
        payload: {
          slug: 'source-access-real-endpoint',
          title: 'Source access',
          statement: 'Statement',
          inputDescription: 'Input',
          outputDescription: 'Output',
          examples: [],
          constraints: 'Constraints',
          notes: '',
          timeLimitMs: 1000,
          memoryLimitBytes: 256 * 1024 * 1024,
          visibility: 'public',
          status: 'published',
          testdataVersion: 'source-testdata-v1',
        },
      });
      expect(createdProblem.statusCode).toBe(201);
      const problemId = createdProblem.json().id as string;
      const revisionId = createdProblem.json().currentRevisionId as string;
      const config = {
        timeLimitMs: 1000,
        memoryLimitBytes: 256 * 1024 * 1024,
        outputLimitBytes: 64 * 1024,
        checker: 'EXACT_BYTES',
        allowedLanguageProfiles: ['cpp20-gcc-13-v1'],
      };
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: `/api/problems/${problemId}/judge-data/draft/config`,
            headers: headers(owner),
            payload: config,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/problems/${problemId}/judge-data/draft/upload`,
            headers: headers(owner),
            payload: {
              inputBase64: Buffer.from('1\n').toString('base64'),
              outputBase64: Buffer.from('1\n').toString('base64'),
              inputFileName: '01.in',
              outputFileName: '01.out',
            },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/problems/${problemId}/judge-data/draft/validate`,
            headers: headers(owner),
            payload: {},
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/problems/${problemId}/judge-data/publish`,
            headers: headers(owner),
            payload: {},
          })
        ).statusCode,
      ).toBe(200);
      const createdSubmission = await app.inject({
        method: 'POST',
        url: '/api/submissions',
        headers: headers(owner),
        payload: {
          problemId,
          problemRevisionId: revisionId,
          languageId: 'cpp20',
          source: 'int main() { return 0; }',
        },
      });
      expect(createdSubmission.statusCode).toBe(201);
      const submissionId = createdSubmission.json().id as string;
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/auth/me',
            headers: { cookie: admin.join('; ') },
          })
        ).json().capabilities,
      ).toEqual({ canViewAnySubmission: true });
      const adminDetail = await app.inject({
        method: 'GET',
        url: `/api/submissions/${submissionId}`,
        headers: headers(admin),
      });
      expect(adminDetail.statusCode).toBe(200);
      expect(adminDetail.json().source).toBe('int main() { return 0; }');
    } finally {
      await app.close();
    }
  });
});
