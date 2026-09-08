import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type {
  ApiClient,
  AuthenticatedUser,
  DiscussionPost,
} from '../../services/api.js';
import { MarkdownToolbar } from '../../components/ProblemEditor.js';
import { DiscussionComments } from './DiscussionComments.js';
import {
  DiscussionAuthorLink,
  DiscussionFeedItem,
  DiscussionFeedSkeleton,
  DiscussionTypeBadge,
  formatDiscussionDate,
} from './DiscussionContent.js';
import { DiscussionRenderer } from './DiscussionRenderer.js';
import { useToast } from '../../components/Toast.js';

type DiscussionFilter = 'all' | 'article' | 'announcement';

const discussionFilters: Array<{
  value: DiscussionFilter;
  label: string;
}> = [
  { value: 'all', label: '全部' },
  { value: 'article', label: '文章' },
  { value: 'announcement', label: '公告' },
];

function readDiscussionFilter(): DiscussionFilter {
  const value = new URLSearchParams(window.location.search).get('type');
  return value === 'article' || value === 'announcement' ? value : 'all';
}

function discussionHref(type: DiscussionFilter, search: string) {
  const query = new URLSearchParams();
  if (type !== 'all') query.set('type', type);
  if (search) query.set('q', search);
  const value = query.toString();
  return `/discussion${value ? `?${value}` : ''}`;
}

