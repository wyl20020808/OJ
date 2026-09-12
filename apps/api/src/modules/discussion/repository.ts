/* eslint-disable @typescript-eslint/no-explicit-any -- database rows are normalized at module boundary. */
import { randomUUID } from 'node:crypto';
import type {
  DiscussionCategory,
  DiscussionComment,
  DiscussionPost,
  DiscussionPostKind,
  DiscussionPostStatus,
  DiscussionPostType,
  DiscussionTag,
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
    kind?: DiscussionPostKind;
    category?: string;
    tag?: string;
    authorId?: string;
    q?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: DiscussionPost[]; nextCursor?: string }>;
  get(key: string, viewerId?: string): Promise<DiscussionPost | null>;
  create(input: {
    authorId: string;
    type: DiscussionPostType;
    kind?: DiscussionPostKind;
    title: string;
    summary?: string;
    contentMarkdown: string;
    status: DiscussionPostStatus;
    categorySlug?: string;
    tagSlugs?: string[];
    coverImageUrl?: string | null;
  }): Promise<DiscussionPost>;
  update(
    id: string,
    input: {
      title?: string;
      summary?: string | null;
      contentMarkdown?: string;
      type?: DiscussionPostType;
      kind?: DiscussionPostKind;
      categorySlug?: string | null;
      tagSlugs?: string[];
      coverImageUrl?: string | null;
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
  getBlogOverview(): Promise<DiscussionBlogOverviewData>;
};
export type DiscussionBlogOverviewData = {
  featured: DiscussionPost | null;
  hotPosts: DiscussionPost[];
  recommendedPosts: DiscussionPost[];
  categories: DiscussionCategory[];
  tags: DiscussionTag[];
  authorRanks: Array<{ authorId: string; postCount: number }>;
  stats: {
    todayPosts: number;
    weekPosts: number;
    totalAuthors: number;
    totalPosts: number;
  };
  recentComments: Array<
    DiscussionComment & { post: { publicId: string; title: string } }
  >;
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
const jsonValue = <T>(value: unknown, fallback: T): T => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};
const publicPost = (r: any): DiscussionPost => ({
  id: String(r.id),
  publicId: String(r.public_id ?? r.publicId),
  authorId: String(r.author_id ?? r.authorId),
  type: r.type,
  kind: r.kind ?? (r.type === 'ANNOUNCEMENT' ? 'ANNOUNCEMENT' : 'DISCUSSION'),
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
  category:
    r.category_slug || r.category?.slug
      ? {
          slug: String(r.category_slug ?? r.category?.slug),
          name: String(r.category_name ?? r.category?.name),
          description: String(
            r.category_description ?? r.category?.description ?? '',
          ),
          postCount: Number(
            r.category_post_count ?? r.category?.postCount ?? 0,
          ),
          dataOrigin:
            r.category_data_origin ?? r.category?.dataOrigin ?? 'SYSTEM',
        }
      : null,
  tags: jsonValue<any[]>(r.tags, []).map((tag) => ({
    slug: String(tag.slug),
    name: String(tag.name),
    postCount: Number(tag.postCount ?? tag.post_count ?? 0),
    dataOrigin: tag.dataOrigin ?? tag.data_origin ?? 'SYSTEM',
  })),
  coverImageUrl: r.cover_image_url ?? r.coverImageUrl ?? null,
  isFeatured: Boolean(r.is_featured ?? r.isFeatured ?? false),
  isPinned: Boolean(r.is_pinned ?? r.isPinned ?? false),
  dataOrigin: r.data_origin ?? r.dataOrigin ?? 'USER',
  viewerLiked: Boolean(r.viewer_liked ?? r.viewerLiked ?? false),
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
  dataOrigin: r.data_origin ?? r.dataOrigin ?? 'USER',
  likeCount: Number(r.like_count ?? r.likeCount ?? 0),
  viewerLiked: Boolean(r.viewer_liked ?? r.viewerLiked ?? false),
});

const postProjection = (viewerExpression = 'false') => `p.*,
  dc.slug category_slug,
  dc.name category_name,
  dc.description category_description,
  dc.data_origin category_data_origin,
  (SELECT count(*) FROM discussion_post_likes l WHERE l.post_id=p.id)::int like_count,
  (SELECT count(*) FROM discussion_comments c WHERE c.post_id=p.id AND c.status='VISIBLE')::int comment_count,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'slug', dt.slug,
      'name', dt.name,
      'postCount', 0,
      'dataOrigin', dt.data_origin
    ) ORDER BY dt.display_order,dt.name)
    FROM discussion_post_tags dpt
    JOIN discussion_tags dt ON dt.id=dpt.tag_id
    WHERE dpt.post_id=p.id AND dt.is_active=true
  ), '[]'::jsonb) tags,
  ${viewerExpression} viewer_liked`;

export class InMemoryDiscussionRepository implements DiscussionRepository {
  posts = new Map<string, DiscussionPost>();
  comments = new Map<string, DiscussionComment>();
  likes = new Set<string>();
  commentLikes = new Set<string>();
  async list(i: {
    status?: DiscussionPostStatus;
    type?: DiscussionPostType;
    kind?: DiscussionPostKind;
    category?: string;
    tag?: string;
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
      .filter(
        (p) =>
          !i.kind ||
          (p.kind ??
            (p.type === 'ANNOUNCEMENT' ? 'ANNOUNCEMENT' : 'DISCUSSION')) ===
            i.kind,
      )
      .filter((p) => !i.category || p.category?.slug === i.category)
      .filter((p) => !i.tag || (p.tags ?? []).some((tag) => tag.slug === i.tag))
      .filter((p) => !i.authorId || p.authorId === i.authorId)
      .filter((p) => {
        if (!i.q) return true;
        const query = i.q.toLowerCase();
        return [
          p.title,
          p.summary ?? '',
          p.contentMarkdown,
          p.category?.name ?? '',
          ...(p.tags ?? []).map((tag) => tag.name),
        ].some((value) => value.toLowerCase().includes(query));
      })
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
  async get(key: string, viewerId?: string) {
    const post =
      [...this.posts.values()].find(
        (p) => p.id === key || p.publicId === key,
      ) ?? null;
    if (!post) return null;
    if (!viewerId) return post;
    return {
      ...post,
      viewerLiked: this.likes.has(`${post.id}:${viewerId}`),
    };
  }
  async create(i: any) {
    const now = new Date().toISOString();
    const id = randomUUID();
    const p: DiscussionPost = {
      id,
      publicId: `post-${id.slice(0, 8)}`,
      authorId: i.authorId,
      type: i.type,
      kind:
        i.kind ?? (i.type === 'ANNOUNCEMENT' ? 'ANNOUNCEMENT' : 'DISCUSSION'),
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
      category: null,
      tags: [],
      coverImageUrl: i.coverImageUrl ?? null,
      isFeatured: false,
      isPinned: false,
      dataOrigin: 'USER',
      viewerLiked: false,
    };
    this.posts.set(id, p);
    return p;
  }
  async update(id: string, i: any) {
    const p = await this.get(id);
    if (!p || p.status === 'DELETED') return null;
    Object.assign(p, i, { updatedAt: new Date().toISOString() });
    if (i.type === 'ANNOUNCEMENT') p.kind = 'ANNOUNCEMENT';
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
              (child) =>
                child.parentCommentId === c.id && child.status === 'VISIBLE',
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
  async getBlogOverview(): Promise<DiscussionBlogOverviewData> {
    const published = [...this.posts.values()]
      .filter((post) => post.status === 'PUBLISHED')
      .sort(
        (a, b) =>
          postSortAt(b).localeCompare(postSortAt(a)) ||
          b.id.localeCompare(a.id),
      );
    const featured =
      published.find((post) => post.isFeatured) ?? published[0] ?? null;
    const hotPosts = [...published]
      .sort(
        (a, b) =>
          b.viewCount +
            b.commentCount * 20 +
            b.likeCount * 10 -
            (a.viewCount + a.commentCount * 20 + a.likeCount * 10) ||
          b.id.localeCompare(a.id),
      )
      .slice(0, 5);
    const recommendedPosts = [
      ...published.filter((post) => post.isFeatured || post.isPinned),
      ...published,
    ]
      .filter(
        (post, index, values) =>
          values.findIndex((candidate) => candidate.id === post.id) === index,
      )
      .slice(0, 6);
    const categoryCounts = new Map<string, DiscussionCategory>();
    const tagCounts = new Map<string, DiscussionTag>();
    const authorCounts = new Map<string, number>();
    for (const post of published) {
      if (post.category) {
        const category = categoryCounts.get(post.category.slug);
        categoryCounts.set(post.category.slug, {
          ...post.category,
          postCount: (category?.postCount ?? 0) + 1,
        });
      }
      for (const tag of post.tags ?? []) {
        const previous = tagCounts.get(tag.slug);
        tagCounts.set(tag.slug, {
          ...tag,
          postCount: (previous?.postCount ?? 0) + 1,
        });
      }
      authorCounts.set(
        post.authorId,
        (authorCounts.get(post.authorId) ?? 0) + 1,
      );
    }
    const now = Date.now();
    const recentComments = [...this.comments.values()]
      .filter((comment) => comment.status === 'VISIBLE')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .flatMap((comment) => {
        const post = this.posts.get(comment.postId);
        return post?.status === 'PUBLISHED'
          ? [
              {
                ...comment,
                post: { publicId: post.publicId, title: post.title },
              },
            ]
          : [];
      })
      .slice(0, 5);
    return {
      featured,
      hotPosts,
      recommendedPosts,
      categories: [...categoryCounts.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      tags: [...tagCounts.values()].sort(
        (a, b) => b.postCount - a.postCount || a.name.localeCompare(b.name),
      ),
      authorRanks: [...authorCounts]
        .map(([authorId, postCount]) => ({ authorId, postCount }))
        .sort(
          (a, b) =>
            b.postCount - a.postCount || a.authorId.localeCompare(b.authorId),
        )
        .slice(0, 5),
      stats: {
        todayPosts: published.filter(
          (post) =>
            now - new Date(post.publishedAt ?? post.createdAt).getTime() <
            86_400_000,
        ).length,
        weekPosts: published.filter(
          (post) =>
            now - new Date(post.publishedAt ?? post.createdAt).getTime() <
            604_800_000,
        ).length,
        totalAuthors: authorCounts.size,
        totalPosts: published.length,
      },
      recentComments,
    };
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
    if (i.kind) {
      v.push(i.kind);
      w.push(`p.kind=$${v.length}`);
    }
    if (i.category) {
      v.push(i.category);
      w.push(`dc.slug=$${v.length}`);
    }
    if (i.tag) {
      v.push(i.tag);
      w.push(
        `EXISTS(SELECT 1 FROM discussion_post_tags fpt JOIN discussion_tags ft ON ft.id=fpt.tag_id WHERE fpt.post_id=p.id AND ft.slug=$${v.length} AND ft.is_active=true)`,
      );
    }
    if (i.authorId) {
      v.push(i.authorId);
      w.push(`p.author_id=$${v.length}`);
    }
    if (i.q) {
      v.push(`%${i.q}%`);
      w.push(`(p.title ILIKE $${v.length}
        OR COALESCE(p.summary,'') ILIKE $${v.length}
        OR p.content_markdown ILIKE $${v.length}
        OR COALESCE(dc.name,'') ILIKE $${v.length}
        OR EXISTS(
          SELECT 1 FROM discussion_post_tags spt
          JOIN discussion_tags st ON st.id=spt.tag_id
          WHERE spt.post_id=p.id AND st.is_active=true
            AND (st.name ILIKE $${v.length} OR st.slug ILIKE $${v.length})
        ))`);
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
      `SELECT ${postProjection()}
       FROM discussion_posts p
       LEFT JOIN discussion_categories dc ON dc.id=p.category_id
       WHERE ${w.join(' AND ')}
       ORDER BY COALESCE(p.published_at,p.updated_at) DESC,p.id DESC
       LIMIT $${v.length}`,
      v,
    );
    const items = r.rows.slice(0, limit).map(publicPost);
    const nextCursor = r.rows.length > limit ? postCursor(items) : undefined;
    return { items, ...(nextCursor ? { nextCursor } : {}) };
  }
  async get(key: string, viewerId?: string) {
    const r = await this.db.query(
      `SELECT ${postProjection(
        `CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS(
          SELECT 1 FROM discussion_post_likes vl
          WHERE vl.post_id=p.id AND vl.user_id=$2
        ) END`,
      )}
       FROM discussion_posts p
       LEFT JOIN discussion_categories dc ON dc.id=p.category_id
       WHERE p.${postKeyPredicate(key)} LIMIT 1`,
      [key, viewerId ?? null],
    );
    return r.rows[0] ? publicPost(r.rows[0]) : null;
  }
  async create(i: any) {
    const r = await this.db.query(
      `WITH inserted AS (
         INSERT INTO discussion_posts(public_id,author_id,type,kind,status,title,summary,content_markdown,published_at,category_id,cover_image_url)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $5='PUBLISHED' THEN now() END,(SELECT id FROM discussion_categories WHERE slug=$9 AND is_active=true),$10)
         RETURNING *
       ), inserted_tags AS (
         INSERT INTO discussion_post_tags(post_id,tag_id)
         SELECT inserted.id,dt.id FROM inserted
         JOIN discussion_tags dt ON dt.slug = ANY($11::text[]) AND dt.is_active=true
         ON CONFLICT DO NOTHING
       )
       SELECT * FROM inserted`,
      [
        `post-${randomUUID().slice(0, 8)}`,
        i.authorId,
        i.type,
        i.kind ?? (i.type === 'ANNOUNCEMENT' ? 'ANNOUNCEMENT' : 'DISCUSSION'),
        i.status,
        i.title,
        i.summary ?? null,
        i.contentMarkdown,
        i.categorySlug ?? null,
        i.coverImageUrl ?? null,
        i.tagSlugs ?? [],
      ],
    );
    const created = r.rows[0];
    if (!created) throw new Error('Discussion post insert returned no row');
    return (await this.get(String(created.id))) ?? publicPost(created);
  }
  async update(id: string, i: any) {
    const r = await this.db.query(
      `WITH updated AS (
         UPDATE discussion_posts
         SET title=COALESCE($2,title),
             summary=COALESCE($3,summary),
             content_markdown=COALESCE($4,content_markdown),
             type=COALESCE($5,type),
             kind=COALESCE($6,kind),
             category_id=CASE WHEN $7::boolean THEN (SELECT id FROM discussion_categories WHERE slug=$8 AND is_active=true) ELSE category_id END,
             cover_image_url=CASE WHEN $9::boolean THEN $10 ELSE cover_image_url END,
             updated_at=now()
         WHERE ${postKeyPredicate(id)} AND status<>'DELETED'
         RETURNING id
       ), deleted_tags AS (
         DELETE FROM discussion_post_tags
         WHERE $11::boolean AND post_id=(SELECT id FROM updated)
       ), inserted_tags AS (
         INSERT INTO discussion_post_tags(post_id,tag_id)
         SELECT updated.id,dt.id FROM updated
         JOIN discussion_tags dt ON dt.slug = ANY($12::text[]) AND dt.is_active=true
         WHERE $11::boolean
         ON CONFLICT DO NOTHING
       )
       SELECT id FROM updated`,
      [
        id,
        i.title ?? null,
        i.summary ?? null,
        i.contentMarkdown ?? null,
        i.type ?? null,
        i.kind ?? (i.type === 'ANNOUNCEMENT' ? 'ANNOUNCEMENT' : null),
        i.categorySlug !== undefined,
        i.categorySlug ?? null,
        i.coverImageUrl !== undefined,
        i.coverImageUrl ?? null,
        i.tagSlugs !== undefined,
        i.tagSlugs ?? [],
      ],
    );
    return r.rows[0] ? this.get(String(r.rows[0].id)) : null;
  }
  async publish(id: string) {
    const r = await this.db.query(
      `UPDATE discussion_posts SET status='PUBLISHED',published_at=COALESCE(published_at,now()),updated_at=now() WHERE ${postKeyPredicate(id)} AND status<>'DELETED' RETURNING *`,
      [id],
    );
    return r.rows[0] ? this.get(String(r.rows[0].id)) : null;
  }
  async tombstone(id: string, a: string) {
    const r = await this.db.query(
      `UPDATE discussion_posts SET status='DELETED',deleted_at=now(),deleted_by=$2,updated_at=now() WHERE ${postKeyPredicate(id)} AND status<>'DELETED' RETURNING *`,
      [id, a],
    );
    return r.rows[0] ? this.get(String(r.rows[0].id)) : null;
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
  private async overviewPosts(orderBy: string, limit: number) {
    const result = await this.db.query(
      `SELECT ${postProjection()}
       FROM discussion_posts p
       LEFT JOIN discussion_categories dc ON dc.id=p.category_id
       WHERE p.status='PUBLISHED'
       ORDER BY ${orderBy}
       LIMIT $1`,
      [limit],
    );
    return result.rows.map(publicPost);
  }
  async getBlogOverview(): Promise<DiscussionBlogOverviewData> {
    const featuredRows = await this.overviewPosts(
      'p.is_featured DESC,p.is_pinned DESC,COALESCE(p.published_at,p.updated_at) DESC,p.id DESC',
      1,
    );
    const hotPosts = await this.overviewPosts(
      `(p.view_count
          + (SELECT count(*) FROM discussion_comments hc WHERE hc.post_id=p.id AND hc.status='VISIBLE') * 20
          + (SELECT count(*) FROM discussion_post_likes hl WHERE hl.post_id=p.id) * 10) DESC,
         COALESCE(p.published_at,p.updated_at) DESC,p.id DESC`,
      5,
    );
    const recommendedPosts = await this.overviewPosts(
      'p.is_featured DESC,p.is_pinned DESC,COALESCE(p.published_at,p.updated_at) DESC,p.id DESC',
      6,
    );
    const categoryRows = await this.db.query(
      `SELECT dc.slug,dc.name,dc.description,dc.data_origin,
          count(p.id) FILTER (WHERE p.status='PUBLISHED')::int post_count
         FROM discussion_categories dc
         LEFT JOIN discussion_posts p ON p.category_id=dc.id
         WHERE dc.is_active=true
         GROUP BY dc.id
         ORDER BY dc.display_order,dc.name`,
    );
    const tagRows = await this.db.query(
      `SELECT dt.slug,dt.name,dt.data_origin,
          count(p.id) FILTER (WHERE p.status='PUBLISHED')::int post_count
         FROM discussion_tags dt
         LEFT JOIN discussion_post_tags dpt ON dpt.tag_id=dt.id
         LEFT JOIN discussion_posts p ON p.id=dpt.post_id
         WHERE dt.is_active=true
         GROUP BY dt.id
         ORDER BY post_count DESC,dt.display_order,dt.name
         LIMIT 20`,
    );
    const authorRows = await this.db.query(
      `SELECT p.author_id,count(*)::int post_count
         FROM discussion_posts p
         WHERE p.status='PUBLISHED'
         GROUP BY p.author_id
         ORDER BY post_count DESC,p.author_id
         LIMIT 5`,
    );
    const statsRows = await this.db.query(
      `SELECT
          count(*) FILTER (WHERE published_at >= now() - interval '1 day')::int today_posts,
          count(*) FILTER (WHERE published_at >= now() - interval '7 days')::int week_posts,
          count(DISTINCT author_id)::int total_authors,
          count(*)::int total_posts
         FROM discussion_posts
         WHERE status='PUBLISHED'`,
    );
    const commentRows = await this.db.query(
      `SELECT c.*,
          (SELECT count(*) FROM discussion_comment_likes cl WHERE cl.comment_id=c.id)::int like_count,
          false viewer_liked,
          p.public_id post_public_id,p.title post_title
         FROM discussion_comments c
         JOIN discussion_posts p ON p.id=c.post_id AND p.status='PUBLISHED'
         WHERE c.status='VISIBLE'
         ORDER BY c.created_at DESC,c.id DESC
         LIMIT 5`,
    );
    return {
      featured: featuredRows[0] ?? null,
      hotPosts,
      recommendedPosts,
      categories: categoryRows.rows.map((row) => ({
        slug: String(row.slug),
        name: String(row.name),
        description: String(row.description ?? ''),
        postCount: Number(row.post_count ?? 0),
        dataOrigin: row.data_origin ?? 'SYSTEM',
      })),
      tags: tagRows.rows.map((row) => ({
        slug: String(row.slug),
        name: String(row.name),
        postCount: Number(row.post_count ?? 0),
        dataOrigin: row.data_origin ?? 'SYSTEM',
      })),
      authorRanks: authorRows.rows.map((row) => ({
        authorId: String(row.author_id),
        postCount: Number(row.post_count ?? 0),
      })),
      stats: {
        todayPosts: Number(statsRows.rows[0]?.today_posts ?? 0),
        weekPosts: Number(statsRows.rows[0]?.week_posts ?? 0),
        totalAuthors: Number(statsRows.rows[0]?.total_authors ?? 0),
        totalPosts: Number(statsRows.rows[0]?.total_posts ?? 0),
      },
      recentComments: commentRows.rows.map((row) => ({
        ...publicComment(row),
        post: {
          publicId: String(row.post_public_id),
          title: String(row.post_title),
        },
      })),
    };
  }
}
