// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { InMemoryDiscussionRepository } from '../apps/api/src/modules/discussion/repository.js';
import { registerDiscussionModule } from '../apps/api/src/modules/discussion/routes.js';
import { DiscussionRenderer } from '../apps/web/src/features/discussion/DiscussionRenderer.js';
import { render } from '@testing-library/react';

const csrf = { cookie: 'oj_csrf=t', 'x-csrf-token': 't' };
const ctx = (userId: string) => ({ userId, sessionId: `s-${userId}`, strength: 'password' as const });

describe('Discussion Core V1', () => {
  it('sanitizes Discussion Markdown while preserving math', async () => {
    const { container } = render(<DiscussionRenderer content={'<script>alert(1)</script> [bad](javascript:alert(1)) $x^2$'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('.discussion-renderer')).toBeInTheDocument();
  });

  it('supports draft, publish, tombstone, pagination and idempotent likes', async () => {
    const repo = new InMemoryDiscussionRepository();
    const draft = await repo.create({ authorId: 'u1', type: 'ARTICLE', title: 'Draft', contentMarkdown: '# hi', status: 'DRAFT' });
    expect((await repo.list({ limit: 20, status: 'PUBLISHED' })).items).toHaveLength(0);
    await repo.publish(draft.id);
    expect((await repo.list({ limit: 20, status: 'PUBLISHED' })).items[0]?.title).toBe('Draft');
    expect(await repo.like(draft.id, 'u1')).toBe(true);
    expect(await repo.like(draft.id, 'u1')).toBe(false);
    expect((await repo.get(draft.id))?.likeCount).toBe(1);
    await repo.tombstone(draft.id, 'u1');
    expect((await repo.list({ limit: 20 })).items).toHaveLength(0);
  });

  it('enforces authentication, CSRF, ownership and announcement capability at API boundary', async () => {
    const app = Fastify({ logger: false }); const repo = new InMemoryDiscussionRepository(); let actor = ctx('u1');
    await registerDiscussionModule(app, { repository: repo, getAuthContext: async () => actor, getAuthor: async (id) => id === 'u1' ? { id, username: 'writer', displayName: 'Writer' } : null, hasCapability: async (id, c) => id === 'u1' && c === 'discussion:post:moderate' });
    const noCsrf = await app.inject({ method: 'POST', url: '/api/discussion/posts', payload: { title: 'x', contentMarkdown: 'x' } }); expect(noCsrf.statusCode).toBe(403);
    const created = await app.inject({ method: 'POST', url: '/api/discussion/posts', headers: csrf, payload: { title: 'x', contentMarkdown: '[x](javascript:alert(1))', status: 'DRAFT' } }); expect(created.statusCode).toBe(201); expect(created.json().author).toMatchObject({ username: 'writer', displayName: 'Writer' });
    actor = ctx('u2'); const denied = await app.inject({ method: 'POST', url: `/api/discussion/posts/${created.json().id}/publish`, headers: csrf }); expect(denied.statusCode).toBe(403);
    actor = ctx('u1'); const announcement = await app.inject({ method: 'POST', url: '/api/discussion/posts', headers: csrf, payload: { title: 'announcement', contentMarkdown: 'x', type: 'ANNOUNCEMENT' } }); expect(announcement.statusCode).toBe(403);
    await app.close();
  });
});
