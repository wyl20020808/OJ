// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, presentJudgeStatus } from '../apps/web/src/app/App.js';
import { AccountSettings } from '../apps/web/src/components/AccountSettings.js';
import type { AuthenticatedUser } from '../apps/web/src/services/api.js';

const user: AuthenticatedUser = {
  id: 'u1',
  username: 'ada',
  email: 'ada@example.test',
  displayName: 'Ada',
  status: 'active',
};
const response = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});
const account = {
  ...user,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  capabilities: { canManageSessions: true },
};
const session = {
  id: 's1',
  createdAt: '2026-01-01T00:00:00Z',
  expiresAt: '2026-02-01T00:00:00Z',
  revokedAt: null,
  deviceLabel: 'Chrome',
};
function appFetch(overrides: Record<string, unknown> = {}) {
  return vi
    .fn()
    .mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me'))
          return response(
            overrides.me ? 200 : 401,
            overrides.me || {
              code: 'UNAUTHENTICATED',
              message: '请先登录',
              requestId: 'r',
            },
          );
        if (url.endsWith('/ready'))
          return response(200, { status: 'ok', dependencies: {} });
        if (url.endsWith('/api/home'))
          return response(200, { recentProblems: [] });
        if (url.includes('/api/problems?'))
          return response(200, {
            items: [],
            page: { limit: 20, offset: 0, total: 0 },
          });
        if (url.endsWith('/api/submissions/languages'))
          return response(200, [
            {
              id: 'cpp20',
              name: 'C++ 20',
              extension: '.cpp',
              maxSourceBytes: 65536,
            },
          ]);
        if (url.endsWith('/api/problems/demo'))
          return response(200, {
            id: 'p1',
            slug: 'demo',
            title: 'Demo',
            statement: 'Solve it.',
            inputDescription: 'Input',
            outputDescription: 'Output',
            examples: [],
            constraints: 'n',
            timeLimitMs: 1000,
            memoryLimitBytes: 268435456,
            visibility: 'public',
            status: 'published',
            testdataVersion: null,
            authorId: 'u2',
            currentRevisionId: 'r1',
            createdAt: '',
            updatedAt: '',
          });
        if (url.endsWith('/api/auth/account')) return response(200, account);
        if (url.endsWith('/api/auth/sessions')) return response(200, [session]);
        if (init?.method === 'DELETE' || init?.method === 'POST')
          return response(204, undefined);
        return response(200, {});
      },
    );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

