import {
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { AuthenticatedUser } from '../services/api.js';
import type {
  ContestDetail,
  ContestProblem,
  ContestStanding,
  ContestSummary,
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

export function ContestExperience({
  view,
  contestId,
  navigate,
  contests = [],
  detail,
  problems = [],
  standings = [],
}: {
  view: ContestView;
  contestId?: string;
  navigate: Navigate;
  contests?: ContestSummary[];
  detail?: ContestDetail;
  problems?: ContestProblem[];
  standings?: ContestStanding[];
}) {
  if (view === 'create') return <ContestCreate navigate={navigate} />;
  if (view === 'list' || view === 'mine') {
    return (
      <section className="portal-page contest-page">
        <div className="portal-heading">
          <div>
            <p className="eyebrow">竞赛中心</p>
            <h1>{view === 'mine' ? '我的比赛' : '比赛'}</h1>
          </div>
          <PortalLink
            to="/contests/new"
            navigate={navigate}
            className="button-link"
          >
            新建比赛
          </PortalLink>
        </div>
        <div className="filter-tabs" role="tablist" aria-label="比赛筛选">
          {['全部', '即将开始', '进行中', '已结束', '我参加的', '我创建的'].map(
            (label, index) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={index === 0}
              >
                {label}
              </button>
            ),
          )}
        </div>
        {contests.length ? (
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
                  <span>{contest.format}</span>
                  <span>{contest.startsAt}</span>
                </article>
              </PortalLink>
            ))}
          </div>
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

  const base = `/contests/${encodeURIComponent(contestId ?? '')}`;
  return (
    <section className="portal-page contest-page">
      <header className="contest-header">
        <div>
          <p className="eyebrow">比赛详情</p>
          <h1>{detail?.title ?? '比赛数据暂不可用'}</h1>
          <p>{detail?.description ?? `比赛标识：${contestId ?? '未知'}`}</p>
        </div>
        <div className="contest-state">
          <span>{detail?.lifecycle ?? 'NOT_AVAILABLE'}</span>
          <button type="button" disabled={!detail?.canRegister}>
            报名比赛
          </button>
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
        {detail?.canManage && (
          <PortalLink to={`${base}/settings`} navigate={navigate}>
            管理
          </PortalLink>
        )}
      </nav>
      {view === 'standings' ? (
        <Standings standings={standings} />
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
        <CapabilityNotice
          title="比赛管理暂不可用"
          text="管理权限和编辑接口必须由后端授权后开放。"
          request="CONTEST-BACKEND-INTEGRATION-REQUEST"
        />
      ) : (
        <CapabilityNotice
          title="比赛详情正在接入"
          text="生命周期、报名、公告和赛制信息尚无 authoritative backend。"
          request="CONTEST-BACKEND-INTEGRATION-REQUEST"
        />
      )}
    </section>
  );
}

function Standings({ standings }: { standings: ContestStanding[] }) {
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
          text="Web 不会在客户端计算或伪造 ICPC、IOI 或 OI 正式排名。"
          request="CONTEST-BACKEND-INTEGRATION-REQUEST"
        />
      )}
    </div>
  );
}

function ContestCreate({ navigate }: { navigate: Navigate }) {
  const [message, setMessage] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
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
    setMessage(
      '本地未提交草稿已保留在当前页面；刷新后不会保存，也未发布到平台。',
    );
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
          <input name="registrationOpen" type="checkbox" />
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
          <button type="submit">保存本地未提交草稿</button>
          <button type="button" disabled title="比赛后端尚未接入">
            发布比赛
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
          比赛后端尚未接入。当前表单不会持久化、报名或发布比赛。
        </p>
      </form>
    </section>
  );
}

