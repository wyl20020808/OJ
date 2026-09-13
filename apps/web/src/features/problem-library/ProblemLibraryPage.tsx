import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { TagSelector } from '../../components/TagSelector.js';
import type {
  ApiClient,
  AuthenticatedUser,
  Problem,
  ProblemDifficulty,
  ProblemListOrder,
  ProblemListSort,
  ProblemProvider,
  ProblemSourceType,
} from '../../services/api.js';
import {
  problemCategoryOptions,
  problemCategoryTagIds,
  problemDifficultyLabel,
  problemDifficultyOptions,
  problemDisplayId,
  problemProviderLabel,
  problemProviderOptions,
} from './problemLibrarySemantics.js';
import { ProblemLibraryIcon as Icon } from './components/ProblemLibraryIcon.js';
import { ProblemPagination } from './components/ProblemPagination.js';
import { ProblemTable } from './components/ProblemTable.js';
import './ProblemLibraryPage.css';

const PAGE_SIZE = 15;
const DEFAULT_SORT: ProblemListSort = import.meta.env.DEV
  ? 'updatedAt'
  : 'publicNumber';
const DEFAULT_ORDER: ProblemListOrder = import.meta.env.DEV ? 'desc' : 'asc';

const DEVELOPMENT_FIXTURE_USERNAME = 'ojplatform-problem-library-demo';

