import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type {
  ApiClient,
  AuthenticatedUser,
  DiscussionComment,
  DiscussionPost,
} from '../../services/api.js';
import { MarkdownToolbar } from '../../components/ProblemEditor.js';
import {
  DiscussionAuthorLink,
  formatDiscussionDate,
} from './DiscussionContent.js';
import { DiscussionRenderer } from './DiscussionRenderer.js';

export function DiscussionComments({
  api,
  navigate,
  post,
  user,
  onCommentsChanged,
}: {
  api: ApiClient;
  navigate: (path: string) => void;
  post: DiscussionPost;
  user: AuthenticatedUser | null;
  onCommentsChanged: () => void;
}) {
  const [comments, setComments] = useState<DiscussionComment[]>([]);
  const [comment, setComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>('edit');
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const loadComments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setComments((await api.discussionComments(post.id, 'limit=100')).items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '评论加载失败');
    } finally {
      setLoading(false);
    }
  }, [api, post.id]);
  useEffect(() => {
    void loadComments();
  }, [loadComments]);
  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!comment.trim()) return;
    try {
      await api.createDiscussionComment(post.id, comment, replyTo);
      setComment('');
      setReplyTo(null);
      setMessage('评论已发布');
      await loadComments();
      onCommentsChanged();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : '评论失败');
    }
  };
  const saveComment = async (id: string) => {
    if (!editValue.trim()) return;
    try {
      await api.updateDiscussionComment(id, editValue);
      setEditing(null);
      setMessage('评论已更新');
      await loadComments();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : '更新失败');
    }
  };
  const removeComment = async (id: string) => {
    try {
      await api.deleteDiscussionComment(id);
      setMessage('评论已删除');
      await loadComments();
      onCommentsChanged();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : '删除失败');
    }
  };
  const toggleLike = async (item: DiscussionComment) => {
    if (!user) return;
    const previous = Boolean(item.viewerLiked);
    setComments((items) =>
      items.map((c) =>
        c.id === item.id
          ? {
              ...c,
              viewerLiked: !previous,
              likeCount: Math.max(0, (c.likeCount ?? 0) + (previous ? -1 : 1)),
            }
          : c,
      ),
    );
    try {
      const result = previous
        ? await api.unlikeDiscussionComment(item.id)
        : await api.likeDiscussionComment(item.id);
      setComments((items) =>
        items.map((c) =>
          c.id === item.id
            ? { ...c, viewerLiked: result.liked, likeCount: result.likeCount }
            : c,
        ),
      );
    } catch (reason) {
      setComments((items) =>
        items.map((c) =>
          c.id === item.id
            ? {
                ...c,
                viewerLiked: previous,
                ...(item.likeCount === undefined
                  ? {}
                  : { likeCount: item.likeCount }),
              }
            : c,
        ),
      );
      setMessage(reason instanceof Error ? reason.message : '点赞失败');
    }
  };
  const roots = comments.filter((c) => !c.parentCommentId);
  const rootId = (comment: DiscussionComment) => {
    let current = comment;
    const seen = new Set<string>();
    while (current.parentCommentId && !seen.has(current.parentCommentId)) {
      seen.add(current.parentCommentId);
      const parent = comments.find(
        (item) => item.id === current.parentCommentId,
      );
      if (!parent) break;
      current = parent;
    }
    return current.id;
  };
  const replies = (id: string) =>
    comments.filter(
      (comment) => comment.parentCommentId && rootId(comment) === id,
    );
  const renderComment = (item: DiscussionComment, depth = 0): ReactNode => {
    const target = item.parentCommentId
      ? comments.find((c) => c.id === item.parentCommentId)
      : undefined;
    return (
      <article
        className={`discussion-comment ${depth ? 'discussion-comment-reply' : ''}`}
        key={item.id}
      >
        <header>
          <DiscussionAuthorLink author={item.author} navigate={navigate} />
          <time dateTime={item.createdAt}>
            {formatDiscussionDate(item.createdAt)}
          </time>
        </header>
        {target && (
          <p className="discussion-reply-target">
            回复 @
            {item.replyTarget?.displayName ??
              item.replyTarget?.username ??
              target.author?.displayName ??
              target.author?.username ??
              '用户'}
          </p>
        )}
        {item.status === 'DELETED' ? (
          <p className="discussion-comment-deleted">评论已删除</p>
        ) : editing === item.id ? (
          <div className="discussion-comment-edit">
            <label className="sr-only" htmlFor={`comment-${item.id}`}>
              编辑评论
            </label>
            <div className="discussion-editor-tabs">
              <button
                type="button"
                aria-label="编辑模式"
                className={previewMode === 'edit' ? 'active' : 'secondary'}
                onClick={() => setPreviewMode('edit')}
              >
                编辑
              </button>
              <button
                type="button"
                aria-label="预览模式"
                className={previewMode === 'preview' ? 'active' : 'secondary'}
                onClick={() => setPreviewMode('preview')}
              >
                预览
              </button>
            </div>
            {previewMode === 'edit' ? (
              <>
                <MarkdownToolbar
                  textareaRef={editTextareaRef}
                  value={editValue}
                  onChange={setEditValue}
                  disabled={false}
                />
                <textarea
                  ref={editTextareaRef}
                  id={`comment-${item.id}`}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={5}
                />
              </>
            ) : (
              <div className="discussion-comment-preview">
                {editValue.trim() ? (
                  <DiscussionRenderer content={editValue} />
                ) : (
                  <span>暂无可预览内容</span>
                )}
              </div>
            )}
            <div className="discussion-comment-actions">
              <button onClick={() => void saveComment(item.id)}>保存</button>
              <button className="secondary" onClick={() => setEditing(null)}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <DiscussionRenderer content={item.contentMarkdown} />
        )}
        {item.status !== 'DELETED' && editing !== item.id && (
          <footer className="discussion-comment-actions">
            <button
              className={`discussion-text-action ${item.viewerLiked ? 'liked' : ''}`}
              disabled={!user}
              aria-pressed={item.viewerLiked}
              onClick={() => void toggleLike(item)}
            >
              ♡ {item.likeCount ?? 0}
            </button>
            {user && (
              <button
                className="discussion-text-action"
                onClick={() => {
                  setReplyTo(item.id);
                  setComment('');
                  composerRef.current?.focus();
                }}
              >
                回复
              </button>
            )}
            {item.capabilities?.canEdit && (
              <button
                className="discussion-text-action"
                onClick={() => {
                  setEditing(item.id);
                  setEditValue(item.contentMarkdown);
                }}
              >
                编辑
              </button>
            )}
            {item.capabilities?.canDelete && (
              <button
                className="discussion-text-action danger"
                onClick={() => void removeComment(item.id)}
              >
                删除
              </button>
            )}
          </footer>
        )}
        {depth === 0 &&
          replies(item.id).map((reply) => renderComment(reply, 1))}
        {replyTo === item.id && user && (
          <form className="discussion-inline-reply" onSubmit={submitComment}>
            <strong>
              回复 @
              {item.author?.displayName ?? item.author?.username ?? '用户'}
            </strong>
            <div className="discussion-editor-tabs">
              <button
                type="button"
                aria-label="编辑模式"
                className={previewMode === 'edit' ? 'active' : 'secondary'}
                onClick={() => setPreviewMode('edit')}
              >
                编辑
              </button>
              <button
                type="button"
                aria-label="预览模式"
                className={previewMode === 'preview' ? 'active' : 'secondary'}
                onClick={() => setPreviewMode('preview')}
              >
                预览
              </button>
            </div>
            {previewMode === 'edit' ? (
              <>
                <MarkdownToolbar
                  textareaRef={composerRef}
                  value={comment}
                  onChange={setComment}
                  disabled={false}
                />
                <textarea
                  ref={composerRef}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="写下回复"
                  rows={4}
                />
              </>
            ) : (
              <div className="discussion-comment-preview">
                {comment.trim() ? (
                  <DiscussionRenderer content={comment} />
                ) : (
                  <span>暂无可预览内容</span>
                )}
              </div>
            )}
            <div className="discussion-comment-actions">
              <button type="submit">回复</button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setReplyTo(null);
                  setComment('');
                }}
              >
                取消
              </button>
            </div>
          </form>
        )}
      </article>
    );
  };
  return (
    <section className="discussion-comments" aria-labelledby="comments-title">
      <div className="discussion-comments-heading">
        <div>
          <p className="discussion-section-label">社区交流</p>
          <h2 id="comments-title">评论 {post.commentCount}</h2>
        </div>
      </div>
      {loading ? (
        <div className="discussion-comment-loading" aria-label="正在加载评论">
          <span />
          <span />
        </div>
      ) : error ? (
        <div className="discussion-inline-error" role="alert">
          <p>评论加载失败</p>
          <button className="secondary" onClick={() => void loadComments()}>
            重试
          </button>
        </div>
      ) : roots.length ? (
        <div className="discussion-comment-list">
          {roots.map((item) => renderComment(item))}
        </div>
      ) : (
        <p className="discussion-comments-empty">
          还没有评论，来分享你的看法。
        </p>
      )}
      {user ? (
        <form className="discussion-comment-form" onSubmit={submitComment}>
          <label htmlFor="new-comment">参与评论</label>
          <div className="discussion-editor-tabs">
            <button
              type="button"
              aria-label="编辑模式"
              className={previewMode === 'edit' ? 'active' : 'secondary'}
              onClick={() => setPreviewMode('edit')}
            >
              编辑
            </button>
            <button
              type="button"
              aria-label="预览模式"
              className={previewMode === 'preview' ? 'active' : 'secondary'}
              onClick={() => setPreviewMode('preview')}
            >
              预览
            </button>
          </div>
          {previewMode === 'edit' ? (
            <>
              <MarkdownToolbar
                textareaRef={composerRef}
                value={comment}
                onChange={setComment}
                disabled={false}
              />
              <textarea
                ref={composerRef}
                id="new-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="写下你的评论"
                rows={5}
              />
            </>
          ) : (
            <div className="discussion-comment-preview">
              {comment.trim() ? (
                <DiscussionRenderer content={comment} />
              ) : (
                <span>暂无可预览内容</span>
              )}
            </div>
          )}
          <div>
            <button type="submit">发布评论</button>
          </div>
        </form>
      ) : (
        <p className="discussion-login-note">登录后参与评论。</p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
