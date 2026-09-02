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
  it('polls readiness without rendering a platform status strip', async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        requests.push(String(input));
        return {
          status: 200,
          json: async () => ({ status: 'ok', dependencies: {} }),
        };
      }),
    );
    render(<App />);
    await waitFor(() =>
      expect(requests.some((url) => url.endsWith('/ready'))).toBe(true),
    );
    expect(
      screen.queryByText(/平台状态检测|平台服务正常/),
    ).not.toBeInTheDocument();
  });
  it('keeps readiness errors out of page content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '公告' })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/平台服务|平台状态检测/)).not.toBeInTheDocument();
  });
  it('keeps degraded readiness out of page content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 503,
        json: async () => ({
          status: 'not_ready',
          dependencies: { redis: '不可用' },
        }),
      }),
    );
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '公告' })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/尚未完全就绪|平台服务/)).not.toBeInTheDocument();
  });
  it('renders controlled not-found UI', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading')).toHaveTextContent('页面不存在');
  });
  it('renders stable forbidden and generic error states', () => {
    render(
      <>
        <Forbidden />
        <GenericError />
      </>,
    );
    expect(
      screen.getByRole('heading', { name: '无权访问' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '页面加载失败' }),
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
    expect(screen.getByRole('alert')).toHaveTextContent('应用未能正常渲染');
  });
  it('retires the former authoring dashboard route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me'))
          return {
            status: 401,
            json: async () => ({
              code: 'UNAUTHENTICATED',
              message: '请先登录',
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
      await screen.findByRole('heading', { name: '页面不存在' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute(
      'href',
      '/',
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
      await screen.findByRole('heading', { name: '创建题目' }),
    ).toBeInTheDocument();
    fireEvent.submit(
      screen.getByRole('button', { name: '保存草稿' }).closest('form')!,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '请先填写所有必填字段',
    );
    fireEvent.change(screen.getByLabelText('题目标题'), {
      target: { value: 'Hello World' },
    });
    fireEvent.change(screen.getByLabelText('题目标识'), {
      target: { value: 'hello-world' },
    });
    fireEvent.change(screen.getByLabelText('题面'), {
      target: { value: 's' },
    });
    fireEvent.change(screen.getByLabelText('输入说明'), {
      target: { value: 'i' },
    });
    fireEvent.change(screen.getByLabelText('输出说明'), {
      target: { value: 'o' },
    });
    fireEvent.change(screen.getByLabelText('数据范围'), {
      target: { value: 'c' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }));
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
      await screen.findByRole('heading', { name: '提交代码' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('源代码'), {
      target: { value: 'print(1)' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提交源代码' }));
    expect(
      await screen.findByRole('heading', { name: '提交已接收' }),
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
    const evaluation = {
      submissionId: submission.id,
      problem: {
        id: submission.problemId,
        slug: 'problem-p1',
        title: 'Problem p1',
      },
      submitter: { id: submission.ownerUserId, displayName: 'User' },
      languageProfileId: submission.languageId,
      status: submission.status,
      createdAt: submission.createdAt,
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
          json: async () => ({ items: [evaluation], nextCursor: null }),
        };
      }),
    );
    window.history.pushState({}, '', '/submissions');
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: '评测列表' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '查看评测 sub-x' }));
    expect(
      await screen.findByRole('heading', { name: 'Submission #sub-x' }),
    ).toBeInTheDocument();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });
});
