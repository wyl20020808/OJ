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
  ProblemSourceType,
} from '../../services/api.js';
import { ProblemLibraryIcon as Icon } from './components/ProblemLibraryIcon.js';
import { ProblemPagination } from './components/ProblemPagination.js';
import { ProblemTable } from './components/ProblemTable.js';
import './ProblemLibraryPage.css';

const PAGE_SIZE = 10;

const problemSourceLabels = {
  CREATOR: '平台创建',
  EXTERNAL: '外部题源',
  IMPORT: '导入题目',
  TEST_FIXTURE: '测试数据',
  API_AUTOMATION: 'API 自动创建',
} as const;

type ProblemSource = keyof typeof problemSourceLabels;
type FilterKey = 'q' | 'difficulty' | 'tagId' | 'sourceType';
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

function problemSourceLabel(sourceType: ProblemSource | null | undefined) {
  return sourceType ? (problemSourceLabels[sourceType] ?? '—') : '—';
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
      sourceType: params.get('sourceType') ?? '',
      sort: params.get('sort') ?? 'publicNumber',
      order: params.get('order') ?? 'asc',
    };
  }, []);
  const [page, setPage] = useState(initialState.page);
  const [query, setQuery] = useState(initialState.query);
  const [searchInput, setSearchInput] = useState(initialState.query);
  const [difficulty, setDifficulty] = useState(initialState.difficulty);
  const [tagId, setTagId] = useState(initialState.tagId);
  const [sourceType, setSourceType] = useState(initialState.sourceType);
  const [sort, setSort] = useState(initialState.sort);
  const [order, setOrder] = useState(initialState.order);
  const [data, setData] = useState<{
    items: Problem[];
    page: { total: number; offset: number; limit: number };
    facets?: {
      difficulty: Partial<Record<ProblemDifficulty, number>>;
      sourceType: Partial<Record<ProblemSourceType, number>>;
      tags: Array<{ id: number; count: number }>;
    };
  } | null>(null);
  const [tagCatalog, setTagCatalog] = useState<
    NonNullable<Problem['tagDetails']>
  >([]);
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
    sourceType,
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
          (key === 'sort' && value === 'publicNumber') ||
          (key === 'order' && value === 'asc')
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
    setQuery(next.q);
    if (key === 'q') setSearchInput(value);
    setDifficulty(next.difficulty);
    setTagId(next.tagId);
    setSourceType(next.sourceType);
    setPage(1);
    syncUrl(next, 1, true);
  };
  const clearFilters = () => {
    setQuery('');
    setSearchInput('');
    setDifficulty('');
    setTagId('');
    setSourceType('');
    setSort('publicNumber');
    setOrder('asc');
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
  const load = () => {
    const activeRequest = ++requestId.current;
    setError(false);
    setLoading(true);
    void api
      .problems(offset, PAGE_SIZE, {
        ...(query.trim() ? { search: query.trim() } : {}),
        ...(difficulty ? { difficulty: difficulty as ProblemDifficulty } : {}),
        ...(tagId ? { tagId: Number(tagId) } : {}),
        ...(sourceType ? { sourceType: sourceType as ProblemSourceType } : {}),
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
    sourceType,
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
      });
    return () => {
      active = false;
    };
  }, [api]);
  useEffect(() => {
    let active = true;
    if (!user) {
      setProfileOverview(null);
      return () => {
        active = false;
      };
    }
    void api
      .profileOverview(user.username)
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
      setSourceType(params.get('sourceType') ?? '');
      setSort(params.get('sort') ?? 'publicNumber');
      setOrder(params.get('order') ?? 'asc');
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

  const difficultyOptions = ['入门', '简单', '中等', '困难', '专家'];
  const sourceOptions = Object.keys(problemSourceLabels) as ProblemSource[];
  const facets = data.facets ?? { difficulty: {}, sourceType: {}, tags: [] };
  const selectedTag = tagCatalog.find((item) => String(item.id) === tagId);
  const tagCounts = new Map(
    facets.tags.map((facet) => [facet.id, facet.count]),
  );
  const totalPages = Math.ceil(data.page.total / data.page.limit);
  const categoryOptions = [
    { label: '全部题目', value: '' },
    ...tagCatalog.slice(0, 6).map((tag) => ({
      label: tag.name,
      value: String(tag.id),
    })),
  ];
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
      ? { key: 'difficulty' as const, label: `难度：${difficulty}` }
      : null,
    selectedTag
      ? { key: 'tagId' as const, label: `标签：${selectedTag.name}` }
      : null,
    sourceType
      ? {
          key: 'sourceType' as const,
          label: `来源：${problemSourceLabel(sourceType as ProblemSource)}`,
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
                <b>{profileOverview?.favoriteCount ?? '—'}</b>
              </div>
              <div>
                <span>
                  <Icon name="clock" />
                  最近浏览
                </span>
                <b>—</b>
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
                <b>—</b>
              </div>
            </div>
          </section>

          <section>
            <h2>难度分类</h2>
            <div className="sidebar-list">
              {difficultyOptions.map((item, index) => (
                <div key={item}>
                  <button
                    type="button"
                    className={
                      difficulty === item ? 'sidebar-filter-active' : ''
                    }
                    onClick={() =>
                      updateFilter(
                        'difficulty',
                        difficulty === item ? '' : item,
                      )
                    }
                  >
                    <span
                      className={`difficulty-dot difficulty-dot-${index}`}
                    />
                    {item}
                  </button>
                  <b>{facets.difficulty[item as ProblemDifficulty] ?? 0}</b>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2>题目来源</h2>
            <div className="sidebar-list source-list">
              {sourceOptions.map((item) => (
                <div key={item}>
                  <button
                    type="button"
                    className={`source-button source-button-${item.toLowerCase().replace('_', '-')} ${
                      sourceType === item ? 'sidebar-filter-active' : ''
                    }`}
                    onClick={() =>
                      updateFilter(
                        'sourceType',
                        sourceType === item ? '' : item,
                      )
                    }
                  >
                    <Icon name="source" />
                    {problemSourceLabel(item)}
                  </button>
                  <b>{facets.sourceType[item] ?? 0}</b>
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
                {categoryOptions.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={
                      (item.value ? tagId === item.value : !tagId)
                        ? 'active'
                        : ''
                    }
                    onClick={() => updateFilter('tagId', item.value)}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="category-more"
                  onClick={() =>
                    document
                      .querySelector<HTMLButtonElement>(
                        '.problem-tag-filter .tag-selector-trigger',
                      )
                      ?.click()
                  }
                >
                  其他标签
                </button>
              </div>
            </div>

            <div className="filter-row">
              <strong>题目来源</strong>
              <div className="check-options source-options">
                {sourceOptions.map((item) => (
                  <label key={item}>
                    <input
                      type="checkbox"
                      checked={sourceType === item}
                      onChange={() =>
                        updateFilter(
                          'sourceType',
                          sourceType === item ? '' : item,
                        )
                      }
                    />
                    {problemSourceLabel(item)}
                  </label>
                ))}
              </div>
            </div>

            <div className="filter-row">
              <strong>难度等级</strong>
              <div className="check-options">
                {difficultyOptions.map((item) => (
                  <label key={item}>
                    <input
                      type="checkbox"
                      checked={difficulty === item}
                      onChange={() =>
                        updateFilter(
                          'difficulty',
                          difficulty === item ? '' : item,
                        )
                      }
                    />
                    {item}
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
                  disabled={!query && !difficulty && !tagId && !sourceType}
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
                className="view-toggle active"
                aria-label="列表视图"
                aria-pressed="true"
              >
                <Icon name="list" />
              </button>
              <button
                type="button"
                className="view-toggle"
                aria-label="网格视图暂不可用"
                disabled
              >
                <Icon name="grid" />
              </button>
            </div>
          </div>

          {data.items.length === 0 ? (
            <ProblemLibraryState
              title={
                query || difficulty || tagId || sourceType
                  ? '当前筛选无结果'
                  : '暂无题目'
              }
              text={
                query || difficulty || tagId || sourceType
                  ? '请尝试其他关键词，或清除筛选条件。'
                  : '已发布题目会显示在这里。'
              }
              action={
                query || difficulty || tagId || sourceType ? (
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
                  <dt>提交记录</dt>
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
                  .map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={String(tag.id) === tagId ? 'active' : ''}
                      onClick={() => updateFilter('tagId', String(tag.id))}
                    >
                      {tag.name} <small>{tagCounts.get(tag.id) ?? 0}</small>
                    </button>
                  ))
              ) : (
                <span>暂无标签</span>
              )}
            </div>
          </section>

          <section className="right-card recent-card">
            <div className="right-card-heading">
              <h2>近期更新</h2>
              <span>当前结果</span>
            </div>
            <div className="recent-list">
              {data.items.slice(0, 5).map((problem) => {
                const path = `/problems/${problem.slug || problem.id}`;
                return (
                  <div key={problem.id}>
                    <ProblemLink to={path} navigate={navigate}>
                      {problem.publicId ?? problem.slug}
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
