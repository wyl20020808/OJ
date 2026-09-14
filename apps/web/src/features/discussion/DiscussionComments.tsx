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
  DiscussionAvatar,
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
  const replyComposerRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [sortMode, setSortMode] = useState<'hot' | 'newest'>('hot');
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
  useEffect(() => {
    if (replyTo) replyComposerRef.current?.focus();
  }, [replyTo]);
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
  const compareNewest = (left: DiscussionComment, right: DiscussionComment) =>
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() ||
    right.id.localeCompare(left.id);
  const roots = comments
    .filter((c) => !c.parentCommentId)
    .sort((left, right) =>
      sortMode === 'newest'
        ? compareNewest(left, right)
        : (right.likeCount ?? 0) - (left.likeCount ?? 0) ||
          compareNewest(left, right),
    );
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
    comments
      .filter((comment) => comment.parentCommentId && rootId(comment) === id)
      .sort(
        (left, right) =>
          new Date(left.createdAt).getTime() -
            new Date(right.createdAt).getTime() ||
          left.id.localeCompare(right.id),
      );
  const renderComment = (item: DiscussionComment, depth = 0): ReactNode => {
    const target = item.parentCommentId
      ? comments.find((c) => c.id === item.parentCommentId)
      : undefined;
    return (
      <article
        className={`discussion-comment ${depth ? 'discussion-comment-reply' : ''}`}
        data-comment-id={item.id}
        data-comment-depth={depth}
        key={item.id}
      >
        <header className="discussion-comment-header">
          <div className="discussion-comment-meta">
            <DiscussionAuthorLink
              author={item.author}
              navigate={navigate}
              avatarFallback="portrait"
            />
            {item.author?.username === post.author?.username && (
              <span className="discussion-comment-author-badge">作者</span>
            )}
            <time dateTime={item.createdAt}>
              {formatDiscussionDate(item.createdAt)}
            </time>
          </div>
        </header>
        {target && (
          <p className="discussion-reply-target">
            回复{' '}
            <span>
              @
              {item.replyTarget?.displayName ??
                item.replyTarget?.username ??
                target.author?.displayName ??
                target.author?.username ??
                '用户'}
            </span>
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
              aria-label={`${item.viewerLiked ? '取消赞' : '赞'} ${item.likeCount ?? 0}`}
              onClick={() => void toggleLike(item)}
            >
              <CommentIcon name="heart" filled={Boolean(item.viewerLiked)} />
              {item.likeCount ?? 0}
            </button>
            {user && (
              <button
                className="discussion-text-action"
                onClick={() => {
                  setReplyTo(item.id);
                  setComment('');
                }}
              >
                <CommentIcon name="reply" />
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
                <CommentIcon name="edit" />
                编辑
              </button>
            )}
            {item.capabilities?.canDelete && (
              <button
                className="discussion-text-action danger"
                onClick={() => void removeComment(item.id)}
              >
                <CommentIcon name="delete" />
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
                  textareaRef={replyComposerRef}
                  value={comment}
                  onChange={setComment}
                  disabled={false}
                />
                <textarea
                  ref={replyComposerRef}
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
        <div className="discussion-comments-title">
          <p className="discussion-section-label">社区交流</p>
          <h2 id="comments-title">评论 {post.commentCount}</h2>
        </div>
        <div className="discussion-comments-sort" aria-label="评论排序">
          <button
            className={sortMode === 'hot' ? 'active' : ''}
            type="button"
            aria-pressed={sortMode === 'hot'}
            onClick={() => setSortMode('hot')}
          >
            按热度
          </button>
          <button
            className={sortMode === 'newest' ? 'active' : ''}
            type="button"
            aria-pressed={sortMode === 'newest'}
            onClick={() => setSortMode('newest')}
          >
            按时间
          </button>
        </div>
      </div>
      {user ? (
        <form
          className="discussion-comment-form discussion-comment-composer"
          onSubmit={submitComment}
        >
          <DiscussionAvatar
            author={{ username: user.username, displayName: user.displayName }}
          />
          <label className="sr-only" htmlFor="new-comment">
            说点什么吧
          </label>
          <textarea
            ref={composerRef}
            id="new-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="说点什么吧..."
            rows={1}
          />
          <button type="submit">
            <CommentIcon name="send" />
            发表评论
          </button>
        </form>
      ) : (
        <p className="discussion-login-note">登录后参与评论。</p>
      )}
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
      {message && <p role="status">{message}</p>}
    </section>
  );
}

function CommentIcon({
  name,
  filled = false,
}: {
  name: 'heart' | 'reply' | 'edit' | 'delete' | 'send';
  filled?: boolean;
}) {
  const paths = {
    heart: (
      <path d="M12 20.6 10.6 19.3C5.4 14.7 2 11.6 2 7.8 2 4.7 4.4 2.3 7.5 2.3c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1 3.1 0 5.5 2.4 5.5 5.5 0 3.8-3.4 6.9-8.6 11.5Z" />
    ),
    reply: <path d="m9 7-5 5 5 5v-3c5 0 8.5 1.7 11 5-1-5-4-9-11-9Z" />,
    edit: (
      <path d="m4 16.8-.8 4 4-.8L18.9 8.3l-3.2-3.2ZM14.7 6.1l3.2 3.2M13 21h8" />
    ),
    delete: <path d="M4 7h16M9 7V4h6v3m-8 0 1 14h8l1-14M10 11v6m4-6v6" />,
    send: <path d="m3 4 18 8-18 8 3-8Zm3 8h9" />,
  };

  return (
    <svg
      className="discussion-comment-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
