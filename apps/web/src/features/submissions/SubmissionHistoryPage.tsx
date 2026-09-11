import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ApiError,
  type ApiClient,
  type AuthenticatedUser,
  type EvaluationFilters,
  type EvaluationListItem,
  type ProfileActivity,
  type ProfileOverview,
} from '../../services/api.js';
import './SubmissionHistoryPage.css';

type SubmissionScope = 'all' | 'mine';
type ResultFilter = 'all' | 'AC' | 'FAILED' | 'RUNNING';
type SubmissionHistoryPageProps = {
  api: ApiClient;
  user: AuthenticatedUser | null;
  navigate: (path: string) => void;
};

const verdictLabels: Record<string, string> = {
  AC: '通过',
  WA: '答案错误',
  CE: '编译错误',
  RE: '运行错误',
  TLE: '超时',
  MLE: '内存超限',
  RUNNING: '评测中',
  QUEUED: '等待中',
  REJUDGING: '重测中',
  REJUDGE_PENDING: '等待重测',
  INFRA_FAILED: '评测失败',
  CANCELLED: '已取消',
  NO_VERDICT: '暂无结果',
  INCOMPLETE: '未完成',
};

const failureVerdicts = new Set(['WA', 'CE', 'RE', 'TLE', 'MLE']);

