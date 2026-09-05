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
import { App } from '../apps/web/src/app/App.js';
import { AuthExperience } from '../apps/web/src/components/AuthExperience.js';
import {
  ContestExperience,
  MessagesExperience,
} from '../apps/web/src/components/PortalExperience.js';
import type { ApiClient, AuthMethods } from '../apps/web/src/services/api.js';

const methods: AuthMethods = {
  registration: { email: true, phone: true },
  login: {
    emailPassword: true,
    phonePassword: true,
    emailCode: true,
    phoneCode: true,
  },
  providers: {
    wechat: 'not_configured',
    qq: 'not_configured',
    google: 'not_configured',
    github: 'not_configured',
  },
  passwordPolicy: { minLength: 8 },
};

const jsonResponse = (body: unknown, status = 200) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('Web V4 R3 layout and information architecture contract', () => {
  it.each(['login', 'register'] as const)(
    '%s exposes equal-level auth methods',
    async (mode) => {
      const api = {
        authMethods: vi.fn().mockResolvedValue(methods),
        authCapabilities: vi
          .fn()
          .mockResolvedValue({ guestLogin: { available: false } }),
        guestContinue: vi.fn(),
      } as unknown as ApiClient;
      render(
        <AuthExperience
          mode={mode}
          api={api}
          onUser={vi.fn()}
          onNavigate={vi.fn()}
        />,
      );
      const tabs = screen.getByRole('tablist', {
        name: mode === 'login' ? '登录方式' : '注册方式',
      });
      expect(tabs).toHaveTextContent('邮箱/手机号');
      expect(tabs).toHaveTextContent('游客登录');
      expect(tabs.querySelectorAll('[role="tab"]')).toHaveLength(2);
      fireEvent.click(screen.getByRole('tab', { name: '游客登录' }));
      await screen.findByText(/GUEST-AUTH-BACKEND-INTEGRATION-REQUEST/);
      expect(
        screen.getByRole('button', { name: '以游客身份继续' }),
      ).toBeDisabled();
      expect(
        screen.getByText(/GUEST-AUTH-BACKEND-INTEGRATION-REQUEST/),
      ).toBeInTheDocument();
    },
  );

  it('removes the problem heading while preserving breadcrumb, modern rows, and pagination', async () => {
    window.history.replaceState({}, '', '/problems');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) return jsonResponse({}, 401);
        if (url.endsWith('/ready')) return jsonResponse({ status: 'ok' });
        if (url.includes('/api/problems?')) {
          return jsonResponse({
            items: [
              {
                id: 'p1',
                publicId: 'P0001',
                slug: 'p1001',
                title: '两数之和',
                tags: ['数组', '哈希表'],
                difficulty: '入门',
                source: '内部来源不应展示',
              },
            ],
            page: { total: 41, offset: 0, limit: 20 },
          });
        }
        return jsonResponse({}, 404);
      }),
    );
    render(<App />);
    expect(
      await screen.findByRole('navigation', { name: '面包屑' }),
    ).toHaveTextContent('题库');
    expect(
      screen.queryByRole('heading', { name: '题库' }),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('.problem-list-modern .problem-row'),
    ).toBeTruthy();
    expect(screen.getByText('P0001')).toHaveClass('problem-id');
    expect(
      document.querySelector('.problem-list-modern .tag-row'),
    ).toHaveTextContent('数组');
    expect(
      document.querySelector('.problem-list-modern .tag-row'),
    ).toHaveTextContent('哈希表');
    expect(
      document.querySelector('.problem-list-modern .problem-difficulty-chip'),
    ).toHaveTextContent('入门');
    expect(
      document.querySelector('.problem-list-modern .problem-row'),
    ).not.toHaveTextContent('内部来源不应展示');
    expect(screen.getByRole('button', { name: '第 2 页' })).toBeInTheDocument();
  });

  it('keeps contest create action in the internal navigation row', () => {
    render(<ContestExperience view="list" navigate={vi.fn()} />);
    const bar = document.querySelector('.contest-nav-bar');
    expect(bar).toBeTruthy();
    expect(bar?.querySelector('.contest-internal-nav')).toBeTruthy();
    expect(bar?.querySelector('.contest-create-action')).toHaveTextContent(
      '新建比赛',
    );
    expect(
      screen.queryByRole('heading', { name: '比赛' }),
    ).not.toBeInTheDocument();
  });

  it('integrates messaging tabs into the left rail and keeps mobile chat state', () => {
    render(<MessagesExperience />);
    const workspace = document.querySelector('.message-workspace');
    expect(workspace).toBeTruthy();
    const rail = workspace?.querySelector('.conversation-pane');
    expect(rail?.querySelector('.message-modes')).toBeTruthy();
    expect(rail?.querySelector('.conversation-list')).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: '通讯中心' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '通讯录' }));
    expect(workspace).toHaveClass('message-mode-contacts');
    expect(
      screen.getByText(/联系人列表将在真实社交服务接入后显示/),
    ).toBeInTheDocument();
  });

  it('polls readiness without rendering the removed platform status strip', async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith('/api/auth/me')) return jsonResponse({}, 401);
        if (url.endsWith('/ready')) return jsonResponse({ status: 'ok' });
        if (url.includes('/api/home'))
          return jsonResponse({ recentProblems: [] });
        return jsonResponse({}, 404);
      }),
    );
    render(<App />);
    await waitFor(() =>
      expect(requests.some((url) => url.endsWith('/ready'))).toBe(true),
    );
    expect(
      screen.queryByText(/平台状态检测|平台服务正常|平台服务暂不可用/),
    ).not.toBeInTheDocument();
  });
});
