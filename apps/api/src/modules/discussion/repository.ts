/* eslint-disable @typescript-eslint/no-explicit-any -- database rows are normalized at module boundary. */
import { randomUUID } from 'node:crypto';
import type { DiscussionComment, DiscussionPost, DiscussionPostStatus, DiscussionPostType } from './model.js';

type Query = { rows: Record<string, any>[]; rowCount?: number | null };
type Db = { query(sql: string, values?: unknown[]): Promise<Query> };
export type DiscussionRepository = {
  list(input: { status?: DiscussionPostStatus; type?: DiscussionPostType; authorId?: string; q?: string; cursor?: string; limit: number }): Promise<{ items: DiscussionPost[]; nextCursor?: string }>;
  get(key: string): Promise<DiscussionPost | null>;
  create(input: { authorId: string; type: DiscussionPostType; title: string; summary?: string; contentMarkdown: string; status: DiscussionPostStatus }): Promise<DiscussionPost>;
  update(id: string, input: { title?: string; summary?: string | null; contentMarkdown?: string; type?: DiscussionPostType }): Promise<DiscussionPost | null>;
  publish(id: string): Promise<DiscussionPost | null>;
  tombstone(id: string, actorId: string): Promise<DiscussionPost | null>;
  incrementViews(id: string): Promise<void>;
  listComments(postId: string, cursor?: string, limit?: number): Promise<{ items: DiscussionComment[]; nextCursor?: string }>;
  getComment(id: string): Promise<DiscussionComment | null>;
  createComment(input: { postId: string; authorId: string; contentMarkdown: string; parentCommentId?: string | null }): Promise<DiscussionComment>;
  updateComment(id: string, contentMarkdown: string): Promise<DiscussionComment | null>;
  tombstoneComment(id: string): Promise<DiscussionComment | null>;
  like(postId: string, userId: string): Promise<boolean>;
  unlike(postId: string, userId: string): Promise<boolean>;
};
const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
const dec = (v?: string) => { if (!v) return undefined; try { return JSON.parse(Buffer.from(v, 'base64url').toString()); } catch { return undefined; } };
const publicPost = (r: any): DiscussionPost => ({ id: String(r.id), publicId: String(r.public_id ?? r.publicId), authorId: String(r.author_id ?? r.authorId), type: r.type, status: r.status, title: r.title, summary: r.summary ?? null, contentMarkdown: r.content_markdown ?? r.contentMarkdown, publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null, createdAt: new Date(r.created_at ?? r.createdAt).toISOString(), updatedAt: new Date(r.updated_at ?? r.updatedAt).toISOString(), deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null, deletedBy: r.deleted_by ? String(r.deleted_by) : null, viewCount: Number(r.view_count ?? r.viewCount ?? 0), likeCount: Number(r.like_count ?? 0), commentCount: Number(r.comment_count ?? 0) });
const publicComment = (r: any): DiscussionComment => ({ id: String(r.id), postId: String(r.post_id ?? r.postId), authorId: String(r.author_id ?? r.authorId), parentCommentId: r.parent_comment_id ? String(r.parent_comment_id) : null, contentMarkdown: r.content_markdown ?? r.contentMarkdown, status: r.status, createdAt: new Date(r.created_at ?? r.createdAt).toISOString(), updatedAt: new Date(r.updated_at ?? r.updatedAt).toISOString(), deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null });

