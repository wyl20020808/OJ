import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  ApiClient,
  AuthenticatedUser,
  DiscussionComment,
  DiscussionPost,
} from '../../services/api.js';
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
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const loadComments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.discussionComments(post.id, 'limit=20');
      setComments(result.items);
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
      await api.createDiscussionComment(post.id, comment);
      setComment('');
      setMessage('评论已发布');
      await loadComments();
      onCommentsChanged();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : '评论失败');
    }
  };

  const saveComment = async (commentId: string) => {
    if (!editValue.trim()) return;
    try {
      await api.updateDiscussionComment(commentId, editValue);
      setEditing(null);
      setMessage('评论已更新');
      await loadComments();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : '更新失败');
    }
  };

  const removeComment = async (commentId: string) => {
    try {
      await api.deleteDiscussionComment(commentId);
      setMessage('评论已删除');
      await loadComments();
      onCommentsChanged();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : '删除失败');
    }
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
      ) : comments.length ? (
        <div className="discussion-comment-list">
          {comments.map((item) => (
            <article className="discussion-comment" key={item.id}>
              <header>
                <DiscussionAuthorLink
                  author={item.author}
                  navigate={navigate}
                />
                <time dateTime={item.createdAt}>
                  {formatDiscussionDate(item.createdAt)}
                </time>
              </header>
              {editing === item.id ? (
                <div className="discussion-comment-edit">
                  <label className="sr-only" htmlFor={`comment-${item.id}`}>
                    编辑评论
                  </label>
                  <textarea
                    id={`comment-${item.id}`}
                    value={editValue}
                    onChange={(event) => setEditValue(event.target.value)}
                    rows={5}
                  />
                  <div className="discussion-comment-actions">
                    <button onClick={() => void saveComment(item.id)}>
                      保存
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setEditing(null)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <DiscussionRenderer content={item.contentMarkdown} />
                  {(item.capabilities?.canEdit ||
                    item.capabilities?.canDelete) && (
                    <footer className="discussion-comment-actions">
                      {item.capabilities.canEdit && (
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
                      {item.capabilities.canDelete && (
                        <button
                          className="discussion-text-action danger"
                          onClick={() => void removeComment(item.id)}
                        >
                          删除
                        </button>
                      )}
                    </footer>
                  )}
                </>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="discussion-comments-empty">
          还没有评论，来分享你的看法。
        </p>
      )}

      {user ? (
        <form className="discussion-comment-form" onSubmit={submitComment}>
          <label htmlFor="new-comment">参与评论</label>
          <textarea
            id="new-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="写下你的评论"
            rows={5}
          />
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
