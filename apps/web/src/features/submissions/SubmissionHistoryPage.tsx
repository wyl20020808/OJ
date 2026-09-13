import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ApiError,
  type ApiClient,
  type AuthenticatedUser,
  type EvaluationFilters,
  type EvaluationListItem,
  type EvaluationStatistics,
  type EvaluationTrendPoint,
} from '../../services/api.js';
import './SubmissionHistoryPage.css';

type SubmissionScope = 'all' | 'mine';
type ResultFilter = 'all' | 'AC' | 'FAILED' | 'RUNNING';
type Tone = 'blue' | 'green' | 'red' | 'purple';

type SubmissionHistoryPageProps = {
  api: ApiClient;
  user: AuthenticatedUser | null;
  navigate: (path: string) => void;
};

const failureVerdicts = new Set(['WA', 'CE', 'RE', 'TLE', 'MLE']);
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
const languageLabels: Record<string, string> = {
  cpp20: 'C++',
  'cpp20-gcc-13-v1': 'C++',
  python: 'Python',
  'python-3.12-v1': 'Python',
  java: 'Java',
  'java-21-v1': 'Java',
};

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

function delta(value: number | undefined) {
  if (value === undefined) return '较昨日暂无基线';
  return `较昨日 ${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
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
  tone: Tone;
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
        <>
          <polyline points={points} />
          <polygon points={`0,28 ${points} 62,28`} />
        </>
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
  tone: Tone;
  values?: number[] | undefined;
}) {
  return (
    <article className={`submission-history-summary-card tone-${tone}`}>
      <span className="submission-history-summary-card__icon">
        <Icon name={icon} />
      </span>
      <div>
        <span className="submission-history-summary-card__label">{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
      <Sparkline values={values} tone={tone} />
    </article>
  );
}

function SummaryCards({
  scope,
  statistics,
  loading,
}: {
  scope: SubmissionScope;
  statistics?: EvaluationStatistics | undefined;
  loading: boolean;
}) {
  const mine = scope === 'mine';
  const values = statistics?.trend.map((day) => day.total);
  const acceptedValues = statistics?.trend.map((day) => day.accepted);
  const failedValues = statistics?.trend.map((day) => day.failed);
  const judgingValues = statistics?.trend.map((day) =>
    Math.max(day.total - day.accepted - day.failed, 0),
  );
  return (
    <div
      className="submission-summary-grid"
      aria-label={mine ? '我的提交概览' : '全站提交概览'}
    >
      <SummaryCard
        icon="file"
        label={mine ? '我的总提交数' : '总提交数'}
        value={loading ? '…' : number(statistics?.total)}
        note={
          statistics
            ? delta(statistics.today.submissionDeltaPercent)
            : '正在汇总'
        }
        tone="blue"
        values={values}
      />
      <SummaryCard
        icon="check"
        label={mine ? '我的通过提交' : '通过提交'}
        value={loading ? '…' : number(statistics?.accepted)}
        note={
          statistics ? `通过率 ${percent(statistics.passRate)}` : '正在汇总'
        }
        tone="green"
        values={acceptedValues}
      />
      <SummaryCard
        icon="close"
        label={mine ? '我的未通过提交' : '未通过提交'}
        value={loading ? '…' : number(statistics?.failed)}
        note={
          statistics
            ? `未通过率 ${percent(statistics.total ? (statistics.failed / statistics.total) * 100 : 0)}`
            : '正在汇总'
        }
        tone="red"
        values={failedValues}
      />
      <SummaryCard
        icon="clock"
        label={mine ? '我的评测中' : '评测中'}
        value={loading ? '…' : number(statistics?.judging)}
        note={
          statistics
            ? `占比 ${percent(statistics.total ? (statistics.judging / statistics.total) * 100 : 0)}`
            : '正在汇总'
        }
        tone="purple"
        values={judgingValues}
      />
    </div>
  );
}

function MiniMetric({
  icon,
  label,
  value,
  note,
  tone,
  bars = false,
}: {
  icon: 'file' | 'check' | 'user' | 'percent';
  label: string;
  value: string;
  note: string;
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
        <em>{note}</em>
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

const verdictCategories = [
  { verdict: 'WA', label: '答案错误', color: '#ff3f50', tone: 'red' },
  { verdict: 'RE', label: '运行错误', color: '#f77b24', tone: 'orange' },
  { verdict: 'TLE', label: '超时', color: '#f5a91b', tone: 'amber' },
  { verdict: 'MLE', label: '内存超限', color: '#6f55ef', tone: 'purple' },
  { verdict: 'CE', label: '编译错误', color: '#247be8', tone: 'blue' },
] as const;

function DonutCard({
  scope,
  statistics,
}: {
  scope: SubmissionScope;
  statistics?: EvaluationStatistics | undefined;
}) {
  const total = statistics?.failed ?? 0;
  let cursor = 0;
  const segments = verdictCategories.map((category) => {
    const count = statistics?.verdicts[category.verdict] ?? 0;
    const start = cursor;
    cursor += total ? (count / total) * 100 : 0;
    return `${category.color} ${start}% ${cursor}%`;
  });
  return (
    <section className="submission-side-card submission-donut-card">
      <h2>
        <span>
          <Icon name="file" />
        </span>
        {scope === 'mine' ? '我的错误类型分析' : '全站错误类型分析'}
      </h2>
      <div className="submission-donut-card__body">
        <div
          className={`submission-donut${total ? ' has-data' : ''}`}
          style={
            total
              ? { background: `conic-gradient(${segments.join(',')})` }
              : undefined
          }
          aria-label={
            total ? `未通过提交 ${number(total)} 次` : '暂无错误类型汇总数据'
          }
        >
          <span className="submission-donut__center">
            <strong>{number(total)}</strong>
            <small>未通过提交</small>
          </span>
        </div>
        <ul>
          {verdictCategories.map((category) => {
            const count = statistics?.verdicts[category.verdict] ?? 0;
            return (
              <li key={category.verdict}>
                <i className={`tone-${category.tone}`} />
                <span>{category.label}</span>
                <b>{number(count)}</b>
                <em>{percent(total ? (count / total) * 100 : 0)}</em>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function TrendChart({
  scope,
  statistics,
}: {
  scope: SubmissionScope;
  statistics?: EvaluationStatistics | undefined;
}) {
  const days = statistics?.trend ?? [];
  const maximum = Math.max(...days.map((day) => day.total), 1);
  const x = (index: number) => 33 + index * 45;
  const y = (value: number) => 102 - (value / maximum) * 72;
  const points = (pick: (day: EvaluationTrendPoint) => number) =>
    days.map((day, index) => `${x(index)},${y(pick(day))}`).join(' ');
  const lines = [
    {
      tone: 'blue',
      label: '总提交数',
      pick: (day: EvaluationTrendPoint) => day.total,
    },
    {
      tone: 'green',
      label: 'AC 数',
      pick: (day: EvaluationTrendPoint) => day.accepted,
    },
    {
      tone: 'red',
      label: '错误数',
      pick: (day: EvaluationTrendPoint) => day.failed,
    },
  ] as const;
  return (
    <section className="submission-side-card submission-trend-card">
      <div className="submission-side-card__heading">
        <h2>
          <span>
            <Icon name="file" />
          </span>
          {scope === 'mine' ? '我的提交趋势' : '全站提交趋势'}
        </h2>
        <span className="submission-period-pill">最近7天</span>
      </div>
      <div className="submission-chart-legend">
        {lines.map((line) => (
          <span key={line.tone} className={`tone-${line.tone}`}>
            {line.label}
          </span>
        ))}
      </div>
      <svg
        className="submission-trend-chart"
        viewBox="0 0 330 142"
        role="img"
        aria-label={days.length ? '最近七天提交趋势' : '暂无趋势数据'}
      >
        <g className="submission-trend-chart__grid">
          <path d="M33 30H310M33 54H310M33 78H310M33 102H310M33 30V102M78 30V102M123 30V102M168 30V102M213 30V102M258 30V102M303 30V102" />
        </g>
        {[maximum, Math.round(maximum / 2), 0].map((value, index) => (
          <text
            key={`${value}-${index}`}
            x="27"
            y={34 + index * 36}
            textAnchor="end"
          >
            {number(value)}
          </text>
        ))}
        {days.length > 0 && (
          <>
            {lines.map((line) => (
              <g key={line.tone} className={`tone-${line.tone}`}>
                <polyline points={points(line.pick)} />
                {days.map((day, index) => (
                  <circle
                    key={day.date}
                    cx={x(index)}
                    cy={y(line.pick(day))}
                    r="3"
                  >
                    <title>{`${day.date} · ${line.label} ${number(line.pick(day))}`}</title>
                  </circle>
                ))}
              </g>
            ))}
            {days.map((day, index) => (
              <text key={day.date} x={x(index)} y="125" textAnchor="middle">
                {day.date.slice(5)}
              </text>
            ))}
          </>
        )}
      </svg>
    </section>
  );
}

function AnalyticsSidebar({
  scope,
  statistics,
}: {
  scope: SubmissionScope;
  statistics?: EvaluationStatistics | undefined;
}) {
  const today = statistics?.today;
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
          <span className="submission-period-pill">今日</span>
        </div>
        <div className="submission-today-grid">
          <MiniMetric
            icon="file"
            label="今日提交数"
            value={number(today?.submissions)}
            note={delta(today?.submissionDeltaPercent)}
            tone="blue"
            bars
          />
          <MiniMetric
            icon="check"
            label="今日 AC 数"
            value={number(today?.accepted)}
            note={delta(today?.acceptedDeltaPercent)}
            tone="green"
            bars
          />
          <MiniMetric
            icon="user"
            label="活跃用户"
            value={number(today?.activeUsers)}
            note={delta(today?.activeUserDeltaPercent)}
            tone="purple"
            bars
          />
          <MiniMetric
            icon="percent"
            label={scope === 'mine' ? '今日通过率' : '全站通过率'}
            value={percent(
              scope === 'mine' ? today?.passRate : statistics?.passRate,
            )}
            note="按全部提交计算"
            tone="blue"
          />
        </div>
      </section>
      <DonutCard scope={scope} statistics={statistics} />
      <TrendChart scope={scope} statistics={statistics} />
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
                    aria-label={`查看评测 #${row.publicNumber ?? row.submissionId}`}
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
                  <span
                    className="submission-user"
                    title={row.submitter.displayName}
                  >
                    {row.submitter.displayName}
                  </span>
                </td>
                <td>
                  <a
                    href={`/problems/${encodeURIComponent(row.problem.id)}`}
                    title={`${row.problem.publicId || row.problem.slug} ${row.problem.title}`}
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
                <td title={row.languageProfileId}>
                  {languageLabels[row.languageProfileId] ??
                    row.languageProfileId}
                </td>
                <td>
                  <ResultBadge row={row} />
                </td>
                <td>{formatMilliseconds(row.totalTimeMs)}</td>
                <td>{formatBytes(row.peakMemoryBytes)}</td>
                <td>{formatBytes(row.sourceBytes)}</td>
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

function paginationItems(current: number, total: number) {
  const candidates = new Set([1, total, current - 1, current, current + 1]);
  const pages = [...candidates]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
  const result: Array<number | string> = [];
  for (const page of pages) {
    const previous = result.at(-1);
    if (typeof previous === 'number' && page - previous > 1)
      result.push(`ellipsis-${page}`);
    result.push(page);
  }
  return result;
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
  const [scope, setScope] = useState<SubmissionScope>(requestedScope);
  const [items, setItems] = useState<EvaluationListItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [jumpInput, setJumpInput] = useState('1');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [languageFilter, setLanguageFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [problemFilter, setProblemFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [statistics, setStatistics] = useState<EvaluationStatistics>();
  const [statisticsLoading, setStatisticsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const requestVersion = useRef(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const filters = useMemo<EvaluationFilters>(
    () => ({
      ...(resultFilter === 'AC' ? { verdict: 'AC' } : {}),
      ...(resultFilter === 'FAILED' ? { failed: true } : {}),
      ...(resultFilter === 'RUNNING' ? { status: 'RUNNING' } : {}),
      ...(problemFilter ? { problemSearch: problemFilter } : {}),
      ...(scope === 'mine' && user ? { submitterId: user.id } : {}),
      ...(languageFilter ? { languageId: languageFilter } : {}),
    }),
    [languageFilter, problemFilter, resultFilter, scope, user],
  );

  const resetPagination = () => {
    setPageIndex(0);
    setJumpInput('1');
  };

  useEffect(() => {
    if (requestedScope === scope) return;
    setScope(requestedScope);
    resetPagination();
  }, [requestedScope, scope]);

  useEffect(() => {
    if (scope === 'mine' && !user) {
      setItems([]);
      setTotal(0);
      setError('');
      setLoading(false);
      return;
    }
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    void api
      .evaluations(pageIndex + 1, pageSize, filters)
      .then((data) => {
        if (version === requestVersion.current) {
          setItems(data.items);
          setTotal(data.total);
        }
      })
      .catch((cause) => {
        if (version === requestVersion.current)
          setError(
            cause instanceof ApiError ? cause.message : '无法加载评测列表。',
          );
      })
      .finally(() => {
        if (version === requestVersion.current) setLoading(false);
      });
    return () => {
      requestVersion.current += 1;
    };
  }, [api, filters, pageIndex, pageSize, reloadToken, scope, user]);

  useEffect(() => {
    if (scope === 'mine' && !user) {
      setStatistics(undefined);
      setStatisticsLoading(false);
      return;
    }
    let active = true;
    setStatisticsLoading(true);
    void api
      .evaluationStatistics(scope === 'mine' ? user?.id : undefined)
      .then((data) => {
        if (active) setStatistics(data);
      })
      .catch(() => {
        if (active) setStatistics(undefined);
      })
      .finally(() => {
        if (active) setStatisticsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, reloadToken, scope, user]);

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
  const submitJump = (event: FormEvent) => {
    event.preventDefault();
    const nextPage = Math.min(Math.max(Number(jumpInput) || 1, 1), totalPages);
    setPageIndex(nextPage - 1);
    setJumpInput(String(nextPage));
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
          <button
            type="button"
            className={scope === 'all' ? 'active' : ''}
            aria-current={scope === 'all' ? 'page' : undefined}
            onClick={() => selectScope('all')}
          >
            全部记录
          </button>
          <button
            type="button"
            className={scope === 'mine' ? 'active' : ''}
            aria-current={scope === 'mine' ? 'page' : undefined}
            onClick={() => selectScope('mine')}
          >
            我的记录
          </button>
        </nav>
        <div className="submission-dashboard">
          <div className="submission-dashboard__main">
            <SummaryCards
              scope={scope}
              statistics={statistics}
              loading={statisticsLoading}
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
                    ['cpp20-gcc-13-v1', 'C++'],
                    ['python-3.12-v1', 'Python'],
                    ['java-21-v1', 'Java'],
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
                <details className="submission-more-filter">
                  <summary>
                    更多 <Icon name="chevron" />
                  </summary>
                  <div>
                    <button
                      type="button"
                      onClick={() => setLanguage('cpp20-gcc-13-v1')}
                    >
                      C++20 (GCC 13)
                    </button>
                    <button
                      type="button"
                      onClick={() => setLanguage('python-3.12-v1')}
                    >
                      Python 3.12
                    </button>
                    <button
                      type="button"
                      onClick={() => setLanguage('java-21-v1')}
                    >
                      Java 21
                    </button>
                  </div>
                </details>
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
                  placeholder="搜索题目 ID…"
                />
              </form>
            </div>

            <section
              className={`submission-list-card${loading ? ' is-loading' : ''}`}
              aria-busy={loading}
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
                <div
                  className="submission-table-skeleton"
                  aria-label="正在加载评测列表"
                >
                  {Array.from({ length: 10 }, (_, index) => (
                    <i key={index} />
                  ))}
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
                <span>共 {number(total)} 条记录</span>
                <div>
                  <button
                    type="button"
                    aria-label="上一页"
                    disabled={pageIndex === 0 || loading}
                    onClick={() => {
                      const next = Math.max(0, pageIndex - 1);
                      setPageIndex(next);
                      setJumpInput(String(next + 1));
                    }}
                  >
                    ‹
                  </button>
                  {paginationItems(pageIndex + 1, totalPages).map((item) =>
                    typeof item === 'number' ? (
                      <button
                        key={item}
                        type="button"
                        className={pageIndex + 1 === item ? 'active' : ''}
                        aria-current={
                          pageIndex + 1 === item ? 'page' : undefined
                        }
                        onClick={() => {
                          setPageIndex(item - 1);
                          setJumpInput(String(item));
                        }}
                      >
                        {item}
                      </button>
                    ) : (
                      <span
                        key={item}
                        className="submission-pagination__ellipsis"
                      >
                        …
                      </span>
                    ),
                  )}
                  <button
                    type="button"
                    aria-label="下一页"
                    disabled={pageIndex + 1 >= totalPages || loading}
                    onClick={() => {
                      const next = Math.min(totalPages, pageIndex + 2);
                      setPageIndex(next - 1);
                      setJumpInput(String(next));
                    }}
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
                <form className="submission-page-jump" onSubmit={submitJump}>
                  <label htmlFor="submission-page-number">跳至</label>
                  <input
                    id="submission-page-number"
                    aria-label="跳转页码"
                    inputMode="numeric"
                    value={jumpInput}
                    onChange={(event) =>
                      setJumpInput(event.target.value.replace(/\D/g, ''))
                    }
                  />
                  <span>页</span>
                </form>
              </footer>
            </section>
          </div>
          <AnalyticsSidebar scope={scope} statistics={statistics} />
        </div>
      </div>
    </section>
  );
}
