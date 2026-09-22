import { useEffect, useState, type FormEvent } from 'react';
import {
  ApiError,
  type ApiClient,
  type Assignment,
} from '../../services/api.js';
import './AssignmentPage.css';

type Navigate = (path: string) => void;
const dateText = (value: string | null) =>
  value ? new Date(value).toLocaleString() : '无截止时间';

function AssignmentCard({
  item,
  navigate,
}: {
  item: Assignment;
  navigate: Navigate;
}) {
  const path = `/homework/${encodeURIComponent(item.publicId)}`;
  return (
    <article className="assignment-card">
      <div>
        <span className="assignment-status">
          {item.status === 'CLOSED'
            ? '已结束'
            : item.startsAt && Date.parse(item.startsAt) > Date.now()
              ? '即将开始'
              : item.dueAt && Date.parse(item.dueAt) < Date.now()
                ? '已截止'
                : '进行中'}
        </span>
        <h2>{item.title}</h2>
        <p>{item.team.name}</p>
      </div>
      <div className="assignment-card-meta">
        <span>截止：{dateText(item.dueAt)}</span>
        <strong>
          {item.completedCount} / {item.problemCount} 已完成
        </strong>
      </div>
      <button type="button" onClick={() => navigate(path)}>
        {item.completedCount ? '继续作业' : '开始作业'}
      </button>
    </article>
  );
}

