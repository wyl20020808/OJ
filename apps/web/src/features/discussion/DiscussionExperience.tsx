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
  DiscussionBlogOverview,
  DiscussionPost,
} from '../../services/api.js';
import { MarkdownToolbar } from '../../components/ProblemEditor.js';
import { DiscussionComments } from './DiscussionComments.js';
import {
  DiscussionAuthorLink,
  DiscussionFeedSkeleton,
  DiscussionTypeBadge,
  formatDiscussionDate,
} from './DiscussionContent.js';
import { DiscussionRenderer } from './DiscussionRenderer.js';
import { useToast } from '../../components/Toast.js';
import './DiscussionExperience.css';

type DiscussionFilter = 'article' | 'announcement' | 'solution';
type BlogSort = 'newest' | 'comments' | 'views';

const discussionFilters: Array<{
  value: DiscussionFilter;
  label: string;
}> = [
  { value: 'article', label: '讨论' },
  { value: 'announcement', label: '公告' },
  { value: 'solution', label: '题解' },
];

function readDiscussionFilter(): DiscussionFilter {
  const value = new URLSearchParams(window.location.search).get('type');
  return value === 'announcement' || value === 'solution' ? value : 'article';
}

function discussionHref(
  type: DiscussionFilter,
  search: string,
  category = '',
  tag = '',
) {
  const query = new URLSearchParams();
  if (type !== 'article') query.set('type', type);
  if (search) query.set('q', search);
  if (category) query.set('category', category);
  if (tag) query.set('tag', tag);
  const value = query.toString();
  return `/discussion${value ? `?${value}` : ''}`;
}

type BlogIconName =
  | 'archive'
  | 'arrow'
  | 'bookmark'
  | 'chart'
  | 'clock'
  | 'comment'
  | 'edit'
  | 'eye'
  | 'file'
  | 'folder'
  | 'history'
  | 'like'
  | 'link'
  | 'share'
  | 'sparkles'
  | 'star'
  | 'tag'
  | 'users';

