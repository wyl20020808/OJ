import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
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
            { id: context.userId, status: 'active' },
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
          ? { userId, sessionId: 'session', strength: 'password' }
          : undefined;
      },
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
    } finally {
      await app.close();
    }
  });
});
