import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  InMemorySubmissionRepository,
  SubmissionService,
  registerSubmissionModule,
  type SubmissionAuthorizationPolicy,
  type ProblemRevisionResolver,
} from '../apps/api/src/modules/submission/index.js';

const context = { userId: 'u1', sessionId: 's1', strength: 'password' };
const revision: ProblemRevisionResolver = {
  getRevision: async (problemId, revisionId) =>
    problemId === 'p1' && revisionId === 'r1'
      ? { problemId, revisionId, testdataVersionRef: 'td-v1' }
      : undefined,
};
const allow: SubmissionAuthorizationPolicy = {
  canSubmit: () => true,
  canViewSubmission: () => true,
  listOwnSubmissions: () => true,
};
const input = {
  problemId: 'p1',
  problemRevisionId: 'r1',
  testdataVersionRef: 'td-v1',
  languageId: 'typescript',
  source: 'export const answer = 3;',
};

describe('submission intake', () => {
  it('creates an intake record with immutable bindings and no verdict', async () => {
    const repo = new InMemorySubmissionRepository();
    const service = new SubmissionService(repo, allow, revision);
    const created = await service.create(input, context);
    expect(created).toMatchObject({
      ownerUserId: 'u1',
      problemId: 'p1',
      problemRevisionId: 'r1',
      testdataVersionRef: 'td-v1',
      status: 'PENDING',
    });
    expect(created).not.toHaveProperty('verdict');
    const stored = await repo.get(created.id);
    expect(stored?.source).toBe(input.source);
    expect(stored?.problemRevisionId).toBe('r1');
  });

  it('rejects invalid language, empty/oversize source, and stale bindings', async () => {
    const service = new SubmissionService(
      new InMemorySubmissionRepository(),
      allow,
      revision,
    );
    await expect(
      service.create({ ...input, languageId: 'ruby' }, context),
    ).rejects.toThrow('validation');
    await expect(
      service.create({ ...input, source: '   ' }, context),
    ).rejects.toThrow('validation');
    await expect(
      service.create({ ...input, source: 'x'.repeat(256 * 1024 + 1) }, context),
    ).rejects.toThrow('validation');
    await expect(
      service.create({ ...input, testdataVersionRef: 'td-v2' }, context),
    ).rejects.toThrow('VALIDATION_ERROR');
    await expect(
      service.create({ ...input, problemRevisionId: 'r2' }, context),
    ).rejects.toThrow('VALIDATION_ERROR');
  });

  it('enforces public authorization for create/list/detail and paginates own records', async () => {
    const repo = new InMemorySubmissionRepository();
    const deny: SubmissionAuthorizationPolicy = {
      canSubmit: () => false,
      canViewSubmission: () => false,
      listOwnSubmissions: () => false,
    };
    const denied = new SubmissionService(repo, deny, revision);
    await expect(denied.create(input, context)).rejects.toThrow('FORBIDDEN');
    const service = new SubmissionService(repo, allow, revision);
    for (let i = 0; i < 3; i++)
      await service.create({ ...input, source: `source-${i}` }, context);
    const first = await service.list({ limit: 2 }, context);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await service.list(
      { limit: 2, cursor: first.nextCursor! },
      context,
    );
    expect(second.items).toHaveLength(1);
    const other = { userId: 'u2', sessionId: 's2', strength: 'password' };
    const ownerOnly: SubmissionAuthorizationPolicy = {
      canSubmit: () => true,
      canViewSubmission: (user, submission) =>
        user.userId === submission.ownerUserId,
      listOwnSubmissions: () => true,
    };
    await expect(
      new SubmissionService(repo, ownerOnly, revision).detail(
        first.items[0]!.id,
        other,
      ),
    ).rejects.toThrow('FORBIDDEN');
  });

  it('exposes structured API errors and never logs source', async () => {
    const app = Fastify({ logger: false });
    await registerSubmissionModule(app, {
      authorizationPolicy: allow,
      problemResolver: revision,
      getAuthContext: async () => undefined,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      payload: input,
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: 'UNAUTHENTICATED',
      requestId: expect.any(String),
    });
    expect(JSON.stringify(response.json())).not.toContain(input.source);
    await app.close();
  });
});
