import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type SandboxQualificationState =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED'
  | 'IMPLEMENTATION_IN_PROGRESS'
  | 'QUALIFICATION_PENDING'
  | 'QUALIFYING'
  | 'QUALIFIED'
  | 'DEGRADED'
  | 'UNAVAILABLE'
  | 'QUALIFICATION_FAILED'
  | 'CLEANUP_FAILED'
  | 'UNKNOWN';

export type SandboxCapabilityState =
  | 'unsupported'
  | 'configured'
  | 'implementation_pending'
  | 'qualification_pending'
  | 'qualified'
  | 'degraded'
  | 'failed';

export type SandboxCapability = {
  id: string;
  label: string;
  state: SandboxCapabilityState;
};

export type SandboxProjection = {
  backendType: string;
  qualificationState: SandboxQualificationState;
  policyVersion: string | null;
  probeSuiteVersion: string | null;
  lastQualificationAt: string | null;
  capabilities: SandboxCapability[];
  failureCategory?: string | null;
  realSubmissionExecution: 'DISABLED' | 'UNQUALIFIED';
};

export type SandboxTransportError = {
  status?: number;
  code?: string;
};

export type SandboxStatusPresentation = {
  label: string;
  tone: 'neutral' | 'progress' | 'success' | 'warning' | 'danger';
  note: string;
  securitySignificant: boolean;
  qualified: boolean;
};

const statusPresentation: Record<
  SandboxQualificationState,
  SandboxStatusPresentation
> = {
  NOT_CONFIGURED: {
    label: 'Sandbox not configured',
    tone: 'neutral',
    note: 'Security qualification is unavailable until a backend is configured.',
    securitySignificant: false,
    qualified: false,
  },
  CONFIGURED: {
    label: 'Sandbox backend configured',
    tone: 'neutral',
    note: 'Configuration is present; security qualification has not completed.',
    securitySignificant: false,
    qualified: false,
  },
  IMPLEMENTATION_IN_PROGRESS: {
    label: 'Sandbox implementation in progress',
    tone: 'progress',
    note: 'The backend is not qualified for real submission execution.',
    securitySignificant: false,
    qualified: false,
  },
  QUALIFICATION_PENDING: {
    label: 'Sandbox qualification pending',
    tone: 'warning',
    note: 'Security qualification has not started or is waiting for an approved probe.',
    securitySignificant: false,
    qualified: false,
  },
  QUALIFYING: {
    label: 'Qualification probe running',
    tone: 'progress',
    note: 'A security qualification probe is running; user source is not executed.',
    securitySignificant: false,
    qualified: false,
  },
  QUALIFIED: {
    label: 'Sandbox security qualified',
    tone: 'success',
    note: 'The server reports a qualified Sandbox policy for the approved probe suite.',
    securitySignificant: false,
    qualified: true,
  },
  DEGRADED: {
    label: 'Sandbox degraded',
    tone: 'warning',
    note: 'Sandbox capability is degraded; real submission execution remains disabled.',
    securitySignificant: true,
    qualified: false,
  },
  UNAVAILABLE: {
    label: 'Sandbox unavailable',
    tone: 'danger',
    note: 'The Sandbox service is unavailable; qualification cannot be trusted.',
    securitySignificant: true,
    qualified: false,
  },
  QUALIFICATION_FAILED: {
    label: 'Sandbox qualification failed',
    tone: 'danger',
    note: 'The approved security qualification did not pass.',
    securitySignificant: true,
    qualified: false,
  },
  CLEANUP_FAILED: {
    label: 'Cleanup verification failed',
    tone: 'danger',
    note: 'Security-significant cleanup failure: the Sandbox cannot be treated as qualified.',
    securitySignificant: true,
    qualified: false,
  },
  UNKNOWN: {
    label: 'Unknown Sandbox state',
    tone: 'neutral',
    note: 'The server returned an unrecognized state; qualification is not assumed.',
    securitySignificant: true,
    qualified: false,
  },
};

export function presentSandboxStatus(state: string): SandboxStatusPresentation {
  return (
    statusPresentation[state as SandboxQualificationState] ??
    statusPresentation.UNKNOWN
  );
}

export function presentCapabilityState(state: string): {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
} {
  switch (state as SandboxCapabilityState) {
    case 'qualified':
      return { label: 'Qualified', tone: 'success' };
    case 'configured':
      return { label: 'Configured', tone: 'neutral' };
    case 'qualification_pending':
      return { label: 'Qualification pending', tone: 'warning' };
    case 'implementation_pending':
      return { label: 'Implementation pending', tone: 'warning' };
    case 'degraded':
      return { label: 'Degraded', tone: 'warning' };
    case 'failed':
      return { label: 'Failed', tone: 'danger' };
    case 'unsupported':
      return { label: 'Unsupported', tone: 'neutral' };
    default:
      return { label: 'Unknown', tone: 'neutral' };
  }
}

function safeValue(
  value: string | null | undefined,
  fallback = 'Not provided',
) {
  if (!value) return fallback;
  if (
    /(PATH|SOURCE|SECRET|TOKEN|MARKER|ROOTFS|RUNC|CGROUP|NAMESPACE|COMMAND|EXECUTABLE|MOUNT)/i.test(
      value,
    )
  )
    return 'Not available in the safe projection';
  return value;
}

