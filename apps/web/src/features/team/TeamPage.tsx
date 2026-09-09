import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ApiClient, TeamJoinRequest, TeamMember, TeamSummary } from '../../services/api.js';

type TeamView = 'mine' | 'joined' | 'discoverable';
type TeamPolicy = TeamSummary['joinPolicy'];
type TeamVisibility = TeamSummary['visibility'];

export function reconcileTeamLists(
  mine: TeamSummary[],
  discoverable: TeamSummary[],
) {
  const membershipIds = new Set(mine.map((team) => team.id));
  return {
    mine,
    discoverable: discoverable.filter((team) => !membershipIds.has(team.id)),
  };
}

export function appendTeamPage(
  current: TeamSummary[],
  incoming: TeamSummary[],
) {
  const known = new Set(current.map((team) => team.id));
  return [
    ...current,
    ...incoming.filter((team) => {
      if (known.has(team.id)) return false;
      known.add(team.id);
      return true;
    }),
  ];
}

const initial = (name: string) => name.trim().slice(0, 1).toUpperCase() || 'T';
const visibilityLabel = (value: TeamVisibility) =>
  value === 'PUBLIC' ? '公开' : '私有';
const policyLabel = (value: TeamPolicy) =>
  ({ OPEN: '自由加入', REQUEST: '申请加入', INVITE_ONLY: '仅邀请' })[value];

function TeamCard({
  team,
  navigate,
}: {
  team: TeamSummary;
  navigate: (path: string) => void;
}) {
  const path = `/teams/${team.slug}`;
  return (
    <article className="team-card">
      <a
        className="team-card-main"
        href={path}
        onClick={(event) => {
          event.preventDefault();
          navigate(path);
        }}
      >
        <span className="team-avatar" aria-hidden="true">
          {initial(team.name)}
        </span>
        <span className="team-card-copy">
          <strong>{team.name}</strong>
          <small>@{team.slug}</small>
          <span className="team-description">
            {team.description || '这个团队还没有填写简介。'}
          </span>
        </span>
      </a>
      <footer className="team-card-meta">
        <span>{team.memberCount ?? 0} 名成员</span>
        <span>{visibilityLabel(team.visibility)}</span>
        <span>{policyLabel(team.joinPolicy)}</span>
        {team.role && <strong className="team-role">{team.role}</strong>}
      </footer>
    </article>
  );
}

