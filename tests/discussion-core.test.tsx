// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  InMemoryDiscussionRepository,
  PostgresDiscussionRepository,
} from '../apps/api/src/modules/discussion/repository.js';
import { registerDiscussionModule } from '../apps/api/src/modules/discussion/routes.js';
import { DiscussionRenderer } from '../apps/web/src/features/discussion/DiscussionRenderer.js';
import { render, waitFor } from '@testing-library/react';
import { DiscussionPostPage } from '../apps/web/src/features/discussion/DiscussionExperience.js';
import type { ApiClient } from '../apps/web/src/services/api.js';
import type { DiscussionPost } from '../apps/api/src/modules/discussion/model.js';

const csrf = { cookie: 'oj_csrf=t', 'x-csrf-token': 't' };
const ctx = (userId: string) => ({
  userId,
  sessionId: `s-${userId}`,
  strength: 'password' as const,
});

describe('Discussion Core V1', () => {
  it('keeps UUID and public text post lookup parameters type-compatible', async () => {
    const queries: string[] = [];
    const row = {
      id: '01234567-89ab-4def-8123-456789abcdef',
      public_id: 'post-public',
      author_id: '11234567-89ab-4def-8123-456789abcdef',
      type: 'ARTICLE',
      status: 'DRAFT',
      title: 'Draft',
      summary: null,
      content_markdown: 'body',
      published_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null,
      deleted_by: null,
      view_count: 0,
    };
    const repository = new PostgresDiscussionRepository({
      query: async (sql: string) => {
        queries.push(sql);
        return { rows: [row], rowCount: 1 };
      },
    });
    await repository.get(row.id);
    await repository.get(row.public_id);
    await repository.publish(row.id);
    await repository.publish(row.public_id);
    expect(queries[0]).toContain('WHERE p.id=$1');
    expect(queries[1]).toContain('WHERE p.public_id=$1');
    expect(queries[2]).toContain('WHERE id=$1');
    expect(queries[3]).toContain('WHERE public_id=$1');
    expect(queries.every((sql) => !sql.includes('id=$1 OR'))).toBe(true);
  });

  it('sanitizes Discussion Markdown while preserving math', async () => {
    const { container } = render(
      <DiscussionRenderer
        content={'<script>alert(1)</script> [bad](javascript:alert(1)) $x^2$'}
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('.discussion-renderer')).toBeInTheDocument();
  });

  it('supports draft, publish, tombstone, pagination and idempotent likes', async () => {
    const repo = new InMemoryDiscussionRepository();
    const draft = await repo.create({
      authorId: 'u1',
      type: 'ARTICLE',
      title: 'Draft',
      contentMarkdown: '# hi',
      status: 'DRAFT',
    });
    expect(
      (await repo.list({ limit: 20, status: 'PUBLISHED' })).items,
    ).toHaveLength(0);
    await repo.publish(draft.id);
    expect(
      (await repo.list({ limit: 20, status: 'PUBLISHED' })).items[0]?.title,
    ).toBe('Draft');
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
      const post: DiscussionPost = {
        id,
        publicId: id,
        authorId: 'u1',
        type: 'ARTICLE',
        status: 'PUBLISHED',
        title: `Post ${index}`,
        summary: null,
        contentMarkdown: 'x',
        publishedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        deletedBy: null,
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
      };
      repo.posts.set(id, post);
    }
    const first = await repo.list({ status: 'PUBLISHED', limit: 10 });
    const second = await repo.list({
      status: 'PUBLISHED',
      limit: 10,
      ...(first.nextCursor ? { cursor: first.nextCursor } : {}),
    });
    const third = await repo.list({
      status: 'PUBLISHED',
      limit: 10,
      ...(second.nextCursor ? { cursor: second.nextCursor } : {}),
    });
    expect(first.items).toHaveLength(10);
    expect(second.items).toHaveLength(10);
    expect(third.items).toHaveLength(5);
    expect(
      new Set(
        [...first.items, ...second.items, ...third.items].map(
          (item) => item.id,
        ),
      ).size,
    ).toBe(25);
    expect(third.nextCursor).toBeUndefined();
    await expect(
      repo.list({ status: 'PUBLISHED', limit: 10, cursor: 'broken' }),
    ).rejects.toThrow('Invalid discussion cursor');
  });

  it('keeps comment counts independent of page size and updates them on create/delete', async () => {
    const repo = new InMemoryDiscussionRepository();
    const post = await repo.create({
      authorId: 'u1',
      type: 'ARTICLE',
      title: 'Comments',
      contentMarkdown: 'x',
      status: 'PUBLISHED',
    });
    const comments = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        repo.createComment({
          postId: post.id,
          authorId: `u${index}`,
          contentMarkdown: `c${index}`,
        }),
      ),
    );
    expect((await repo.get(post.id))?.commentCount).toBe(3);
    expect((await repo.listComments(post.id, undefined, 1)).items).toHaveLength(
      1,
    );
    await repo.tombstoneComment(comments[0]!.id);
    expect((await repo.get(post.id))?.commentCount).toBe(2);
    expect(
      (await repo.listComments(post.id, undefined, 10)).items,
    ).toHaveLength(2);
  });

  it('paginates comments deterministically when timestamps are equal', async () => {
    const repo = new InMemoryDiscussionRepository();
    const post = await repo.create({
      authorId: 'u1',
      type: 'ARTICLE',
      title: 'Comments',
      contentMarkdown: 'x',
      status: 'PUBLISHED',
    });
    const timestamp = '2026-01-01T00:00:00.000Z';
    for (let index = 0; index < 5; index += 1) {
      const id = `comment-${index}`;
      repo.comments.set(id, {
        id,
        postId: post.id,
        authorId: 'u1',
        parentCommentId: null,
        contentMarkdown: id,
        status: 'VISIBLE',
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      });
    }
    const first = await repo.listComments(post.id, undefined, 2);
    const second = await repo.listComments(post.id, first.nextCursor, 2);
    const third = await repo.listComments(post.id, second.nextCursor, 2);
    expect(
      new Set(
        [...first.items, ...second.items, ...third.items].map(
          (item) => item.id,
        ),
      ).size,
    ).toBe(5);
    expect(third.nextCursor).toBeUndefined();
  });

  it('keeps comment replies scoped to their post and comment likes durable', async () => {
    const repo = new InMemoryDiscussionRepository();
    const post = await repo.create({
      authorId: 'u1',
      type: 'ARTICLE',
      title: 'Threads',
      contentMarkdown: 'x',
      status: 'PUBLISHED',
    });
    const other = await repo.create({
      authorId: 'u1',
      type: 'ARTICLE',
      title: 'Other',
      contentMarkdown: 'x',
      status: 'PUBLISHED',
    });
    const parent = await repo.createComment({
      postId: post.id,
      authorId: 'u1',
      contentMarkdown: 'parent',
    });
    const reply = await repo.createComment({
      postId: post.id,
      authorId: 'u2',
      contentMarkdown: 'reply',
      parentCommentId: parent.id,
    });
    expect(reply.parentCommentId).toBe(parent.id);
    await expect(
      repo.createComment({
        postId: other.id,
        authorId: 'u2',
        contentMarkdown: 'invalid',
        parentCommentId: parent.id,
      }),
    ).rejects.toThrow('Parent comment not found');
    expect(await repo.likeComment(reply.id, 'u3')).toBe(true);
    expect(await repo.likeComment(reply.id, 'u3')).toBe(false);
    expect((await repo.getComment(reply.id, 'u3'))?.likeCount).toBe(1);
    expect((await repo.getComment(reply.id, 'u3'))?.viewerLiked).toBe(true);
    expect(await repo.unlikeComment(reply.id, 'u3')).toBe(true);
    expect((await repo.getComment(reply.id, 'u3'))?.viewerLiked).toBe(false);
  });

  it('enforces authentication, CSRF, ownership and announcement capability at API boundary', async () => {
    const app = Fastify({ logger: false });
    const repo = new InMemoryDiscussionRepository();
    let actor = ctx('u1');
    await registerDiscussionModule(app, {
      repository: repo,
      getAuthContext: async () => actor,
      getAuthor: async (id) =>
        id === 'u1' ? { id, username: 'writer', displayName: 'Writer' } : null,
      hasCapability: async (id, c) =>
        id === 'u1' && c === 'discussion:post:moderate',
    });
    const noCsrf = await app.inject({
      method: 'POST',
      url: '/api/discussion/posts',
      payload: { title: 'x', contentMarkdown: 'x' },
    });
    expect(noCsrf.statusCode).toBe(403);
    const created = await app.inject({
      method: 'POST',
      url: '/api/discussion/posts',
      headers: csrf,
      payload: {
        title: 'x',
        contentMarkdown: '[x](javascript:alert(1))',
        status: 'PUBLISHED',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().author).toMatchObject({
      username: 'writer',
      displayName: 'Writer',
    });
    expect(created.json().author.id).toBeUndefined();
    expect(created.json().authorId).toBeUndefined();
    const draft = await app.inject({
      method: 'POST',
      url: '/api/discussion/posts',
      headers: csrf,
      payload: { title: 'draft', contentMarkdown: 'draft body' },
    });
    expect(draft.statusCode).toBe(201);
    expect(draft.json().status).toBe('DRAFT');
    const published = await app.inject({
      method: 'POST',
      url: `/api/discussion/posts/${draft.json().publicId}/publish`,
      headers: csrf,
    });
    expect(published.statusCode).toBe(200);
    expect(published.json()).toMatchObject({ status: 'PUBLISHED' });
    expect(published.json().publishedAt).toEqual(expect.any(String));
    const publishedList = await app.inject({
      method: 'GET',
      url: '/api/discussion/posts',
    });
    expect(
      publishedList
        .json()
        .items.some((item: { id: string }) => item.id === draft.json().id),
    ).toBe(true);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/discussion/posts/${draft.json().publicId}`,
        })
      ).statusCode,
    ).toBe(200);
    const comments = await app.inject({
      method: 'POST',
      url: `/api/discussion/posts/${created.json().id}/comments`,
      headers: csrf,
      payload: { contentMarkdown: 'comment' },
    });
    expect(comments.statusCode).toBe(201);
    expect(comments.json().authorId).toBeUndefined();
    expect(comments.json().author.id).toBeUndefined();
    const deletedUserApp = Fastify({ logger: false });
    await registerDiscussionModule(deletedUserApp, {
      repository: repo,
      getAuthContext: async () => actor,
      getAuthor: async () => null,
    });
    const deletedUserView = await deletedUserApp.inject({
      method: 'GET',
      url: `/api/discussion/posts/${created.json().id}`,
    });
    expect(deletedUserView.statusCode).toBe(200);
    expect(deletedUserView.json().author).toEqual({
      username: 'deleted-user',
      displayName: 'Deleted User',
    });
    const invalidCursor = await app.inject({
      method: 'GET',
      url: '/api/discussion/posts?cursor=broken',
    });
    expect(invalidCursor.statusCode).toBe(400);
    actor = ctx('u2');
    const denied = await app.inject({
      method: 'POST',
      url: `/api/discussion/posts/${created.json().id}/publish`,
      headers: csrf,
    });
    expect(denied.statusCode).toBe(403);
    actor = ctx('u1');
    const announcement = await app.inject({
      method: 'POST',
      url: '/api/discussion/posts',
      headers: csrf,
      payload: {
        title: 'announcement',
        contentMarkdown: 'x',
        type: 'ANNOUNCEMENT',
      },
    });
    expect(announcement.statusCode).toBe(403);
    actor = ctx('u2');
    const ownerUpdateDenied = await app.inject({
      method: 'PATCH',
      url: `/api/discussion/comments/${comments.json().id}`,
      headers: csrf,
      payload: { contentMarkdown: 'nope' },
    });
    expect(ownerUpdateDenied.statusCode).toBe(403);
    actor = ctx('u1');
    const ownerUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/discussion/comments/${comments.json().id}`,
      headers: csrf,
      payload: { contentMarkdown: 'updated' },
    });
    expect(ownerUpdate.statusCode).toBe(200);
    await app.close();
    await deletedUserApp.close();
  });

  it('projects viewer capabilities without exposing identity', async () => {
    const app = Fastify({ logger: false });
    const repo = new InMemoryDiscussionRepository();
    let actor = ctx('owner');
    const permissions = new Map<string, Set<string>>([
      [
        'moderator',
        new Set(['discussion:post:moderate', 'discussion:comment:moderate']),
      ],
      ['publisher', new Set(['discussion:announcement:create'])],
    ]);
    await registerDiscussionModule(app, {
      repository: repo,
      getAuthContext: async () => actor,
      getAuthor: async (id) => ({ id, username: id, displayName: id }),
      hasCapability: async (id, capability) =>
        permissions.get(id)?.has(capability) ?? false,
    });
    const post = await app.inject({
      method: 'POST',
      url: '/api/discussion/posts',
      headers: csrf,
      payload: { title: 'owned', contentMarkdown: 'x', status: 'PUBLISHED' },
    });
    expect(post.json().capabilities).toEqual({
      canEdit: true,
      canDelete: true,
      canModerate: false,
    });
    const comment = await app.inject({
      method: 'POST',
      url: `/api/discussion/posts/${post.json().id}/comments`,
      headers: csrf,
      payload: { contentMarkdown: 'owned comment' },
    });
    expect(comment.json().capabilities).toEqual({
      canEdit: true,
      canDelete: true,
      canModerate: false,
    });
    actor = ctx('other');
    const otherPost = await app.inject({
      method: 'GET',
      url: `/api/discussion/posts/${post.json().id}`,
    });
    expect(otherPost.json().capabilities).toEqual({
      canEdit: false,
      canDelete: false,
      canModerate: false,
    });
    const otherComments = await app.inject({
      method: 'GET',
      url: `/api/discussion/posts/${post.json().id}/comments`,
    });
    expect(otherComments.json().items[0].capabilities).toEqual({
      canEdit: false,
      canDelete: false,
      canModerate: false,
    });
    actor = ctx('owner');
    const draft = await app.inject({
      method: 'POST',
      url: '/api/discussion/posts',
      headers: csrf,
      payload: { title: 'draft', contentMarkdown: 'x', status: 'DRAFT' },
    });
    const draftView = await app.inject({
      method: 'GET',
      url: `/api/discussion/posts/${draft.json().id}`,
    });
    expect(draftView.json().capabilities).toEqual({
      canEdit: true,
      canDelete: true,
      canModerate: false,
    });
    actor = ctx('publisher');
    const announcement = await app.inject({
      method: 'POST',
      url: '/api/discussion/posts',
      headers: csrf,
      payload: {
        title: 'announcement',
        contentMarkdown: 'x',
        type: 'ANNOUNCEMENT',
        status: 'PUBLISHED',
      },
    });
    expect(announcement.statusCode).toBe(201);
    actor = ctx('owner');
    const announcementAsOther = await app.inject({
      method: 'GET',
      url: `/api/discussion/posts/${announcement.json().id}`,
    });
    expect(announcementAsOther.json().capabilities).toEqual({
      canEdit: false,
      canDelete: false,
      canModerate: false,
    });
    actor = ctx('publisher');
    const announcementAsOwner = await app.inject({
      method: 'GET',
      url: `/api/discussion/posts/${announcement.json().id}`,
    });
    expect(announcementAsOwner.json().capabilities).toEqual({
      canEdit: true,
      canDelete: true,
      canModerate: false,
    });
    actor = ctx('other');
    const forged = await app.inject({
      method: 'PATCH',
      url: `/api/discussion/posts/${post.json().id}`,
      headers: csrf,
      payload: { title: 'forged' },
    });
    expect(forged.statusCode).toBe(403);
    actor = ctx('moderator');
    const moderatedPost = await app.inject({
      method: 'GET',
      url: `/api/discussion/posts/${post.json().id}`,
    });
    expect(moderatedPost.json().capabilities).toEqual({
      canEdit: true,
      canDelete: true,
      canModerate: true,
    });
    const moderatedComments = await app.inject({
      method: 'GET',
      url: `/api/discussion/posts/${post.json().id}/comments`,
    });
    expect(moderatedComments.json().items[0].capabilities).toEqual({
      canEdit: true,
      canDelete: true,
      canModerate: true,
    });
    actor = ctx('anonymous');
    const anonymousApp = Fastify({ logger: false });
    await registerDiscussionModule(anonymousApp, {
      repository: repo,
      getAuthContext: async () => undefined,
      getAuthor: async (id) => ({ id, username: id, displayName: id }),
    });
    const anonymousPost = await anonymousApp.inject({
      method: 'GET',
      url: `/api/discussion/posts/${post.json().id}`,
    });
    expect(anonymousPost.json().capabilities).toEqual({
      canEdit: false,
      canDelete: false,
      canModerate: false,
    });
    await app.close();
    await anonymousApp.close();
  });

  it('renders post and comment controls from server capabilities', async () => {
    const post = {
      id: 'p1',
      publicId: 'post-p1',
      type: 'ARTICLE' as const,
      status: 'PUBLISHED' as const,
      title: 'Post',
      summary: null,
      contentMarkdown: 'body',
      publishedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      viewCount: 1,
      likeCount: 0,
      commentCount: 1,
      capabilities: { canEdit: true, canDelete: true, canModerate: false },
      author: { username: 'owner', displayName: 'Owner' },
    };
    const comment = {
      id: 'c1',
      postId: 'p1',
      contentMarkdown: 'comment',
      status: 'VISIBLE' as const,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      capabilities: { canEdit: true, canDelete: true, canModerate: false },
      author: { username: 'owner', displayName: 'Owner' },
    };
    const api = {
      discussionPost: async () => post,
      discussionComments: async () => ({ items: [comment] }),
      likeDiscussionPost: async () => undefined,
      createDiscussionComment: async () => comment,
      updateDiscussionComment: async () => comment,
      deleteDiscussionComment: async () => comment,
      deleteDiscussionPost: async () => comment,
    } as unknown as ApiClient;
    const view = render(
      <DiscussionPostPage
        api={api}
        navigate={() => undefined}
        id="p1"
        user={null}
      />,
    );
    await waitFor(() =>
      expect(view.getByRole('heading', { name: 'Post' })).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(view.getAllByRole('button', { name: '编辑' })).toHaveLength(2),
    );
    expect(view.getAllByRole('button', { name: '删除' })).toHaveLength(2);
  });
});
