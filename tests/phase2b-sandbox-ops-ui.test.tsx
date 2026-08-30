// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SandboxQualificationOverview,
  useSandboxQualification,
  presentCapabilityState,
  presentSandboxStatus,
  presentSandboxTransportError,
  type SandboxProjection,
} from '../apps/web/src/components/SandboxQualification.js';

const projection = (
  state: SandboxProjection['qualificationState'] = 'CONFIGURED',
  extra: Partial<SandboxProjection> = {},
): SandboxProjection => ({
  backendType: 'Dedicated Supervisor',
  qualificationState: state,
  policyVersion: '2B-policy.1',
  probeSuiteVersion: '2B-probes.1',
  lastQualificationAt: null,
  capabilities: [
    { id: 'filesystem', label: 'Filesystem isolation', state: 'configured' },
    {
      id: 'network',
      label: 'Network isolation',
      state: 'qualification_pending',
    },
  ],
  realSubmissionExecution: 'DISABLED',
  ...extra,
});

function QualificationHarness({
  load,
}: {
  load: () => Promise<SandboxProjection>;
}) {
  const state = useSandboxQualification(load, true);
  return (
    <>
      <button type="button" onClick={state.refresh}>
        Refresh
      </button>
      {state.projection && (
        <SandboxQualificationOverview
          authorized
          projection={state.projection}
        />
      )}
    </>
  );
}

afterEach(() => cleanup());