export function presentSandboxTransportError(
  error: SandboxTransportError,
): string {
  if (error.status === 401 || error.status === 403 || error.status === 404)
    return 'Sandbox qualification details are not available for this session.';
  if (error.status === 409)
    return 'Sandbox qualification changed on the server. Refresh to view the current state.';
  if (error.status === 422)
    return 'The qualification request was rejected by the current policy.';
  if (typeof error.status === 'number' && error.status >= 500)
    return 'Sandbox qualification service is temporarily unavailable.';
  return 'Sandbox qualification service could not be reached.';
}

export type SandboxQualificationLoadState = {
  projection: SandboxProjection | null;
  loading: boolean;
  error: SandboxTransportError | undefined;
  refresh: () => void;
};

/** The caller supplies the frozen API/Authz-backed loader; this hook owns no fake state. */
export function useSandboxQualification(
  load: () => Promise<SandboxProjection>,
  authorized: boolean,
): SandboxQualificationLoadState {
  const [projection, setProjection] = useState<SandboxProjection | null>(null);
  const [error, setError] = useState<SandboxTransportError>();
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const refresh = useCallback(() => {
    const request = ++sequence.current;
    if (!authorized) {
      setProjection(null);
      setError(undefined);
      return;
    }
    setLoading(true);
    void load()
      .then((next) => {
        if (mounted.current && request === sequence.current) {
          setProjection(next);
          setError(undefined);
        }
      })
      .catch((reason: unknown) => {
        if (mounted.current && request === sequence.current) {
          const status =
            typeof reason === 'object' && reason !== null && 'status' in reason
              ? Number(reason.status)
              : undefined;
          const safeStatus = Number.isFinite(status) ? status : undefined;
          setError(safeStatus === undefined ? {} : { status: safeStatus });
          setProjection(null);
        }
      })
      .finally(() => {
        if (mounted.current && request === sequence.current) setLoading(false);
      });
  }, [authorized, load]);
  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
      sequence.current += 1;
    };
  }, [refresh]);
  return { projection, loading, error, refresh };
}

function CapabilityList({
  capabilities,
}: {
  capabilities: SandboxCapability[];
}) {
  if (!capabilities.length)
    return <p className="muted">No capability projection was provided.</p>;
  return (
    <ul className="sandbox-capabilities">
      {capabilities.map((capability) => {
        const presentation = presentCapabilityState(capability.state);
        return (
          <li key={capability.id}>
            <span>{safeValue(capability.label, 'Unnamed capability')}</span>
            <span className={`sandbox-capability tone-${presentation.tone}`}>
              {presentation.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function SandboxQualificationOverview({
  projection,
  authorized = false,
  error,
  onRefresh,
  refreshing = false,
}: {
  projection?: SandboxProjection | null;
  authorized?: boolean;
  error?: SandboxTransportError;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  if (!authorized)
    return (
      <section className="sandbox-overview" aria-labelledby="sandbox-title">
        <h2 id="sandbox-title">Sandbox qualification</h2>
        <p role="status">Sandbox qualification details are not available.</p>
      </section>
    );
  if (error)
    return (
      <section className="sandbox-overview" aria-labelledby="sandbox-title">
        <h2 id="sandbox-title">Sandbox qualification</h2>
        <p className="error" role="alert">
          {presentSandboxTransportError(error)}
        </p>
        {onRefresh && (
          <button type="button" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh qualification status'}
          </button>
        )}
      </section>
    );
  if (!projection)
    return (
      <section className="sandbox-overview" aria-labelledby="sandbox-title">
        <h2 id="sandbox-title">Sandbox qualification</h2>
        <p role="status">Sandbox qualification status is pending.</p>
      </section>
    );
  const status = presentSandboxStatus(projection.qualificationState);
  return (
    <section className="sandbox-overview" aria-labelledby="sandbox-title">
      <div className="sandbox-heading">
        <div>
          <p className="panel-label">SECURITY QUALIFICATION</p>
          <h2 id="sandbox-title">Sandbox qualification</h2>
        </div>
        {onRefresh && (
          <button type="button" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh status'}
          </button>
        )}
      </div>
      <div
        className={`sandbox-status tone-${status.tone}`}
        role="status"
        aria-label={`${status.label}. ${status.note}`}
      >
        <strong>{status.label}</strong>
        <span>{status.note}</span>
      </div>
      <dl className="sandbox-facts">
        <div>
          <dt>Backend</dt>
          <dd>{safeValue(projection.backendType)}</dd>
        </div>
        <div>
          <dt>Policy version</dt>
          <dd>{safeValue(projection.policyVersion)}</dd>
        </div>
        <div>
          <dt>Probe suite</dt>
          <dd>{safeValue(projection.probeSuiteVersion)}</dd>
        </div>
        <div>
          <dt>Last qualification</dt>
          <dd>{safeValue(projection.lastQualificationAt)}</dd>
        </div>
        <div>
          <dt>Real submission execution</dt>
          <dd>Disabled / unqualified</dd>
        </div>
      </dl>
      {projection.failureCategory && (
        <p className="sandbox-failure" role="alert">
          Safe failure category: {safeValue(projection.failureCategory)}
        </p>
      )}
      <h3>Capability summary</h3>
      <CapabilityList capabilities={projection.capabilities} />
      <p className="muted sandbox-honesty">
        Qualification probes are security checks only. They are not user-code
        execution and do not produce OJ verdicts.
      </p>
    </section>
  );
}

export function SandboxStateCard({
  state,
  children,
}: {
  state: string;
  children?: ReactNode;
}) {
  const status = presentSandboxStatus(state);
  return (
    <div className={`sandbox-status tone-${status.tone}`} role="status">
      <strong>{status.label}</strong>
      <span>{status.note}</span>
      {children}
    </div>
  );
}
