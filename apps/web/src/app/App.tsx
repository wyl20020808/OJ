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
  type BackendContest,
  type EvaluationListItem,
  type EvaluationFilters,
  type Language,
  type Problem,
  type ProfileContest,
  type Submission,
  type SubmissionEvaluation,
  type SubmissionEvaluationDetail,
  type SubmissionStatus,
} from '../services/api.js';
import './app.css';
import { JudgeMachinesPage } from '../components/JudgeMachinesPage.js';
import { SandboxOperationsPage } from '../components/SandboxOperationsPage.js';
import { AccountSettings } from '../components/AccountSettings.js';
import { AuthExperience } from '../components/AuthExperience.js';
import { ProblemEditor } from '../components/ProblemEditor.js';
import { ProblemSolveEditorSlot } from '../plugins/ProblemSolveEditorSlot.js';
import { HttpCodeRunAdapter } from '@ojplatform/online-code-editor/run/HttpCodeRunAdapter';
import { HttpSubmissionAdapter } from '@ojplatform/online-code-editor/submission/SubmissionAdapter';
import type { ProblemSolveEditorContext } from '@ojplatform/plugin-sdk';
import {
  ContestExperience,
  HomeworkPage,
  MessagesExperience,
  NotificationBell,
  NotificationsPage,
  ProfileExperience,
  WrongBookPage,
} from '../components/PortalExperience.js';
import type {
  ContestDetail,
  ContestListItem,
  ContestProblem,
  ContestSummary,
  FriendRequest,
  FriendSummary,
  ConversationSummary,
  NotificationSummary,
} from '../services/portal-contracts.js';
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
    | 'public-profile'
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
    | 'author-new'
    | 'author-edit'
    | 'sandbox'
    | 'judge-nodes'
    | 'judge-node-detail'
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
  if (path.startsWith('/profiles/'))
    return {
      name: 'public-profile',
      id: decodeURIComponent(path.slice('/profiles/'.length)),
    };
  if (path === '/settings' || path === '/account/settings')
    return { name: 'settings' };
  if (path === '/contests' || path === '/contests/')
    return { name: 'contests' };
  if (path === '/contests/new') return { name: 'contest-new' };
  if (path === '/me/contests' || path === '/contests/mine')
    return { name: 'my-contests' };
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
  if (path === '/admin/judge/nodes') return { name: 'judge-nodes' };
  if (path.startsWith('/admin/judge/nodes/'))
    return {
      name: 'judge-node-detail',
      id: decodeURIComponent(path.slice('/admin/judge/nodes/'.length)),
    };
  if (path === '/problems' || path === '/problems/')
    return { name: 'problems' };
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

type BreadcrumbItem = { label: string; to: string };
const breadcrumbStorageKey = 'ojplatform:breadcrumb-history:v1';
export function dedupeBreadcrumbHistory(
  items: BreadcrumbItem[],
  current?: BreadcrumbItem,
): BreadcrumbItem[] {
  const unique = items.reduce<BreadcrumbItem[]>((result, item) => {
    const existing = result.findIndex((entry) => entry.to === item.to);
    if (existing >= 0) result.splice(existing, 1);
    result.push(item);
    return result;
  }, []);
  if (current) {
    const existing = unique.findIndex((entry) => entry.to === current.to);
    if (existing >= 0) unique.splice(existing, 1);
    unique.push(current);
  }
  return unique.slice(-5);
}
const breadcrumbHistory = (): BreadcrumbItem[] => {
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(breadcrumbStorageKey) ?? '[]',
    );
    return Array.isArray(value)
      ? dedupeBreadcrumbHistory(
          value.filter(
            (item): item is BreadcrumbItem =>
              typeof item?.label === 'string' &&
              typeof item?.to === 'string' &&
              item.to.startsWith('/'),
          ),
        )
      : [];
  } catch {
    return [];
  }
};