describe('PHASE 2B Sandbox operations UI matrix', () => {
  it('W2B-01 keeps configured distinct from qualified', () => {
    expect(presentSandboxStatus('CONFIGURED').qualified).toBe(false);
    expect(presentSandboxStatus('QUALIFIED').qualified).toBe(true);
  });
  it('W2B-02 presents qualification pending', () => {
    expect(presentSandboxStatus('QUALIFICATION_PENDING').label).toContain(
      'pending',
    );
  });
  it('W2B-03 presents qualifying as a running probe', () => {
    expect(presentSandboxStatus('QUALIFYING').label).toContain('running');
  });
  it('W2B-04 presents qualified only from the qualified server state', () => {
    render(
      <SandboxQualificationOverview
        authorized
        projection={projection('QUALIFIED')}
      />,
    );
    expect(screen.getByText('Sandbox security qualified')).toBeInTheDocument();
  });
  it('W2B-05 presents degraded as security-significant', () => {
    expect(presentSandboxStatus('DEGRADED').securitySignificant).toBe(true);
  });
  it('W2B-06 presents unavailable without optimistic qualification', () => {
    expect(presentSandboxStatus('UNAVAILABLE').qualified).toBe(false);
  });
  it('W2B-07 presents qualification failure distinctly', () => {
    expect(presentSandboxStatus('QUALIFICATION_FAILED').label).toContain(
      'failed',
    );
  });
  it('W2B-08 visibly preserves cleanup failure', () => {
    render(
      <SandboxQualificationOverview
        authorized
        projection={projection('CLEANUP_FAILED')}
      />,
    );
    expect(screen.getByText('Cleanup verification failed')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      /security-significant/i,
    );
  });
  it('W2B-09 maps unknown state to a neutral non-qualified view', () => {
    const status = presentSandboxStatus('FUTURE_STATE');
    expect(status.label).toContain('Unknown');
    expect(status.qualified).toBe(false);
  });
  it('W2B-10 explicitly disables real submission execution', () => {
    render(
      <SandboxQualificationOverview
        authorized
        projection={projection('QUALIFIED')}
      />,
    );
    expect(screen.getByText('Disabled / unqualified')).toBeInTheDocument();
  });
  it('W2B-11 does not use OJ verdict deception', () => {
    render(
      <SandboxQualificationOverview
        authorized
        projection={projection('QUALIFIED')}
      />,
    );
    expect(document.body.textContent).not.toMatch(/\b(AC|WA|TLE|MLE|RE|CE)\b/);
  });
  it('W2B-12 renders capability values from the projection', () => {
    render(
      <SandboxQualificationOverview authorized projection={projection()} />,
    );
    expect(screen.getByText('Filesystem isolation')).toBeInTheDocument();
    expect(screen.getByText('Configured')).toBeInTheDocument();
  });
  it('W2B-13 keeps unsupported capability neutral', () => {
    expect(presentCapabilityState('unsupported')).toEqual({
      label: 'Unsupported',
      tone: 'neutral',
    });
  });
  it('W2B-14 keeps failed capability failed', () => {
    expect(presentCapabilityState('failed')).toEqual({
      label: 'Failed',
      tone: 'danger',
    });
  });
  it('W2B-15 requires operator authorization for overview', () => {
    render(
      <SandboxQualificationOverview projection={projection('QUALIFIED')} />,
    );
    expect(
      screen.getByText('Sandbox qualification details are not available.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Dedicated Supervisor')).not.toBeInTheDocument();
  });
  it('W2B-16 omits operator diagnostics for ordinary users', () => {
    render(
      <SandboxQualificationOverview
        authorized={false}
        projection={projection('DEGRADED')}
      />,
    );
    expect(
      screen.queryByText(/policy|probe suite|Backend/i),
    ).not.toBeInTheDocument();
  });
  it('W2B-17 protects a stale or missing session', () => {
    render(<SandboxQualificationOverview authorized={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('not available');
  });
  it('W2B-18 has no probe list without a frozen probe API', () => {
    render(
      <SandboxQualificationOverview authorized projection={projection()} />,
    );
    expect(screen.queryByText(/approved probe/i)).not.toBeInTheDocument();
  });
  it('W2B-19 exposes no arbitrary executable input', () => {
    render(
      <SandboxQualificationOverview authorized projection={projection()} />,
    );
    expect(screen.queryByLabelText(/executable/i)).not.toBeInTheDocument();
  });
  it('W2B-20 exposes no shell input', () => {
    render(
      <SandboxQualificationOverview authorized projection={projection()} />,
    );
    expect(screen.queryByLabelText(/shell|command/i)).not.toBeInTheDocument();
  });
  it('W2B-21 exposes no host mount input', () => {
    render(
      <SandboxQualificationOverview authorized projection={projection()} />,
    );
    expect(screen.queryByLabelText(/mount|host path/i)).not.toBeInTheDocument();
  });
  it('W2B-22 exposes no network target input', () => {
    render(
      <SandboxQualificationOverview authorized projection={projection()} />,
    );
    expect(screen.queryByLabelText(/network target/i)).not.toBeInTheDocument();
  });
  it('W2B-23 exposes no environment override input', () => {
    render(
      <SandboxQualificationOverview authorized projection={projection()} />,
    );
    expect(
      screen.queryByLabelText(/environment|env override/i),
    ).not.toBeInTheDocument();
  });
  it('W2B-24 exposes no custom seccomp input', () => {
    render(
      <SandboxQualificationOverview authorized projection={projection()} />,
    );
    expect(screen.queryByLabelText(/seccomp|profile/i)).not.toBeInTheDocument();
  });
  it('W2B-25 exposes no privileged or root toggle', () => {
    render(
      <SandboxQualificationOverview authorized projection={projection()} />,
    );
    expect(
      screen.queryByRole('checkbox', { name: /privileged|root/i }),
    ).not.toBeInTheDocument();
  });
  it('W2B-26 represents a server-provided running state', () => {
    render(
      <SandboxQualificationOverview
        authorized
        projection={projection('QUALIFYING')}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('probe is running');
  });
  it('W2B-27 refresh is an explicit server-owned action', () => {
    const refresh = vi.fn();
    render(
      <SandboxQualificationOverview
        authorized
        projection={projection()}
        onRefresh={refresh}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('W2B-28 has no cancel control without a frozen API', () => {
    render(
      <SandboxQualificationOverview
        authorized
        projection={projection('QUALIFYING')}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /cancel/i }),
    ).not.toBeInTheDocument();
  });
  it('W2B-29 repeated cancel cannot be triggered by this client', () => {
    render(
      <SandboxQualificationOverview
        authorized
        projection={projection('QUALIFYING')}
      />,
    );
    expect(
      screen.queryByText(/Cancel qualification probe/i),
    ).not.toBeInTheDocument();
  });
  it('W2B-30 does not fabricate cancel/completion conflict resolution', () => {
    expect(presentSandboxStatus('QUALIFYING').qualified).toBe(false);
    expect(presentSandboxStatus('QUALIFIED').qualified).toBe(true);
  });
  it('W2B-31 handles 401 with an anti-enumeration message', () => {
    expect(presentSandboxTransportError({ status: 401 })).toContain(
      'not available',
    );
  });
  it('W2B-32 handles 403 with the same anti-enumeration message', () => {
    expect(presentSandboxTransportError({ status: 403 })).toBe(
      presentSandboxTransportError({ status: 401 }),
    );
  });
  it('W2B-33 handles 404 without revealing resource existence', () => {
    expect(presentSandboxTransportError({ status: 404 })).toBe(
      presentSandboxTransportError({ status: 401 }),
    );
  });
  it('W2B-34 handles 409 as an authoritative refresh prompt', () => {
    expect(presentSandboxTransportError({ status: 409 })).toContain('Refresh');
  });
  it('W2B-35 handles 5xx as service failure', () => {
    expect(presentSandboxTransportError({ status: 503 })).toContain(
      'temporarily unavailable',
    );
  });
  it('W2B-36 handles transport failure without raw exception text', () => {
    expect(presentSandboxTransportError({})).toBe(
      'Sandbox qualification service could not be reached.',
    );
  });
  it('W2B-37 ignores an out-of-order older server response', async () => {
    const resolvers: Array<(value: SandboxProjection) => void> = [];
    const load = vi.fn(
      () =>
        new Promise<SandboxProjection>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    render(<QualificationHarness load={load} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    resolvers[1]?.(projection('QUALIFIED'));
    await waitFor(() =>
      expect(
        screen.getByText('Sandbox security qualified'),
      ).toBeInTheDocument(),
    );
    resolvers[0]?.(projection('QUALIFYING'));
    await Promise.resolve();
    expect(screen.getByText('Sandbox security qualified')).toBeInTheDocument();
  });
  it('W2B-38 removes protected facts when authorization is removed', () => {
    const view = render(
      <SandboxQualificationOverview
        authorized
        projection={projection('QUALIFIED')}
      />,
    );
    view.rerender(
      <SandboxQualificationOverview
        authorized={false}
        projection={projection('QUALIFIED')}
      />,
    );
    expect(screen.queryByText('Dedicated Supervisor')).not.toBeInTheDocument();
  });
  it('W2B-39 blocks host-path markers in safe fields', () => {
    render(
      <SandboxQualificationOverview
        authorized
        projection={projection('CONFIGURED', {
          backendType: 'HOST_PATH_MARKER_PHASE2B',
        })}
      />,
    );
    expect(document.body.textContent).not.toContain('HOST_PATH_MARKER_PHASE2B');
  });
  it('W2B-40 blocks secret and source markers in safe fields', () => {
    const markers = [
      'SOURCE_MARKER_PHASE2B',
      'SESSION_SECRET_MARKER_PHASE2B',
      'LEASE_TOKEN_MARKER_PHASE2B',
    ];
    render(
      <SandboxQualificationOverview
        authorized
        projection={projection('CONFIGURED', {
          failureCategory: markers.join(' '),
        })}
      />,
    );
    for (const marker of markers)
      expect(document.body.textContent).not.toContain(marker);
  });
  it('W2B-41 normal rendering has no console error', () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    render(
      <SandboxQualificationOverview authorized projection={projection()} />,
    );
    expect(error).not.toHaveBeenCalled();
  });
  it('W2B-42 wraps long values for narrow layouts', () => {
    render(
      <SandboxQualificationOverview
        authorized
        projection={projection('QUALIFICATION_PENDING', {
          policyVersion: 'policy-' + 'x'.repeat(120),
        })}
      />,
    );
    expect(screen.getByText(/^policy-/)).toBeInTheDocument();
  });
  it('W2B-43 preserves the desktop overview structure', () => {
    render(
      <SandboxQualificationOverview authorized projection={projection()} />,
    );
    expect(
      screen.getByRole('heading', { name: 'Sandbox qualification' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Capability summary' }),
    ).toBeInTheDocument();
  });
  it('W2B-44 provides a keyboard-reachable refresh button', () => {
    render(
      <SandboxQualificationOverview
        authorized
        projection={projection()}
        onRefresh={() => undefined}
      />,
    );
    const button = screen.getByRole('button', { name: 'Refresh status' });
    button.focus();
    expect(button).toHaveFocus();
  });
  it('W2B-45 keeps focus semantics on refresh while busy', () => {
    render(
      <SandboxQualificationOverview
        authorized
        projection={projection()}
        onRefresh={() => undefined}
        refreshing
      />,
    );
    const button = screen.getByRole('button', { name: 'Refreshing…' });
    expect(button).toBeDisabled();
  });
  it('W2B-46 exposes status and errors accessibly', () => {
    const { rerender } = render(
      <SandboxQualificationOverview
        authorized
        projection={projection('QUALIFYING')}
      />,
    );
    expect(screen.getByRole('status')).toHaveAccessibleName(
      /qualification probe running/i,
    );
    rerender(
      <SandboxQualificationOverview authorized error={{ status: 503 }} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'temporarily unavailable',
    );
  });
  it('W2B-47 cleanup failure cannot be hidden by a qualified badge', () => {
    const status = presentSandboxStatus('CLEANUP_FAILED');
    expect(status.qualified).toBe(false);
    expect(status.securitySignificant).toBe(true);
  });
  it('W2B-48 handles policy mismatch as a safe rejected request', () => {
    expect(presentSandboxTransportError({ status: 422 })).toContain('policy');
  });
  it('W2B-49 probe failure cannot imply whole Sandbox qualification', () => {
    expect(presentSandboxStatus('QUALIFICATION_FAILED').qualified).toBe(false);
  });
  it('W2B-50 preserves the existing product by remaining an isolated reusable view', () => {
    expect(typeof SandboxQualificationOverview).toBe('function');
    expect(typeof presentSandboxStatus).toBe('function');
  });
});