function Icon({
  name,
}: {
  name:
    | 'file'
    | 'check'
    | 'close'
    | 'clock'
    | 'search'
    | 'user'
    | 'percent'
    | 'chevron';
}) {
  const paths = {
    file: <path d="M7 3.5h7l4 4V20.5H7zM14 3.5v4h4M10 12h5M10 15.5h5" />,
    check: <path d="m7.5 12.2 3 3 6-7" />,
    close: <path d="m8.5 8.5 7 7m0-7-7 7" />,
    clock: (
      <path d="M12 7v5l3.2 2M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z" />
    ),
    search: (
      <path d="m18.5 18.5-3.7-3.7m1.7-4.8a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
    ),
    user: (
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.6-4 3-6 7-6s6.4 2 7 6" />
    ),
    percent: <path d="m7 17 10-10M8 8h.01M16 16h.01" />,
    chevron: <path d="m8.5 10 3.5 3.5 3.5-3.5" />,
  } as const;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

function number(value: number | undefined) {
  return value === undefined
    ? '—'
    : new Intl.NumberFormat('zh-CN').format(value);
}

function percent(value: number | undefined) {
  return value === undefined ? '—' : `${value.toFixed(1)}%`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  const parts = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
}

function formatMilliseconds(value: number | undefined) {
  return value === undefined ? '—' : `${value} ms`;
}

function formatBytes(value: number | undefined) {
  if (value === undefined) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function verdictTone(value: string) {
  if (value === 'AC') return 'accepted';
  if (failureVerdicts.has(value)) return 'failed';
  if (['RUNNING', 'QUEUED', 'REJUDGING', 'REJUDGE_PENDING'].includes(value))
    return 'running';
  return 'pending';
}

function Sparkline({
  values,
  tone,
}: {
  values?: number[] | undefined;
  tone: 'blue' | 'green' | 'red' | 'purple';
}) {
  const points = useMemo(() => {
    if (!values?.length) return '';
    const maximum = Math.max(...values, 1);
    return values
      .map(
        (value, index) =>
          `${(index / Math.max(values.length - 1, 1)) * 62},${26 - (value / maximum) * 20}`,
      )
      .join(' ');
  }, [values]);
  return (
    <svg
      className={`submission-sparkline tone-${tone}`}
      viewBox="0 0 64 30"
      aria-hidden="true"
    >
      {points ? (
        <polyline points={points} />
      ) : (
        <path className="submission-sparkline__empty" d="M2 24h60" />
      )}
    </svg>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  note,
  tone,
  values,
}: {
  icon: 'file' | 'check' | 'close' | 'clock';
  label: string;
  value: string;
  note: string;
  tone: 'blue' | 'green' | 'red' | 'purple';
  values?: number[] | undefined;
}) {
  return (
    <article className={`submission-summary-card tone-${tone}`}>
      <span className="submission-summary-card__icon">
        <Icon name={icon} />
      </span>
      <div>
        <span className="submission-summary-card__label">{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
      <Sparkline values={values} tone={tone} />
    </article>
  );
}

function SummaryCards({
  scope,
  overview,
  activity,
  profileLoading,
}: {
  scope: SubmissionScope;
  overview?: ProfileOverview | undefined;
  activity?: ProfileActivity | undefined;
  profileLoading: boolean;
}) {
  const mine = scope === 'mine';
  const total = mine ? overview?.submissionCount : undefined;
  const accepted = mine ? overview?.acceptedSubmissionCount : undefined;
  const failed =
    total === undefined || accepted === undefined
      ? undefined
      : Math.max(total - accepted, 0);
  const rate =
    total === undefined || accepted === undefined
      ? undefined
      : total === 0
        ? 0
        : (accepted / total) * 100;
  const values = activity?.days.slice(-7).map((day) => day.submissionCount);
  const acceptedValues = activity?.days
    .slice(-7)
    .map((day) => day.acceptedCount);
  const failedValues = activity?.days
    .slice(-7)
    .map((day) => Math.max(day.submissionCount - day.acceptedCount, 0));
  const unavailable = mine
    ? profileLoading
      ? '正在读取统计…'
      : '暂无可用统计'
    : '等待全站汇总 API';
  return (
    <div
      className="submission-summary-grid"
      aria-label={mine ? '我的提交概览' : '全站提交概览'}
    >
      <SummaryCard
        icon="file"
        label={mine ? '我的总提交数' : '总提交数'}
        value={profileLoading && mine ? '…' : number(total)}
        note={unavailable}
        tone="blue"
        values={mine ? values : undefined}
      />
      <SummaryCard
        icon="check"
        label={mine ? '我的通过提交' : '通过提交'}
        value={profileLoading && mine ? '…' : number(accepted)}
        note={rate === undefined ? unavailable : `通过率 ${percent(rate)}`}
        tone="green"
        values={mine ? acceptedValues : undefined}
      />
      <SummaryCard
        icon="close"
        label={mine ? '我的未通过提交' : '未通过提交'}
        value={profileLoading && mine ? '…' : number(failed)}
        note={
          rate === undefined ? unavailable : `未通过率 ${percent(100 - rate)}`
        }
        tone="red"
        values={mine ? failedValues : undefined}
      />
      <SummaryCard
        icon="clock"
        label={mine ? '我的评测中' : '评测中'}
        value="—"
        note="等待状态汇总 API"
        tone="purple"
      />
    </div>
  );
}

function MiniMetric({
  icon,
  label,
  value,
  tone,
  bars = false,
}: {
  icon: 'file' | 'check' | 'user' | 'percent';
  label: string;
  value: string;
  tone: 'blue' | 'green' | 'purple';
  bars?: boolean;
}) {
  return (
    <div className={`submission-mini-metric tone-${tone}`}>
      <span>
        <Icon name={icon} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{value === '—' ? '暂无汇总数据' : '来自真实统计'}</em>
      </div>
      {bars && (
        <i aria-hidden="true">
          <b />
          <b />
          <b />
          <b />
          <b />
        </i>
      )}
    </div>
  );
}

function DonutCard({ scope }: { scope: SubmissionScope }) {
  const categories = [
    ['答案错误', 'red'],
    ['运行错误', 'orange'],
    ['超时', 'amber'],
    ['内存超限', 'purple'],
    ['编译错误', 'blue'],
  ];
  return (
    <section className="submission-side-card submission-donut-card">
      <h2>
        <span>
          <Icon name="file" />
        </span>
        {scope === 'mine' ? '我的错误类型分析' : '全站错误类型分析'}
      </h2>
      <div className="submission-donut-card__body">
        <div className="submission-donut" aria-label="暂无错误类型汇总数据">
          <strong>—</strong>
          <span>未通过提交</span>
        </div>
        <ul>
          {categories.map(([label, tone]) => (
            <li key={label}>
              <i className={`tone-${tone}`} />
              <span>{label}</span>
              <b>—</b>
              <em>—</em>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function TrendChart({
  activity,
  scope,
}: {
  activity?: ProfileActivity | undefined;
  scope: SubmissionScope;
}) {
  const days = activity?.days.slice(-7) ?? [];
  const maximum = Math.max(...days.map((day) => day.submissionCount), 1);
  const points = (pick: (day: ProfileActivity['days'][number]) => number) =>
    days
      .map(
        (day, index) => `${10 + index * 47},${88 - (pick(day) / maximum) * 66}`,
      )
      .join(' ');
  return (
    <section className="submission-side-card submission-trend-card">
      <div className="submission-side-card__heading">
        <h2>
          <span>
            <Icon name="file" />
          </span>
          {scope === 'mine' ? '我的提交趋势' : '全站提交趋势'}
        </h2>
        <button type="button" disabled>
          最近7天 <Icon name="chevron" />
        </button>
      </div>
      <div className="submission-chart-legend">
        <span className="tone-blue">总提交数</span>
        <span className="tone-green">AC 数</span>
        <span className="tone-red">未通过数</span>
      </div>
      <svg
        className="submission-trend-chart"
        viewBox="0 0 306 118"
        role="img"
        aria-label={days.length ? '最近七天提交趋势' : '暂无趋势数据'}
      >
        <g className="submission-trend-chart__grid">
          <path d="M10 22H296M10 44H296M10 66H296M10 88H296M10 22V88M57 22V88M104 22V88M151 22V88M198 22V88M245 22V88M296 22V88" />
        </g>
        {days.length > 0 && (
          <>
            <polyline
              className="tone-blue"
              points={points((day) => day.submissionCount)}
            />
            <polyline
              className="tone-green"
              points={points((day) => day.acceptedCount)}
            />
            <polyline
              className="tone-red"
              points={points((day) =>
                Math.max(day.submissionCount - day.acceptedCount, 0),
              )}
            />
            {days.map((day, index) => (
              <text
                key={day.date}
                x={10 + index * 47}
                y="108"
                textAnchor="middle"
              >
                {day.date.slice(5)}
              </text>
            ))}
          </>
        )}
        {days.length === 0 && (
          <text
            className="submission-trend-chart__empty"
            x="153"
            y="62"
            textAnchor="middle"
          >
            等待趋势汇总 API
          </text>
        )}
      </svg>
    </section>
  );
}

function AnalyticsSidebar({
  scope,
  activity,
}: {
  scope: SubmissionScope;
  activity?: ProfileActivity | undefined;
}) {
  const today = activity?.days.at(-1);
  const todayRate = today?.submissionCount
    ? (today.acceptedCount / today.submissionCount) * 100
    : today?.submissionCount === 0
      ? 0
      : undefined;
  return (
    <aside className="submission-analytics" aria-label="评测数据分析">
      <section className="submission-side-card submission-today-card">
        <div className="submission-side-card__heading">
          <h2>
            <span>
              <Icon name="file" />
            </span>
            {scope === 'mine' ? '我的今日数据' : '全站数据'}
          </h2>
          <button type="button" disabled>
            今日 <Icon name="chevron" />
          </button>
        </div>
        <div className="submission-today-grid">
          <MiniMetric
            icon="file"
            label="今日提交数"
            value={scope === 'mine' ? number(today?.submissionCount) : '—'}
            tone="blue"
            bars
          />
          <MiniMetric
            icon="check"
            label="今日 AC 数"
            value={scope === 'mine' ? number(today?.acceptedCount) : '—'}
            tone="green"
            bars
          />
          <MiniMetric
            icon="user"
            label={scope === 'mine' ? '活跃时长' : '活跃用户'}
            value="—"
            tone="purple"
            bars
          />
          <MiniMetric
            icon="percent"
            label={scope === 'mine' ? '今日通过率' : '全站通过率'}
            value={scope === 'mine' ? percent(todayRate) : '—'}
            tone="blue"
          />
        </div>
      </section>
      <DonutCard scope={scope} />
      <TrendChart
        activity={scope === 'mine' ? activity : undefined}
        scope={scope}
      />
    </aside>
  );
}

function ResultBadge({ row }: { row: EvaluationListItem }) {
  const value = row.verdict ?? row.status;
  return (
    <strong className={`submission-result tone-${verdictTone(value)}`}>
      <span aria-hidden="true">
        {value === 'AC' ? '✓' : failureVerdicts.has(value) ? '×' : '●'}
      </span>
      {verdictLabels[value] ?? value}
    </strong>
  );
}

function SubmissionTable({
  items,
  navigate,
}: {
  items: EvaluationListItem[];
  navigate: (path: string) => void;
}) {
  return (
    <div className="submission-table-wrap">
      <table className="submission-table">
        <thead>
          <tr>
            <th>提交ID</th>
            <th>
              提交时间 <span aria-hidden="true">↕</span>
            </th>
            <th>用户</th>
            <th>题目</th>
            <th>语言</th>
            <th>结果</th>
            <th>用时</th>
            <th>内存</th>
            <th>代码长度</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => {
            const detailPath = `/submissions/${encodeURIComponent(row.submissionId)}`;
            return (
              <tr key={row.submissionId}>
                <td>
                  <a
                    href={detailPath}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(detailPath);
                    }}
                    aria-label={`查看评测 ${row.publicNumber !== undefined ? `#${row.publicNumber}` : row.submissionId}`}
                  >
                    #{row.publicNumber ?? row.submissionId}
                  </a>
                </td>
                <td>
                  <time dateTime={row.createdAt}>
                    {formatDate(row.createdAt)}
                  </time>
                </td>
                <td>
                  <span className="submission-user">
                    {row.submitter.displayName}
                  </span>
                </td>
                <td>
                  <a
                    href={`/problems/${encodeURIComponent(row.problem.id)}`}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(
                        `/problems/${encodeURIComponent(row.problem.id)}`,
                      );
                    }}
                  >
                    <b>{row.problem.publicId || row.problem.slug}</b>
                    <span>{row.problem.title}</span>
                  </a>
                </td>
                <td>{row.languageProfileId}</td>
                <td>
                  <ResultBadge row={row} />
                </td>
                <td>{formatMilliseconds(row.totalTimeMs)}</td>
                <td>{formatBytes(row.peakMemoryBytes)}</td>
                <td>—</td>
                <td>
                  <a
                    href={detailPath}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(detailPath);
                    }}
                  >
                    详情
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SubmissionHistoryPage({
  api,
  user,
  navigate,
}: SubmissionHistoryPageProps) {
  const requestedScope: SubmissionScope =
    new URLSearchParams(window.location.search).get('scope') === 'mine'
      ? 'mine'
      : 'all';
  const initialScope = requestedScope;
  const [scope, setScope] = useState<SubmissionScope>(initialScope);
  const [items, setItems] = useState<EvaluationListItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>(
    [undefined],
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [languageFilter, setLanguageFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [problemFilter, setProblemFilter] = useState('');
  const [error, setError] = useState('');
  const [overview, setOverview] = useState<ProfileOverview>();
  const [activity, setActivity] = useState<ProfileActivity>();
  const [profileLoading, setProfileLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const requestVersion = useRef(0);
  const cursor = cursorHistory[pageIndex];

  const filters = useMemo<EvaluationFilters>(
    () => ({
      ...(resultFilter === 'AC' ? { verdict: 'AC' } : {}),
      ...(resultFilter === 'FAILED'
        ? { status: 'COMPLETED_WITH_VERDICT' }
        : {}),
      ...(resultFilter === 'RUNNING' ? { status: 'RUNNING' } : {}),
      ...(problemFilter ? { problemId: problemFilter } : {}),
      ...(scope === 'mine' && user ? { submitterId: user.id } : {}),
      ...(languageFilter ? { languageId: languageFilter } : {}),
    }),
    [languageFilter, problemFilter, resultFilter, scope, user],
  );

  const resetPagination = () => {
    setCursorHistory([undefined]);
    setPageIndex(0);
  };

  useEffect(() => {
    if (requestedScope === scope) return;
    setScope(requestedScope);
    setCursorHistory([undefined]);
    setPageIndex(0);
  }, [requestedScope, scope]);

  useEffect(() => {
    if (scope === 'mine' && !user) {
      setItems([]);
      setNextCursor(null);
      setError('');
      return;
    }
    const version = ++requestVersion.current;
    setItems(null);
    setError('');
    void api
      .evaluations(cursor, pageSize, filters)
      .then((data) => {
        if (version !== requestVersion.current) return;
        setItems(
          resultFilter === 'FAILED'
            ? data.items.filter((row) => failureVerdicts.has(row.verdict ?? ''))
            : data.items,
        );
        setNextCursor(data.nextCursor);
      })
      .catch((cause) => {
        if (version !== requestVersion.current) return;
        setError(
          cause instanceof ApiError ? cause.message : '无法加载评测列表。',
        );
      });
    return () => {
      requestVersion.current += 1;
    };
  }, [api, cursor, filters, pageSize, reloadToken, resultFilter, scope, user]);

  useEffect(() => {
    if (scope !== 'mine' || !user) {
      setOverview(undefined);
      setActivity(undefined);
      setProfileLoading(false);
      return;
    }
    let active = true;
    setProfileLoading(true);
    void Promise.all([
      api.profileOverview(user.username),
      api.profileActivity(user.username),
    ])
      .then(([nextOverview, nextActivity]) => {
        if (!active) return;
        setOverview(nextOverview);
        setActivity(nextActivity);
      })
      .catch(() => {
        if (!active) return;
        setOverview(undefined);
        setActivity(undefined);
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, scope, user]);

  const selectScope = (nextScope: SubmissionScope) => {
    if (nextScope === 'mine' && !user) {
      navigate('/login');
      return;
    }
    setScope(nextScope);
    resetPagination();
    window.history.replaceState(
      {},
      '',
      nextScope === 'mine' ? '/submissions?scope=mine' : '/submissions',
    );
  };

  const setResult = (value: ResultFilter) => {
    setResultFilter(value);
    resetPagination();
  };
  const setLanguage = (value: string) => {
    setLanguageFilter(value);
    resetPagination();
  };
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setProblemFilter(searchInput.trim());
    resetPagination();
  };
  const goNext = () => {
    if (!nextCursor) return;
    setCursorHistory((history) => [
      ...history.slice(0, pageIndex + 1),
      nextCursor,
    ]);
    setPageIndex((index) => index + 1);
  };

  return (
    <section className="submission-page">
      <header className="submission-hero">
        <div className="submission-hero__content">
          <p>每一次提交，都是向更好的自己迈进一步</p>
          <h1 aria-label={scope === 'mine' ? '我的记录' : '评测列表'}>
            {scope === 'mine' ? '我的记录' : '评测记录'}
          </h1>
          <span>
            {scope === 'mine'
              ? '记录我在 AlgoOJ 的每一次尝试，见证自己的成长轨迹。'
              : '记录每一次代码的运行结果，见证你的成长轨迹。'}
          </span>
        </div>
        <div className="submission-hero__motto" aria-hidden="true">
          <b>代码如山</b>
          <b>行则将至</b>
          <small>
            A BRIGHTER
            <br />
            TOMORROW
          </small>
        </div>
      </header>

      <div className="submission-page__content">
        <nav className="submission-section-tabs" aria-label="评测记录视图">
          {scope === 'all' ? (
            <>
              <button
                type="button"
                className="active"
                aria-current="page"
                onClick={() => selectScope('all')}
              >
                全部记录
              </button>
              <button type="button" onClick={() => selectScope('mine')}>
                我的记录
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => navigate('/profile')}>
                我的总览
              </button>
              <button
                type="button"
                className="active"
                aria-current="page"
                onClick={() => selectScope('mine')}
              >
                我的记录
              </button>
            </>
          )}
        </nav>

        <div className="submission-dashboard">
          <div className="submission-dashboard__main">
            <SummaryCards
              scope={scope}
              overview={overview}
              activity={activity}
              profileLoading={profileLoading}
            />
            <div className="submission-toolbar" aria-label="评测筛选">
              <div className="submission-filter-group" aria-label="结果筛选">
                {(
                  [
                    ['all', '全部结果'],
                    ['AC', '已通过'],
                    ['FAILED', '未通过'],
                    ['RUNNING', '评测中'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={resultFilter === value ? 'active' : ''}
                    aria-pressed={resultFilter === value}
                    onClick={() => setResult(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div
                className="submission-filter-group submission-language-group"
                aria-label="语言筛选"
              >
                {(
                  [
                    ['', '全部语言'],
                    ['cpp20', 'C++'],
                    ['python', 'Python'],
                    ['java', 'Java'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    className={languageFilter === value ? 'active' : ''}
                    aria-pressed={languageFilter === value}
                    onClick={() => setLanguage(value)}
                  >
                    {label}
                  </button>
                ))}
                <button type="button" disabled>
                  更多 <Icon name="chevron" />
                </button>
              </div>
              <form
                className="submission-search"
                role="search"
                onSubmit={submitSearch}
              >
                <Icon name="search" />
                <input
                  aria-label="搜索评测题目"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder={
                    scope === 'mine' ? '搜索我的题目 ID…' : '搜索题目 ID…'
                  }
                />
              </form>
            </div>

            <section
              className="submission-list-card"
              aria-busy={items === null}
            >
              {scope === 'mine' && !user ? (
                <div className="submission-list-state">
                  <strong>请先登录</strong>
                  <span>登录后才能查看你的评测记录。</span>
                  <button type="button" onClick={() => navigate('/login')}>
                    登录
                  </button>
                </div>
              ) : error ? (
                <div className="submission-list-state" role="alert">
                  <strong>评测列表暂不可用</strong>
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setReloadToken((value) => value + 1);
                    }}
                  >
                    重试
                  </button>
                </div>
              ) : items === null ? (
                <div className="submission-list-state">
                  <strong>正在加载评测列表</strong>
                  <span>正在获取最新评测记录…</span>
                </div>
              ) : items.length === 0 ? (
                <div className="submission-list-state">
                  <strong>暂无评测记录</strong>
                  <span>符合当前筛选条件的提交会显示在这里。</span>
                </div>
              ) : (
                <SubmissionTable items={items} navigate={navigate} />
              )}
              <footer className="submission-pagination">
                <span>本页 {items?.length ?? 0} 条提交记录</span>
                <div>
                  <button
                    type="button"
                    aria-label="上一页"
                    disabled={pageIndex === 0 || items === null}
                    onClick={() =>
                      setPageIndex((index) => Math.max(0, index - 1))
                    }
                  >
                    ‹
                  </button>
                  {cursorHistory.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      className={pageIndex === index ? 'active' : ''}
                      aria-current={pageIndex === index ? 'page' : undefined}
                      onClick={() => setPageIndex(index)}
                    >
                      {index + 1}
                    </button>
                  ))}
                  {nextCursor && (
                    <button type="button" onClick={goNext}>
                      {pageIndex + 2}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="下一页"
                    disabled={!nextCursor || items === null}
                    onClick={goNext}
                  >
                    ›
                  </button>
                </div>
                <label>
                  <select
                    aria-label="每页记录数"
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      resetPagination();
                    }}
                  >
                    <option value={10}>10 条/页</option>
                    <option value={20}>20 条/页</option>
                    <option value={50}>50 条/页</option>
                    <option value={100}>100 条/页</option>
                  </select>
                </label>
                <label className="submission-page-jump">
                  跳至{' '}
                  <input
                    aria-label="跳转页码"
                    value={pageIndex + 1}
                    readOnly
                    disabled
                  />{' '}
                  页
                </label>
              </footer>
            </section>
          </div>
          <AnalyticsSidebar scope={scope} activity={activity} />
        </div>
      </div>
    </section>
  );
}