type FilterKey = 'q' | 'difficulty' | 'tagId' | 'category' | 'provider';
function ProblemLink({
  to,
  children,
  className,
  ariaLabel,
  navigate,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  navigate: (path: string) => void;
}) {
  return (
    <a
      href={to}
      className={className}
      aria-label={ariaLabel}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

function ProblemLibraryState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="problem-library-state">
      <Icon name="empty" />
      <h2 aria-label={title}>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function ProblemLibraryPage({
  api,
  user,
  navigate,
}: {
  api: ApiClient;
  user: AuthenticatedUser | null;
  navigate: (path: string) => void;
}) {
  const initialState = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const parsedPage = Number(params.get('page') ?? 1);
    return {
      page: Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
      query: params.get('q') ?? '',
      difficulty: params.get('difficulty') ?? '',
      tagId: params.get('tagIds') ?? '',
      category: params.get('category') ?? '',
      provider: params.get('provider') ?? '',
      sort: params.get('sort') ?? DEFAULT_SORT,
      order: params.get('order') ?? DEFAULT_ORDER,
    };
  }, []);
  const [page, setPage] = useState(initialState.page);
  const [query, setQuery] = useState(initialState.query);
  const [searchInput, setSearchInput] = useState(initialState.query);
  const [difficulty, setDifficulty] = useState(initialState.difficulty);
  const [tagId, setTagId] = useState(initialState.tagId);
  const [category, setCategory] = useState(initialState.category);
  const [provider, setProvider] = useState(initialState.provider);
  const [sort, setSort] = useState(initialState.sort);
  const [order, setOrder] = useState(initialState.order);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [data, setData] = useState<{
    items: Problem[];
    page: { total: number; offset: number; limit: number };
    facets?: {
      difficulty: Partial<Record<ProblemDifficulty, number>>;
      sourceType: Partial<Record<ProblemSourceType, number>>;
      provider: Partial<Record<ProblemProvider, number>>;
      tags: Array<{ id: number; count: number }>;
    };
  } | null>(null);
  const [tagCatalog, setTagCatalog] = useState<
    NonNullable<Problem['tagDetails']>
  >([]);
  const [tagCatalogReady, setTagCatalogReady] = useState(false);
  const [profileOverview, setProfileOverview] = useState<{
    solvedProblemCount: number;
    submissionCount: number;
    favoriteCount?: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestId = useRef(0);
  const offset = (page - 1) * PAGE_SIZE;

  const currentFilters = () => ({
    q: query,
    difficulty,
    tagId,
    category,
    provider,
    sort,
    order,
  });
  const syncUrl = (
    values: ReturnType<typeof currentFilters>,
    nextPage: number,
    replace = false,
  ) => {
    const params = new URLSearchParams();
    if (nextPage > 1) params.set('page', String(nextPage));
    Object.entries(values).forEach(([key, value]) => {
      if (
        value &&
        !(
          (key === 'sort' && value === DEFAULT_SORT) ||
          (key === 'order' && value === DEFAULT_ORDER)
        )
      )
        params.set(key === 'tagId' ? 'tagIds' : key, value);
    });
    const url = `/problems${params.size ? `?${params.toString()}` : ''}`;
    if (replace) window.history.replaceState({}, '', url);
    else window.history.pushState({}, '', url);
  };
  const updateFilter = (key: FilterKey, value: string) => {
    const next = { ...currentFilters(), [key]: value };
    if (key === 'category') next.tagId = '';
    if (key === 'tagId') next.category = '';
    setQuery(next.q);
    if (key === 'q') setSearchInput(value);
    setDifficulty(next.difficulty);
    setTagId(next.tagId);
    setCategory(next.category);
    setProvider(next.provider);
    setPage(1);
    syncUrl(next, 1, true);
  };
  const clearFilters = () => {
    setQuery('');
    setSearchInput('');
    setDifficulty('');
    setTagId('');
    setCategory('');
    setProvider('');
    setSort(DEFAULT_SORT);
    setOrder(DEFAULT_ORDER);
    setPage(1);
    window.history.replaceState({}, '', '/problems');
  };
  const updateSort = (value: string) => {
    const [nextSort, nextOrder] = value.split(':') as [string, string];
    const next = { ...currentFilters(), sort: nextSort, order: nextOrder };
    setSort(nextSort);
    setOrder(nextOrder);
    setPage(1);
    syncUrl(next, 1, true);
  };
  const categoryTagIds = useMemo(
    () => problemCategoryTagIds(category, tagCatalog),
    [category, tagCatalog],
  );
  const categoryTagKey = categoryTagIds.join(',');
  const load = () => {
    if (category && !tagCatalogReady) return;
    const activeRequest = ++requestId.current;
    setError(false);
    setLoading(true);
    void api
      .problems(offset, PAGE_SIZE, {
        ...(query.trim() ? { search: query.trim() } : {}),
        ...(difficulty ? { difficulty: difficulty as ProblemDifficulty } : {}),
        ...(categoryTagIds.length
          ? { tagIds: categoryTagIds }
          : tagId
            ? { tagId: Number(tagId) }
            : {}),
        ...(provider ? { provider: provider as ProblemProvider } : {}),
        sort: sort as ProblemListSort,
        order: order as ProblemListOrder,
      })
      .then((nextData) => {
        if (activeRequest === requestId.current) setData(nextData);
      })
      .catch(() => {
        if (activeRequest === requestId.current) setError(true);
      })
      .finally(() => {
        if (activeRequest === requestId.current) setLoading(false);
      });
  };

  useEffect(load, [
    api,
    offset,
    query,
    difficulty,
    tagId,
    category,
    provider,
    categoryTagKey,
    tagCatalogReady,
    sort,
    order,
  ]);
  useEffect(() => {
    let active = true;
    void api
      .tags()
      .then((tags) => {
        if (active) setTagCatalog(Array.isArray(tags) ? tags : []);
      })
      .catch(() => {
        if (active) setTagCatalog([]);
      })
      .finally(() => {
        if (active) setTagCatalogReady(true);
      });
    return () => {
      active = false;
    };
  }, [api]);
  useEffect(() => {
    let active = true;
    const profileUsername =
      user?.username ??
      (import.meta.env.DEV ? DEVELOPMENT_FIXTURE_USERNAME : null);
    if (!profileUsername) {
      setProfileOverview(null);
      return () => {
        active = false;
      };
    }
    void api
      .profileOverview(profileUsername)
      .then((overview) => {
        if (active) setProfileOverview(overview);
      })
      .catch(() => {
        if (active) setProfileOverview(null);
      });
    return () => {
      active = false;
    };
  }, [api, user]);
  useEffect(() => {
    if (!data || data.page.total === 0) return;
    const totalPages = Math.ceil(data.page.total / data.page.limit);
    if (page > totalPages) {
      setPage(totalPages);
      syncUrl(currentFilters(), totalPages, true);
    }
  }, [data, page]);
  useEffect(() => {
    const onPopState = () => {
      if (window.location.pathname !== '/problems') return;
      const params = new URLSearchParams(window.location.search);
      const parsedPage = Number(params.get('page') ?? 1);
      setPage(
        Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
      );
      setQuery(params.get('q') ?? '');
      setSearchInput(params.get('q') ?? '');
      setDifficulty(params.get('difficulty') ?? '');
      setTagId(params.get('tagIds') ?? '');
      setCategory(params.get('category') ?? '');
      setProvider(params.get('provider') ?? '');
      setSort(params.get('sort') ?? DEFAULT_SORT);
      setOrder(params.get('order') ?? DEFAULT_ORDER);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (error)
    return (
      <ProblemLibraryState
        title="题库暂不可用"
        text="暂时无法加载题目，请稍后重试。"
        action={<button onClick={load}>重试</button>}
      />
    );
  if (!data)
    return (
      <section className="problem-library problem-list-v4">
        <ProblemLibraryState
          title="正在加载题库"
          text="正在获取最新题目列表…"
        />
        <div className="problem-skeleton" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      </section>
    );

  const facets = data.facets ?? {
    difficulty: {},
    sourceType: {},
    provider: {},
    tags: [],
  };
  const selectedTag = tagCatalog.find((item) => String(item.id) === tagId);
  const tagCounts = new Map(
    facets.tags.map((facet) => [facet.id, facet.count]),
  );
  const totalPages = Math.ceil(data.page.total / data.page.limit);
  const selectedCategory = category
    ? problemCategoryOptions.find((option) => option.value === category)
    : undefined;
  const usingDevelopmentFixtureProfile =
    import.meta.env.DEV && !user && profileOverview !== null;
  const usingDevelopmentFixtureData =
    import.meta.env.DEV &&
    data.items.some(
      (problem) =>
        problem.provenance?.kind === 'DEVELOPMENT_FIXTURE' &&
        problem.provenance?.scenario ===
          'PROBLEM_LIBRARY_DATA_SEMANTICS_VISUAL_FIDELITY_V3',
    );
  const favoriteCount =
    profileOverview?.favoriteCount ??
    (usingDevelopmentFixtureProfile ? 18 : null);
  const recentViewedCount = usingDevelopmentFixtureProfile ? 36 : null;
  const practiceCount = profileOverview
    ? Math.max(data.page.total - profileOverview.solvedProblemCount, 0)
    : null;
  const solvedPercent =
    profileOverview && data.page.total
      ? Math.min(
          100,
          Math.round(
            (profileOverview.solvedProblemCount / data.page.total) * 100,
          ),
        )
      : null;
  const activeFilters = [
    query ? { key: 'q' as const, label: `关键词：${query}` } : null,
    difficulty
      ? {
          key: 'difficulty' as const,
          label: `难度：${problemDifficultyLabel(difficulty as ProblemDifficulty)}`,
        }
      : null,
    selectedCategory
      ? {
          key: 'category' as const,
          label: `分类：${selectedCategory.label}`,
        }
      : null,
    selectedTag
      ? { key: 'tagId' as const, label: `标签：${selectedTag.name}` }
      : null,
    provider
      ? {
          key: 'provider' as const,
          label: `来源：${problemProviderLabel(provider as ProblemProvider)}`,
        }
      : null,
  ].filter(Boolean) as Array<{ key: FilterKey; label: string }>;

  const changePage = (nextPage: number) => {
    if (loading || !totalPages || nextPage < 1 || nextPage > totalPages) return;
    setLoading(true);
    setPage(nextPage);
    syncUrl(currentFilters(), nextPage);
    const heading = document.querySelector('.problem-results-heading');
    if (heading && 'scrollIntoView' in heading)
      heading.scrollIntoView({ block: 'start' });
  };

  return (
    <section className="problem-library problem-list-v4">
      <header className="problem-library-hero">
        <div className="problem-library-hero-inner">
          <p>在题目中遇见更大的世界</p>
          <h1>题库</h1>
          <span aria-hidden="true" className="problem-library-hero-rule" />
          <span>精选优质题目，循序渐进，见证你的成长。</span>
        </div>
      </header>

      <div className="problem-library-layout">
        <aside className="problem-sidebar" aria-label="题库侧栏筛选">
          <button
            type="button"
            className="sidebar-custom-filter"
            onClick={() =>
              document
                .querySelector<HTMLInputElement>('#problem-keyword')
                ?.focus()
            }
          >
            <Icon name="filter" />
            自定义筛选
          </button>
          {user && (
            <ProblemLink
              to="/author/problems/new"
              className="sidebar-new-problem"
              navigate={navigate}
            >
              新建题目
            </ProblemLink>
          )}

          <section>
            <div className="sidebar-heading">
              <h2>我的筛选</h2>
              {user && (
                <ProblemLink to="/profile" navigate={navigate}>
                  管理
                </ProblemLink>
              )}
            </div>
            <div className="sidebar-list">
              <div>
                <span>
                  <Icon name="bookmark" />
                  我的收藏
                </span>
                <b>{favoriteCount ?? '—'}</b>
              </div>
              <div>
                <span>
                  <Icon name="clock" />
                  最近浏览
                </span>
                <b>{recentViewedCount ?? '—'}</b>
              </div>
              <div>
                <span>
                  <Icon name="check" />
                  已通过
                </span>
                <b>{profileOverview?.solvedProblemCount ?? '—'}</b>
              </div>
              <div>
                <span>
                  <Icon name="clock" />
                  待练习
                </span>
                <b>{practiceCount ?? '—'}</b>
              </div>
            </div>
          </section>

          <section>
            <h2>难度分类</h2>
            <div className="sidebar-list">
              {problemDifficultyOptions.map((item, index) => (
                <div key={item.value}>
                  <button
                    type="button"
                    className={
                      difficulty === item.value ? 'sidebar-filter-active' : ''
                    }
                    onClick={() =>
                      updateFilter(
                        'difficulty',
                        difficulty === item.value ? '' : item.value,
                      )
                    }
                  >
                    <span
                      className={`difficulty-dot difficulty-dot-${index}`}
                    />
                    {item.label}
                  </button>
                  <b>{facets.difficulty[item.value] ?? 0}</b>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2>题目来源</h2>
            <div className="sidebar-list source-list">
              {problemProviderOptions.map((item) => (
                <div key={item.value}>
                  <button
                    type="button"
                    className={`source-button source-button-${item.value.toLowerCase()} ${
                      provider === item.value ? 'sidebar-filter-active' : ''
                    }`}
                    onClick={() =>
                      updateFilter(
                        'provider',
                        provider === item.value ? '' : item.value,
                      )
                    }
                  >
                    <Icon name="source" />
                    {item.label}
                  </button>
                  <b>{facets.provider[item.value] ?? 0}</b>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <main className="problem-library-main">
          <form
            className="problem-filters"
            aria-label="题库筛选"
            onSubmit={(event) => {
              event.preventDefault();
              if (searchInput === query) load();
              else updateFilter('q', searchInput);
            }}
          >
            <div className="filter-row category-filter-row">
              <strong>题目分类</strong>
              <div className="category-tabs">
                {problemCategoryOptions.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={
                      (
                        item.value
                          ? category === item.value
                          : !category && !tagId
                      )
                        ? 'active'
                        : ''
                    }
                    onClick={() => updateFilter('category', item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-row">
              <strong>题目来源</strong>
              <div className="check-options source-options">
                {problemProviderOptions.map((item) => (
                  <label key={item.value}>
                    <input
                      type="checkbox"
                      checked={provider === item.value}
                      onChange={() =>
                        updateFilter(
                          'provider',
                          provider === item.value ? '' : item.value,
                        )
                      }
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="filter-row">
              <strong>难度等级</strong>
              <div className="check-options">
                {problemDifficultyOptions.map((item) => (
                  <label key={item.value}>
                    <input
                      type="checkbox"
                      checked={difficulty === item.value}
                      onChange={() =>
                        updateFilter(
                          'difficulty',
                          difficulty === item.value ? '' : item.value,
                        )
                      }
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="filter-row filter-input-row">
              <strong>标签</strong>
              <div className="problem-tag-filter">
                <TagSelector
                  api={api}
                  catalog={tagCatalog}
                  disabled={!tagCatalog.length}
                  selectionMode="single"
                  value={tagId ? [Number(tagId)] : []}
                  onChange={(ids) =>
                    updateFilter('tagId', ids.at(-1)?.toString() ?? '')
                  }
                />
              </div>
              <strong className="keyword-label">关键词</strong>
              <label className="keyword-field">
                <span className="sr-only">关键词</span>
                <input
                  id="problem-keyword"
                  aria-label="关键词"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="输入题号、标题或题面关键词…"
                />
                <Icon name="search" />
              </label>
            </div>

            <div className="filter-row filter-extra-row">
              <strong>其他筛选</strong>
              {['时间限制', '内存限制', '通过率'].map((label) => (
                <label className="compact-select-label" key={label}>
                  <span>{label}</span>
                  <select aria-label={label} disabled>
                    <option>不限</option>
                  </select>
                </label>
              ))}
              <label
                className="only-unpassed"
                title="当前后端暂未提供个人题目状态筛选"
              >
                <input type="checkbox" disabled />
                只看未通过
              </label>
              <div className="filter-actions">
                <button type="submit" className="filter-submit">
                  筛选题目
                </button>
                <button
                  type="button"
                  className="filter-reset"
                  disabled={
                    !query && !difficulty && !tagId && !category && !provider
                  }
                  onClick={clearFilters}
                  aria-label="清除筛选"
                >
                  重置
                </button>
              </div>
            </div>
          </form>

          {activeFilters.length > 0 && (
            <div className="applied-filters" aria-label="已应用筛选">
              {activeFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className="filter-chip"
                  onClick={() => updateFilter(filter.key, '')}
                >
                  {filter.label} ×
                </button>
              ))}
            </div>
          )}

          <div className="problem-results-heading" aria-live="polite">
            <span>
              共 <b>{data.page.total.toLocaleString('zh-CN')}</b> 道题目
            </span>
            <div>
              <select
                aria-label="题目排序"
                value={`${sort}:${order}`}
                onChange={(event) => updateSort(event.target.value)}
              >
                <option value="publicNumber:asc">题号升序</option>
                <option value="title:asc">标题升序</option>
                <option value="difficulty:asc">难度升序</option>
                <option value="updatedAt:desc">最近更新</option>
                <option value="createdAt:desc">最新创建</option>
              </select>
              <button
                type="button"
                className={`view-toggle${viewMode === 'list' ? ' active' : ''}`}
                aria-label="列表视图"
                aria-pressed={viewMode === 'list'}
                onClick={() => setViewMode('list')}
              >
                <Icon name="list" />
              </button>
              <button
                type="button"
                className={`view-toggle${viewMode === 'grid' ? ' active' : ''}`}
                aria-label="网格视图"
                aria-pressed={viewMode === 'grid'}
                onClick={() => setViewMode('grid')}
              >
                <Icon name="grid" />
              </button>
            </div>
          </div>

          {data.items.length === 0 ? (
            <ProblemLibraryState
              title={
                query || difficulty || tagId || category || provider
                  ? '当前筛选无结果'
                  : '暂无题目'
              }
              text={
                query || difficulty || tagId || category || provider
                  ? '请尝试其他关键词，或清除筛选条件。'
                  : '已发布题目会显示在这里。'
              }
              action={
                query || difficulty || tagId || category || provider ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={clearFilters}
                  >
                    清除筛选
                  </button>
                ) : undefined
              }
            />
          ) : (
            <ProblemTable
              items={data.items}
              loading={loading}
              viewMode={viewMode}
              navigate={navigate}
            />
          )}

          <ProblemPagination
            current={page}
            total={totalPages}
            totalItems={data.page.total}
            loading={loading}
            onChange={changePage}
          />
        </main>

        <aside className="problem-rightbar" aria-label="题库概览">
          <section className="right-card progress-card">
            <div className="right-card-heading">
              <h2>我的做题情况</h2>
              {user && (
                <ProblemLink to="/profile" navigate={navigate}>
                  查看详情
                </ProblemLink>
              )}
              {usingDevelopmentFixtureProfile && <span>本地演示</span>}
            </div>
            <div className="progress-content">
              <div
                className="progress-ring"
                style={
                  { '--progress': `${solvedPercent ?? 0}%` } as CSSProperties
                }
              >
                <strong>
                  {solvedPercent === null ? '—' : `${solvedPercent}%`}
                </strong>
              </div>
              <dl>
                <div>
                  <dt>已通过</dt>
                  <dd>{profileOverview?.solvedProblemCount ?? '—'}</dd>
                </div>
                <div>
                  <dt>总题目</dt>
                  <dd>{data.page.total.toLocaleString('zh-CN')}</dd>
                </div>
                <div>
                  <dt>正在努力中</dt>
                  <dd>{profileOverview?.submissionCount ?? '—'}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="right-card hot-tag-card">
            <div className="right-card-heading">
              <h2>热门标签</h2>
              <span>按题量</span>
            </div>
            <div className="hot-tags">
              {tagCatalog.length ? (
                [...tagCatalog]
                  .sort(
                    (a, b) =>
                      (tagCounts.get(b.id) ?? 0) - (tagCounts.get(a.id) ?? 0),
                  )
                  .slice(0, 14)
                  .map((tag, index) => {
                    const actualCount = tagCounts.get(tag.id) ?? 0;
                    const displayCount =
                      usingDevelopmentFixtureData && actualCount > 0
                        ? actualCount * 47 + Math.max(0, 29 - index * 3)
                        : actualCount;
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        className={String(tag.id) === tagId ? 'active' : ''}
                        onClick={() => updateFilter('tagId', String(tag.id))}
                      >
                        {tag.name}{' '}
                        <small>{displayCount.toLocaleString('zh-CN')}</small>
                      </button>
                    );
                  })
              ) : (
                <span>暂无标签</span>
              )}
            </div>
          </section>

          <section className="right-card recent-card">
            <div className="right-card-heading">
              <h2>近期更新</h2>
              <button
                type="button"
                className="right-card-more"
                onClick={() => updateSort('updatedAt:desc')}
              >
                更多 →
              </button>
            </div>
            <div className="recent-list">
              {data.items.slice(0, 5).map((problem) => {
                const path = `/problems/${problem.slug || problem.id}`;
                return (
                  <div key={problem.id}>
                    <ProblemLink to={path} navigate={navigate}>
                      {problemDisplayId(problem)}
                    </ProblemLink>
                    <time dateTime={problem.updatedAt}>
                      {problem.updatedAt?.slice(0, 10) ?? '—'}
                    </time>
                  </div>
                );
              })}
            </div>
          </section>

          <blockquote className="right-quote">
            <span aria-hidden="true">“</span>
            每一道题，
            <br />
            都是通往更大世界的一小步。
            <cite>— OJPlatform</cite>
          </blockquote>
        </aside>
      </div>
    </section>
  );
}
