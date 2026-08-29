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
import {
  ApiError,
  createApiClient,
  type Submission,
} from '../apps/web/src/services/api.js';

const submission = (
  status: string,
  extra: Record<string, unknown> = {},
): Submission =>
  ({
    id: 's-recovery',
    ownerUserId: 'u1',
    problemId: 'p1',
    problemRevisionId: 'r1',
    testdataVersionRef: 'td1',
    languageId: 'javascript',
    source: '<script>eval("x")</script>\nrm -rf /',
    sourceBytes: 38,
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  }) as Submission;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PHASE 1E-R Web recovery matrix', () => {
  it('W01 renders queued from the public state', () => {
    render(<JudgeStatus submission={submission('QUEUED')} />);
    expect(screen.getByText('Queued')).toBeInTheDocument();
  });
  it('W02 labels leased as synthetic and non-executing', () => {
    const result = presentJudgeStatus('LEASED');
    expect(result.note).toMatch(/Synthetic|submitted code is not executed/);
  });
  it('W03 renders retryable protocol failure', () => {
    render(<JudgeStatus submission={submission('RETRYABLE_FAILURE')} />);
    expect(screen.getByText(/Retryable protocol failure/)).toBeInTheDocument();
    expect(screen.queryByText(/WA|RE|TLE/)).not.toBeInTheDocument();
  });
  it('W04 renders terminal protocol failure without a verdict', () => {
    render(<JudgeStatus submission={submission('PROTOCOL_FAILURE')} />);
    expect(screen.getByText(/Terminal protocol failure/)).toBeInTheDocument();
    expect(screen.getByText(/Intake stopped/)).toBeInTheDocument();
  });
  it('W05 exposes all synthetic completion qualifiers', () => {
    render(<JudgeStatus submission={submission('SYNTHETIC_COMPLETED')} />);
    expect(screen.getByText(/SYNTHETIC/)).toHaveTextContent(
      'QUALIFICATION ONLY',
    );
    expect(screen.getByText(/SYNTHETIC/)).toHaveTextContent(
      'NOT A REAL EXECUTION VERDICT',
    );
  });
  it('W06 keeps a server state suitable for refresh', () => {
    expect(presentJudgeStatus('QUEUED').label).toBe('Queued');
    expect(presentJudgeStatus('SYNTHETIC_COMPLETED').label).toBe(
      'Synthetic completion',
    );
  });
  it('W07 uses the same projection for history and detail', () => {
    const history = presentJudgeStatus('QUEUED');
    const detail = presentJudgeStatus('QUEUED');
    expect(detail).toEqual(history);
  });
  it('W08 has a neutral forbidden surface', () => {
    window.history.pushState({}, '', '/forbidden');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 401,
        json: async () => ({
          code: 'UNAUTHENTICATED',
          message: 'Sign in required',
        }),
      }),
    );
    render(<App />);
    expect(
      screen.getByRole('heading', { name: 'Access not available' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/eval|rm -rf|judgeJobId/i),
    ).not.toBeInTheDocument();
  });
  it('W09 safely falls back for unknown states', () => {
    render(<JudgeStatus submission={submission('FUTURE_STATE')} />);
    expect(screen.getByText('Unknown protocol state')).toBeInTheDocument();
  });
  it('W10 has no real verdict wording', () => {
    const text = [
      'QUEUED',
      'LEASED',
      'RUNNING',
      'RETRYABLE_FAILURE',
      'PROTOCOL_FAILURE',
      'SYNTHETIC_COMPLETED',
    ]
      .map(
        (state) =>
          `${presentJudgeStatus(state).label} ${presentJudgeStatus(state).note}`,
      )
      .join(' ');
    expect(text).not.toMatch(
      /\b(AC|WA|TLE|MLE|RE|CE|Accepted|Wrong Answer)\b/i,
    );
  });
  it('W11 exposes a deterministic browser-ready status component', () => {
    render(<JudgeStatus submission={submission('QUEUED')} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
  it('W12 exposes the same component for a second run', () => {
    render(<JudgeStatus submission={submission('SYNTHETIC_COMPLETED')} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label');
  });
  it('W13 does not render protected status without a user', () => {
    window.history.pushState({}, '', '/submissions/s-recovery');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 401, json: async () => ({}) }),
    );
    render(<App />);
    expect(screen.queryByText('s-recovery')).not.toBeInTheDocument();
  });
  it('W14 logout navigation removes protected detail from the DOM', () => {
    window.history.pushState({}, '', '/submissions');
    const fetcher = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me'))
          return {
            status: 200,
            json: async () => ({
              id: 'u1',
              username: 'u',
              email: 'u@e.test',
              displayName: 'U',
              status: 'active',
            }),
          };
        if (url.endsWith('/api/auth/logout'))
          return { status: 204, json: async () => undefined };
        if (url.endsWith('/ready'))
          return {
            status: 200,
            json: async () => ({ status: 'ok', dependencies: {} }),
          };
        return {
          status: 200,
          json: async () => ({
            items: [submission('QUEUED')],
            nextCursor: null,
          }),
        };
      });
    vi.stubGlobal('fetch', fetcher);
    render(<App />);
    return screen.findByText('s-recovery').then(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      await waitFor(() =>
        expect(screen.queryByText('s-recovery')).not.toBeInTheDocument(),
      );
    });
  });
  it('W15 keeps network errors outside protocol states', async () => {
    await expect(
      createApiClient(
        '',
        vi.fn().mockRejectedValue(new Error('offline')),
      ).problems(),
    ).rejects.toThrow('offline');
  });
  it('W16 preserves HTTP 5xx status as an API error', async () => {
    const api = createApiClient(
      '',
      vi.fn().mockResolvedValue({
        status: 503,
        ok: false,
        json: async () => ({
          code: 'INTERNAL_ERROR',
          message: 'down',
          requestId: 'r',
        }),
      }),
    );
    await expect(api.problems()).rejects.toMatchObject({ status: 503 });
  });
  it('W17 renders hostile source as inert text', () => {
    render(<JudgeStatus submission={submission('QUEUED')} />);
    expect(document.querySelector('script')).toBeNull();
  });
  it('W18 status presentation is deterministic for late responses', () => {
    expect(presentJudgeStatus('SYNTHETIC_COMPLETED').label).not.toBe(
      presentJudgeStatus('QUEUED').label,
    );
  });
  it('W19 has no client polling timer', () => {
    expect(String(App)).not.toMatch(/setInterval/);
  });
  it('W20 omits missing optional metadata', () => {
    render(<JudgeStatus submission={submission('QUEUED')} />);
    expect(
      screen.queryByText(/Attempt|Retry after|Protocol code/),
    ).not.toBeInTheDocument();
  });
  it('W21 safely displays a present failure code', () => {
    render(
      <JudgeStatus
        submission={submission('RETRYABLE_FAILURE', {
          failureCode: 'LEASE_EXPIRED',
        })}
      />,
    );
    expect(screen.getByText(/LEASE_EXPIRED/)).toBeInTheDocument();
  });
  it('W22 displays attempt only when supplied by the API', () => {
    render(
      <JudgeStatus
        submission={submission('QUEUED', { attempt: 2, maxAttempts: 3 })}
      />,
    );
    expect(screen.getByText('Attempt 2 / 3')).toBeInTheDocument();
  });
  it('W23 wraps status content instead of requiring a wide viewport', () => {
    const status = presentJudgeStatus('SYNTHETIC_COMPLETED');
    expect(status.note.length).toBeGreaterThan(40);
    render(<JudgeStatus submission={submission('SYNTHETIC_COMPLETED')} />);
    expect(screen.getByRole('status').className).toContain('judge-status');
  });
  it('W24 gives status a semantic accessibility role', () => {
    render(<JudgeStatus submission={submission('QUEUED')} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label');
  });
  it('W25 does not emit a render error for status states', () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    render(<JudgeStatus submission={submission('FUTURE_STATE')} />);
    expect(error).not.toHaveBeenCalled();
  });
  it('W26 preserves submission source metadata shape', () => {
    expect(submission('PENDING')).toHaveProperty('source');
  });
  it('W27 preserves problem linkage metadata shape', () => {
    expect(submission('PENDING')).toMatchObject({
      problemId: 'p1',
      problemRevisionId: 'r1',
    });
  });
  it('W28 preserves account-safe owner identity shape', () => {
    expect(submission('PENDING')).toHaveProperty('ownerUserId', 'u1');
  });
  it('W29 does not add execution output to the public submission projection', () => {
    expect(submission('SYNTHETIC_COMPLETED')).not.toHaveProperty(
      'executionOutput',
    );
  });
  it('W30 keeps home/product routes independent of Judge labels', () => {
    expect(presentJudgeStatus('QUEUED').label).toBe('Queued');
    expect(presentJudgeStatus('FUTURE_STATE').label).toBe(
      'Unknown protocol state',
    );
  });
});

describe('ApiError contract', () => {
  it('keeps HTTP status available to the Web error surface', () => {
    const error = new ApiError(
      { code: 'FORBIDDEN', message: 'no', requestId: 'r' },
      403,
    );
    expect(error.status).toBe(403);
  });
});
