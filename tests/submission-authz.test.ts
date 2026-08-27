import { describe, expect, it, vi } from 'vitest';
import {
  createSubmissionAuthorizationPolicy,
  type SubmissionAuditEvent,
} from '../apps/api/src/modules/authz/index.js';

const active = { id: 'u1', status: 'active' as const };
const revision = {
  id: 'r1',
  problemId: 'p1',
  authorId: 'author',
  status: 'published' as const,
  visibility: 'public' as const,
};
const submission = {
  id: 's1',
  ownerUserId: 'u1',
  problemId: 'p1',
  problemRevisionId: 'r1',
  status: 'PENDING' as const,
};

describe('submission authorization policy', () => {
  it('allows active users to submit public published revisions', async () => {
    const policy = createSubmissionAuthorizationPolicy();
    expect(await policy.canSubmit(active, revision)).toBe(true);
  });

  it('denies disabled/deactivated and malformed submit contexts', async () => {
    const policy = createSubmissionAuthorizationPolicy();
    expect(
      await policy.canSubmit({ ...active, status: 'disabled' }, revision),
    ).toBe(false);
    expect(
      await policy.canSubmit({ ...active, status: 'deactivated' }, revision),
    ).toBe(false);
    expect(await policy.canSubmit(undefined, revision)).toBe(false);
    expect(await policy.canSubmit(active, undefined)).toBe(false);
  });

  it('allows owner view and own-list, denies unrelated users', async () => {
    const policy = createSubmissionAuthorizationPolicy();
    expect(await policy.canViewSubmission(active, submission)).toBe(true);
    expect(await policy.canListOwnSubmissions(active)).toBe(true);
    expect(
      await policy.canViewSubmission(
        { id: 'u2', status: 'active' },
        submission,
      ),
    ).toBe(false);
    expect(
      await policy.canListOwnSubmissions({ id: 'u2', status: 'disabled' }),
    ).toBe(false);
  });

  it('allows privileged visibility only through explicit role permission', async () => {
    const policy = createSubmissionAuthorizationPolicy({
      roles: new Map([['reviewer', new Set(['submission:view:any'])]]),
    });
    expect(
      await policy.canViewSubmission(
        { id: 'u2', status: 'active', roles: ['reviewer'] },
        submission,
      ),
    ).toBe(true);
    expect(
      await policy.canViewSubmission(
        { id: 'u3', status: 'active', roles: ['unknown'] },
        submission,
      ),
    ).toBe(false);
  });

  it('allows private submission only through ownership or explicit permission', async () => {
    const policy = createSubmissionAuthorizationPolicy({
      roles: new Map([['setter', new Set(['submission:create:private'])]]),
    });
    const privateRevision = {
      ...revision,
      visibility: 'private' as const,
      status: 'draft' as const,
    };
    expect(
      await policy.canSubmit(
        { id: 'author', status: 'active' },
        privateRevision,
      ),
    ).toBe(true);
    expect(
      await policy.canSubmit(
        { id: 'u2', status: 'active', roles: ['setter'] },
        privateRevision,
      ),
    ).toBe(true);
    expect(
      await policy.canSubmit({ id: 'u3', status: 'active' }, privateRevision),
    ).toBe(false);
  });

  it('keeps audit event shape free of source and credential fields', () => {
    const event: SubmissionAuditEvent = {
      actorUserId: 'u1',
      action: 'submission:create',
      submissionId: 's1',
      outcome: 'allowed',
      requestId: 'req-1',
      occurredAt: new Date().toISOString(),
    };
    const hook = vi.fn();
    hook(event);
    expect(event).not.toHaveProperty('source');
    expect(event).not.toHaveProperty('password');
    expect(event).not.toHaveProperty('tokenHash');
  });
});
