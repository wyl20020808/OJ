/* eslint-disable @typescript-eslint/no-explicit-any -- database rows are normalized at module boundary. */
import { randomUUID } from 'node:crypto';
import type {
  DiscussionComment,
  DiscussionPost,
  DiscussionPostStatus,
  DiscussionPostType,
} from './model.js';

type Query = { rows: Record<string, any>[]; rowCount?: number | null };
type Db = { query(sql: string, values?: unknown[]): Promise<Query> };
export class DiscussionCursorValidationError extends Error {
  constructor(message = 'Invalid discussion cursor') {
    super(message);
    this.name = 'DiscussionCursorValidationError';
  }
}
export type DiscussionRepository = {
  list(input: {
    status?: DiscussionPostStatus;
    type?: DiscussionPostType;
    authorId?: string;
    q?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: DiscussionPost[]; nextCursor?: string }>;
  get(key: string): Promise<DiscussionPost | null>;
  create(input: {
    authorId: string;
    type: DiscussionPostType;
    title: string;
    summary?: string;
    contentMarkdown: string;
    status: DiscussionPostStatus;
  }): Promise<DiscussionPost>;
  update(
    id: string,
    input: {
      title?: string;
      summary?: string | null;
      contentMarkdown?: string;
      type?: DiscussionPostType;
    },
  ): Promise<DiscussionPost | null>;
  publish(id: string): Promise<DiscussionPost | null>;
  tombstone(id: string, actorId: string): Promise<DiscussionPost | null>;
  incrementViews(id: string): Promise<void>;
  listComments(
    postId: string,
    cursor?: string,
    limit?: number,
    viewerId?: string,
  ): Promise<{ items: DiscussionComment[]; nextCursor?: string }>;
  getComment(id: string, viewerId?: string): Promise<DiscussionComment | null>;
  getCommentAny(id: string): Promise<DiscussionComment | null>;
  createComment(input: {
    postId: string;
    authorId: string;
    contentMarkdown: string;
    parentCommentId?: string | null;
  }): Promise<DiscussionComment>;
  updateComment(
    id: string,
    contentMarkdown: string,
    viewerId?: string,
  ): Promise<DiscussionComment | null>;
  tombstoneComment(id: string): Promise<DiscussionComment | null>;
  like(postId: string, userId: string): Promise<boolean>;
  unlike(postId: string, userId: string): Promise<boolean>;
  likeComment(commentId: string, userId: string): Promise<boolean>;
  unlikeComment(commentId: string, userId: string): Promise<boolean>;
};
const enc = (v: unknown) =>
  Buffer.from(JSON.stringify(v)).toString('base64url');
const decodeCursor = (
  value?: string,
): { sortAt: string; id: string } | undefined => {
  if (!value) return undefined;
  try {
    const p = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as any;
    if (
      !p ||
      typeof p.sortAt !== 'string' ||
      typeof p.id !== 'string' ||
      !p.id ||
      Number.isNaN(new Date(p.sortAt).getTime())
    )
      throw new Error();
    return { sortAt: new Date(p.sortAt).toISOString(), id: p.id };
  } catch {
    throw new DiscussionCursorValidationError();
  }
};
const postSortAt = (p: DiscussionPost) => p.publishedAt ?? p.updatedAt;
const postCursor = (items: DiscussionPost[]) => {
  const last = items.at(-1);
  return last ? enc({ sortAt: postSortAt(last), id: last.id }) : undefined;
};
const commentCursor = (items: DiscussionComment[]) => {
  const last = items.at(-1);
  return last ? enc({ sortAt: last.createdAt, id: last.id }) : undefined;
};
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const postKeyPredicate = (key: string) =>
  uuidPattern.test(key) ? 'id=$1' : 'public_id=$1';
const publicPost = (r: any): DiscussionPost => ({
  id: String(r.id),
  publicId: String(r.public_id ?? r.publicId),
  authorId: String(r.author_id ?? r.authorId),
  type: r.type,
  status: r.status,
  title: r.title,
  summary: r.summary ?? null,
  contentMarkdown:
    r.status === 'DELETED' ? '' : (r.content_markdown ?? r.contentMarkdown),
  publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
  createdAt: new Date(r.created_at ?? r.createdAt).toISOString(),
  updatedAt: new Date(r.updated_at ?? r.updatedAt).toISOString(),
  deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
  deletedBy: r.deleted_by ? String(r.deleted_by) : null,
  viewCount: Number(r.view_count ?? r.viewCount ?? 0),
  likeCount: Number(r.like_count ?? 0),
  commentCount: Number(r.comment_count ?? 0),
});
const publicComment = (r: any): DiscussionComment => ({
  id: String(r.id),
  postId: String(r.post_id ?? r.postId),
  authorId: String(r.author_id ?? r.authorId),
  parentCommentId: r.parent_comment_id
    ? String(r.parent_comment_id)
    : (r.parentCommentId ?? null),
  contentMarkdown:
    r.status === 'DELETED' ? '' : (r.content_markdown ?? r.contentMarkdown),
  status: r.status,
  createdAt: new Date(r.created_at ?? r.createdAt).toISOString(),
  updatedAt: new Date(r.updated_at ?? r.updatedAt).toISOString(),
  deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
  likeCount: Number(r.like_count ?? r.likeCount ?? 0),
  viewerLiked: Boolean(r.viewer_liked ?? r.viewerLiked ?? false),
});

export class InMemoryDiscussionRepository implements DiscussionRepository {
  posts = new Map<string, DiscussionPost>();
  comments = new Map<string, DiscussionComment>();
  likes = new Set<string>();
  commentLikes = new Set<string>();
  async list(i: {
    status?: DiscussionPostStatus;
    type?: DiscussionPostType;
    authorId?: string;
    q?: string;
    cursor?: string;
    limit: number;
  }) {
    const all = [...this.posts.values()]
      .filter((p) =>
        i.status ? p.status === i.status : p.status !== 'DELETED',
      )
      .filter((p) => !i.type || p.type === i.type)
      .filter((p) => !i.authorId || p.authorId === i.authorId)
      .filter((p) => !i.q || p.title.toLowerCase().includes(i.q.toLowerCase()))
      .sort(
        (a, b) =>
          postSortAt(b).localeCompare(postSortAt(a)) ||
          b.id.localeCompare(a.id),
      );
    const c = decodeCursor(i.cursor);
    const n = c
      ? all.findIndex(
          (p) =>
            postSortAt(p) < c.sortAt ||
            (postSortAt(p) === c.sortAt && p.id < c.id),
        )
      : 0;
    const from = n < 0 ? all.length : n;
    const items = all.slice(from, from + i.limit);
    const nextCursor =
      from + items.length < all.length ? postCursor(items) : undefined;
    return { items, ...(nextCursor ? { nextCursor } : {}) };
  }
  async get(key: string) {
    return (
      [...this.posts.values()].find(
        (p) => p.id === key || p.publicId === key,
      ) ?? null
    );
  }
  async create(i: any) {
    const now = new Date().toISOString();
    const id = randomUUID();
    const p: DiscussionPost = {
      id,
      publicId: `post-${id.slice(0, 8)}`,
      authorId: i.authorId,
      type: i.type,
      status: i.status,
      title: i.title,
      summary: i.summary ?? null,
      contentMarkdown: i.contentMarkdown,
      publishedAt: i.status === 'PUBLISHED' ? now : null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deletedBy: null,
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
    };
    this.posts.set(id, p);
    return p;
  }
  async update(id: string, i: any) {
    const p = await this.get(id);
    if (!p || p.status === 'DELETED') return null;
    Object.assign(p, i, { updatedAt: new Date().toISOString() });
    return p;
  }
  async publish(id: string) {
    const p = await this.get(id);
    if (!p || p.status === 'DELETED') return null;
    p.status = 'PUBLISHED';
    p.publishedAt ??= new Date().toISOString();
    p.updatedAt = new Date().toISOString();
    return p;
  }
  async tombstone(id: string, actorId: string) {
    const p = await this.get(id);
    if (!p) return null;
    p.status = 'DELETED';
    p.deletedAt = new Date().toISOString();
    p.deletedBy = actorId;
    p.updatedAt = p.deletedAt;
    return p;
  }
  async incrementViews(id: string) {
    const p = await this.get(id);
    if (p?.status === 'PUBLISHED') p.viewCount++;
  }
  async listComments(
    postId: string,
    value?: string,
    limit = 20,
    viewerId?: string,
  ) {
    const all = [...this.comments.values()]
      .filter(
        (c) =>
          c.postId === postId &&
          (c.status !== 'DELETED' ||
            [...this.comments.values()].some(
              (child) => child.parentCommentId === c.id && child.status === 'VISIBLE',
            )),
      )
      .map((c) => ({
        ...c,
        likeCount: [...this.commentLikes].filter((key) =>
          key.startsWith(`${c.id}:`),
        ).length,
        viewerLiked: viewerId
          ? this.commentLikes.has(`${c.id}:${viewerId}`)
          : false,
      }))
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
    const c = decodeCursor(value);
    const n = c
      ? all.findIndex(
          (x) =>
            x.createdAt > c.sortAt || (x.createdAt === c.sortAt && x.id > c.id),
        )
      : 0;
    const from = n < 0 ? all.length : n;
    const items = all.slice(from, from + limit);
    const nextCursor =
      from + items.length < all.length ? commentCursor(items) : undefined;
    return { items, ...(nextCursor ? { nextCursor } : {}) };
  }
  async getComment(id: string, viewerId?: string) {
    const comment = this.comments.get(id);
    if (!comment || comment.status === 'DELETED') return null;
    return {
      ...comment,
      likeCount: [...this.commentLikes].filter((key) =>
        key.startsWith(`${id}:`),
      ).length,
      viewerLiked: viewerId
        ? this.commentLikes.has(`${id}:${viewerId}`)
        : false,
    };
  }
  async getCommentAny(id: string) {
    return this.comments.get(id) ?? null;
  }
  async createComment(i: any) {
    const parent = i.parentCommentId
      ? await this.getCommentAny(i.parentCommentId)
      : null;
    if (i.parentCommentId && (!parent || parent.postId !== i.postId))
      throw new Error('Parent comment not found');
    const now = new Date().toISOString();
    const c: DiscussionComment = {
      id: randomUUID(),
      postId: i.postId,
      authorId: i.authorId,
      parentCommentId: i.parentCommentId ?? null,
      contentMarkdown: i.contentMarkdown,
      status: 'VISIBLE',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      likeCount: 0,
      viewerLiked: false,
    };
    this.comments.set(c.id, c);
    const p = await this.get(i.postId);
    if (p) p.commentCount++;
    return c;
  }
  async updateComment(id: string, contentMarkdown: string, viewerId?: string) {
    const c = this.comments.get(id);
    if (!c || c.status === 'DELETED') return null;
    c.contentMarkdown = contentMarkdown;
    c.updatedAt = new Date().toISOString();
    return this.getComment(id, viewerId);
  }
  async tombstoneComment(id: string) {
    const c = this.comments.get(id);
    if (!c || c.status === 'DELETED') return null;
    c.status = 'DELETED';
    c.deletedAt = new Date().toISOString();
    c.updatedAt = c.deletedAt;
    const p = await this.get(c.postId);
    if (p) p.commentCount = Math.max(0, p.commentCount - 1);
    return c;
  }
  async like(postId: string, userId: string) {
    const k = `${postId}:${userId}`;
    if (this.likes.has(k)) return false;
    this.likes.add(k);
    const p = await this.get(postId);
    if (p) p.likeCount++;
    return true;
  }
  async unlike(postId: string, userId: string) {
    const k = `${postId}:${userId}`;
    if (!this.likes.delete(k)) return false;
    const p = await this.get(postId);
    if (p) p.likeCount = Math.max(0, p.likeCount - 1);
    return true;
  }
  async likeComment(commentId: string, userId: string) {
    const key = `${commentId}:${userId}`;
    if (this.commentLikes.has(key)) return false;
    this.commentLikes.add(key);
    return true;
  }
  async unlikeComment(commentId: string, userId: string) {
    return this.commentLikes.delete(`${commentId}:${userId}`);
  }
}

export class PostgresDiscussionRepository implements DiscussionRepository {
  constructor(private readonly db: Db) {}
  async list(i: any) {
    const v: any[] = [];
    const w: string[] = [];
    if (i.status) {
      v.push(i.status);
      w.push(`p.status=$${v.length}`);
    } else w.push("p.status <> 'DELETED'");
    if (i.type) {
      v.push(i.type);
      w.push(`p.type=$${v.length}`);
    }
    if (i.authorId) {
      v.push(i.authorId);
      w.push(`p.author_id=$${v.length}`);
    }
    if (i.q) {
      v.push(`%${i.q}%`);
      w.push(`p.title ILIKE $${v.length}`);
    }
    const c = decodeCursor(i.cursor);
    if (c) {
      v.push(c.sortAt, c.id);
      w.push(
        `(COALESCE(p.published_at,p.updated_at),p.id) < ($${v.length - 1},$${v.length})`,
      );
    }
    const limit = Math.min(100, Math.max(1, i.limit));
    v.push(limit + 1);
    const r = await this.db.query(
      `SELECT p.*, (SELECT count(*) FROM discussion_post_likes l WHERE l.post_id=p.id)::int like_count, (SELECT count(*) FROM discussion_comments c WHERE c.post_id=p.id AND c.status='VISIBLE')::int comment_count FROM discussion_posts p WHERE ${w.join(' AND ')} ORDER BY COALESCE(p.published_at,p.updated_at) DESC,p.id DESC LIMIT $${v.length}`,
      v,
    );
    const items = r.rows.slice(0, limit).map(publicPost);
    const nextCursor = r.rows.length > limit ? postCursor(items) : undefined;
    return { items, ...(nextCursor ? { nextCursor } : {}) };
  }
  async get(key: string) {
    const r = await this.db.query(
      `SELECT p.*, (SELECT count(*) FROM discussion_post_likes l WHERE l.post_id=p.id)::int like_count, (SELECT count(*) FROM discussion_comments c WHERE c.post_id=p.id AND c.status='VISIBLE')::int comment_count FROM discussion_posts p WHERE p.${postKeyPredicate(key)} LIMIT 1`,
      [key],
    );
    return r.rows[0] ? publicPost(r.rows[0]) : null;
  }
  async create(i: any) {
    const r = await this.db.query(
      "INSERT INTO discussion_posts(public_id,author_id,type,status,title,summary,content_markdown,published_at) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $4='PUBLISHED' THEN now() END) RETURNING *",
      [
        `post-${randomUUID().slice(0, 8)}`,
        i.authorId,
        i.type,
        i.status,
        i.title,
        i.summary ?? null,
        i.contentMarkdown,
      ],
    );
    return publicPost(r.rows[0]);
  }
  async update(id: string, i: any) {
    const r = await this.db.query(
      `UPDATE discussion_posts SET title=COALESCE($2,title),summary=COALESCE($3,summary),content_markdown=COALESCE($4,content_markdown),type=COALESCE($5,type),updated_at=now() WHERE ${postKeyPredicate(id)} AND status<>'DELETED' RETURNING *`,
      [
        id,
        i.title ?? null,
        i.summary ?? null,
        i.contentMarkdown ?? null,
        i.type ?? null,
      ],
    );
    return r.rows[0] ? publicPost(r.rows[0]) : null;
  }
  async publish(id: string) {
    const r = await this.db.query(
      `UPDATE discussion_posts SET status='PUBLISHED',published_at=COALESCE(published_at,now()),updated_at=now() WHERE ${postKeyPredicate(id)} AND status<>'DELETED' RETURNING *`,
      [id],
    );
    return r.rows[0] ? publicPost(r.rows[0]) : null;
  }
  async tombstone(id: string, a: string) {
    const r = await this.db.query(
      `UPDATE discussion_posts SET status='DELETED',deleted_at=now(),deleted_by=$2,updated_at=now() WHERE ${postKeyPredicate(id)} AND status<>'DELETED' RETURNING *`,
      [id, a],
    );
    return r.rows[0] ? publicPost(r.rows[0]) : null;
  }
  async incrementViews(id: string) {
    await this.db.query(
      `UPDATE discussion_posts SET view_count=view_count+1 WHERE ${postKeyPredicate(id)} AND status='PUBLISHED'`,
      [id],
    );
  }
  async listComments(
    postId: string,
    value?: string,
    limit = 20,
    viewerId?: string,
  ) {
    const c = decodeCursor(value);
    const p: any[] = [postId, viewerId ?? null];
    let pred = '';
    if (c) {
      p.push(c.sortAt, c.id);
      pred = ` AND (c.created_at,c.id) > ($${p.length - 1},$${p.length})`;
    }
    const size = Math.min(100, Math.max(1, limit));
    p.push(size + 1);
    const r = await this.db.query(
      `SELECT c.*,
        (SELECT count(*) FROM discussion_comment_likes l WHERE l.comment_id=c.id)::int like_count,
        CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS(
          SELECT 1 FROM discussion_comment_likes l WHERE l.comment_id=c.id AND l.user_id=$2
        ) END viewer_liked
       FROM discussion_comments c
       WHERE c.post_id=$1
         AND (c.status='VISIBLE' OR EXISTS(
           SELECT 1 FROM discussion_comments child
           WHERE child.parent_comment_id=c.id AND child.status='VISIBLE'
         ))${pred}
       ORDER BY c.created_at ASC,c.id ASC LIMIT $${p.length}`,
      p,
    );
    const items = r.rows.slice(0, size).map(publicComment);
    const nextCursor = r.rows.length > size ? commentCursor(items) : undefined;
    return { items, ...(nextCursor ? { nextCursor } : {}) };
  }
  async getComment(id: string, viewerId?: string) {
    const r = await this.db.query(
      `SELECT c.*,
        (SELECT count(*) FROM discussion_comment_likes l WHERE l.comment_id=c.id)::int like_count,
        CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS(
          SELECT 1 FROM discussion_comment_likes l WHERE l.comment_id=c.id AND l.user_id=$2
        ) END viewer_liked
       FROM discussion_comments c WHERE c.id=$1 AND c.status='VISIBLE'`,
      [id, viewerId ?? null],
    );
    return r.rows[0] ? publicComment(r.rows[0]) : null;
  }
  async getCommentAny(id: string) {
    const r = await this.db.query(
      'SELECT * FROM discussion_comments WHERE id=$1',
      [id],
    );
    return r.rows[0] ? publicComment(r.rows[0]) : null;
  }
  async createComment(i: any) {
    if (i.parentCommentId) {
      const parent = await this.getCommentAny(i.parentCommentId);
      if (!parent || parent.postId !== i.postId)
        throw new Error('Parent comment not found');
    }
    const r = await this.db.query(
      'INSERT INTO discussion_comments(post_id,author_id,parent_comment_id,content_markdown) VALUES($1,$2,$3,$4) RETURNING *',
      [i.postId, i.authorId, i.parentCommentId ?? null, i.contentMarkdown],
    );
    return publicComment(r.rows[0]);
  }
  async updateComment(id: string, c: string, viewerId?: string) {
    const r = await this.db.query(
      "UPDATE discussion_comments SET content_markdown=$2,updated_at=now() WHERE id=$1 AND status='VISIBLE' RETURNING *",
      [id, c],
    );
    return r.rows[0] ? this.getComment(id, viewerId) : null;
  }
  async tombstoneComment(id: string) {
    const r = await this.db.query(
      "UPDATE discussion_comments SET status='DELETED',deleted_at=now(),updated_at=now() WHERE id=$1 AND status='VISIBLE' RETURNING *",
      [id],
    );
    return r.rows[0] ? publicComment(r.rows[0]) : null;
  }
  async like(postId: string, userId: string) {
    const r = await this.db.query(
      'INSERT INTO discussion_post_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [postId, userId],
    );
    return (r.rowCount ?? 0) > 0;
  }
  async unlike(postId: string, userId: string) {
    const r = await this.db.query(
      'DELETE FROM discussion_post_likes WHERE post_id=$1 AND user_id=$2',
      [postId, userId],
    );
    return (r.rowCount ?? 0) > 0;
  }
  async likeComment(commentId: string, userId: string) {
    const r = await this.db.query(
      'INSERT INTO discussion_comment_likes(comment_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [commentId, userId],
    );
    return (r.rowCount ?? 0) > 0;
  }
  async unlikeComment(commentId: string, userId: string) {
    const r = await this.db.query(
      'DELETE FROM discussion_comment_likes WHERE comment_id=$1 AND user_id=$2',
      [commentId, userId],
    );
    return (r.rowCount ?? 0) > 0;
  }
}
