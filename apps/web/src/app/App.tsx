import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  ApiError,
  createApiClient,
  type ApiClient,
  type AuthenticatedUser,
  type Language,
  type Problem,
  type Submission,
  type SubmissionStatus,
} from '../services/api.js';
import './app.css';
import { SandboxOperationsPage } from '../components/SandboxOperationsPage.js';
import { AccountSettings } from '../components/AccountSettings.js';
import { AuthExperience } from '../components/AuthExperience.js';
import {
  ContestExperience,
  HomeworkPage,
  MessagesExperience,
  NotificationBell,
  NotificationsPage,
  ProfileExperience,
  WrongBookPage,
} from '../components/PortalExperience.js';
import {
  chooseDailyProblem,
  getDailyFortune,
  staticAnnouncements,
} from './homeContent.js';
import {
  formatDate,
  translateJudgeLabel,
  translateJudgeNote,
  translateProblemStatus,
  translateVisibility,
  zhCN,
} from './locale.js';

type Route = {
  name:
    | 'home'
    | 'login'
    | 'register'
    | 'problems'
    | 'problem'
    | 'submit'
    | 'submissions'
    | 'submission'
    | 'profile'
    | 'settings'
    | 'contests'
    | 'contest-new'
    | 'contest-detail'
    | 'contest-problems'
    | 'contest-submissions'
    | 'contest-standings'
    | 'contest-settings'
    | 'my-contests'
    | 'homework'
    | 'homework-detail'
    | 'wrong-book'
    | 'notifications'
    | 'messages'
    | 'author'
    | 'author-new'
    | 'author-edit'
    | 'sandbox'
    | 'forbidden'
    | 'error'
    | 'not-found';
  id?: string;
};
function route(path = window.location.pathname): Route {
  if (path === '/') return { name: 'home' };
  if (path === '/login') return { name: 'login' };
  if (path === '/register') return { name: 'register' };
  if (path === '/403' || path === '/forbidden') return { name: 'forbidden' };
  if (path === '/error') return { name: 'error' };
  if (path === '/profile' || path === '/account') return { name: 'profile' };
  if (path === '/settings' || path === '/account/settings')
    return { name: 'settings' };
  if (path === '/contests' || path === '/contests/')
    return { name: 'contests' };
  if (path === '/contests/new') return { name: 'contest-new' };
  if (path === '/me/contests') return { name: 'my-contests' };
  if (path.startsWith('/contests/')) {
    const parts = path.split('/').filter(Boolean);
    const id = decodeURIComponent(parts[1] ?? '');
    if (parts[2] === 'problems') return { name: 'contest-problems', id };
    if (parts[2] === 'submissions') return { name: 'contest-submissions', id };
    if (parts[2] === 'standings') return { name: 'contest-standings', id };
    if (parts[2] === 'settings') return { name: 'contest-settings', id };
    return { name: 'contest-detail', id };
  }
  if (path === '/homework') return { name: 'homework' };
  if (path.startsWith('/homework/'))
    return { name: 'homework-detail', id: decodeURIComponent(path.slice(10)) };
  if (path === '/wrong-book') return { name: 'wrong-book' };
  if (path === '/notifications') return { name: 'notifications' };
  if (path === '/messages') return { name: 'messages' };
  if (path === '/operations/sandbox') return { name: 'sandbox' };
  if (path === '/problems' || path === '/problems/')
    return { name: 'problems' };
  if (path === '/author' || path === '/author/') return { name: 'author' };
  if (path === '/author/problems/new') return { name: 'author-new' };
  if (path.startsWith('/author/problems/') && path.endsWith('/edit'))
    return { name: 'author-edit', id: decodeURIComponent(path.slice(17, -5)) };
  if (path.startsWith('/problems/') && path.endsWith('/submit'))
    return { name: 'submit', id: decodeURIComponent(path.slice(10, -7)) };
  if (path.startsWith('/problems/'))
    return { name: 'problem', id: decodeURIComponent(path.slice(10)) };
  if (path === '/submissions' || path === '/submissions/')
    return { name: 'submissions' };
  if (path.startsWith('/submissions/'))
    return { name: 'submission', id: decodeURIComponent(path.slice(13)) };
  return { name: 'not-found' };
}
function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
function Link({
  to,
  children,
  className,
  ariaLabel,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <a
      href={to}
      className={className}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

function Breadcrumbs({ current }: { current: Route }) {
  const leaf: Record<Route['name'], string> = {
    home: '首页',
    login: '登录',
    register: '注册',
    problems: '题库',
    problem: current.id ?? '题目',
    submit: '提交代码',
    submissions: '提交记录',
    submission: '提交详情',
    profile: '个人主页',
    settings: '账户与安全',
    contests: '比赛',
    'contest-new': '新建比赛',
    'contest-detail': current.id ?? '比赛详情',
    'contest-problems': '比赛题目',
    'contest-submissions': '比赛提交',
    'contest-standings': '比赛排名',
    'contest-settings': '比赛管理',
    'my-contests': '我的比赛',
    homework: '我的作业',
    'homework-detail': current.id ?? '作业详情',
    'wrong-book': '错题集',
    notifications: '通知',
    messages: '通讯中心',
    author: '出题工作台',
    'author-new': '创建题目',
    'author-edit': '编辑题目',
    sandbox: 'Sandbox 运维',
    forbidden: '无权访问',
    error: '页面加载失败',
    'not-found': '页面不存在',
  };
  const parents: Array<{ label: string; to: string }> = [];
  if (['problem', 'submit'].includes(current.name))
    parents.push({ label: '题库', to: '/problems' });
  if (
    [
      'contest-new',
      'contest-detail',
      'contest-problems',
      'contest-submissions',
      'contest-standings',
      'contest-settings',
      'my-contests',
    ].includes(current.name)
  )
    parents.push({ label: '比赛', to: '/contests' });
  if (
    [
      'contest-problems',
      'contest-submissions',
      'contest-standings',
      'contest-settings',
    ].includes(current.name)
  )
    parents.push({
      label: current.id ?? '比赛详情',
      to: `/contests/${encodeURIComponent(current.id ?? '')}`,
    });
  if (current.name === 'homework-detail')
    parents.push({ label: '我的作业', to: '/homework' });
  if (['submission'].includes(current.name))
    parents.push({ label: '提交记录', to: '/submissions' });
  return (
    <nav className="breadcrumbs" aria-label="面包屑">
      {current.name === 'home' ? (
        <span aria-current="page">首页</span>
      ) : (
        <>
          <Link to="/">首页</Link>
          {parents.map((item) => (
            <span key={`${item.to}-${item.label}`}>
              <span aria-hidden="true">/</span>
              <Link to={item.to}>{item.label}</Link>
            </span>
          ))}
          <span aria-hidden="true">/</span>
          <span aria-current="page" title={leaf[current.name]}>
            {leaf[current.name]}
          </span>
        </>
      )}
    </nav>
  );
}
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  override state = { hasError: false };
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Web application error', {
      error,
      componentStack: info.componentStack,
    });
  }
  override render() {
    return this.state.hasError ? (
      <main className="shell">
        <h1>页面暂时无法显示</h1>
        <p role="alert">应用未能正常渲染此页面，请稍后重试。</p>
      </main>
    ) : (
      this.props.children
    );
  }
}
function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      {label}
      <input {...props} />
    </label>
  );
}
function FormMessage({ error }: { error: string }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}

