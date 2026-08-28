// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  App,
  ErrorBoundary,
  Forbidden,
  GenericError,
  NotFound,
  presentJudgeStatus,
} from '../apps/web/src/app/App.js';

describe('Web platform shell', () => {
  afterEach(() => {
    cleanup();
  });
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  it('maps protocol states to safe UX and never to execution verdicts', () => {
    expect(presentJudgeStatus('QUEUED').label).toBe('Queued');
    expect(presentJudgeStatus('LEASED').label).toBe('Leased');
    expect(presentJudgeStatus('RUNNING').note).toContain('Synthetic');
    expect(presentJudgeStatus('RETRYABLE_FAILURE').label).toContain(
      'Retryable',
    );
    expect(presentJudgeStatus('PROTOCOL_FAILURE').label).toContain('Terminal');
    expect(presentJudgeStatus('SYNTHETIC_COMPLETED').note).toContain(
      'NOT A REAL EXECUTION VERDICT',
    );
    expect(presentJudgeStatus('FUTURE_STATE').label).toBe(
      'Unknown protocol state',
    );
    const labels = [
      'QUEUED',
      'LEASED',
      'RUNNING',
      'RETRYABLE_FAILURE',
      'PROTOCOL_FAILURE',
      'SYNTHETIC_COMPLETED',
    ].map((state) => presentJudgeStatus(state).label);
    expect(labels.join(' ')).not.toMatch(/\b(AC|WA|TLE|MLE|RE|CE)\b/);
  });
  it('renders loading then healthy state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ status: 'ok', dependencies: {} }),
      }),
    );
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking platform readiness',
    );
    expect(await screen.findByText('Platform is ready.')).toBeInTheDocument();
  });
  it('renders an accessible error state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
  });
  it('renders a controlled degraded readiness state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 503,
        json: async () => ({
          status: 'not_ready',
          dependencies: { redis: 'unavailable' },
        }),
      }),
    );
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('not ready');
  });
  it('renders controlled not-found UI', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading')).toHaveTextContent('Page not found');
  });
  it('renders stable forbidden and generic error states', () => {
    render(
      <>
        <Forbidden />
        <GenericError />
      </>,
    );
    expect(
      screen.getByRole('heading', { name: 'Access not available' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
  });
  it('catches render failures at the application boundary', () => {
    const Broken = () => {
      throw new Error('render failure');
    };
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('could not render');
  });
  it('protects the authoring workspace when unauthenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me'))
          return {
            status: 401,
            json: async () => ({
              code: 'UNAUTHENTICATED',
              message: 'Sign in required',
              requestId: 'r1',
            }),
          };
        return {
          status: 200,
          json: async () => ({ status: 'ok', dependencies: {} }),
        };
      }),
    );
    window.history.pushState({}, '', '/author');
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Sign in required' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Sign in' })[1]).toHaveAttribute(
      'href',
      '/login',
    );
  });
  it('validates and saves a new draft through the typed client', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url.endsWith('/api/auth/me'))
            return {
              status: 200,
              json: async () => ({
                id: 'u1',
                username: 'author',
                email: 'a@example.com',
                displayName: 'Author',
                status: 'active',
              }),
            };
          if (url.endsWith('/ready'))
            return {
              status: 200,
              json: async () => ({ status: 'ok', dependencies: {} }),
            };
          if (url.endsWith('/api/problems') && init?.method === 'POST')
            return {
              status: 201,
              json: async () => ({
                id: 'p1',
                slug: 'hello-world',
                title: 'Hello World',
                status: 'draft',
                visibility: 'private',
                statement: 's',
                inputDescription: 'i',
                outputDescription: 'o',
                constraints: 'c',
                examples: [],
                timeLimitMs: 1000,
                memoryLimitBytes: 1024,
                notes: '',
                authorId: 'u1',
                testdataVersion: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }),
            };
          return {
            status: 200,
            json: async () => ({
              items: [],
              page: { total: 0, offset: 0, limit: 100 },
            }),
          };
        },
      );
    vi.stubGlobal('fetch', fetcher);
    window.history.pushState({}, '', '/author/problems/new');
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Create problem' }),
    ).toBeInTheDocument();
    fireEvent.submit(
      screen.getByRole('button', { name: 'Save draft' }).closest('form')!,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Complete all required fields',
    );
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Hello World' },
    });
    fireEvent.change(screen.getByLabelText('Slug'), {
      target: { value: 'hello-world' },
    });
    fireEvent.change(screen.getByLabelText('Statement'), {
      target: { value: 's' },
    });
    fireEvent.change(screen.getByLabelText('Input description'), {
      target: { value: 'i' },
    });
    fireEvent.change(screen.getByLabelText('Output description'), {
      target: { value: 'o' },
    });
    fireEvent.change(screen.getByLabelText('Constraints'), {
      target: { value: 'c' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/api/problems',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });
  it('submits source through intake contract without presenting a verdict', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url.endsWith('/api/auth/me'))
            return {
              status: 200,
              json: async () => ({
                id: 'u1',
                username: 'u',
                email: 'u@example.com',
                displayName: 'User',
                status: 'active',
              }),
            };
          if (url.endsWith('/ready'))
            return {
              status: 200,
              json: async () => ({ status: 'ok', dependencies: {} }),
            };
          if (url.endsWith('/api/submissions/languages'))
            return {
              status: 200,
              json: async () => [
                {
                  id: 'python',
                  name: 'Python 3',
                  extension: '.py',
                  maxSourceBytes: 10000,
                },
              ],
            };
          if (url.endsWith('/api/problems/demo'))
            return {
              status: 200,
              json: async () => ({
                id: 'p1',
                slug: 'demo',
                title: 'Demo',
                statement: 'Solve',
                inputDescription: 'in',
                outputDescription: 'out',
                constraints: 'n',
                examples: [],
                timeLimitMs: 1000,
                memoryLimitBytes: 1024,
                visibility: 'public',
                status: 'published',
                testdataVersion: 'td1',
                authorId: 'u2',
                createdAt: '',
                updatedAt: '',
                revisionId: 'rev1',
              }),
            };
          if (url.endsWith('/api/submissions') && init?.method === 'POST')
            return {
              status: 201,
              json: async () => ({
                id: 'sub1',
                ownerUserId: 'u1',
                problemId: 'p1',
                problemRevisionId: 'rev1',
                testdataVersionRef: 'td1',
                languageId: 'python',
                source: 'print(1)',
                sourceBytes: 8,
                status: 'PENDING',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }),
            };
          return {
            status: 200,
            json: async () => ({ items: [], nextCursor: null }),
          };
        },
      );
    vi.stubGlobal('fetch', fetcher);
    window.history.pushState({}, '', '/problems/demo/submit');
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Submit solution' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Source code'), {
      target: { value: 'print(1)' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit source' }));
    expect(
      await screen.findByRole('heading', { name: 'Submission received' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/PENDING/)).toBeInTheDocument();
    expect(
      screen.queryByText(/ACCEPTED|WRONG ANSWER|RUNTIME ERROR/i),
    ).not.toBeInTheDocument();
  });
  it('renders submission history and safely displays source as text', async () => {
    const submission = {
      id: 'sub-x',
      ownerUserId: 'u1',
      problemId: 'p1',
      problemRevisionId: 'rev1',
      testdataVersionRef: null,
      languageId: 'javascript',
      source: '<script>alert(1)</script>',
      sourceBytes: 25,
      status: 'QUEUED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me'))
          return {
            status: 200,
            json: async () => ({
              id: 'u1',
              username: 'u',
              email: 'u@example.com',
              displayName: 'User',
              status: 'active',
            }),
          };
        if (url.endsWith('/ready'))
          return {
            status: 200,
            json: async () => ({ status: 'ok', dependencies: {} }),
          };
        if (url.endsWith('/api/submissions/sub-x'))
          return { status: 200, json: async () => submission };
        return {
          status: 200,
          json: async () => ({ items: [submission], nextCursor: null }),
        };
      }),
    );
    window.history.pushState({}, '', '/submissions');
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'My submissions' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'sub-x' }));
    expect(
      await screen.findByRole('heading', { name: 'sub-x' }),
    ).toBeInTheDocument();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });
});
