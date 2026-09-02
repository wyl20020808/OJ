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
  activeProbeId?: string | null;
  lastProbeId?: string | null;
  lastProbeOutcome?: string | null;
  lastProbePass?: boolean | null;
  lastProbeKind?: string | null;
  cleanupStatus?: 'NOT_REQUIRED' | 'PENDING' | 'VERIFIED' | 'FAILED';
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
    label: '沙箱未配置',
    tone: 'neutral',
    note: '配置后端前无法进行安全资格验证。',
    securitySignificant: false,
    qualified: false,
  },
  CONFIGURED: {
    label: '沙箱后端已配置',
    tone: 'neutral',
    note: '配置已存在，但安全资格验证尚未完成。',
    securitySignificant: false,
    qualified: false,
  },
  IMPLEMENTATION_IN_PROGRESS: {
    label: '沙箱实现进行中',
    tone: 'progress',
    note: '后端尚未通过真实提交执行资格验证。',
    securitySignificant: false,
    qualified: false,
  },
  QUALIFICATION_PENDING: {
    label: '沙箱资格待验证',
    tone: 'warning',
    note: '安全资格验证尚未开始，或正在等待已批准的探针。',
    securitySignificant: false,
    qualified: false,
  },
  QUALIFYING: {
    label: '资格探针运行中',
    tone: 'progress',
    note: '安全资格探针正在运行，不会执行用户源码。',
    securitySignificant: false,
    qualified: false,
  },
  QUALIFIED: {
    label: '沙箱安全资格已通过',
    tone: 'success',
    note: '服务器报告已批准探针套件对应的沙箱策略通过验证。',
    securitySignificant: false,
    qualified: true,
  },
  DEGRADED: {
    label: '沙箱能力降级',
    tone: 'warning',
    note: '沙箱能力已降级，真实提交执行仍保持禁用。',
    securitySignificant: true,
    qualified: false,
  },
  UNAVAILABLE: {
    label: '沙箱不可用',
    tone: 'danger',
    note: '沙箱服务不可用，无法信任资格验证结果。',
    securitySignificant: true,
    qualified: false,
  },
  QUALIFICATION_FAILED: {
    label: '沙箱资格验证失败',
    tone: 'danger',
    note: '已批准的安全资格验证未通过。',
    securitySignificant: true,
    qualified: false,
  },
  CLEANUP_FAILED: {
    label: '清理验证失败',
    tone: 'danger',
    note: '发生安全相关的清理失败，沙箱不能视为已通过资格验证。',
    securitySignificant: true,
    qualified: false,
  },
  UNKNOWN: {
    label: '未知沙箱状态',
    tone: 'neutral',
    note: '服务器返回了无法识别的状态，不假定其已通过资格验证。',
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
      return { label: '已通过', tone: 'success' };
    case 'configured':
      return { label: '已配置', tone: 'neutral' };
    case 'qualification_pending':
      return { label: '待验证', tone: 'warning' };
    case 'implementation_pending':
      return { label: '实现待完成', tone: 'warning' };
    case 'degraded':
      return { label: '已降级', tone: 'warning' };
    case 'failed':
      return { label: '失败', tone: 'danger' };
    case 'unsupported':
      return { label: '不支持', tone: 'neutral' };
    default:
      return { label: '未知', tone: 'neutral' };
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
    return '当前会话无法查看沙箱资格详情。';
  if (error.status === 409)
    return '服务器上的沙箱资格状态已变化，请刷新查看最新状态。';
  if (error.status === 422) return '当前策略拒绝了资格验证请求。';
  if (typeof error.status === 'number' && error.status >= 500)
    return '沙箱资格服务暂时不可用。';
  return '无法连接沙箱资格服务。';
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
  if (!capabilities.length) return <p className="muted">未提供能力投影。</p>;
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
        <h2 id="sandbox-title">沙箱资格验证</h2>
        <p role="status">当前会话无法查看沙箱资格详情。</p>
      </section>
    );
  if (error)
    return (
      <section className="sandbox-overview" aria-labelledby="sandbox-title">
        <h2 id="sandbox-title">沙箱资格验证</h2>
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
        <h2 id="sandbox-title">沙箱资格验证</h2>
        <p role="status">沙箱资格状态待确认。</p>
      </section>
    );
  const status = presentSandboxStatus(projection.qualificationState);
  return (
    <section className="sandbox-overview" aria-labelledby="sandbox-title">
      <div className="sandbox-heading">
        <div>
          <p className="panel-label">安全资格验证</p>
          <h2 id="sandbox-title">沙箱资格验证</h2>
        </div>
        {onRefresh && (
          <button type="button" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? '刷新中…' : '刷新状态'}
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
          <dt>后端</dt>
          <dd>{safeValue(projection.backendType)}</dd>
        </div>
        <div>
          <dt>策略版本</dt>
          <dd>{safeValue(projection.policyVersion)}</dd>
        </div>
        <div>
          <dt>探针套件</dt>
          <dd>{safeValue(projection.probeSuiteVersion)}</dd>
        </div>
        <div>
          <dt>最近验证</dt>
          <dd>{safeValue(projection.lastQualificationAt)}</dd>
        </div>
        <div>
          <dt>真实提交执行</dt>
          <dd>已禁用 / 未通过验证</dd>
        </div>
      </dl>
      {projection.failureCategory && (
        <p className="sandbox-failure" role="alert">
          安全失败分类：{safeValue(projection.failureCategory)}
        </p>
      )}
      <h3>能力摘要</h3>
      <CapabilityList capabilities={projection.capabilities} />
      <p className="muted sandbox-honesty">
        资格探针仅用于安全检查，不执行用户代码，也不会产生 OJ 判定结果。
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