type StatusPresentation = {
  label: string;
  tone: 'neutral' | 'progress' | 'warning' | 'danger' | 'synthetic';
  note: string;
};

export function presentJudgeStatus(status: string): StatusPresentation {
  switch (status as SubmissionStatus) {
    case 'PENDING':
      return {
        label: 'Pending intake',
        tone: 'neutral',
        note: 'Waiting for protocol intake.',
      };
    case 'QUEUED':
      return {
        label: 'Queued',
        tone: 'progress',
        note: 'Waiting for a Judge Protocol worker.',
      };
    case 'LEASED':
      return {
        label: 'Leased',
        tone: 'progress',
        note: 'Synthetic protocol qualification is in progress; submitted code is not executed.',
      };
    case 'CLAIMED':
      return {
        label: 'Worker lease claimed',
        tone: 'progress',
        note: 'Synthetic protocol qualification is in progress; submitted code is not executed.',
      };
    case 'WORKER_ACCEPTED':
      return {
        label: 'Worker accepted the job',
        tone: 'progress',
        note: 'Qualification protocol work is accepted; submitted code is not executed.',
      };
    case 'SAFE_FIXTURE_RUNNING':
    case 'RUNNING':
      return {
        label: 'Qualification fixture running',
        tone: 'progress',
        note: 'A Synthetic safe qualification fixture is running; submitted code is not executed.',
      };
    case 'FAILED_RETRYABLE':
    case 'RETRYABLE_FAILURE':
      return {
        label: 'Retryable protocol failure',
        tone: 'warning',
        note: 'The protocol may retry this intake.',
      };
    case 'REQUEUED':
      return {
        label: 'Retrying infrastructure step',
        tone: 'warning',
        note: 'The qualification job was requeued; this is not a source verdict.',
      };
    case 'FAILED_TERMINAL':
    case 'PROTOCOL_FAILURE':
      return {
        label: 'Terminal protocol failure',
        tone: 'danger',
        note: 'Intake stopped before any execution result.',
      };
    case 'CANCELLED':
      return {
        label: 'Qualification job cancelled',
        tone: 'neutral',
        note: 'The Judge qualification job was cancelled; no submitted code was executed.',
      };
    case 'SAFE_FIXTURE_SUCCEEDED':
    case 'SYNTHETIC_COMPLETED':
      return {
        label: 'Synthetic completion',
        tone: 'synthetic',
        note: 'SYNTHETIC · QUALIFICATION ONLY · NOT A REAL EXECUTION VERDICT',
      };
    case 'WORKER_DEGRADED':
      return {
        label: 'Judge worker degraded',
        tone: 'warning',
        note: 'Worker infrastructure is degraded. This is not a Judge result or verdict.',
      };
    case 'WORKER_OFFLINE':
      return {
        label: 'Judge worker unavailable',
        tone: 'danger',
        note: 'Worker infrastructure is unavailable. This is not a Judge result or verdict.',
      };
    default:
      return {
        label: 'Unknown protocol state',
        tone: 'neutral',
        note: 'This state is not recognized by this client.',
      };
  }
}

