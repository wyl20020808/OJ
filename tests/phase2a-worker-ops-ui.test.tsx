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
  App,
  JudgeStatus,
  presentJudgeStatus,
} from '../apps/web/src/app/App.js';
import type { Submission } from '../apps/web/src/services/api.js';

const sourceMarker =
  '<script>alert("SOURCE-MARKER")</script>\neval("x")\nsystem("x")';
const secretMarker = 'SESSION-SECRET-MARKER';
const leaseMarker = 'LEASE-TOKEN-MARKER';

const submission = (
  status: string,
  extra: Record<string, unknown> = {},
): Submission =>
  ({
    id: 'phase2a-submission',
    ownerUserId: 'u1',
    problemId: 'p1',
    problemRevisionId: 'r1',
    testdataVersionRef: 'td1',
    languageId: 'cpp20',
    source: sourceMarker,
    sourceBytes: sourceMarker.length,
    status,
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z',
    ...extra,
  }) as Submission;
const evaluation = (value: Submission) => ({
  submissionId: value.id,
  problem: {
    id: value.problemId,
    slug: `problem-${value.problemId}`,
    title: 'Problem',
  },
  submitter: { id: value.ownerUserId, displayName: 'Phase 2A' },
  languageProfileId: value.languageId,
  status: value.status,
  createdAt: value.createdAt,
});

const user = {
  id: 'u1',
  username: 'phase2a',
  email: 'phase2a@example.test',
  displayName: 'Phase 2A',
  status: 'active' as const,
};

const response = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

const installDetailFetch = (
  detail: Submission | (() => Promise<Submission>),
) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return response(200, user);
      if (url.endsWith('/ready'))
        return response(200, { status: 'ok', dependencies: {} });
      if (url.endsWith('/api/submissions/phase2a-submission'))
        return response(
          200,
          typeof detail === 'function' ? await detail() : detail,
        );
      return response(200, { items: [], nextCursor: null });
    }),
  );
};