function Breadcrumbs({ current }: { current: Route }) {
  const leaf: Record<Route['name'], string> = {
    home: '首页',
    login: '登录',
    register: '注册',
    problems: '题库',
    problem: current.id ?? '题目',
    submit: '提交代码',
    submissions: '评测列表',
    submission: '提交详情',
    profile: '个人主页',
    'public-profile': '公开个人主页',
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
    'author-new': '创建题目',
    'author-edit': '编辑题目',
    sandbox: 'Sandbox 运维',
    'judge-nodes': 'Judge Machines',
    'judge-node-detail': current.id ?? '节点详情',
    forbidden: '无权访问',
    error: '页面加载失败',
    'not-found': '页面不存在',
  };
  const currentItem = {
    label: leaf[current.name],
    to: window.location.pathname,
  };
  const transient = ['login', 'register', 'forbidden', 'error', 'not-found'];
  const [history, setHistory] = useState<BreadcrumbItem[]>(breadcrumbHistory);
  useEffect(() => {
    if (transient.includes(current.name)) return;
    setHistory((previous) => {
      const next = dedupeBreadcrumbHistory(previous, currentItem);
      try {
        window.sessionStorage.setItem(
          breadcrumbStorageKey,
          JSON.stringify(next),
        );
      } catch {
        // Storage can be unavailable in private browsing; in-memory history remains usable.
      }
      return next;
    });
  }, [current.name, currentItem.label, currentItem.to]);
  const items = transient.includes(current.name)
    ? [currentItem]
    : history.at(-1)?.to === currentItem.to
      ? history
      : [...history, currentItem].slice(-5);
  return (
    <nav className="breadcrumbs" aria-label="面包屑">
      {items.map((item, index) => (
        <span key={`${index}-${item.to}-${item.label}`}>
          {index > 0 && <span aria-hidden="true">/</span>}
          {index === items.length - 1 ? (
            <span aria-current="page" title={item.label}>
              {item.label}
            </span>
          ) : (
            <Link to={item.to}>{item.label}</Link>
          )}
        </span>
      ))}
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
  const evaluation = submission.evaluation;
  if (evaluation) {
    const label =
      evaluation.status === 'COMPLETED_WITH_VERDICT'
        ? (evaluation.verdict ?? 'NO_VERDICT')
        : evaluation.status;
    const terminal = [
      'COMPLETED_WITH_VERDICT',
      'CANCELLED',
      'INFRA_FAILED',
      'NO_VERDICT',
      'INCOMPLETE',
    ].includes(evaluation.status);
    return (
      <div
        className={`judge-status tone-${
          evaluation.status === 'COMPLETED_WITH_VERDICT'
            ? evaluation.verdict === 'AC'
              ? 'success'
              : 'warning'
            : terminal
              ? 'danger'
              : 'neutral'
        }`}
        role="status"
      >
        <span className="status">{label}</span>
        <span className="judge-note">
          第 {evaluation.attemptGeneration} 次尝试
        </span>
      </div>
    );
  }
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
  const [contestSummary, setContestSummary] = useState<{
    running: BackendContest[];
    upcoming: BackendContest[];
    recentEnded: BackendContest[];
  }>();
  const [contestError, setContestError] = useState(false);
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
    void api
      .contestHomeSummary()
      .then((summary) => {
        if (
          !Array.isArray(summary?.running) ||
          !Array.isArray(summary?.upcoming) ||
          !Array.isArray(summary?.recentEnded)
        )
          throw new Error('Invalid contest home summary response');
        setContestSummary(summary);
      })
      .catch(() => setContestError(true));
  }, [api]);
  const dailyProblem = chooseDailyProblem(recentProblems ?? []);
  const contestGroups: Array<[string, BackendContest[]]> = contestSummary
    ? [
        ['进行中', contestSummary.running],
        ['即将开始', contestSummary.upcoming],
        ['最近结束', contestSummary.recentEnded],
      ]
    : [];
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
                  {dailyProblem.publicId ||
                    dailyProblem.slug ||
                    dailyProblem.id}
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
            {contestSummary ? (
              <div className="home-contest-summary" aria-label="比赛摘要">
                {contestGroups.map(([label, items]) => (
                  <div key={label}>
                    <span className="eyebrow">{label}</span>
                    {items.length ? (
                      <ul>
                        {items.slice(0, 3).map((contest) => (
                          <li key={contest.id}>
                            <Link to={`/contests/${contest.id}`}>
                              {contest.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">暂无比赛</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p
                className="unavailable-note"
                role={contestError ? 'alert' : 'note'}
              >
                {contestError
                  ? '比赛摘要暂时不可用，请稍后重试。当前不展示虚构赛程或名次。'
                  : '正在加载真实比赛摘要…'}
              </p>
            )}
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

type PaginationItem = number | 'ellipsis';

function paginationItems(current: number, total: number): PaginationItem[] {
  if (total <= 0) return [];
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, 'ellipsis', total];
  if (current >= total - 3)
    return [1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total];
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
}

function Pagination({
  current,
  total,
  onChange,
}: {
  current: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const items = paginationItems(current, total);
  return (
    <nav className="pagination" aria-label="分页">
      <button
        type="button"
        className="pagination-control"
        disabled={current <= 1 || total === 0}
        onClick={() => onChange(current - 1)}
      >
        上一页
      </button>
      <div className="pagination-pages">
        {items.map((item, index) =>
          item === 'ellipsis' ? (
            <span
              key={`ellipsis-${index}`}
              className="pagination-ellipsis"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className="pagination-page"
              aria-current={item === current ? 'page' : undefined}
              aria-label={`第 ${item} 页`}
              onClick={() => onChange(item)}
            >
              {item}
            </button>
          ),
        )}
      </div>
      <span className="pagination-mobile-status" aria-live="polite">
        {total > 0 ? `${current} / ${total}` : '暂无页码'}
      </span>
      <button
        type="button"
        className="pagination-control"
        disabled={current >= total || total === 0}
        onClick={() => onChange(current + 1)}
      >
        下一页
      </button>
    </nav>
  );
}

function ProblemList({
  api,
  user,
}: {
  api: ApiClient;
  user: AuthenticatedUser | null;
}) {
  const pageSize = 20;
  const [data, setData] = useState<{
    items: Problem[];
    page: { total: number; offset: number; limit: number };
  } | null>(null);
  const [error, setError] = useState(false);
  const initialState = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const parsedPage = Number(params.get('page') ?? 1);
    return {
      page: Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
      query: params.get('q') ?? '',
      difficulty: params.get('difficulty') ?? '',
      tag: params.get('tag') ?? '',
      source: params.get('source') ?? '',
    };
  }, []);
  const [page, setPage] = useState(initialState.page);
  const [query, setQuery] = useState(initialState.query);
  const [difficulty, setDifficulty] = useState(initialState.difficulty);
  const [tag, setTag] = useState(initialState.tag);
  const [source, setSource] = useState(initialState.source);
  const offset = (page - 1) * pageSize;
  const syncUrl = (
    values: {
      q: string;
      difficulty: string;
      tag: string;
      source: string;
    },
    nextPage: number,
    replace = false,
  ) => {
    const params = new URLSearchParams();
    if (nextPage > 1) params.set('page', String(nextPage));
    Object.entries(values).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const url = `/problems${params.size ? `?${params.toString()}` : ''}`;
    if (replace) window.history.replaceState({}, '', url);
    else window.history.pushState({}, '', url);
  };
  const currentFilters = () => ({ q: query, difficulty, tag, source });
  const changePage = (nextPage: number) => {
    const totalPages = data ? Math.ceil(data.page.total / data.page.limit) : 0;
    if (!totalPages || nextPage < 1 || nextPage > totalPages) return;
    setPage(nextPage);
    syncUrl(currentFilters(), nextPage);
  };
  const updateFilter = (
    key: 'q' | 'difficulty' | 'tag' | 'source',
    value: string,
  ) => {
    const next = { ...currentFilters(), [key]: value };
    setQuery(next.q);
    setDifficulty(next.difficulty);
    setTag(next.tag);
    setSource(next.source);
    setPage(1);
    syncUrl(next, 1, true);
  };
  const load = () => {
    setError(false);
    void api
      .problems(offset, pageSize, query.trim() ? { search: query.trim() } : {})
      .then(setData)
      .catch(() => setError(true));
  };
  useEffect(load, [api, offset, query]);
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
      setDifficulty(params.get('difficulty') ?? '');
      setTag(params.get('tag') ?? '');
      setSource(params.get('source') ?? '');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  if (error)
    return (
      <State
        title="题库暂不可用"
        text="暂时无法加载题目，请稍后重试。"
        action={<button onClick={load}>重试</button>}
      />
    );
  if (!data)
    return (
      <section className="problem-list-v4">
        <State title="正在加载题库" text="正在获取最新题目列表…" />
        <div className="problem-skeleton" aria-hidden="true">
          {[1, 2, 3, 4].map((item) => (
            <span key={item} />
          ))}
        </div>
      </section>
    );
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
  const clearFilters = () => {
    setQuery('');
    setDifficulty('');
    setTag('');
    setSource('');
    setPage(1);
    window.history.replaceState({}, '', '/problems');
  };
  const totalPages = Math.ceil(data.page.total / data.page.limit);
  const activeFilters = [
    query ? { key: 'q' as const, label: `关键词：${query}` } : null,
    difficulty
      ? { key: 'difficulty' as const, label: `难度：${difficulty}` }
      : null,
    tag ? { key: 'tag' as const, label: `标签：${tag}` } : null,
    source ? { key: 'source' as const, label: `来源：${source}` } : null,
  ].filter(Boolean) as Array<{
    key: 'q' | 'difficulty' | 'tag' | 'source';
    label: string;
  }>;
  return (
    <section className="problem-list-v4">
      <details className="problem-filter-disclosure" open>
        <summary>筛选题目</summary>
        <div className="problem-filters" aria-label="题库筛选">
          <div className="problem-filter-toolbar">
            <strong>搜索与筛选</strong>
            {user && (
              <Link to="/author/problems/new" className="button-link">
                新建题目
              </Link>
            )}
          </div>
          <label className="search-field">
            关键词
            <input
              value={query}
              onChange={(event) => {
                updateFilter('q', event.target.value);
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
                updateFilter('difficulty', event.target.value);
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
                updateFilter('tag', event.target.value);
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
                updateFilter('source', event.target.value);
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
      </details>
      {activeFilters.length > 0 && (
        <div className="applied-filters" aria-label="已应用筛选">
          <span className="applied-filters-label">已筛选</span>
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
          <button type="button" className="filter-clear" onClick={clearFilters}>
            清除全部
          </button>
        </div>
      )}
      <div className="filter-summary" aria-live="polite">
        <span>
          本页 {filtered.length} 条 · 共 {data.page.total} 题
        </span>
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
        <div className="problem-table problem-list-modern" role="list">
          {filtered.map((p) => (
            <Link key={p.id} to={`/problems/${p.slug || p.id}`}>
              <article className="problem-row" role="listitem">
                <span
                  className="problem-id"
                  aria-label={`题目编号 ${p.publicId || p.slug || p.id}`}
                >
                  {p.publicId || p.slug || p.id}
                </span>
                <div className="problem-title-cell">
                  <h2>{p.title}</h2>
                  <div className="tag-row">
                    {p.tags?.length ? (
                      p.tags.map((item) => <span key={item}>{item}</span>)
                    ) : (
                      <span>暂无标签</span>
                    )}
                  </div>
                  {p.source && (
                    <span className="problem-source">来源 · {p.source}</span>
                  )}
                </div>
                <span className="difficulty-label problem-difficulty-chip">
                  {p.difficulty ?? '难度未提供'}
                </span>
                <span aria-hidden="true">→</span>
              </article>
            </Link>
          ))}
        </div>
      )}
      <Pagination current={page} total={totalPages} onChange={changePage} />
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
  background: string;
  statement: string;
  inputDescription: string;
  outputDescription: string;
  constraints: string;
  notes: string;
  samples: { ordinal: number; input: string; output: string }[];
  timeLimitMs: number;
  memoryLimitBytes: number;
  testdataVersion?: string | null;
  visibility: Problem['visibility'];
  difficulty: NonNullable<Problem['difficulty']> | null;
  tags: string[];
  status: Problem['status'];
  updatedAt?: string;
};
const emptyDraft: Draft = {
  slug: '',
  title: '',
  background: '',
  statement: '',
  inputDescription: '',
  outputDescription: '',
  constraints: '',
  notes: '',
  samples: [],
  timeLimitMs: 1000,
  memoryLimitBytes: 256 * 1024 * 1024,
  testdataVersion: null,
  visibility: 'private' as const,
  difficulty: null,
  tags: [],
  status: 'draft' as const,
};

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
          background: p.background ?? '',
          notes: p.notes ?? '',
          samples:
            p.samples ??
            p.examples.map((sample, index) => ({
              ordinal: index + 1,
              input: sample.input,
              output: sample.output,
            })),
          difficulty: p.difficulty ?? null,
          tags: p.tags ?? [],
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
    if (!form.slug || !form.title || !form.statement) {
      setMessage('请先填写所有必填字段。');
      return;
    }
    setSaving(true);
    try {
      const editable = {
        slug: form.slug,
        title: form.title,
        background: form.background,
        statement: form.statement,
        inputDescription: form.inputDescription,
        outputDescription: form.outputDescription,
        samples: form.samples,
        constraints: form.constraints,
        notes: form.notes,
        timeLimitMs: form.timeLimitMs,
        memoryLimitBytes: form.memoryLimitBytes,
        testdataVersion: form.testdataVersion ?? null,
        difficulty: form.difficulty,
        visibility: form.visibility,
        tags: form.tags,
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
        e instanceof ApiError && e.code === 'CONFLICT'
          ? new ApiError(
              {
                code: e.code,
                requestId: e.requestId,
                ...(e.details === undefined ? {} : { details: e.details }),
                message: '题目编号已存在，请更换题目标识。',
              },
              e.status,
            )
          : e instanceof ApiError
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
      <Link to="/problems">← 返回题库</Link>
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
      <form className="authoring-workspace" onSubmit={submit} noValidate>
        <section className="authoring-section">
          <h2>基本信息</h2>
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
            <label>
              难度
              <select
                value={form.difficulty ?? ''}
                onChange={(e) =>
                  update(
                    'difficulty',
                    e.target.value === '' ? null : e.target.value,
                  )
                }
              >
                <option value="">未设置</option>
                <option value="入门">入门</option>
                <option value="简单">简单</option>
                <option value="中等">中等</option>
                <option value="困难">困难</option>
                <option value="专家">专家</option>
              </select>
            </label>
            <label>
              可见性
              <select
                value={form.visibility}
                onChange={(e) => update('visibility', e.target.value)}
              >
                <option value="private">仅自己可见</option>
                <option value="public">公开</option>
              </select>
            </label>
          </div>
        </section>
        <section className="authoring-section">
          <h2>题目背景</h2>
          <textarea
            value={form.background}
            onChange={(e) => update('background', e.target.value)}
            rows={7}
          />
        </section>
        <section className="authoring-section">
          <h2>题目描述</h2>
          <textarea
            aria-label="题面"
            value={form.statement}
            onChange={(e) => update('statement', e.target.value)}
            rows={6}
            required
          />
        </section>
        <section className="authoring-section statement-grid">
          <label>
            输入格式
            <textarea
              aria-label="输入说明"
              value={form.inputDescription}
              onChange={(e) => update('inputDescription', e.target.value)}
              rows={4}
            />
          </label>
          <label>
            输出格式
            <textarea
              aria-label="输出说明"
              value={form.outputDescription}
              onChange={(e) => update('outputDescription', e.target.value)}
              rows={4}
            />
          </label>
        </section>
        <section className="authoring-section">
          <h2>样例</h2>
          {form.samples.map((sample, index) => (
            <div className="sample-editor" key={sample.ordinal}>
              <div className="sample-heading">
                <strong>样例 #{index + 1}</strong>
                <button
                  className="secondary"
                  type="button"
                  onClick={() =>
                    update(
                      'samples',
                      form.samples
                        .filter((_, item) => item !== index)
                        .map((item, ordinal) => ({
                          ...item,
                          ordinal: ordinal + 1,
                        })),
                    )
                  }
                >
                  删除
                </button>
              </div>
              <div className="statement-grid">
                <label>
                  输入
                  <textarea
                    rows={4}
                    value={sample.input}
                    onChange={(e) =>
                      update(
                        'samples',
                        form.samples.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, input: e.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  输出
                  <textarea
                    rows={4}
                    value={sample.output}
                    onChange={(e) =>
                      update(
                        'samples',
                        form.samples.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, output: e.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
              </div>
            </div>
          ))}
          <button
            className="secondary"
            type="button"
            onClick={() =>
              update('samples', [
                ...form.samples,
                { ordinal: form.samples.length + 1, input: '', output: '' },
              ])
            }
          >
            添加样例
          </button>
        </section>
        <section className="authoring-section">
          <h2>数据范围</h2>
          <textarea
            aria-label="数据范围"
            value={form.constraints}
            onChange={(e) => update('constraints', e.target.value)}
            rows={4}
          />
        </section>
        <section className="authoring-section">
          <h2>说明 / 提示</h2>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={3}
          />
        </section>
        <section className="authoring-section statement-grid">
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
        </section>
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
export function ProblemDetail({
  api,
  id,
  user,
}: {
  api: ApiClient;
  id: string;
  user?: AuthenticatedUser | null;
}) {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [copyMessage, setCopyMessage] = useState('');
  const [checker, setChecker] = useState<'EXACT_BYTES' | 'TOKEN_WHITESPACE'>(
    'EXACT_BYTES',
  );
  const codeRunAdapter = useMemo(() => new HttpCodeRunAdapter(), []);
  const submissionAdapter = useMemo(() => new HttpSubmissionAdapter(), []);
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
  useEffect(() => {
    void api
      .judgeData(id)
      .then((data) => setChecker(data.defaults.checker))
      .catch(() => undefined);
  }, [api, id]);
  if (error)
    return error.code === 'NOT_FOUND' ? (
      <State title="题目不存在" text="该题目不存在或当前不可用。" />
    ) : (
      <State title="题目暂不可用" text={error.message} />
    );
  if (!problem) return <State title="正在加载题目" text="正在获取题面详情…" />;
  const canEdit = problem.capabilities?.canEdit === true;
  return (
    <>
      <article className="problem-detail-v4">
        <div className="problem-main">
          <header className="problem-heading">
            <span className="problem-id">
              {problem.publicId || problem.slug || problem.id}
            </span>
            <h1>{problem.title}</h1>
            <div className="problem-header-actions" aria-label="题目操作">
              <Link to={`/problems/${encodeURIComponent(id)}/submit`}>
                <button type="button">提交代码</button>
              </Link>
              {canEdit && (
                <Link
                  to={`/author/problems/${encodeURIComponent(problem.id)}/edit`}
                >
                  <button type="button" className="secondary">
                    编辑题目
                  </button>
                </Link>
              )}
              <button type="button" className="secondary" disabled>
                收藏
              </button>
            </div>
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
          {problem.notes && (
            <Section title="说明与提示">{problem.notes}</Section>
          )}
        </div>
        <aside className="problem-aside" aria-label="题目信息">
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
      <section className="problem-editor-slot" aria-label="OnlineCodeEditor">
        <ProblemSolveEditorSlot
          context={
            {
              problemId: problem.id,
              slug: problem.slug,
              samples: problem.examples.map((sample, index) => ({
                input: sample.input,
                output: sample.output,
                label: `样例 ${index + 1}`,
              })),
              problemRevisionId: problem.currentRevisionId ?? '',
              checker,
              codeRunAdapter,
              ...(user ? { submissionAdapter } : {}),
              onViewSubmission: (submissionId: string) =>
                navigate(`/submissions/${encodeURIComponent(submissionId)}`),
            } as ProblemSolveEditorContext
          }
        />
      </section>
    </>
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
        problemId: problem?.id ?? problemId,
        problemRevisionId: problem?.currentRevisionId ?? problemId,
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
        action={<Link to="/submissions">查看评测列表</Link>}
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
        {error && <FormMessage error={error} />}
        <button disabled={state === 'saving'}>
          {state === 'saving' ? '提交中…' : '提交源代码'}
        </button>
      </form>
    </section>
  );
}

function SubmissionHistory({ api }: { api: ApiClient }) {
  const [items, setItems] = useState<EvaluationListItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [resultFilter, setResultFilter] = useState('');
  const [problemFilter, setProblemFilter] = useState('');
  const [submitterFilter, setSubmitterFilter] = useState('');
  const requestVersion = useRef(0);
  const filters = useMemo<EvaluationFilters>(() => {
    if (!resultFilter)
      return {
        ...(problemFilter ? { problemId: problemFilter.trim() } : {}),
        ...(submitterFilter ? { submitterId: submitterFilter.trim() } : {}),
      };
    const verdicts = new Set(['AC', 'WA', 'CE', 'RE', 'TLE', 'MLE']);
    return {
      ...(verdicts.has(resultFilter)
        ? { verdict: resultFilter }
        : { status: resultFilter }),
      ...(problemFilter ? { problemId: problemFilter.trim() } : {}),
      ...(submitterFilter ? { submitterId: submitterFilter.trim() } : {}),
    };
  }, [problemFilter, resultFilter, submitterFilter]);
  const load = () => {
    const version = ++requestVersion.current;
    setItems(null);
    setError('');
    void api
      .evaluations(cursor, 20, filters)
      .then((d) => {
        if (version !== requestVersion.current) return;
        setItems(d.items);
        setNext(d.nextCursor);
      })
      .catch((e) => {
        if (version !== requestVersion.current) return;
        setError(e instanceof ApiError ? e.message : '无法加载评测列表。');
      });
  };
  useEffect(load, [api, cursor, filters]);
  useEffect(
    () => () => {
      requestVersion.current++;
    },
    [],
  );
  if (error)
    return (
      <State
        title="评测列表暂不可用"
        text={error}
        action={<button onClick={load}>重试</button>}
      />
    );
  if (!items)
    return <State title="正在加载评测列表" text="正在获取全站评测记录…" />;
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">评测</p>
          <h1>评测列表</h1>
        </div>
      </div>
      <div className="evaluation-filters" aria-label="评测筛选">
        <label>
          结果
          <select
            aria-label="结果"
            value={resultFilter}
            onChange={(event) => {
              setResultFilter(event.target.value);
              setCursor(undefined);
            }}
          >
            <option value="">全部结果</option>
            <option value="AC">AC</option>
            <option value="WA">WA</option>
            <option value="CE">CE</option>
            <option value="RE">RE</option>
            <option value="TLE">TLE</option>
            <option value="MLE">MLE</option>
            <option value="INFRA_FAILED">INFRA_FAILED</option>
            <option value="QUEUED">QUEUED</option>
            <option value="RUNNING">RUNNING</option>
          </select>
        </label>
        <label>
          题目
          <input
            aria-label="题目"
            value={problemFilter}
            placeholder="题目 ID / slug"
            onChange={(event) => {
              setProblemFilter(event.target.value);
              setCursor(undefined);
            }}
          />
        </label>
        <label>
          提交者
          <input
            aria-label="提交者"
            value={submitterFilter}
            placeholder="提交者 ID"
            onChange={(event) => {
              setSubmitterFilter(event.target.value);
              setCursor(undefined);
            }}
          />
        </label>
        <button
          type="button"
          className="filter-clear"
          onClick={() => {
            setResultFilter('');
            setProblemFilter('');
            setSubmitterFilter('');
            setCursor(undefined);
          }}
          disabled={!resultFilter && !problemFilter && !submitterFilter}
        >
          清除筛选
        </button>
      </div>
      {items.length === 0 ? (
        <State title="暂无评测记录" text="新的提交评测会显示在这里。" />
      ) : (
        <div className="evaluation-list" role="table" aria-label="评测列表">
          <div className="evaluation-list-header" role="row">
            <span role="columnheader">评测 ID</span>
            <span role="columnheader">题目</span>
            <span role="columnheader">提交者</span>
            <span role="columnheader">语言</span>
            <span role="columnheader">状态</span>
            <span role="columnheader">资源</span>
            <span role="columnheader">时间</span>
          </div>
          {items.map((s) => (
            <Link
              key={s.submissionId}
              to={`/submissions/${encodeURIComponent(s.submissionId)}`}
              className="evaluation-row"
              ariaLabel={`查看评测 ${s.publicNumber !== undefined ? `#${s.publicNumber}` : s.submissionId}`}
            >
              <span>
                #
                {s.publicNumber !== undefined ? s.publicNumber : s.submissionId}
              </span>
              <span>
                <strong>{s.problem.title}</strong>
                <small>{s.problem.publicId || s.problem.slug}</small>
              </span>
              <span>{s.submitter.displayName}</span>
              <span>{s.languageProfileId}</span>
              <strong className="judge-status">{s.verdict ?? s.status}</strong>
              <span>
                {formatMilliseconds(s.totalTimeMs)} /{' '}
                {formatBytes(s.peakMemoryBytes)}
              </span>
              <time>{formatDate(s.createdAt)}</time>
            </Link>
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

export function SubmissionDetail({
  api,
  id,
  user,
}: {
  api: ApiClient;
  id: string;
  user: AuthenticatedUser | null;
}) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [submissionProblem, setSubmissionProblem] = useState<Problem | null>(
    null,
  );
  const [error, setError] = useState<ApiError | null>(null);
  const [transportError, setTransportError] = useState('');
  const [history, setHistory] = useState<SubmissionEvaluation[]>([]);
  const [selectedGeneration, setSelectedGeneration] = useState<number>();
  const [evaluation, setEvaluation] = useState<
    (SubmissionEvaluation & { detail?: SubmissionEvaluationDetail }) | null
  >(null);
  const evaluationRef = useRef(evaluation);
  evaluationRef.current = evaluation;
  const [evaluationError, setEvaluationError] = useState(false);
  const [activeTab, setActiveTab] = useState<'testcases' | 'code'>('testcases');
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
        if (typeof api.problem === 'function')
          void api
            .problem(value.problemId)
            .then(setSubmissionProblem)
            .catch(() => setSubmissionProblem(null));
        void api
          .submissionEvaluations(id)
          .then((response) => {
            if (version !== requestVersion.current) return;
            setHistory(response.items);
            setSelectedGeneration(
              (selected) =>
                selected ??
                response.items.find((item) => item.current)
                  ?.evaluationGeneration ??
                value.evaluation?.evaluationGeneration,
            );
          })
          .catch(() => {
            if (version === requestVersion.current) setHistory([]);
          });
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
    const currentEvaluation = evaluationRef.current;
    if (
      !user ||
      !currentEvaluation ||
      selectedGeneration !== currentEvaluation.evaluationGeneration ||
      isEvaluationTerminal(currentEvaluation.status) ||
      typeof api.submissionEvaluationStreamUrl !== 'function' ||
      typeof EventSource === 'undefined'
    )
      return;
    const stream = new EventSource(
      api.submissionEvaluationStreamUrl(id, selectedGeneration),
      { withCredentials: true },
    );
    const applyEvent = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as {
          status?: SubmissionEvaluation['status'];
          verdict?: SubmissionEvaluation['verdict'];
          detail?: SubmissionEvaluationDetail;
          completedAt?: string;
        };
        setEvaluation((current) => {
          if (
            !current ||
            (event.status &&
              isEvaluationTerminal(current.status) &&
              !isEvaluationTerminal(event.status))
          )
            return current;
          return {
            ...current,
            ...(event.status ? { status: event.status } : {}),
            ...(event.verdict ? { verdict: event.verdict } : {}),
            ...(event.completedAt ? { completedAt: event.completedAt } : {}),
            ...(event.detail ? { detail: event.detail } : {}),
          };
        });
      } catch {
        /* Ignore malformed deltas; snapshot remains authoritative. */
      }
    };
    stream.addEventListener('evaluation.updated', applyEvent);
    stream.addEventListener('testcase.updated', applyEvent);
    stream.addEventListener('evaluation.terminal', applyEvent);
    stream.addEventListener('replay-gap', () => load());
    return () => stream.close();
  }, [api, id, selectedGeneration, user]);
  if (!user)
    return (
      <State
        title="请先登录"
        text="登录后才能查看这条评测记录。"
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
  const isTerminal = evaluation
    ? [
        'COMPLETED_WITH_VERDICT',
        'CANCELLED',
        'INFRA_FAILED',
        'NO_VERDICT',
        'INCOMPLETE',
      ].includes(evaluation.status)
    : false;
  const hasLiveTestcases = Boolean(
    evaluation?.detail?.testcases.some((item) => item.status),
  );
  return (
    <article className="detail submission-detail">
      <Link to="/submissions">← 返回评测列表</Link>
      <p className="eyebrow">提交详情</p>
      <div className="submission-heading">
        <div>
          <h1>评测 #{evaluation?.publicNumber ?? '?'}</h1>
          <h2 className="submission-a11y-label">Submission #{submission.id}</h2>
          <p>
            <Link to={`/problems/${encodeURIComponent(submission.problemId)}`}>
              {submissionProblem?.publicId || submissionProblem?.slug || '题目'}{' '}
              {submissionProblem?.title || ''}
            </Link>
          </p>
        </div>
        {evaluation?.verdict ? (
          <strong className="submission-verdict">{evaluation.verdict}</strong>
        ) : (
          <JudgeStatus submission={submission} />
        )}
      </div>
      <dl className="submission-facts">
        <div>
          <dt>语言</dt>
          <dd>{submission.languageId}</dd>
        </div>
        <div>
          <dt>提交时间</dt>
          <dd>{formatDate(submission.createdAt)}</dd>
        </div>
        <div>
          <dt>评测时间</dt>
          <dd>
            {evaluation?.completedAt
              ? formatDate(evaluation.completedAt)
              : '评测中'}
          </dd>
        </div>
      </dl>
      <div className="submission-detail-actions">
        <button type="button" className="secondary" onClick={load}>
          刷新执行状态
        </button>
      </div>
      <div className="submission-tabs" role="tablist" aria-label="评测详情视图">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'testcases'}
          onClick={() => setActiveTab('testcases')}
        >
          测试点
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'code'}
          onClick={() => setActiveTab('code')}
        >
          代码
        </button>
      </div>
      {activeTab === 'code' ? (
        <section className="submission-code-panel" aria-label="提交源代码">
          <div className="section-heading-inline">
            <h2>代码</h2>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                void navigator.clipboard?.writeText(submission.source)
              }
              aria-label="复制代码"
            >
              复制代码
            </button>
          </div>
          <pre className="source">{submission.source}</pre>
        </section>
      ) : null}
      {activeTab === 'testcases' ? (
        <pre className="submission-source-a11y" aria-hidden="true">
          {submission.source}
        </pre>
      ) : null}
      {history.length ? (
        <section className="submission-generation" aria-label="评测历史">
          {history.map((item) => (
            <button
              key={item.evaluationGeneration}
              type="button"
              aria-pressed={selectedGeneration === item.evaluationGeneration}
              onClick={() => setSelectedGeneration(item.evaluationGeneration)}
            >
              #{item.publicNumber ?? '?'} · Generation{' '}
              {item.evaluationGeneration}
              {item.current ? ' - Current' : ''} {item.verdict ?? item.status}
            </button>
          ))}
        </section>
      ) : null}
      {evaluationError ? (
        <State
          title="评测详情暂不可用"
          text="无法加载评测详情，请刷新后重试。"
          action={<button onClick={load}>刷新</button>}
        />
      ) : !evaluation ? (
        <State
          title="正在加载评测详情"
          text="正在获取 Judge 已发布的评测结果…"
        />
      ) : (
        <>
          <section className="submission-metrics" aria-label="评测资源使用">
            <div>
              <span>Verdict</span>
              <strong>{evaluation.verdict ?? evaluation.status}</strong>
            </div>
            <div>
              <span>Time</span>
              <strong>
                {formatMilliseconds(evaluation.detail?.totalTimeMs)}
              </strong>
            </div>
            <div>
              <span>Memory</span>
              <strong>{formatBytes(evaluation.detail?.peakMemoryBytes)}</strong>
            </div>
            <div>
              <span>状态</span>
              <strong>{evaluation.verdict ?? evaluation.status}</strong>
            </div>
          </section>
          {activeTab === 'testcases' &&
            (isTerminal || hasLiveTestcases) &&
            evaluation.detail?.compile?.diagnostics && (
              <Section title="编译诊断">
                <pre className="compiler-diagnostics">
                  {evaluation.detail.compile.diagnostics}
                </pre>
              </Section>
            )}
          {activeTab === 'testcases' && (isTerminal || hasLiveTestcases) ? (
            <section
              className="testcase-results"
              aria-labelledby="testcase-results-title"
            >
              <div className="section-heading-inline">
                <div>
                  <p className="eyebrow">Testcase Results</p>
                  <h2 id="testcase-results-title">测试点结果</h2>
                </div>
              </div>
              {evaluation.detail?.testcases.length ? (
                <div className="testcase-list" role="list">
                  {evaluation.detail.testcases.map((item) => (
                    <article
                      key={item.ordinal}
                      role="listitem"
                      className="testcase-row"
                    >
                      <strong>#{item.ordinal}</strong>
                      <span className="testcase-verdict">
                        {item.verdict ?? item.status ?? 'WAITING'}
                      </span>
                      <span>{formatMilliseconds(item.timeMs)}</span>
                      <span>{formatBytes(item.memoryBytes)}</span>
                      {item.runtimeReason && (
                        <span className="testcase-reason">
                          {item.runtimeReason}
                        </span>
                      )}
                      {item.exitCode !== undefined && (
                        <span className="testcase-reason">
                          Exit {item.exitCode}
                        </span>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="submission-muted">
                  该评测代没有可展示的测试点执行记录。
                </p>
              )}
            </section>
          ) : null}
          {!isTerminal && activeTab === 'testcases' && !hasLiveTestcases ? (
            <section className="submission-pending" aria-live="polite">
              <h2>
                {evaluation.status === 'QUEUED' ? '正在排队评测' : '正在评测'}
              </h2>
              <p>正在评测，详细测试点结果将在评测完成后显示。</p>
            </section>
          ) : null}
        </>
      )}
    </article>
  );
}

function isEvaluationTerminal(status: SubmissionEvaluation['status']) {
  return [
    'COMPLETED_WITH_VERDICT',
    'CANCELLED',
    'INFRA_FAILED',
    'NO_VERDICT',
    'INCOMPLETE',
  ].includes(status);
}
function formatMilliseconds(value: number | undefined) {
  return value === undefined ? '未提供' : `${value} ms`;
}
function formatBytes(value: number | undefined) {
  if (value === undefined) return '未提供';
  return value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.ceil(value / 1024))} KB`;
}

function Profile({
  api,
  user,
  username,
}: {
  api: ApiClient;
  user: AuthenticatedUser | null;
  username?: string;
}) {
  return (
    <ProfileExperience
      user={user}
      api={api}
      {...(username === undefined ? {} : { username })}
      navigate={navigate}
    />
  );
}

const contestSummary = (
  value: BackendContest,
): ContestSummary & Pick<ContestDetail, 'format' | 'registration'> => ({
  id: value.id,
  title: value.title,
  lifecycle: value.lifecycle,
  visibility: value.visibility,
  registration:
    value.lifecycle === 'UPCOMING'
      ? 'REGISTRATION_OPEN'
      : 'REGISTRATION_CLOSED',
  format: value.format,
  startsAt: value.startsAt,
  endsAt: value.endsAt,
});

const profileContestSummary = (value: ProfileContest): ContestListItem => ({
  id: value.id,
  title: value.title,
  visibility: value.visibility,
  lifecycle: value.lifecycle,
  startsAt: value.startsAt,
  endsAt: value.endsAt,
  relationship: value.relationship,
});

function routeErrorText(error: unknown, feature: string) {
  if (error instanceof ApiError) {
    if (error.code === 'GUEST_ACCOUNT_REQUIRES_UPGRADE')
      return '游客账号需要升级为正式账号后才能使用此能力。';
    if (error.status === 401) return `请先登录后查看${feature}。`;
    if (error.status === 403) return `当前账号没有权限查看${feature}。`;
    if (error.status === 404) return `${feature}不存在或当前不可用。`;
    if (error.status === 409) return `${feature}状态已发生变化，请刷新后重试。`;
    if (error.status === 429) return '请求过于频繁，请稍后重试。';
  }
  return `${feature}暂时不可用，请稍后重试。`;
}

const contestProblemSummary = (value: {
  problemId: string;
  label?: string;
  title: string;
  score?: number;
  pointsConfig?: { score?: number } | null;
}): ContestProblem => ({
  problemId: value.problemId,
  label: value.label ?? value.problemId,
  title: value.title,
  ...(value.pointsConfig?.score === undefined && value.score === undefined
    ? {}
    : { score: value.pointsConfig?.score ?? value.score }),
});

function ContestRoute({
  api,
  view,
  contestId,
  navigate,
}: {
  api: ApiClient;
  view:
    | 'list'
    | 'mine'
    | 'detail'
    | 'problems'
    | 'submissions'
    | 'standings'
    | 'settings';
  contestId?: string;
  navigate: (path: string) => void;
}) {
  const [contests, setContests] = useState<ContestListItem[]>([]);
  const [detail, setDetail] = useState<ContestDetail>();
  const [problems, setProblems] = useState<ContestProblem[]>([]);
  const [standings, setStandings] = useState<never[]>([]);
  const [standingsUnavailableReason, setStandingsUnavailableReason] =
    useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setStandingsUnavailableReason(undefined);
    if (view === 'list' || view === 'mine') {
      const request =
        view === 'mine'
          ? api
              .profileContests()
              .then((result) => result.items.map(profileContestSummary))
          : api.contests().then((result) => result.items.map(contestSummary));
      void request
        .then((items) => {
          if (active) setContests(items);
        })
        .catch((reason: unknown) => {
          if (active)
            setError(
              routeErrorText(reason, view === 'mine' ? '我的比赛' : '比赛列表'),
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }
    if (!contestId) {
      setLoading(false);
      return () => {
        active = false;
      };
    }
    const standingsRequest =
      view === 'standings'
        ? api.contestStandings(contestId)
        : Promise.resolve(undefined);
    void Promise.all([
      api.contest(contestId),
      api.contestProblems(contestId),
      standingsRequest,
    ])
      .then(([value, problemResult, standingResult]) => {
        if (!active) return;
        setDetail({
          ...contestSummary(value),
          description: value.description,
          canRegister: value.lifecycle === 'UPCOMING',
          canManage: value.canManage,
        });
        setProblems(problemResult.items.map(contestProblemSummary));
        if (standingResult && 'available' in standingResult) {
          if (standingResult.available) setStandings([]);
          else setStandingsUnavailableReason(standingResult.reason);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(routeErrorText(reason, '比赛数据'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, contestId, reload, view]);
  return (
    <ContestExperience
      view={view}
      {...(contestId ? { contestId } : {})}
      navigate={navigate}
      api={api}
      loading={loading}
      error={error || undefined}
      onRetry={() => setReload((value) => value + 1)}
      {...(view === 'list' || view === 'mine' ? { contests } : {})}
      {...(detail ? { detail } : {})}
      {...(view === 'problems' ? { problems } : {})}
      {...(view === 'standings' ? { standings } : {})}
      {...(view === 'standings' && standingsUnavailableReason
        ? { standingsUnavailableReason }
        : {})}
    />
  );
}

function NotificationsRoute({ api }: { api: ApiClient }) {
  const [items, setItems] = useState<NotificationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void api
      .notifications()
      .then((result) => {
        if (active) setItems(result.items);
      })
      .catch((reason: unknown) => {
        if (active) setError(routeErrorText(reason, '通知'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, reload]);
  return (
    <NotificationsPage
      notifications={items}
      api={api}
      loading={loading}
      loadError={error || undefined}
      onRetry={() => setReload((value) => value + 1)}
    />
  );
}

function MessagesRoute({ api }: { api: ApiClient }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void Promise.all([
      api.conversations(),
      api.friends(),
      api.friendRequests('incoming'),
      api.friendRequests('outgoing'),
    ])
      .then(([conversationResult, friendResult, incoming, outgoing]) => {
        if (!active) return;
        setConversations(
          conversationResult.items.map((item) => ({
            ...item,
            muted: false,
            pinned: false,
          })),
        );
        setFriends(friendResult.items);
        setRequests([...incoming.items, ...outgoing.items]);
      })
      .catch((reason: unknown) => {
        if (active) setError(routeErrorText(reason, '通讯数据'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, reload]);
  return (
    <MessagesExperience
      api={api}
      conversations={conversations}
      friends={friends}
      requests={requests}
      loading={loading}
      loadError={error || undefined}
      onRetry={() => setReload((value) => value + 1)}
    />
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
  const [canViewJudgeAdmin, setCanViewJudgeAdmin] = useState(false);
  useEffect(() => {
    const h = () => setCurrent(route());
    window.addEventListener('popstate', h);
    void api
      .me()
      .then((value) => {
        setUser(value);
        setAuthState('authenticated');
        void api
          .judgeAdminCapabilities()
          .then((capability) => setCanViewJudgeAdmin(capability.canView))
          .catch(() => setCanViewJudgeAdmin(false));
      })
      .catch((error) => {
        setUser(null);
        setCanViewJudgeAdmin(false);
        setAuthState(
          error instanceof ApiError && error.status === 401
            ? 'unauthenticated'
            : 'unavailable',
        );
      });
    // Keep readiness polling for runtime diagnostics without reserving page-header space.
    void api.readiness().catch(() => undefined);
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
          void api
            .judgeAdminCapabilities()
            .then((capability) => setCanViewJudgeAdmin(capability.canView))
            .catch(() => setCanViewJudgeAdmin(false));
        }}
        onNavigate={navigate}
      />
    ) : current.name === 'forbidden' ? (
      <Forbidden />
    ) : current.name === 'error' ? (
      <GenericError />
    ) : current.name === 'problems' ? (
      <ProblemList api={api} user={user} />
    ) : current.name === 'contests' ? (
      <ContestRoute api={api} view="list" navigate={navigate} />
    ) : current.name === 'my-contests' ? (
      <ContestRoute api={api} view="mine" navigate={navigate} />
    ) : current.name === 'contest-new' ? (
      <ContestExperience view="create" navigate={navigate} api={api} />
    ) : current.name === 'contest-detail' ? (
      <ContestRoute
        api={api}
        view="detail"
        contestId={current.id ?? ''}
        navigate={navigate}
      />
    ) : current.name === 'contest-problems' ? (
      <ContestRoute
        api={api}
        view="problems"
        contestId={current.id ?? ''}
        navigate={navigate}
      />
    ) : current.name === 'contest-submissions' ? (
      <ContestRoute
        api={api}
        view="submissions"
        contestId={current.id ?? ''}
        navigate={navigate}
      />
    ) : current.name === 'contest-standings' ? (
      <ContestRoute
        view="standings"
        contestId={current.id ?? ''}
        navigate={navigate}
        api={api}
      />
    ) : current.name === 'contest-settings' ? (
      <ContestRoute
        view="settings"
        contestId={current.id ?? ''}
        navigate={navigate}
        api={api}
      />
    ) : current.name === 'homework' || current.name === 'homework-detail' ? (
      <HomeworkPage navigate={navigate} />
    ) : current.name === 'wrong-book' ? (
      <WrongBookPage navigate={navigate} />
    ) : current.name === 'notifications' ? (
      <NotificationsRoute api={api} />
    ) : current.name === 'messages' ? (
      <MessagesRoute api={api} />
    ) : current.name === 'submit' ? (
      <SubmissionForm api={api} problemId={current.id ?? ''} user={user} />
    ) : current.name === 'submissions' ? (
      <SubmissionHistory api={api} />
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
          text="登录后才能查看这条评测记录。"
          action={<Link to="/login">登录</Link>}
        />
      )
    ) : current.name === 'sandbox' ? (
      <SandboxOperationsPage api={api} authorized={Boolean(user)} />
    ) : current.name === 'judge-nodes' ||
      current.name === 'judge-node-detail' ? (
      <JudgeMachinesPage
        {...(current.id ? { nodeId: current.id } : {})}
        canManage={Boolean(user && !user.guest)}
      />
    ) : current.name === 'public-profile' ? (
      <Profile
        api={api}
        user={user}
        {...(current.id === undefined ? {} : { username: current.id })}
      />
    ) : current.name === 'profile' ? (
      <Profile api={api} user={user} />
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
        <ProblemEditor api={api} problemId={current.id} />
      ) : (
        <State
          title="请先登录"
          text="登录后才能编辑题目草稿。"
          action={<Link to="/login">登录</Link>}
        />
      )
    ) : current.name === 'problem' ? (
      <ProblemDetail api={api} id={current.id ?? ''} user={user} />
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
            评测列表
          </Link>
          {canViewJudgeAdmin && (
            <Link
              to="/admin/judge/nodes"
              className={current.name.startsWith('judge-') ? 'active' : ''}
            >
              管理
            </Link>
          )}
          <NotificationBell navigate={navigate} api={api} />
          {user ? (
            <>
              {user.guest && (
                <span className="guest-badge nav-guest-badge">游客</span>
              )}
              <Link
                to="/profile"
                className={current.name === 'profile' ? 'active' : ''}
              >
                {user.displayName}
              </Link>
              <button
                className="link-button"
                onClick={() => {
                  void api.logout().finally(() => {
                    setUser(null);
                    setCanViewJudgeAdmin(false);
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
