/* eslint-disable @typescript-eslint/no-explicit-any -- Fastify boundary payloads are validated here. */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthContext } from '../auth/types.js';
import { DiscussionCursorValidationError, type DiscussionRepository } from './repository.js';
import type { DiscussionPostType } from './model.js';

export type DiscussionModuleOptions = {
  repository: DiscussionRepository;
  getAuthContext: (request: FastifyRequest) => Promise<AuthContext | undefined>;
  hasCapability?: (userId: string, capability: string) => Promise<boolean>;
  getAuthor?: (userId: string) => Promise<{ id: string; username: string; displayName: string; avatarUrl?: string } | null>;
  audit?: { record(event: { actorUserId: string; action: string; resource: string; resourceId?: string; outcome: 'allowed' | 'denied'; requestId: string; occurredAt: string }): Promise<void> | void };
};
const csrf = (r: FastifyRequest) => { const t = r.headers['x-csrf-token']; return typeof t === 'string' && r.headers.cookie?.split(';').some(v => v.trim() === `oj_csrf=${t}`); };
const error = (reply: FastifyReply, request: FastifyRequest, status: number, code: string, message: string) => reply.status(status).send({ code, message, requestId: request.id });
const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const page = (q: any) => { const n = Number(q.limit ?? 20); return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null; };

