import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  ApiError,
  createApiClient,
  type ApiClient,
  type AuthenticatedUser,
  type BackendContest,
  type Language,
  type Problem,
  type ProfileContest,
  type Submission,
  type SubmissionStatus,
  type DiscussionPost,
} from '../services/api.js';
import './app.css';
import '../features/problem-detail/ProblemDetailLayout.css';
import { JudgeMachinesPage } from '../components/JudgeMachinesPage.js';
import { SandboxOperationsPage } from '../components/SandboxOperationsPage.js';
import { AccountSettings } from '../components/AccountSettings.js';
import { AuthExperience } from '../components/AuthExperience.js';
import {
  MarkdownFieldSection,
  ProblemEditor,
  type MarkdownFieldKey,
} from '../components/ProblemEditor.js';
import { ProblemSolveEditorSlot } from '../plugins/ProblemSolveEditorSlot.js';
import { HttpCodeRunAdapter } from '@ojplatform/online-code-editor/run/HttpCodeRunAdapter';
import type { ProblemSolveEditorContext } from '@ojplatform/plugin-sdk';
import { ProblemStatementRenderer } from '../components/ProblemStatementRenderer.js';
import { ProfilePage } from '../features/profile/ProfilePage.js';
import {
  ContestExperience,
  MessagesExperience,
  NotificationsPage,
  WrongBookPage,
} from '../components/PortalExperience.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { AppNavbar } from '../components/layout/AppNavbar.js';
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
import { chooseDailyProblem, getDailyFortune } from './homeContent.js';
import {
  formatDate,
  translateJudgeLabel,
  translateJudgeNote,
  translateProblemStatus,
  zhCN,
} from './locale.js';
import { ProductSubmissionAdapter } from '../services/submission-adapter.js';
import { TeamPage } from '../features/team/TeamPage.js';
import { AssignmentPage } from '../features/assignment/AssignmentPage.js';
import { HomeworkDashboardPage } from '../features/homework-dashboard/HomeworkDashboardPage.js';
import { SubmissionHistoryPage } from '../features/submissions/SubmissionHistoryPage.js';
import { SubmissionDetailPage } from '../features/submissions/SubmissionDetailPage.js';
export { SubmissionDetailPage as SubmissionDetail } from '../features/submissions/SubmissionDetailPage.js';
import { HomeIcon } from '../features/home/HomeIcon.js';
import '../features/home/HomePage.css';
import { ProblemLibraryPage } from '../features/problem-library/ProblemLibraryPage.js';
import { TagSelector } from '../components/TagSelector.js';
import {
  DiscussionEditor,
  DiscussionHome,
  DiscussionPostPage,
} from '../features/discussion/DiscussionExperience.js';
import {
  DiscussionFeedItem,
  DiscussionFeedSkeleton,
} from '../features/discussion/DiscussionContent.js';

