import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SandboxQualificationOverview,
  useSandboxQualification,
  type SandboxProjection,
} from './SandboxQualification.js';
import type {
  ApiClient,
  SandboxOverview,
  SandboxProbe,
} from '../services/api.js';

const qualificationProbe = 'SANDBOX_PROBE_QUALIFICATION';
const cancellationProbe = 'SANDBOX_PROBE_CANCELLATION';
const cleanupFailureProbe = 'SANDBOX_PROBE_CLEANUP_FAILURE';

const projection = (value: SandboxOverview): SandboxProjection => ({
  backendType: value.backendType,
  qualificationState:
    value.qualificationState as SandboxProjection['qualificationState'],
  policyVersion: value.policyVersion,
  probeSuiteVersion: value.probeSuiteVersion,
  lastQualificationAt: value.lastQualificationAt,
  capabilities: value.capabilities.map((item) => ({
    id: item.id,
    label: item.label,
    state: item.state as SandboxProjection['capabilities'][number]['state'],
  })),
  ...(value.failureCategory !== undefined
    ? { failureCategory: value.failureCategory }
    : {}),
  realSubmissionExecution: value.realSubmissionExecution,
  activeProbeId: value.activeProbeId,
  lastProbeId: value.lastProbeId,
  lastProbeOutcome: value.lastProbeOutcome,
  lastProbePass: value.lastProbePass,
  lastProbeKind: value.lastProbeKind,
  cleanupStatus: value.cleanupStatus,
});

export function SandboxOperationsPage({
  api,
  authorized,
}: {
  api: ApiClient;
  authorized: boolean;
}) {
  const load = useCallback(
    async () => projection(await api.sandboxOverview()),
    [api],
  );
  const state = useSandboxQualification(load, authorized);
  const error = useMemo(() => state.error, [state.error]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [probes, setProbes] = useState<readonly SandboxProbe[]>([]);
  const polling = state.projection?.qualificationState === 'QUALIFYING';
  const overview = state.projection;
  const hasProbe = (probeId: string) =>
    probes.some((item) => item.probeId === probeId);
  useEffect(() => {
    if (!authorized) {
      setProbes([]);
      return;
    }
    let current = true;
    void api
      .sandboxProbes()
      .then((catalog) => {
        if (current) setProbes(catalog.items);
      })
      .catch(() => {
        if (current) setProbes([]);
      });
    return () => {
      current = false;
    };
  }, [api, authorized]);
  useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(state.refresh, 500);
    return () => window.clearInterval(timer);
  }, [polling, state.refresh]);
  const start = async (probeId: string) => {
    setBusy(true);
    setActionError(false);
    try {
      if (!hasProbe(probeId)) throw new Error('No approved probe');
      await api.startSandboxProbe(probeId);
      await state.refresh();
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    setBusy(true);
    setActionError(false);
    try {
      const activeProbeId = overview?.activeProbeId;
      if (!activeProbeId) throw new Error('No active probe');
      await api.cancelSandboxProbe(activeProbeId);
      await state.refresh();
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  };
  const cleanup = async () => {
    setBusy(true);
    setActionError(false);
    try {
      await api.verifySandboxCleanup();
      await state.refresh();
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  };
  const recover = async () => {
    setBusy(true);
    setActionError(false);
    try {
      await api.recoverSandboxCleanup();
      await state.refresh();
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="page-shell">
      <SandboxQualificationOverview
        projection={state.projection}
        authorized={authorized}
        {...(error ? { error } : {})}
        onRefresh={state.refresh}
        refreshing={state.loading}
      />
      {authorized && state.projection && (
        <div className="sandbox-actions">
          {(state.projection.qualificationState === 'QUALIFICATION_PENDING' ||
            state.projection.qualificationState === 'QUALIFIED') && (
            <button
              type="button"
              onClick={() => void start(qualificationProbe)}
              disabled={busy || !hasProbe(qualificationProbe)}
            >
              启动可信资格探针
            </button>
          )}
          {(state.projection.qualificationState === 'QUALIFICATION_PENDING' ||
            state.projection.qualificationState === 'QUALIFIED') &&
            hasProbe(cancellationProbe) && (
              <button
                type="button"
                onClick={() => void start(cancellationProbe)}
                disabled={busy}
              >
                启动取消探针
              </button>
            )}
          {(state.projection.qualificationState === 'QUALIFICATION_PENDING' ||
            state.projection.qualificationState === 'QUALIFIED') &&
            hasProbe(cleanupFailureProbe) && (
              <button
                type="button"
                onClick={() => void start(cleanupFailureProbe)}
                disabled={busy}
              >
                运行清理失败测试夹具
              </button>
            )}
          {polling && overview?.activeProbeId && (
            <button type="button" onClick={() => void cancel()} disabled={busy}>
              取消可信探针
            </button>
          )}
          {(state.projection.qualificationState === 'CLEANUP_FAILED' ||
            state.projection.qualificationState === 'DEGRADED') && (
            <button
              type="button"
              onClick={() => void cleanup()}
              disabled={busy}
            >
              验证沙箱清理
            </button>
          )}
          {state.projection.qualificationState === 'CLEANUP_FAILED' && (
            <button
              type="button"
              onClick={() => void recover()}
              disabled={busy}
            >
              恢复资格清理
            </button>
          )}
          {overview?.lastProbeId && overview.lastProbePass !== null && (
            <p role="status" aria-label="最近可信探针结果">
              最近可信探针：{overview.lastProbePass ? '通过' : '失败'}
            </p>
          )}
          {actionError && (
            <p className="error" role="alert">
              沙箱操作被服务器拒绝。
            </p>
          )}
        </div>
      )}
    </main>
  );
}
