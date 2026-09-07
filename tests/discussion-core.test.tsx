// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { InMemoryDiscussionRepository } from '../apps/api/src/modules/discussion/repository.js';
import { registerDiscussionModule } from '../apps/api/src/modules/discussion/routes.js';
import { DiscussionRenderer } from '../apps/web/src/features/discussion/DiscussionRenderer.js';
import { render } from '@testing-library/react';
import type { DiscussionPost } from '../apps/api/src/modules/discussion/model.js';

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

  it('uses stable keyset pagination, including equal timestamps and invalid cursors', async () => {
    const repo = new InMemoryDiscussionRepository();
    const timestamp = '2026-01-01T00:00:00.000Z';
    for (let index = 0; index < 25; index += 1) {
      const id = `post-${String(index).padStart(2, '0')}`;
      const post: DiscussionPost = { id, publicId: id, authorId: 'u1', type: 'ARTICLE', status: 'PUBLISHED', title: `Post ${index}`, summary: null, contentMarkdown: 'x', publishedAt: timestamp, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, deletedBy: null, viewCount: 0, likeCount: 0, commentCount: 0 };
      repo.posts.set(id, post);
    }
    const first = await repo.list({ status: 'PUBLISHED', limit: 10 });
    const second = await repo.list({ status: 'PUBLISHED', limit: 10, ...(first.nextCursor ? { cursor: first.nextCursor } : {}) });
    const third = await repo.list({ status: 'PUBLISHED', limit: 10, ...(second.nextCursor ? { cursor: second.nextCursor } : {}) });
    expect(first.items).toHaveLength(10);
    expect(second.items).toHaveLength(10);
    expect(third.items).toHaveLength(5);
    expect(new Set([...first.items, ...second.items, ...third.items].map(item => item.id)).size).toBe(25);
    expect(third.nextCursor).toBeUndefined();
    await expect(repo.list({ status: 'PUBLISHED', limit: 10, cursor: 'broken' })).rejects.toThrow('Invalid discussion cursor');
  });

  it('keeps comment counts independent of page size and updates them on create/delete', async () => {
    const repo = new InMemoryDiscussionRepository();
    const post = await repo.create({ authorId: 'u1', type: 'ARTICLE', title: 'Comments', contentMarkdown: 'x', status: 'PUBLISHED' });
    const comments = await Promise.all(Array.from({ length: 3 }, (_, index) => repo.createComment({ postId: post.id, authorId: `u${index}`, contentMarkdown: `c${index}` })));
    expect((await repo.get(post.id))?.commentCount).toBe(3);
    expect((await repo.listComments(post.id, undefined, 1)).items).toHaveLength(1);
    await repo.tombstoneComment(comments[0]!.id);
    expect((await repo.get(post.id))?.commentCount).toBe(2);
    expect((await repo.listComments(post.id, undefined, 10)).items).toHaveLength(2);
  });

  it('paginates comments deterministically when timestamps are equal', async () => {
    const repo = new InMemoryDiscussionRepository();
    const post = await repo.create({ authorId: 'u1', type: 'ARTICLE', title: 'Comments', contentMarkdown: 'x', status: 'PUBLISHED' });
    const timestamp = '2026-01-01T00:00:00.000Z';
    for (let index = 0; index < 5; index += 1) {
      const id = `comment-${index}`;
      repo.comments.set(id, { id, postId: post.id, authorId: 'u1', parentCommentId: null, contentMarkdown: id, status: 'VISIBLE', createdAt: timestamp, updatedAt: timestamp, deletedAt: null });
    }
    const first = await repo.listComments(post.id, undefined, 2);
    const second = await repo.listComments(post.id, first.nextCursor, 2);
    const third = await repo.listComments(post.id, second.nextCursor, 2);
    expect(new Set([...first.items, ...second.items, ...third.items].map(item => item.id)).size).toBe(5);
    expect(third.nextCursor).toBeUndefined();
  });

  it('enforces authentication, CSRF, ownership and announcement capability at API boundary', async () => {
    const app = Fastify({ logger: false }); const repo = new InMemoryDiscussionRepository(); let actor = ctx('u1');
    await registerDiscussionModule(app, { repository: repo, getAuthContext: async () => actor, getAuthor: async (id) => id === 'u1' ? { id, username: 'writer', displayName: 'Writer' } : null, hasCapability: async (id, c) => id === 'u1' && c === 'discussion:post:moderate' });
    const noCsrf = await app.inject({ method: 'POST', url: '/api/discussion/posts', payload: { title: 'x', contentMarkdown: 'x' } }); expect(noCsrf.statusCode).toBe(403);
    const created = await app.inject({ method: 'POST', url: '/api/discussion/posts', headers: csrf, payload: { title: 'x', contentMarkdown: '[x](javascript:alert(1))', status: 'PUBLISHED' } }); expect(created.statusCode).toBe(201); expect(created.json().author).toMatchObject({ username: 'writer', displayName: 'Writer' }); expect(created.json().author.id).toBeUndefined(); expect(created.json().authorId).toBeUndefined();
    const comments = await app.inject({ method: 'POST', url: `/api/discussion/posts/${created.json().id}/comments`, headers: csrf, payload: { contentMarkdown: 'comment' } }); expect(comments.statusCode).toBe(201); expect(comments.json().authorId).toBeUndefined(); expect(comments.json().author.id).toBeUndefined();
    const deletedUserApp = Fastify({ logger: false });
    await registerDiscussionModule(deletedUserApp, { repository: repo, getAuthContext: async () => actor, getAuthor: async () => null });
    const deletedUserView = await deletedUserApp.inject({ method: 'GET', url: `/api/discussion/posts/${created.json().id}` }); expect(deletedUserView.statusCode).toBe(200); expect(deletedUserView.json().author).toEqual({ username: 'deleted-user', displayName: 'Deleted User' });
    const invalidCursor = await app.inject({ method: 'GET', url: '/api/discussion/posts?cursor=broken' }); expect(invalidCursor.statusCode).toBe(400);
    actor = ctx('u2'); const denied = await app.inject({ method: 'POST', url: `/api/discussion/posts/${created.json().id}/publish`, headers: csrf }); expect(denied.statusCode).toBe(403);
    actor = ctx('u1'); const announcement = await app.inject({ method: 'POST', url: '/api/discussion/posts', headers: csrf, payload: { title: 'announcement', contentMarkdown: 'x', type: 'ANNOUNCEMENT' } }); expect(announcement.statusCode).toBe(403);
    actor = ctx('u2'); const ownerUpdateDenied = await app.inject({ method: 'PATCH', url: `/api/discussion/comments/${comments.json().id}`, headers: csrf, payload: { contentMarkdown: 'nope' } }); expect(ownerUpdateDenied.statusCode).toBe(403);
    actor = ctx('u1'); const ownerUpdate = await app.inject({ method: 'PATCH', url: `/api/discussion/comments/${comments.json().id}`, headers: csrf, payload: { contentMarkdown: 'updated' } }); expect(ownerUpdate.statusCode).toBe(200);
    await app.close();
    await deletedUserApp.close();
  });
});
