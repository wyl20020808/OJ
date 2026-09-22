import { useMemo, useState, type ReactNode } from 'react';
import type { ContestListItem } from '../../services/portal-contracts.js';
import './ContestPage.css';

type Navigate = (path: string) => void;

function ContestLink({
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

type ContestLandingIconName =
  | 'arrow'
  | 'calendar'
  | 'clock'
  | 'code'
  | 'medal'
  | 'people'
  | 'tag'
  | 'trophy';

function ContestLandingIcon({ name }: { name: ContestLandingIconName }) {
  const paths: Record<ContestLandingIconName, ReactNode> = {
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    code: <path d="m8 9-3 3 3 3m8-6 3 3-3 3m-2-9-4 12" />,
    medal: (
      <>
        <circle cx="12" cy="14" r="5" />
        <path d="m9 9-3-7h4l2 4 2-4h4l-3 7m-5 5 1.3 1.3L14 12.7" />
      </>
    ),
    people: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    tag: (
      <>
        <path d="M20 13 13 20a2 2 0 0 1-3 0l-6-6a2 2 0 0 1 0-3l7-7h7l2 2v7Z" />
        <circle cx="15" cy="9" r="1" />
      </>
    ),
    trophy: (
      <>
        <path d="M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
        <path d="M7 6H3v2a4 4 0 0 0 5 4m9-6h4v2a4 4 0 0 1-5 4" />
      </>
    ),
  };
  return (
    <svg
      className="contest-landing-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

type LifecycleFilter = 'ALL' | 'RUNNING' | 'UPCOMING' | 'ENDED';

const statusText = (lifecycle: ContestListItem['lifecycle']) => {
  if (lifecycle === 'RUNNING') return '进行中';
  if (lifecycle === 'UPCOMING') return '即将开始';
  if (lifecycle === 'ENDED') return '已结束';
  if (lifecycle === 'CANCELLED') return '已取消';
  return '草稿';
};

const dateTime = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function dateRange(contest: ContestListItem) {
  const startsAt = new Date(contest.startsAt);
  const endsAt = new Date(contest.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()))
    return '时间待确认';
  return `${dateTime.format(startsAt)} - ${dateTime.format(endsAt)}`;
}

function remaining(contest: ContestListItem) {
  if (contest.lifecycle === 'CANCELLED') return '比赛已取消';
  if (contest.lifecycle === 'DRAFT') return '尚未发布';
  const target = new Date(
    contest.lifecycle === 'RUNNING' ? contest.endsAt : contest.startsAt,
  ).getTime();
  const difference = target - Date.now();
  if (contest.lifecycle === 'ENDED' || difference <= 0) return '比赛已结束';
  const hours = Math.floor(difference / 3_600_000);
  const minutes = Math.max(1, Math.floor((difference % 3_600_000) / 60_000));
  if (contest.lifecycle === 'RUNNING')
    return hours >= 24
      ? `剩余 ${Math.floor(hours / 24)} 天`
      : `剩余 ${hours} 小时 ${minutes} 分`;
  return hours >= 24
    ? `${Math.floor(hours / 24)} 天后开始`
    : `${hours} 小时 ${minutes} 分后开始`;
}

function ContestCard({
  contest,
  index,
  navigate,
}: {
  contest: ContestListItem;
  index: number;
  navigate: Navigate;
}) {
  const status = statusText(contest.lifecycle);
  const action =
    contest.lifecycle === 'RUNNING'
      ? '进入比赛'
      : contest.registrationState === 'REGISTERED'
        ? '已报名 · 查看'
        : '查看比赛';
  return (
    <ContestLink
      to={`/contests/${contest.id}`}
      navigate={navigate}
      className={`contest-showcase-card contest-showcase-card-${(index % 6) + 1}`}
    >
      <article role="listitem">
        <header>
          <span className="contest-source">
            {contest.organizer?.displayName || 'OJPlatform'}
          </span>
          <span className={`contest-status contest-status-${status}`}>
            {status}
          </span>
        </header>
        <h3 title={contest.title}>{contest.title}</h3>
        <p title={contest.description}>
          {contest.description ||
            (contest.format ? `${contest.format} 赛制比赛` : '比赛信息待公布')}
        </p>
        <time dateTime={contest.startsAt}>
          <ContestLandingIcon name="calendar" />
          {dateRange(contest)}
        </time>
        <small className="contest-countdown">{remaining(contest)}</small>
        <footer>
          <span>
            <ContestLandingIcon name="people" />
            {contest.participantCount === undefined
              ? '人数统计中'
              : `${contest.participantCount.toLocaleString('zh-CN')} 人`}
          </span>
          <span>
            {contest.problemCount === undefined
              ? '题目待公布'
              : `${contest.problemCount} 题`}
          </span>
          <span>{contest.format ?? '赛制待公布'}</span>
          <b>{action}</b>
        </footer>
        <span className="contest-lifecycle-code">{contest.lifecycle}</span>
      </article>
    </ContestLink>
  );
}

const sections = [
  ['RUNNING', '正在进行', '正在开放的比赛', 'trophy'],
  ['UPCOMING', '即将开始', '报名与赛前准备', 'clock'],
  ['ENDED', '历史比赛', '最近结束的比赛', 'medal'],
  ['DRAFT', '草稿比赛', '尚未发布的比赛', 'code'],
  ['CANCELLED', '已取消', '已取消的比赛', 'calendar'],
] as const;

export function ContestPage({
  view,
  contests,
  navigate,
  loading,
  error,
  onRetry,
}: {
  view: 'list' | 'mine';
  contests: ContestListItem[];
  navigate: Navigate;
  loading: boolean;
  error?: string | undefined;
  onRetry?: (() => void) | undefined;
}) {
  const [filter, setFilter] = useState<LifecycleFilter>('ALL');
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    return contests.filter(
      (contest) =>
        (filter === 'ALL' || contest.lifecycle === filter) &&
        (!normalized ||
          `${contest.title} ${contest.description ?? ''} ${contest.organizer?.displayName ?? ''}`
            .toLocaleLowerCase('zh-CN')
            .includes(normalized)),
    );
  }, [contests, filter, query]);
  const counts = {
    running: contests.filter(({ lifecycle }) => lifecycle === 'RUNNING').length,
    upcoming: contests.filter(({ lifecycle }) => lifecycle === 'UPCOMING')
      .length,
    ended: contests.filter(({ lifecycle }) => lifecycle === 'ENDED').length,
  };
  const totalParticipants = contests.reduce(
    (total, contest) => total + (contest.participantCount ?? 0),
    0,
  );
  const upcoming = contests
    .filter(({ lifecycle }) => lifecycle === 'UPCOMING')
    .slice(0, 6);
  const overviewUnavailable = loading || Boolean(error);

  return (
    <section className="contest-landing">
      <div className="contest-landing-hero">
        <div className="contest-landing-hero-copy">
          <p>用代码探索更大的世界</p>
          <h1>在比赛中，遇见更强的自己</h1>
          <div className="contest-landing-lede">
            <span aria-hidden="true" />
            <p>
              参与多样化的算法竞赛，与开发者同台竞技。
              <br />
              在挑战中学习，在交流中成长。
            </p>
          </div>
          <button type="button" onClick={() => navigate('/contests/new')}>
            创建比赛 <ContestLandingIcon name="arrow" />
          </button>
        </div>
        <blockquote>
          以赛会友
          <br />
          码向更远
        </blockquote>
      </div>

      <div className="contest-overview-strip" aria-label="比赛概览">
        <article>
          <ContestLandingIcon name="trophy" />
          <span>
            <strong>{overviewUnavailable ? '—' : counts.running}</strong>
            正在进行
          </span>
        </article>
        <article>
          <ContestLandingIcon name="clock" />
          <span>
            <strong>{overviewUnavailable ? '—' : counts.upcoming}</strong>
            即将开始
          </span>
        </article>
        <article>
          <ContestLandingIcon name="medal" />
          <span>
            <strong>{overviewUnavailable ? '—' : counts.ended}</strong>历史比赛
          </span>
        </article>
        <article>
          <ContestLandingIcon name="people" />
          <span>
            <strong>
              {overviewUnavailable
                ? '—'
                : totalParticipants.toLocaleString('zh-CN')}
            </strong>
            累计报名记录
          </span>
        </article>
      </div>

      <div className="contest-landing-layout">
        <div className="contest-featured-panel">
          <header className="contest-featured-heading">
            <div>
              <h2>
                <ContestLandingIcon name="code" />
                比赛中心
              </h2>
              <p>
                {view === 'mine'
                  ? '查看我创建、管理或报名的比赛'
                  : '实时赛程来自 OJPlatform 比赛服务'}
              </p>
            </div>
            <ContestLink
              to="/contests/new"
              navigate={navigate}
              className="contest-heading-create"
            >
              新建比赛
            </ContestLink>
          </header>
          <div className="contest-filter-row">
            <div className="contest-nav-bar">
              <nav className="contest-internal-nav" aria-label="比赛状态筛选">
                {(
                  [
                    ['ALL', '全部'],
                    ['RUNNING', '进行中'],
                    ['UPCOMING', '即将开始'],
                    ['ENDED', '已结束'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={filter === value ? 'active' : ''}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>
            <label className="contest-search-field">
              <span className="sr-only">搜索比赛</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、主题或主办方"
              />
            </label>
          </div>

          {loading ? (
            <div className="contest-landing-state" role="status">
              正在加载比赛数据…
            </div>
          ) : error ? (
            <div
              className="contest-landing-state contest-landing-error"
              role="alert"
            >
              <strong>{error}</strong>
              {onRetry && (
                <button type="button" onClick={onRetry}>
                  重试
                </button>
              )}
            </div>
          ) : visible.length ? (
            <div className="contest-section-list">
              {sections.map(([lifecycle, title, subtitle, icon]) => {
                const items = visible.filter(
                  (contest) => contest.lifecycle === lifecycle,
                );
                if (!items.length) return null;
                return (
                  <section
                    key={lifecycle}
                    className="contest-data-section"
                    aria-labelledby={`contest-${lifecycle.toLowerCase()}`}
                  >
                    <header>
                      <div>
                        <h2 id={`contest-${lifecycle.toLowerCase()}`}>
                          <ContestLandingIcon name={icon} />
                          {title}
                        </h2>
                        <p>{subtitle}</p>
                      </div>
                      <strong>{items.length} 场</strong>
                    </header>
                    <div className="contest-showcase-grid" role="list">
                      {items.map((contest, index) => (
                        <ContestCard
                          key={contest.id}
                          contest={contest}
                          index={index}
                          navigate={navigate}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="contest-landing-state">没有找到匹配的比赛。</div>
          )}

          <div className="contest-tags">
            <h2>
              <ContestLandingIcon name="tag" />
              主题快捷筛选
            </h2>
            <p>从真实比赛简介中筛选</p>
            <div>
              {[
                '入门',
                '周赛',
                '动态规划',
                '图论',
                '数据结构',
                '字符串',
                '数学',
                '排位赛',
              ].map((tag) => (
                <button key={tag} type="button" onClick={() => setQuery(tag)}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="contest-landing-aside">
          <section className="contest-upcoming-card">
            <header>
              <h2>
                <ContestLandingIcon name="clock" />
                近期赛程
              </h2>
            </header>
            {loading ? (
              <p className="contest-aside-empty" role="status">
                正在加载近期赛程…
              </p>
            ) : error ? (
              <p className="contest-aside-empty">近期赛程暂不可用</p>
            ) : upcoming.length ? (
              <ul>
                {upcoming.map((contest) => (
                  <li key={contest.id}>
                    <span>{contest.format ?? '赛制待公布'}</span>
                    <ContestLink
                      to={`/contests/${contest.id}`}
                      navigate={navigate}
                    >
                      {contest.title}
                    </ContestLink>
                    <time dateTime={contest.startsAt}>
                      {dateTime.format(new Date(contest.startsAt))}
                    </time>
                    <b className="contest-status-即将开始">
                      {remaining(contest)}
                    </b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="contest-aside-empty">暂无即将开始的比赛</p>
            )}
          </section>
          <section className="contest-trust-card">
            <ContestLandingIcon name="code" />
            <h2>真实数据同步</h2>
            <p>
              赛程、题目数、参赛人数和主办方均由 Contest API 与 PostgreSQL
              提供。
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}