export function JudgeStatus({ submission }: { submission: Submission }) {
  const presentation = presentJudgeStatus(
    String(submission.executionStage ?? submission.status),
  );
  return (
    <div
      className={`judge-status tone-${presentation.tone}`}
      role="status"
      aria-label={`${presentation.label}. ${presentation.note}`}
    >
      <span className="status">{translateJudgeLabel(presentation.label)}</span>
      <span className="judge-note">
        {translateJudgeNote(presentation.note)}
      </span>
      <span className="sr-only">
        {presentation.label} {presentation.note}
      </span>
      {submission.attempt !== undefined && (
        <span className="judge-meta">
          第 {submission.attempt} 次尝试
          {submission.maxAttempts ? ` / ${submission.maxAttempts}` : ''}
        </span>
      )}
      {submission.retryAt && (
        <span className="judge-meta">
          重试时间：{formatDate(submission.retryAt)}
        </span>
      )}
      {submission.failureCode && (
        <span className="judge-meta">协议代码：{submission.failureCode}</span>
      )}
    </div>
  );
}
function Home({
  api,
  user,
}: {
  api: ApiClient;
  user: AuthenticatedUser | null;
}) {
  const [recentProblems, setRecentProblems] = useState<Problem[] | null>(null);
  const [error, setError] = useState(false);
  const [fortuneVisible, setFortuneVisible] = useState(false);
  const fortune = useMemo(() => {
    const seed =
      user?.id ??
      (() => {
        const key = 'ojplatform-fortune-seed';
        const existing = window.localStorage.getItem(key);
        if (existing) return existing;
        const next =
          typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;
        window.localStorage.setItem(key, next);
        return next;
      })();
    return getDailyFortune(new Date(), seed);
  }, [user?.id]);
  useEffect(() => {
    void api
      .home()
      .then((data) =>
        setRecentProblems(
          Array.isArray(data?.recentProblems) ? data.recentProblems : [],
        ),
      )
      .catch(() => setError(true));
  }, [api]);
  const dailyProblem = chooseDailyProblem(recentProblems ?? []);
  return (
    <section className="home-page home-v4">
      <section className="home-columns home-v4-columns">
        <div className="home-column-main">
          <section className="announcement-panel home-section">
            <div className="section-heading-inline">
              <div>
                <p className="eyebrow">站点信息</p>
                <h1>公告</h1>
              </div>
            </div>
            <ul className="announcement-list">
              {staticAnnouncements.map((item) => (
                <li key={item.id}>
                  <span className="announcement-meta">
                    {item.importance} · {item.date}
                  </span>
                  <strong>
                    <Link to={item.href}>{item.title}</Link>
                  </strong>
                  <p>{item.text}</p>
                </li>
              ))}
            </ul>
            <p className="field-help">
              当前为 Web 版本控制的真实静态公告；公告后端尚未接入。
            </p>
          </section>
          <section className="home-section homework-panel">
            <div className="section-heading-inline">
              <div>
                <p className="eyebrow">学习任务</p>
                <h2>我的作业</h2>
              </div>
              <Link to="/homework">查看作业</Link>
            </div>
            <p className="unavailable-note" role="note">
              作业功能正在接入。当前不会显示虚构的作业、截止时间或完成进度。
            </p>
          </section>
          <section className="home-section wrong-book-panel">
            <div className="section-heading-inline">
              <div>
                <p className="eyebrow">复盘</p>
                <h2>错题集</h2>
              </div>
              <Link to="/wrong-book">打开错题集</Link>
            </div>
            <p className="unavailable-note" role="note">
              错题集数据暂不可用。Verdict Engine
              接入前不会把原始执行状态解释为错题。
            </p>
          </section>
        </div>
        <aside className="home-column-side">
          <section className="daily-problem-panel home-section">
            <div className="section-heading-inline">
              <div>
                <p className="eyebrow">按日期稳定选取</p>
                <h2>每日一题</h2>
              </div>
            </div>
            {dailyProblem ? (
              <div className="daily-problem">
                <span className="problem-id">
                  {dailyProblem.slug || dailyProblem.id}
                </span>
                <strong>{dailyProblem.title}</strong>
                <div className="tag-row">
                  {dailyProblem.difficulty && (
                    <span>{dailyProblem.difficulty}</span>
                  )}
                  {dailyProblem.tags?.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <Link to={`/problems/${dailyProblem.slug || dailyProblem.id}`}>
                  开始练习 →
                </Link>
              </div>
            ) : (
              <p className="unavailable-note" role="note">
                {error
                  ? '题库数据暂不可用。'
                  : '暂无可用于每日一题的真实题目。'}
              </p>
            )}
          </section>
          <section className="fortune-panel home-section">
            <div className="section-heading-inline">
              <div>
                <p className="eyebrow">刷题手气</p>
                <h2>今日运势</h2>
              </div>
            </div>
            {!fortuneVisible ? (
              <div className="fortune-entry">
                <p>看看今天适合怎样开始练习。</p>
                <button type="button" onClick={() => setFortuneVisible(true)}>
                  获取今日运势
                </button>
              </div>
            ) : (
              <div aria-live="polite">
                <p className="fortune-state">{fortune.state}</p>
                <dl>
                  <div>
                    <dt>宜</dt>
                    <dd>{fortune.should}</dd>
                  </div>
                  <div>
                    <dt>忌</dt>
                    <dd>{fortune.avoid}</dd>
                  </div>
                  <div>
                    <dt>幸运算法</dt>
                    <dd>
                      {fortune.algorithm} · {fortune.complexity}
                    </dd>
                  </div>
                </dl>
                <p className="field-help">
                  同一浏览器同一天结果一致，种子不使用邮箱、手机号、令牌、密码或
                  IP。
                </p>
              </div>
            )}
          </section>
          <section className="home-section contest-home-panel">
            <div className="section-heading-inline">
              <div>
                <p className="eyebrow">竞赛中心</p>
                <h2>比赛与排名</h2>
              </div>
              <Link to="/contests">全部比赛</Link>
            </div>
            <p className="unavailable-note" role="note">
              比赛和排行榜后端尚未接入；当前不展示虚构赛程或名次。
            </p>
          </section>
        </aside>
      </section>
    </section>
  );
}
function State({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <h2 aria-label={title}>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
function ProblemList({ api }: { api: ApiClient }) {
  const [data, setData] = useState<{
    items: Problem[];
    page: { total: number; offset: number; limit: number };
  } | null>(null);
  const [error, setError] = useState(false);
  const [offset, setOffset] = useState(0);
  const initialFilters = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const [query, setQuery] = useState(() => initialFilters.get('q') ?? '');
  const [difficulty, setDifficulty] = useState(
    () => initialFilters.get('difficulty') ?? '',
  );
  const [tag, setTag] = useState(() => initialFilters.get('tag') ?? '');
  const [source, setSource] = useState(
    () => initialFilters.get('source') ?? '',
  );
  const load = () => {
    setError(false);
    setData(null);
    void api
      .problems(offset)
      .then(setData)
      .catch(() => setError(true));
  };
  useEffect(load, [api, offset]);
  if (error)
    return (
      <State
        title="题库暂不可用"
        text="暂时无法加载题目，请稍后重试。"
        action={<button onClick={load}>重试</button>}
      />
    );
  if (!data) return <State title="正在加载题库" text="正在获取最新题目列表…" />;
  const difficulties = [
    ...new Set(data.items.map((problem) => problem.difficulty).filter(Boolean)),
  ] as string[];
  const tags = [
    ...new Set(data.items.flatMap((problem) => problem.tags ?? [])),
  ];
  const sources = [
    ...new Set(data.items.map((problem) => problem.source).filter(Boolean)),
  ] as string[];
  const filtered = data.items.filter(
    (problem) =>
      `${problem.title} ${problem.slug}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!difficulty || problem.difficulty === difficulty) &&
      (!tag || problem.tags?.includes(tag)) &&
      (!source || problem.source === source),
  );
  const writeFilters = (next: {
    q?: string;
    difficulty?: string;
    tag?: string;
    source?: string;
  }) => {
    const values = {
      q: next.q ?? query,
      difficulty: next.difficulty ?? difficulty,
      tag: next.tag ?? tag,
      source: next.source ?? source,
    };
    const params = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    window.history.replaceState(
      {},
      '',
      `/problems${params.size ? `?${params.toString()}` : ''}`,
    );
  };
  const clearFilters = () => {
    setQuery('');
    setDifficulty('');
    setTag('');
    setSource('');
    window.history.replaceState({}, '', '/problems');
  };
  return (
    <section className="problem-list-v4">
      <div className="page-heading">
        <div>
          <h1>题库</h1>
        </div>
        <span className="muted">共 {data.page.total} 题</span>
      </div>
      <div className="problem-filters" aria-label="题库筛选">
        <label className="search-field">
          关键词
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              writeFilters({ q: event.target.value });
            }}
            placeholder="按题目标题或题号筛选"
          />
        </label>
        <label>
          难度
          <select
            value={difficulty}
            disabled={!difficulties.length}
            onChange={(event) => {
              setDifficulty(event.target.value);
              writeFilters({ difficulty: event.target.value });
            }}
          >
            <option value="">
              {difficulties.length ? '全部难度' : '后端暂未提供'}
            </option>
            {difficulties.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          标签
          <select
            value={tag}
            disabled={!tags.length}
            onChange={(event) => {
              setTag(event.target.value);
              writeFilters({ tag: event.target.value });
            }}
          >
            <option value="">
              {tags.length ? '全部标签' : '后端暂未提供'}
            </option>
            {tags.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          来源
          <select
            value={source}
            disabled={!sources.length}
            onChange={(event) => {
              setSource(event.target.value);
              writeFilters({ source: event.target.value });
            }}
          >
            <option value="">
              {sources.length ? '全部来源' : '后端暂未提供'}
            </option>
            {sources.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          disabled={!query && !difficulty && !tag && !source}
          onClick={clearFilters}
        >
          清除筛选
        </button>
      </div>
      <div className="filter-summary" aria-live="polite">
        <span>{filtered.length} 条结果</span>
        {!difficulties.length && !tags.length && (
          <span>难度与标签筛选将在后端提供字段后启用</span>
        )}
      </div>
      {filtered.length === 0 ? (
        <State
          title={
            query || difficulty || tag || source ? '当前筛选无结果' : '暂无题目'
          }
          text={
            query || difficulty || tag || source
              ? '请尝试其他关键词，或清除筛选条件。'
              : '已发布题目会显示在这里。'
          }
          action={
            query || difficulty || tag || source ? (
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
        <div className="problem-table" role="list">
          {filtered.map((p) => (
            <Link key={p.id} to={`/problems/${p.slug || p.id}`}>
              <article role="listitem">
                <span className="problem-id">{p.slug || p.id}</span>
                <div className="problem-title-cell">
                  <h2>{p.title}</h2>
                  <div className="tag-row">
                    {p.tags?.length ? (
                      p.tags.map((item) => <span key={item}>{item}</span>)
                    ) : (
                      <span>暂无标签</span>
                    )}
                  </div>
                </div>
                <span className="difficulty-label">
                  {p.difficulty ?? '难度未提供'}
                </span>
                <span aria-hidden="true">→</span>
              </article>
            </Link>
          ))}
        </div>
      )}
      <div className="pagination">
        <button
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - data.page.limit))}
        >
          上一页
        </button>
        <button
          disabled={offset + data.page.limit >= data.page.total}
          onClick={() => setOffset(offset + data.page.limit)}
        >
          下一页
        </button>
      </div>
    </section>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="content-section">
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function formatMemoryLimit(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${Math.round(bytes / 1024 / 1024)} MB`;
}

type Draft = {
  slug: string;
  title: string;
  statement: string;
  inputDescription: string;
  outputDescription: string;
  constraints: string;
  notes: string;
  examples: { input: string; output: string; note?: string }[];
  timeLimitMs: number;
  memoryLimitBytes: number;
  testdataVersion?: string | null;
  visibility: Problem['visibility'];
  status: Problem['status'];
  updatedAt?: string;
};
const emptyDraft: Draft = {
  slug: '',
  title: '',
  statement: '',
  inputDescription: '',
  outputDescription: '',
  constraints: '',
  notes: '',
  examples: [{ input: '', output: '', note: '' }],
  timeLimitMs: 1000,
  memoryLimitBytes: 256 * 1024 * 1024,
  testdataVersion: null,
  visibility: 'private' as const,
  status: 'draft' as const,
};

function AuthorDashboard({ api }: { api: ApiClient }) {
  const [data, setData] = useState<{
    items: Problem[];
    page: { total: number; offset: number; limit: number };
  } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const load = () => {
    setError(null);
    void api
      .problems(0, 100)
      .then(setData)
      .catch((e) =>
        setError(
          e instanceof ApiError
            ? e
            : new ApiError(
                {
                  code: 'NETWORK_ERROR',
                  message: '无法加载题目草稿。',
                  requestId: 'unknown',
                },
                0,
              ),
        ),
      );
  };
  useEffect(load, [api]);
  if (error)
    return (
      <State
        title={
          error.code === 'FORBIDDEN'
            ? '无权访问出题工作台'
            : '出题工作台暂不可用'
        }
        text={error.message}
        action={<button onClick={load}>重试</button>}
      />
    );
  if (!data)
    return <State title="正在加载出题工作台" text="正在获取你的题目草稿…" />;
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">出题工作台</p>
          <h1>我的题目</h1>
        </div>
        <Link to="/author/problems/new">
          <button type="button">新建题目</button>
        </Link>
      </div>
      {data.items.length === 0 ? (
        <State
          title="暂无草稿"
          text="创建第一道题目草稿，开始出题。"
          action={<Link to="/author/problems/new">创建草稿</Link>}
        />
      ) : (
        <div className="problem-list">
          {data.items.map((p) => (
            <article key={p.id}>
              <div>
                <h2>{p.title}</h2>
                <p>
                  <span className={`status status-${p.status}`}>
                    {translateProblemStatus(p.status)}
                  </span>{' '}
                  · {translateVisibility(p.visibility)}
                </p>
              </div>
              <Link to={`/author/problems/${p.slug || p.id}/edit`}>编辑</Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AuthorForm({ api, id }: { api: ApiClient; id?: string }) {
  const [form, setForm] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    if (!id) return;
    void api
      .problem(id)
      .then((p) =>
        setForm({
          ...p,
          notes: p.notes ?? '',
          examples: p.examples.length ? p.examples : emptyDraft.examples,
        }),
      )
      .catch((e) => setError(e instanceof ApiError ? e : null))
      .finally(() => setLoading(false));
  }, [api, id]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  const update = (key: keyof typeof emptyDraft, value: unknown) => {
    setDirty(true);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError(null);
    if (
      !form.slug ||
      !form.title ||
      !form.statement ||
      !form.inputDescription ||
      !form.outputDescription ||
      !form.constraints
    ) {
      setMessage('请先填写所有必填字段。');
      return;
    }
    setSaving(true);
    try {
      const editable = {
        slug: form.slug,
        title: form.title,
        statement: form.statement,
        inputDescription: form.inputDescription,
        outputDescription: form.outputDescription,
        examples: form.examples,
        constraints: form.constraints,
        notes: form.notes,
        timeLimitMs: form.timeLimitMs,
        memoryLimitBytes: form.memoryLimitBytes,
        testdataVersion: form.testdataVersion ?? null,
      };
      const result = id
        ? await api.updateProblem(id, editable)
        : await api.createProblem({
            ...editable,
            visibility: form.visibility,
            status: form.status,
          });
      setMessage('草稿已保存。');
      setDirty(false);
      if (!id) navigate(`/author/problems/${result.slug || result.id}/edit`);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e
          : new ApiError(
              {
                code: 'NETWORK_ERROR',
                message: '无法保存草稿。',
                requestId: 'unknown',
              },
              0,
            ),
      );
    } finally {
      setSaving(false);
    }
  };
  const transition = async (status: Problem['status']) => {
    if (!id) return;
    if (status === 'archived' && !window.confirm('确定要归档这道题吗？'))
      return;
    setSaving(true);
    try {
      await api.transitionProblem(id, {
        status,
        ...(status === 'published' && form.visibility === 'public'
          ? { visibility: 'public' as const }
          : {}),
      });
      setForm((f) => ({ ...f, status }));
      setDirty(false);
      setMessage(status === 'published' ? '题目已发布。' : '题目已归档。');
    } catch (e) {
      setError(e instanceof ApiError ? e : null);
    } finally {
      setSaving(false);
    }
  };
  if (loading) return <State title="正在加载草稿" text="正在获取当前版本…" />;
  if (error && !form.title)
    return (
      <State
        title={
          error.code === 'FORBIDDEN'
            ? '无权访问出题工作台'
            : error.code === 'NOT_FOUND'
              ? '草稿不存在'
              : '草稿暂不可用'
        }
        text={error.message}
      />
    );
  return (
    <section className="editor">
      <Link to="/author">← 返回我的题目</Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{id ? '编辑草稿' : '新建草稿'}</p>
          <h1>{id ? '编辑题目' : '创建题目'}</h1>
        </div>
        {id && (
          <span className={`status status-${form.status}`}>
            {translateProblemStatus(form.status)}
          </span>
        )}
      </div>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field
            label="题目标题"
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            required
          />
          <Field
            label="题目标识"
            value={form.slug}
            onChange={(e) => update('slug', e.target.value)}
            required
          />
        </div>
        <label>
          题面
          <textarea
            value={form.statement}
            onChange={(e) => update('statement', e.target.value)}
            rows={6}
            required
          />
        </label>
        <div className="form-grid">
          <label>
            输入说明
            <textarea
              value={form.inputDescription}
              onChange={(e) => update('inputDescription', e.target.value)}
              rows={4}
              required
            />
          </label>
          <label>
            输出说明
            <textarea
              value={form.outputDescription}
              onChange={(e) => update('outputDescription', e.target.value)}
              rows={4}
              required
            />
          </label>
        </div>
        <label>
          数据范围
          <textarea
            value={form.constraints}
            onChange={(e) => update('constraints', e.target.value)}
            rows={4}
            required
          />
        </label>
        <label>
          补充说明
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={3}
          />
        </label>
        <div className="form-grid">
          <Field
            label="时间限制（毫秒）"
            type="number"
            min={1}
            value={form.timeLimitMs}
            onChange={(e) => update('timeLimitMs', Number(e.target.value))}
            required
          />
          <Field
            label="内存限制（字节）"
            type="number"
            min={1}
            value={form.memoryLimitBytes}
            onChange={(e) => update('memoryLimitBytes', Number(e.target.value))}
            required
          />
        </div>
        <fieldset>
          <legend>样例</legend>
          <div className="form-grid">
            <label>
              输入
              <textarea
                value={form.examples[0]?.input ?? ''}
                onChange={(e) =>
                  update('examples', [
                    {
                      ...form.examples[0],
                      input: e.target.value,
                      output: form.examples[0]?.output ?? '',
                    },
                  ])
                }
                rows={3}
              />
            </label>
            <label>
              输出
              <textarea
                value={form.examples[0]?.output ?? ''}
                onChange={(e) =>
                  update('examples', [
                    {
                      ...form.examples[0],
                      output: e.target.value,
                      input: form.examples[0]?.input ?? '',
                    },
                  ])
                }
                rows={3}
              />
            </label>
          </div>
        </fieldset>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.visibility === 'public'}
            onChange={(e) =>
              update('visibility', e.target.checked ? 'public' : 'private')
            }
          />{' '}
          对外公开
        </label>
        {(message || error) && (
          <FormMessage error={message || error?.message || ''} />
        )}
        <div className="actions">
          <button disabled={saving}>{saving ? '保存中…' : '保存草稿'}</button>
          {id && form.status === 'draft' && (
            <button
              type="button"
              onClick={() => void transition('published')}
              disabled={saving}
            >
              发布题目
            </button>
          )}
          {id && form.status === 'published' && (
            <button
              type="button"
              onClick={() => void transition('archived')}
              disabled={saving}
            >
              归档题目
            </button>
          )}
        </div>
      </form>
      {id && (
        <aside className="history">
          <h2>版本历史</h2>
          <p className="muted">当前版本由服务端追踪，已发布版本保持不可变。</p>
          <p>
            最近更新：{formatDate(form.updatedAt ?? new Date().toISOString())}
          </p>
        </aside>
      )}
    </section>
  );
}
function ProblemDetail({ api, id }: { api: ApiClient; id: string }) {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [copyMessage, setCopyMessage] = useState('');
  useEffect(() => {
    void api
      .problem(id)
      .then(setProblem)
      .catch((e) =>
        setError(
          e instanceof ApiError
            ? e
            : new ApiError(
                {
                  code: 'NETWORK_ERROR',
                  message: '题目暂不可用。',
                  requestId: 'unknown',
                },
                0,
              ),
        ),
      );
  }, [api, id]);
  if (error)
    return error.code === 'NOT_FOUND' ? (
      <State title="题目不存在" text="该题目不存在或当前不可用。" />
    ) : (
      <State title="题目暂不可用" text={error.message} />
    );
  if (!problem) return <State title="正在加载题目" text="正在获取题面详情…" />;
  return (
    <article className="problem-detail-v4">
      <div className="problem-main">
        <header className="problem-heading">
          <span className="problem-id">{problem.slug || problem.id}</span>
          <h1>{problem.title}</h1>
          <p className="muted">
            {problem.currentRevisionId
              ? `版本 ${problem.currentRevisionId}`
              : '版本信息暂不可用'}
            {problem.testdataVersion
              ? ` · 测试数据 ${problem.testdataVersion}`
              : ''}
          </p>
        </header>
        <Section title="题目描述">{problem.statement}</Section>
        <Section title="输入格式">{problem.inputDescription}</Section>
        <Section title="输出格式">{problem.outputDescription}</Section>
        <Section title="数据范围">{problem.constraints}</Section>
        {problem.examples.length > 0 && (
          <Section title="样例">
            {problem.examples.map((example, index) => (
              <div className="sample-block" key={index}>
                <button
                  type="button"
                  className="secondary sample-copy"
                  onClick={() => {
                    if (!navigator.clipboard) {
                      setCopyMessage('当前浏览器不支持复制样例。');
                      return;
                    }
                    void navigator.clipboard
                      .writeText(
                        `输入\n${example.input}\n\n输出\n${example.output}`,
                      )
                      .then(() => setCopyMessage('样例已复制。'))
                      .catch(() =>
                        setCopyMessage('复制失败，请手动选择样例。'),
                      );
                  }}
                >
                  复制样例
                </button>
                <pre>{`输入\n${example.input}\n\n输出\n${example.output}`}</pre>
              </div>
            ))}
            {copyMessage && <p role="status">{copyMessage}</p>}
          </Section>
        )}
        {problem.notes && <Section title="说明与提示">{problem.notes}</Section>}
      </div>
      <aside className="problem-aside" aria-label="题目信息">
        <div className="problem-aside-actions">
          <Link to={`/problems/${encodeURIComponent(id)}/submit`}>
            <button type="button">提交代码</button>
          </Link>
          <button type="button" className="secondary" disabled>
            收藏
          </button>
        </div>
        <dl className="problem-facts">
          <div>
            <dt>难度</dt>
            <dd>{problem.difficulty ?? '后端暂未提供'}</dd>
          </div>
          <div>
            <dt>标签</dt>
            <dd>
              <span className="tag-row">
                {problem.tags?.length
                  ? problem.tags.map((tag) => <span key={tag}>{tag}</span>)
                  : '后端暂未提供'}
              </span>
            </dd>
          </div>
          <div>
            <dt>来源</dt>
            <dd>{problem.source ?? '后端暂未提供'}</dd>
          </div>
          <div>
            <dt>时间限制</dt>
            <dd>{problem.timeLimitMs} ms</dd>
          </div>
          <div>
            <dt>内存限制</dt>
            <dd>{formatMemoryLimit(problem.memoryLimitBytes)}</dd>
          </div>
          {problem.statistics && (
            <div>
              <dt>真实提交统计</dt>
              <dd>
                {problem.statistics.acceptedCount} /{' '}
                {problem.statistics.submissionCount}
              </dd>
            </div>
          )}
        </dl>
        <p className="field-help">
          收藏、题单、最近尝试与通过统计仅在后端提供真实 contract 后启用。
        </p>
      </aside>
    </article>
  );
}

function SubmissionForm({
  api,
  problemId,
  user,
}: {
  api: ApiClient;
  problemId: string;
  user: AuthenticatedUser | null;
}) {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [languageId, setLanguageId] = useState('');
  const [source, setSource] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [state, setState] = useState<
    'loading' | 'ready' | 'saving' | 'success' | 'error'
  >('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user) {
      setState('ready');
      return;
    }
    void Promise.all([api.languages(), api.problem(problemId)])
      .then(([ls, p]) => {
        setLanguages(ls);
        setLanguageId(ls[0]?.id ?? '');
        setProblem(p);
        setState('ready');
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : '无法加载提交表单。');
        setState('error');
      });
  }, [api, problemId, user]);
  if (!user)
    return (
      <State
        title="请先登录"
        text="登录后才能提交代码。"
        action={<Link to="/login">登录</Link>}
      />
    );
  if (state === 'loading')
    return <State title="正在加载提交表单" text="正在准备语言列表…" />;
  if (state === 'error') return <State title="提交服务暂不可用" text={error} />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const effectiveLanguageId = languageId || languages[0]?.id || '';
    if (!effectiveLanguageId) {
      setError('请选择编程语言。');
      return;
    }
    if (!source.trim()) {
      setError('请输入源代码。');
      return;
    }
    const selected = languages.find((l) => l.id === effectiveLanguageId);
    if (
      selected &&
      new TextEncoder().encode(source).byteLength > selected.maxSourceBytes
    ) {
      setError(`源代码超过 ${selected.maxSourceBytes} 字节限制。`);
      return;
    }
    setState('saving');
    try {
      const result = await api.createSubmission({
        problemId,
        problemRevisionId: problem?.currentRevisionId ?? problemId,
        testdataVersionRef: problem?.testdataVersion ?? null,
        languageId: effectiveLanguageId,
        source,
      });
      setState('success');
      setError(`提交 ${result.id} 已接收，当前原始状态为 ${result.status}。`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '无法提交源代码。');
      setState('ready');
    }
  };
  if (state === 'success')
    return (
      <State
        title="提交已接收"
        text={error}
        action={<Link to="/submissions">查看提交记录</Link>}
      />
    );
  return (
    <section className="editor">
      <Link to={`/problems/${encodeURIComponent(problemId)}`}>← 返回题目</Link>
      <p className="eyebrow">提交接收</p>
      <h1>提交代码</h1>
      <form onSubmit={submit} noValidate>
        <label>
          编程语言
          <select
            value={languageId}
            onChange={(e) => setLanguageId(e.target.value)}
            required
          >
            <option value="">请选择语言</option>
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.extension})
              </option>
            ))}
          </select>
        </label>
        <label>
          源代码
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            rows={18}
            spellCheck={false}
            required
          />
        </label>
        <p className="muted">
          源代码目前只作为提交接收文本保存，当前阶段没有执行结果。
        </p>
        {error && <FormMessage error={error} />}
        <button disabled={state === 'saving'}>
          {state === 'saving' ? '提交中…' : '提交源代码'}
        </button>
      </form>
    </section>
  );
}

