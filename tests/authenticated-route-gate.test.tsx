// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../apps/web/src/app/App.js';
import { AppNavbar } from '../apps/web/src/components/layout/AppNavbar.js';
import type { ApiClient } from '../apps/web/src/services/api.js';

const response = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

describe('Authenticated route gate', () => {
  it('does not misreport an unavailable auth service as a logged-out session', async () => {
    window.history.pushState({}, '', '/settings');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) =>
        String(input).endsWith('/ready')
          ? response(200, { status: 'ok', dependencies: {} })
          : response(503, {
              code: 'AUTH_UNAVAILABLE',
              message: 'unavailable',
              requestId: 'request-auth-unavailable',
            }),
      ),
    );

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: '账户服务暂不可用' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '请先登录' }),
    ).not.toBeInTheDocument();
  });

  it('blocks a direct contest-create route for an unauthenticated session', async () => {
    window.history.pushState({}, '', '/contests/new');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) =>
        String(input).endsWith('/ready')
          ? response(200, { status: 'ok', dependencies: {} })
          : response(401, {
              code: 'UNAUTHENTICATED',
              message: 'unauthenticated',
              requestId: 'request-unauthenticated',
            }),
      ),
    );

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: '请先登录' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '新建比赛' }),
    ).not.toBeInTheDocument();
  });

  it('does not misreport a Judge capability outage as forbidden', async () => {
    window.history.pushState({}, '', '/admin/judge/nodes');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/ready'))
          return response(200, { status: 'ok', dependencies: {} });
        if (url.endsWith('/api/auth/me'))
          return response(200, {
            id: 'user-1',
            username: 'operator',
            email: 'operator@example.test',
            displayName: 'Operator',
            status: 'active',
          });
        return response(503, {
          code: 'CAPABILITY_UNAVAILABLE',
          message: 'unavailable',
          requestId: 'judge-capability',
        });
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: '权限服务暂不可用' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '没有访问权限' }),
    ).not.toBeInTheDocument();
  });
});

describe('Session logout', () => {
  it('keeps the local session intact when server logout fails', async () => {
    const logout = vi.fn().mockRejectedValue(new Error('offline'));
    const onLogoutComplete = vi.fn();
    render(
      <AppNavbar
        Link={({ to, children, ariaLabel, className }) => (
          <a href={to} aria-label={ariaLabel} className={className}>
            {children}
          </a>
        )}
        api={
          {
            logout,
            unreadNotifications: vi.fn().mockResolvedValue({ count: 0 }),
          } as unknown as ApiClient
        }
        current={{ name: 'home' }}
        user={{
          id: 'user-1',
          username: 'user',
          email: 'user@example.test',
          displayName: 'User',
          status: 'active',
        }}
        canViewJudgeAdmin={false}
        navigate={vi.fn()}
        onLogoutComplete={onLogoutComplete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '退出登录' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '退出失败，请重试',
    );
    expect(onLogoutComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'User' })).toBeInTheDocument();
  });
});
