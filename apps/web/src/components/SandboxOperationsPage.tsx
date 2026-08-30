import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SandboxQualificationOverview,
  useSandboxQualification,
  type SandboxProjection,
} from './SandboxQualification.js';
import type { ApiClient, SandboxOverview } from '../services/api.js';

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
  const active = state.projection?.qualificationState === 'QUALIFYING';
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(state.refresh, 500);
    return () => window.clearInterval(timer);
  }, [active, state.refresh]);
  const start = async () => {
    setBusy(true);
    setActionError(false);
    try {
      const catalog = await api.sandboxProbes();
      const first = catalog.items[0];
      if (!first) throw new Error('No approved probe');
      await api.startSandboxProbe(first.probeId);
      state.refresh();
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
      await api.cancelSandboxProbe('SANDBOX_PROBE_QUALIFICATION');
      state.refresh();
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
      state.refresh();
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
            <button type="button" onClick={() => void start()} disabled={busy}>
              Start trusted qualification probe
            </button>
          )}
          {active && (
            <button type="button" onClick={() => void cancel()} disabled={busy}>
              Cancel trusted probe
            </button>
          )}
          {(state.projection.qualificationState === 'CLEANUP_FAILED' ||
            state.projection.qualificationState === 'DEGRADED') && (
            <button
              type="button"
              onClick={() => void cleanup()}
              disabled={busy}
            >
              Verify Sandbox cleanup
            </button>
          )}
          {actionError && (
            <p className="error" role="alert">
              Sandbox operation was rejected by the server.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