function SubmissionHistory({
  api,
  user,
}: {
  api: ApiClient;
  user: AuthenticatedUser | null;
}) {
  const [items, setItems] = useState<Submission[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const requestVersion = useRef(0);
  const load = () => {
    const version = ++requestVersion.current;
    setItems(null);
    setError('');
    void api
      .submissions(cursor)
      .then((d) => {
        if (version !== requestVersion.current) return;
        setItems(d.items);
        setNext(d.nextCursor);
      })
      .catch((e) => {
        if (version !== requestVersion.current) return;
        setError(e instanceof ApiError ? e.message : '无法加载提交记录。');
      });
  };
  useEffect(load, [api, cursor]);
  useEffect(
    () => () => {
      requestVersion.current++;
    },
    [],
  );
  if (!user)
    return (
      <State
        title="请先登录"
        text="登录后才能查看提交记录。"
        action={<Link to="/login">登录</Link>}
      />
    );
  if (error)
    return (
      <State
        title="提交记录暂不可用"
        text={error}
        action={<button onClick={load}>重试</button>}
      />
    );
  if (!items)
    return <State title="正在加载提交记录" text="正在获取你的提交接收记录…" />;
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">提交记录</p>
          <h1>我的提交</h1>
        </div>
      </div>
      {items.length === 0 ? (
        <State title="暂无提交" text="你提交的源代码会显示在这里。" />
      ) : (
        <div className="problem-list">
          {items.map((s) => (
            <article key={s.id}>
              <div>
                <h2>
                  <Link to={`/submissions/${s.id}`}>{s.id}</Link>
                </h2>
                <p>
                  {s.languageId} · {formatDate(s.createdAt)}
                </p>
                <JudgeStatus submission={s} />
              </div>
              <Link to={`/submissions/${s.id}`}>查看详情</Link>
            </article>
          ))}
        </div>
      )}
      <div className="pagination">
        <button disabled={!cursor} onClick={() => setCursor(undefined)}>
          第一页
        </button>
        <button disabled={!next} onClick={() => setCursor(next ?? undefined)}>
          下一页
        </button>
      </div>
    </section>
  );
}