export function TeamPage({
  api,
  slug,
  user,
  navigate,
  create = false,
}: {
  api: ApiClient;
  slug?: string;
  user: { id: string } | null;
  navigate: (path: string) => void;
  create?: boolean;
}) {
  const [mine, setMine] = useState<TeamSummary[]>([]);
  const [discoverable, setDiscoverable] = useState<TeamSummary[]>([]);
  const [mineCursor, setMineCursor] = useState<string | undefined>();
  const [discoverableCursor, setDiscoverableCursor] = useState<
    string | undefined
  >();
  const [view, setView] = useState<TeamView>(user ? 'mine' : 'discoverable');
  const [query, setQuery] = useState('');
  const [team, setTeam] = useState<
    (TeamSummary & { membershipState: string }) | null
  >(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [joinRequestStatus, setJoinRequestStatus] = useState<TeamJoinRequest['status'] | null>(null);
  const [requests, setRequests] = useState<TeamJoinRequest[]>([]);
  const [requestError, setRequestError] = useState('');

  useEffect(() => {
    let live = true;
    setError('');
    setLoading(true);
    if (!slug) {
      void Promise.all([
        user
          ? api.myTeams()
          : Promise.resolve({
              items: [] as TeamSummary[],
              nextCursor: undefined,
            }),
        api.teams(),
      ])
        .then(([membership, publicTeams]) => {
          if (!live) return;
          const lists = reconcileTeamLists(membership.items, publicTeams.items);
          setMine(lists.mine);
          setDiscoverable(lists.discoverable);
          setMineCursor(membership.nextCursor);
          setDiscoverableCursor(publicTeams.nextCursor);
        })
        .catch(() => live && setError('团队列表暂时不可用'))
        .finally(() => live && setLoading(false));
      return () => {
        live = false;
      };
    }
    void api
      .team(slug)
      .then((detail) => {
        if (!live) return;
        setTeam(detail);
        setJoinRequestStatus(detail.joinRequestStatus ?? null);
        setLoading(false);
        // Public detail is available to anonymous/non-member viewers. Member
        // listing remains a protected capability and must not hide the detail.
        if (!user) return;
        void api
          .teamMembers(slug)
          .then((memberPage) => live && setMembers(memberPage.items))
          .catch(() => live && setMembers([]));
        if ((detail.membershipState === 'OWNER' || detail.membershipState === 'MANAGER') && typeof api.teamJoinRequests === 'function') {
          void api.teamJoinRequests(slug)
            .then((page) => live && setRequests(page.items))
            .catch(() => live && setRequestError('暂时无法加载待处理申请'));
        }
      })
      .catch(() => live && setError('团队不存在或当前不可见'))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [api, slug, user]);

  const joined = mine.filter((item) => item.role !== 'OWNER');
  const source =
    view === 'mine' ? mine : view === 'joined' ? joined : discoverable;
  const nextCursor = view === 'discoverable' ? discoverableCursor : mineCursor;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return source.filter((item) =>
      `${item.name} ${item.slug} ${item.description}`
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [query, source]);

  if (create) return <CreateTeam api={api} navigate={navigate} />;
  if (error)
    return (
      <section className="state">
        <h1>{error}</h1>
        <button onClick={() => window.location.reload()}>重试</button>
      </section>
    );
  if (!slug)
    return (
      <section className="team-page">
        <header className="team-page-header">
          <div>
            <p className="eyebrow">团队</p>
            <h1>与你一起学习、训练和完成任务</h1>
            <p>找到你的训练伙伴，或建立一个新的协作空间。</p>
          </div>
          {user && (
            <button onClick={() => navigate('/teams/new')}>+ 创建团队</button>
          )}
        </header>
        <div className="team-toolbar">
          <div className="team-view-switcher" aria-label="团队视图">
            <button
              className={view === 'mine' ? 'active' : ''}
              onClick={() => setView('mine')}
              disabled={!user}
            >
              我的团队 <span>{mine.length}</span>
            </button>
            <button
              className={view === 'joined' ? 'active' : ''}
              onClick={() => setView('joined')}
              disabled={!user}
            >
              已加入 <span>{joined.length}</span>
            </button>
            <button
              className={view === 'discoverable' ? 'active' : ''}
              onClick={() => setView('discoverable')}
            >
              可发现 <span>{discoverable.length}</span>
            </button>
          </div>
          <input
            type="search"
            aria-label="搜索团队"
            placeholder="搜索团队..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {loading ? (
          <p className="team-list-status">正在加载团队...</p>
        ) : filtered.length ? (
          <div className="team-grid">
            {filtered.map((item) => (
              <TeamCard key={item.id} team={item} navigate={navigate} />
            ))}
          </div>
        ) : query ? (
          <div className="team-empty">
            <span className="team-empty-icon" aria-hidden="true">
              群
            </span>
            <h2>没有匹配的团队</h2>
            <p>尝试其他名称、标识或简介关键词。</p>
          </div>
        ) : (
          <div className="team-empty">
            <span className="team-empty-icon" aria-hidden="true">
              群
            </span>
            <h2>
              {view === 'discoverable' ? '暂无可发现团队' : '你还没有加入团队'}
            </h2>
            <p>创建自己的训练空间，或浏览公开团队。</p>
            <div>
              {user && (
                <button onClick={() => navigate('/teams/new')}>创建团队</button>
              )}
              <button
                className="secondary"
                onClick={() => setView('discoverable')}
              >
                浏览公开团队
              </button>
            </div>
          </div>
        )}
        {!loading && filtered.length > 0 && nextCursor && (
          <button
            className="team-load-more secondary"
            disabled={busy}
            onClick={() => {
              if (busy) return;
              setBusy(true);
              const request =
                view === 'discoverable'
                  ? api.teams(20, discoverableCursor)
                  : api.myTeams(20, mineCursor);
              void request
                .then((page) => {
                  if (view === 'discoverable') {
                    const membershipIds = new Set(mine.map((item) => item.id));
                    setDiscoverable((current) =>
                      appendTeamPage(
                        current,
                        page.items.filter(
                          (item) => !membershipIds.has(item.id),
                        ),
                      ),
                    );
                    setDiscoverableCursor(page.nextCursor);
                  } else {
                    setMine((current) => appendTeamPage(current, page.items));
                    setMineCursor(page.nextCursor);
                  }
                })
                .catch(() => setError('加载更多团队失败'))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? '正在加载...' : '加载更多'}
          </button>
        )}
      </section>
    );

  if (loading || !team)
    return (
      <section className="state">
        <h1>正在加载团队...</h1>
      </section>
    );
  const isMember = team.membershipState !== 'NOT_MEMBER';
  const canJoin = Boolean(user && !isMember && team.joinPolicy !== 'INVITE_ONLY');
  const canReview = team.membershipState === 'OWNER' || team.membershipState === 'MANAGER';
  const pending = joinRequestStatus === 'PENDING';
  return (
    <section className="team-page">
      <header className="team-detail-header">
        <span className="team-avatar team-avatar-large" aria-hidden="true">
          {initial(team.name)}
        </span>
        <div className="team-detail-title">
          <p className="eyebrow">团队</p>
          <h1>{team.name}</h1>
          <span>@{team.slug}</span>
          <p>{team.description || '这个团队还没有填写简介。'}</p>
          <div className="team-badges">
            <span>{visibilityLabel(team.visibility)}</span>
            <span>{policyLabel(team.joinPolicy)}</span>
            {isMember && <strong>{team.membershipState}</strong>}
          </div>
        </div>
        <div className="team-detail-actions">
          {canJoin && (
            <button
              disabled={busy || pending}
              onClick={() => {
                if (busy) return;
                setBusy(true);
                void api
                  .joinTeam(team.slug)
                  .then((result) => {
                    if ((result as { status?: string }).status === 'REQUESTED') setJoinRequestStatus('PENDING');
                    else window.location.reload();
                  })
                  .catch(() => setError('申请失败，请稍后重试'))
                  .finally(() => setBusy(false));
              }}
            >
              {pending ? '申请中' : busy ? '提交中...' : team.joinPolicy === 'REQUEST' ? '申请加入' : '加入团队'}
            </button>
          )}
          {isMember && team.membershipState !== 'OWNER' && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                if (busy) return;
                setBusy(true);
                void api
                  .leaveTeam(team.slug)
                  .then(() => window.location.reload())
                  .catch(() => setError('退出失败'))
                  .finally(() => setBusy(false));
              }}
            >
              退出团队
            </button>
          )}
        </div>
      </header>
      <nav className="team-section-nav" aria-label="团队内容">
        <a href="#overview" aria-current="page">概览</a>
        <a href="#members">成员</a>
        <a
          href={`/teams/${encodeURIComponent(team.slug)}/assignments`}
          onClick={(event) => {
            event.preventDefault();
            navigate(`/teams/${encodeURIComponent(team.slug)}/assignments`);
          }}
        >
          作业
        </a>
        {(team.membershipState === 'OWNER' || team.membershipState === 'MANAGER') && <a href="#requests">申请</a>}
      </nav>
      <div className="team-detail-grid">
        <section id="overview" className="team-panel">
          <h2>团队概览</h2>
          <p>{team.description || '这个团队还没有填写简介。'}</p>
          <dl className="team-facts">
            <div>
              <dt>成员</dt>
              <dd>{team.memberCount ?? members.length}</dd>
            </div>
            <div>
              <dt>管理员</dt>
              <dd>
                {members.filter((member) => member.role !== 'MEMBER').length}
              </dd>
            </div>
            <div>
              <dt>可见性</dt>
              <dd>{visibilityLabel(team.visibility)}</dd>
            </div>
            <div>
              <dt>加入方式</dt>
              <dd>{policyLabel(team.joinPolicy)}</dd>
            </div>
          </dl>
        </section>
        <section id="members" className="team-panel team-members-panel">
          <header>
            <h2>成员</h2>
            <span>{team.memberCount ?? members.length} 人</span>
          </header>
          <ul className="team-member-list">
            {members.map((member) => (
              <li key={member.userId}>
                <span className="member-avatar" aria-hidden="true">
                  {initial(member.displayName)}
                </span>
                <span>
                  <strong>{member.displayName}</strong>
                  <small>@{member.username}</small>
                </span>
                <time dateTime={member.joinedAt}>
                  {new Date(member.joinedAt).toLocaleDateString()}
                </time>
                <strong className="team-role">{member.role}</strong>
              </li>
            ))}
          </ul>
        </section>
        {canReview && (
          <section id="requests" className="team-panel team-requests-panel">
            <header><h2>加入申请</h2><span>{requests.length} 条待处理</span></header>
            {requestError ? <p className="team-error" role="alert">{requestError}</p> : requests.length ? (
              <ul className="team-member-list">
                {requests.map((request) => (
                  <li key={request.id}>
                    <span className="member-avatar" aria-hidden="true">申</span>
                    <span><strong>用户 {request.userId}</strong><small>{new Date(request.createdAt).toLocaleString()}</small></span>
                    <button type="button" onClick={() => {
                      void api.approveJoinRequest(team.slug, request.id).then(() => setRequests((items) => items.filter((item) => item.id !== request.id))).catch(() => setRequestError('同意申请失败，请重试'));
                    }}>同意</button>
                    <button type="button" className="secondary" onClick={() => {
                      void api.rejectJoinRequest(team.slug, request.id).then(() => setRequests((items) => items.filter((item) => item.id !== request.id))).catch(() => setRequestError('拒绝申请失败，请重试'));
                    }}>拒绝</button>
                  </li>
                ))}
              </ul>
            ) : <p className="team-list-status">暂无待处理申请</p>}
          </section>
        )}
      </div>
    </section>
  );
}

