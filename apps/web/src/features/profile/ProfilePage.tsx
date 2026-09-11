import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { ApiError } from '../../services/api.js';
import type {
  ApiClient,
  AuthenticatedUser,
  FavoriteProblem,
  ProfileCapability,
  ProfileCapabilities,
  ProfileOverview,
  ProfileProblem,
  ProfileSubmission,
  PublicProfile,
  SolvedProblem,
} from '../../services/api.js';
import type { UserActivityDay } from '../../services/portal-contracts.js';
import './ProfilePage.css';
import type { ProfileDevelopmentFixture } from './profileDevelopmentFixture.js';

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

function CapabilityNotice({
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

export function ActivityHeatmap({
  days,
}: {
  days?: UserActivityDay[] | undefined;
}) {
  const heatmapRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    day: UserActivityDay;
    anchor: HTMLSpanElement;
    left: number;
    top: number;
  }>();
  const updateTooltipPosition = useCallback(() => {
    if (!tooltip || !heatmapRef.current) return;
    const blockRect = heatmapRef.current.getBoundingClientRect();
    const anchorRect = tooltip.anchor.getBoundingClientRect();
    const tooltipHalfWidth = 120;
    const rawLeft = anchorRect.left - blockRect.left + anchorRect.width / 2;
    const left = Math.min(
      Math.max(rawLeft, tooltipHalfWidth),
      Math.max(tooltipHalfWidth, blockRect.width - tooltipHalfWidth),
    );
    const top = anchorRect.bottom - blockRect.top + 8;
    setTooltip((current) =>
      current && (current.left !== left || current.top !== top)
        ? { ...current, left, top }
        : current,
    );
  }, [tooltip]);

  useEffect(() => {
    if (!tooltip) return;
    updateTooltipPosition();
    window.addEventListener('resize', updateTooltipPosition);
    window.addEventListener('scroll', updateTooltipPosition, true);
    return () => {
      window.removeEventListener('resize', updateTooltipPosition);
      window.removeEventListener('scroll', updateTooltipPosition, true);
    };
  }, [tooltip, updateTooltipPosition]);

  if (!days)
    return (
      <CapabilityNotice
        title="暂无可用做题统计"
        text="当前没有按日 solved problems 或 submissions 聚合 API。"
        request="PROFILE-ACTIVITY-BACKEND-INTEGRATION-REQUEST"
      />
    );
  const emptyDays = emptyActivityDays();
  const byDate = new Map(days.map((day) => [day.date, day]));
  const displayDays = emptyDays.map((day) => byDate.get(day.date) ?? day);
  const count = (day: UserActivityDay) => day.submissionCount ?? day.count ?? 0;
  const max = Math.max(1, ...displayDays.map(count));
  const total = displayDays.reduce((sum, day) => sum + count(day), 0);
  const showTooltip = (day: UserActivityDay, anchor: HTMLSpanElement) => {
    const blockRect = heatmapRef.current?.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    if (!blockRect) return;
    const tooltipHalfWidth = 120;
    const rawLeft = anchorRect.left - blockRect.left + anchorRect.width / 2;
    const left = Math.min(
      Math.max(rawLeft, tooltipHalfWidth),
      Math.max(tooltipHalfWidth, blockRect.width - tooltipHalfWidth),
    );
    setTooltip({
      day,
      anchor,
      left,
      top: anchorRect.bottom - blockRect.top + 8,
    });
  };
  return (
    <div className="heatmap-block" ref={heatmapRef}>
      <div className="heatmap-summary" role="status">
        最近一年共 {total} 次提交，共{' '}
        {displayDays.filter((day) => count(day) > 0).length} 个活跃日。
      </div>
      <div className="heatmap-scroll">
        <div className="heatmap-grid" aria-label="做题情况热力图">
          {displayDays.map((day) => (
            <span
              key={day.date}
              className="heatmap-day"
              style={{ '--heat': count(day) / max } as CSSProperties}
              title={`${day.date}：提交 ${count(day)} 次，AC ${day.acceptedCount ?? 0} 次`}
              aria-label={`${day.date}，提交 ${count(day)} 次，AC ${day.acceptedCount ?? 0} 次`}
              tabIndex={0}
              onMouseEnter={(event) => showTooltip(day, event.currentTarget)}
              onMouseLeave={() => setTooltip(undefined)}
              onFocus={(event) => showTooltip(day, event.currentTarget)}
              onBlur={() => setTooltip(undefined)}
            />
          ))}
        </div>
      </div>
      {tooltip ? (
        <div
          className="heatmap-tooltip"
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          <strong>{tooltip.day.date}</strong>
          <span>提交：{count(tooltip.day)} 次</span>
          <span>通过：{tooltip.day.acceptedCount ?? 0} 次</span>
        </div>
      ) : null}
    </div>
  );
}

function emptyActivityDays() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: 365 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (364 - index));
    return {
      date: date.toISOString().slice(0, 10),
      submissionCount: 0,
      acceptedCount: 0,
      metric: 'SUBMISSIONS' as const,
    };
  });
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