export function AssignmentPage({
  api,
  navigate,
  detailId,
  teamSlug,
  user,
  authState = user ? 'authenticated' : 'unauthenticated',
  create = false,
}: {
  api: ApiClient;
  navigate: Navigate;
  detailId?: string;
  teamSlug?: string;
  user: { id: string } | null;
  authState?: 'loading' | 'authenticated' | 'unauthenticated' | 'unavailable';
  create?: boolean;
}) {
  const [items, setItems] = useState<Assignment[]>([]);
  const [detail, setDetail] = useState<Assignment>();
  const [teamRole, setTeamRole] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    if (authState === 'loading')
      return () => {
        live = false;
      };
    if (!user) {
      setError(
        authState === 'unavailable'
          ? '账户服务暂时不可用'
          : '请先登录后查看我的作业',
      );
      setLoading(false);
      return () => {
        live = false;
      };
    }
    const request = detailId
      ? api.assignment(detailId).then((value) => {
          if (live) setDetail(value);
        })
      : teamSlug
        ? Promise.all([api.teamAssignments(teamSlug), api.team(teamSlug)]).then(
            ([value, team]) => {
              if (live) {
                setItems(value.items);
                setTeamRole(team.membershipState);
              }
            },
          )
        : api.myAssignments().then((value) => {
            if (live) setItems(value.items);
          });
    void request
      .catch((reason: unknown) => {
        if (!live) return;
        setError(
          reason instanceof ApiError && reason.status === 403
            ? '当前账号无权查看这项作业'
            : reason instanceof ApiError && reason.status === 404
              ? '作业不存在或已被移除'
              : '作业暂时不可用',
        );
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [api, authState, detailId, teamSlug, user]);
  if (loading)
    return (
      <section className="state">
        <h1>正在加载作业...</h1>
      </section>
    );
  if (error)
    return (
      <section className="state">
        <h1>{error}</h1>
        {error === '请先登录后查看我的作业' ? (
          <button type="button" onClick={() => navigate('/login')}>
            登录
          </button>
        ) : (
          <button type="button" onClick={() => window.location.reload()}>
            重试
          </button>
        )}
      </section>
    );
  if (create && teamSlug)
    return (
      <CreateAssignment api={api} navigate={navigate} teamSlug={teamSlug} />
    );
  if (detailId && detail)
    return <AssignmentDetail api={api} item={detail} navigate={navigate} />;
  return (
    <section className="assignment-page">
      <header className="portal-heading">
        <div>
          <p className="eyebrow">学习任务</p>
          <h1>
            {teamSlug ? `${items[0]?.team.name ?? '团队'}作业` : '我的作业'}
          </h1>
          {!teamSlug && <p>来自你当前加入的团队</p>}
        </div>
        {teamSlug && (teamRole === 'OWNER' || teamRole === 'MANAGER') && (
          <button
            type="button"
            onClick={() =>
              navigate(`/teams/${encodeURIComponent(teamSlug)}/assignments/new`)
            }
          >
            创建作业
          </button>
        )}
      </header>
      {items.length ? (
        <div className="assignment-grid">
          {items.map((item) => (
            <AssignmentCard
              key={item.publicId}
              item={item}
              navigate={navigate}
            />
          ))}
        </div>
      ) : (
        <div className="assignment-empty">
          <h2>
            {teamSlug
              ? teamRole === 'OWNER' || teamRole === 'MANAGER'
                ? '还没有作业'
                : '团队暂未发布作业'
              : '暂无作业'}
          </h2>
          <p>加入团队后，团队发布的作业会显示在这里。</p>
          {teamSlug && (teamRole === 'OWNER' || teamRole === 'MANAGER') && (
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/teams/${encodeURIComponent(teamSlug)}/assignments/new`,
                )
              }
            >
              创建第一个作业
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function AssignmentDetail({
  api,
  item,
  navigate,
}: {
  api: ApiClient;
  item: Assignment;
  navigate: Navigate;
}) {
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(item);
  const [transitionError, setTransitionError] = useState('');
  useEffect(() => setCurrent(item), [item]);
  const transition = (action: 'publish' | 'close') => {
    setBusy(true);
    setTransitionError('');
    void (
      action === 'publish'
        ? api.publishAssignment(current.publicId)
        : api.closeAssignment(current.publicId)
    )
      .then(setCurrent)
      .catch((error: unknown) =>
        setTransitionError(
          error instanceof ApiError && error.status === 403
            ? '当前账号无权执行此操作。'
            : error instanceof ApiError && error.status === 409
              ? '作业状态已变化，请刷新后重试。'
              : '操作失败，服务端未保存任何变更。',
        ),
      )
      .finally(() => setBusy(false));
  };
  return (
    <section className="assignment-page">
      <header className="portal-heading">
        <div>
          <p className="eyebrow">{current.team.name}</p>
          <h1>{current.title}</h1>
          <p>{current.description || '暂无说明'}</p>
        </div>
        <span className="assignment-status">{current.status}</span>
      </header>
      <div className="assignment-detail-facts">
        <span>开始：{dateText(current.startsAt)}</span>
        <span>截止：{dateText(current.dueAt)}</span>
        <strong>
          {current.completedCount} / {current.problemCount} 已完成
        </strong>
      </div>
      <ol className="assignment-problem-list">
        {current.problems.map((problem) => (
          <li key={problem.publicId}>
            <a
              href={`/problems/${encodeURIComponent(problem.publicId)}`}
              onClick={(event) => {
                event.preventDefault();
                navigate(`/problems/${encodeURIComponent(problem.publicId)}`);
              }}
            >
              {problem.publicId} {problem.title}
            </a>
            <span>{problem.completed ? '已通过' : '未完成'}</span>
          </li>
        ))}
      </ol>
      {transitionError && (
        <p className="team-error" role="alert">
          {transitionError}
        </p>
      )}
      <div className="assignment-form-actions">
        {current.capabilities.canPublish && (
          <button
            type="button"
            disabled={busy}
            onClick={() => transition('publish')}
          >
            发布作业
          </button>
        )}
        {current.capabilities.canClose && (
          <button
            type="button"
            disabled={busy}
            onClick={() => transition('close')}
          >
            关闭作业
          </button>
        )}
        <button
          type="button"
          className="secondary"
          onClick={() =>
            navigate(
              current.capabilities.canEdit
                ? `/teams/${encodeURIComponent(current.team.slug)}/assignments`
                : '/homework',
            )
          }
        >
          返回
        </button>
      </div>
    </section>
  );
}

function CreateAssignment({
  api,
  navigate,
  teamSlug,
}: {
  api: ApiClient;
  navigate: Navigate;
  teamSlug: string;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [problemIds, setProblemIds] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = (event: FormEvent, status: 'DRAFT' | 'PUBLISHED') => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    void api
      .createAssignment(teamSlug, {
        title,
        description,
        problemIds: problemIds
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        status,
      })
      .then((item) =>
        navigate(`/homework/${encodeURIComponent(item.publicId)}`),
      )
      .catch(() => setError('保存作业失败'))
      .finally(() => setBusy(false));
  };
  return (
    <section className="assignment-page">
      <header className="portal-heading">
        <div>
          <p className="eyebrow">团队作业</p>
          <h1>创建作业</h1>
        </div>
      </header>
      <form
        className="assignment-form"
        onSubmit={(event) => submit(event, 'DRAFT')}
      >
        <label>
          标题
          <input
            required
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          说明
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={6}
          />
        </label>
        <label>
          题目 public ID
          <input
            required
            placeholder="P0001, P0002"
            value={problemIds}
            onChange={(event) => setProblemIds(event.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="team-error">
            {error}
          </p>
        )}
        <div className="assignment-form-actions">
          <button type="submit" disabled={busy}>
            保存草稿
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={(event) =>
              submit(event as unknown as FormEvent, 'PUBLISHED')
            }
          >
            发布作业
          </button>
        </div>
      </form>
    </section>
  );
}
