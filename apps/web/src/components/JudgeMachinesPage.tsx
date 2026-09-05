import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../services/api.js';
import {
  createJudgeAdminClient,
  type JudgePoolPolicy,
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
const stateLabels: Record<string, string> = {
  ONLINE: '在线',
  BUSY: '忙碌',
  DRAINING: '排空中',
  OFFLINE: '离线',
  UNHEALTHY: '异常',
};
const actionLabels: Record<JudgeAction, string> = {
  drain: '排空任务',
  offline: '下线',
  enable: '启用',
  start: '启动',
  stop: '停止',
  restart: '重启',
};
const historyLabels = {
  assignments: '任务分配',
  jobs: '评测任务',
  failures: '失败记录',
} as const;
export const displayJudgeNodeState = (state: string) =>
  stateLabels[state] ?? '未知';
const displayPoolMode = (mode: JudgePoolPolicy['mode'] | undefined) =>
  mode === 'MANUAL' ? '手动' : mode === 'AUTOMATIC' ? '自动' : '不可用';
const actionError = (error: unknown, fallback: string) =>
  error instanceof ApiError
    ? `${fallback}：${error.code}（HTTP ${error.status}，请求 ID ${error.requestId}）`
    : fallback;
function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const e = error instanceof ApiError ? error : null;
  const unavailable =
    e?.status === 502 || e?.status === 503 || e?.status === 504;
  const forbidden = e?.status === 401 || e?.status === 403;
  return (
    <div className="judge-state" role="alert">
      <strong>
        {forbidden
          ? '无权访问 Judge 节点管理'
          : unavailable
            ? 'Judge Service 暂不可用'
            : 'Judge 节点管理加载失败'}
      </strong>
      <p>
        {forbidden
          ? '需要 judge.view 权限。'
          : unavailable
            ? 'Product 后端当前无法取得 Judge 状态，请稍后重试。'
            : '请求未完成，请稍后重试。'}
      </p>
      {e ? (
        <small>
          {e.code} · HTTP {e.status} · 请求 ID {e.requestId}
        </small>
      ) : error instanceof Error ? (
        <small>技术详情：{error.message}</small>
      ) : null}
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
          {displayJudgeNodeState(node.observedState)}
        </span>
        <span className="node-meta">
          期望 {displayJudgeNodeState(node.desiredState)} · {node.activeJobs}/
          {node.maxConcurrentJobs} 个任务 · 心跳{' '}
          {Math.round(node.heartbeatAgeMs / 1000)} 秒
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
              排空任务
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
              {node.observedState === 'OFFLINE' ? '启用' : '下线'}
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
  hostAvailable,
  onBack,
  onAction,
}: {
  node: JudgeNode;
  canManage: boolean;
  hostAvailable: boolean;
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
          <p className="eyebrow">Judge 节点</p>
          <h1>{node.nodeId}</h1>
          <p className="muted">
            实例 incarnation <code>{node.incarnation}</code> · 控制版本{' '}
            controlVersion {node.controlVersion}
          </p>
        </div>
        <div className="node-actions">
          {canManage ? (
            <>
              <button type="button" onClick={() => onAction('drain')}>
                排空任务
              </button>
              <button type="button" onClick={() => onAction('offline')}>
                下线
              </button>
              <button type="button" onClick={() => onAction('enable')}>
                启用
              </button>
            </>
          ) : (
            <span className="muted">只读：需要 judge.manage</span>
          )}
          <div
            className="unavailable-actions"
            role="group"
            aria-label="Host Agent 生命周期"
          >
            {(['start', 'stop', 'restart'] as const).map((action) => (
              <button
                key={action}
                type="button"
                disabled={!canManage || !hostAvailable}
                title={
                  !hostAvailable
                    ? 'Host Agent 不可用（HOST_AGENT_NOT_AVAILABLE）'
                    : undefined
                }
                onClick={() => onAction(action)}
              >
                {actionLabels[action]}
              </button>
            ))}
            {!hostAvailable && (
              <small>Host Agent 不可用（HOST_AGENT_NOT_AVAILABLE）</small>
            )}
          </div>
        </div>
      </div>
      <div className="detail-grid">
        <div>
          <h2>状态与容量</h2>
          <dl className="judge-dl">
            <div>
              <dt>期望状态</dt>
              <dd>{displayJudgeNodeState(node.desiredState)}</dd>
            </div>
            <div>
              <dt>观测状态</dt>
              <dd>{displayJudgeNodeState(node.observedState)}</dd>
            </div>
            <div>
              <dt>容量</dt>
              <dd>
                {node.activeJobs}/{node.maxConcurrentJobs} 活跃 ·{' '}
                {node.availableCapacity} 可用
              </dd>
            </div>
            <div>
              <dt>最后心跳</dt>
              <dd>
                {new Date(node.lastHeartbeatAt).toLocaleString()} (
                {Math.round(node.heartbeatAgeMs / 1000)} 秒前)
              </dd>
            </div>
            <div>
              <dt>运行版本</dt>
              <dd>{node.runtimeVersion}</dd>
            </div>
          </dl>
        </div>
        <div>
          <h2>能力</h2>
          <p>
            <b>语言</b> {node.capabilities.languageProfiles.join(', ')}
          </p>
          <p>
            <b>检查器</b> {node.capabilities.checkers.join(', ')}
          </p>
          <p>
            <b>执行模式</b> {node.capabilities.executionModes.join(', ')}
          </p>
          <p>
            <b>Sandbox 合约</b> {node.capabilities.sandboxContractVersion}
          </p>
        </div>
      </div>
      <div className="history-grid">
        {(['assignments', 'jobs', 'failures'] as const).map((key) => (
          <div key={key}>
            <h2>{historyLabels[key]}</h2>
            {historyError && !history[key] ? (
              <p className="muted">该历史暂不可用</p>
            ) : history[key]?.length ? (
              <ul>
                {history[key].map((item, i) => (
                  <li key={i}>
                    <code>
                      {String(
                        item.id ?? item.assignmentId ?? item.jobId ?? '记录',
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
  const [policy, setPolicy] = useState<JudgePoolPolicy | null>(null);
  const [hostAvailable, setHostAvailable] = useState(false);
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
        const [s, n, p, cap] = await Promise.all([
          client.summary(),
          client.nodes(),
          client.policy().catch(() => null),
          client
            .lifecycleCapabilities()
            .catch(() => ({ available: false, actions: [] })),
        ]);
        setSummary(s);
        setNodes(n.items);
        setPolicy(p);
        setHostAvailable(cap.available);
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
      `确认${actionLabels[a]} ${target.nodeId}，请输入原因`,
      '例行维护',
    );
    if (!reason) return;
    try {
      if (fixture) {
        setNotice(`已提交${actionLabels[a]}（仅测试合约）`);
        return;
      }
      if (['start', 'stop', 'restart'].includes(a)) {
        await client.lifecycle(
          target.nodeId,
          a as 'start' | 'stop' | 'restart',
          {
            templateId: policy?.templateId ?? 'cpp20-gcc-13-v1',
            reason,
            expectedIncarnation: target.incarnation,
            expectedControlVersion: target.controlVersion,
            idempotencyKey: crypto.randomUUID(),
          },
        );
        setNotice(`操作已提交：${actionLabels[a]}`);
        return;
      }
      const result = await client.mutate(
        target.nodeId,
        a as 'drain' | 'offline' | 'enable',
        {
          reason,
          expectedIncarnation: target.incarnation,
          expectedControlVersion: target.controlVersion,
          idempotencyKey: crypto.randomUUID(),
        },
      );
      setSelected(result.node);
      setNotice(`操作已接受：${result.operationId}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setStale(true);
        setNotice('节点状态已变化，已阻止自动重试。请刷新并重新确认。');
      } else setNotice(actionError(e, '操作失败，请稍后重试'));
    }
  };
  if (loading)
    return (
      <section className="judge-page">
        <span className="sr-only" role="status">
          正在加载 Judge 节点…
        </span>
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
          hostAvailable={hostAvailable}
          onBack={() => setSelected(null)}
          onAction={action}
        />
      </section>
    );
  return (
    <section className="judge-page">
      <header className="judge-page-heading">
        <div>
          <p className="eyebrow">管理 / Judge</p>
          <h1>Judge 节点管理</h1>
          <p className="muted">
            Product 后端快照 ·{' '}
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
            <Metric label="节点总数" value={summary.totalNodes} />
            <Metric label="在线" value={summary.onlineCount} />
            <Metric label="忙碌" value={summary.busyCount} />
            <Metric label="排空中" value={summary.drainingCount} />
            <Metric label="离线" value={summary.offlineCount} />
            <Metric label="异常" value={summary.unhealthyCount} />
            <Metric label="已过期" value={summary.staleNodeCount} />
            <Metric
              label="活跃任务 / 总容量"
              value={`${summary.activeJobs} / ${summary.totalCapacity}`}
            />
            <Metric label="可调度容量" value={summary.schedulableCapacity} />
          </>
        )}
      </div>
      <div className="judge-toolbar pool-controls">
        <strong>节点池模式：{displayPoolMode(policy?.mode)}</strong>
        <span className="muted">
          Host Agent：
          {hostAvailable ? '可用' : '不可用（HOST_AGENT_NOT_AVAILABLE）'}
        </span>
        {canManage && policy && (
          <button
            type="button"
            onClick={() => {
              const mode = policy.mode === 'MANUAL' ? 'AUTOMATIC' : 'MANUAL';
              void client
                .setMode({
                  mode,
                  reason: 'admin mode change',
                  expectedControlVersion: policy.controlVersion,
                  idempotencyKey: crypto.randomUUID(),
                })
                .then((next) => {
                  setPolicy(next);
                  setNotice(`模式已切换为${displayPoolMode(next.mode)}`);
                })
                .catch((e) => setNotice(actionError(e, '模式切换失败')));
            }}
          >
            切换到
            {displayPoolMode(policy.mode === 'MANUAL' ? 'AUTOMATIC' : 'MANUAL')}
          </button>
        )}
        {canManage && hostAvailable && (
          <button
            type="button"
            onClick={() => {
              const templateId = policy?.templateId ?? 'cpp20-gcc-13-v1';
              void client
                .addNode({
                  templateId,
                  count: 1,
                  reason: 'admin add node',
                  idempotencyKey: crypto.randomUUID(),
                })
                .then(() => {
                  setNotice('节点添加已提交');
                  void load();
                })
                .catch((e) => setNotice(actionError(e, '添加节点失败')));
            }}
          >
            添加节点
          </button>
        )}
      </div>
      <div className="judge-toolbar">
        <label>
          搜索节点
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="节点 ID / 状态 / 运行版本"
          />
        </label>
      </div>
      {filtered.length === 0 ? (
        <div className="judge-state">
          <strong>{nodes.length ? '没有匹配节点' : '节点注册表为空'}</strong>
          <p>Product 后端未返回可显示节点。</p>
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