export function ProfilePage({
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
  const [submissionItems, setSubmissionItems] = useState<ProfileSubmission[]>(
    [],
  );
  const [submissionsLoaded, setSubmissionsLoaded] = useState(false);
  const [submissionsError, setSubmissionsError] = useState('');
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
  const [profileActivityDays, setProfileActivityDays] =
    useState<UserActivityDay[]>();
  const [profileActivityLoading, setProfileActivityLoading] = useState(false);
  const [profileActivityError, setProfileActivityError] = useState('');
  const [developmentFixture, setDevelopmentFixture] =
    useState<ProfileDevelopmentFixture>();
  const demoMode = developmentFixture !== undefined;
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
    if (
      !api ||
      !profileUsername ||
      !capabilities ||
      typeof api.profileActivity !== 'function'
    )
      return;
    if (!capabilities.activity?.available) return;
    let active = true;
    setProfileActivityLoading(true);
    setProfileActivityError('');
    void api
      .profileActivity(profileUsername)
      .then((result) => {
        if (!active) return;
        setProfileActivityDays(result.days);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setProfileActivityDays(undefined);
        setProfileActivityError(profileErrorText(error, '做题热力图'));
      })
      .finally(() => active && setProfileActivityLoading(false));
    return () => {
      active = false;
    };
  }, [api, capabilities, profileRefresh, profileUsername]);

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

  const loadSubmissions = useCallback(() => {
    if (!api || !profileUsername || !profileApi?.profileSubmissions || demoMode)
      return;
    setSubmissionsError('');
    void profileApi
      .profileSubmissions(profileUsername)
      .then((result) => {
        setSubmissionItems(result.items);
        setSubmissionsLoaded(true);
      })
      .catch((error: unknown) =>
        setSubmissionsError(profileErrorText(error, 'Submission history')),
      );
  }, [api, demoMode, profileApi, profileUsername]);

  useEffect(() => {
    if (!submissionsLoaded && !demoMode) loadSubmissions();
  }, [demoMode, loadSubmissions, submissionsLoaded]);

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

  const displayedProfile = developmentFixture?.profile ?? publicProfile;
  const activeCapabilities = displayedProfile?.capabilities ?? capabilities;
  const displayName = demoMode
    ? developmentFixture!.profile.displayName
    : isPublic
      ? publicProfile?.displayName
      : user?.displayName;
  const displayUsername = demoMode
    ? developmentFixture!.profile.username
    : isPublic
      ? publicProfile?.username
      : user?.username;
  const capability = (key: keyof ProfileCapabilities) => {
    if (!activeCapabilities || key === 'contractVersion') return undefined;
    return activeCapabilities[key];
  };
  const activityCapability = capability('activity');
  const showLegacyActivity = !api && Boolean(activity);

  const renderActivity = () => {
    if (demoMode)
      return <ActivityHeatmap days={developmentFixture!.activity} />;
    if (showLegacyActivity)
      return <ActivityHeatmap days={profileActivityDays ?? activity} />;
    if (api && profileActivityLoading)
      return (
        <p className="muted" role="status">
          正在加载做题热力图…
        </p>
      );
    if (api && profileActivityError)
      return (
        <ProfileLoadError
          text={profileActivityError}
          onRetry={() => setProfileRefresh((value) => value + 1)}
        />
      );
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
    if (demoMode)
      return (
        <div className="profile-data-panel">
          <p className="profile-fixture-label">DEVELOPMENT FIXTURE DATA</p>
          <ul className="profile-data-list">
            {developmentFixture!.favorites.map((item) => (
              <li key={item.problemId}>
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    {item.slug} · {profileDate(item.favoritedAt)}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      );
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

  const renderSubmissions = () => {
    const items = demoMode ? developmentFixture!.submissions : submissionItems;
    if (!demoMode && (!api || !profileApi?.profileSubmissions)) return null;
    if (!demoMode && submissionsError)
      return (
        <ProfileLoadError text={submissionsError} onRetry={loadSubmissions} />
      );
    if (!demoMode && !submissionsLoaded)
      return (
        <p className="muted" role="status">
          Loading submission history…
        </p>
      );
    return (
      <div className="profile-submission-panel">
        <div className="section-heading-inline">
          <h3>Recent submissions</h3>
          {demoMode && (
            <span className="profile-fixture-label">
              DEVELOPMENT FIXTURE DATA
            </span>
          )}
        </div>
        {items.length ? (
          <ul className="profile-data-list">
            {items.map((item) => (
              <li key={item.id}>
                <div>
                  <PortalLink to={`/problems/${item.slug}`} navigate={navigate}>
                    <strong>{item.title}</strong>
                  </PortalLink>
                  <small>
                    {item.languageId} · {item.status} ·{' '}
                    {profileDate(item.createdAt)}
                  </small>
                </div>
                <span
                  className={`profile-verdict profile-verdict-${item.verdict ?? 'pending'}`}
                >
                  {item.verdict ?? item.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No public submissions to display.</p>
        )}
      </div>
    );
  };

  const renderSolved = () => {
    if (!api) return renderActivity();
    if (solvedError)
      return <ProfileLoadError text={solvedError} onRetry={loadSolved} />;
    const items = demoMode ? developmentFixture!.solved : solvedItems;
    const loaded = demoMode || solvedLoaded;
    return (
      <>
        {renderActivity()}
        {renderSubmissions()}
        {!loaded ? (
          <p className="muted" role="status">
            正在加载已解决题目…
          </p>
        ) : items.length ? (
          <ul className="profile-data-list">
            {items.map((item) => (
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
        )}
      </>
    );
  };

  const renderProblems = () => {
    if (demoMode)
      return (
        <div className="profile-data-panel">
          <p className="profile-fixture-label">DEVELOPMENT FIXTURE DATA</p>
          <ul className="profile-data-list">
            {developmentFixture!.problems.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    {item.status} · {item.visibility} ·{' '}
                    {profileDate(item.updatedAt)}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      );
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
      if (!demoMode && overviewError)
        return (
          <ProfileLoadError
            text={overviewError}
            onRetry={() => setProfileRefresh((value) => value + 1)}
          />
        );
      const displayedOverview = demoMode
        ? developmentFixture!.overview
        : overview;
      if (!displayedOverview)
        return (
          <p className="muted" role="status">
            正在加载概览…
          </p>
        );
      const metrics = [
        ['创建题目', displayedOverview.createdProblemCount],
        ['已解决题目', displayedOverview.solvedProblemCount],
        ['总提交', displayedOverview.submissionCount],
        ['AC 提交', displayedOverview.acceptedSubmissionCount],
        ...(displayedOverview.favoriteCount === undefined
          ? []
          : [['收藏', displayedOverview.favoriteCount] as const]),
      ];
      const capabilityCards = [
        ['收藏', activeCapabilities?.favorites],
        ['做题活动', activeCapabilities?.activity],
        ['团队', activeCapabilities?.teams],
        ['题目管理', activeCapabilities?.myProblems],
      ].filter((entry): entry is [string, ProfileCapability] =>
        Boolean(entry[1]),
      );
      return (
        <>
          {demoMode && (
            <p className="profile-fixture-label">DEVELOPMENT FIXTURE DATA</p>
          )}
          <div className="profile-overview-grid">
            {metrics.map(([label, value]) => (
              <section key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </section>
            ))}
          </div>
          {capabilityCards.length ? (
            <div
              className="profile-capability-grid"
              aria-label="Profile capabilities"
            >
              {capabilityCards.map(([label, item]) => (
                <section key={label}>
                  <strong>{label}</strong>
                  <span>
                    {item.available ? 'Available' : profileReason(item.reason)}
                  </span>
                </section>
              ))}
            </div>
          ) : null}
        </>
      );
    }
    if (tab === '做题记录') return renderSolved();
    if (tab === '收藏') return renderFavorites();
    if (tab === '我的题目') return renderProblems();
    if (tab === '团队') {
      const teams = displayedProfile?.teams ?? [];
      return teams.length ? (
        <div className="profile-team-list">
          {teams.map((team) => (
            <PortalLink
              key={team.slug}
              to={`/teams/${encodeURIComponent(team.slug)}`}
              navigate={navigate}
            >
              <article className="profile-team-card">
                <strong>{team.name}</strong>
                <span>@{team.slug}</span>
                <small>
                  {team.role} · {team.visibility === 'PUBLIC' ? '公开' : '私有'}
                </small>
                {team.description && <p>{team.description}</p>}
              </article>
            </PortalLink>
          ))}
        </div>
      ) : (
        <p className="muted">
          {isPublic ? '暂无可展示团队' : '暂未加入公开团队'}
        </p>
      );
    }
    return null;
  };

  return (
    <section className="profile-v4">
      <div className="profile-cover" aria-label="OJPlatform 默认个人主页封面">
        {displayedProfile?.backgroundUrl && (
          <img src={displayedProfile.backgroundUrl} alt="个人主页背景" />
        )}
        <span>OJPlatform</span>
      </div>
      <div className="profile-identity">
        <div className="profile-identity-main">
          {displayedProfile?.avatarUrl ? (
            <img
              className="profile-avatar"
              src={displayedProfile.avatarUrl}
              alt="头像"
            />
          ) : (
            <div className="profile-avatar" aria-label="默认头像">
              {displayName?.slice(0, 1).toUpperCase() ?? 'OJ'}
            </div>
          )}
          <h1>{displayName ?? '个人主页'}</h1>
          <p>
            {displayUsername ? `@${displayUsername}` : '公开资料服务正在接入'}
          </p>
          {displayedProfile?.headline && (
            <p className="profile-headline">{displayedProfile.headline}</p>
          )}
          <p className="profile-meta">
            {[displayedProfile?.location, displayedProfile?.organization]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {displayedProfile?.bio && (
            <p className="profile-bio">{displayedProfile.bio}</p>
          )}
          <p className="profile-joined">
            {demoMode || isPublic
              ? `加入于 ${profileDate(displayedProfile?.createdAt ?? '')}`
              : user
                ? '公开资料'
                : '登录后可查看自己的真实账户资料。'}
          </p>
        </div>
        {!demoMode && !isPublic && user && (
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
      {import.meta.env.DEV && (
        <div className="profile-demo-control">
          <span>
            {demoMode
              ? 'Development fixture data is active.'
              : 'Local development preview only.'}
          </span>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (developmentFixture) {
                setDevelopmentFixture(undefined);
                return;
              }
              void import(
                /* @vite-ignore */ './profileDevelopmentFixture.js'
              ).then(({ PROFILE_DEVELOPMENT_FIXTURE }) => {
                setDevelopmentFixture(PROFILE_DEVELOPMENT_FIXTURE);
              });
            }}
          >
            {demoMode ? 'Use live profile data' : 'Preview development fixture'}
          </button>
        </div>
      )}
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