export function ActivityHeatmap({ days }: { days?: UserActivityDay[] }) {
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
        {metric === 'SOLVED_PROBLEMS' ? '道题目完成记录' : '次提交记录'}，共{' '}
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

export function ProfileExperience({
  user,
  activity,
  navigate,
}: {
  user: AuthenticatedUser | null;
  activity?: UserActivityDay[];
  navigate: Navigate;
}) {
  const [tab, setTab] = useState('概览');
  const tabs = [
    '概览',
    '做题记录',
    '收藏',
    '团队',
    '我的比赛',
    '我的题目',
    '提交记录',
  ];
  return (
    <section className="profile-v4">
      <div className="profile-cover" aria-label="OJPlatform 默认个人主页封面">
        <span>OJPlatform</span>
      </div>
      <div className="profile-identity">
        <div className="profile-avatar" aria-label="默认头像">
          {user?.displayName.slice(0, 1).toUpperCase() ?? 'OJ'}
        </div>
        <h1>{user?.displayName ?? '个人主页'}</h1>
        <p>{user ? `@${user.username}` : '公开资料服务正在接入'}</p>
        {user?.guest && (
          <span className="guest-badge profile-guest-badge">游客账号</span>
        )}
        <p className="profile-bio">
          {user ? '个人签名尚未提供。' : '登录后可查看自己的真实账户资料。'}
        </p>
        {user?.guest && (
          <p className="guest-upgrade-hint">
            {user.upgradeHint ?? '绑定邮箱、手机号或第三方账号以升级账户。'}
          </p>
        )}
        {user && (
          <button
            type="button"
            className="secondary"
            onClick={() => navigate('/settings')}
          >
            编辑资料
          </button>
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
      {!user && (
        <CapabilityNotice
          title="个人资料暂不可用"
          text="当前访客没有已验证的登录身份，页面不会生成虚构用户信息。"
          request="PROFILE-BACKEND-INTEGRATION-REQUEST"
        />
      )}
      <section className="profile-section">
        <div className="section-heading-inline">
          <div>
            <p className="eyebrow">ACTIVITY</p>
            <h2>做题情况</h2>
          </div>
          <span className="muted">指标由后端明确提供</span>
        </div>
        {activity ? <ActivityHeatmap days={activity} /> : <ActivityHeatmap />}
      </section>
      <div className="profile-feature-grid">
        {['收藏', '团队', '我的比赛', '我的题目'].map((item) => (
          <section key={item}>
            <h2>{item}</h2>
            <p>暂无可用数据</p>
            <span>
              {item === '收藏'
                ? 'FAVORITES'
                : item === '团队'
                  ? 'TEAM'
                  : item === '我的比赛'
                    ? 'CONTEST'
                    : 'AUTHORING'}{' '}
              capability 未接入
            </span>
          </section>
        ))}
      </div>
    </section>
  );
}

export function NotificationBell({ navigate }: { navigate: Navigate }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="notification-control">
      <button
        type="button"
        className="icon-button"
        aria-label="通知"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">🔔</span>
      </button>
      {open && (
        <div
          className="notification-popover"
          role="dialog"
          aria-label="通知预览"
        >
          <div>
            <strong>通知</strong>
            <button
              type="button"
              aria-label="关闭通知"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <p>通知服务正在接入</p>
          <small>当前没有真实未读数或通知数据。</small>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
          >
            查看全部通知
          </button>
        </div>
      )}
    </div>
  );
}

export function NotificationsPage({
  notifications = [],
}: {
  notifications?: NotificationSummary[];
}) {
  return (
    <section className="portal-page notifications-page">
      <div className="portal-heading">
        <div>
          <p className="eyebrow">消息提醒</p>
          <h1>通知</h1>
        </div>
      </div>
      <div className="filter-tabs" role="tablist" aria-label="通知分类">
        {['全部', '系统', '比赛', '作业', '社交'].map((item, index) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={index === 0}
          >
            {item}
          </button>
        ))}
      </div>
      {notifications.length ? (
        <ul className="notification-list">
          {notifications.map((item) => (
            <li key={item.id} className={item.read ? '' : 'unread'}>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
              <time>{item.createdAt}</time>
              {!item.read && <span>未读</span>}
            </li>
          ))}
        </ul>
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

export function MessagesExperience({
  conversations = [],
  messages = [],
  friends = [],
  requests = [],
}: {
  conversations?: ConversationSummary[];
  messages?: Message[];
  friends?: FriendSummary[];
  requests?: FriendRequest[];
}) {
  const [mode, setMode] = useState<
    'conversations' | 'contacts' | 'requests' | 'add'
  >('conversations');
  const [selected, setSelected] = useState<string | null>(null);
  const [conversationQuery, setConversationQuery] = useState('');
  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selected),
    [conversations, selected],
  );
  const visibleConversations = useMemo(() => {
    const query = conversationQuery.trim().toLocaleLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) =>
      [
        conversation.peer.displayName,
        conversation.peer.username,
        conversation.lastMessage ?? '',
      ].some((value) => value.toLocaleLowerCase().includes(query)),
    );
  }, [conversationQuery, conversations]);
  return (
    <section className="messages-page">
      <header className="messages-heading">
        <div>
          <p className="eyebrow">站内通讯</p>
          <h1>通讯中心</h1>
        </div>
        <div className="message-modes" role="tablist" aria-label="通讯中心视图">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'conversations'}
            onClick={() => setMode('conversations')}
          >
            会话
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'contacts'}
            onClick={() => setMode('contacts')}
          >
            通讯录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'requests'}
            onClick={() => setMode('requests')}
          >
            新的朋友
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'add'}
            onClick={() => setMode('add')}
          >
            添加好友
          </button>
        </div>
      </header>
      {mode === 'add' ? (
        <AddFriend />
      ) : mode === 'requests' ? (
        <FriendRequests requests={requests} />
      ) : mode === 'contacts' ? (
        <Contacts friends={friends} />
      ) : (
        <div className={`messenger-shell ${selected ? 'show-chat' : ''}`}>
          <aside className="conversation-pane" aria-label="会话列表">
            <div className="conversation-pane-header">
              <h2>最近会话</h2>
              <label className="conversation-search">
                <span className="sr-only">搜索会话</span>
                <input
                  type="search"
                  value={conversationQuery}
                  onChange={(event) => setConversationQuery(event.target.value)}
                  placeholder="搜索会话"
                />
              </label>
            </div>
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
                  : '暂无会话。通讯后端接入后，真实会话会显示在这里。'}
              </p>
            )}
          </aside>
          <section className="chat-pane" aria-label="聊天内容">
            {selectedConversation ? (
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
                <div className="message-stream">
                  {messages
                    .filter((message) => message.conversationId === selected)
                    .map((message) => (
                      <p key={message.id} className="message-bubble">
                        {message.content}
                        <time>{message.sentAt}</time>
                      </p>
                    ))}
                </div>
                <form className="message-composer">
                  <label>
                    <span className="sr-only">输入消息</span>
                    <textarea
                      disabled
                      placeholder="消息服务正在接入"
                      rows={2}
                    />
                  </label>
                  <button type="button" disabled>
                    发送
                  </button>
                </form>
              </>
            ) : (
              <div className="no-conversation">
                <strong>选择一个会话</strong>
                <p>当前没有已选择的聊天。消息不会在本地伪造或持久化。</p>
                <code>MESSAGING-BACKEND-INTEGRATION-REQUEST</code>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function Contacts({ friends }: { friends: FriendSummary[] }) {
  return (
    <div className="contacts-layout">
      <nav aria-label="通讯录分类">
        <button type="button" className="active">
          我的好友
        </button>
        <button type="button">团队联系人</button>
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
              </li>
            ))}
          </ul>
        ) : (
          <CapabilityNotice
            title="好友服务正在接入"
            text="当前没有真实好友列表。"
            request="SOCIAL-GRAPH-BACKEND-INTEGRATION-REQUEST"
          />
        )}
      </section>
    </div>
  );
}