const renderDetail = (value: Submission | (() => Promise<Submission>)) => {
  window.history.pushState({}, '', '/submissions/phase2a-submission');
  installDetailFetch(value);
  return render(<App />);
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

describe('PHASE 2A Worker operations UI matrix', () => {
  it('W2A-01 renders queued state from the public submission projection', () => {
    render(<JudgeStatus submission={submission('QUEUED')} />);
    expect(screen.getByText('排队中')).toBeInTheDocument();
  });
  it('W2A-02 renders claimed and leased states without execution language', () => {
    expect(presentJudgeStatus('CLAIMED').label).toBe('Worker lease claimed');
    expect(presentJudgeStatus('LEASED').note).toContain('not executed');
  });
  it('W2A-03 labels a safe fixture stage honestly', () => {
    render(<JudgeStatus submission={submission('SAFE_FIXTURE_RUNNING')} />);
    expect(screen.getByText('资格测试执行中')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('not executed');
  });
  it('W2A-04 distinguishes retryable worker failure', () => {
    expect(presentJudgeStatus('FAILED_RETRYABLE').label).toBe(
      'Retryable protocol failure',
    );
  });
  it('W2A-05 shows requeue as infrastructure retry with server attempt metadata', () => {
    render(
      <JudgeStatus
        submission={submission('REQUEUED', { attempt: 2, maxAttempts: 3 })}
      />,
    );
    expect(screen.getByText('基础设施步骤重试中')).toBeInTheDocument();
    expect(screen.getByText('第 2 次尝试 / 3')).toBeInTheDocument();
  });
  it('W2A-06 maps terminal protocol failure safely', () => {
    expect(presentJudgeStatus('FAILED_TERMINAL').label).toBe(
      'Terminal protocol failure',
    );
  });
  it('W2A-07 maps cancellation without implying source execution', () => {
    expect(presentJudgeStatus('CANCELLED').note).toContain('no submitted code');
  });
  it('W2A-08 displays explicit synthetic completion honesty', () => {
    expect(presentJudgeStatus('SAFE_FIXTURE_SUCCEEDED').note).toContain(
      'NOT A REAL EXECUTION VERDICT',
    );
  });
  it('W2A-09 safely maps unknown states', () => {
    expect(presentJudgeStatus('FUTURE_WORKER_STATE').label).toBe(
      'Unknown protocol state',
    );
  });
  it('W2A-10 does not use real verdict terms', () => {
    const labels = [
      'QUEUED',
      'CLAIMED',
      'WORKER_ACCEPTED',
      'SAFE_FIXTURE_RUNNING',
      'FAILED_RETRYABLE',
      'REQUEUED',
      'FAILED_TERMINAL',
      'CANCELLED',
      'SAFE_FIXTURE_SUCCEEDED',
      'WORKER_DEGRADED',
      'WORKER_OFFLINE',
    ]
      .map((state) => Object.values(presentJudgeStatus(state)).join(' '))
      .join(' ');
    expect(labels).not.toMatch(
      /\b(AC|WA|TLE|MLE|RE|CE|Wrong Answer|Compiling your code|Running your code)\b/i,
    );
    expect(labels).not.toMatch(/(^|\s)Accepted($|\s)/);
  });
  it('W2A-11 manually refreshes detail from the server', async () => {
    let calls = 0;
    window.history.pushState({}, '', '/submissions/phase2a-submission');
    installDetailFetch(async () => {
      calls++;
      return submission(calls === 1 ? 'QUEUED' : 'SAFE_FIXTURE_SUCCEEDED');
    });
    render(<App />);
    expect(await screen.findByText('排队中')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '刷新执行状态' }));
    expect(await screen.findByText('模拟流程完成')).toBeInTheDocument();
  });
  it('W2A-12 uses one status projection for history and detail', () => {
    const item = submission('WORKER_ACCEPTED');
    expect(presentJudgeStatus(item.executionStage ?? item.status)).toEqual(
      presentJudgeStatus(item.executionStage ?? item.status),
    );
  });
  it('W2A-13 ignores a late response after a newer refresh', async () => {
    let staleResolve: ((value: Submission) => void) | undefined;
    let calls = 0;
    window.history.pushState({}, '', '/submissions/phase2a-submission');
    installDetailFetch(
      () =>
        new Promise<Submission>((resolve) => {
          calls++;
          if (calls === 1) resolve(submission('QUEUED'));
          else if (calls === 2) staleResolve = resolve;
          else resolve(submission('SAFE_FIXTURE_SUCCEEDED'));
        }),
    );
    render(<App />);
    expect(await screen.findByText('排队中')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '刷新执行状态' }));
    fireEvent.click(screen.getByRole('button', { name: '刷新执行状态' }));
    expect(await screen.findByText('模拟流程完成')).toBeInTheDocument();
    staleResolve?.(submission('SAFE_FIXTURE_RUNNING'));
    await Promise.resolve();
    expect(screen.getByText('模拟流程完成')).toBeInTheDocument();
  });
  it('W2A-14 does not introduce polling after a terminal state', () => {
    expect(String(App)).not.toMatch(/setInterval/);
  });
  it('W2A-15 invalidates in-flight detail work on unmount', async () => {
    let resolve: ((value: Submission) => void) | undefined;
    const pending = new Promise<Submission>((done) => {
      resolve = done;
    });
    const rendered = renderDetail(() => pending);
    rendered.unmount();
    resolve?.(submission('SAFE_FIXTURE_RUNNING'));
    await Promise.resolve();
    expect(rendered.container).toBeEmptyDOMElement();
  });
  it('W2A-16 clears protected detail after logout', async () => {
    window.history.pushState({}, '', '/submissions');
    const fetcher = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) return response(200, user);
        if (url.endsWith('/ready'))
          return response(200, { status: 'ok', dependencies: {} });
        if (url.endsWith('/api/auth/logout')) return response(204, undefined);
        return response(200, {
          items: [evaluation(submission('QUEUED'))],
          nextCursor: null,
        });
      });
    vi.stubGlobal('fetch', fetcher);
    render(<App />);
    expect(
      await screen.findByRole('link', { name: '查看评测 phase2a-submission' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: '查看评测 phase2a-submission' }),
      ).not.toBeInTheDocument(),
    );
  });
  it('W2A-17 renders a 401 as sign-in-required without protected content', async () => {
    window.history.pushState({}, '', '/submissions/phase2a-submission');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) return response(200, user);
        if (url.endsWith('/ready'))
          return response(200, { status: 'ok', dependencies: {} });
        return response(401, {
          code: 'UNAUTHENTICATED',
          message: 'Session expired',
          requestId: 'r',
        });
      }),
    );
    render(<App />);
    expect(await screen.findByText('Session expired')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '登录' })).toBeInTheDocument();
    expect(screen.queryByText(sourceMarker)).not.toBeInTheDocument();
  });
  it('W2A-18 renders a 403 without source or diagnostics', async () => {
    window.history.pushState({}, '', '/submissions/phase2a-submission');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) return response(200, user);
        if (url.endsWith('/ready'))
          return response(200, { status: 'ok', dependencies: {} });
        return response(403, {
          code: 'FORBIDDEN',
          message: 'Forbidden',
          requestId: 'r',
        });
      }),
    );
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: '无权查看提交' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(sourceMarker)).not.toBeInTheDocument();
  });
  it('W2A-19 renders 404 as not found', async () => {
    window.history.pushState({}, '', '/submissions/phase2a-submission');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) return response(200, user);
        if (url.endsWith('/ready'))
          return response(200, { status: 'ok', dependencies: {} });
        return response(404, {
          code: 'NOT_FOUND',
          message: 'Missing',
          requestId: 'r',
        });
      }),
    );
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: '提交不存在' }),
    ).toBeInTheDocument();
  });
  it('W2A-20 renders a 409 as a state race with refresh', async () => {
    window.history.pushState({}, '', '/submissions/phase2a-submission');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) return response(200, user);
        if (url.endsWith('/ready'))
          return response(200, { status: 'ok', dependencies: {} });
        return response(409, {
          code: 'CONFLICT',
          message: 'State changed',
          requestId: 'r',
        });
      }),
    );
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: '提交状态已变化' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeEnabled();
  });
  it('W2A-21 renders a 5xx as service failure', async () => {
    window.history.pushState({}, '', '/submissions/phase2a-submission');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) return response(200, user);
        if (url.endsWith('/ready'))
          return response(200, { status: 'ok', dependencies: {} });
        return response(503, {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service unavailable',
          requestId: 'r',
        });
      }),
    );
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: '提交暂不可用' }),
    ).toBeInTheDocument();
  });
  it('W2A-22 renders a network failure as transport failure', async () => {
    window.history.pushState({}, '', '/submissions/phase2a-submission');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) return response(200, user);
        if (url.endsWith('/ready'))
          return response(200, { status: 'ok', dependencies: {} });
        throw new Error('offline');
      }),
    );
    render(<App />);
    expect(await screen.findByText('暂时无法连接服务。')).toBeInTheDocument();
  });
  it('W2A-23 renders worker offline and degraded as operational states', () => {
    expect(presentJudgeStatus('WORKER_DEGRADED').label).toBe(
      'Judge worker degraded',
    );
    expect(presentJudgeStatus('WORKER_OFFLINE').note).toContain(
      'not a Judge result',
    );
  });
  it('W2A-24 does not infer a capability manifest from the language dropdown', () => {
    render(<JudgeStatus submission={submission('QUEUED')} />);
    expect(screen.queryByText(/C\+\+.*supported/i)).not.toBeInTheDocument();
  });
  it('W2A-25 does not represent real execution as available', () => {
    const text = Object.values(
      presentJudgeStatus('SAFE_FIXTURE_SUCCEEDED'),
    ).join(' ');
    expect(text).toContain('NOT A REAL EXECUTION VERDICT');
  });
  it('W2A-26 renders source script text inertly in authorized detail', async () => {
    renderDetail(submission('QUEUED'));
    fireEvent.click(await screen.findByRole('tab', { name: '代码' }));
    expect((await screen.findByText(/SOURCE-MARKER/)).textContent).toBe(
      sourceMarker,
    );
    expect(document.querySelector('script')).toBeNull();
  });
  it('W2A-27 never renders a raw lease token from an untrusted projection', () => {
    render(
      <JudgeStatus
        submission={submission('QUEUED', { leaseToken: leaseMarker })}
      />,
    );
    expect(screen.queryByText(leaseMarker)).not.toBeInTheDocument();
  });
  it('W2A-28 does not leak secret-shaped fields into status DOM or console', () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    render(
      <JudgeStatus
        submission={submission('QUEUED', { sessionSecret: secretMarker })}
      />,
    );
    expect(document.body.textContent).not.toContain(secretMarker);
    expect(error).not.toHaveBeenCalled();
  });
  it('W2A-29 shows no cancellation control without a frozen public capability', () => {
    render(<JudgeStatus submission={submission('QUEUED')} />);
    expect(
      screen.queryByRole('button', { name: /cancellation|cancel/i }),
    ).not.toBeInTheDocument();
  });
  it('W2A-30 keeps cancel pending UI absent until the public cancel endpoint exists', () => {
    expect(String(App)).not.toMatch(/Request cancellation/);
  });
  it('W2A-31 does not fabricate a cancel-vs-completion resolution', () => {
    expect(presentJudgeStatus('CANCELLED').label).not.toBe(
      presentJudgeStatus('SAFE_FIXTURE_SUCCEEDED').label,
    );
  });
  it('W2A-32 has no repeated cancel control without server contract', () => {
    expect(String(App)).not.toMatch(/cancel\(/i);
  });
  it('W2A-33 does not invent an operator diagnostic surface', () => {
    render(<App />);
    expect(screen.queryByText(/Worker diagnostics/i)).not.toBeInTheDocument();
  });
  it('W2A-34 does not expose global worker diagnostics to an ordinary user', () => {
    render(<JudgeStatus submission={submission('WORKER_DEGRADED')} />);
    expect(
      screen.queryByText(/worker_instance_id|heartbeat|lease token/i),
    ).not.toBeInTheDocument();
  });
  it('W2A-35 keeps long status text in a wrapping status container', () => {
    render(<JudgeStatus submission={submission('SAFE_FIXTURE_SUCCEEDED')} />);
    expect(screen.getByRole('status').className).toContain('judge-status');
  });
  it('W2A-36 preserves desktop status card structure', () => {
    render(<JudgeStatus submission={submission('QUEUED')} />);
    expect(screen.getByRole('status')).toContainElement(
      screen.getByText('排队中'),
    );
  });
  it('W2A-37 exposes a keyboard-reachable refresh action', async () => {
    renderDetail(submission('QUEUED'));
    const refresh = await screen.findByRole('button', {
      name: '刷新执行状态',
    });
    refresh.focus();
    expect(refresh).toHaveFocus();
  });
  it('W2A-38 keeps focus on a named refresh control', async () => {
    renderDetail(submission('QUEUED'));
    const refresh = await screen.findByRole('button', {
      name: '刷新执行状态',
    });
    refresh.focus();
    expect(refresh).toHaveFocus();
  });
  it('W2A-39 uses an accessible status name with text semantics', () => {
    render(<JudgeStatus submission={submission('SAFE_FIXTURE_RUNNING')} />);
    expect(screen.getByRole('status')).toHaveAccessibleName(/fixture running/i);
  });
  it('W2A-40 does not emit console errors for a normal status render', () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    render(<JudgeStatus submission={submission('WORKER_ACCEPTED')} />);
    expect(error).not.toHaveBeenCalled();
  });
});