function BlogIcon({ name }: { name: BlogIconName }) {
  const paths: Record<BlogIconName, ReactNode> = {
    archive: <path d="M4 7h16v13H4zM3 4h18v3H3zm6 7h6" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    bookmark: <path d="M6 4h12v17l-6-4-6 4z" />,
    chart: <path d="M5 20V10m7 10V4m7 16v-7" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    comment: (
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    ),
    edit: <path d="m4 20 4.5-1L19 8.5 15.5 5 5 15.5zM13.5 7l3.5 3.5" />,
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    file: <path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h6" />,
    folder: <path d="M3 6h7l2 2h9v11H3z" />,
    history: <path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5M12 7v5l3 2" />,
    like: (
      <path d="M7 10v11H3V10zm0 9h10.3a2 2 0 0 0 1.9-1.4l1.6-5A2 2 0 0 0 18.9 10H14l.7-3.5A2.9 2.9 0 0 0 12 3l-1 4-4 4" />
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
        <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
      </>
    ),
    share: (
      <path d="m15 8 4-4m0 0v5m0-5h-5M10 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4" />
    ),
    sparkles: (
      <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2zM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8zM19 14l.7 1.8 1.8.7-1.8.7L19 19l-.7-1.8-1.8-.7 1.8-.7z" />
    ),
    star: (
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" />
    ),
    tag: <path d="M20 13 13 20 4 11V4h7zM8.5 8.5h.01" />,
    users: (
      <>
        <path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 20v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
  };
  return (
    <svg
      className="blog-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function compactCount(value: number) {
  return value >= 10_000
    ? `${(value / 1000).toFixed(1)}k`
    : value.toLocaleString('zh-CN');
}

function blogPostKind(post: DiscussionPost) {
  if (post.type === 'ANNOUNCEMENT') return '公告';
  return post.kind === 'SOLUTION' ||
    /题解|solution/i.test(`${post.title} ${post.summary ?? ''}`)
    ? '题解'
    : '讨论';
}

function safeCoverImage(value: string | null) {
  if (!value) return null;
  return value.startsWith('/') || /^https:\/\//i.test(value) ? value : null;
}

type BlogArticleSection = {
  title: string;
  markdown: string;
};

function splitBlogArticle(content: string): BlogArticleSection[] {
  const sections: BlogArticleSection[] = [];
  let title = '正文';
  let lines: string[] = [];
  let inCodeBlock = false;

  const flush = () => {
    const markdown = lines.join('\n').trim();
    if (markdown) sections.push({ title, markdown });
    lines = [];
  };

  for (const line of content.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) inCodeBlock = !inCodeBlock;
    const heading = !inCodeBlock ? /^#{1,3}\s+(.+?)\s*$/.exec(line) : null;
    if (heading) {
      flush();
      title = heading[1] ?? '正文';
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections.length ? sections : [{ title: '正文', markdown: content }];
}

function solutionProblemLabel(title: string) {
  return (
    title.replace(/^\s*(?:【|\[)?题解(?:】|\])?\s*[:：-]?\s*/i, '').trim() ||
    '关联题目'
  );
}

function BlogPostCard({
  post,
  navigate,
}: {
  post: DiscussionPost;
  navigate: (path: string) => void;
}) {
  const href = `/discussion/${post.publicId}`;
  const kind = blogPostKind(post);
  const badge = post.isPinned ? '置顶' : kind;
  const coverImageUrl = safeCoverImage(post.coverImageUrl);
  return (
    <article
      className={`blog-post-card${coverImageUrl ? '' : ' without-cover'}`}
      data-content-template="discussion"
    >
      <div className="blog-post-copy">
        <div className="blog-post-heading">
          <span className={`blog-kind blog-kind-${badge}`}>{badge}</span>
          <h2>
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault();
                navigate(href);
              }}
            >
              {post.title}
            </a>
          </h2>
        </div>
        {post.summary && <p>{post.summary}</p>}
        <footer>
          <DiscussionAuthorLink author={post.author} navigate={navigate} />
          <time dateTime={post.publishedAt ?? post.createdAt}>
            {formatDiscussionDate(post.publishedAt ?? post.createdAt)}
          </time>
          <span>·</span>
          <span>{post.category?.name ?? kind}</span>
          {post.dataOrigin === 'DEVELOPMENT_FIXTURE' && (
            <span className="blog-demo-badge">DEMO</span>
          )}
          <span className="blog-post-counts">
            <span>
              <BlogIcon name="comment" />
              {compactCount(post.commentCount)}
            </span>
            <span>
              <BlogIcon name="eye" />
              {compactCount(post.viewCount)}
            </span>
          </span>
        </footer>
      </div>
      {coverImageUrl && (
        <a
          className="blog-post-thumb"
          href={href}
          aria-label={`阅读 ${post.title}`}
          onClick={(event) => {
            event.preventDefault();
            navigate(href);
          }}
        >
          <img src={coverImageUrl} alt="" loading="lazy" />
        </a>
      )}
    </article>
  );
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
  const category =
    new URLSearchParams(window.location.search).get('category')?.trim() ?? '';
  const tag =
    new URLSearchParams(window.location.search).get('tag')?.trim() ?? '';
  const [posts, setPosts] = useState<DiscussionPost[]>([]);
  const [overview, setOverview] = useState<DiscussionBlogOverview | null>(null);
  const [overviewError, setOverviewError] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [sort, setSort] = useState<BlogSort>('newest');

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ limit: '8' });
    query.set(
      'kind',
      filter === 'solution'
        ? 'SOLUTION'
        : filter === 'announcement'
          ? 'ANNOUNCEMENT'
          : 'DISCUSSION',
    );
    if (search) query.set('q', search);
    if (category) query.set('category', category);
    if (tag) query.set('tag', tag);
    setLoading(true);
    setError(false);
    setLoadMoreError(false);
    void api
      .discussionPosts(query.toString())
      .then((result) => {
        if (active) {
          setPosts(result.items);
          setNextCursor(result.nextCursor);
        }
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
  }, [api, category, filter, reload, search, tag]);

  useEffect(() => {
    let active = true;
    setOverviewError(false);
    void api
      .discussionBlogOverview()
      .then((result) => {
        if (active) setOverview(result);
      })
      .catch(() => {
        if (active) setOverviewError(true);
      });
    return () => {
      active = false;
    };
  }, [api, reload]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const query = new URLSearchParams({ limit: '8', cursor: nextCursor });
    query.set(
      'kind',
      filter === 'solution'
        ? 'SOLUTION'
        : filter === 'announcement'
          ? 'ANNOUNCEMENT'
          : 'DISCUSSION',
    );
    if (search) query.set('q', search);
    if (category) query.set('category', category);
    if (tag) query.set('tag', tag);
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const result = await api.discussionPosts(query.toString());
      setPosts((current) => [
        ...current,
        ...result.items.filter(
          (item) => !current.some((existing) => existing.id === item.id),
        ),
      ]);
      setNextCursor(result.nextCursor);
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = String(
      new FormData(event.currentTarget).get('q') ?? '',
    ).trim();
    navigate(discussionHref(filter, value, category, tag));
  };
  const emptyTitle =
    filter === 'announcement'
      ? '暂时没有公告'
      : filter === 'solution'
        ? '暂时没有题解'
        : '这里还没有文章';
  const emptyText = search
    ? '没有找到匹配内容，换个关键词试试。'
    : filter === 'announcement'
      ? '新的站内公告会统一出现在这里。'
      : filter === 'solution'
        ? '带有“题解”关键词的文章会展示在这里。'
        : '成为第一个分享算法思考的人。';

  const visiblePosts = [...posts].sort((a, b) =>
    sort === 'comments'
      ? b.commentCount - a.commentCount
      : sort === 'views'
        ? b.viewCount - a.viewCount
        : new Date(b.publishedAt ?? b.createdAt).getTime() -
          new Date(a.publishedAt ?? a.createdAt).getTime(),
  );
  const featured = overview?.featured ?? visiblePosts[0];
  const feed = visiblePosts.filter((post) => post.id !== featured?.id);
  const authors = overview?.authors ?? [];
  const stats = overview?.stats ?? {
    todayPosts: 0,
    weekPosts: 0,
    totalAuthors: 0,
    totalPosts: 0,
  };
  const categories = overview?.categories ?? [];
  const hotTags = overview?.tags ?? [];

  return (
    <section className="blog-hub">
      <header className="blog-masthead">
        <div>
          <h1>用文字记录思考，让算法的世界更温暖</h1>
          <p>
            <span aria-hidden="true" />
            分享经验 · 交流思想 · 共同成长
          </p>
        </div>
        <p className="blog-masthead-note">
          代码之外
          <br />
          还有更大的世界
          <small>
            MORE THAN CODE
            <br />A BRIGHTER TOMORROW
          </small>
        </p>
      </header>

      <div className="blog-layout">
        <aside className="blog-leftbar" aria-label="博客导航">
          <button
            className="blog-write"
            type="button"
            onClick={() => navigate(user ? '/discussion/new' : '/login')}
          >
            <BlogIcon name="edit" />
            写文章
          </button>
          <nav>
            <a
              className="active"
              href="/discussion"
              onClick={(event) => {
                event.preventDefault();
                navigate('/discussion');
              }}
            >
              <BlogIcon name="file" />
              全部文章
            </a>
            <button
              type="button"
              data-ui-only="true"
              title="关注文章功能将在后续接入"
            >
              <BlogIcon name="comment" />
              我的关注
            </button>
            <button
              type="button"
              data-ui-only="true"
              title="收藏文章功能将在后续接入"
            >
              <BlogIcon name="star" />
              我的收藏
            </button>
            <button
              type="button"
              data-ui-only="true"
              title="浏览历史功能将在后续接入"
            >
              <BlogIcon name="history" />
              浏览历史
            </button>
          </nav>
          <section>
            <h2>文章分类</h2>
            <div className="blog-category-list">
              <a
                className={!category ? 'active' : ''}
                href={discussionHref(filter, search, '', tag)}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(discussionHref(filter, search, '', tag));
                }}
              >
                <BlogIcon name="archive" />
                全部分类
                <small>{stats.totalPosts}</small>
              </a>
              {categories.map((item, index) => (
                <a
                  key={item.slug}
                  className={category === item.slug ? 'active' : ''}
                  href={discussionHref(filter, search, item.slug, tag)}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(discussionHref(filter, search, item.slug, tag));
                  }}
                >
                  <BlogIcon name={index % 2 ? 'folder' : 'archive'} />
                  {item.name}
                  <small>{item.postCount}</small>
                </a>
              ))}
              {overviewError && (
                <p className="blog-side-error">分类暂时不可用</p>
              )}
            </div>
          </section>
          <section>
            <div className="blog-side-heading">
              <h2>热门标签</h2>
              {tag && (
                <button
                  type="button"
                  onClick={() =>
                    navigate(discussionHref(filter, search, category, ''))
                  }
                >
                  清除
                </button>
              )}
            </div>
            <div className="blog-tag-cloud">
              {hotTags.slice(0, 10).map((item) => (
                <button
                  className={tag === item.slug ? 'active' : ''}
                  key={item.slug}
                  type="button"
                  onClick={() =>
                    navigate(
                      discussionHref(filter, search, category, item.slug),
                    )
                  }
                >
                  # {item.name} {item.postCount}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h2>快速导航</h2>
            <div className="blog-quick-links">
              <button type="button" data-ui-only="true">
                发布公告
              </button>
              <button type="button" data-ui-only="true">
                优秀作者
              </button>
              <button type="button" data-ui-only="true">
                创作指南
              </button>
              <button type="button" data-ui-only="true">
                加入我们
              </button>
            </div>
          </section>
        </aside>

        <main className="blog-main">
          <section className="blog-featured">
            <span>精选讨论</span>
            <h2>{featured?.title ?? '为什么热爱算法？'}</h2>
            <p>
              {featured?.summary ?? '是挑战，是成长，还是遇见了更好的自己？'}
            </p>
            <div>
              <span>
                <BlogIcon name="comment" />
                {featured ? compactCount(featured.commentCount) : '—'}
              </span>
              <span>
                <BlogIcon name="eye" />
                {featured ? compactCount(featured.viewCount) : '—'}
              </span>
            </div>
            {featured && (
              <a
                href={`/discussion/${featured.publicId}`}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(`/discussion/${featured.publicId}`);
                }}
              >
                参与讨论
                <BlogIcon name="arrow" />
              </a>
            )}
            <i />
            <i />
            <i />
          </section>

          <div className="blog-feed-toolbar">
            <nav aria-label="博客内容分类">
              {discussionFilters.map((item) => {
                const href = discussionHref(item.value, search, category, tag);
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
            <div role="group" aria-label="文章排序">
              {(
                [
                  ['newest', '最新发布'],
                  ['comments', '最多回复'],
                  ['views', '最多浏览'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={sort === value ? 'active' : ''}
                  aria-pressed={sort === value}
                  onClick={() => setSort(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <form className="blog-search" role="search" onSubmit={submitSearch}>
            <label className="sr-only" htmlFor="discussion-search">
              搜索博客文章
            </label>
            <input
              id="discussion-search"
              key={search}
              name="q"
              type="search"
              defaultValue={search}
              placeholder="搜索文章标题、摘要或标签…"
            />
            <button type="submit">搜索</button>
          </form>

          {loading ? (
            <DiscussionFeedSkeleton />
          ) : error ? (
            <div className="discussion-error-state" role="alert">
              <div aria-hidden="true">!</div>
              <h2>加载博客内容失败</h2>
              <p>暂时无法取得内容，请稍后重试。</p>
              <button onClick={() => setReload((value) => value + 1)}>
                重试
              </button>
            </div>
          ) : feed.length ? (
            <div className="blog-feed" role="feed" aria-label="博客文章">
              {feed.map((post) => (
                <BlogPostCard key={post.id} post={post} navigate={navigate} />
              ))}
              {(nextCursor || loadMoreError) && (
                <div className="blog-pagination">
                  {loadMoreError && <p role="alert">更多文章加载失败。</p>}
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? '正在加载…' : '加载更多文章'}
                  </button>
                </div>
              )}
            </div>
          ) : visiblePosts.length ? (
            <p className="blog-feed-end">暂无有更多文章，欢迎继续分享。</p>
          ) : (
            <div className="discussion-empty-state">
              <div aria-hidden="true">文</div>
              <h2>{emptyTitle}</h2>
              <p>{emptyText}</p>
              {user && filter !== 'announcement' && !search && (
                <button onClick={() => navigate('/discussion/new')}>
                  写文章
                </button>
              )}
            </div>
          )}
        </main>

        <aside className="blog-rightbar" aria-label="博客社区概览">
          <section className="blog-panel blog-author-board">
            <div className="blog-panel-heading">
              <h2>
                <BlogIcon name="archive" />
                优秀作者榜
              </h2>
              <button type="button" data-ui-only="true">
                查看全部 <BlogIcon name="arrow" />
              </button>
            </div>
            {authors.length ? (
              <ol>
                {authors.map(({ author, postCount }, index) => (
                  <li key={author.username}>
                    <b>{index + 1}</b>
                    <DiscussionAuthorLink author={author} navigate={navigate} />
                    <strong>
                      {postCount}
                      <small> 篇</small>
                    </strong>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="blog-panel-empty">暂无作者数据</p>
            )}
          </section>
          <section className="blog-panel blog-community-stats">
            <h2>
              <BlogIcon name="chart" />
              社区数据
            </h2>
            <dl>
              <div>
                <dt>
                  <BlogIcon name="file" />
                  今日新增
                </dt>
                <dd>
                  {stats.todayPosts}
                  <small> 篇</small>
                </dd>
              </div>
              <div>
                <dt>
                  <BlogIcon name="chart" />
                  近七日新增
                </dt>
                <dd>
                  {stats.weekPosts}
                  <small> 篇</small>
                </dd>
              </div>
              <div>
                <dt>
                  <BlogIcon name="users" />
                  注册作者
                </dt>
                <dd>{stats.totalAuthors}</dd>
              </div>
              <div>
                <dt>
                  <BlogIcon name="archive" />
                  文章总数
                </dt>
                <dd>{stats.totalPosts}</dd>
              </div>
            </dl>
            <blockquote>“每一个认真分享的人，都在点亮别人的路。”</blockquote>
          </section>
          <section className="blog-panel blog-hot-posts">
            <div className="blog-panel-heading">
              <h2>
                <BlogIcon name="star" />
                热门文章
              </h2>
            </div>
            {overview?.hotPosts.length ? (
              <ol>
                {overview.hotPosts.slice(0, 4).map((post, index) => (
                  <li key={post.id}>
                    <b>{index + 1}</b>
                    <a
                      href={`/discussion/${post.publicId}`}
                      onClick={(event) => {
                        event.preventDefault();
                        navigate(`/discussion/${post.publicId}`);
                      }}
                    >
                      {post.title}
                    </a>
                    <small>{compactCount(post.viewCount)} 浏览</small>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="blog-panel-empty">暂无热门文章</p>
            )}
          </section>
          <section className="blog-panel blog-recent-comments">
            <div className="blog-panel-heading">
              <h2>
                <BlogIcon name="comment" />
                最新评论
              </h2>
              <button type="button" data-ui-only="true">
                查看更多 <BlogIcon name="arrow" />
              </button>
            </div>
            {overview?.recentComments.length ? (
              <ul>
                {overview.recentComments.map((comment) => (
                  <li key={comment.id}>
                    <DiscussionAuthorLink
                      author={comment.author}
                      navigate={navigate}
                    />
                    <p>
                      {comment.contentMarkdown
                        .replace(/[#*_`>]/g, '')
                        .slice(0, 48)}
                    </p>
                    {comment.post && (
                      <a
                        className="blog-comment-post"
                        href={`/discussion/${comment.post.publicId}`}
                        onClick={(event) => {
                          event.preventDefault();
                          navigate(`/discussion/${comment.post!.publicId}`);
                        }}
                      >
                        {comment.post.title}
                      </a>
                    )}
                    <time dateTime={comment.createdAt}>
                      {formatDiscussionDate(comment.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="blog-panel-empty">暂无最新评论</p>
            )}
          </section>
        </aside>
      </div>
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
      const loaded = await api.discussionPost(id);
      setPost(loaded);
      setLiked(Boolean(loaded.viewerLiked));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '文章加载失败');
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  const refreshPost = useCallback(async () => {
    if (!post) return;
    try {
      const refreshed = await api.discussionPost(post.id, false);
      setPost(refreshed);
      if (refreshed.viewerLiked !== undefined)
        setLiked(Boolean(refreshed.viewerLiked));
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
  const kind = blogPostKind(post);
  const sections = splitBlogArticle(post.contentMarkdown);
  const isSolution = kind === '题解';
  return (
    <article
      className={`discussion-page discussion-detail${post.type === 'ANNOUNCEMENT' ? ' announcement' : ''}`}
      data-content-template="discussion"
    >
      <header className="blog-detail-hero">
        <nav aria-label="博客面包屑">
          <a
            href="/discussion"
            onClick={(event) => {
              event.preventDefault();
              navigate('/discussion');
            }}
          >
            博客
          </a>
          <span aria-hidden="true">›</span>
          <span>{kind}</span>
          <span aria-hidden="true">›</span>
          <span aria-current="page">正文</span>
        </nav>
        <div className="blog-detail-hero-copy">
          <div className="blog-detail-title-row">
            <span aria-hidden="true" />
            <h1>{post.title}</h1>
          </div>
          {post.summary && <p>{post.summary}</p>}
          <div className="blog-detail-meta">
            <DiscussionAuthorLink author={post.author} navigate={navigate} />
            <DiscussionTypeBadge type={post.type} />
            <time dateTime={publishedAt}>
              {formatDiscussionDate(publishedAt)}
            </time>
            {showUpdatedAt && (
              <time dateTime={post.updatedAt}>
                更新于 {formatDiscussionDate(post.updatedAt)}
              </time>
            )}
            <span>
              <BlogIcon name="eye" />
              {compactCount(post.viewCount)}
            </span>
            <span className="blog-detail-kind">{kind}</span>
            {post.category && (
              <span className="blog-detail-category">{post.category.name}</span>
            )}
            {(post.tags ?? []).slice(0, 4).map((tag) => (
              <span className="blog-detail-tag" key={tag.slug}>
                #{tag.name}
              </span>
            ))}
            {post.dataOrigin === 'DEVELOPMENT_FIXTURE' && (
              <span className="blog-demo-badge">DEVELOPMENT FIXTURE</span>
            )}
          </div>
        </div>

        {(post.capabilities?.canEdit || post.capabilities?.canDelete) && (
          <div className="blog-detail-owner-actions" aria-label="内容管理">
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

        <div className="blog-detail-actions" aria-label="内容操作">
          <button
            className={liked ? 'liked' : ''}
            aria-label={`${liked ? '♥' : '♡'} ${post.likeCount}`}
            aria-pressed={liked}
            disabled={!user}
            title={user ? '点赞' : '登录后点赞'}
            onClick={() => void toggleLike()}
          >
            <BlogIcon name="like" />
            <strong>{compactCount(post.likeCount)}</strong>
          </button>
          <button
            type="button"
            data-ui-only="true"
            title="收藏功能将在后续接入"
          >
            <BlogIcon name="star" />
            <strong>收藏</strong>
          </button>
          <button
            type="button"
            aria-label="复制链接"
            title="分享链接"
            onClick={() => void copyLink()}
          >
            <BlogIcon name="share" />
          </button>
          <a
            href="#blog-detail-comments"
            aria-label={`${post.commentCount} 条评论`}
          >
            <BlogIcon name="comment" />
            <strong>{compactCount(post.commentCount)}</strong>
          </a>
        </div>
      </header>

      <div className="blog-detail-layout">
        <main className="blog-detail-content">
          {sections.map((section, index) => (
            <section
              className="blog-detail-section"
              key={`${section.title}-${index}`}
            >
              <h2>
                <b>{index + 1}</b>
                {section.title}
              </h2>
              <DiscussionRenderer content={section.markdown} />
            </section>
          ))}
          {actionMessage && (
            <p className="discussion-action-message" role="status">
              {actionMessage}
            </p>
          )}
        </main>

        <aside className="blog-detail-aside">
          <section className="blog-detail-summary">
            <header>
              <h2>
                <BlogIcon name="sparkles" />
                AI总结
              </h2>
              <small>界面预览</small>
            </header>
            <ol>
              <li>
                <b>1</b>
                <p>
                  <strong>内容概要：</strong>
                  {post.summary ?? '作者暂未填写文章摘要。'}
                </p>
              </li>
              <li>
                <b>2</b>
                <p>
                  <strong>阅读结构：</strong>
                  全文按 {sections.length} 个章节整理，可从正文顺序阅读。
                </p>
              </li>
              <li>
                <b>3</b>
                <p>
                  <strong>互动建议：</strong>
                  可在评论区补充思路、提问或交流不同解法。
                </p>
              </li>
            </ol>
            <p>AI 自动总结待后端接入，当前仅展示可用的文章摘要。</p>
          </section>

          {isSolution && (
            <section className="blog-detail-problem-link">
              <header>
                <h2>
                  <BlogIcon name="link" />
                  题目链接
                </h2>
              </header>
              <div>
                <span aria-hidden="true">▥</span>
                <p>
                  <strong>{solutionProblemLabel(post.title)}</strong>
                  <small>题目关联信息待后端接入</small>
                </p>
                <button
                  type="button"
                  data-ui-only="true"
                  title="题目关联功能将在后续接入"
                >
                  打开链接 <BlogIcon name="share" />
                </button>
              </div>
            </section>
          )}

          <section
            className="blog-detail-comments-card"
            id="blog-detail-comments"
          >
            <DiscussionComments
              api={api}
              navigate={navigate}
              post={post}
              user={user}
              onCommentsChanged={() => void refreshPost()}
            />
          </section>
        </aside>
      </div>
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
