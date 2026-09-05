import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useEffect,
} from 'react';
import { ApiError } from '../services/api.js';
import type {
  ApiClient,
  AuthenticatedUser,
  FavoriteProblem,
  ProfileCapabilities,
  ProfileOverview,
  ProfileProblem,
  PublicProfile,
  SolvedProblem,
} from '../services/api.js';
import type {
  ContestDetail,
  ContestListItem,
  ContestProblem,
  ContestStanding,
  ConversationSummary,
  FriendRequest,
  FriendSummary,
  Message,
  NotificationSummary,
  UserActivityDay,
} from '../services/portal-contracts.js';
import './portal.css';

type Navigate = (path: string) => void;

function PortalLink({
  to,
  navigate,
  children,
  className,
}: {
  to: string;
  navigate: Navigate;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function CapabilityNotice({
  title,
  text,
  request,
}: {
  title: string;
  text: string;
  request: string;
}) {
  return (
    <div className="capability-notice" role="status">
      <strong>{title}</strong>
      <p>{text}</p>
      <code>{request}</code>
    </div>
  );
}

export function HomeworkPage({ navigate }: { navigate: Navigate }) {
  return (
    <section className="portal-page">
      <div className="portal-heading">
        <div>
          <p className="eyebrow">学习任务</p>
          <h1>我的作业</h1>
        </div>
      </div>
      <div className="compact-table" aria-label="作业列表">
        <div className="compact-table-head">
          <span>作业</span>
          <span>来源</span>
          <span>截止时间</span>
          <span>进度</span>
        </div>
        <CapabilityNotice
          title="作业功能正在接入"
          text="后端尚未提供作业、题目集合和完成进度数据。"
          request="HOMEWORK-BACKEND-INTEGRATION-REQUEST"
        />
      </div>
      <button className="secondary" type="button" onClick={() => navigate('/')}>
        返回首页
      </button>
    </section>
  );
}

export function WrongBookPage({ navigate }: { navigate: Navigate }) {
  return (
    <section className="portal-page">
      <div className="portal-heading">
        <div>
          <p className="eyebrow">复盘</p>
          <h1>错题集</h1>
        </div>
      </div>
      <div className="compact-table" aria-label="错题列表">
        <div className="compact-table-head">
          <span>题目</span>
          <span>最近尝试</span>
          <span>判题结论</span>
          <span>失败次数</span>
        </div>
        <CapabilityNotice
          title="错题集数据暂不可用"
          text="Verdict Engine 尚未提供 authoritative failed/not-passed 聚合，页面不会从 raw execution state 猜测错题。"
          request="WRONG-BOOK-BACKEND-INTEGRATION-REQUEST"
        />
      </div>
      <button
        className="secondary"
        type="button"
        onClick={() => navigate('/problems')}
      >
        浏览题库
      </button>
    </section>
  );
}

type ContestView =
  | 'list'
  | 'mine'
  | 'detail'
  | 'problems'
  | 'submissions'
  | 'standings'
  | 'settings'
  | 'create';

const contestTabs = [
  ['detail', '比赛首页'],
  ['problems', '题目'],
  ['submissions', '提交'],
  ['standings', '排名'],
] as const;

type ContestParticipant = {
  id: string;
  username?: string;
  displayName?: string;
  registeredAt?: string;
};

type ContestProblemApi = ContestProblem & {
  ordinal?: number;
  pointsConfig?: { score?: number } | null;
};

function contestProblemFromApi(item: ContestProblemApi): ContestProblem {
  return {
    problemId: item.problemId,
    label: item.label ?? item.problemId,
    title: item.title,
    ...(item.pointsConfig?.score === undefined && item.score === undefined
      ? {}
      : { score: item.pointsConfig?.score ?? item.score }),
  };
}

function contestActionError(error: unknown, action: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) return `请先登录后再${action}。`;
    if (error.status === 403) return `当前账号没有权限${action}。`;
    if (error.status === 404) return '比赛或相关资源不存在。';
    if (error.status === 409) return '比赛状态已发生变化，请刷新后重试。';
    if (error.status === 429) return '操作过于频繁，请稍后重试。';
    if (error.status >= 500) return '服务暂时不可用，请稍后重试。';
  }
  return `${action}失败，请检查网络后重试。`;
}