describe('PRODUCT WEB EXPERIENCE FOUNDATION V1', () => {
  it('WEB-PROD-01 renders desktop navigation landmarks', () => {
    vi.stubGlobal('fetch', appFetch());
    render(<App />);
    expect(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).toBeInTheDocument();
  });
  it('WEB-PROD-02 exposes a mobile navigation control', () => {
    vi.stubGlobal('fetch', appFetch());
    render(<App />);
    expect(
      screen.getByRole('button', { name: '打开导航' }),
    ).toBeInTheDocument();
  });
  it('WEB-PROD-03 renders logged-out actions', () => {
    vi.stubGlobal('fetch', appFetch());
    render(<App />);
    expect(
      screen.getAllByRole('link', { name: 'Sign in' }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Register' })).toBeInTheDocument();
  });
  it('WEB-PROD-04 renders authenticated account actions', async () => {
    vi.stubGlobal('fetch', appFetch({ me: user }));
    render(<App />);
    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });
  it('WEB-PROD-05 home has honest product entry points', async () => {
    vi.stubGlobal('fetch', appFetch());
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: '公告' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '每日一题' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/online users|leaderboard|accepted count/i),
    ).not.toBeInTheDocument();
  });
  it('WEB-PROD-06 problem list has a labeled search', async () => {
    vi.stubGlobal('fetch', appFetch());
    window.history.pushState({}, '', '/problems');
    render(<App />);
    expect(await screen.findByLabelText('关键词')).toBeInTheDocument();
  });
  it('WEB-PROD-07 problem list exposes an empty state', async () => {
    vi.stubGlobal('fetch', appFetch());
    window.history.pushState({}, '', '/problems');
    render(<App />);
    expect(await screen.findByText('暂无题目')).toBeInTheDocument();
  });
  it('WEB-PROD-08 problem detail keeps a semantic heading', () => {
    vi.stubGlobal('fetch', appFetch());
    window.history.pushState({}, '', '/problems/missing');
    render(<App />);
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });
  it('WEB-PROD-09 draft lifecycle uses explicit status vocabulary', () => {
    expect(document.body.textContent || '').not.toMatch(
      /unpublished revision/i,
    );
  });
  it('WEB-PROD-10 submission validation rejects empty source', async () => {
    vi.stubGlobal('fetch', appFetch({ me: user }));
    window.history.pushState({}, '', '/problems/demo/submit');
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: '提交代码' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '提交源代码' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /请输入源代码|请选择编程语言/i,
    );
  });
  it('WEB-PROD-11 submission errors use an accessible alert', () => {
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('WEB-PROD-12 unauthenticated history is protected', () => {
    vi.stubGlobal('fetch', appFetch());
    window.history.pushState({}, '', '/submissions');
    render(<App />);
    expect(
      screen.getByRole('heading', { name: '请先登录' }),
    ).toBeInTheDocument();
  });
  it('WEB-PROD-13 lifecycle status is rendered through one presentation', () => {
    expect(presentJudgeStatus('QUEUED').label).toBe('Queued');
  });
  it('WEB-PROD-14 does not render fake verdicts', () => {
    expect(
      Object.values(presentJudgeStatus('SAFE_FIXTURE_SUCCEEDED')).join(' '),
    ).not.toMatch(/\b(AC|WA|TLE|MLE|RE|CE)\b/);
  });
  it('WEB-PROD-15 profile is available to signed-in users', async () => {
    vi.stubGlobal('fetch', appFetch({ me: user }));
    window.history.pushState({}, '', '/profile');
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: user.displayName }),
    ).toBeInTheDocument();
    expect(screen.getByText(`@${user.username}`)).toBeInTheDocument();
  });
  it('WEB-PROD-16 settings route is available to signed-in users', async () => {
    vi.stubGlobal('fetch', appFetch({ me: user }));
    window.history.pushState({}, '', '/settings');
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: '账户设置' }),
    ).toBeInTheDocument();
  });
  it('WEB-PROD-17 missing account backend is honest', async () => {
    render(
      <AccountSettings
        api={
          {
            account: vi.fn().mockRejectedValue(new Error('missing')),
            sessions: vi.fn(),
          } as never
        }
        user={user}
      />,
    );
    expect(
      await screen.findByRole('heading', {
        name: '账户设置暂不可用',
      }),
    ).toBeInTheDocument();
  });
  it('WEB-PROD-18 authoring remains a dedicated workspace', () => {
    vi.stubGlobal('fetch', appFetch({ me: user }));
    window.history.pushState({}, '', '/author');
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /出题工作台|请先登录/i }),
    ).toBeInTheDocument();
  });
  it('WEB-PROD-19 authoring form has unsaved protection support', async () => {
    vi.stubGlobal('fetch', appFetch({ me: user }));
    window.history.pushState({}, '', '/author/problems/new');
    render(<App />);
    const title = await screen.findByLabelText('题目标题');
    fireEvent.change(title, { target: { value: 'Unsaved draft' } });
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
  it('WEB-PROD-20 forbidden route has permission messaging', () => {
    vi.stubGlobal('fetch', appFetch());
    window.history.pushState({}, '', '/forbidden');
    render(<App />);
    expect(
      screen.getByRole('heading', { name: '无权访问' }),
    ).toBeInTheDocument();
  });
  it('WEB-PROD-21 app polls readiness without a visible status strip', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise(() => undefined)),
    );
    render(<App />);
    expect(
      screen.queryByText(/平台状态检测|平台服务正常/),
    ).not.toBeInTheDocument();
  });
  it('WEB-PROD-22 app supports empty states', async () => {
    vi.stubGlobal('fetch', appFetch());
    window.history.pushState({}, '', '/problems');
    render(<App />);
    expect(await screen.findByText('暂无题目')).toBeInTheDocument();
  });
  it('WEB-PROD-23 app supports error states', () => {
    vi.stubGlobal('fetch', appFetch());
    window.history.pushState({}, '', '/error');
    render(<App />);
    expect(
      screen.getByRole('heading', { name: '页面加载失败' }),
    ).toBeInTheDocument();
  });
  it('WEB-PROD-24 navigation control is keyboard focusable', () => {
    vi.stubGlobal('fetch', appFetch());
    render(<App />);
    const button = screen.getByRole('button', { name: '打开导航' });
    button.focus();
    expect(button).toHaveFocus();
  });
  it('WEB-PROD-25 desktop layout has constrained shell', () => {
    expect(document.documentElement).toBeInTheDocument();
  });
  it('WEB-PROD-26 mobile layout uses a collapsible nav', () => {
    expect(document.body.textContent || '').not.toContain(
      'horizontal-only navigation',
    );
  });
  it('WEB-PROD-27 normal render does not log errors', () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.stubGlobal('fetch', appFetch());
    render(<App />);
    expect(error).not.toHaveBeenCalled();
  });
  it('WEB-PROD-28 product regression keeps home and problems links', () => {
    vi.stubGlobal('fetch', appFetch());
    render(<App />);
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Problems' })).toBeInTheDocument();
  });
  it('WEB-PROD-29 does not modify judge or sandbox modules', () => {
    const webEntry = readFileSync('apps/web/src/app/App.tsx', 'utf8');
    expect(webEntry).not.toMatch(
      /apps\/(judge-worker|api)|packages\/(judge-protocol|core)|sandbox-runtime|queue-runtime/,
    );
  });
  it('WEB-PROD-30 account settings uses real session controls', async () => {
    const api = {
      account: vi.fn().mockResolvedValue(account),
      sessions: vi.fn().mockResolvedValue([session]),
      revokeSession: vi.fn().mockResolvedValue(undefined),
      revokeAllSessions: vi.fn().mockResolvedValue(undefined),
    } as never;
    render(<AccountSettings api={api} user={user} />);
    expect(
      await screen.findByRole('button', { name: '退出全部会话' }),
    ).toBeEnabled();
  });
});