export class InMemoryDiscussionRepository implements DiscussionRepository {
  posts = new Map<string, DiscussionPost>(); comments = new Map<string, DiscussionComment>(); likes = new Set<string>();
  async list(input: { status?: DiscussionPostStatus; type?: DiscussionPostType; authorId?: string; q?: string; cursor?: string; limit: number }) { const a = [...this.posts.values()].filter(p => !input.status ? p.status !== 'DELETED' : p.status === input.status).filter(p => !input.type || p.type === input.type).filter(p => !input.authorId || p.authorId === input.authorId).filter(p => !input.q || p.title.toLowerCase().includes(input.q.toLowerCase())).sort((x,y) => (y.publishedAt ?? y.updatedAt).localeCompare(x.publishedAt ?? x.updatedAt) || y.id.localeCompare(x.id)); const start = Number(dec(input.cursor)?.offset ?? 0); const items = a.slice(start, start + input.limit); return { items, ...(start + items.length < a.length ? { nextCursor: enc({ offset: start + items.length }) } : {}) }; }
  async get(key: string) { return [...this.posts.values()].find(p => p.id === key || p.publicId === key) ?? null; }
  async create(i: any) { const now = new Date().toISOString(); const id = randomUUID(); const p: DiscussionPost = { id, publicId: `post-${id.slice(0,8)}`, authorId: i.authorId, type: i.type, status: i.status, title: i.title, summary: i.summary ?? null, contentMarkdown: i.contentMarkdown, publishedAt: i.status === 'PUBLISHED' ? now : null, createdAt: now, updatedAt: now, deletedAt: null, deletedBy: null, viewCount: 0, likeCount: 0, commentCount: 0 }; this.posts.set(id,p); return p; }
  async update(id: string, i: any) { const p = await this.get(id); if (!p || p.status === 'DELETED') return null; Object.assign(p, i, { updatedAt: new Date().toISOString() }); return p; }
  async publish(id: string) { const p = await this.get(id); if (!p || p.status === 'DELETED') return null; p.status='PUBLISHED'; p.publishedAt ??= new Date().toISOString(); p.updatedAt=new Date().toISOString(); return p; }
  async tombstone(id: string, actorId: string) { const p=await this.get(id); if(!p) return null; p.status='DELETED'; p.deletedAt=new Date().toISOString(); p.deletedBy=actorId; p.updatedAt=p.deletedAt; return p; }
  async incrementViews(id: string) { const p=await this.get(id); if(p && p.status==='PUBLISHED') p.viewCount++; }
  async listComments(postId: string, cursor?: string, limit=20) { const a=[...this.comments.values()].filter(c=>c.postId===postId&&c.status!=='DELETED').sort((x,y)=>x.createdAt.localeCompare(y.createdAt)||x.id.localeCompare(y.id)); const start=Number(dec(cursor)?.offset??0); const items=a.slice(start,start+limit); return {items,...(start+items.length<a.length?{nextCursor:enc({offset:start+items.length})}:{})}; }
  async getComment(id: string) { return this.comments.get(id) ?? null; }
  async createComment(i:any) { const now=new Date().toISOString(); const c:DiscussionComment={id:randomUUID(),postId:i.postId,authorId:i.authorId,parentCommentId:i.parentCommentId??null,contentMarkdown:i.contentMarkdown,status:'VISIBLE',createdAt:now,updatedAt:now,deletedAt:null}; this.comments.set(c.id,c); const p=await this.get(i.postId); if(p)p.commentCount++; return c; }
  async updateComment(id:string, contentMarkdown:string){const c=this.comments.get(id);if(!c||c.status==='DELETED')return null;c.contentMarkdown=contentMarkdown;c.updatedAt=new Date().toISOString();return c;}
  async tombstoneComment(id:string){const c=this.comments.get(id);if(!c)return null;c.status='DELETED';c.deletedAt=new Date().toISOString();c.updatedAt=c.deletedAt;return c;}
  async like(postId:string,userId:string){const k=`${postId}:${userId}`;if(this.likes.has(k))return false;this.likes.add(k);const p=await this.get(postId);if(p)p.likeCount++;return true;}
  async unlike(postId:string,userId:string){const k=`${postId}:${userId}`;if(!this.likes.delete(k))return false;const p=await this.get(postId);if(p)p.likeCount=Math.max(0,p.likeCount-1);return true;}
}