function contestDateTimeValue(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function contestDetailFromApi(value: {
  id: string;
  title: string;
  description: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  lifecycle: ContestDetail['lifecycle'];
  format: ContestDetail['format'];
  startsAt: string;
  endsAt: string;
  canManage: boolean;
}): ContestDetail {
  return {
    id: value.id,
    title: value.title,
    description: value.description,
    visibility: value.visibility,
    lifecycle: value.lifecycle,
    format: value.format,
    startsAt: value.startsAt,
    endsAt: value.endsAt,
    registration:
      value.lifecycle === 'UPCOMING'
        ? 'REGISTRATION_OPEN'
        : 'REGISTRATION_CLOSED',
    canRegister: value.lifecycle === 'UPCOMING',
    canManage: value.canManage,
  };
}

export function ContestExperience({
  view,
  contestId,
  navigate,
  contests = [],
  detail,
  problems = [],
  standings = [],
  standingsUnavailableReason,
  api,
  loading = false,
  error,
  onRetry,
}: {
  view: ContestView;
  contestId?: string;
  navigate: Navigate;
  contests?: ContestListItem[];
  detail?: ContestDetail;
  problems?: ContestProblem[];
  standings?: ContestStanding[];
  standingsUnavailableReason?: string;
  api?: ApiClient | undefined;
  loading?: boolean;
  error?: string | undefined;
  onRetry?: (() => void) | undefined;
}) {
  if (view === 'create') return <ContestCreate navigate={navigate} api={api} />;
  if (view === 'list' || view === 'mine') {
    return (
      <section className="portal-page contest-page">
        <div className="contest-nav-bar">
          <nav
            className="filter-tabs contest-internal-nav"
            aria-label="比赛导航"
          >
            <PortalLink
              to="/contests"
              navigate={navigate}
              className={view === 'list' ? 'active' : ''}
            >
              比赛列表
            </PortalLink>
            <PortalLink
              to="/contests/mine"
              navigate={navigate}
              className={view === 'mine' ? 'active' : ''}
            >
              我的比赛
            </PortalLink>
          </nav>
          <PortalLink
            to="/contests/new"
            navigate={navigate}
            className="button-link contest-create-action"
          >
            新建比赛
          </PortalLink>
        </div>
        {loading ? (
          <p className="muted" role="status">
            正在加载{view === 'mine' ? '比赛关系' : '比赛列表'}…
          </p>
        ) : error ? (
          <div className="capability-notice" role="alert">
            <strong>{error}</strong>
            {onRetry && (
              <button type="button" className="secondary" onClick={onRetry}>
                重试
              </button>
            )}
          </div>
        ) : contests.length ? (
          <div className="contest-list" role="list">
            {contests.map((contest) => (
              <PortalLink
                key={contest.id}
                to={`/contests/${contest.id}`}
                navigate={navigate}
              >
                <article role="listitem">
                  <strong>{contest.title}</strong>
                  <span>{contest.lifecycle}</span>
                  {contest.relationship && <span>{contest.relationship}</span>}
                  {contest.format && <span>{contest.format}</span>}
                  <span>{contest.startsAt}</span>
                </article>
              </PortalLink>
            ))}
          </div>
        ) : api ? (
          <p className="muted">
            {view === 'mine' ? '暂无比赛关系记录。' : '暂无可用比赛。'}
          </p>
        ) : (
          <CapabilityNotice
            title="比赛服务正在接入"
            text="当前没有可用的比赛列表、报名或生命周期数据。"
            request="CONTEST-BACKEND-INTEGRATION-REQUEST"
          />
        )}
      </section>
    );
  }

  return (
    <ContestDetailExperience
      view={view}
      navigate={navigate}
      problems={problems}
      standings={standings}
      api={api}
      loading={loading}
      error={error}
      onRetry={onRetry}
      {...(standingsUnavailableReason === undefined
        ? {}
        : { standingsUnavailableReason })}
      {...(contestId === undefined ? {} : { contestId })}
      {...(detail === undefined ? {} : { detail })}
    />
  );
}

function ContestDetailExperience({
  view,
  contestId,
  navigate,
  detail,
  problems,
  standings,
  standingsUnavailableReason,
  api,
  loading,
  error,
  onRetry,
}: {
  view: Exclude<ContestView, 'list' | 'mine' | 'create'>;
  contestId?: string;
  navigate: Navigate;
  detail?: ContestDetail;
  problems: ContestProblem[];
  standings: ContestStanding[];
  standingsUnavailableReason?: string;
  api?: ApiClient | undefined;
  loading: boolean;
  error?: string | undefined;
  onRetry?: (() => void) | undefined;
}) {
  const [currentDetail, setCurrentDetail] = useState(detail);
  const [registration, setRegistration] = useState<string>();
  const [registrationLoading, setRegistrationLoading] = useState(false);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [registrationError, setRegistrationError] = useState('');
  const [registrationMessage, setRegistrationMessage] = useState('');
  const [accessCode, setAccessCode] = useState('');

  useEffect(() => {
    setCurrentDetail(detail);
  }, [detail]);

  useEffect(() => {
    if (!api || !contestId) return;
    let active = true;
    setRegistration(undefined);
    setRegistrationError('');
    setRegistrationLoading(true);
    void api
      .contestRegistration(contestId)
      .then((result) => {
        if (active) setRegistration(result.status);
      })
      .catch((error: unknown) => {
        if (active)
          setRegistrationError(contestActionError(error, '读取报名状态'));
      })
      .finally(() => {
        if (active) setRegistrationLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, contestId]);

  const changeRegistration = () => {
    if (!api || !contestId) return;
    const withdraw = registration === 'REGISTERED';
    const action = withdraw ? '取消报名' : '报名比赛';
    setRegistrationBusy(true);
    setRegistrationError('');
    setRegistrationMessage('');
    const request = withdraw
      ? api.unregisterContest(contestId).then(() => 'NOT_REGISTERED')
      : api
          .registerContest(contestId, accessCode.trim() || undefined)
          .then((result) => result.status);
    void request
      .then((status) => {
        setRegistration(status);
        setRegistrationMessage(withdraw ? '已取消报名。' : '报名成功。');
        setAccessCode('');
      })
      .catch((error: unknown) =>
        setRegistrationError(contestActionError(error, action)),
      )
      .finally(() => setRegistrationBusy(false));
  };

  const base = `/contests/${encodeURIComponent(contestId ?? '')}`;
  const canChangeRegistration =
    registration === 'REGISTERED' || Boolean(currentDetail?.canRegister);
  return (
    <section className="portal-page contest-page">
      {error && (
        <p className="error" role="alert">
          {error}
          {onRetry && (
            <button type="button" className="secondary" onClick={onRetry}>
              重试
            </button>
          )}
        </p>
      )}
      <header className="contest-header">
        <div>
          <p className="eyebrow">比赛详情</p>
          <h1>{currentDetail?.title ?? '比赛数据暂不可用'}</h1>
          <p>
            {currentDetail?.description ?? `比赛标识：${contestId ?? '未知'}`}
          </p>
        </div>
        <div className="contest-state">
          <span>{currentDetail?.lifecycle ?? 'NOT_AVAILABLE'}</span>
          {currentDetail?.visibility === 'PRIVATE' &&
            registration !== 'REGISTERED' && (
              <label>
                <span className="sr-only">比赛访问码</span>
                <input
                  type="password"
                  value={accessCode}
                  onChange={(event) => setAccessCode(event.target.value)}
                  placeholder="比赛访问码"
                />
              </label>
            )}
          <button
            type="button"
            disabled={
              !api ||
              !canChangeRegistration ||
              registrationLoading ||
              registrationBusy
            }
            onClick={changeRegistration}
          >
            {registrationBusy
              ? registration === 'REGISTERED'
                ? '取消中…'
                : '报名中…'
              : registration === 'REGISTERED'
                ? '取消报名'
                : '报名比赛'}
          </button>
          {registrationLoading ? (
            <small role="status">正在读取报名状态…</small>
          ) : registration ? (
            <small>报名状态：{registration}</small>
          ) : null}
          {registrationMessage && (
            <small className="inline-notice" role="status">
              {registrationMessage}
            </small>
          )}
          {registrationError && (
            <small className="error" role="alert">
              {registrationError}
            </small>
          )}
        </div>
      </header>
      <nav className="section-tabs" aria-label="比赛页面">
        {contestTabs.map(([tab, label]) => (
          <PortalLink
            key={tab}
            to={tab === 'detail' ? base : `${base}/${tab}`}
            navigate={navigate}
            className={view === tab ? 'active' : ''}
          >
            {label}
          </PortalLink>
        ))}
        <span aria-disabled="true">公告</span>
        {currentDetail?.canManage && (
          <PortalLink to={`${base}/settings`} navigate={navigate}>
            管理
          </PortalLink>
        )}
      </nav>
      {view === 'standings' ? (
        <Standings
          standings={standings}
          {...(standingsUnavailableReason === undefined
            ? {}
            : { unavailableReason: standingsUnavailableReason })}
        />
      ) : view === 'problems' ? (
        problems.length ? (
          <ol className="contest-problems">
            {problems.map((problem) => (
              <li key={problem.problemId}>
                <span>{problem.label}</span>
                <strong>{problem.title}</strong>
                <span>
                  {problem.score === undefined
                    ? '分值由赛制决定'
                    : `${problem.score} 分`}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <CapabilityNotice
            title="比赛题目暂不可用"
            text="题目集合由比赛后端提供。"
            request="CONTEST-BACKEND-INTEGRATION-REQUEST"
          />
        )
      ) : view === 'submissions' ? (
        <CapabilityNotice
          title="比赛提交暂不可用"
          text="比赛范围内的提交查询尚未接入。"
          request="CONTEST-BACKEND-INTEGRATION-REQUEST"
        />
      ) : view === 'settings' ? (
        <ContestSettings
          api={api}
          problems={problems}
          onUpdated={setCurrentDetail}
          {...(contestId === undefined ? {} : { contestId })}
          {...(currentDetail === undefined ? {} : { detail: currentDetail })}
        />
      ) : loading ? (
        <p className="muted" role="status">
          正在加载比赛数据…
        </p>
      ) : currentDetail ? (
        <div className="social-panel">
          <h2>比赛信息</h2>
          <p>赛制：{currentDetail.format}</p>
          <p>可见性：{currentDetail.visibility}</p>
          <p>开始时间：{currentDetail.startsAt}</p>
          <p>结束时间：{currentDetail.endsAt}</p>
        </div>
      ) : (
        <CapabilityNotice
          title="比赛详情暂不可用"
          text="当前无法读取比赛详情。"
          request="CONTEST-BACKEND-INTEGRATION-REQUEST"
        />
      )}
    </section>
  );
}

function ContestSettings({
  api,
  contestId,
  detail,
  problems,
  onUpdated,
}: {
  api?: ApiClient | undefined;
  contestId?: string;
  detail?: ContestDetail;
  problems: ContestProblem[];
  onUpdated: (detail: ContestDetail) => void;
}) {
  const [membership, setMembership] = useState(problems);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [participants, setParticipants] = useState<ContestParticipant[]>();
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    setMembership(problems);
  }, [problems]);

  useEffect(() => {
    if (!api || !contestId || !detail?.canManage) return;
    let active = true;
    setMembershipLoading(true);
    void api
      .contestProblems(contestId)
      .then((result) => {
        if (active) setMembership(result.items.map(contestProblemFromApi));
      })
      .catch((reason: unknown) => {
        if (active) setError(contestActionError(reason, '读取比赛题目'));
      })
      .finally(() => {
        if (active) setMembershipLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, contestId, detail?.canManage]);

  if (!detail?.canManage)
    return (
      <div className="capability-notice" role="alert">
        <strong>比赛管理不可用</strong>
        <p>当前账号没有这场比赛的管理权限。</p>
      </div>
    );

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!api || !contestId) return;
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') ?? '').trim();
    const startsAt = String(data.get('startsAt') ?? '');
    const endsAt = String(data.get('endsAt') ?? '');
    const problemIds = String(data.get('problems') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const scoreValues = String(data.get('scores') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!title) return setError('请输入比赛名称。');
    if (!startsAt || !endsAt || new Date(startsAt) >= new Date(endsAt))
      return setError('结束时间必须晚于开始时间。');
    if (new Set(problemIds).size !== problemIds.length)
      return setError('题目列表不能包含重复题目。');
    if (
      scoreValues.length &&
      (scoreValues.length !== problemIds.length ||
        scoreValues.some(
          (score) => !Number.isFinite(Number(score)) || Number(score) <= 0,
        ))
    )
      return setError('每题分值必须与题目一一对应且为正数。');
    const input: Record<string, unknown> = {
      title,
      description: String(data.get('description') ?? ''),
      visibility: String(data.get('visibility') ?? detail.visibility),
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
    };
    const registrationOpenAt = String(data.get('registrationOpenAt') ?? '');
    const registrationCloseAt = String(data.get('registrationCloseAt') ?? '');
    const privatePassword = String(data.get('privatePassword') ?? '');
    if (registrationOpenAt)
      input.registrationOpenAt = new Date(registrationOpenAt).toISOString();
    if (registrationCloseAt)
      input.registrationCloseAt = new Date(registrationCloseAt).toISOString();
    if (privatePassword) input.privatePassword = privatePassword;

    setSaving(true);
    setError('');
    setMessage('');
    void (async () => {
      try {
        const updated = await api.updateContest(contestId, input);
        onUpdated(contestDetailFromApi(updated));
        if (problemIds.length) {
          try {
            const result = await api.setContestProblems(
              contestId,
              problemIds.map((problemId, index) => ({
                problemId,
                ...(scoreValues[index]
                  ? { score: Number(scoreValues[index]) }
                  : {}),
              })),
            );
            setMembership(
              result.items.map((item, index) => ({
                problemId: item.problemId,
                label: String.fromCharCode(65 + index),
                title: item.problemId,
                ...(item.score === undefined ? {} : { score: item.score }),
              })),
            );
          } catch (reason) {
            setError(
              `比赛资料已保存，但${contestActionError(reason, '更新题目列表')}`,
            );
            return;
          }
        }
        setMessage('比赛设置已保存。');
      } catch (reason) {
        setError(contestActionError(reason, '保存比赛设置'));
      } finally {
        setSaving(false);
      }
    })();
  };

  const publish = () => {
    if (!api || !contestId) return;
    setPublishing(true);
    setError('');
    setMessage('');
    void api
      .publishContest(contestId)
      .then((updated) => {
        onUpdated(contestDetailFromApi(updated));
        setMessage('比赛已发布。');
      })
      .catch((reason: unknown) =>
        setError(contestActionError(reason, '发布比赛')),
      )
      .finally(() => setPublishing(false));
  };

  const loadParticipants = () => {
    if (!api || !contestId) return;
    setParticipantsLoading(true);
    setError('');
    void api
      .contestParticipants(contestId)
      .then((result) => setParticipants(result.items))
      .catch((reason: unknown) =>
        setError(contestActionError(reason, '读取参赛者名单')),
      )
      .finally(() => setParticipantsLoading(false));
  };

  return (
    <section className="social-panel" aria-label="比赛管理">
      <h2>比赛管理</h2>
      <form key={detail.id} onSubmit={save} noValidate>
        <div className="form-grid">
          <label>
            比赛名称
            <input name="title" defaultValue={detail.title} required />
          </label>
          <label>
            赛制
            <input value={detail.format} readOnly aria-label="赛制" />
          </label>
          <label>
            开始时间
            <input
              name="startsAt"
              type="datetime-local"
              defaultValue={contestDateTimeValue(detail.startsAt)}
              required
            />
          </label>
          <label>
            结束时间
            <input
              name="endsAt"
              type="datetime-local"
              defaultValue={contestDateTimeValue(detail.endsAt)}
              required
            />
          </label>
          <label>
            可见性
            <select name="visibility" defaultValue={detail.visibility}>
              <option value="PUBLIC">公开</option>
              <option value="PRIVATE">私有</option>
            </select>
          </label>
          <label>
            私有比赛新密码
            <input name="privatePassword" type="password" />
          </label>
          <label>
            报名开始时间
            <input name="registrationOpenAt" type="datetime-local" />
          </label>
          <label>
            报名结束时间
            <input name="registrationCloseAt" type="datetime-local" />
          </label>
        </div>
        <label>
          比赛简介
          <textarea
            name="description"
            rows={4}
            defaultValue={detail.description}
          />
        </label>
        <label>
          题目选择与排序
          <input
            name="problems"
            defaultValue={membership.map((item) => item.problemId).join(',')}
            placeholder="输入真实题目 ID，以逗号分隔；留空则保留现有题目"
          />
        </label>
        <label>
          每题分值
          <input
            name="scores"
            defaultValue={membership
              .map((item) => (item.score === undefined ? '' : item.score))
              .join(',')}
            placeholder="与题目顺序一一对应"
          />
        </label>
        {membershipLoading && <p role="status">正在读取比赛题目…</p>}
        {message && (
          <p className="inline-notice" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit" disabled={saving || publishing}>
            {saving ? '保存中…' : '保存比赛设置'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={
              saving || publishing || detail.lifecycle !== 'DRAFT' || !api
            }
            onClick={publish}
          >
            {publishing ? '发布中…' : '发布比赛'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={participantsLoading || !api}
            onClick={loadParticipants}
          >
            {participantsLoading ? '加载中…' : '查看参赛者'}
          </button>
        </div>
      </form>
      {participants && (
        <section>
          <h3>参赛者</h3>
          {participants.length ? (
            <ul>
              {participants.map((participant) => (
                <li key={participant.id}>
                  {participant.displayName ??
                    participant.username ??
                    participant.id}
                  {participant.username && ` (@${participant.username})`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">暂无参赛者。</p>
          )}
        </section>
      )}
    </section>
  );
}

function Standings({
  standings,
  unavailableReason,
}: {
  standings: ContestStanding[];
  unavailableReason?: string;
}) {
  return (
    <div className="standings-wrap">
      <div className="standings-meta">
        <div>
          <h2>比赛排名</h2>
          <p>正式排名完全由后端赛制与计分服务提供。</p>
        </div>
        <span className="freeze-state">封榜状态由后端提供</span>
      </div>
      <div className="standings-table" role="table" aria-label="比赛排名">
        <div role="row" className="standings-head">
          <span role="columnheader">排名</span>
          <span role="columnheader">用户</span>
          <span role="columnheader">总分 / 解题数</span>
          <span role="columnheader">罚时 / 用时</span>
          <span role="columnheader">每题结果</span>
          <span role="columnheader">最后提交</span>
        </div>
        {standings.map((row) => (
          <div
            key={row.userId}
            role="row"
            className={row.currentUser ? 'current-user' : ''}
          >
            <span role="cell">{row.rank}</span>
            <span role="cell">{row.displayName}</span>
            <span role="cell">{row.score ?? row.solvedCount ?? '—'}</span>
            <span role="cell">{row.penalty ?? '—'}</span>
            <span role="cell">{row.problemResults.join(' · ')}</span>
            <span role="cell">{row.lastSubmissionAt ?? '—'}</span>
          </div>
        ))}
      </div>
      {!standings.length && (
        <CapabilityNotice
          title="排行榜暂不可用"
          text={
            unavailableReason === 'SCORING_ENGINE_NOT_INTEGRATED'
              ? '后端计分引擎尚未接入，Web 不会在客户端计算或伪造正式排名。'
              : 'Web 不会在客户端计算或伪造 ICPC、IOI 或 OI 正式排名。'
          }
          request={unavailableReason ?? 'CONTEST-BACKEND-INTEGRATION-REQUEST'}
        />
      )}
    </div>
  );
}

function ContestCreate({
  navigate,
  api,
}: {
  navigate: Navigate;
  api?: ApiClient | undefined;
}) {
  const [message, setMessage] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [busy, setBusy] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const saveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') ?? '').trim();
    const startsAt = String(data.get('startsAt') ?? '');
    const endsAt = String(data.get('endsAt') ?? '');
    const problemIds = String(data.get('problems') ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const scoreValues = String(data.get('scores') ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const freezeMinutes = String(data.get('freezeMinutes') ?? '').trim();
    if (!title) return setMessage('请输入比赛名称。');
    if (!startsAt || !endsAt || new Date(startsAt) >= new Date(endsAt))
      return setMessage('结束时间必须晚于开始时间。');
    if (new Set(problemIds).size !== problemIds.length)
      return setMessage('题目列表不能包含重复题目。');
    if (
      scoreValues.length &&
      (scoreValues.length !== problemIds.length ||
        scoreValues.some(
          (score) => !Number.isFinite(Number(score)) || Number(score) <= 0,
        ))
    )
      return setMessage('每题分值必须与题目一一对应且为正数。');
    if (freezeMinutes && Number(freezeMinutes) < 0)
      return setMessage('封榜时间不能为负数。');
    if (!api) return setMessage('比赛服务暂不可用。');
    setBusy(true);
    setMessage('');
    const startsAtIso = new Date(startsAt).toISOString();
    const endsAtIso = new Date(endsAt).toISOString();
    void api
      .createContest({
        title,
        description: String(data.get('description') ?? ''),
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        visibility,
        format: String(data.get('format') ?? 'ICPC') as
          'ICPC' | 'IOI' | 'OI' | 'CUSTOM',
        registrationOpenAt: registrationOpen ? new Date().toISOString() : null,
        registrationCloseAt: registrationOpen ? endsAtIso : null,
        ...(visibility === 'PRIVATE' && data.get('privatePassword')
          ? { privatePassword: String(data.get('privatePassword')) }
          : {}),
      })
      .then(async (contest) => {
        if (problemIds.length) {
          await api.setContestProblems(
            contest.id,
            problemIds.map((problemId, index) => ({
              problemId,
              ...(scoreValues[index]
                ? { score: Number(scoreValues[index]) }
                : {}),
            })),
          );
        }
        navigate(`/contests/${contest.id}/settings`);
      })
      .catch((reason) =>
        setMessage(
          reason instanceof ApiError
            ? contestActionError(reason, '创建比赛')
            : reason instanceof Error
              ? reason.message
              : '比赛创建失败，请重试。',
        ),
      )
      .finally(() => setBusy(false));
  };
  return (
    <section className="portal-page contest-create">
      <div className="portal-heading">
        <div>
          <p className="eyebrow">比赛管理</p>
          <h1>新建比赛</h1>
        </div>
      </div>
      <form onSubmit={saveDraft} noValidate>
        <div className="form-grid">
          <label>
            比赛名称
            <input name="title" required />
          </label>
          <label>
            赛制
            <select name="format" defaultValue="ICPC">
              <option>ICPC</option>
              <option>IOI</option>
              <option>OI</option>
              <option>CUSTOM</option>
            </select>
          </label>
          <label>
            开始时间
            <input name="startsAt" type="datetime-local" required />
          </label>
          <label>
            结束时间
            <input name="endsAt" type="datetime-local" required />
          </label>
          <label>
            时区
            <select name="timeZone" defaultValue="Asia/Shanghai">
              <option>Asia/Shanghai</option>
              <option>UTC</option>
            </select>
          </label>
          <label>
            可见性
            <select
              name="visibility"
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as 'PUBLIC' | 'PRIVATE')
              }
            >
              <option value="PUBLIC">公开</option>
              <option value="PRIVATE">私有</option>
            </select>
          </label>
        </div>
        <label>
          比赛简介
          <textarea name="description" rows={4} />
        </label>
        <label>
          题目选择与排序
          <input name="problems" placeholder="输入真实题目 ID，以逗号分隔" />
        </label>
        <label>
          每题分值
          <input name="scores" placeholder="仅适用于后端支持的计分赛制" />
        </label>
        <div className="form-grid">
          <label>
            封榜提前分钟
            <input name="freezeMinutes" type="number" min="0" />
          </label>
          <label>
            私有比赛密码
            <input
              name="privatePassword"
              type="password"
              disabled={visibility !== 'PRIVATE'}
            />
          </label>
        </div>
        <label className="checkbox">
          <input
            name="registrationOpen"
            type="checkbox"
            checked={registrationOpen}
            onChange={(event) => setRegistrationOpen(event.target.checked)}
          />
          开放报名
        </label>
        {message && (
          <p
            role={message.includes('草稿') ? 'status' : 'alert'}
            className={message.includes('草稿') ? 'inline-notice' : 'error'}
          >
            {message}
          </p>
        )}
        <div className="actions">
          <button type="submit" disabled={busy}>
            {busy ? '创建中…' : '创建比赛'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => navigate('/contests')}
          >
            取消
          </button>
        </div>
        <p className="unavailable-note">
          {api
            ? '创建后可在比赛管理中继续调整题目、报名设置并发布比赛。'
            : '比赛服务暂不可用，请连接后端后重试。'}
        </p>
      </form>
    </section>
  );
}

export function ActivityHeatmap({
  days,
}: {
  days?: UserActivityDay[] | undefined;
}) {
  if (!days)
    return (
      <CapabilityNotice
        title="暂无可用做题统计"
        text="当前没有按日 solved problems 或 submissions 聚合 API。"
        request="PROFILE-ACTIVITY-BACKEND-INTEGRATION-REQUEST"
      />
    );
  const metric = days[0]?.metric ?? 'SOLVED_PROBLEMS';
  const max = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);
  return (
    <div className="heatmap-block">
      <div className="heatmap-summary" role="status">
        最近一年共 {total}{' '}
        {metric === 'SOLVED_PROBLEMS' ? '道题目完成记录' : '次评测记录'}，共{' '}
        {days.filter((day) => day.count > 0).length} 个活跃日。
      </div>
      <div className="heatmap-scroll">
        <div className="heatmap-grid" aria-label="做题情况热力图">
          {days.map((day) => (
            <span
              key={day.date}
              className="heatmap-day"
              style={{ '--heat': day.count / max } as CSSProperties}
              title={`${day.date}：${day.count} ${metric === 'SOLVED_PROBLEMS' ? '题' : '次提交'}`}
              aria-label={`${day.date}，${day.count} ${metric === 'SOLVED_PROBLEMS' ? '题' : '次提交'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const profileReasonText: Record<string, string> = {
  AUTHENTICATION_REQUIRED: '登录后可查看此个人资料能力。',
  UNAUTHENTICATED: '登录后可查看此个人资料能力。',
  GUEST_ACCOUNT_REQUIRES_UPGRADE:
    '游客账号需要升级为正式账号后才能使用此能力。',
  NO_AUTHORITATIVE_PRODUCT_ACTIVITY_SOURCE: '后端尚未提供权威的做题活动数据。',
  UPSTREAM_BLOCKED_BY_AUTHORITATIVE_SUBMISSION_OUTCOME:
    '该能力依赖权威提交结果，当前上游服务尚未提供。',
  PRODUCT_DOMAIN_NOT_IMPLEMENTED: '该产品域尚未实现。',
};

function profileReason(reason: string) {
  return profileReasonText[reason] ?? '该个人资料能力当前不可用。';
}

function profileErrorText(error: unknown, feature: string) {
  if (error instanceof ApiError) {
    if (error.code === 'GUEST_ACCOUNT_REQUIRES_UPGRADE')
      return '游客账号需要升级为正式账号后才能使用此能力。';
    if (error.code === 'UNAUTHENTICATED' || error.status === 401)
      return `请先登录后${feature}。`;
    if (error.status === 404) return `${feature}不存在或当前不可用。`;
    if (error.status === 409) return `${feature}状态已发生变化，请刷新后重试。`;
  }
  return `${feature}暂时不可用，请稍后重试。`;
}

function ProfileCapabilityNotice({
  title,
  capability,
}: {
  title: string;
  capability: { available: false; reason: string };
}) {
  return (
    <CapabilityNotice
      title={title}
      text={profileReason(capability.reason)}
      request={capability.reason}
    />
  );
}

function ProfileLoadError({
  text,
  onRetry,
}: {
  text: string;
  onRetry: () => void;
}) {
  return (
    <div className="capability-notice" role="alert">
      <strong>个人资料暂不可用</strong>
      <p>{text}</p>
      <button type="button" className="secondary" onClick={onRetry}>
        重试
      </button>
    </div>
  );
}

function profileDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '时间暂不可用'
    : date.toLocaleDateString('zh-CN');
}

export function ProfileExperience({
  user,
  activity,
  navigate,
  api,
  username,
}: {
  user: AuthenticatedUser | null;
  activity?: UserActivityDay[];
  navigate: Navigate;
  api?: ApiClient | undefined;
  username?: string | undefined;
}) {
  const [tab, setTab] = useState('概览');
  const [capabilities, setCapabilities] = useState<
    ProfileCapabilities | undefined
  >();
  const [publicProfile, setPublicProfile] = useState<PublicProfile>();
  const [profileLoading, setProfileLoading] = useState(Boolean(api));
  const [profileError, setProfileError] = useState('');
  const [profileRefresh, setProfileRefresh] = useState(0);
  const [overview, setOverview] = useState<ProfileOverview>();
  const [overviewError, setOverviewError] = useState('');
  const [solvedItems, setSolvedItems] = useState<SolvedProblem[]>([]);
  const [solvedLoaded, setSolvedLoaded] = useState(false);
  const [solvedError, setSolvedError] = useState('');
  const [problemItems, setProblemItems] = useState<ProfileProblem[]>([]);
  const [problemsLoaded, setProblemsLoaded] = useState(false);
  const [problemsError, setProblemsError] = useState('');
  const [favoriteItems, setFavoriteItems] = useState<FavoriteProblem[]>([]);
  const [favoriteNextCursor, setFavoriteNextCursor] = useState<string>();
  const [favoriteTotal, setFavoriteTotal] = useState(0);
  const [favoriteLoaded, setFavoriteLoaded] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [favoriteError, setFavoriteError] = useState('');
  const [favoriteProblemId, setFavoriteProblemId] = useState('');
  const [favoriteAction, setFavoriteAction] = useState<string>();
  const [profileActivityDays, setProfileActivityDays] = useState<UserActivityDay[]>();
  const isPublic = Boolean(username);
  const tabs = ['概览', '做题记录', '收藏', '我的题目', '团队'];
  const profileUsername = username ?? user?.username;
  const profileApi = api as Partial<ApiClient> | undefined;

  useEffect(() => {
    if (!api) return;
    let active = true;
    setProfileLoading(true);
    setProfileError('');
    setCapabilities(undefined);
    setPublicProfile(undefined);
    const load =
      profileUsername && profileApi?.publicProfile
        ? profileApi.publicProfile(profileUsername)
        : api.profileCapabilities();
    void load
      .then((result) => {
        if (!active) return;
        if (profileUsername) {
          const profile = result as PublicProfile;
          setPublicProfile(profile);
          setCapabilities(profile.capabilities);
        } else {
          setCapabilities(result as ProfileCapabilities);
        }
      })
      .catch((error: unknown) => {
        if (active)
          setProfileError(
            profileErrorText(error, username ? '公开个人资料' : '个人资料能力'),
          );
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, profileRefresh, profileUsername]);

  useEffect(() => {
    if (!api || !profileUsername || typeof api.profileActivity !== 'function') return;
    let active = true;
    void api.profileActivity(profileUsername).then((result) => {
      if (!active) return;
      setProfileActivityDays(result.days.map((day) => ({ date: day.date, count: day.submissionCount, metric: 'SUBMISSIONS' })));
    }).catch(() => active && setProfileActivityDays(undefined));
    return () => { active = false; };
  }, [api, profileRefresh, profileUsername]);

  useEffect(() => {
    if (!api || !profileUsername || !profileApi?.profileOverview) return;
    let active = true;
    setOverviewError('');
    void profileApi
      .profileOverview(profileUsername)
      .then((result) => active && setOverview(result))
      .catch(
        (error: unknown) =>
          active && setOverviewError(profileErrorText(error, '概览')),
      );
    return () => {
      active = false;
    };
  }, [api, profileRefresh, profileUsername]);

  const loadSolved = useCallback(() => {
    if (!api || !profileUsername || !profileApi?.profileSolved) return;
    setSolvedError('');
    void profileApi
      .profileSolved(profileUsername)
      .then((result) => {
        setSolvedItems(result.items);
        setSolvedLoaded(true);
      })
      .catch((error: unknown) =>
        setSolvedError(profileErrorText(error, '做题记录')),
      );
  }, [api, profileUsername]);

  const loadProblems = useCallback(() => {
    if (!api || !profileUsername || !profileApi?.profileProblemsFor) return;
    setProblemsError('');
    void profileApi
      .profileProblemsFor(profileUsername)
      .then((result) => {
        setProblemItems(result.items);
        setProblemsLoaded(true);
      })
      .catch((error: unknown) =>
        setProblemsError(profileErrorText(error, '我的题目')),
      );
  }, [api, profileUsername]);

  useEffect(() => {
    if (tab === '做题记录' && !solvedLoaded) loadSolved();
    if (tab === '我的题目' && !problemsLoaded) loadProblems();
  }, [loadProblems, loadSolved, problemsLoaded, solvedLoaded, tab]);

  const loadFavorites = useCallback(
    (append = false) => {
      if (!api || !capabilities?.favorites.available) return;
      const cursor = append ? favoriteNextCursor : undefined;
      if (append && !cursor) return;
      setFavoriteLoading(true);
      setFavoriteError('');
      void api
        .profileFavorites(20, cursor)
        .then((result) => {
          setFavoriteItems((items) =>
            append ? [...items, ...result.items] : result.items,
          );
          setFavoriteTotal(result.page.total);
          setFavoriteNextCursor(result.page.nextCursor);
          setFavoriteLoaded(true);
        })
        .catch((error: unknown) =>
          setFavoriteError(profileErrorText(error, '收藏列表')),
        )
        .finally(() => setFavoriteLoading(false));
    },
    [api, capabilities, favoriteNextCursor],
  );

  useEffect(() => {
    if (tab === '收藏' && !favoriteLoaded) loadFavorites();
  }, [favoriteLoaded, loadFavorites, tab]);

  const addFavorite = (event: FormEvent) => {
    event.preventDefault();
    const problemId = favoriteProblemId.trim();
    if (!api || !problemId || !capabilities?.favorites.available) return;
    setFavoriteAction(`add:${problemId}`);
    setFavoriteError('');
    void api
      .addFavorite(problemId)
      .then(() => {
        setFavoriteProblemId('');
        setFavoriteLoaded(false);
        setFavoriteNextCursor(undefined);
        setFavoriteItems([]);
        setFavoriteTotal(0);
      })
      .catch((error: unknown) =>
        setFavoriteError(profileErrorText(error, '添加收藏')),
      )
      .finally(() => setFavoriteAction(undefined));
  };

  const removeFavorite = (problemId: string) => {
    if (!api || !capabilities?.favorites.available) return;
    setFavoriteAction(`remove:${problemId}`);
    setFavoriteError('');
    void api
      .removeFavorite(problemId)
      .then(() => {
        setFavoriteItems((items) =>
          items.filter((item) => item.problemId !== problemId),
        );
        setFavoriteTotal((total) => Math.max(0, total - 1));
      })
      .catch((error: unknown) =>
        setFavoriteError(profileErrorText(error, '移除收藏')),
      )
      .finally(() => setFavoriteAction(undefined));
  };

  const displayName = isPublic ? publicProfile?.displayName : user?.displayName;
  const displayUsername = isPublic ? publicProfile?.username : user?.username;
  const capability = (key: keyof ProfileCapabilities) => {
    if (!capabilities || key === 'contractVersion') return undefined;
    return capabilities[key];
  };
  const activityCapability = capability('activity');
  const showLegacyActivity = !api && Boolean(activity);

  const renderActivity = () => {
    if (showLegacyActivity) return <ActivityHeatmap days={profileActivityDays ?? activity} />;
    if (api && !activityCapability)
      return <p className="muted">正在加载个人资料能力…</p>;
    if (activityCapability && !activityCapability.available)
      return (
        <ProfileCapabilityNotice
          title="做题记录暂不可用"
          capability={activityCapability}
        />
      );
    return <ActivityHeatmap days={profileActivityDays ?? activity} />;
  };

  const renderFavorites = () => {
    const favoriteCapability = capability('favorites');
    if (!api)
      return (
        <CapabilityNotice
          title="收藏功能正在接入"
          text="当前没有真实收藏列表。"
          request="FAVORITES-BACKEND-INTEGRATION-REQUEST"
        />
      );
    if (!favoriteCapability)
      return <p className="muted">正在加载个人资料能力…</p>;
    if (!favoriteCapability.available)
      return (
        <ProfileCapabilityNotice
          title="收藏暂不可用"
          capability={favoriteCapability}
        />
      );
    return (
      <div className="profile-data-panel">
        <form className="profile-inline-form" onSubmit={addFavorite}>
          <label>
            添加题目收藏
            <input
              value={favoriteProblemId}
              onChange={(event) => setFavoriteProblemId(event.target.value)}
              placeholder="输入已发布题目 ID"
            />
          </label>
          <button
            type="submit"
            disabled={
              !favoriteProblemId.trim() || favoriteAction?.startsWith('add:')
            }
          >
            {favoriteAction?.startsWith('add:') ? '添加中…' : '添加收藏'}
          </button>
        </form>
        {favoriteError && (
          <p className="error" role="alert">
            {favoriteError}
            <button
              type="button"
              className="secondary"
              disabled={favoriteLoading}
              onClick={() => loadFavorites()}
            >
              重试
            </button>
          </p>
        )}
        {favoriteLoading && !favoriteItems.length ? (
          <p className="muted">正在加载收藏…</p>
        ) : favoriteItems.length ? (
          <>
            <p className="muted">共 {favoriteTotal} 个收藏</p>
            <ul className="profile-data-list">
              {favoriteItems.map((item) => (
                <li key={item.problemId}>
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {item.slug} · 收藏于 {profileDate(item.favoritedAt)}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    disabled={favoriteAction === `remove:${item.problemId}`}
                    onClick={() => removeFavorite(item.problemId)}
                  >
                    {favoriteAction === `remove:${item.problemId}`
                      ? '移除中…'
                      : '移除收藏'}
                  </button>
                </li>
              ))}
            </ul>
            {favoriteNextCursor && (
              <button
                type="button"
                className="secondary"
                disabled={favoriteLoading}
                onClick={() => loadFavorites(true)}
              >
                {favoriteLoading ? '加载中…' : '加载更多'}
              </button>
            )}
          </>
        ) : (
          <p className="muted">暂无收藏题目。</p>
        )}
      </div>
    );
  };

  const renderSolved = () => {
    if (!api) return renderActivity();
    if (solvedError)
      return <ProfileLoadError text={solvedError} onRetry={loadSolved} />;
    if (!solvedLoaded)
      return (
        <p className="muted" role="status">
          正在加载做题记录…
        </p>
      );
    return solvedItems.length ? (
      <ul className="profile-data-list">
        {solvedItems.map((item) => (
          <li key={item.problemId}>
            <div>
              <PortalLink to={`/problems/${item.slug}`} navigate={navigate}>
                <strong>{item.title}</strong>
              </PortalLink>
              <small>最近通过于 {profileDate(item.lastAcceptedAt)}</small>
            </div>
          </li>
        ))}
      </ul>
    ) : (
      <p className="muted">暂无已解决题目。</p>
    );
  };

  const renderProblems = () => {
    if (!api)
      return (
        <CapabilityNotice
          title="我的题目功能正在接入"
          text="当前没有真实题目归属数据。"
          request="PROFILE-PROBLEMS-BACKEND-INTEGRATION-REQUEST"
        />
      );
    if (problemsError)
      return <ProfileLoadError text={problemsError} onRetry={loadProblems} />;
    return (
      <div className="profile-data-panel">
        {publicProfile?.canCreateProblems && (
          <button
            type="button"
            onClick={() => navigate('/author/problems/new')}
          >
            创建题目
          </button>
        )}
        {!problemsLoaded ? (
          <p className="muted" role="status">
            正在加载题目…
          </p>
        ) : problemItems.length ? (
          <ul className="profile-data-list">
            {problemItems.map((item) => (
              <li key={item.id}>
                <div>
                  <PortalLink to={`/problems/${item.slug}`} navigate={navigate}>
                    <strong>{item.title}</strong>
                  </PortalLink>
                  <small>
                    {item.status} · {item.visibility} · 更新于{' '}
                    {profileDate(item.updatedAt)}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">暂无题目。</p>
        )}
      </div>
    );
  };

  const renderTab = () => {
    if (tab === '概览') {
      if (overviewError)
        return (
          <ProfileLoadError
            text={overviewError}
            onRetry={() => setProfileRefresh((value) => value + 1)}
          />
        );
      if (!overview)
        return (
          <p className="muted" role="status">
            正在加载概览…
          </p>
        );
      const metrics = [
        ['创建题目', overview.createdProblemCount],
        ['已解决题目', overview.solvedProblemCount],
        ['总提交', overview.submissionCount],
        ['AC 提交', overview.acceptedSubmissionCount],
        ...(overview.favoriteCount === undefined
          ? []
          : [['收藏', overview.favoriteCount] as const]),
      ];
      return (
        <div className="profile-overview-grid">
          {metrics.map(([label, value]) => (
            <section key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </section>
          ))}
        </div>
      );
    }
    if (tab === '做题记录') return renderSolved();
    if (tab === '收藏') return renderFavorites();
    if (tab === '我的题目') return renderProblems();
    if (tab === '团队') {
      const teamCapability = capability('teams');
      return teamCapability && !teamCapability.available ? (
        <ProfileCapabilityNotice
          title="团队暂不可用"
          capability={teamCapability}
        />
      ) : (
        <CapabilityNotice
          title="团队功能正在接入"
          text="当前没有真实团队数据。"
          request="TEAM-BACKEND-INTEGRATION-REQUEST"
        />
      );
    }
    return null;
  };

  return (
    <section className="profile-v4">
      <div className="profile-cover" aria-label="OJPlatform 默认个人主页封面">
        <span>OJPlatform</span>
      </div>
      <div className="profile-identity">
        <div className="profile-identity-main">
          <div className="profile-avatar" aria-label="默认头像">
            {displayName?.slice(0, 1).toUpperCase() ?? 'OJ'}
          </div>
          <h1>{displayName ?? '个人主页'}</h1>
          <p>
            {displayUsername ? `@${displayUsername}` : '公开资料服务正在接入'}
          </p>
          <p className="profile-bio">
            {isPublic
              ? `加入于 ${profileDate(publicProfile?.createdAt ?? '')}`
              : user
                ? '个人签名尚未提供。'
                : '登录后可查看自己的真实账户资料。'}
          </p>
        </div>
        {!isPublic && user && (
          <div className="profile-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => navigate('/settings')}
            >
              编辑资料
            </button>
          </div>
        )}
      </div>
      <div
        className="section-tabs profile-tabs"
        role="tablist"
        aria-label="个人主页内容"
      >
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            className={tab === item ? 'active' : ''}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {profileError ? (
        <ProfileLoadError
          text={profileError}
          onRetry={() => setProfileRefresh((value) => value + 1)}
        />
      ) : !user && !isPublic && !api ? (
        <CapabilityNotice
          title="个人资料暂不可用"
          text="当前访客没有已验证的登录身份，页面不会生成虚构用户信息。"
          request="PROFILE-BACKEND-INTEGRATION-REQUEST"
        />
      ) : null}
      {profileLoading && !capabilities && api ? (
        <p className="muted" role="status">
          正在加载个人资料能力…
        </p>
      ) : null}
      <section className="profile-section">
        <div className="section-heading-inline">
          <div>
            <p className="eyebrow">
              {tab === '概览' || tab === '做题记录' ? 'ACTIVITY' : 'PROFILE'}
            </p>
            <h2>{tab}</h2>
          </div>
          <span className="muted">
            {isPublic ? '仅展示公开资料' : '指标与关系由后端明确提供'}
          </span>
        </div>
        {renderTab()}
      </section>
    </section>
  );
}

export function NotificationBell({
  navigate,
  api,
}: {
  navigate: Navigate;
  api?: ApiClient | undefined;
}) {
  const controlRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationSummary[]>([]);
  const [unread, setUnread] = useState(0);
  const [unreadError, setUnreadError] = useState('');
  const [unreadRefresh, setUnreadRefresh] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!api) return;
    let active = true;
    setUnreadError('');
    void api
      .unreadNotifications()
      .then((result) => {
        if (active) setUnread(result.count);
      })
      .catch(() => {
        if (active) setUnreadError('未读通知状态暂不可用，请稍后重试。');
      });
    return () => {
      active = false;
    };
  }, [api, unreadRefresh]);
  useEffect(() => {
    if (!api || !open) return;
    setLoading(true);
    setError('');
    void api
      .notifications(5)
      .then((result) => setItems(result.items))
      .catch(() => setError('通知暂时不可用，请稍后重试。'))
      .finally(() => setLoading(false));
  }, [api, open]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);
  const mark = (id: string) => {
    if (!api) return;
    void api
      .markNotificationRead(id)
      .then(() => {
        setItems((all) =>
          all.map((item) => (item.id === id ? { ...item, read: true } : item)),
        );
        setUnread((count) => Math.max(0, count - 1));
      })
      .catch(() => setError('标记通知失败，请稍后重试。'));
  };
  return (
    <div className="notification-control" ref={controlRef}>
      <button
        type="button"
        className="icon-button"
        aria-label="通知"
        title="通讯中心"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">🔔</span>
        {api && unread > 0 && (
          <span className="badge" aria-label={`${unread} 条未读通知`}>
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div
          className="notification-popover"
          role="dialog"
          aria-label="通知预览"
        >
          <div>
            <strong>通讯中心</strong>
            <button
              type="button"
              aria-label="关闭通知"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          {unreadError && (
            <p className="error" role="alert">
              {unreadError}
              <button
                type="button"
                className="secondary"
                onClick={() => setUnreadRefresh((value) => value + 1)}
              >
                重试未读状态
              </button>
            </p>
          )}
          {api ? (
            loading ? (
              <p role="status">正在加载通知…</p>
            ) : error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : items.length ? (
              <ul className="notification-preview">
                {items.map((item) => (
                  <li key={item.id} className={item.read ? '' : 'unread'}>
                    <strong>{item.title}</strong>
                    <small>{item.body}</small>
                    {!item.read && (
                      <button type="button" onClick={() => mark(item.id)}>
                        标为已读
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <small>暂无通知。</small>
            )
          ) : (
            <>
              <p>通知服务正在接入</p>
              <small>当前没有真实未读数或通知数据。</small>
            </>
          )}
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setOpen(false);
              navigate('/messages');
            }}
          >
            进入通讯中心
          </button>
        </div>
      )}
    </div>
  );
}

const EMPTY_NOTIFICATIONS: NotificationSummary[] = [];

const notificationFilters = [
  ['ALL', '全部'],
  ['SYSTEM', '系统'],
  ['CONTEST', '比赛'],
  ['HOMEWORK', '作业'],
  ['SOCIAL', '社交'],
] as const;

function matchesNotificationFilter(
  item: NotificationSummary,
  filter: (typeof notificationFilters)[number][0],
) {
  if (filter === 'ALL') return true;
  if (filter === 'SOCIAL')
    return [
      'SOCIAL',
      'FRIEND_REQUEST',
      'FRIEND_ACCEPTED',
      'DIRECT_MESSAGE',
    ].includes(item.category);
  return item.category === filter;
}

export function NotificationsPage({
  notifications = EMPTY_NOTIFICATIONS,
  api,
  loading = false,
  loadError,
  onRetry,
}: {
  notifications?: NotificationSummary[];
  api?: ApiClient | undefined;
  loading?: boolean;
  loadError?: string | undefined;
  onRetry?: (() => void) | undefined;
}) {
  const [items, setItems] = useState(notifications);
  const [unread, setUnread] = useState(0);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState<string>();
  const [filter, setFilter] =
    useState<(typeof notificationFilters)[number][0]>('ALL');
  useEffect(() => {
    setItems(notifications);
  }, [notifications]);
  useEffect(() => {
    if (!api) return;
    setActionError('');
    void api
      .unreadNotifications()
      .then((r) => setUnread(r.count))
      .catch((reason: unknown) => {
        setActionError(
          reason instanceof ApiError && reason.status === 401
            ? '请先登录后查看通知。'
            : '通知服务暂时不可用，请稍后重试。',
        );
      });
  }, [api]);
  const mark = (id: string) => {
    if (!api) return;
    setBusy(`read:${id}`);
    setActionError('');
    void api
      .markNotificationRead(id)
      .then(() => {
        setItems((all) =>
          all.map((n) => (n.id === id ? { ...n, read: true } : n)),
        );
        setUnread((n) => Math.max(0, n - 1));
      })
      .catch((reason: unknown) => {
        setActionError(
          reason instanceof ApiError && reason.status === 404
            ? '通知不存在或已被移除。'
            : '标记通知失败，请稍后重试。',
        );
      })
      .finally(() => setBusy(undefined));
  };
  const markAll = () => {
    if (!api) return;
    setBusy('read-all');
    setActionError('');
    void api
      .markAllNotificationsRead()
      .then(() => {
        setItems((all) => all.map((n) => ({ ...n, read: true })));
        setUnread(0);
      })
      .catch(() => setActionError('全部标记已读失败，请稍后重试。'))
      .finally(() => setBusy(undefined));
  };
  const visibleItems = items.filter((item) =>
    matchesNotificationFilter(item, filter),
  );
  return (
    <section className="portal-page notifications-page">
      <div className="portal-heading">
        <div>
          <p className="eyebrow">消息提醒</p>
          <h1>通知</h1>
        </div>
      </div>
      <div className="filter-tabs" role="tablist" aria-label="通知分类">
        {notificationFilters.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {api && unread > 0 && (
        <button
          type="button"
          className="secondary"
          onClick={markAll}
          disabled={busy !== undefined}
        >
          {busy === 'read-all' ? '处理中…' : `全部标为已读（${unread}）`}
        </button>
      )}
      {loadError && (
        <p className="error" role="alert">
          {loadError}
          {onRetry && (
            <button type="button" className="secondary" onClick={onRetry}>
              重试
            </button>
          )}
        </p>
      )}
      {actionError && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}
      {loading ? (
        <p className="muted" role="status">
          正在加载通知…
        </p>
      ) : loadError ? null : visibleItems.length ? (
        <ul className="notification-list">
          {visibleItems.map((item) => (
            <li key={item.id} className={item.read ? '' : 'unread'}>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
              <time>{item.createdAt}</time>
              {!item.read && (
                <button
                  type="button"
                  onClick={() => mark(item.id)}
                  disabled={busy !== undefined}
                >
                  {busy === `read:${item.id}` ? '处理中…' : '标为已读'}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : api ? (
        <p className="muted">暂无通知。</p>
      ) : (
        <CapabilityNotice
          title="通知服务正在接入"
          text="当前没有真实通知或未读状态；导航不会显示虚构红点。"
          request="NOTIFICATIONS-BACKEND-INTEGRATION-REQUEST"
        />
      )}
    </section>
  );
}

const EMPTY_CONVERSATIONS: ConversationSummary[] = [];
const EMPTY_MESSAGES: Message[] = [];
const EMPTY_FRIENDS: FriendSummary[] = [];
const EMPTY_REQUESTS: FriendRequest[] = [];

export function MessagesExperience({
  conversations = EMPTY_CONVERSATIONS,
  messages = EMPTY_MESSAGES,
  friends = EMPTY_FRIENDS,
  requests = EMPTY_REQUESTS,
  api,
  loading = false,
  loadError,
  onRetry,
}: {
  conversations?: ConversationSummary[];
  messages?: Message[];
  friends?: FriendSummary[];
  requests?: FriendRequest[];
  api?: ApiClient | undefined;
  loading?: boolean;
  loadError?: string | undefined;
  onRetry?: (() => void) | undefined;
}) {
  const [mode, setMode] = useState<
    'conversations' | 'contacts' | 'requests' | 'add'
  >('conversations');
  const [selected, setSelected] = useState<string | null>(null);
  const [conversationQuery, setConversationQuery] = useState('');
  const [conversationState, setConversationState] = useState(conversations);
  const [liveMessages, setLiveMessages] = useState(messages);
  const [draft, setDraft] = useState('');
  const [friendsState, setFriendsState] = useState(friends);
  const [requestsState, setRequestsState] = useState(requests);
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [sendBusy, setSendBusy] = useState(false);
  const [failedSend, setFailedSend] = useState<
    { body: string; clientMessageId: string } | undefined
  >();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadError, setUnreadError] = useState('');
  const [unreadRefresh, setUnreadRefresh] = useState(0);
  useEffect(() => {
    setConversationState(conversations);
  }, [conversations]);
  useEffect(() => {
    setFriendsState(friends);
  }, [friends]);
  useEffect(() => {
    setRequestsState(requests);
  }, [requests]);
  useEffect(() => {
    setLiveMessages(messages);
  }, [messages]);
  useEffect(() => {
    setFailedSend(undefined);
  }, [selected]);
  const selectedConversation = useMemo(
    () => conversationState.find((item) => item.id === selected),
    [conversationState, selected],
  );
  const visibleConversations = useMemo(() => {
    const query = conversationQuery.trim().toLocaleLowerCase();
    if (!query) return conversationState;
    return conversationState.filter((conversation) =>
      [
        conversation.peer.displayName,
        conversation.peer.username,
        conversation.lastMessage ?? '',
      ].some((value) => value.toLocaleLowerCase().includes(query)),
    );
  }, [conversationQuery, conversationState]);
  const changeMode = (
    next: 'conversations' | 'contacts' | 'requests' | 'add',
  ) => {
    setMode(next);
    if (next !== 'conversations') setSelected(null);
  };
  useEffect(() => {
    if (!api) return;
    let active = true;
    setUnreadError('');
    void api
      .unreadMessages()
      .then((result) => {
        if (active) setUnreadCount(result.count);
      })
      .catch(() => {
        if (active) setUnreadError('未读消息状态暂不可用，请稍后重试。');
      });
    return () => {
      active = false;
    };
  }, [api, unreadRefresh]);
  const loadMessages = useCallback(() => {
    if (!api || !selected) return;
    setMessageLoading(true);
    setMessageError('');
    setLiveMessages([]);
    void api
      .conversationMessages(selected)
      .then((result) => {
        setLiveMessages(result.items);
        const latest = result.items[0];
        if (latest)
          void api
            .markConversationRead(selected, latest.id)
            .then(() => {
              setConversationState((all) =>
                all.map((conversation) =>
                  conversation.id === selected
                    ? { ...conversation, unreadCount: 0 }
                    : conversation,
                ),
              );
              setUnreadCount((count) =>
                Math.max(0, count - (selectedConversation?.unreadCount ?? 0)),
              );
            })
            .catch(() =>
              setMessageError('消息已加载，但标记已读失败，请稍后重试。'),
            );
      })
      .catch((reason: unknown) => {
        setMessageError(
          reason instanceof ApiError && reason.status === 403
            ? '当前账号没有查看此会话的权限。'
            : reason instanceof ApiError && reason.status === 404
              ? '会话不存在或已被移除。'
              : '消息暂时不可用，请重试。',
        );
      })
      .finally(() => setMessageLoading(false));
  }, [api, selected, selectedConversation?.unreadCount]);
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);
  const sendMessage = (body: string, clientMessageId: string) => {
    if (!api || !selected || sendBusy) return;
    setSendBusy(true);
    setMessageError('');
    void api
      .sendMessage(selected, body, clientMessageId)
      .then((message) => {
        setLiveMessages((all) => [...all, message]);
        setDraft('');
        setConversationState((all) =>
          all.map((conversation) =>
            conversation.id === selected
              ? {
                  ...conversation,
                  lastMessage: message.content,
                  lastMessageAt: message.sentAt,
                }
              : conversation,
          ),
        );
        setFailedSend(undefined);
      })
      .catch((reason: unknown) => {
        setDraft(body);
        setFailedSend({ body, clientMessageId });
        setMessageError(
          reason instanceof ApiError && reason.status === 403
            ? '当前账号没有发送消息的权限。'
            : reason instanceof ApiError && reason.status === 429
              ? '发送过于频繁，请稍后重试。'
              : '消息发送失败，请重试。',
        );
      })
      .finally(() => setSendBusy(false));
  };
  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    const body = draft.trim();
    setDraft('');
    sendMessage(
      body,
      failedSend?.body === body
        ? failedSend.clientMessageId
        : crypto.randomUUID(),
    );
  };
  return (
    <section className="messages-page">
      <div
        className={`messenger-shell message-workspace message-mode-${mode} ${selected ? 'show-chat' : ''}`}
      >
        <aside className="conversation-pane" aria-label="通讯工作区导航">
          <div className="conversation-pane-header">
            <div className="message-modes" role="tablist" aria-label="通讯视图">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'conversations'}
                onClick={() => changeMode('conversations')}
              >
                会话
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'contacts'}
                onClick={() => changeMode('contacts')}
              >
                通讯录
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'requests'}
                onClick={() => changeMode('requests')}
              >
                新的朋友
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'add'}
                onClick={() => changeMode('add')}
              >
                添加好友
              </button>
            </div>
            {mode === 'conversations' && (
              <h2>
                最近会话
                {unreadCount > 0 && <small>（{unreadCount} 条未读）</small>}
              </h2>
            )}
            {mode === 'conversations' && unreadError && (
              <p className="error" role="alert">
                {unreadError}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setUnreadRefresh((value) => value + 1)}
                >
                  重试未读状态
                </button>
              </p>
            )}
            {mode === 'conversations' && (
              <label className="conversation-search">
                <span className="sr-only">搜索会话</span>
                <input
                  type="search"
                  value={conversationQuery}
                  onChange={(event) => setConversationQuery(event.target.value)}
                  placeholder="搜索会话"
                />
              </label>
            )}
            {mode === 'contacts' && (
              <span className="rail-section-label">联系人</span>
            )}
            {mode === 'requests' && (
              <span className="rail-section-label">好友请求</span>
            )}
            {mode === 'add' && (
              <span className="rail-section-label">添加联系人</span>
            )}
          </div>
          {mode === 'conversations' && (
            <div className="conversation-list">
              {loadError ? (
                <p className="error" role="alert">
                  {loadError}
                  {onRetry && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={onRetry}
                    >
                      重试
                    </button>
                  )}
                </p>
              ) : loading ? (
                <p className="muted" role="status">
                  正在加载通讯数据…
                </p>
              ) : (
                <>
                  {visibleConversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      className={selected === conversation.id ? 'selected' : ''}
                      onClick={() => setSelected(conversation.id)}
                    >
                      <span className="mini-avatar">
                        {conversation.peer.displayName.slice(0, 1)}
                      </span>
                      <span>
                        <strong>{conversation.peer.displayName}</strong>
                        <small>{conversation.lastMessage ?? '暂无消息'}</small>
                      </span>
                      {conversation.unreadCount > 0 && (
                        <b aria-label={`${conversation.unreadCount} 条未读`}>
                          {conversation.unreadCount}
                        </b>
                      )}
                    </button>
                  ))}
                  {!visibleConversations.length && (
                    <p className="empty-copy">
                      {conversationQuery
                        ? '没有匹配的会话。'
                        : api
                          ? '暂无会话。'
                          : '暂无会话。通讯后端接入后，真实会话会显示在这里。'}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {mode !== 'conversations' &&
            (loadError ? (
              <p className="error rail-empty-copy" role="alert">
                {loadError}
                {onRetry && (
                  <button type="button" className="secondary" onClick={onRetry}>
                    重试
                  </button>
                )}
              </p>
            ) : (
              <p className="empty-copy rail-empty-copy">
                {mode === 'contacts'
                  ? api
                    ? '真实联系人显示在右侧。'
                    : '联系人列表将在真实社交服务接入后显示。'
                  : mode === 'requests'
                    ? api
                      ? '真实好友请求显示在右侧。'
                      : '好友请求将在真实社交服务接入后显示。'
                    : api
                      ? '可通过右侧搜索真实用户并发送申请。'
                      : '添加好友功能将在真实社交服务接入后启用。'}
              </p>
            ))}
        </aside>
        <section className="chat-pane message-content" aria-label="聊天内容">
          {mode === 'add' ? (
            <AddFriend
              api={api}
              onRequest={(request) =>
                setRequestsState((all) =>
                  all.some((item) => item.id === request.id)
                    ? all
                    : [...all, request],
                )
              }
            />
          ) : mode === 'requests' ? (
            <FriendRequests
              api={api}
              requests={requestsState}
              onChange={(id, state) =>
                setRequestsState((all) =>
                  all.map((request) =>
                    request.id === id ? { ...request, state } : request,
                  ),
                )
              }
              onRefreshFriends={() => {
                if (!api)
                  return Promise.reject(new Error('Social unavailable'));
                return api
                  .friends()
                  .then((result) => setFriendsState(result.items));
              }}
            />
          ) : mode === 'contacts' ? (
            <Contacts
              friends={friendsState}
              api={api}
              onRemoved={(userId) =>
                setFriendsState((all) =>
                  all.filter((friend) => friend.id !== userId),
                )
              }
              onConversation={(id) =>
                api?.conversations().then((result) => {
                  const next = result.items.map((item) => ({
                    ...item,
                    muted: false,
                    pinned: false,
                  }));
                  if (!next.some((conversation) => conversation.id === id))
                    throw new Error('Conversation was not returned');
                  setConversationState(next);
                  setMode('conversations');
                  setSelected(id);
                }) ?? Promise.reject(new Error('Messaging unavailable'))
              }
            />
          ) : selectedConversation ? (
            <>
              <header>
                <button
                  type="button"
                  className="mobile-back"
                  onClick={() => setSelected(null)}
                >
                  ←
                </button>
                <div>
                  <strong>{selectedConversation.peer.displayName}</strong>
                  <span>@{selectedConversation.peer.username}</span>
                </div>
              </header>
              {messageError && (
                <p className="error" role="alert">
                  {messageError}
                  <button
                    type="button"
                    className="secondary"
                    onClick={loadMessages}
                  >
                    重试加载
                  </button>
                  {failedSend && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={sendBusy}
                      onClick={() =>
                        sendMessage(failedSend.body, failedSend.clientMessageId)
                      }
                    >
                      重新发送
                    </button>
                  )}
                </p>
              )}
              <div className="message-stream">
                {messageLoading ? (
                  <p className="muted" role="status">
                    正在加载消息…
                  </p>
                ) : (
                  liveMessages
                    .filter((message) => message.conversationId === selected)
                    .map((message) => (
                      <p key={message.id} className="message-bubble">
                        {message.content}
                        <time>{message.sentAt}</time>
                      </p>
                    ))
                )}
              </div>
              <form className="message-composer" onSubmit={send}>
                <label>
                  <span className="sr-only">输入消息</span>
                  <textarea
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      if (failedSend?.body !== event.target.value.trim())
                        setFailedSend(undefined);
                    }}
                    placeholder="输入消息"
                    rows={2}
                  />
                </label>
                <button type="submit" disabled={!draft.trim() || sendBusy}>
                  {sendBusy ? '发送中…' : '发送'}
                </button>
              </form>
            </>
          ) : (
            <div className="no-conversation">
              <strong>选择一个会话</strong>
              <p>当前没有已选择的聊天。消息不会在本地伪造或持久化。</p>
              {!api && <code>MESSAGING-BACKEND-INTEGRATION-REQUEST</code>}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function Contacts({
  friends,
  api,
  onRemoved,
  onConversation,
}: {
  friends: FriendSummary[];
  api?: ApiClient | undefined;
  onRemoved: (userId: string) => void;
  onConversation: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState('');
  const actionError = (reason: unknown, action: string) => {
    if (reason instanceof ApiError) {
      if (reason.status === 403) return `当前账号没有权限${action}。`;
      if (reason.status === 404) return '好友或会话不存在或已被移除。';
      if (reason.status === 429) return '操作过于频繁，请稍后重试。';
    }
    return `${action}失败，请稍后重试。`;
  };
  const remove = (friend: FriendSummary) => {
    if (!api) return;
    setBusy(`remove:${friend.id}`);
    setError('');
    void api
      .removeFriend(friend.id)
      .then(() => onRemoved(friend.id))
      .catch((reason: unknown) => setError(actionError(reason, '移除好友')))
      .finally(() => setBusy(undefined));
  };
  const startConversation = (friend: FriendSummary) => {
    if (!api) return;
    setBusy(`message:${friend.id}`);
    setError('');
    void api
      .createDirectConversation(friend.id)
      .then((result) => onConversation(result.id))
      .catch((reason: unknown) => setError(actionError(reason, '发起会话')))
      .finally(() => setBusy(undefined));
  };
  return (
    <div className="contacts-layout">
      <nav aria-label="通讯录分类">
        <button type="button" className="active">
          我的好友
        </button>
        <span aria-disabled="true">团队联系人暂未提供</span>
      </nav>
      <section>
        <h2>我的好友</h2>
        {friends.length ? (
          <ul>
            {friends.map((friend) => (
              <li key={friend.id}>
                <span className="mini-avatar">
                  {friend.displayName.slice(0, 1)}
                </span>
                <div>
                  <strong>{friend.displayName}</strong>
                  <small>@{friend.username}</small>
                </div>
                {api && (
                  <>
                    <button
                      type="button"
                      onClick={() => startConversation(friend)}
                      disabled={busy !== undefined}
                    >
                      {busy === `message:${friend.id}` ? '打开中…' : '发消息'}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => remove(friend)}
                      disabled={busy !== undefined}
                    >
                      {busy === `remove:${friend.id}` ? '移除中…' : '移除好友'}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : api ? (
          <p className="muted">暂无好友。</p>
        ) : (
          <CapabilityNotice
            title="好友服务正在接入"
            text="当前没有真实好友列表。"
            request="SOCIAL-GRAPH-BACKEND-INTEGRATION-REQUEST"
          />
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

function AddFriend({
  api,
  onRequest,
}: {
  api?: ApiClient | undefined;
  onRequest: (request: FriendRequest) => void;
}) {
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [results, setResults] = useState<FriendSummary[]>([]);
  const [message, setMessage] = useState('');
  const [busyUserId, setBusyUserId] = useState<string>();
  const search = () => {
    if (!api || query.trim().length < 2) return;
    setMessage('');
    void api
      .searchUsers(query.trim())
      .then((result) => setResults(result.items))
      .catch(() => setMessage('搜索用户失败，请稍后重试。'));
  };
  const request = (user: FriendSummary) => {
    if (!api) return;
    setBusyUserId(user.id);
    setMessage('');
    void api
      .sendFriendRequest(user.id, note.trim() || undefined)
      .then((result) => {
        onRequest({
          id: result.id,
          direction: 'SENT',
          user,
          state: result.state,
        });
        setNote('');
      })
      .catch((reason: unknown) => {
        setMessage(
          reason instanceof ApiError && reason.status === 409
            ? '好友申请已存在或对方已经是好友。'
            : '发送好友申请失败，请稍后重试。',
        );
      })
      .finally(() => setBusyUserId(undefined));
  };
  return (
    <section className="social-panel">
      <h2>添加好友</h2>
      <p>通过用户名或 UID 查找用户。</p>
      <label>
        用户名或 UID
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入用户名"
        />
      </label>
      <label>
        好友申请说明
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
        />
      </label>
      <div className="control-group">
        <button type="button" onClick={search}>
          搜索
        </button>
      </div>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      {results.map((user) => (
        <div key={user.id} className="social-result">
          <strong>{user.displayName}</strong>
          <small>@{user.username}</small>
          <button
            type="button"
            onClick={() => request(user)}
            disabled={busyUserId !== undefined}
          >
            {busyUserId === user.id ? '发送中…' : '添加好友'}
          </button>
        </div>
      ))}
    </section>
  );
}

function FriendRequests({
  requests,
  api,
  onChange,
  onRefreshFriends,
}: {
  requests: FriendRequest[];
  api?: ApiClient | undefined;
  onChange: (id: string, state: FriendRequest['state']) => void;
  onRefreshFriends: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string>();
  const resolve = (request: FriendRequest, action: 'accept' | 'reject') => {
    if (!api) return;
    setBusy(`${action}:${request.id}`);
    setError('');
    void api
      .resolveFriendRequest(request.id, action)
      .then((result) => {
        onChange(request.id, result.state);
        if (action === 'accept')
          void onRefreshFriends().catch(() =>
            setError('好友申请已处理，但刷新好友列表失败，请稍后重试。'),
          );
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof ApiError && reason.status === 404
            ? '好友申请不存在或已处理。'
            : '处理好友申请失败，请稍后重试。',
        );
      })
      .finally(() => setBusy(undefined));
  };
  const cancel = (request: FriendRequest) => {
    if (!api) return;
    setBusy(`cancel:${request.id}`);
    setError('');
    void api
      .cancelFriendRequest(request.id)
      .then(() => onChange(request.id, 'CANCELLED'))
      .catch((reason: unknown) => {
        setError(
          reason instanceof ApiError && reason.status === 404
            ? '好友申请不存在或已处理。'
            : '取消好友申请失败，请稍后重试。',
        );
      })
      .finally(() => setBusy(undefined));
  };
  const incoming = requests.filter(
    (request) =>
      request.direction === 'RECEIVED' && request.state === 'PENDING',
  );
  const outgoing = requests.filter(
    (request) => request.direction === 'SENT' && request.state === 'PENDING',
  );
  return (
    <div className="request-columns">
      <section>
        <h2>收到的申请</h2>
        {incoming.length ? (
          <p>{incoming.length} 条待处理申请</p>
        ) : (
          <p>暂无收到的申请</p>
        )}
        {incoming.map((request) => (
          <div className="control-group" key={request.id}>
            <span>{request.user.displayName}</span>
            <button
              type="button"
              disabled={busy !== undefined}
              onClick={() => resolve(request, 'accept')}
            >
              {busy === `accept:${request.id}` ? '处理中…' : '接受'}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy !== undefined}
              onClick={() => resolve(request, 'reject')}
            >
              {busy === `reject:${request.id}` ? '处理中…' : '拒绝'}
            </button>
          </div>
        ))}
      </section>
      <section>
        <h2>发出的申请</h2>
        {outgoing.length ? (
          outgoing.map((request) => (
            <div className="control-group" key={request.id}>
              <span>{request.user.displayName}</span>
              <button
                type="button"
                className="secondary"
                disabled={busy !== undefined}
                onClick={() => cancel(request)}
              >
                {busy === `cancel:${request.id}` ? '处理中…' : '取消申请'}
              </button>
            </div>
          ))
        ) : (
          <p>暂无发出的申请</p>
        )}
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