function suggestedSlug(name: string) {
  return name
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 49);
}

export function CreateTeam({
  api,
  navigate,
}: {
  api: ApiClient;
  navigate: (path: string) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<TeamVisibility>('PRIVATE');
  const [joinPolicy, setJoinPolicy] = useState<TeamPolicy>('REQUEST');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const nameError =
    name.trim().length > 0 && name.trim().length < 2
      ? '团队名称至少需要 2 个字符。'
      : '';
  const slugError =
    slug.length > 0 && !/^[a-z0-9][a-z0-9-]{2,48}$/.test(slug)
      ? 'Slug 需为 3-49 位小写字母、数字或连字符。'
      : '';
  const valid =
    name.trim().length >= 2 &&
    !nameError &&
    !slugError &&
    /^[a-z0-9][a-z0-9-]{2,48}$/.test(slug);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    void api
      .createTeam({
        name: name.trim(),
        slug,
        description: description.trim(),
        visibility,
        joinPolicy,
      })
      .then((created) => navigate(`/teams/${created.slug}`))
      .catch(() => {
        submitting.current = false;
        setBusy(false);
        setError('创建失败。请检查字段，或更换已被使用的 Slug。');
      });
  };

  return (
    <section className="team-create-page">
      <header>
        <p className="eyebrow">创建团队</p>
        <h1>建立新的协作空间</h1>
        <p>用于学习、训练和共同完成任务。</p>
      </header>
      {error && (
        <p className="team-error" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={submit}>
        <div className="team-create-layout">
          <div className="team-create-fields">
            <section className="team-form-section">
              <header>
                <span>01</span>
                <div>
                  <h2>基本信息</h2>
                  <p>让成员快速了解这个团队。</p>
                </div>
              </header>
              <label>
                团队名称
                <input
                  aria-label="团队名称"
                  value={name}
                  maxLength={80}
                  aria-invalid={Boolean(nameError)}
                  onChange={(event) => {
                    const next = event.target.value;
                    setName(next);
                    if (!slugTouched) setSlug(suggestedSlug(next));
                  }}
                  placeholder="例如：算法竞赛一队"
                />
                <small>{nameError || '2-80 个字符，可随时修改。'}</small>
              </label>
              <label>
                Slug
                <input
                  aria-label="Slug"
                  value={slug}
                  maxLength={49}
                  aria-invalid={Boolean(slugError)}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setSlug(event.target.value.toLocaleLowerCase());
                  }}
                  placeholder="acm-team"
                />
                <small>
                  {slugError || `团队地址：/teams/${slug || 'team-slug'}`}
                </small>
              </label>
              <label>
                团队简介
                <textarea
                  aria-label="团队简介"
                  value={description}
                  maxLength={500}
                  rows={4}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="介绍训练方向、目标或协作方式。"
                />
                <small>{description.length}/500</small>
              </label>
            </section>
            <OptionSection
              title="可见性"
              number="02"
              value={visibility}
              onChange={(value) => setVisibility(value as TeamVisibility)}
              options={[
                ['PUBLIC', '公开团队', '任何用户都可以发现这个团队。'],
                ['PRIVATE', '私有团队', '只有成员或获得许可的用户可以访问。'],
              ]}
            />
            <OptionSection
              title="加入方式"
              number="03"
              value={joinPolicy}
              onChange={(value) => setJoinPolicy(value as TeamPolicy)}
              options={[
                ['OPEN', '自由加入', '用户可以立即加入。'],
                ['REQUEST', '申请加入', '管理员审批后加入。'],
                ['INVITE_ONLY', '仅邀请', '只能通过邀请或邀请码加入。'],
              ]}
            />
          </div>
          <aside className="team-preview" aria-label="团队预览">
            <span>团队预览</span>
            <div className="team-preview-heading">
              <span className="team-avatar" aria-hidden="true">
                {initial(name)}
              </span>
              <div>
                <strong>{name.trim() || '团队名称'}</strong>
                <small>@{slug || 'team-slug'}</small>
              </div>
            </div>
            <p>{description.trim() || '团队简介将显示在这里。'}</p>
            <footer>
              <span>{visibilityLabel(visibility)}</span>
              <span>{policyLabel(joinPolicy)}</span>
              <strong>OWNER</strong>
            </footer>
          </aside>
        </div>
        <div className="team-create-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => navigate('/teams')}
          >
            取消
          </button>
          <button type="submit" disabled={!valid || busy}>
            {busy ? '正在创建...' : '创建团队'}
          </button>
        </div>
      </form>
    </section>
  );
}

function OptionSection({
  title,
  number,
  value,
  onChange,
  options,
}: {
  title: string;
  number: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string, string]>;
}) {
  return (
    <section className="team-form-section">
      <header>
        <span>{number}</span>
        <div>
          <h2>{title}</h2>
        </div>
      </header>
      <div className="team-option-grid" role="radiogroup" aria-label={title}>
        {options.map(([option, label, help]) => (
          <label className={value === option ? 'selected' : ''} key={option}>
            <input
              type="radio"
              name={title}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span>
              <strong>{label}</strong>
              <small>{help}</small>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
