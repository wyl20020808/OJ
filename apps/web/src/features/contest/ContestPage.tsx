import { useState, type ReactNode } from 'react';
import type { ApiClient } from '../../services/api.js';
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
  | 'desktop'
  | 'flame'
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
    desktop: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8m-4-4v4" />
      </>
    ),
    flame: (
      <path d="M12 22c4 0 7-3 7-7 0-3-2-6-5-9 0 3-2 4-3 5 0-3-1-6-3-9 0 4-3 7-3 12 0 5 3 8 7 8Z" />
    ),
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

type ContestShowcaseItem = {
  id: string;
  source: '本站' | 'Codeforces' | 'AtCoder' | '牛客' | '洛谷';
  title: string;
  subtitle: string;
  time: string;
  status: '报名中' | '进行中' | '未开始' | '已结束';
  participants: string;
  division: string;
  problems: string;
  action: string;
  lifecycle: ContestListItem['lifecycle'];
};

const contestShowcase: ContestShowcaseItem[] = [
  {
    id: 'algooj-invitational',
    source: '本站',
    title: 'AlgoOJ 本站邀请赛',
    subtitle: '与优秀的你，一起挑战更高',
    time: '2024-10-14 19:00 - 21:00',
    status: '报名中',
    participants: '1,234 人已报名',
    division: 'Div.2',
    problems: '4 题',
    action: '立即报名',
    lifecycle: 'UPCOMING',
  },
  {
    id: 'codeforces-970',
    source: 'Codeforces',
    title: 'Codeforces Round 970',
    subtitle: 'Good luck and have fun!',
    time: '2024-10-28 17:35 - 22:35',
    status: '进行中',
    participants: '643 人已参加',
    division: 'Div.1',
    problems: '6 题',
    action: '进入比赛',
    lifecycle: 'RUNNING',
  },
  {
    id: 'atcoder-378',
    source: 'AtCoder',
    title: 'AtCoder Beginner Contest 378',
    subtitle: "Let's enjoy programming!",
    time: '2024-10-21 14:00 - 17:00',
    status: '报名中',
    participants: '856 人已报名',
    division: 'Div.2',
    problems: '5 题',
    action: '立即报名',
    lifecycle: 'UPCOMING',
  },
  {
    id: 'nowcoder-89',
    source: '牛客',
    title: '牛客练习赛 No.89',
    subtitle: '以练促学，提升自我',
    time: '2024-11-04 19:00 - 23:00',
    status: '未开始',
    participants: '320 人已报名',
    division: 'Div.1',
    problems: '8 题',
    action: '关注比赛',
    lifecycle: 'UPCOMING',
  },
  {
    id: 'luogu-open-2024',
    source: '洛谷',
    title: '洛谷公开赛 2024',
    subtitle: '汇聚热爱，竞逐未来',
    time: '2024-11-10 20:00 - 23:00',
    status: '未开始',
    participants: '412 人已报名',
    division: 'Div.2',
    problems: '6 题',
    action: '预约提醒',
    lifecycle: 'UPCOMING',
  },
  {
    id: 'algooj-autumn',
    source: '本站',
    title: 'AlgoOJ 秋季挑战赛',
    subtitle: '算法无界，勇攀高峰',
    time: '2024-11-11 19:00 - 21:00',
    status: '未开始',
    participants: '287 人已报名',
    division: 'Div.2',
    problems: '4 题',
    action: '关注比赛',
    lifecycle: 'UPCOMING',
  },
];

const sourceDescriptions = [
  ['本站赛事', 'AlgoOJ 官方赛事平台', 'desktop'],
  ['Codeforces', '全球知名的编程竞赛平台', 'medal'],
  ['AtCoder', '日本顶级算法竞赛平台', 'code'],
  ['牛客', '专注于程序员成长', 'flame'],
  ['洛谷', '面向青少年的编程社区', 'trophy'],
] as const;

const calendarDays = [
  '29',
  '30',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
  '31',
  '1',
  '2',
];

function contestLifecycleDisplay(lifecycle: ContestListItem['lifecycle']) {
  if (lifecycle === 'RUNNING') return '进行中';
  if (lifecycle === 'ENDED' || lifecycle === 'CANCELLED') return '已结束';
  return '报名中';
}

