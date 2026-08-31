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
  const [jumpQuery, setJumpQuery] = useState('');
  const [jumpError, setJumpError] = useState('');
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
  const jump = () => {
    const value = jumpQuery.trim().toLowerCase();
    if (!value) {
      setJumpError('请输入题号或题目关键词。');
      return;
    }
    const match = recentProblems?.find((problem) =>
      [problem.id, problem.slug, problem.title].some((field) =>
        field.toLowerCase().includes(value),
      ),
    );
    if (match) {
      setJumpError('');
      navigate(`/problems/${match.slug || match.id}`);
    } else {
      setJumpError(
        recentProblems === null || error
          ? '题库数据暂不可用，请稍后重试。'
          : '没有找到匹配的题目。',
      );
    }
  };
  const dailyProblem = chooseDailyProblem(recentProblems ?? []);
  const randomProblem = () => {
    if (!recentProblems?.length) {
      setJumpError('随机跳题需要先加载题库数据。');
      return;
    }
    const item =
      recentProblems[Math.floor(Math.random() * recentProblems.length)];
    if (!item) return;
    navigate(`/problems/${item.slug || item.id}`);
  };
  return (
    <section className="home-page">
      <header className="home-intro">
        <div>
          <p className="eyebrow">OJPLATFORM / 在线评测工作台</p>
          <h1>
            {user
              ? `欢迎回来，${user.displayName}`
              : '把每一次练习，做得更扎实。'}
          </h1>
          <p className="home-lede">
            从一道真实题目开始，阅读、提交、复盘，所有过程都和明确的题目版本保持关联。
          </p>
        </div>
        <div className="home-actions" aria-label="常用操作">
          <Link to="/problems">
            <button type="button">进入题库</button>
          </Link>
          <Link to={user ? '/submissions' : '/login'}>
            <button className="secondary" type="button">
              {user ? '查看我的提交' : '登录后继续'}
            </button>
          </Link>
        </div>
      </header>

      <section className="home-workbench" aria-labelledby="quick-jump-title">
        <div className="workbench-main">
          <div className="section-heading-inline">
            <div>
              <p className="eyebrow">快速开始</p>
              <h2 id="quick-jump-title">找到下一道题</h2>
            </div>
            <span className="muted">题号、slug 或标题关键词</span>
          </div>
          <div className="jump-form">
            <input
              aria-label="题目快速跳转"
              value={jumpQuery}
              onChange={(event) => setJumpQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') jump();
              }}
              placeholder="例如：two-sum 或 二分"
            />
            <button type="button" onClick={jump}>
              跳转
            </button>
            <button
              type="button"
              className="secondary"
              onClick={randomProblem}
              disabled={!recentProblems?.length}
            >
              随机跳题
            </button>
          </div>
          {jumpError && (
            <p className="error" role="alert">
              {jumpError}
            </p>
          )}
          {error && (
            <p className="unavailable-note" role="status">
              题库数据暂不可用，快速跳转和随机跳题将在服务恢复后启用。
            </p>
          )}
        </div>
        <div className="workbench-side">
          <span className="panel-label">今日挑战</span>
          {dailyProblem ? (
            <>
              <strong>
                <Link to={`/problems/${dailyProblem.slug || dailyProblem.id}`}>
                  {dailyProblem.title}
                </Link>
              </strong>
              <span className="muted">
                {dailyProblem.slug || dailyProblem.id}
              </span>
              <Link to={`/problems/${dailyProblem.slug || dailyProblem.id}`}>
                开始练习 →
              </Link>
            </>
          ) : (
            <>
              <strong>暂无可用题目</strong>
              <p className="muted">
                题库服务恢复后，这里会按日期展示真实题目。
              </p>
            </>
          )}
        </div>
      </section>

      <section className="home-columns">
        <div className="home-column-main">
          <div className="section-heading-inline">
            <div>
              <p className="eyebrow">题库动态</p>
              <h2>最近更新</h2>
            </div>
            <Link to="/problems">查看全部</Link>
          </div>
          {recentProblems === null ? (
            <p className="muted">正在加载题库…</p>
          ) : recentProblems.length ? (
            <div className="problem-table" role="list">
              {recentProblems.slice(0, 6).map((problem) => (
                <Link
                  key={problem.id}
                  to={`/problems/${problem.slug || problem.id}`}
                >
                  <article role="listitem">
                    <span className="problem-id">
                      {problem.slug || problem.id}
                    </span>
                    <div>
                      <h3>{problem.title}</h3>
                      <p>
                        {problem.statement.slice(0, 100)}
                        {problem.statement.length > 100 ? '…' : ''}
                      </p>
                    </div>
                    <span aria-hidden="true">→</span>
                  </article>
                </Link>
              ))}
            </div>
          ) : (
            <State title="暂无题目" text="公开题目将在服务恢复后显示。" />
          )}
          <div className="home-links">
            <Link to={user ? '/submissions' : '/login'}>
              <strong>{user ? '我的提交' : '登录查看提交'}</strong>
              <span>
                {user ? '查看真实的提交接收记录' : '登录后查看个人练习记录'} →
              </span>
            </Link>
            {user && (
              <Link to="/author">
                <strong>出题工作台</strong>
                <span>管理你的题目草稿 →</span>
              </Link>
            )}
          </div>
        </div>
        <aside className="home-column-side">
          <section className="fortune-panel">
            <div className="section-heading-inline">
              <div>
                <p className="eyebrow">每日小工具</p>
                <h2>今日运势</h2>
              </div>
              <span className="status status-active">仅供娱乐</span>
            </div>
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
              每天对同一浏览器保持一致，不使用密码、令牌、邮箱、手机号或 IP。
            </p>
          </section>
          <section className="announcement-panel">
            <div className="section-heading-inline">
              <div>
                <p className="eyebrow">站点信息</p>
                <h2>站点公告</h2>
              </div>
            </div>
            <ul className="announcement-list">
              {staticAnnouncements.map((item) => (
                <li key={item.id}>
                  <div>
                    <span className="announcement-meta">
                      {item.importance} · {item.date}
                    </span>
                    <strong>
                      <Link to={item.href}>{item.title}</Link>
                    </strong>
                    <p>{item.text}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="field-help">
              以上为 Web 版本控制的静态公告；公告后端接入待后续集成。
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
  const [query, setQuery] = useState('');
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
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">题目资源</p>
          <h1>题库</h1>
        </div>
        <span className="muted">共 {data.page.total} 题</span>
      </div>
      <div className="toolbar">
        <label className="search-field">
          搜索题目
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="按题目标题或题号筛选"
          />
        </label>
        <span className="muted">
          {
            data.items.filter((p) =>
              `${p.title} ${p.slug}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            ).length
          }{' '}
          条结果
        </span>
      </div>
      {data.items.filter((p) =>
        `${p.title} ${p.slug}`.toLowerCase().includes(query.toLowerCase()),
      ).length === 0 ? (
        <State
          title={query ? '当前筛选无结果' : '暂无题目'}
          text={
            query
              ? '请尝试其他关键词，或清除筛选条件。'
              : '已发布题目会显示在这里。'
          }
          action={
            query ? (
              <button
                type="button"
                className="secondary"
                onClick={() => setQuery('')}
              >
                清除筛选
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="problem-table" role="list">
          {data.items
            .filter((p) =>
              `${p.title} ${p.slug}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((p) => (
              <Link key={p.id} to={`/problems/${p.slug || p.id}`}>
                <article role="listitem">
                  <span className="problem-id">{p.slug || p.id}</span>
                  <div>
                    <h2>{p.title}</h2>
                    <p>
                      {p.statement.slice(0, 110)}
                      {p.statement.length > 110 ? '…' : ''}
                    </p>
                  </div>
                  <span className="problem-meta">
                    {p.timeLimitMs} ms ·{' '}
                    {Math.round(p.memoryLimitBytes / 1024 / 1024)} MB
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
    <article className="detail">
      <Link to="/problems">← 返回题库</Link>
      <h1>{problem.title}</h1>
      <div className="submit-cta">
        <Link to={`/problems/${encodeURIComponent(id)}/submit`}>
          <button type="button">提交代码</button>
        </Link>
      </div>
      <div className="limits">
        <span>时间限制 {problem.timeLimitMs} ms</span>
        <span>
          内存限制 {Math.round(problem.memoryLimitBytes / 1024 / 1024)} MB
        </span>
      </div>
      <p className="muted">
        {problem.currentRevisionId
          ? `版本 ${problem.currentRevisionId}`
          : '版本信息暂不可用'}
        {problem.testdataVersion
          ? ` · 测试数据 ${problem.testdataVersion}`
          : ''}
      </p>
      <Section title="题面">{problem.statement}</Section>
      <Section title="输入">{problem.inputDescription}</Section>
      <Section title="输出">{problem.outputDescription}</Section>
      <Section title="数据范围">{problem.constraints}</Section>
      {problem.examples.length > 0 && (
        <Section title="样例">
          {problem.examples.map((e, i) => (
            <pre key={i}>{`输入\n${e.input}\n\n输出\n${e.output}`}</pre>
          ))}
        </Section>
      )}
      {problem.notes && <Section title="补充说明">{problem.notes}</Section>}
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
  if (!user)
    return (
      <State
        title="请先登录"
        text="登录后才能查看个人主页。"
        action={<Link to="/login">登录</Link>}
      />
    );
  return (
    <section className="profile-page">
      <p className="eyebrow">个人主页</p>
      <h1>我的资料</h1>
      <div className="profile-grid">
        <article className="profile-card profile-main">
          <div className="avatar" aria-hidden="true">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h2>{user.displayName}</h2>
            <p className="muted">@{user.username}</p>
            <p>{user.email}</p>
            <span className="status status-active">{user.status}</span>
          </div>
        </article>
        <article className="profile-card">
          <p className="panel-label">快捷入口</p>
          <Link to="/submissions">我的提交</Link>
          <Link to="/author">出题工作台</Link>
          <Link to="/settings">账户与安全</Link>
        </article>
      </div>
      <div className="profile-note">
        <h2>账户信息</h2>
        <p className="muted">
          身份与会话由平台统一管理。当前公开接口尚未提供活动统计，因此页面不会展示虚构数据。
        </p>
      </div>
    </section>
  );
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
              <Link
                to="/submissions"
                ariaLabel="Submissions"
                className={
                  current.name === 'submissions' ||
                  current.name === 'submission'
                    ? 'active'
                    : ''
                }
              >
                提交记录
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
