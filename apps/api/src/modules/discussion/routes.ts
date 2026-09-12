/* eslint-disable @typescript-eslint/no-explicit-any -- Fastify boundary payloads are validated here. */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthContext } from '../auth/types.js';
import {
  DiscussionCursorValidationError,
  type DiscussionRepository,
} from './repository.js';
import type { DiscussionPostType } from './model.js';
import type { DiscussionPostKind } from './model.js';
import { DiscussionBlogService } from './service.js';

export type DiscussionModuleOptions = {
  repository: DiscussionRepository;
  blogService?: DiscussionBlogService;
  getAuthContext: (request: FastifyRequest) => Promise<AuthContext | undefined>;
  hasCapability?: (userId: string, capability: string) => Promise<boolean>;
  getAuthor?: (userId: string) => Promise<{
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  } | null>;
  audit?: {
    record(event: {
      actorUserId: string;
      action: string;
      resource: string;
      resourceId?: string;
      outcome: 'allowed' | 'denied';
      requestId: string;
      occurredAt: string;
    }): Promise<void> | void;
  };
};
const csrf = (r: FastifyRequest) => {
  const t = r.headers['x-csrf-token'];
  return (
    typeof t === 'string' &&
    r.headers.cookie?.split(';').some((v) => v.trim() === `oj_csrf=${t}`)
  );
};
const error = (
  reply: FastifyReply,
  request: FastifyRequest,
  status: number,
  code: string,
  message: string,
) => reply.status(status).send({ code, message, requestId: request.id });
const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const page = (q: any) => {
  const n = Number(q.limit ?? 20);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
};
const slug = (value: unknown) =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
const coverImage = (value: unknown) =>
  value === null ||
  (typeof value === 'string' &&
    value.length <= 2048 &&
    (value.startsWith('/') || /^https:\/\//i.test(value)));

export async function registerDiscussionModule(
  app: FastifyInstance,
  o: DiscussionModuleOptions,
) {
  const auth = (r: FastifyRequest) => o.getAuthContext(r);
  const blogService = o.blogService ?? new DiscussionBlogService(o.repository);
  const can = async (ctx: AuthContext | undefined, capability: string) =>
    Boolean(
      ctx?.strength === 'password' &&
      ctx.userId &&
      (await o.hasCapability?.(ctx.userId, capability)),
    );
  const audit = (
    ctx: AuthContext,
    action: string,
    id: string,
    r: FastifyRequest,
  ) =>
    o.audit?.record({
      actorUserId: ctx.userId,
      action,
      resource: 'discussion',
      resourceId: id,
      outcome: 'allowed',
      requestId: r.id,
      occurredAt: new Date().toISOString(),
    });
  const ownerOr = async (
    ctx: AuthContext | undefined,
    post: any,
    capability: string,
  ) =>
    Boolean(
      ctx && (ctx.userId === post.authorId || (await can(ctx, capability))),
    );
  const getAuthor = o.getAuthor;
  const safeAuthor = (
    author: {
      id: string;
      username: string;
      displayName: string;
      avatarUrl?: string;
    } | null,
  ) =>
    author
      ? {
          username: author.username,
          displayName: author.displayName,
          ...(author.avatarUrl ? { avatarUrl: author.avatarUrl } : {}),
        }
      : { username: 'deleted-user', displayName: 'Deleted User' };
  const postCapabilities = async (ctx: AuthContext | undefined, post: any) => {
    const owner = Boolean(ctx?.userId && ctx.userId === post.authorId);
    const canModerate = await can(ctx, 'discussion:post:moderate');
    const announcementAllowed =
      post.type !== 'ANNOUNCEMENT' ||
      (await can(ctx, 'discussion:announcement:create'));
    const active = post.status !== 'DELETED';
    return {
      canEdit: active && announcementAllowed && (owner || canModerate),
      canDelete: active && (owner || canModerate),
      canModerate,
    };
  };
  const commentCapabilities = async (
    ctx: AuthContext | undefined,
    comment: any,
  ) => {
    const owner = Boolean(ctx?.userId && ctx.userId === comment.authorId);
    const canModerate = await can(ctx, 'discussion:comment:moderate');
    const active = comment.status !== 'DELETED';
    return {
      canEdit: active && (owner || canModerate),
      canDelete: active && (owner || canModerate),
      canModerate,
    };
  };
  const projectPost = async (
    post: any,
    ctx?: AuthContext,
    includeCapabilities = false,
  ) => {
    const publicPost = { ...post };
    delete publicPost.authorId;
    return {
      ...publicPost,
      ...(getAuthor
        ? { author: safeAuthor(await getAuthor(post.authorId)) }
        : {}),
      ...(includeCapabilities
        ? { capabilities: await postCapabilities(ctx, post) }
        : {}),
    };
  };
  const projectComments = async (items: any[], ctx?: AuthContext) =>
    Promise.all(
      items.map(async (item) => {
        const publicComment = {
          ...item,
          ...(item.status === 'DELETED' ? { contentMarkdown: '' } : {}),
        };
        delete publicComment.authorId;
        return {
          ...publicComment,
          ...(getAuthor
            ? { author: safeAuthor(await getAuthor(item.authorId)) }
            : {}),
          ...(item.parentCommentId && getAuthor
            ? {
                replyTarget: safeAuthor(
                  await (async () => {
                    const parent = await o.repository.getCommentAny(
                      item.parentCommentId,
                    );
                    return parent ? await getAuthor(parent.authorId) : null;
                  })(),
                ),
              }
            : {}),
          capabilities: await commentCapabilities(ctx, item),
        };
      }),
    );
  app.get('/api/discussion/posts', async (r, reply) => {
    const ctx = await auth(r);
    const q = r.query as any;
    const limit = page(q);
    if (!limit)
      return error(reply, r, 400, 'VALIDATION_ERROR', 'Invalid limit');
    const own = q.mine === 'true';
    if (own && !ctx)
      return error(reply, r, 401, 'UNAUTHENTICATED', 'Authentication required');
    try {
      const result = await o.repository.list({
        limit,
        ...(typeof q.cursor === 'string' ? { cursor: q.cursor } : {}),
        ...(q.type === 'ARTICLE' || q.type === 'ANNOUNCEMENT'
          ? { type: q.type }
          : {}),
        ...(q.kind === 'DISCUSSION' ||
        q.kind === 'SOLUTION' ||
        q.kind === 'ANNOUNCEMENT'
          ? { kind: q.kind as DiscussionPostKind }
          : {}),
        ...(slug(q.category) ? { category: q.category } : {}),
        ...(slug(q.tag) ? { tag: q.tag } : {}),
        ...(own && ctx ? { authorId: ctx.userId } : {}),
        ...(typeof q.q === 'string' ? { q: q.q.slice(0, 80) } : {}),
        status: own
          ? q.status === 'DRAFT'
            ? 'DRAFT'
            : q.status === 'DELETED'
              ? 'DELETED'
              : 'PUBLISHED'
          : 'PUBLISHED',
      });
      return reply.send({
        ...result,
        items: await Promise.all(result.items.map((item) => projectPost(item))),
      });
    } catch (e) {
      if (e instanceof DiscussionCursorValidationError)
        return error(reply, r, 400, 'VALIDATION_ERROR', e.message);
      throw e;
    }
  });
  app.get('/api/discussion/blog/overview', async (_r, reply) => {
    const overview = await blogService.getOverview();
    const projectPosts = (posts: any[]) =>
      Promise.all(posts.map((post) => projectPost(post)));
    const projectedComments = await projectComments(overview.recentComments);
    return reply.send({
      featured: overview.featured ? await projectPost(overview.featured) : null,
      hotPosts: await projectPosts(overview.hotPosts),
      recommendedPosts: await projectPosts(overview.recommendedPosts),
      categories: overview.categories,
      tags: overview.tags,
      authors: await Promise.all(
        overview.authorRanks.map(async ({ authorId, postCount }) => ({
          author: safeAuthor(getAuthor ? await getAuthor(authorId) : null),
          postCount,
        })),
      ),
      stats: overview.stats,
      recentComments: projectedComments,
    });
  });
  app.post('/api/discussion/posts', async (r, reply) => {
    const ctx = await auth(r);
    if (!ctx)
      return error(reply, r, 401, 'UNAUTHENTICATED', 'Authentication required');
    if (!csrf(r))
      return error(reply, r, 403, 'CSRF_INVALID', 'CSRF validation failed');
    const b = r.body as any;
    const type: DiscussionPostType =
      b?.type === 'ANNOUNCEMENT' ? 'ANNOUNCEMENT' : 'ARTICLE';
    const kind: DiscussionPostKind =
      type === 'ANNOUNCEMENT'
        ? 'ANNOUNCEMENT'
        : b?.kind === 'SOLUTION'
          ? 'SOLUTION'
          : 'DISCUSSION';
    if (
      type === 'ANNOUNCEMENT' &&
      !(await can(ctx, 'discussion:announcement:create'))
    )
      return error(
        reply,
        r,
        403,
        'FORBIDDEN',
        'Announcement capability required',
      );
    if (
      !text(b?.title, 240) ||
      typeof b?.contentMarkdown !== 'string' ||
      b.contentMarkdown.length > 500_000 ||
      (b.categorySlug !== undefined && !slug(b.categorySlug)) ||
      (b.coverImageUrl !== undefined && !coverImage(b.coverImageUrl)) ||
      (b.tagSlugs !== undefined &&
        (!Array.isArray(b.tagSlugs) ||
          b.tagSlugs.length > 10 ||
          b.tagSlugs.some((value: unknown) => !slug(value))))
    )
      return error(reply, r, 400, 'VALIDATION_ERROR', 'Invalid post content');
    const status = b.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
    const post = await o.repository.create({
      authorId: ctx.userId,
      type,
      kind,
      title: b.title.trim(),
      summary:
        typeof b.summary === 'string' ? b.summary.slice(0, 1000) : undefined,
      contentMarkdown: b.contentMarkdown,
      status,
      ...(slug(b.categorySlug) ? { categorySlug: b.categorySlug } : {}),
      ...(Array.isArray(b.tagSlugs) ? { tagSlugs: b.tagSlugs } : {}),
      ...(b.coverImageUrl !== undefined
        ? { coverImageUrl: b.coverImageUrl }
        : {}),
    });
    await audit(
      ctx,
      status === 'PUBLISHED' ? 'POST_PUBLISHED' : 'POST_CREATED',
      post.id,
      r,
    );
    return reply.status(201).send(await projectPost(post, ctx, true));
  });
  app.get('/api/discussion/posts/:id', async (r, reply) => {
    const key = (r.params as any).id;
    const ctx = await auth(r);
    const post = await o.repository.get(key, ctx?.userId);
    if (!post || post.status === 'DELETED')
      return error(reply, r, 404, 'NOT_FOUND', 'Post not found');
    if (
      post.status !== 'PUBLISHED' &&
      !(await ownerOr(ctx, post, 'discussion:post:moderate'))
    )
      return error(reply, r, 404, 'NOT_FOUND', 'Post not found');
    const trackView = (r.query as any)?.trackView !== 'false';
    if (post.status === 'PUBLISHED' && trackView)
      await o.repository.incrementViews(post.id);
    return reply.send(
      await projectPost(
        {
          ...post,
          viewCount:
            post.viewCount + (post.status === 'PUBLISHED' && trackView ? 1 : 0),
        },
        ctx,
        true,
      ),
    );
  });
  app.patch('/api/discussion/posts/:id', async (r, reply) => {
    const ctx = await auth(r);
    if (!ctx)
      return error(reply, r, 401, 'UNAUTHENTICATED', 'Authentication required');
    if (!csrf(r))
      return error(reply, r, 403, 'CSRF_INVALID', 'CSRF validation failed');
    const key = (r.params as any).id;
    const post = await o.repository.get(key);
    if (!post || post.status === 'DELETED')
      return error(reply, r, 404, 'NOT_FOUND', 'Post not found');
    if (!(await ownerOr(ctx, post, 'discussion:post:moderate')))
      return error(reply, r, 403, 'FORBIDDEN', 'Post ownership required');
    const b = r.body as any;
    if (
      b.type === 'ANNOUNCEMENT' &&
      !(await can(ctx, 'discussion:announcement:create'))
    )
      return error(
        reply,
        r,
        403,
        'FORBIDDEN',
        'Announcement capability required',
      );
    if (
      (b.categorySlug !== undefined &&
        b.categorySlug !== null &&
        !slug(b.categorySlug)) ||
      (b.coverImageUrl !== undefined && !coverImage(b.coverImageUrl)) ||
      (b.tagSlugs !== undefined &&
        (!Array.isArray(b.tagSlugs) ||
          b.tagSlugs.length > 10 ||
          b.tagSlugs.some((value: unknown) => !slug(value)))) ||
      (b.kind !== undefined &&
        b.kind !== 'DISCUSSION' &&
        b.kind !== 'SOLUTION') ||
      (b.kind !== undefined &&
        (b.type === 'ANNOUNCEMENT' ||
          (b.type === undefined && post.type === 'ANNOUNCEMENT')))
    )
      return error(reply, r, 400, 'VALIDATION_ERROR', 'Invalid blog metadata');
    const updated = await o.repository.update(post.id, {
      title: typeof b.title === 'string' ? b.title.trim() : undefined,
      summary:
        typeof b.summary === 'string' ? b.summary.slice(0, 1000) : undefined,
      contentMarkdown:
        typeof b.contentMarkdown === 'string' ? b.contentMarkdown : undefined,
      type:
        b.type === 'ARTICLE' || b.type === 'ANNOUNCEMENT' ? b.type : undefined,
      kind:
        b.type === 'ANNOUNCEMENT'
          ? 'ANNOUNCEMENT'
          : b.kind === 'DISCUSSION' || b.kind === 'SOLUTION'
            ? b.kind
            : b.type === 'ARTICLE'
              ? 'DISCUSSION'
              : undefined,
      ...(b.categorySlug !== undefined ? { categorySlug: b.categorySlug } : {}),
      ...(Array.isArray(b.tagSlugs) ? { tagSlugs: b.tagSlugs } : {}),
      ...(b.coverImageUrl !== undefined
        ? { coverImageUrl: b.coverImageUrl }
        : {}),
    });
    return updated
      ? reply.send(await projectPost(updated, ctx, true))
      : error(reply, r, 404, 'NOT_FOUND', 'Post not found');
  });
  app.post('/api/discussion/posts/:id/publish', async (r, reply) => {
    const ctx = await auth(r);
    if (!ctx)
      return error(reply, r, 401, 'UNAUTHENTICATED', 'Authentication required');
    if (!csrf(r))
      return error(reply, r, 403, 'CSRF_INVALID', 'CSRF validation failed');
    const post = await o.repository.get((r.params as any).id);
    if (!post) return error(reply, r, 404, 'NOT_FOUND', 'Post not found');
    if (!(await ownerOr(ctx, post, 'discussion:post:moderate')))
      return error(reply, r, 403, 'FORBIDDEN', 'Post ownership required');
    if (
      post.type === 'ANNOUNCEMENT' &&
      !(await can(ctx, 'discussion:announcement:create'))
    )
      return error(
        reply,
        r,
        403,
        'FORBIDDEN',
        'Announcement capability required',
      );
    const p = await o.repository.publish(post.id);
    if (p) await audit(ctx, 'POST_PUBLISHED', p.id, r);
    return p
      ? reply.send(await projectPost(p, ctx, true))
      : error(reply, r, 404, 'NOT_FOUND', 'Post not found');
  });
  app.delete('/api/discussion/posts/:id', async (r, reply) => {
    const ctx = await auth(r);
    if (!ctx)
      return error(reply, r, 401, 'UNAUTHENTICATED', 'Authentication required');
    if (!csrf(r))
      return error(reply, r, 403, 'CSRF_INVALID', 'CSRF validation failed');
    const post = await o.repository.get((r.params as any).id);
    if (!post) return error(reply, r, 404, 'NOT_FOUND', 'Post not found');
    if (!(await ownerOr(ctx, post, 'discussion:post:moderate')))
      return error(reply, r, 403, 'FORBIDDEN', 'Post ownership required');
    const p = await o.repository.tombstone(post.id, ctx.userId);
    if (p) await audit(ctx, 'POST_DELETED', p.id, r);
    return p
      ? reply.send(await projectPost(p, ctx, true))
      : error(reply, r, 404, 'NOT_FOUND', 'Post not found');
  });
  app.get('/api/discussion/posts/:id/comments', async (r, reply) => {
    const ctx = await auth(r);
    const post = await o.repository.get((r.params as any).id);
    if (!post || post.status !== 'PUBLISHED')
      return error(reply, r, 404, 'NOT_FOUND', 'Post not found');
    const q = r.query as any;
    const limit = page(q);
    if (!limit)
      return error(reply, r, 400, 'VALIDATION_ERROR', 'Invalid limit');
    try {
      const result = await o.repository.listComments(
        post.id,
        typeof q.cursor === 'string' ? q.cursor : undefined,
        limit,
        ctx?.userId,
      );
      return reply.send({
        ...result,
        items: await projectComments(result.items, ctx),
      });
    } catch (e) {
      if (e instanceof DiscussionCursorValidationError)
        return error(reply, r, 400, 'VALIDATION_ERROR', e.message);
      throw e;
    }
  });
  app.post('/api/discussion/posts/:id/comments', async (r, reply) => {
    const ctx = await auth(r);
    if (!ctx)
      return error(reply, r, 401, 'UNAUTHENTICATED', 'Authentication required');
    if (!csrf(r))
      return error(reply, r, 403, 'CSRF_INVALID', 'CSRF validation failed');
    const post = await o.repository.get((r.params as any).id);
    if (!post || post.status !== 'PUBLISHED')
      return error(reply, r, 404, 'NOT_FOUND', 'Post not found');
    const b = r.body as any;
    if (!text(b?.contentMarkdown, 20_000))
      return error(
        reply,
        r,
        400,
        'VALIDATION_ERROR',
        'Invalid comment content',
      );
    if (
      b.parentCommentId !== undefined &&
      b.parentCommentId !== null &&
      (typeof b.parentCommentId !== 'string' || !b.parentCommentId.trim())
    )
      return error(reply, r, 400, 'VALIDATION_ERROR', 'Invalid parent comment');
    const parentCommentId =
      typeof b.parentCommentId === 'string' ? b.parentCommentId : null;
    if (parentCommentId) {
      const parent = await o.repository.getCommentAny(parentCommentId);
      if (!parent || parent.postId !== post.id)
        return error(reply, r, 404, 'NOT_FOUND', 'Parent comment not found');
    }
    const c = await o.repository.createComment({
      postId: post.id,
      authorId: ctx.userId,
      contentMarkdown: b.contentMarkdown,
      parentCommentId,
    });
    await audit(ctx, 'COMMENT_CREATED', c.id, r);
    return reply.status(201).send((await projectComments([c], ctx))[0]);
  });
  app.patch('/api/discussion/comments/:id', async (r, reply) => {
    const ctx = await auth(r);
    if (!ctx)
      return error(reply, r, 401, 'UNAUTHENTICATED', 'Authentication required');
    if (!csrf(r))
      return error(reply, r, 403, 'CSRF_INVALID', 'CSRF validation failed');
    const b = r.body as any;
    if (!text(b?.contentMarkdown, 20_000))
      return error(
        reply,
        r,
        400,
        'VALIDATION_ERROR',
        'Invalid comment content',
      );
    const c = await o.repository.getComment((r.params as any).id);
    if (!c) return error(reply, r, 404, 'NOT_FOUND', 'Comment not found');
    if (
      c.authorId !== ctx.userId &&
      !(await can(ctx, 'discussion:comment:moderate'))
    )
      return error(reply, r, 403, 'FORBIDDEN', 'Comment ownership required');
    const updated = await o.repository.updateComment(
      c.id,
      b.contentMarkdown,
      ctx.userId,
    );
    return updated
      ? reply.send((await projectComments([updated], ctx))[0])
      : error(reply, r, 404, 'NOT_FOUND', 'Comment not found');
  });
  app.delete('/api/discussion/comments/:id', async (r, reply) => {
    const ctx = await auth(r);
    if (!ctx)
      return error(reply, r, 401, 'UNAUTHENTICATED', 'Authentication required');
    if (!csrf(r))
      return error(reply, r, 403, 'CSRF_INVALID', 'CSRF validation failed');
    const id = (r.params as any).id;
    const c = await o.repository.getComment(id);
    if (!c) return error(reply, r, 404, 'NOT_FOUND', 'Comment not found');
    if (
      c.authorId !== ctx.userId &&
      !(await can(ctx, 'discussion:comment:moderate'))
    )
      return error(reply, r, 403, 'FORBIDDEN', 'Comment ownership required');
    const deleted = await o.repository.tombstoneComment(id);
    return deleted
      ? reply.send((await projectComments([deleted], ctx))[0])
      : error(reply, r, 404, 'NOT_FOUND', 'Comment not found');
  });
  app.post('/api/discussion/comments/:id/likes', async (r, reply) => {
    const ctx = await auth(r);
    if (!ctx)
      return error(reply, r, 401, 'UNAUTHENTICATED', 'Authentication required');
    if (!csrf(r))
      return error(reply, r, 403, 'CSRF_INVALID', 'CSRF validation failed');
    const comment = await o.repository.getComment((r.params as any).id);
    if (!comment) return error(reply, r, 404, 'NOT_FOUND', 'Comment not found');
    const post = await o.repository.get(comment.postId);
    if (!post || post.status !== 'PUBLISHED')
      return error(reply, r, 404, 'NOT_FOUND', 'Comment not found');
    const created = await o.repository.likeComment(comment.id, ctx.userId);
    const updated = await o.repository.getComment(comment.id, ctx.userId);
    return reply.status(created ? 201 : 200).send({
      liked: true,
      created,
      likeCount: updated?.likeCount ?? comment.likeCount,
    });
  });
  app.delete('/api/discussion/comments/:id/likes', async (r, reply) => {
    const ctx = await auth(r);
    if (!ctx)
      return error(reply, r, 401, 'UNAUTHENTICATED', 'Authentication required');
    if (!csrf(r))
      return error(reply, r, 403, 'CSRF_INVALID', 'CSRF validation failed');
    const comment = await o.repository.getComment((r.params as any).id);
    if (!comment) return error(reply, r, 404, 'NOT_FOUND', 'Comment not found');
    const post = await o.repository.get(comment.postId);
    if (!post || post.status !== 'PUBLISHED')
      return error(reply, r, 404, 'NOT_FOUND', 'Comment not found');
    await o.repository.unlikeComment(comment.id, ctx.userId);
    const updated = await o.repository.getComment(comment.id, ctx.userId);
    return reply.send({
      liked: false,
      likeCount: updated?.likeCount ?? 0,
    });
  });
  app.post('/api/discussion/posts/:id/likes', async (r, reply) => {
    const ctx = await auth(r);
    if (!ctx)
      return error(reply, r, 401, 'UNAUTHENTICATED', 'Authentication required');
    if (!csrf(r))
      return error(reply, r, 403, 'CSRF_INVALID', 'CSRF validation failed');
    const p = await o.repository.get((r.params as any).id);
    if (!p || p.status !== 'PUBLISHED')
      return error(reply, r, 404, 'NOT_FOUND', 'Post not found');
    const created = await o.repository.like(p.id, ctx.userId);
    return reply.status(created ? 201 : 200).send({ liked: true, created });
  });
  app.delete('/api/discussion/posts/:id/likes', async (r, reply) => {
    const ctx = await auth(r);
    if (!ctx)
      return error(reply, r, 401, 'UNAUTHENTICATED', 'Authentication required');
    if (!csrf(r))
      return error(reply, r, 403, 'CSRF_INVALID', 'CSRF validation failed');
    const p = await o.repository.get((r.params as any).id);
    if (!p || p.status !== 'PUBLISHED')
      return error(reply, r, 404, 'NOT_FOUND', 'Post not found');
    await o.repository.unlike(p.id, ctx.userId);
    return reply.status(204).send();
  });
}