function SubmissionDetail({
  api,
  id,
  user,
}: {
  api: ApiClient;
  id: string;
  user: AuthenticatedUser | null;
}) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [transportError, setTransportError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const requestVersion = useRef(0);
  const load = () => {
    const version = ++requestVersion.current;
    setError(null);
    setTransportError('');
    void api
      .submission(id)
      .then((value) => {
        if (version !== requestVersion.current) return;
        setSubmission(value);
      })
      .catch((e) => {
        if (version !== requestVersion.current) return;
        if (e instanceof ApiError) setError(e);
        else setTransportError('暂时无法连接服务。');
      });
  };
  useEffect(() => {
    if (!user) return;
    load();
    return () => {
      requestVersion.current++;
    };
  }, [api, id, user]);
  if (!user)
    return (
      <State
        title="请先登录"
        text="登录后才能查看这条提交记录。"
        action={<Link to="/login">登录</Link>}
      />
    );
  if (error)
    return (
      <State
        title={
          error.status === 401
            ? '请先登录'
            : error.code === 'NOT_FOUND'
              ? '提交不存在'
              : error.code === 'FORBIDDEN'
                ? '无权查看提交'
                : error.status === 409
                  ? '提交状态已变化'
                  : '提交暂不可用'
        }
        text={error.message}
        action={
          error.status === 401 ? (
            <Link to="/login">登录</Link>
          ) : error.status === 409 || error.status >= 500 ? (
            <button onClick={load}>重试</button>
          ) : undefined
        }
      />
    );
  if (transportError)
    return (
      <State
        title="提交暂不可用"
        text={transportError}
        action={<button onClick={load}>重试</button>}
      />
    );
  if (!submission)
    return <State title="正在加载提交" text="正在获取提交元数据…" />;
  return (
    <article className="detail">
      <Link to="/submissions">← 返回提交记录</Link>
      <p className="eyebrow">提交详情</p>
      <h1>{submission.id}</h1>
      <div className="limits">
        <span>语言：{submission.languageId}</span>
        <span>接收时间：{formatDate(submission.createdAt)}</span>
      </div>
      <JudgeStatus submission={submission} />
      <div className="judge-actions">
        <button type="button" className="secondary" onClick={load}>
          刷新执行状态
        </button>
        <button
          type="button"
          className="secondary"
          disabled={cancelling || submission.executionStage === 'CANCELLED'}
          onClick={() => {
            setCancelling(true);
            void api
              .cancelSubmission(submission.id)
              .then(load)
              .catch((error: unknown) => {
                if (error instanceof ApiError) setError(error);
                else setTransportError('The service could not be reached.');
              })
              .finally(() => setCancelling(false));
          }}
        >
          {cancelling ? '取消中…' : '取消资格流程'}
        </button>
      </div>
      <Section title="题目">
        {submission.problemId} · 版本 {submission.problemRevisionId}
      </Section>
      <Section title="测试数据版本">{submission.testdataVersionRef}</Section>
      <Section title="提交者">{submission.ownerUserId}</Section>
      <Section title="源代码">
        <pre className="source">{submission.source}</pre>
      </Section>
      <p className="muted">
        此页面仅展示提交接收元数据。当前没有执行结果，也不会伪造判题结论。
      </p>
    </article>
  );
}

