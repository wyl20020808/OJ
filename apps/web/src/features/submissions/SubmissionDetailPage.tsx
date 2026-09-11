import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  ApiError,
  type ApiClient,
  type AuthenticatedUser,
  type Problem,
  type Submission,
  type SubmissionEvaluation,
  type SubmissionEvaluationDetail,
  type SubmissionTestcaseResult,
} from '../../services/api.js';
import './SubmissionDetailPage.css';

type EvaluationSnapshot = SubmissionEvaluation & {
  detail?: SubmissionEvaluationDetail;
};

type SubmissionDetailPageProps = {
  api: ApiClient;
  id: string;
  user: AuthenticatedUser | null;
  navigate?: ((path: string) => void) | undefined;
};

type LiveEvent = {
  id: number;
  time: string;
  kind: string;
  message: string;
};

const terminalEvaluationStatuses = new Set<SubmissionEvaluation['status']>([
  'COMPLETED_WITH_VERDICT',
  'CANCELLED',
  'INFRA_FAILED',
  'NO_VERDICT',
  'INCOMPLETE',
]);

const terminalTestcaseStatuses = new Set([
  'PASS',
  'AC',
  'WA',
  'CE',
  'RE',
  'TLE',
  'MLE',
  'CANCELLED',
  'SKIPPED',
]);

const verdictLabels: Record<string, string> = {
  AC: '通过',
  WA: '答案错误',
  CE: '编译错误',
  RE: '运行错误',
  TLE: '超时',
  MLE: '内存超限',
  RUNNING: '评测中',
  QUEUED: '排队中',
  REJUDGING: '重测中',
  REJUDGE_PENDING: '等待重测',
  WAITING: '等待中',
  SKIPPED: '已跳过',
  CANCELLED: '已取消',
  INFRA_FAILED: '评测失败',
  NO_VERDICT: '暂无结果',
  INCOMPLETE: '未完成',
};

const verdictHeadlines: Record<string, string> = {
  AC: 'Accepted',
  WA: 'Wrong Answer',
  CE: 'Compile Error',
  RE: 'Runtime Error',
  TLE: 'Time Limit Exceeded',
  MLE: 'Memory Limit Exceeded',
};

