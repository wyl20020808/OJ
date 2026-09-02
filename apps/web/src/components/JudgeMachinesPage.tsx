import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../services/api.js';
import {
  createJudgeAdminClient,
  type JudgeAction,
  type JudgeNode,
  type JudgeSummary,
} from '../services/judge-admin.js';
import './judge-machines.css';

const client = createJudgeAdminClient(import.meta.env.VITE_API_URL ?? '');
const sample = (nodeId: string): JudgeNode => ({
  nodeId,
  incarnation: 'fixture-incarnation',
  desiredState: 'ONLINE',
  observedState: 'ONLINE',
  runtimeVersion: 'worker-v1',
  maxConcurrentJobs: 2,
  activeJobs: 0,
  availableCapacity: 2,
  lastHeartbeatAt: new Date().toISOString(),
  heartbeatAgeMs: 1200,
  capabilities: {
    languageProfiles: ['cpp20-gcc-13-v1'],
    checkers: ['EXACT_BYTES'],
    executionModes: ['REAL_SANDBOXED_EXECUTION'],
    sandboxContractVersion: '2C.3',
  },
  recentFailureCount: 0,
  controlVersion: 1,
});
const stateTone = (s: string) => s.toLowerCase();
function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const e = error as ApiError;
  const unavailable = e?.status === 502 || e?.status === 504;
  const forbidden = e?.status === 401 || e?.status === 403;
  return (
    <div className="judge-state" role="alert">
      <strong>
        {forbidden
          ? '无权访问 Judge Machines'
          : unavailable
            ? 'Judge Service 暂不可用'
            : 'Judge Machines 加载失败'}
      </strong>
      <p>
        {forbidden
          ? '需要 judge.view 权限。'
          : unavailable
            ? 'Product Backend 当前无法取得 Judge 状态，请稍后重试。'
            : (e?.message ?? '网络错误或请求超时。')}
      </p>
      <button type="button" onClick={onRetry}>
        重试
      </button>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="judge-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function NodeCard({
  node,
  onOpen,
  canManage,
  onAction,
}: {
  node: JudgeNode;
  onOpen: () => void;
  canManage: boolean;
  onAction: (a: JudgeAction) => void;
}) {
  return (
    <article className="judge-node-card">
      <button className="node-main" type="button" onClick={onOpen}>
        <span className="node-id">{node.nodeId}</span>
        <span className={`state state-${stateTone(node.observedState)}`}>
          {node.observedState}
        </span>
        <span className="node-meta">
          期望 {node.desiredState} · {node.activeJobs}/{node.maxConcurrentJobs}{' '}
          jobs · 心跳 {Math.round(node.heartbeatAgeMs / 1000)}s
        </span>
      </button>
      <div className="node-actions">
        <button type="button" className="secondary" onClick={onOpen}>
          详情
        </button>
        {canManage && (
          <>
            <button
              type="button"
              className="secondary"
              onClick={() => onAction('drain')}
            >
              Drain
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                onAction(
                  node.observedState === 'OFFLINE' ? 'enable' : 'offline',
                )
              }
            >
              {node.observedState === 'OFFLINE' ? 'Enable' : 'Offline'}
            </button>
          </>
        )}
        {!canManage && <span className="muted">需要 judge.manage</span>}
      </div>
    </article>
  );
}
function Detail({
  node,
  canManage,
  onBack,
  onAction,
}: {
  node: JudgeNode;
  canManage: boolean;
  onBack: () => void;
  onAction: (a: JudgeAction) => void;
}) {
  const [history, setHistory] = useState<
    Record<string, Array<Record<string, unknown>>>
  >({});
  const [historyError, setHistoryError] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.allSettled([
      client.assignments(node.nodeId),
      client.jobs(node.nodeId),
      client.failures(node.nodeId),
    ]).then((r) => {
      if (!active) return;
      const next: Record<string, Array<Record<string, unknown>>> = {};
      r.forEach((x, i) => {
        if (x.status === 'fulfilled')
          next[['assignments', 'jobs', 'failures'][i]!] = x.value.items;
        else setHistoryError(true);
      });
      setHistory(next);
    });
    return () => {
      active = false;
    };
  }, [node.nodeId]);
  return (
    <section className="judge-detail">
      <button type="button" className="back-link" onClick={onBack}>
        ← 返回节点列表
      </button>
      <div className="detail-heading">
        <div>
          <p className="eyebrow">Judge node</p>
          <h1>{node.nodeId}</h1>
          <p className="muted">
            incarnation <code>{node.incarnation}</code> · controlVersion{' '}
            {node.controlVersion}
          </p>
        </div>
        <div className="node-actions">
          {canManage ? (
            <>
              <button type="button" onClick={() => onAction('drain')}>
                Drain
              </button>
              <button type="button" onClick={() => onAction('offline')}>
                Offline
              </button>
              <button type="button" onClick={() => onAction('enable')}>
                Enable
              </button>
            </>
          ) : (
            <span className="muted">只读：需要 judge.manage</span>
          )}
          <div
            className="unavailable-actions"
            aria-label="Host Agent lifecycle unavailable"
          >
            <button type="button" disabled title="HOST_AGENT_NOT_AVAILABLE">
              Start
            </button>
            <button type="button" disabled title="HOST_AGENT_NOT_AVAILABLE">
              Stop
            </button>
            <button type="button" disabled title="HOST_AGENT_NOT_AVAILABLE">
              Restart
            </button>
            <small>HOST_AGENT_NOT_AVAILABLE</small>
          </div>
        </div>
      </div>
      <div className="detail-grid">
        <div>
          <h2>状态与容量</h2>
          <dl className="judge-dl">
            <div>
              <dt>期望状态</dt>
              <dd>{node.desiredState}</dd>
            </div>
            <div>
              <dt>观测状态</dt>
              <dd>{node.observedState}</dd>
            </div>
            <div>
              <dt>容量</dt>
              <dd>
                {node.activeJobs}/{node.maxConcurrentJobs} active ·{' '}
                {node.availableCapacity} available
              </dd>
            </div>
            <div>
              <dt>最后心跳</dt>
              <dd>
                {new Date(node.lastHeartbeatAt).toLocaleString()} (
                {Math.round(node.heartbeatAgeMs / 1000)}s ago)
              </dd>
            </div>
            <div>
              <dt>runtime</dt>
              <dd>{node.runtimeVersion}</dd>
            </div>
          </dl>
        </div>
        <div>
          <h2>Capabilities</h2>
          <p>
            <b>Languages</b> {node.capabilities.languageProfiles.join(', ')}
          </p>
          <p>
            <b>Checkers</b> {node.capabilities.checkers.join(', ')}
          </p>
          <p>
            <b>Modes</b> {node.capabilities.executionModes.join(', ')}
          </p>
          <p>
            <b>Sandbox</b> {node.capabilities.sandboxContractVersion}
          </p>
        </div>
      </div>
      <div className="history-grid">
        {(['assignments', 'jobs', 'failures'] as const).map((key) => (
          <div key={key}>
            <h2>{key}</h2>
            {historyError && !history[key] ? (
              <p className="muted">该历史暂不可用</p>
            ) : history[key]?.length ? (
              <ul>
                {history[key].map((item, i) => (
                  <li key={i}>
                    <code>
                      {String(
                        item.id ?? item.assignmentId ?? item.jobId ?? 'record',
                      )}
                    </code>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">暂无记录</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
export function JudgeMachinesPage({
  nodeId,
  canManage = true,
  fixture = false,
}: {
  nodeId?: string;
  canManage?: boolean;
  fixture?: boolean;
}) {
  const [summary, setSummary] = useState<JudgeSummary | null>(null);
  const [nodes, setNodes] = useState<JudgeNode[]>([]);
  const [selected, setSelected] = useState<JudgeNode | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (fixture) {
        const ns: JudgeNode[] = [
          sample('judge-a'),
          {
            ...sample('judge-b'),
            observedState: 'BUSY',
            activeJobs: 2,
            availableCapacity: 0,
          },
          {
            ...sample('judge-c'),
            observedState: 'DRAINING',
            desiredState: 'DRAINING',
          },
        ];
        setNodes(ns);
        setSummary({
          totalNodes: 3,
          onlineCount: 1,
          busyCount: 1,
          drainingCount: 1,
          offlineCount: 0,
          unhealthyCount: 0,
          activeJobs: 2,
          totalCapacity: 6,
          schedulableCapacity: 3,
          staleNodeCount: 0,
          generatedAt: new Date().toISOString(),
        });
      } else {
        const [s, n] = await Promise.all([client.summary(), client.nodes()]);
        setSummary(s);
        setNodes(n.items);
      }
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [fixture]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!nodeId) return;
    void (fixture ? Promise.resolve(sample(nodeId)) : client.node(nodeId))
      .then(setSelected)
      .catch(setError);
  }, [nodeId, fixture]);
  const filtered = useMemo(
    () =>
      nodes.filter((n) =>
        `${n.nodeId} ${n.observedState} ${n.runtimeVersion}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [nodes, query],
  );
  const action = async (
    a: JudgeAction,
    target: JudgeNode | null = selected,
  ) => {
    if (!target) return;
    const reason = window.prompt(
      `确认 ${a} ${target.nodeId}，请输入原因`,
      'maintenance',
    );
    if (!reason) return;
    try {
      if (fixture) {
        setNotice(`已提交 ${a}（fixture contract only）`);
        return;
      }
      const result = await client.mutate(target.nodeId, a, {
        reason,
        expectedIncarnation: target.incarnation,
        expectedControlVersion: target.controlVersion,
        idempotencyKey: crypto.randomUUID(),
      });
      setSelected(result.node);
      setNotice(`操作已接受：${result.operationId}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setStale(true);
        setNotice('节点状态已变化，已阻止自动重试。请刷新并重新确认。');
      } else setNotice(e instanceof Error ? e.message : '操作失败');
    }
  };
  if (loading)
    return (
      <section className="judge-page">
        <div className="judge-skeleton" />
        <div className="judge-skeleton" />
      </section>
    );
  if (error)
    return (
      <section className="judge-page">
        <ErrorState error={error} onRetry={() => void load()} />
      </section>
    );
  if (selected)
    return (
      <section className="judge-page">
        {stale && (
          <div className="stale-banner" role="status">
            数据可能已过期，请重新加载节点详情。
          </div>
        )}
        {notice && (
          <div className="operation-notice" role="status">
            {notice}
          </div>
        )}
        <Detail
          node={selected}
          canManage={canManage}
          onBack={() => setSelected(null)}
          onAction={action}
        />
      </section>
    );
  return (
    <section className="judge-page">
      <header className="judge-page-heading">
        <div>
          <p className="eyebrow">Administration / Judge</p>
          <h1>Judge Machines</h1>
          <p className="muted">
            Product Backend snapshot ·{' '}
            {summary ? new Date(summary.generatedAt).toLocaleString() : '—'}
          </p>
        </div>
        <button type="button" className="secondary" onClick={() => void load()}>
          刷新
        </button>
      </header>
      {notice && (
        <div className="operation-notice" role="status">
          {notice}
        </div>
      )}
      <div className="judge-metrics">
        {summary && (
          <>
            <Metric label="Total" value={summary.totalNodes} />
            <Metric label="Online" value={summary.onlineCount} />
            <Metric label="Busy" value={summary.busyCount} />
            <Metric label="Draining" value={summary.drainingCount} />
            <Metric label="Offline" value={summary.offlineCount} />
            <Metric
              label="Active / Capacity"
              value={`${summary.activeJobs} / ${summary.totalCapacity}`}
            />
            <Metric label="Schedulable" value={summary.schedulableCapacity} />
          </>
        )}
      </div>
      <div className="judge-toolbar">
        <label>
          搜索节点
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="nodeId / state / runtime"
          />
        </label>
      </div>
      {filtered.length === 0 ? (
        <div className="judge-state">
          <strong>{nodes.length ? '没有匹配节点' : 'Registry 为空'}</strong>
          <p>Product Backend 未返回可显示节点。</p>
        </div>
      ) : (
        <div className="judge-node-list">
          {filtered.map((n) => (
            <NodeCard
              key={n.nodeId}
              node={n}
              onOpen={() => setSelected(n)}
              canManage={canManage}
              onAction={(a) => {
                setSelected(n);
                void action(a, n);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