export async function registerDiscussionModule(app: FastifyInstance, o: DiscussionModuleOptions) {
  const auth = (r: FastifyRequest) => o.getAuthContext(r);
  const can = async (ctx: AuthContext | undefined, capability: string) => Boolean(ctx?.strength === 'password' && ctx.userId && await o.hasCapability?.(ctx.userId, capability));
  const audit = (ctx: AuthContext, action: string, id: string, r: FastifyRequest) => o.audit?.record({ actorUserId: ctx.userId, action, resource: 'discussion', resourceId: id, outcome: 'allowed', requestId: r.id, occurredAt: new Date().toISOString() });
  const ownerOr = async (ctx: AuthContext | undefined, post: any, capability: string) => Boolean(ctx && (ctx.userId === post.authorId || await can(ctx, capability)));
  const getAuthor = o.getAuthor;
  const safeAuthor = (author: { id: string; username: string; displayName: string; avatarUrl?: string } | null) => author ? ({ username: author.username, displayName: author.displayName, ...(author.avatarUrl ? { avatarUrl: author.avatarUrl } : {}) }) : { username: 'deleted-user', displayName: 'Deleted User' };
  const postCapabilities = async (ctx: AuthContext | undefined, post: any) => {
    const owner = Boolean(ctx?.userId && ctx.userId === post.authorId);
    const canModerate = await can(ctx, 'discussion:post:moderate');
    const announcementAllowed = post.type !== 'ANNOUNCEMENT' || await can(ctx, 'discussion:announcement:create');
    const active = post.status !== 'DELETED';
    return { canEdit: active && announcementAllowed && (owner || canModerate), canDelete: active && (owner || canModerate), canModerate };
  };
  const commentCapabilities = async (ctx: AuthContext | undefined, comment: any) => {
    const owner = Boolean(ctx?.userId && ctx.userId === comment.authorId);
    const canModerate = await can(ctx, 'discussion:comment:moderate');
    const active = comment.status !== 'DELETED';
    return { canEdit: active && (owner || canModerate), canDelete: active && (owner || canModerate), canModerate };
  };
  const projectPost = async (post: any, ctx?: AuthContext, includeCapabilities = false) => { const publicPost = { ...post }; delete publicPost.authorId; return { ...publicPost, ...(getAuthor ? { author: safeAuthor(await getAuthor(post.authorId)) } : {}), ...(includeCapabilities ? { capabilities: await postCapabilities(ctx, post) } : {}) }; };
  const projectComments = async (items: any[], ctx?: AuthContext) => Promise.all(items.map(async item => { const publicComment = { ...item }; delete publicComment.authorId; return { ...publicComment, ...(getAuthor ? { author: safeAuthor(await getAuthor(item.authorId)) } : {}), capabilities: await commentCapabilities(ctx, item) }; }));
  app.get('/api/discussion/posts', async (r, reply) => {
    const ctx = await auth(r); const q = r.query as any; const limit = page(q); if (!limit) return error(reply, r, 400, 'VALIDATION_ERROR', 'Invalid limit');
    const own = q.mine === 'true';
    if (own && !ctx) return error(reply, r, 401, 'UNAUTHENTICATED', 'Authentication required');
    try { const result = await o.repository.list({ limit, ...(typeof q.cursor === 'string' ? { cursor: q.cursor } : {}), ...(q.type === 'ARTICLE' || q.type === 'ANNOUNCEMENT' ? { type: q.type } : {}), ...(own && ctx ? { authorId: ctx.userId } : {}), ...(typeof q.q === 'string' ? { q: q.q.slice(0, 80) } : {}), status: own ? (q.status === 'DRAFT' ? 'DRAFT' : q.status === 'DELETED' ? 'DELETED' : 'PUBLISHED') : 'PUBLISHED' }); return reply.send({ ...result, items: await Promise.all(result.items.map(item => projectPost(item))) }); } catch (e) { if (e instanceof DiscussionCursorValidationError) return error(reply, r, 400, 'VALIDATION_ERROR', e.message); throw e; }
  });
  app.post('/api/discussion/posts', async (r, reply) => {
    const ctx = await auth(r); if (!ctx) return error(reply, r, 401, 'UNAUTHENTICATED', 'Authentication required'); if (!csrf(r)) return error(reply, r, 403, 'CSRF_INVALID', 'CSRF validation failed');
    const b = r.body as any; const type: DiscussionPostType = b?.type === 'ANNOUNCEMENT' ? 'ANNOUNCEMENT' : 'ARTICLE';
    if (type === 'ANNOUNCEMENT' && !(await can(ctx, 'discussion:announcement:create'))) return error(reply, r, 403, 'FORBIDDEN', 'Announcement capability required');
    if (!text(b?.title, 240) || typeof b?.contentMarkdown !== 'string' || b.contentMarkdown.length > 500_000) return error(reply, r, 400, 'VALIDATION_ERROR', 'Invalid post content');
    const status = b.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'; const post = await o.repository.create({ authorId: ctx.userId, type, title: b.title.trim(), summary: typeof b.summary === 'string' ? b.summary.slice(0, 1000) : undefined, contentMarkdown: b.contentMarkdown, status }); await audit(ctx, status === 'PUBLISHED' ? 'POST_PUBLISHED' : 'POST_CREATED', post.id, r); return reply.status(201).send(await projectPost(post, ctx, true));
  });
  app.get('/api/discussion/posts/:id', async (r, reply) => {
    const key = (r.params as any).id; const post = await o.repository.get(key); if (!post || post.status === 'DELETED') return error(reply, r, 404, 'NOT_FOUND', 'Post not found'); const ctx = await auth(r);
    if (post.status !== 'PUBLISHED' && !(await ownerOr(ctx, post, 'discussion:post:moderate'))) return error(reply, r, 404, 'NOT_FOUND', 'Post not found');
    if (post.status === 'PUBLISHED') await o.repository.incrementViews(post.id);
    return reply.send(await projectPost({ ...post, viewCount: post.viewCount + (post.status === 'PUBLISHED' ? 1 : 0) }, ctx, true));
  });
  app.patch('/api/discussion/posts/:id', async (r, reply) => {
    const ctx = await auth(r); if (!ctx) return error(reply, r, 401, 'UNAUTHENTICATED', 'Authentication required'); if (!csrf(r)) return error(reply, r, 403, 'CSRF_INVALID', 'CSRF validation failed'); const key=(r.params as any).id; const post=await o.repository.get(key); if(!post||post.status==='DELETED')return error(reply,r,404,'NOT_FOUND','Post not found'); if(!(await ownerOr(ctx,post,'discussion:post:moderate')))return error(reply,r,403,'FORBIDDEN','Post ownership required'); const b=r.body as any; if(b.type==='ANNOUNCEMENT'&&!(await can(ctx,'discussion:announcement:create')))return error(reply,r,403,'FORBIDDEN','Announcement capability required'); const updated=await o.repository.update(post.id,{title:typeof b.title==='string'?b.title.trim():undefined,summary:typeof b.summary==='string'?b.summary.slice(0,1000):undefined,contentMarkdown:typeof b.contentMarkdown==='string'?b.contentMarkdown:undefined,type:b.type==='ARTICLE'||b.type==='ANNOUNCEMENT'?b.type:undefined}); return updated?reply.send(await projectPost(updated, ctx, true)):error(reply,r,404,'NOT_FOUND','Post not found');
  });
  app.post('/api/discussion/posts/:id/publish', async (r, reply) => { const ctx=await auth(r); if(!ctx)return error(reply,r,401,'UNAUTHENTICATED','Authentication required');if(!csrf(r))return error(reply,r,403,'CSRF_INVALID','CSRF validation failed');const post=await o.repository.get((r.params as any).id);if(!post)return error(reply,r,404,'NOT_FOUND','Post not found');if(!(await ownerOr(ctx,post,'discussion:post:moderate')))return error(reply,r,403,'FORBIDDEN','Post ownership required');if(post.type==='ANNOUNCEMENT'&&!(await can(ctx,'discussion:announcement:create')))return error(reply,r,403,'FORBIDDEN','Announcement capability required');const p=await o.repository.publish(post.id);if(p)await audit(ctx,'POST_PUBLISHED',p.id,r);return p?reply.send(await projectPost(p, ctx, true)):error(reply,r,404,'NOT_FOUND','Post not found'); });
  app.delete('/api/discussion/posts/:id', async (r, reply) => { const ctx=await auth(r);if(!ctx)return error(reply,r,401,'UNAUTHENTICATED','Authentication required');if(!csrf(r))return error(reply,r,403,'CSRF_INVALID','CSRF validation failed');const post=await o.repository.get((r.params as any).id);if(!post)return error(reply,r,404,'NOT_FOUND','Post not found');if(!(await ownerOr(ctx,post,'discussion:post:moderate')))return error(reply,r,403,'FORBIDDEN','Post ownership required');const p=await o.repository.tombstone(post.id,ctx.userId);if(p)await audit(ctx,'POST_DELETED',p.id,r);return p?reply.send(await projectPost(p, ctx, true)):error(reply,r,404,'NOT_FOUND','Post not found'); });
  app.get('/api/discussion/posts/:id/comments', async (r, reply) => { const ctx=await auth(r); const post=await o.repository.get((r.params as any).id);if(!post||post.status!=='PUBLISHED')return error(reply,r,404,'NOT_FOUND','Post not found');const q=r.query as any;const limit=page(q);if(!limit)return error(reply,r,400,'VALIDATION_ERROR','Invalid limit');try { const result=await o.repository.listComments(post.id,typeof q.cursor==='string'?q.cursor:undefined,limit);return reply.send({ ...result, items: await projectComments(result.items, ctx) }); } catch (e) { if (e instanceof DiscussionCursorValidationError) return error(reply, r, 400, 'VALIDATION_ERROR', e.message); throw e; } });
  app.post('/api/discussion/posts/:id/comments', async (r, reply) => { const ctx=await auth(r);if(!ctx)return error(reply,r,401,'UNAUTHENTICATED','Authentication required');if(!csrf(r))return error(reply,r,403,'CSRF_INVALID','CSRF validation failed');const post=await o.repository.get((r.params as any).id);if(!post||post.status!=='PUBLISHED')return error(reply,r,404,'NOT_FOUND','Post not found');const b=r.body as any;if(!text(b?.contentMarkdown,20_000))return error(reply,r,400,'VALIDATION_ERROR','Invalid comment content');const c=await o.repository.createComment({postId:post.id,authorId:ctx.userId,contentMarkdown:b.contentMarkdown,parentCommentId:typeof b.parentCommentId==='string'?b.parentCommentId:null});await audit(ctx,'COMMENT_CREATED',c.id,r);return reply.status(201).send((await projectComments([c], ctx))[0]); });
  app.patch('/api/discussion/comments/:id', async (r, reply) => { const ctx=await auth(r);if(!ctx)return error(reply,r,401,'UNAUTHENTICATED','Authentication required');if(!csrf(r))return error(reply,r,403,'CSRF_INVALID','CSRF validation failed');const b=r.body as any;if(!text(b?.contentMarkdown,20_000))return error(reply,r,400,'VALIDATION_ERROR','Invalid comment content');const c=await o.repository.getComment((r.params as any).id);if(!c)return error(reply,r,404,'NOT_FOUND','Comment not found');if(c.authorId!==ctx.userId&&!(await can(ctx,'discussion:comment:moderate')))return error(reply,r,403,'FORBIDDEN','Comment ownership required');const updated=await o.repository.updateComment(c.id,b.contentMarkdown);return updated?reply.send((await projectComments([updated], ctx))[0]):error(reply,r,404,'NOT_FOUND','Comment not found'); });
  app.delete('/api/discussion/comments/:id', async (r, reply) => { const ctx=await auth(r);if(!ctx)return error(reply,r,401,'UNAUTHENTICATED','Authentication required');if(!csrf(r))return error(reply,r,403,'CSRF_INVALID','CSRF validation failed');const id=(r.params as any).id;const c=await o.repository.getComment(id);if(!c)return error(reply,r,404,'NOT_FOUND','Comment not found');if(c.authorId!==ctx.userId&&!(await can(ctx,'discussion:comment:moderate')))return error(reply,r,403,'FORBIDDEN','Comment ownership required');const deleted=await o.repository.tombstoneComment(id);return deleted?reply.send((await projectComments([deleted], ctx))[0]):error(reply,r,404,'NOT_FOUND','Comment not found'); });
  app.post('/api/discussion/posts/:id/likes', async (r, reply) => { const ctx=await auth(r);if(!ctx)return error(reply,r,401,'UNAUTHENTICATED','Authentication required');if(!csrf(r))return error(reply,r,403,'CSRF_INVALID','CSRF validation failed');const p=await o.repository.get((r.params as any).id);if(!p||p.status!=='PUBLISHED')return error(reply,r,404,'NOT_FOUND','Post not found');const created=await o.repository.like(p.id,ctx.userId);return reply.status(created?201:200).send({liked:true,created}); });
  app.delete('/api/discussion/posts/:id/likes', async (r, reply) => { const ctx=await auth(r);if(!ctx)return error(reply,r,401,'UNAUTHENTICATED','Authentication required');if(!csrf(r))return error(reply,r,403,'CSRF_INVALID','CSRF validation failed');const p=await o.repository.get((r.params as any).id);if(!p||p.status!=='PUBLISHED')return error(reply,r,404,'NOT_FOUND','Post not found');await o.repository.unlike(p.id,ctx.userId);return reply.status(204).send(); });
}