function AddFriend() {
  return (
    <section className="social-panel">
      <h2>添加好友</h2>
      <p>通过用户名或 UID 查找用户。</p>
      <label>
        用户名或 UID
        <input disabled placeholder="好友搜索后端尚未接入" />
      </label>
      <label>
        好友申请说明
        <textarea disabled rows={3} />
      </label>
      <div className="control-group">
        <button type="button" disabled>
          搜索并添加
        </button>
      </div>
      <CapabilityNotice
        title="好友服务正在接入"
        text="搜索、申请发送、屏蔽与举报必须由后端授权并限流。"
        request="SOCIAL-GRAPH-BACKEND-INTEGRATION-REQUEST"
      />
    </section>
  );
}

function FriendRequests({ requests }: { requests: FriendRequest[] }) {
  return (
    <div className="request-columns">
      <section>
        <h2>收到的申请</h2>
        {requests.filter((request) => request.direction === 'RECEIVED')
          .length ? (
          <p>{requests.length} 条申请</p>
        ) : (
          <p>暂无收到的申请</p>
        )}
        <div className="control-group">
          <button type="button" disabled>
            接受
          </button>
          <button type="button" className="secondary" disabled>
            拒绝
          </button>
        </div>
      </section>
      <section>
        <h2>发出的申请</h2>
        <p>暂无发出的申请</p>
        <div className="control-group">
          <button type="button" className="secondary" disabled>
            取消申请
          </button>
        </div>
      </section>
      <CapabilityNotice
        title="好友申请服务正在接入"
        text="申请状态必须由后端持久化并执行隐私、屏蔽和反滥用规则。"
        request="SOCIAL-GRAPH-BACKEND-INTEGRATION-REQUEST"
      />
    </div>
  );
}