export function DiscussionHome({
  api,
  navigate,
  user,
}: {
  api: ApiClient;
  navigate: (path: string) => void;
  user: AuthenticatedUser | null;
}) {
  const filter = readDiscussionFilter();
  const search =
    new URLSearchParams(window.location.search).get('q')?.trim() ?? '';
  const [posts, setPosts] = useState<DiscussionPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ limit: '20' });
    if (filter === 'article') query.set('type', 'ARTICLE');
    if (filter === 'announcement') query.set('type', 'ANNOUNCEMENT');
    if (search) query.set('q', search);
    setLoading(true);
    setError(false);
    void api
      .discussionPosts(query.toString())
      .then((result) => {
        if (active) setPosts(result.items);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, filter, reload, search]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = String(
      new FormData(event.currentTarget).get('q') ?? '',
    ).trim();
    navigate(discussionHref(filter, value));
  };
  const emptyTitle =
    filter === 'announcement' ? '暂时没有公告' : '这里还没有内容';
  const emptyText = search
    ? '没有找到匹配内容，换个关键词试试。'
    : filter === 'announcement'
      ? '新的站内公告会统一出现在这里。'
      : '成为第一个分享文章的人。';

  return (
    <section className="discussion-page discussion-hub">
      <header className="discussion-hub-header">
        <div>
          <p className="discussion-kicker">CONTENT HUB</p>
          <h1>讨论</h1>
          <p>分享文章、查看公告，与社区交流。</p>
        </div>
        {user && (
          <button onClick={() => navigate('/discussion/new')}>写文章</button>
        )}
      </header>

      <nav className="discussion-tabs" aria-label="讨论内容分类">
        {discussionFilters.map((item) => {
          const href = discussionHref(item.value, search);
          return (
            <a
              key={item.value}
              href={href}
              className={filter === item.value ? 'active' : ''}
              aria-current={filter === item.value ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigate(href);
              }}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      <div className="discussion-toolbar">
        <p>
          {loading
            ? '正在获取最新内容'
            : `本页 ${posts.length} 项 · 按发布时间排列`}
        </p>
        <form role="search" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="discussion-search">
            搜索讨论内容
          </label>
          <input
            id="discussion-search"
            key={search}
            name="q"
            type="search"
            defaultValue={search}
            placeholder="搜索标题"
          />
          <button className="secondary" type="submit">
            搜索
          </button>
        </form>
      </div>

      {loading ? (
        <DiscussionFeedSkeleton />
      ) : error ? (
        <div className="discussion-error-state" role="alert">
          <div aria-hidden="true">!</div>
          <h2>加载讨论内容失败</h2>
          <p>暂时无法取得内容，请稍后重试。</p>
          <button onClick={() => setReload((value) => value + 1)}>重试</button>
        </div>
      ) : posts.length ? (
        <div className="discussion-feed" role="feed" aria-label="讨论内容">
          {posts.map((post) => (
            <DiscussionFeedItem key={post.id} post={post} navigate={navigate} />
          ))}
        </div>
      ) : (
        <div className="discussion-empty-state">
          <div aria-hidden="true">文</div>
          <h2>{emptyTitle}</h2>
          <p>{emptyText}</p>
          {user && filter !== 'announcement' && !search && (
            <button onClick={() => navigate('/discussion/new')}>写文章</button>
          )}
        </div>
      )}
    </section>
  );
}

export function DiscussionPostPage({
  api,
  navigate,
  id,
  user,
}: {
  api: ApiClient;
  navigate: (path: string) => void;
  id: string;
  user: AuthenticatedUser | null;
}) {
  const [post, setPost] = useState<DiscussionPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liked, setLiked] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const toast = useToast();

  const loadPost = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setPost(await api.discussionPost(id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '文章加载失败');
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  const refreshPost = useCallback(async () => {
    if (!post) return;
    try {
      setPost(await api.discussionPost(post.id));
    } catch (reason) {
      setActionMessage(reason instanceof Error ? reason.message : '刷新失败');
    }
  }, [api, post]);

  useEffect(() => {
    setLiked(false);
    void loadPost();
  }, [loadPost]);

  const toggleLike = async () => {
    if (!post || !user) return;
    try {
      if (liked) await api.unlikeDiscussionPost(post.id);
      else await api.likeDiscussionPost(post.id);
      setLiked(!liked);
      await refreshPost();
    } catch (reason) {
      setActionMessage(reason instanceof Error ? reason.message : '操作失败');
    }
  };

  const copyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(window.location.href);
      setActionMessage('');
      toast({ kind: 'success', title: '链接已复制' });
    } catch {
      setActionMessage('复制失败，请手动复制地址栏链接');
    }
  };

  const deletePost = async () => {
    if (!post) return;
    try {
      await api.deleteDiscussionPost(post.id);
      navigate('/discussion');
    } catch (reason) {
      setActionMessage(reason instanceof Error ? reason.message : '删除失败');
    }
  };

  if (loading)
    return (
      <article className="discussion-page discussion-detail">
        <div className="discussion-detail-skeleton" aria-label="正在加载内容">
          <span />
          <strong />
          <p />
          <div />
        </div>
      </article>
    );
  if (!post)
    return (
      <section className="discussion-page discussion-detail-error" role="alert">
        <h1>内容加载失败</h1>
        <p>{error || '该内容不存在或暂时不可用。'}</p>
        <button onClick={() => void loadPost()}>重试</button>
      </section>
    );

  const publishedAt = post.publishedAt ?? post.createdAt;
  const showUpdatedAt = post.updatedAt !== publishedAt;
  return (
    <article
      className={`discussion-page discussion-detail${post.type === 'ANNOUNCEMENT' ? ' announcement' : ''}`}
      data-content-template="discussion"
    >
      <header className="discussion-detail-header">
        <div className="discussion-detail-heading">
          <div>
            <DiscussionTypeBadge type={post.type} />
            <h1>{post.title}</h1>
          </div>
          {(post.capabilities?.canEdit || post.capabilities?.canDelete) && (
            <div className="discussion-owner-actions" aria-label="内容管理">
              {post.capabilities.canEdit && (
                <button
                  className="secondary"
                  onClick={() => navigate(`/discussion/${post.publicId}/edit`)}
                >
                  编辑
                </button>
              )}
              {post.capabilities.canDelete && (
                <button
                  className="discussion-delete-action"
                  onClick={() => void deletePost()}
                >
                  删除
                </button>
              )}
            </div>
          )}
        </div>
        <div className="discussion-detail-meta">
          <DiscussionAuthorLink author={post.author} navigate={navigate} />
          <span aria-hidden="true">·</span>
          <time dateTime={publishedAt}>
            发布于 {formatDiscussionDate(publishedAt)}
          </time>
          {showUpdatedAt && (
            <>
              <span aria-hidden="true">·</span>
              <time dateTime={post.updatedAt}>
                更新于 {formatDiscussionDate(post.updatedAt)}
              </time>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>{post.viewCount} 次浏览</span>
        </div>
      </header>

      <div className="discussion-body-surface">
        <DiscussionRenderer content={post.contentMarkdown} />
      </div>

      <div className="discussion-detail-actions" aria-label="内容操作">
        <button
          className={liked ? 'liked' : 'secondary'}
          aria-pressed={liked}
          disabled={!user}
          title={user ? '点赞' : '登录后点赞'}
          onClick={() => void toggleLike()}
        >
          {liked ? '♥' : '♡'} {post.likeCount}
        </button>
        <button className="secondary" onClick={() => void copyLink()}>
          复制链接
        </button>
        <span>{post.commentCount} 条评论</span>
      </div>
      {actionMessage && (
        <p className="discussion-action-message" role="status">
          {actionMessage}
        </p>
      )}

      <DiscussionComments
        api={api}
        navigate={navigate}
        post={post}
        user={user}
        onCommentsChanged={() => void refreshPost()}
      />
    </article>
  );
}

export function DiscussionEditor({
  api,
  navigate,
  id,
  user,
}: {
  api: ApiClient;
  navigate: (path: string) => void;
  id?: string;
  user: AuthenticatedUser | null;
}) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'ARTICLE' | 'ANNOUNCEMENT'>('ARTICLE');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();
  useEffect(() => {
    if (id)
      void api
        .discussionPost(id)
        .then((p) => {
          setTitle(p.title);
          setSummary(p.summary ?? '');
          setContent(p.contentMarkdown);
          setType(p.type);
        })
        .catch(() => setMessage('文章加载失败'));
  }, [api, id]);
  const save = async (status: 'DRAFT' | 'PUBLISHED') => {
    try {
      const p = id
        ? await api.updateDiscussionPost(id, {
            title,
            summary,
            contentMarkdown: content,
            type,
          })
        : await api.createDiscussionPost({
            title,
            summary,
            contentMarkdown: content,
            type,
            status,
          });
      if (status === 'PUBLISHED' && id) await api.publishDiscussionPost(p.id);
      toast({
        kind: 'success',
        title: status === 'PUBLISHED' ? '发布成功' : '草稿已保存',
      });
      if (status === 'PUBLISHED') navigate(`/discussion/${p.publicId}`);
    } catch (e) {
      toast({
        kind: 'error',
        title: status === 'PUBLISHED' ? '发布失败' : '保存失败',
        description: e instanceof Error ? e.message : '请稍后重试',
      });
    }
  };
  if (!user) return <p>请先登录。</p>;
  return (
    <section className="discussion-page discussion-editor authoring-workspace">
      <header className="article-authoring-header">
        <div>
          <p className="eyebrow">Discussion / 内容</p>
          <h1>{id ? '编辑文章' : '写文章'}</h1>
          <p>把想法整理成清晰、可阅读的内容。</p>
        </div>
        <span className="authoring-status">草稿</span>
      </header>
      <label className="article-title-field">
        <span className="sr-only">文章标题</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="输入文章标题…"
          required
        />
      </label>
      <label className="article-summary-field">
        摘要 <span>用于列表预览</span>
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="补充一段简短摘要（可选）"
        />
      </label>
      <div className="article-type-switch" role="group" aria-label="内容类型">
        <button
          type="button"
          className={type === 'ARTICLE' ? 'active' : 'secondary'}
          onClick={() => setType('ARTICLE')}
        >
          文章
        </button>
        <button
          type="button"
          className={type === 'ANNOUNCEMENT' ? 'active' : 'secondary'}
          onClick={() => setType('ANNOUNCEMENT')}
        >
          公告
        </button>
      </div>
      <MarkdownToolbar
        textareaRef={textareaRef}
        value={content}
        onChange={setContent}
        disabled={false}
      />
      <div className="discussion-editor-split authoring-editor-split">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="写下你的文章内容……"
        />
        <div className="discussion-preview">
          <DiscussionRenderer content={content || '*预览*'} />
        </div>
      </div>
      <div className="discussion-actions">
        <button onClick={() => void save('DRAFT')}>保存草稿</button>
        <button onClick={() => void save('PUBLISHED')}>发布</button>
      </div>
      {message && (
        <p className="editor-inline-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