function contestTimeDisplay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace('/', '-');
}

export function ContestPage({
  view,
  contests,
  navigate,
  api,
  loading,
  error,
  onRetry,
}: {
  view: 'list' | 'mine';
  contests: ContestListItem[];
  navigate: Navigate;
  api?: ApiClient | undefined;
  loading: boolean;
  error?: string | undefined;
  onRetry?: (() => void) | undefined;
}) {
  const [source, setSource] = useState('全部');
  const [query, setQuery] = useState('');
  const [monthOffset, setMonthOffset] = useState(0);
  const actualItems = contests.map((contest, index): ContestShowcaseItem => {
    const fallback = contestShowcase[index % contestShowcase.length]!;
    return {
      ...fallback,
      id: contest.id,
      title: contest.title,
      time: contestTimeDisplay(contest.startsAt),
      status: contestLifecycleDisplay(contest.lifecycle),
      action: contest.lifecycle === 'RUNNING' ? '进入比赛' : '查看比赛',
      lifecycle: contest.lifecycle,
    };
  });
  const items = actualItems.length ? actualItems : contestShowcase;
  const visibleItems = items.filter(
    (item) =>
      (source === '全部' || item.source === source) &&
      (!query ||
        `${item.title} ${item.subtitle}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const monthLabel = monthOffset === 0 ? '2024 年 10 月' : '2024 年 11 月';

  return (
    <section className="contest-landing">
      <div className="contest-landing-hero">
        <div className="contest-landing-hero-copy">
          <p>用代码探索更大的世界</p>
          <h1>在比赛中，遇见更强的自己</h1>
          <div className="contest-landing-lede">
            <span aria-hidden="true" />
            <p>
              参与多样化的算法竞赛，与全球开发者同台竞技。
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
        <small>
          A BRIGHTER
          <br />
          TOMORROW
        </small>
      </div>

      <div className="contest-source-strip" aria-label="比赛平台">
        {sourceDescriptions.map(([title, description, icon], index) => (
          <button
            key={title}
            type="button"
            className={`contest-source-card contest-source-card-${index + 1}`}
            onClick={() => setSource(title === '本站赛事' ? '本站' : title)}
          >
            <span>
              <ContestLandingIcon name={icon} />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{description}</small>
            </span>
            <b aria-hidden="true">→</b>
          </button>
        ))}
      </div>

      <div className="contest-landing-layout">
        <div className="contest-featured-panel">
          <header className="contest-featured-heading">
            <div>
              <h2>
                <ContestLandingIcon name="trophy" />
                热门比赛
              </h2>
              <p>精选近期优质赛事，快来挑战吧！</p>
            </div>
            <button type="button" onClick={() => setSource('全部')}>
              查看更多比赛 <ContestLandingIcon name="arrow" />
            </button>
          </header>
          <div className="contest-filter-row">
            <div className="contest-nav-bar">
              <nav className="contest-internal-nav" aria-label="比赛导航">
                {['全部', '本站', 'Codeforces', 'AtCoder', '牛客', '洛谷'].map(
                  (item) => (
                    <button
                      key={item}
                      type="button"
                      className={source === item ? 'active' : ''}
                      onClick={() => setSource(item)}
                    >
                      {item}
                    </button>
                  ),
                )}
                {view === 'mine' && (
                  <span className="contest-mine-marker">我的比赛</span>
                )}
              </nav>
              <ContestLink
                to="/contests/new"
                navigate={navigate}
                className="contest-create-action"
              >
                新建比赛
              </ContestLink>
            </div>
            <label className="contest-search-field">
              <span className="sr-only">搜索比赛</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索比赛"
              />
            </label>
          </div>

          {loading ? (
            <div className="contest-landing-state" role="status">
              正在加载{view === 'mine' ? '比赛关系' : '比赛列表'}…
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
          ) : visibleItems.length ? (
            <div className="contest-showcase-grid" role="list">
              {visibleItems.map((contest, index) => (
                <ContestLink
                  key={contest.id}
                  to={`/contests/${contest.id}`}
                  navigate={navigate}
                  className={`contest-showcase-card contest-showcase-card-${(index % 6) + 1}`}
                >
                  <article role="listitem">
                    <header>
                      <span className="contest-source">{contest.source}</span>
                      <span
                        className={`contest-status contest-status-${contest.status}`}
                      >
                        {contest.status}
                      </span>
                    </header>
                    <h3>{contest.title}</h3>
                    <p>{contest.subtitle}</p>
                    <time>
                      <ContestLandingIcon name="calendar" />
                      {contest.time}
                    </time>
                    <footer>
                      <span>
                        <ContestLandingIcon name="people" />
                        {contest.participants}
                      </span>
                      <span>{contest.division}</span>
                      <span>{contest.problems}</span>
                      <b>{contest.action}</b>
                    </footer>
                    <span className="contest-lifecycle-code">
                      {contest.lifecycle}
                    </span>
                  </article>
                </ContestLink>
              ))}
            </div>
          ) : (
            <div className="contest-landing-state">没有找到匹配的比赛。</div>
          )}

          <div className="contest-tags">
            <h2>
              <ContestLandingIcon name="tag" />
              比赛标签
            </h2>
            <p>按主题发现你感兴趣的比赛</p>
            <div>
              {[
                '#入门友好',
                '#高难度',
                '#算法竞赛',
                '#数据结构',
                '#动态规划',
                '#图论',
                '#数学',
                '#贪心',
                '#字符串',
                '#模拟',
                '#团队合作',
                '#高校赛事',
              ].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setQuery(tag.slice(1))}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="contest-landing-aside">
          <section className="contest-calendar-card">
            <header>
              <h2>
                <ContestLandingIcon name="calendar" />
                比赛日历
              </h2>
              <button type="button">查看更多 →</button>
            </header>
            <div className="contest-calendar-month">
              <button
                type="button"
                aria-label="上个月"
                onClick={() => setMonthOffset(0)}
              >
                ‹
              </button>
              <strong>{monthLabel}</strong>
              <button
                type="button"
                aria-label="下个月"
                onClick={() => setMonthOffset(1)}
              >
                ›
              </button>
            </div>
            <div className="contest-calendar-grid">
              {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
                <strong key={day}>{day}</strong>
              ))}
              {calendarDays.map((day, index) => (
                <span
                  key={`${day}-${index}`}
                  className={
                    index === 15
                      ? 'today'
                      : index < 2 || index > 32
                        ? 'muted-day'
                        : ''
                  }
                >
                  {day}
                  {[9, 12, 16, 18, 21, 25, 30].includes(index) && <i />}
                </span>
              ))}
            </div>
            <div className="contest-calendar-legend">
              {['本站', 'Codeforces', 'AtCoder', '牛客', '洛谷'].map((item) => (
                <span key={item}>
                  <i />
                  {item}
                </span>
              ))}
            </div>
          </section>

          <section className="contest-upcoming-card">
            <header>
              <h2>
                <ContestLandingIcon name="clock" />
                近期比赛
              </h2>
              <button type="button">查看更多 →</button>
            </header>
            <ul>
              {contestShowcase.map((contest) => (
                <li key={contest.id}>
                  <span>{contest.source}</span>
                  <ContestLink
                    to={`/contests/${contest.id}`}
                    navigate={navigate}
                  >
                    {contest.title}
                  </ContestLink>
                  <time>{contest.time.split(' - ')[0]?.slice(5)}</time>
                  <b className={`contest-status-${contest.status}`}>
                    {contest.status}
                  </b>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <div className="contest-reference-footer">
        <p>
          <strong>AlgoOJ</strong>
          <span>让每一个热爱算法的人走得更远。</span>
        </p>
        <nav aria-label="页脚导航">
          <a href="#about">关于我们</a>
          <a href="#help">帮助中心</a>
          <a href="#terms">使用条款</a>
          <a href="#privacy">隐私政策</a>
          <a href="https://github.com" aria-label="GitHub">
            ◉
          </a>
          <a href="#contact" aria-label="联系我们">
            ✉
          </a>
        </nav>
      </div>
      {!api && (
        <span className="contest-demo-note sr-only">当前为前端展示数据</span>
      )}
    </section>
  );
}