export class PostgresDiscussionRepository implements DiscussionRepository {
  constructor(private readonly db: Db) {}
  async list(i:any){const values:any[]=[];const where:string[]=[];if(i.status){values.push(i.status);where.push(`p.status=$${values.length}`)}else where.push("p.status <> 'DELETED'");if(i.type){values.push(i.type);where.push(`p.type=$${values.length}`)}if(i.authorId){values.push(i.authorId);where.push(`p.author_id=$${values.length}`)}if(i.q){values.push(`%${i.q}%`);where.push(`p.title ILIKE $${values.length}`)}const limit=Math.min(100,Math.max(1,i.limit));values.push(limit+1);const r=await this.db.query(`SELECT p.*, (SELECT count(*) FROM discussion_post_likes l WHERE l.post_id=p.id)::int like_count, (SELECT count(*) FROM discussion_comments c WHERE c.post_id=p.id AND c.status='VISIBLE')::int comment_count FROM discussion_posts p WHERE ${where.join(' AND ')} ORDER BY COALESCE(p.published_at,p.updated_at) DESC,p.id DESC LIMIT $${values.length}`,values);const items=r.rows.slice(0,limit).map(publicPost);return {items,...(r.rows.length>limit?{nextCursor:enc({offset:0})}:{})};}
  async get(key:string){const r=await this.db.query('SELECT p.*, (SELECT count(*) FROM discussion_post_likes l WHERE l.post_id=p.id)::int like_count, (SELECT count(*) FROM discussion_comments c WHERE c.post_id=p.id AND c.status=\'VISIBLE\')::int comment_count FROM discussion_posts p WHERE (p.id=$1 OR p.public_id=$1) LIMIT 1',[key]);return r.rows[0]?publicPost(r.rows[0]):null;}
  async create(i:any){const r=await this.db.query("INSERT INTO discussion_posts(public_id,author_id,type,status,title,summary,content_markdown,published_at) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $4='PUBLISHED' THEN now() END) RETURNING *",[`post-${randomUUID().slice(0,8)}`,i.authorId,i.type,i.status,i.title,i.summary??null,i.contentMarkdown]);return publicPost(r.rows[0]);}
  async update(id:string,i:any){const r=await this.db.query("UPDATE discussion_posts SET title=COALESCE($2,title),summary=COALESCE($3,summary),content_markdown=COALESCE($4,content_markdown),type=COALESCE($5,type),updated_at=now() WHERE (id=$1 OR public_id=$1) AND status<>'DELETED' RETURNING *",[id,i.title??null,i.summary??null,i.contentMarkdown??null,i.type??null]);return r.rows[0]?publicPost(r.rows[0]):null;}
  async publish(id:string){const r=await this.db.query("UPDATE discussion_posts SET status='PUBLISHED',published_at=COALESCE(published_at,now()),updated_at=now() WHERE (id=$1 OR public_id=$1) AND status<>'DELETED' RETURNING *",[id]);return r.rows[0]?publicPost(r.rows[0]):null;}
  async tombstone(id:string,a:string){const r=await this.db.query("UPDATE discussion_posts SET status='DELETED',deleted_at=now(),deleted_by=$2,updated_at=now() WHERE (id=$1 OR public_id=$1) AND status<>'DELETED' RETURNING *",[id,a]);return r.rows[0]?publicPost(r.rows[0]):null;}
  async incrementViews(id:string){await this.db.query("UPDATE discussion_posts SET view_count=view_count+1 WHERE (id=$1 OR public_id=$1) AND status='PUBLISHED'",[id]);}
  async listComments(postId:string,cursor?:string,limit=20){const r=await this.db.query("SELECT * FROM discussion_comments WHERE post_id=$1 AND status='VISIBLE' ORDER BY created_at ASC,id ASC LIMIT $2",[postId,Math.min(100,Math.max(1,limit))+1]);const items=r.rows.slice(0,limit).map(publicComment);return {items,...(r.rows.length>limit?{nextCursor:enc({offset:0})}:{})};}
  async getComment(id: string) { const r = await this.db.query("SELECT * FROM discussion_comments WHERE id=$1 AND status='VISIBLE'", [id]); return r.rows[0] ? publicComment(r.rows[0]) : null; }
  async createComment(i:any){const r=await this.db.query("INSERT INTO discussion_comments(post_id,author_id,parent_comment_id,content_markdown) VALUES($1,$2,$3,$4) RETURNING *",[i.postId,i.authorId,i.parentCommentId??null,i.contentMarkdown]);return publicComment(r.rows[0]);}
  async updateComment(id:string,c:string){const r=await this.db.query("UPDATE discussion_comments SET content_markdown=$2,updated_at=now() WHERE id=$1 AND status='VISIBLE' RETURNING *",[id,c]);return r.rows[0]?publicComment(r.rows[0]):null;}
  async tombstoneComment(id:string){const r=await this.db.query("UPDATE discussion_comments SET status='DELETED',deleted_at=now(),updated_at=now() WHERE id=$1 AND status='VISIBLE' RETURNING *",[id]);return r.rows[0]?publicComment(r.rows[0]):null;}
  async like(postId:string,userId:string){const r=await this.db.query("INSERT INTO discussion_post_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[postId,userId]);return (r.rowCount??0)>0;}
  async unlike(postId:string,userId:string){const r=await this.db.query('DELETE FROM discussion_post_likes WHERE post_id=$1 AND user_id=$2',[postId,userId]);return (r.rowCount??0)>0;}
}