type Route = {
  name:
    | 'home'
    | 'discussion'
    | 'discussion-post'
    | 'discussion-new'
    | 'discussion-edit'
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
    | 'not-found'
    | 'teams'
    | 'team-new'
    | 'team-detail'
    | 'team-assignments'
    | 'team-assignment-new';
  id?: string;
};
function route(path = window.location.pathname): Route {
  if (path === '/') return { name: 'home' };
  if (path === '/discussion' || path === '/discussion/')
    return { name: 'discussion' };
  if (path === '/discussion/new') return { name: 'discussion-new' };
  if (path.startsWith('/discussion/') && path.endsWith('/edit'))
    return {
      name: 'discussion-edit',
      id: decodeURIComponent(path.slice(12, -5)),
    };
  if (path.startsWith('/discussion/'))
    return { name: 'discussion-post', id: decodeURIComponent(path.slice(12)) };
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
  if (path === '/teams' || path === '/teams/') return { name: 'teams' };
  if (path === '/teams/new') return { name: 'team-new' };
  if (path.startsWith('/teams/')) {
    const parts = path.split('/').filter(Boolean);
    const slug = decodeURIComponent(parts[1] ?? '');
    if (parts[2] === 'assignments' && parts[3] === 'new')
      return { name: 'team-assignment-new', id: slug };
    if (parts[2] === 'assignments')
      return { name: 'team-assignments', id: slug };
    return { name: 'team-detail', id: slug };
  }
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
  onClick,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <a
      href={to}
      className={className}
      aria-label={ariaLabel}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
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
    discussion: '博客',
    'discussion-post': '文章详情',
    'discussion-new': '写文章',
    'discussion-edit': '编辑文章',
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
    'judge-nodes': 'Judge 节点管理',
    'judge-node-detail': current.id ?? '节点详情',
    forbidden: '无权访问',
    error: '页面加载失败',
    'not-found': '页面不存在',
    teams: '团队',
    'team-new': '创建团队',
    'team-detail': current.id ?? '团队详情',
    'team-assignments': '团队作业',
    'team-assignment-new': '创建作业',
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
          {index > 0 && <span aria-hidden="true">›</span>}
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
          第 {evaluation.evaluationGeneration} 代评测 · 第{' '}
          {evaluation.attemptGeneration} 次尝试
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
  const [discussionAnnouncements, setDiscussionAnnouncements] = useState<
    DiscussionPost[]
  >([]);
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
    void api
      .discussionPosts('limit=3&type=ANNOUNCEMENT')
      .then((result) =>
        setDiscussionAnnouncements(
          Array.isArray(result?.items) ? result.items : [],
        ),
      )
      .catch(() => setDiscussionAnnouncements([]));
  }, [api]);
  const dailyProblem = chooseDailyProblem(recentProblems ?? []) as Problem;
  const recommendedProblems = (recentProblems ?? []).slice(0, 4);
  const contestGroups: Array<[string, BackendContest[]]> = contestSummary
    ? [
        ['进行中', contestSummary.running],
        ['即将开始', contestSummary.upcoming],
        ['最近结束', contestSummary.recentEnded],
      ]
    : [];
  return (
    <HomeReference
      announcements={discussionAnnouncements}
      contests={contestSummary}
      dailyProblem={dailyProblem}
      recommendedProblems={recommendedProblems}
      unavailable={error || contestError}
      signedIn={Boolean(user)}
      fortune={fortune}
      fortuneVisible={fortuneVisible}
      onRevealFortune={() => setFortuneVisible(true)}
    />
  );
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
              {discussionAnnouncements.map((item) => (
                <li key={item.id}>
                  <span className="announcement-meta">
                    公告 · {formatDate(item.publishedAt ?? item.createdAt)}
                  </span>
                  <strong>
                    <Link to={`/discussion/${item.publicId}`}>
                      {item.title}
                    </Link>
                  </strong>
                  {item.summary && <p>{item.summary}</p>}
                </li>
              ))}
              {!discussionAnnouncements.length && (
                <li className="announcement-empty">暂无公告</li>
              )}
            </ul>
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
function HomeReference({
  announcements,
  contests,
  dailyProblem,
  recommendedProblems,
  unavailable,
  signedIn,
  fortune,
  fortuneVisible,
  onRevealFortune,
}: {
  announcements: DiscussionPost[];
  contests:
    | {
        running: BackendContest[];
        upcoming: BackendContest[];
        recentEnded: BackendContest[];
      }
    | undefined;
  dailyProblem: Problem | null;
  recommendedProblems: Problem[];
  unavailable: boolean;
  signedIn: boolean;
  fortune: ReturnType<typeof getDailyFortune>;
  fortuneVisible: boolean;
  onRevealFortune: () => void;
}) {
  const now = new Date();
  const leadingDays =
    (new Date(now.getFullYear(), now.getMonth(), 1).getDay() + 6) % 7;
  const days = Array.from(
    { length: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() },
    (_, index) => index + 1,
  );
  const nearbyContests = contests
    ? [...contests.running, ...contests.upcoming].slice(0, 4)
    : [];
  return (
    <section className="home-reference">
      <section className="home-reference-hero">
        <div className="home-reference-hero-inner">
          <p>用代码探索更大的世界</p>
          <h1>
            在算法的世界里
            <br />
            遇见更好的自己
          </h1>
          <div className="home-reference-hero-copy">
            <span />
            从这里出发、刷题、比赛、交流、成长
            <br />
            与一群热爱算法的人，走向更远的未来。
          </div>
          <div className="home-reference-actions">
            <Link to="/problems" className="home-reference-primary">
              开始刷题 →
            </Link>
            <Link to="/problems" className="home-reference-secondary">
              浏览题库
            </Link>
          </div>
        </div>
        <span className="home-reference-slogan" aria-hidden="true">
          代码如山
          <br />
          行则将至
        </span>
      </section>
      <section className="home-reference-grid">
        <div className="home-reference-left">
          <section className="reference-card reference-announcements">
            <div className="reference-card-title">
              <h2>
                <HomeIcon name="announcement" /> 公告
              </h2>
              <Link to="/discussion">更多 →</Link>
            </div>
            <ul>
              {announcements.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <span>公告</span>
                  <Link to={`/discussion/${item.publicId}`}>{item.title}</Link>
                  <time>
                    {formatDate(item.publishedAt ?? item.createdAt, false)}
                  </time>
                </li>
              ))}
              {!announcements.length && (
                <li className="reference-empty">暂无公告</li>
              )}
            </ul>
          </section>
          <section className="reference-card reference-contests">
            <div className="reference-card-title">
              <h2 aria-label="比赛与排名">
                <HomeIcon name="trophy" /> 近期比赛
              </h2>
              <Link to="/contests">更多 →</Link>
            </div>
            <div className="reference-contest-list">
              {nearbyContests.map((contest) => (
                <Link key={contest.id} to={`/contests/${contest.id}`}>
                  <time>{formatDate(contest.startsAt, false)}</time>
                  <strong>{contest.title}</strong>
                  <small>
                    {contest.lifecycle === 'RUNNING' ? '进行中' : '即将开始'}
                  </small>
                </Link>
              ))}
              {!nearbyContests.length && (
                <p>
                  {unavailable
                    ? '比赛摘要暂时不可用，请稍后重试。当前不展示虚构赛程或名次。'
                    : '正在加载真实比赛摘要…'}
                </p>
              )}
            </div>
          </section>
        </div>
        <div className="home-reference-center">
          <section className="reference-card reference-daily">
            <div className="reference-card-title">
              <h2>
                <HomeIcon name="calendar" /> 每日一题
              </h2>
              <Link to="/problems">往期题目 →</Link>
            </div>
            {dailyProblem ? (
              <div className="reference-daily-body">
                <div>
                  <h3>{dailyProblem.title}</h3>
                  <small>
                    #
                    {dailyProblem.publicId ??
                      dailyProblem.slug ??
                      dailyProblem.id}
                  </small>
                </div>
                <div className="reference-tags">
                  {dailyProblem.difficulty && (
                    <span>{dailyProblem.difficulty}</span>
                  )}
                  {dailyProblem.tags?.slice(0, 2).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <p>从一道题开始，保持对算法的好奇与热爱。</p>
                <div className="reference-daily-meta">
                  <span>◉ 进入练习页查看题目详情</span>
                  <Link
                    to={`/problems/${dailyProblem.slug || dailyProblem.id}`}
                  >
                    开始练习 →
                  </Link>
                </div>
              </div>
            ) : (
              <p className="reference-empty">
                {unavailable ? '题库数据暂不可用。' : '正在加载每日练习题目…'}
              </p>
            )}
          </section>
          <section className="reference-card reference-recommendations">
            <div className="reference-card-title">
              <h2>
                <HomeIcon name="recommendations" /> 推荐题单
              </h2>
              <Link to="/problems">更多 →</Link>
            </div>
            <div className="reference-recommendation-grid">
              {recommendedProblems.map((problem, index) => (
                <Link
                  key={problem.id}
                  to={`/problems/${problem.slug || problem.id}`}
                  className={`recommendation-card recommendation-${index}`}
                >
                  <strong>{problem.title}</strong>
                  <small>
                    {problem.difficulty ?? '练习题'}
                    {problem.tags?.[0] ? ` · ${problem.tags[0]}` : ''}
                  </small>
                  <span>推荐练习 {['▮▮', '◆', '♧', '▣'][index]}</span>
                </Link>
              ))}
              {!recommendedProblems.length && (
                <p className="reference-empty">暂无可推荐练习题目。</p>
              )}
            </div>
          </section>
          <section className="reference-card reference-calendar">
            <div className="reference-card-title">
              <h2>
                <HomeIcon name="calendar" /> 学习日历
              </h2>
              <div>
                <button type="button" aria-label="上个月">
                  ‹
                </button>
                <b>
                  {now.getFullYear()} 年 {now.getMonth() + 1} 月
                </b>
                <button type="button" aria-label="下个月">
                  ›
                </button>
                <Link to="/profile">更多 →</Link>
              </div>
            </div>
            <div className="reference-calendar-body">
              <div className="reference-calendar-grid">
                <span>日</span>
                <span>一</span>
                <span>二</span>
                <span>三</span>
                <span>四</span>
                <span>五</span>
                <span>六</span>
                {Array.from({ length: leadingDays }).map((_, index) => (
                  <i key={`blank-${index}`} />
                ))}
                {days.map((day) => (
                  <span
                    key={day}
                    className={day === now.getDate() ? 'today' : ''}
                  >
                    {day}
                  </span>
                ))}
              </div>
              <div className="reference-streak">
                <span>🔥</span>
                <small>连续打卡</small>
                <strong>{signedIn ? '— 天' : '登录后查看'}</strong>
                <p>
                  “坚持下去，
                  <br />
                  你会遇见更好的自己。”
                </p>
              </div>
            </div>
          </section>
        </div>
        <aside className="home-reference-right">
          <section className="reference-card reference-progress">
            <div className="reference-card-title">
              <h2>
                <HomeIcon name="chart" /> 学习进度
              </h2>
              <Link to="/profile">详情 →</Link>
            </div>
            <div className="reference-progress-body">
              <div className="reference-progress-ring">
                <b>—</b>
              </div>
              <dl>
                <div>
                  <dt>已通过题目</dt>
                  <dd>—</dd>
                </div>
                <div>
                  <dt>继续加油，成为更强的自己！</dt>
                  <dd />
                </div>
              </dl>
            </div>
          </section>
          <section className="reference-card reference-homework">
            <div className="reference-card-title">
              <h2>
                <HomeIcon name="clipboard" /> 我的作业
              </h2>
              <Link to="/homework">全部 →</Link>
            </div>
            <p>
              作业功能正在接入。当前不会显示虚构的作业、截止时间或完成进度。
            </p>
          </section>
          <section className="reference-card reference-wrong">
            <div className="reference-card-title">
              <h2>
                <HomeIcon name="close" /> 错题集
              </h2>
              <Link to="/wrong-book">查看 →</Link>
            </div>
            <div>
              <strong>—</strong>
              <span>道错题</span>
              <div className="reference-bars">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
          </section>
          <section className="reference-fortune">
            <div>
              <HomeIcon name="star" />
              <small>好运相伴</small>
            </div>
            <h2>今日运势</h2>
            {fortuneVisible ? (
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
            ) : (
              <button type="button" onClick={onRevealFortune}>
                获取今日运势
              </button>
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
  tagIds: number[];
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
  background: '',
  statement: '',
  inputDescription: '',
  outputDescription: '',
  constraints: '',
  notes: '',
  tagIds: [],
  examples: [{ input: '', output: '', note: '' }],
  timeLimitMs: 1000,
  memoryLimitBytes: 256 * 1024 * 1024,
  testdataVersion: null,
  visibility: 'private' as const,
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
          tagIds: p.tagDetails?.map((tag) => tag.id) ?? [],
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
        background: form.background,
        statement: form.statement,
        inputDescription: form.inputDescription,
        outputDescription: form.outputDescription,
        examples: form.examples,
        constraints: form.constraints,
        notes: form.notes,
        tagIds: form.tagIds,
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
      setMessage(
        id && form.status === 'published'
          ? '题目已保存并更新正式版本。'
          : '草稿已保存。',
      );
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
    <section className="editor authoring-workspace">
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
        <div className="markdown-fields authoring-markdown-fields">
          {(
            [
              ['background', '背景', 4],
              ['statement', '题面', 6],
              ['inputDescription', '输入说明', 4],
              ['outputDescription', '输出说明', 4],
            ] as const
          ).map(([fieldKey, label, rows]) => (
            <MarkdownFieldSection
              key={fieldKey}
              fieldKey={fieldKey as MarkdownFieldKey}
              label={label}
              value={form[fieldKey]}
              rows={rows}
              disabled={false}
              onChange={(value) => update(fieldKey, value)}
            />
          ))}
        </div>
        <fieldset>
          <legend>样例</legend>
          <div className="authoring-sample-list">
            {form.examples.map((sample, index) => (
              <div className="authoring-sample" key={index}>
                <div className="sample-heading">
                  <strong>样例 {index + 1}</strong>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      update(
                        'examples',
                        form.examples.filter((_, item) => item !== index),
                      )
                    }
                    disabled={form.examples.length === 1}
                  >
                    删除
                  </button>
                </div>
                <div className="form-grid">
                  <label>
                    样例输入
                    <textarea
                      value={sample.input}
                      onChange={(e) =>
                        update(
                          'examples',
                          form.examples.map((item, current) =>
                            current === index
                              ? { ...item, input: e.target.value }
                              : item,
                          ),
                        )
                      }
                      rows={3}
                    />
                  </label>
                  <label>
                    样例输出
                    <textarea
                      value={sample.output}
                      onChange={(e) =>
                        update(
                          'examples',
                          form.examples.map((item, current) =>
                            current === index
                              ? { ...item, output: e.target.value }
                              : item,
                          ),
                        )
                      }
                      rows={3}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              update('examples', [
                ...form.examples,
                { input: '', output: '', note: '' },
              ])
            }
          >
            添加样例
          </button>
        </fieldset>
        <div className="markdown-fields authoring-markdown-fields authoring-tail-fields">
          <MarkdownFieldSection
            fieldKey="constraints"
            label="数据范围"
            value={form.constraints}
            rows={4}
            disabled={false}
            onChange={(value) => update('constraints', value)}
          />
          <MarkdownFieldSection
            fieldKey="notes"
            label="说明与提示"
            value={form.notes}
            rows={3}
            disabled={false}
            onChange={(value) => update('notes', value)}
          />
        </div>
        <TagSelector
          api={api}
          value={form.tagIds}
          onChange={(ids) => update('tagIds', ids)}
        />
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
          <button disabled={saving}>
            {saving
              ? '保存中…'
              : id && form.status === 'published'
                ? '保存并更新题目'
                : '保存草稿'}
          </button>
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
type ProblemDetailIconName =
  | 'arrow-right'
  | 'check'
  | 'clock'
  | 'code'
  | 'file'
  | 'info'
  | 'message'
  | 'percent'
  | 'send'
  | 'sparkles'
  | 'star'
  | 'tag';

function ProblemDetailIcon({ name }: { name: ProblemDetailIconName }) {
  const paths: Record<ProblemDetailIconName, ReactNode> = {
    'arrow-right': <path d="m9 18 6-6-6-6M3 12h12" />,
    check: <path d="M20 6 9 17l-5-5" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    code: <path d="m8 9-3 3 3 3m8-6 3 3-3 3m-2-9-4 12" />,
    file: (
      <>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M14 3v4h4M9 12h6M9 16h6" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5m0-8h.01" />
      </>
    ),
    message: (
      <>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
    percent: (
      <>
        <path d="m19 5-14 14" />
        <circle cx="7" cy="7" r="2" />
        <circle cx="17" cy="17" r="2" />
      </>
    ),
    send: <path d="m22 2-7 20-4-9-9-4zM22 2 11 13" />,
    sparkles: (
      <>
        <path d="m12 3 1.2 3.1L16 7.5l-2.8 1.4L12 12l-1.2-3.1L8 7.5l2.8-1.4z" />
        <path d="m18.5 13 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM5 14l.7 1.8 1.8.7-1.8.7L5 19l-.7-1.8-1.8-.7 1.8-.7z" />
      </>
    ),
    star: (
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" />
    ),
    tag: (
      <>
        <path d="M20 13 13 20 4 11V4h7z" />
        <circle cx="8.5" cy="8.5" r="1" />
      </>
    ),
  };
  return (
    <svg
      className="problem-ui-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function ProblemDetailBreadcrumb({
  id,
  problem,
}: {
  id: string;
  problem: Problem | null;
}) {
  const label = problem
    ? `${problem.publicId ?? id} ${problem.title}`
    : id || '题目';
  return (
    <nav className="breadcrumbs problem-local-breadcrumbs" aria-label="面包屑">
      <span>
        <Link to="/problems">题库</Link>
      </span>
      <span>
        <span aria-hidden="true">›</span>
        <span aria-current="page" title={label}>
          {label}
        </span>
      </span>
    </nav>
  );
}

function ProblemDetail({
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
  const [activeTab, setActiveTab] = useState<'statement' | 'discussion'>(
    'statement',
  );
  const [discussionPosts, setDiscussionPosts] = useState<DiscussionPost[]>([]);
  const [discussionState, setDiscussionState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const discussionRequestKey = useRef('');
  const [discussionReload, setDiscussionReload] = useState(0);
  const [relatedProblems, setRelatedProblems] = useState<Problem[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(true);
  const [checker, setChecker] = useState<'EXACT_BYTES' | 'TOKEN_WHITESPACE'>(
    'EXACT_BYTES',
  );
  const codeRunAdapter = useMemo(() => new HttpCodeRunAdapter(), []);
  const submissionAdapter = useMemo(
    () => new ProductSubmissionAdapter(api),
    [api],
  );
  useEffect(() => {
    let active = true;
    setProblem(null);
    setError(null);
    setActiveTab('statement');
    setDiscussionPosts([]);
    setDiscussionState('idle');
    discussionRequestKey.current = '';
    void api
      .problem(id)
      .then((value) => {
        if (active) setProblem(value);
      })
      .catch((e) => {
        if (!active) return;
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
        );
      });
    return () => {
      active = false;
    };
  }, [api, id]);
  useEffect(() => {
    void api
      .judgeData(id)
      .then((data) => setChecker(data.defaults.checker))
      .catch((e) =>
        console.error('[ProblemDetail] judge checker unavailable', e),
      );
  }, [api, id]);
  useEffect(() => {
    if (!problem) return;
    let active = true;
    const firstTagId = problem.tagDetails?.[0]?.id;
    const options = firstTagId
      ? { tagId: firstTagId }
      : problem.difficulty
        ? { difficulty: problem.difficulty }
        : undefined;
    if (!options) {
      setRelatedProblems([]);
      setRelatedLoading(false);
      return;
    }
    setRelatedLoading(true);
    void api
      .problems(0, 6, options)
      .then((result) => {
        if (active)
          setRelatedProblems(
            result.items.filter((item) => item.id !== problem.id).slice(0, 4),
          );
      })
      .catch(() => {
        if (active) setRelatedProblems([]);
      })
      .finally(() => {
        if (active) setRelatedLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, problem]);
  useEffect(() => {
    if (!problem || activeTab !== 'discussion') return;
    const requestKey = `${problem.id}:${problem.updatedAt}`;
    if (discussionRequestKey.current === requestKey) return;
    discussionRequestKey.current = requestKey;
    let active = true;
    const terms = [problem.publicId, problem.title].filter(
      (value, index, values): value is string =>
        Boolean(value) && values.indexOf(value) === index,
    );
    setDiscussionState('loading');
    void Promise.all(
      terms.map((term) =>
        api.discussionPosts(
          new URLSearchParams({ limit: '8', q: term }).toString(),
        ),
      ),
    )
      .then((results) => {
        if (!active) return;
        const unique = new Map<string, DiscussionPost>();
        results.forEach((result) =>
          result.items.forEach((post) => unique.set(post.id, post)),
        );
        setDiscussionPosts([...unique.values()].slice(0, 8));
        setDiscussionState('ready');
      })
      .catch(() => {
        if (active) {
          discussionRequestKey.current = '';
          setDiscussionState('error');
        }
      });
    return () => {
      active = false;
    };
  }, [activeTab, api, discussionReload, problem]);
  const breadcrumb = <ProblemDetailBreadcrumb id={id} problem={problem} />;
  if (error)
    return (
      <>
        {breadcrumb}
        {error.code === 'NOT_FOUND' ? (
          <State title="题目不存在" text="该题目不存在或当前不可用。" />
        ) : (
          <State title="题目暂不可用" text={error.message} />
        )}
      </>
    );
  if (!problem)
    return (
      <>
        {breadcrumb}
        <State title="正在加载题目" text="正在获取题面详情…" />
      </>
    );
  const canEdit = problem.capabilities?.canEdit === true;
  const submissionCount = problem.statistics?.submissionCount;
  const acceptedCount = problem.statistics?.acceptedCount;
  const acceptanceRate =
    submissionCount && acceptedCount !== undefined
      ? `${((acceptedCount / submissionCount) * 100).toFixed(1)}%`
      : '—';
  const tags = problem.tagDetails?.map((tag) => tag.name) ?? problem.tags ?? [];
  return (
    <>
      {breadcrumb}
      <article className="problem-detail-v4">
        <div className="problem-main">
          <header className="problem-heading">
            <span className="problem-id">
              {problem.publicId ?? '编号不可用'}
            </span>
            <h1>{problem.title}</h1>
            <div className="problem-heading-tags" aria-label="题目分类">
              {problem.difficulty && (
                <span className="problem-difficulty-badge">
                  {problem.difficulty}
                </span>
              )}
              {tags.slice(0, 3).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <dl className="problem-heading-stats" aria-label="题目统计">
              <div>
                <dt>
                  <ProblemDetailIcon name="send" />
                  提交
                </dt>
                <dd>{submissionCount?.toLocaleString('zh-CN') ?? '—'}</dd>
              </div>
              <div>
                <dt>
                  <ProblemDetailIcon name="check" />
                  通过
                </dt>
                <dd>{acceptedCount?.toLocaleString('zh-CN') ?? '—'}</dd>
              </div>
              <div>
                <dt>
                  <ProblemDetailIcon name="percent" />
                  通过率
                </dt>
                <dd>{acceptanceRate}</dd>
              </div>
              <div>
                <dt>
                  <ProblemDetailIcon name="sparkles" />
                  难度
                </dt>
                <dd>{problem.difficulty ?? '—'}</dd>
              </div>
            </dl>
          </header>
          <nav className="problem-detail-tabs" aria-label="题目内容">
            <button
              type="button"
              className={activeTab === 'statement' ? 'active' : ''}
              aria-current={activeTab === 'statement' ? 'page' : undefined}
              onClick={() => setActiveTab('statement')}
            >
              <ProblemDetailIcon name="file" />
              题面
            </button>
            <button
              type="button"
              className={activeTab === 'discussion' ? 'active' : ''}
              aria-current={activeTab === 'discussion' ? 'page' : undefined}
              onClick={() => setActiveTab('discussion')}
            >
              <ProblemDetailIcon name="message" />
              讨论
              {discussionState === 'ready' && (
                <span>({discussionPosts.length})</span>
              )}
            </button>
            <Link to="/submissions">
              <ProblemDetailIcon name="clock" />
              提交记录
            </Link>
          </nav>
          {activeTab === 'statement' ? (
            <section className="problem-content-surface">
              <ProblemStatementRenderer
                content={problem}
                showTitle={false}
                onCopySample={(input) => {
                  if (!navigator.clipboard) {
                    setCopyMessage('当前浏览器不支持复制样例。');
                    return;
                  }
                  void navigator.clipboard.writeText(input).then(
                    () => setCopyMessage('样例输入已复制。'),
                    () => setCopyMessage('复制失败，请手动选择样例输入。'),
                  );
                }}
              />
              {copyMessage && (
                <p className="sample-copy-status" role="status">
                  {copyMessage}
                </p>
              )}
            </section>
          ) : (
            <section className="problem-discussion-panel">
              <header>
                <div>
                  <span className="problem-section-icon">
                    <ProblemDetailIcon name="message" />
                  </span>
                  <div>
                    <h2>讨论区</h2>
                    <p>交流解题思路，分享经验，一起进步。</p>
                  </div>
                </div>
                {user && (
                  <Link
                    className="problem-discussion-create"
                    to="/discussion/new"
                  >
                    <ProblemDetailIcon name="code" />
                    发起讨论
                  </Link>
                )}
              </header>
              {discussionState === 'loading' ? (
                <DiscussionFeedSkeleton />
              ) : discussionState === 'error' ? (
                <div className="problem-inline-state" role="alert">
                  <strong>讨论暂时无法加载</strong>
                  <span>请稍后重试，题面内容不受影响。</span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setDiscussionState('idle');
                      setDiscussionReload((value) => value + 1);
                    }}
                  >
                    重试
                  </button>
                </div>
              ) : discussionPosts.length ? (
                <div
                  className="discussion-feed"
                  role="feed"
                  aria-label="题目讨论"
                >
                  {discussionPosts.map((post) => (
                    <DiscussionFeedItem
                      key={post.id}
                      post={post}
                      navigate={navigate}
                    />
                  ))}
                </div>
              ) : (
                <div className="problem-inline-state">
                  <strong>还没有匹配到这道题的讨论</strong>
                  <span>讨论内容按题号和题目名称从真实社区内容中检索。</span>
                </div>
              )}
            </section>
          )}
        </div>
        <aside className="problem-aside" aria-label="题目信息">
          <section className="problem-action-card" aria-label="题目操作">
            <Link
              className="problem-primary-action"
              to={`/problems/${encodeURIComponent(id)}/submit`}
            >
              <ProblemDetailIcon name="code" />
              提交代码
              <ProblemDetailIcon name="arrow-right" />
            </Link>
            <div>
              {canEdit && (
                <Link
                  to={`/author/problems/${encodeURIComponent(problem.id)}/edit`}
                >
                  <button type="button" className="secondary">
                    <ProblemDetailIcon name="file" />
                    编辑题目
                  </button>
                </Link>
              )}
              <button type="button" className="secondary" disabled>
                <ProblemDetailIcon name="star" />
                收藏
              </button>
            </div>
          </section>
          <section className="problem-aside-card">
            <h2>
              <ProblemDetailIcon name="info" />
              题目信息
            </h2>
            <dl className="problem-facts">
              <div>
                <dt>难度等级</dt>
                <dd>{problem.difficulty ?? '—'}</dd>
              </div>
              <div>
                <dt>题目来源</dt>
                <dd>{problem.source ?? '—'}</dd>
              </div>
              <div>
                <dt>题目编号</dt>
                <dd>{problem.publicId ?? '—'}</dd>
              </div>
              <div>
                <dt>提交次数</dt>
                <dd>{submissionCount?.toLocaleString('zh-CN') ?? '—'}</dd>
              </div>
              <div>
                <dt>通过次数</dt>
                <dd>{acceptedCount?.toLocaleString('zh-CN') ?? '—'}</dd>
              </div>
              <div>
                <dt>通过率</dt>
                <dd>{acceptanceRate}</dd>
              </div>
              <div>
                <dt>评测时限</dt>
                <dd>{problem.timeLimitMs} ms</dd>
              </div>
              <div>
                <dt>内存限制</dt>
                <dd>{formatMemoryLimit(problem.memoryLimitBytes)}</dd>
              </div>
            </dl>
          </section>
          <section className="problem-aside-card">
            <h2>
              <ProblemDetailIcon name="tag" />
              所属分类
            </h2>
            <div className="problem-aside-tags">
              {tags.length ? (
                tags.map((tag) => <span key={tag}>{tag}</span>)
              ) : (
                <span>暂无标签</span>
              )}
            </div>
          </section>
          <section className="problem-aside-card problem-related-card">
            <h2>
              <ProblemDetailIcon name="sparkles" />
              相关题目
            </h2>
            {relatedLoading ? (
              <p className="muted">正在获取相关题目…</p>
            ) : relatedProblems.length ? (
              <ul>
                {relatedProblems.map((item) => (
                  <li key={item.id}>
                    <Link to={`/problems/${encodeURIComponent(item.slug)}`}>
                      <span>
                        {item.publicId ?? `#${item.publicNumber ?? ''}`}
                      </span>
                      <strong>{item.title}</strong>
                    </Link>
                    <small>{item.difficulty ?? '难度未标注'}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">暂无可展示的相关题目。</p>
            )}
          </section>
        </aside>
      </article>
      {activeTab === 'statement' && (
        <section
          id="solve"
          className="problem-editor-slot"
          aria-label="OnlineCodeEditor"
        >
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
                problemRevisionId: problem.currentRevisionId ?? problem.id,
                checker,
                codeRunAdapter,
                ...(user ? { submissionAdapter } : {}),
                onViewSubmission: (submissionId: string) =>
                  navigate(`/submissions/${encodeURIComponent(submissionId)}`),
              } as ProblemSolveEditorContext
            }
          />
        </section>
      )}
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
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'error'>(
    'loading',
  );
  const [error, setError] = useState('');
  const submittingRef = useRef(false);
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
    if (state === 'saving' || submittingRef.current) return;
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
    submittingRef.current = true;
    try {
      const result = await api.createSubmission({
        problemId: problem?.id ?? problemId,
        problemRevisionId: problem?.currentRevisionId ?? problemId,
        languageId: effectiveLanguageId,
        source,
      });
      // Submission detail is the formal loading destination while evaluation
      // projection completes asynchronously when needed.
      navigate(`/submissions/${encodeURIComponent(result.id)}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '无法提交源代码。');
      setState('ready');
      submittingRef.current = false;
    }
  };
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
    <ProfilePage
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
    ) : current.name === 'discussion' ? (
      <DiscussionHome api={api} navigate={navigate} user={user} />
    ) : current.name === 'discussion-post' ? (
      <DiscussionPostPage
        api={api}
        navigate={navigate}
        id={current.id ?? ''}
        user={user}
      />
    ) : current.name === 'discussion-new' ? (
      <DiscussionEditor api={api} navigate={navigate} user={user} />
    ) : current.name === 'discussion-edit' ? (
      <DiscussionEditor
        api={api}
        navigate={navigate}
        {...(current.id ? { id: current.id } : {})}
        user={user}
      />
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
      <ProblemLibraryPage api={api} user={user} navigate={navigate} />
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
    ) : current.name === 'homework' ? (
      <HomeworkDashboardPage navigate={navigate} />
    ) : current.name === 'homework-detail' ? (
      <AssignmentPage
        api={api}
        navigate={navigate}
        user={user}
        {...(current.id ? { detailId: current.id } : {})}
      />
    ) : current.name === 'wrong-book' ? (
      <WrongBookPage navigate={navigate} />
    ) : current.name === 'notifications' ? (
      <NotificationsRoute api={api} />
    ) : current.name === 'messages' ? (
      <MessagesRoute api={api} />
    ) : current.name === 'teams' ? (
      <TeamPage api={api} user={user} navigate={navigate} />
    ) : current.name === 'team-new' ? (
      <TeamPage api={api} user={user} navigate={navigate} create />
    ) : current.name === 'team-detail' ? (
      <TeamPage
        api={api}
        {...(current.id ? { slug: current.id } : {})}
        user={user}
        navigate={navigate}
      />
    ) : current.name === 'team-assignments' ||
      current.name === 'team-assignment-new' ? (
      <AssignmentPage
        api={api}
        navigate={navigate}
        user={user}
        {...(current.id ? { teamSlug: current.id } : {})}
        create={current.name === 'team-assignment-new'}
      />
    ) : current.name === 'submit' ? (
      <SubmissionForm api={api} problemId={current.id ?? ''} user={user} />
    ) : current.name === 'submissions' ? (
      <SubmissionHistoryPage api={api} user={user} navigate={navigate} />
    ) : current.name === 'submission' ? (
      user && current.id ? (
        <SubmissionDetailPage
          api={api}
          id={current.id}
          user={user}
          navigate={navigate}
        />
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
    <AppLayout
      className={`${current.name === 'submissions' ? 'submissions-view' : ''}${current.name === 'submission' ? ' submission-detail-view' : ''}${current.name === 'homework' ? ' homework-dashboard-view' : ''}`.trim()}
      navbar={
        <AppNavbar
          Link={Link}
          api={api}
          current={current}
          user={user}
          canViewJudgeAdmin={canViewJudgeAdmin}
          navigate={navigate}
          onLogoutComplete={() => {
            setUser(null);
            setAuthState('unauthenticated');
            navigate('/');
          }}
        />
      }
      breadcrumbs={
        current.name !== 'home' &&
        current.name !== 'problems' &&
        current.name !== 'problem' &&
        current.name !== 'discussion' &&
        current.name !== 'discussion-post' &&
        current.name !== 'teams' &&
        current.name !== 'submissions' &&
        current.name !== 'submission' &&
        current.name !== 'homework' ? (
          <Breadcrumbs current={current} />
        ) : undefined
      }
      mainClassName={
        current.name === 'author-new' || current.name === 'author-edit'
          ? 'shell shell-authoring'
          : current.name === 'problems'
            ? 'shell shell-problem-library'
            : current.name === 'problem'
              ? 'shell shell-problem-detail'
              : current.name === 'discussion'
                ? 'shell shell-blog'
                : current.name === 'discussion-post'
                  ? 'shell shell-blog-detail'
                  : current.name === 'teams'
                    ? 'shell shell-team-portal'
                    : current.name === 'submissions'
                      ? 'shell shell-submissions'
                      : current.name === 'submission'
                        ? 'shell shell-submission-detail'
                        : current.name === 'homework'
                          ? 'shell shell-homework-dashboard'
                          : 'shell'
      }
    >
      {page}
    </AppLayout>
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