function Icon({
  name,
}: {
  name: 'file' | 'list' | 'clock' | 'memory' | 'result' | 'log' | 'check';
}) {
  const paths = {
    file: <path d="M7 3.5h7l4 4v13H7zM14 3.5v4h4M10 12h5M10 15.5h5" />,
    list: <path d="M7 5h11v14H7zM10 9h5m-5 3h5m-5 3h5" />,
    clock: (
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm0 4v5l3 2" />
    ),
    memory: (
      <path d="M8 7h8v10H8zM5 9h3m-3 3h3m-3 3h3m8-6h3m-3 3h3m-3 3h3M10 4v3m4-3v3m-4 10v3m4-3v3" />
    ),
    result: <path d="M6 4h12v16H6zM9 8h6m-6 4h6m-6 4h4" />,
    log: <path d="M7 4h10v16H7zM9.5 8h5m-5 4h5m-5 4h5" />,
    check: <path d="m7.5 12.5 3 3 6-7" />,
  } as const;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

function isTerminalStatus(status: SubmissionEvaluation['status']) {
  return terminalEvaluationStatuses.has(status);
}

function testcaseState(item: SubmissionTestcaseResult) {
  return item.verdict ?? item.status ?? 'WAITING';
}

function isTerminalTestcase(item: SubmissionTestcaseResult) {
  return (
    Boolean(item.verdict) || terminalTestcaseStatuses.has(item.status ?? '')
  );
}

function mergeEvaluation(
  current: EvaluationSnapshot | null,
  incoming: EvaluationSnapshot,
): EvaluationSnapshot {
  if (!current) return incoming;
  if (isTerminalStatus(current.status)) return current;
  if (!current.detail || !incoming.detail) return { ...current, ...incoming };

  const previous = new Map(
    current.detail.testcases.map((item) => [item.ordinal, item]),
  );
  const mergedTestcases = incoming.detail.testcases.map((item) => {
    const older = previous.get(item.ordinal);
    if (older && isTerminalTestcase(older) && !isTerminalTestcase(item)) {
      return older;
    }
    return older ? { ...older, ...item } : item;
  });
  for (const older of current.detail.testcases) {
    if (!mergedTestcases.some((item) => item.ordinal === older.ordinal)) {
      mergedTestcases.push(older);
    }
  }
  mergedTestcases.sort((a, b) => a.ordinal - b.ordinal);

  return {
    ...current,
    ...incoming,
    detail: {
      ...current.detail,
      ...incoming.detail,
      testcaseCount: Math.max(
        current.detail.testcaseCount,
        incoming.detail.testcaseCount,
      ),
      completedTestcaseCount: Math.max(
        current.detail.completedTestcaseCount,
        incoming.detail.completedTestcaseCount,
      ),
      testcases: mergedTestcases,
    },
  };
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

function formatLimitBytes(value: number | undefined) {
  if (value === undefined) return '—';
  const megabytes = value / 1024 / 1024;
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

function formatDateTime(value: string | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
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

function cleanStatement(value: string | undefined) {
  if (!value) return '题目描述暂不可用。';
  const text = value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`()$]/g, ' ')
    .replace(/[[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 92 ? `${text.slice(0, 92)}…` : text;
}

function stateIcon(state: string) {
  if (state === 'AC' || state === 'PASS') return '✓';
  if (state === 'RUNNING') return '…';
  if (state === 'SKIPPED' || state === 'CANCELLED') return '!';
  if (['WA', 'CE', 'RE', 'TLE', 'MLE'].includes(state)) return '×';
  return '·';
}

function ratio(value: number | undefined, limit: number | undefined) {
  if (value === undefined || !limit) return undefined;
  return Math.min(100, (value / limit) * 100);
}

function LocalLink({
  to,
  navigate,
  className,
  children,
}: {
  to: string;
  navigate?: ((path: string) => void) | undefined;
  className?: string;
  children: React.ReactNode;
}) {
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      !navigate ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} className={className} onClick={open}>
      {children}
    </a>
  );
}

function PageState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="submission-detail-state" role="status">
      <span className="submission-detail-state__icon">
        <Icon name="file" />
      </span>
      <h1>{title}</h1>
      <p>{text}</p>
      {action}
    </section>
  );
}

function PanelTitle({
  icon,
  children,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  children: React.ReactNode;
}) {
  return (
    <h2 className="evaluation-panel-title">
      <span>
        <Icon name={icon} />
      </span>
      {children}
    </h2>
  );
}

export function SubmissionDetailPage({
  api,
  id,
  user,
  navigate,
}: SubmissionDetailPageProps) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [transportError, setTransportError] = useState('');
  const [selectedGeneration, setSelectedGeneration] = useState<number>();
  const [activeTab, setActiveTab] = useState<'result' | 'code'>('result');
  const [copyMessage, setCopyMessage] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState(false);
  const [evaluation, setEvaluation] = useState<EvaluationSnapshot | null>(null);
  const [evaluationError, setEvaluationError] = useState(false);
  const [eventLog, setEventLog] = useState<LiveEvent[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const requestVersion = useRef(0);
  const logSequence = useRef(0);
  const logViewport = useRef<HTMLDivElement>(null);

  const load = () => {
    const version = ++requestVersion.current;
    setError(null);
    setTransportError('');
    setSource(null);
    setSourceError(false);
    setEvaluationError(false);
    void api
      .submission(id)
      .then((value) => {
        if (version !== requestVersion.current) return;
        setSubmission(value);
        void api
          .submissionSource(id)
          .then((result) => {
            if (version === requestVersion.current) setSource(result.source);
          })
          .catch(() => {
            if (version === requestVersion.current) setSourceError(true);
          });
        setProblem(null);
        if (typeof api.problem === 'function') {
          void api
            .problem(value.problemId)
            .then((result) => {
              if (version === requestVersion.current) setProblem(result);
            })
            .catch(() => undefined);
        }
        void api
          .submissionEvaluations(id)
          .then((response) => {
            if (version !== requestVersion.current) return;
            setSelectedGeneration(
              (selected) =>
                selected ??
                response.items.find((item) => item.current)
                  ?.evaluationGeneration ??
                value.evaluation?.evaluationGeneration,
            );
          })
          .catch(() => {
            if (version === requestVersion.current)
              setSelectedGeneration(value.evaluation?.evaluationGeneration);
          });
      })
      .catch((reason: unknown) => {
        if (version !== requestVersion.current) return;
        if (reason instanceof ApiError) setError(reason);
        else setTransportError('暂时无法连接服务。');
      });
  };

  useEffect(() => {
    if (!user) return;
    load();
    return () => {
      requestVersion.current += 1;
    };
  }, [api, id, user]);

  useEffect(() => {
    if (!user || selectedGeneration === undefined) return;
    let active = true;
    setEvaluation(null);
    setEvaluationError(false);
    void api
      .submissionEvaluation(id, selectedGeneration)
      .then((response) => {
        if (active) setEvaluation(response.evaluation);
      })
      .catch(() => {
        if (active) setEvaluationError(true);
      });
    return () => {
      active = false;
    };
  }, [api, id, selectedGeneration, user]);

  useEffect(() => {
    if (
      !user ||
      !evaluation ||
      selectedGeneration !== evaluation.evaluationGeneration ||
      isTerminalStatus(evaluation.status) ||
      typeof api.submissionEvaluationStreamUrl !== 'function' ||
      typeof EventSource === 'undefined'
    )
      return;
    const stream = new EventSource(
      api.submissionEvaluationStreamUrl(id, selectedGeneration),
      { withCredentials: true },
    );
    const applyEvent = (kind: string, message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as {
          status?: SubmissionEvaluation['status'];
          verdict?: SubmissionEvaluation['verdict'];
          detail?: SubmissionEvaluationDetail;
          completedAt?: string;
        };
        setEvaluation((current) => {
          if (!current) return current;
          return mergeEvaluation(current, {
            ...current,
            ...(event.status ? { status: event.status } : {}),
            ...(event.verdict ? { verdict: event.verdict } : {}),
            ...(event.detail ? { detail: event.detail } : {}),
            ...(event.completedAt ? { completedAt: event.completedAt } : {}),
          });
        });
        const state = event.verdict ?? event.status;
        setEventLog((items) => [
          ...items.slice(-99),
          {
            id: ++logSequence.current,
            time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
            kind,
            message: state ? (verdictLabels[state] ?? state) : '评测数据已更新',
          },
        ]);
        if (event.status && isTerminalStatus(event.status)) stream.close();
      } catch {
        // Malformed deltas are ignored; the periodic snapshot remains authoritative.
      }
    };
    const onEvaluation = (event: MessageEvent<string>) =>
      applyEvent('评测', event);
    const onTestcase = (event: MessageEvent<string>) =>
      applyEvent('测试点', event);
    const onTerminal = (event: MessageEvent<string>) =>
      applyEvent('完成', event);
    stream.addEventListener('evaluation.updated', onEvaluation);
    stream.addEventListener('testcase.updated', onTestcase);
    stream.addEventListener('evaluation.terminal', onTerminal);
    stream.addEventListener('replay-gap', load);
    return () => stream.close();
  }, [api, evaluation?.evaluationGeneration, id, selectedGeneration, user]);

  useEffect(() => {
    if (
      !user ||
      !evaluation ||
      selectedGeneration !== evaluation.evaluationGeneration ||
      isTerminalStatus(evaluation.status)
    )
      return;
    const timer = window.setInterval(() => {
      void api
        .submissionEvaluation(id, selectedGeneration)
        .then((response) => {
          setEvaluation((current) =>
            mergeEvaluation(current, response.evaluation),
          );
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [
    api,
    evaluation?.evaluationGeneration,
    evaluation?.status,
    id,
    selectedGeneration,
    user,
  ]);

  useEffect(() => {
    if (autoScroll && logViewport.current) {
      logViewport.current.scrollTop = logViewport.current.scrollHeight;
    }
  }, [autoScroll, eventLog]);

  const testcaseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of evaluation?.detail?.testcases ?? []) {
      const state = testcaseState(item);
      counts[state] = (counts[state] ?? 0) + 1;
    }
    return counts;
  }, [evaluation?.detail?.testcases]);

  if (!user) {
    return (
      <PageState
        title="请先登录"
        text="登录后才能查看这条评测记录。"
        action={
          <LocalLink to="/login" navigate={navigate}>
            登录
          </LocalLink>
        }
      />
    );
  }
  if (error) {
    const title =
      error.status === 401
        ? '请先登录'
        : error.code === 'NOT_FOUND'
          ? '提交不存在'
          : error.code === 'FORBIDDEN'
            ? '无权查看提交'
            : '提交暂不可用';
    return (
      <PageState
        title={title}
        text={error.message}
        action={
          error.status >= 500 || error.status === 409 ? (
            <button onClick={load}>重试</button>
          ) : undefined
        }
      />
    );
  }
  if (transportError) {
    return (
      <PageState
        title="提交暂不可用"
        text={transportError}
        action={<button onClick={load}>重试</button>}
      />
    );
  }
  if (!submission) {
    return <PageState title="正在加载提交" text="正在获取提交与评测数据…" />;
  }

  const isTerminal = evaluation ? isTerminalStatus(evaluation.status) : false;
  const currentStatus =
    evaluation?.verdict ?? evaluation?.status ?? submission.status;
  const problemCode =
    problem?.publicId || problem?.slug || problem?.id || submission.problemId;
  const problemLabel = problem
    ? `${problemCode} · ${problem.title}`
    : submission.problemId;
  const problemPath = `/problems/${encodeURIComponent(problem?.slug || problemCode)}`;
  const completed = evaluation?.detail?.completedTestcaseCount ?? 0;
  const total = evaluation?.detail?.testcaseCount ?? 0;
  const progress =
    total > 0 ? Math.min(100, (completed / total) * 100) : undefined;
  const runtimeRatio = ratio(
    evaluation?.detail?.totalTimeMs,
    problem?.timeLimitMs,
  );
  const memoryRatio = ratio(
    evaluation?.detail?.peakMemoryBytes,
    problem?.memoryLimitBytes,
  );
  const submitter =
    submission.ownerUserId === user.id
      ? user.displayName
      : submission.ownerUserId;

  const copySource = async () => {
    try {
      if (source === null || !navigator.clipboard?.writeText)
        throw new Error('unavailable');
      await navigator.clipboard.writeText(source);
      setCopyMessage('已复制');
    } catch {
      setCopyMessage('复制失败');
    }
    window.setTimeout(() => setCopyMessage(''), 1800);
  };

  return (
    <article className="submission-detail-page">
      <section className="submission-detail-hero" aria-label="评测详情导语">
        <div className="submission-detail-hero__inner">
          <p>
            在每一次提交中，遇见更好的自己
            <br />
            代码如山，行则将至。
          </p>
          <div>
            <strong>
              以代码丈量世界
              <br />
              用算法照亮未来
            </strong>
            <small>
              ALGORITHMS
              <br />· TOMORROW ·
            </small>
          </div>
        </div>
      </section>

      <div className="submission-detail-content">
        <nav className="submission-detail-breadcrumb" aria-label="面包屑">
          <LocalLink to="/" navigate={navigate}>
            首页
          </LocalLink>
          <span>›</span>
          <LocalLink to="/submissions" navigate={navigate}>
            评测记录
          </LocalLink>
          <span>›</span>
          <strong>评测详情</strong>
        </nav>
        <header className="submission-detail-heading">
          <h1
            aria-label={`评测 #${evaluation?.publicNumber ?? submission.id} 评测详情`}
          >
            评测详情
          </h1>
          <p>查看本次提交的评测结果与详细信息</p>
        </header>

        <div className="submission-layout">
          <div className="submission-primary">
            <section className="submission-summary-card">
              <div className="submission-summary-main">
                <span className="submission-file-icon">
                  <Icon name="file" />
                </span>
                <div>
                  <div className="submission-problem-line">
                    <LocalLink to={problemPath} navigate={navigate}>
                      {problemLabel}
                    </LocalLink>
                    <span className="difficulty-pill">
                      {problem?.difficulty ?? '—'}
                    </span>
                  </div>
                  <p>{cleanStatement(problem?.statement)}</p>
                </div>
              </div>
              <div className="submission-live-progress" aria-live="polite">
                <div
                  className={`submission-spinner ${isTerminal ? 'is-terminal' : ''}`}
                  aria-hidden="true"
                />
                <div>
                  <strong>
                    {verdictLabels[currentStatus] ?? currentStatus}
                  </strong>
                  <span>
                    {isTerminal
                      ? '评测已完成'
                      : total
                        ? `正在运行第 ${Math.min(completed + 1, total)} / ${total} 个测试点…`
                        : '正在等待评测数据…'}
                  </span>
                </div>
                <div className="submission-progress-track">
                  <i style={{ width: `${progress ?? 0}%` }} />
                </div>
                <b>
                  {progress === undefined ? '—' : `${progress.toFixed(1)}%`}
                </b>
              </div>
              <dl className="submission-meta-grid">
                <div>
                  <dt>提交ID</dt>
                  <dd>#{evaluation?.publicNumber ?? submission.id}</dd>
                </div>
                <div>
                  <dt>提交时间</dt>
                  <dd>{formatDateTime(submission.createdAt)}</dd>
                </div>
                <div>
                  <dt>用户</dt>
                  <dd>{submitter}</dd>
                </div>
                <div>
                  <dt>编程语言</dt>
                  <dd>{submission.languageId}</dd>
                </div>
                <div>
                  <dt>代码长度</dt>
                  <dd>{formatBytes(submission.sourceBytes)}</dd>
                </div>
                <div>
                  <dt>内存限制</dt>
                  <dd>{formatLimitBytes(problem?.memoryLimitBytes)}</dd>
                </div>
                <div>
                  <dt>时间限制</dt>
                  <dd>
                    {problem?.timeLimitMs === undefined
                      ? '—'
                      : `${(problem.timeLimitMs / 1000).toFixed(2)} s`}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="testcase-status-card">
              <div className="testcase-status-heading">
                <PanelTitle icon="list">实时评测点状态</PanelTitle>
                <div className="testcase-legend" aria-label="评测点图例">
                  <span className="legend-ac">
                    ✓ <b>AC</b> 通过
                  </span>
                  <span className="legend-wa">
                    × <b>WA</b> 答案错误
                  </span>
                  <span className="legend-re">
                    ! <b>RE</b> 运行错误
                  </span>
                  <span className="legend-tle">
                    ◷ <b>TLE</b> 超时
                  </span>
                  <span className="legend-wait">○ 评测中</span>
                </div>
              </div>

              <nav
                className="submission-tabs"
                role="tablist"
                aria-label="评测详情视图"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'result'}
                  className={activeTab === 'result' ? 'active' : ''}
                  onClick={() => setActiveTab('result')}
                >
                  评测结果
                </button>
                {source !== null ? (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'code'}
                    className={activeTab === 'code' ? 'active' : ''}
                    onClick={() => setActiveTab('code')}
                  >
                    代码
                  </button>
                ) : null}
              </nav>
              {sourceError ? (
                <p className="submission-source-error" role="alert">
                  源代码暂不可用。
                </p>
              ) : null}

              {activeTab === 'code' && source !== null ? (
                <section className="submission-source-panel">
                  <div>
                    <strong>源代码 · {submission.languageId}</strong>
                    <button
                      type="button"
                      aria-label="复制代码"
                      onClick={() => void copySource()}
                    >
                      {copyMessage || '复制代码'}
                    </button>
                  </div>
                  <pre>{source}</pre>
                </section>
              ) : (
                <>
                  {!evaluation ? (
                    <div className="testcase-empty">
                      正在获取 Judge 已发布的评测结果…
                    </div>
                  ) : evaluation.detail?.testcases.length ? (
                    <div
                      className="testcase-grid"
                      role="region"
                      aria-label="测试点进度"
                    >
                      <div
                        className="testcase-list"
                        role="list"
                        aria-label="测试点结果"
                      >
                        {evaluation.detail.testcases.map((item) => {
                          const state = testcaseState(item);
                          const tooltip = [
                            `测试点 #${item.ordinal}`,
                            `状态：${state}`,
                            `用时：${formatMilliseconds(item.timeMs)}`,
                            `内存：${formatBytes(item.memoryBytes)}`,
                          ].join('\n');
                          return (
                            <article
                              key={item.ordinal}
                              role="listitem"
                              title={tooltip}
                              className={`testcase-row verdict-${state}`}
                              aria-label={`测试点 ${item.ordinal} ${state}`}
                            >
                              <span
                                className="testcase-state-icon"
                                aria-hidden="true"
                              >
                                {stateIcon(state)}
                              </span>
                              <strong
                                className={isTerminal ? '' : 'ordinal-live'}
                              >
                                {isTerminal ? `#${item.ordinal}` : item.ordinal}
                              </strong>
                              <span className="testcase-verdict">{state}</span>
                              <span className="testcase-fact">
                                Time {formatMilliseconds(item.timeMs)}
                              </span>
                              <span className="testcase-fact">
                                Memory {formatBytes(item.memoryBytes)}
                              </span>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  ) : isTerminal ? (
                    <div className="testcase-empty">
                      {evaluation.detail?.compile?.diagnostics ? (
                        <>
                          <h3>编译诊断</h3>
                          <pre>{evaluation.detail.compile.diagnostics}</pre>
                        </>
                      ) : null}
                      <p>该评测代没有可展示的测试点执行记录。</p>
                    </div>
                  ) : null}
                  {evaluation && !isTerminal ? (
                    <section className="submission-pending" aria-live="polite">
                      <h3>
                        {evaluation.status === 'QUEUED'
                          ? '正在排队评测'
                          : '正在评测'}
                      </h3>
                      <p>正在评测，详细测试点结果将在评测完成后显示。</p>
                    </section>
                  ) : null}
                  {isTerminal &&
                  evaluation?.detail?.compile?.diagnostics &&
                  evaluation.detail.testcases.length ? (
                    <section className="compiler-diagnostics">
                      <h3>编译诊断</h3>
                      <pre>{evaluation.detail.compile.diagnostics}</pre>
                    </section>
                  ) : null}
                </>
              )}
            </section>
          </div>

          <aside className="evaluation-info-card" aria-label="评测信息">
            <section className="evaluation-side-card run-overview-card">
              <div className="side-card-heading">
                <PanelTitle icon="list">本次运行概览</PanelTitle>
                <span className={`status-chip status-${currentStatus}`}>
                  {verdictLabels[currentStatus] ?? currentStatus}
                </span>
              </div>
              <dl className="run-overview-grid">
                <div>
                  <dt>得分</dt>
                  <dd>—</dd>
                  <small>/ 100</small>
                </div>
                <div>
                  <dt>通过评测点</dt>
                  <dd>{total ? `${completed} / ${total}` : '—'}</dd>
                  <small>
                    {progress === undefined ? '—' : `${progress.toFixed(1)}%`}
                  </small>
                </div>
                <div>
                  <dt>评测用时</dt>
                  <dd>
                    {evaluation?.completedAt
                      ? `${Math.max(0, (new Date(evaluation.completedAt).getTime() - new Date(submission.createdAt).getTime()) / 1000).toFixed(2)} s`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>评测状态</dt>
                  <dd>{verdictLabels[currentStatus] ?? currentStatus}</dd>
                  <small>{isTerminal ? '已完成' : '预计剩余 —'}</small>
                </div>
              </dl>
            </section>

            <section className="evaluation-side-card resource-card">
              <div className="side-card-heading">
                <PanelTitle icon="clock">资源消耗</PanelTitle>
                <span>与限制对比</span>
              </div>
              <div className="resource-grid">
                <dl className="resource-metric">
                  <div className="resource-metric-title">
                    <span>
                      <Icon name="clock" />
                    </span>
                    <div>
                      <dt>Time</dt>
                      <dd>
                        {formatMilliseconds(evaluation?.detail?.totalTimeMs)}
                      </dd>
                    </div>
                  </div>
                  <small>
                    限制：
                    {problem?.timeLimitMs === undefined
                      ? '—'
                      : `${problem.timeLimitMs} ms`}
                  </small>
                  <div className="metric-track">
                    <i style={{ width: `${runtimeRatio ?? 0}%` }} />
                  </div>
                  <b>
                    {runtimeRatio === undefined
                      ? '—'
                      : `${runtimeRatio.toFixed(1)}%`}
                  </b>
                </dl>
                <dl className="resource-metric memory">
                  <div className="resource-metric-title">
                    <span>
                      <Icon name="memory" />
                    </span>
                    <div>
                      <dt>Memory</dt>
                      <dd>
                        {formatBytes(evaluation?.detail?.peakMemoryBytes)}
                      </dd>
                    </div>
                  </div>
                  <small>
                    限制：{formatLimitBytes(problem?.memoryLimitBytes)}
                  </small>
                  <div className="metric-track">
                    <i style={{ width: `${memoryRatio ?? 0}%` }} />
                  </div>
                  <b>
                    {memoryRatio === undefined
                      ? '—'
                      : `${memoryRatio.toFixed(1)}%`}
                  </b>
                </dl>
              </div>
            </section>

            <section className="evaluation-side-card verdict-summary-card">
              <div className="side-card-heading">
                <PanelTitle icon="result">评测结果</PanelTitle>
                <strong
                  className={`verdict-headline verdict-${evaluation?.verdict ?? evaluation?.status ?? ''}`}
                >
                  {evaluation?.verdict
                    ? verdictHeadlines[evaluation.verdict]
                    : isTerminal
                      ? (verdictLabels[currentStatus] ?? currentStatus)
                      : 'Judging'}
                </strong>
              </div>
              <div className="verdict-count-grid">
                {(['AC', 'WA', 'RE', 'TLE', 'MLE'] as const).map((verdict) => (
                  <div
                    key={verdict}
                    className={`verdict-count verdict-${verdict}`}
                  >
                    <span>{stateIcon(verdict)}</span>
                    <div>
                      <strong>{verdict}</strong>
                      <small>{verdictLabels[verdict]}</small>
                    </div>
                    <b>{testcaseCounts[verdict] ?? 0}</b>
                  </div>
                ))}
              </div>
            </section>

            <section className="evaluation-side-card live-log-card">
              <div className="side-card-heading">
                <PanelTitle icon="log">实时评测日志</PanelTitle>
                <label>
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(event) => setAutoScroll(event.target.checked)}
                  />
                  自动滚动
                </label>
              </div>
              <div
                className="live-log-viewport"
                ref={logViewport}
                aria-live="polite"
              >
                {eventLog.length ? (
                  eventLog.map((entry) => (
                    <p key={entry.id}>
                      <time>{entry.time}</time>
                      <span>{entry.kind}</span>
                      {entry.message}
                    </p>
                  ))
                ) : (
                  <p className="live-log-empty">
                    暂无实时事件；新事件到达后显示。
                  </p>
                )}
              </div>
            </section>

            <dl className="evaluation-compat-meta">
              <div>
                <dt>语言</dt>
                <dd>{submission.languageId}</dd>
              </div>
              <div>
                <dt>Verdict</dt>
                <dd>{evaluation?.verdict ?? '—'}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>{evaluation?.status ?? submission.status}</dd>
              </div>
              <div>
                <dt>Generation</dt>
                <dd>{evaluation?.evaluationGeneration ?? '—'}</dd>
              </div>
            </dl>
          </aside>
        </div>

        {evaluationError ? (
          <section className="evaluation-load-error" role="alert">
            <strong>评测详情暂不可用</strong>
            <span>无法加载此代评测详情，请刷新后重试。</span>
            <button onClick={load}>刷新</button>
          </section>
        ) : null}
      </div>
    </article>
  );
}