function Profile({ user }: { user: AuthenticatedUser | null }) {
  return <ProfileExperience user={user} navigate={navigate} />;
}
export function App() {
  const api = useMemo(
    () => createApiClient(import.meta.env.VITE_API_URL ?? ''),
    [],
  );
  const [current, setCurrent] = useState<Route>(route());
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [authState, setAuthState] = useState<
    'loading' | 'authenticated' | 'unauthenticated' | 'unavailable'
  >('loading');
  const [readiness, setReadiness] = useState<
    'loading' | 'ready' | 'degraded' | 'error'
  >('loading');
  useEffect(() => {
    const h = () => setCurrent(route());
    window.addEventListener('popstate', h);
    void api
      .me()
      .then((value) => {
        setUser(value);
        setAuthState('authenticated');
      })
      .catch((error) => {
        setUser(null);
        setAuthState(
          error instanceof ApiError && error.status === 401
            ? 'unauthenticated'
            : 'unavailable',
        );
      });
    void api
      .readiness()
      .then((r) => setReadiness(r.status === 'ok' ? 'ready' : 'degraded'))
      .catch(() => setReadiness('error'));
    return () => window.removeEventListener('popstate', h);
  }, [api]);
  const page =
    current.name === 'home' ? (
      <Home api={api} user={user} />
    ) : current.name === 'login' || current.name === 'register' ? (
      <AuthExperience
        mode={current.name}
        api={api}
        onUser={(value) => {
          setUser(value);
          setAuthState('authenticated');
        }}
        onNavigate={navigate}
      />
    ) : current.name === 'forbidden' ? (
      <Forbidden />
    ) : current.name === 'error' ? (
      <GenericError />
    ) : current.name === 'problems' ? (
      <ProblemList api={api} />
    ) : current.name === 'contests' ? (
      <ContestExperience view="list" navigate={navigate} />
    ) : current.name === 'my-contests' ? (
      <ContestExperience view="mine" navigate={navigate} />
    ) : current.name === 'contest-new' ? (
      <ContestExperience view="create" navigate={navigate} />
    ) : current.name === 'contest-detail' ? (
      <ContestExperience
        view="detail"
        contestId={current.id ?? ''}
        navigate={navigate}
      />
    ) : current.name === 'contest-problems' ? (
      <ContestExperience
        view="problems"
        contestId={current.id ?? ''}
        navigate={navigate}
      />
    ) : current.name === 'contest-submissions' ? (
      <ContestExperience
        view="submissions"
        contestId={current.id ?? ''}
        navigate={navigate}
      />
    ) : current.name === 'contest-standings' ? (
      <ContestExperience
        view="standings"
        contestId={current.id ?? ''}
        navigate={navigate}
      />
    ) : current.name === 'contest-settings' ? (
      <ContestExperience
        view="settings"
        contestId={current.id ?? ''}
        navigate={navigate}
      />
    ) : current.name === 'homework' || current.name === 'homework-detail' ? (
      <HomeworkPage navigate={navigate} />
    ) : current.name === 'wrong-book' ? (
      <WrongBookPage navigate={navigate} />
    ) : current.name === 'notifications' ? (
      <NotificationsPage />
    ) : current.name === 'messages' ? (
      <MessagesExperience />
    ) : current.name === 'submit' ? (
      <SubmissionForm api={api} problemId={current.id ?? ''} user={user} />
    ) : current.name === 'submissions' ? (
      <SubmissionHistory api={api} user={user} />
    ) : current.name === 'submission' ? (
      user && current.id ? (
        <SubmissionDetail api={api} id={current.id} user={user} />
      ) : authState === 'unavailable' ? (
        <State
          title="提交服务暂不可用"
          text="暂时无法连接服务，登录状态未发生变化。"
          action={
            <button onClick={() => window.location.reload()}>
              {zhCN.common.retry}
            </button>
          }
        />
      ) : (
        <State
          title="请先登录"
          text="登录后才能查看这条提交记录。"
          action={<Link to="/login">登录</Link>}
        />
      )
    ) : current.name === 'sandbox' ? (
      <SandboxOperationsPage api={api} authorized={Boolean(user)} />
    ) : current.name === 'profile' ? (
      <Profile user={user} />
    ) : current.name === 'settings' ? (
      user ? (
        <AccountSettings api={api} user={user} />
      ) : (
        <State
          title="请先登录"
          text="登录后才能管理账户安全。"
          action={<Link to="/login">登录</Link>}
        />
      )
    ) : current.name === 'author' ? (
      user ? (
        <AuthorDashboard api={api} />
      ) : (
        <State
          title="请先登录"
          text="登录后才能管理题目草稿。"
          action={<Link to="/login">登录</Link>}
        />
      )
    ) : current.name === 'author-new' ? (
      user ? (
        <AuthorForm api={api} />
      ) : (
        <State
          title="请先登录"
          text="登录后才能创建题目草稿。"
          action={<Link to="/login">登录</Link>}
        />
      )
    ) : current.name === 'author-edit' ? (
      user && current.id ? (
        <AuthorForm api={api} id={current.id} />
      ) : (
        <State
          title="请先登录"
          text="登录后才能编辑题目草稿。"
          action={<Link to="/login">登录</Link>}
        />
      )
    ) : current.name === 'problem' ? (
      <ProblemDetail api={api} id={current.id ?? ''} />
    ) : (
      <NotFound />
    );
  return (
    <div className="app">
      <header className="nav">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            OJ
          </span>
          <strong>OJPlatform</strong>
        </Link>
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={false}
          aria-label={zhCN.nav.open}
          onClick={(event) => {
            const next =
              event.currentTarget.getAttribute('aria-expanded') !== 'true';
            event.currentTarget.setAttribute('aria-expanded', String(next));
            event.currentTarget.setAttribute(
              'aria-label',
              next ? zhCN.nav.close : zhCN.nav.open,
            );
            event.currentTarget.parentElement?.classList.toggle(
              'nav-open',
              next,
            );
          }}
        >
          <span aria-hidden="true">☰</span>
        </button>
        <nav aria-label="Primary navigation">
          <Link
            to="/"
            ariaLabel="Home"
            className={current.name === 'home' ? 'active' : ''}
          >
            首页
          </Link>
          <Link
            to="/problems"
            ariaLabel="Problems"
            className={
              current.name === 'problems' ||
              current.name === 'problem' ||
              current.name === 'submit'
                ? 'active'
                : ''
            }
          >
            题库
          </Link>
          <Link
            to="/contests"
            className={current.name.includes('contest') ? 'active' : ''}
          >
            比赛
          </Link>
          <Link
            to="/submissions"
            ariaLabel="Submissions"
            className={
              current.name === 'submissions' || current.name === 'submission'
                ? 'active'
                : ''
            }
          >
            提交记录
          </Link>
          <Link
            to="/messages"
            className={current.name === 'messages' ? 'active' : ''}
          >
            通讯
          </Link>
          <NotificationBell navigate={navigate} />
          {user ? (
            <>
              <Link
                to="/profile"
                className={current.name === 'profile' ? 'active' : ''}
              >
                {user.displayName}
              </Link>
              <Link
                to="/settings"
                ariaLabel="Settings"
                className={current.name === 'settings' ? 'active' : ''}
              >
                账户与安全
              </Link>
              <Link to="/author" ariaLabel="Authoring">
                出题工作台
              </Link>
              <button
                className="link-button"
                onClick={() => {
                  void api.logout().finally(() => {
                    setUser(null);
                    setAuthState('unauthenticated');
                    navigate('/');
                  });
                }}
              >
                退出登录
              </button>
            </>
          ) : (
            <>
              <Link to="/login" ariaLabel="Sign in">
                登录
              </Link>
              <Link to="/register" ariaLabel="Register">
                注册
              </Link>
            </>
          )}
        </nav>
      </header>
      <Breadcrumbs current={current} />
      <div className="readiness" aria-live="polite">
        {readiness === 'loading' && (
          <span role="status">{zhCN.platform.checking}</span>
        )}
        {readiness === 'ready' && (
          <span role="status">{zhCN.platform.ready}</span>
        )}
        {readiness === 'degraded' && (
          <span role="alert">
            <strong>{zhCN.platform.notReady}</strong> ·{' '}
            {zhCN.platform.notReadyDetail}
          </span>
        )}
        {readiness === 'error' && (
          <span role="alert">{zhCN.platform.unavailable}</span>
        )}
      </div>
      <main className="shell">{page}</main>
      <footer>OJPlatform · 练习、学习、持续进步。</footer>
    </div>
  );
}
export function NotFound() {
  return (
    <State
      title="页面不存在"
      text="你访问的页面不存在或已被移除。"
      action={<Link to="/">返回首页</Link>}
    />
  );
}

export function Forbidden() {
  return (
    <State
      title="无权访问"
      text="你没有权限查看此页面。"
      action={<Link to="/">返回首页</Link>}
    />
  );
}

export function GenericError() {
  return (
    <State
      title="页面加载失败"
      text="页面暂时无法加载，请重试或返回首页。"
      action={<Link to="/">返回首页</Link>}
    />
  );
}
