import { useEffect, useState } from 'react';
import type { ApiClient, TeamMember, TeamSummary } from '../../services/api.js';

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
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [team, setTeam] = useState<
    (TeamSummary & { membershipState: string }) | null
  >(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setError('');
    if (!slug) {
      void Promise.all([api.myTeams(), api.teams()])
        .then(([mine, publicTeams]) => {
          if (live) setTeams([...mine.items, ...publicTeams.items]);
        })
        .catch(() => live && setError('团队列表暂时不可用'));
      return () => {
        live = false;
      };
    }
    void Promise.all([api.team(slug), api.teamMembers(slug)])
      .then(([t, m]) => {
        if (live) {
          setTeam(t);
          setMembers(m.items);
        }
      })
      .catch(() => live && setError('团队不存在或当前不可见'));
    return () => {
      live = false;
    };
  }, [api, slug]);
  if (error)
    return (
      <section className="state">
        <h1>{error}</h1>
        <button onClick={() => window.location.reload()}>重试</button>
      </section>
    );
  if (create) return <CreateTeam api={api} navigate={navigate} />;
  if (!slug)
    return (
      <section>
        <div className="page-heading">
          <div>
            <p className="eyebrow">Teams</p>
            <h1>团队</h1>
          </div>
          {user && (
            <button onClick={() => navigate('/teams/new')}>创建团队</button>
          )}
        </div>
        <div className="profile-grid">
          {teams.map((t) => (
            <article className="profile-card" key={t.id}>
              <h2>
                <a
                  href={`/teams/${t.slug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/teams/${t.slug}`);
                  }}
                >
                  {t.name}
                </a>
              </h2>
              <p>{t.description || '暂无简介'}</p>
              <small>
                {t.visibility} · {t.memberCount ?? 0} 成员
              </small>
            </article>
          ))}
          {teams.length === 0 && <p>暂无团队。</p>}
        </div>
      </section>
    );
  if (!team)
    return (
      <section className="state">
        <h1>加载团队...</h1>
      </section>
    );
  const isMember = team.membershipState !== 'NOT_MEMBER';
  const canJoin = Boolean(user && !isMember);
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Team</p>
          <h1>{team.name}</h1>
          <p>{team.description || '暂无简介'}</p>
        </div>
        <span className="guest-badge">{team.membershipState}</span>
      </div>
      <div className="profile-grid">
        <article className="profile-card">
          <h2>团队信息</h2>
          <p>可见性：{team.visibility}</p>
          <p>加入方式：{team.joinPolicy}</p>
          <p>成员数：{team.memberCount ?? members.length}</p>
          {canJoin && (
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void api
                  .joinTeam(team.slug)
                  .then(() => window.location.reload())
                  .catch(() => setError('加入失败'))
                  .finally(() => setBusy(false));
              }}
            >
              加入团队
            </button>
          )}
          {isMember && team.membershipState !== 'OWNER' && (
            <button
              disabled={busy}
              onClick={() => {
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
        </article>
        <article className="profile-card">
          <h2>成员</h2>
          <ul>
            {members.map((m) => (
              <li key={m.userId}>
                {m.displayName}{' '}
                <small>
                  @{m.username} · {m.role}
                </small>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

function CreateTeam({
  api,
  navigate,
}: {
  api: ApiClient;
  navigate: (path: string) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <section>
      <h1>创建团队</h1>
      <form
        className="profile-card"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void api
            .createTeam({
              name,
              slug,
              description,
              visibility: 'PUBLIC',
              joinPolicy: 'OPEN',
            })
            .then((t) => navigate(`/teams/${t.slug}`))
            .catch(() => setError('创建失败，请检查团队名称和 slug'))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          名称
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label>
          Slug
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          />
        </label>
        <label>
          简介
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {error && <p>{error}</p>}
        <button disabled={busy} type="submit">
          创建
        </button>
      </form>
    </section>
  );
}
