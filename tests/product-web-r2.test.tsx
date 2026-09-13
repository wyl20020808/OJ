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
import type {
  ApiClient,
  AuthMethods,
  AuthenticatedUser,
} from '../apps/web/src/services/api.js';

const problem = {
  id: 'p1',
  slug: 'two-sum',
  title: '两数之和',
  statement: '给定数组。',
  inputDescription: '输入。',
  outputDescription: '输出。',
  examples: [],
  constraints: 'n <= 100',
  timeLimitMs: 1000,
  memoryLimitBytes: 1024,
  visibility: 'public' as const,
  status: 'published' as const,
  testdataVersion: null,
  authorId: null,
  createdAt: '2026-08-31T00:00:00Z',
  updatedAt: '2026-08-31T00:00:00Z',
  difficulty: '入门',
  tags: ['数组'],
};

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

const user: AuthenticatedUser = {
  id: 'guest-1',
  username: 'guest-1',
  email: '',
  displayName: '游客',
  status: 'active',
  guest: true,
};

const response = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('Web V4 R2 problem library and guest contracts', () => {
  it('renders authoritative numeric pagination and syncs page URL', async () => {
    window.history.replaceState({}, '', '/problems');
    const requests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith('/api/auth/me')) return response(401, {});
        if (url.endsWith('/ready')) return response(200, { status: 'ok' });
        if (url.includes('/api/problems?')) {
          const offset = Number(
            new URL(url, window.location.origin).searchParams.get('offset'),
          );
          return response(200, {
            items: [{ ...problem, id: `p-${offset}` }],
            page: { total: 180, offset, limit: 10 },
          });
        }
        return response(404, {});
      }),
    );
    render(<App />);
    expect(
      await screen.findByRole('navigation', { name: '分页' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '第 1 页' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: '第 18 页' }),
    ).toBeInTheDocument();
    expect(screen.getByText('…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '第 2 页' }));
    await waitFor(() => expect(window.location.search).toBe('?page=2'));
    await waitFor(() =>
      expect(requests.some((url) => url.includes('offset=10'))).toBe(true),
    );
    window.history.back();
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(screen.getByRole('button', { name: '第 1 页' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('keeps problem pagination in the list flow and blocks duplicate page loads', async () => {
    window.history.replaceState({}, '', '/problems');
    const requests: string[] = [];
    let resolveNextPage!: (value: ReturnType<typeof response>) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith('/api/auth/me')) return response(401, {});
        if (url.endsWith('/ready')) return response(200, { status: 'ok' });
        if (url.includes('/api/problems?')) {
          const offset = Number(
            new URL(url, window.location.origin).searchParams.get('offset'),
          );
          if (offset === 10) {
            return new Promise((resolve) => {
              resolveNextPage = resolve;
            });
          }
          return response(200, {
            items: [{ ...problem, id: `p-${offset}` }],
            page: { total: 20, offset, limit: 10 },
          });
        }
        return response(404, {});
      }),
    );
    render(<App />);
    const pagination = await screen.findByRole('navigation', { name: '分页' });
    expect(pagination).toHaveClass('pagination', 'problem-list-pagination');
    expect(pagination.previousElementSibling).toHaveClass(
      'problem-list-modern',
    );
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() =>
      expect(requests.filter((url) => url.includes('offset=10'))).toHaveLength(
        1,
      ),
    );
    expect(pagination).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(requests.filter((url) => url.includes('offset=10'))).toHaveLength(1);

    resolveNextPage(
      response(200, {
        items: [{ ...problem, id: 'p-10' }],
        page: { total: 20, offset: 10, limit: 10 },
      }),
    );
    await waitFor(() =>
      expect(pagination).toHaveAttribute('aria-busy', 'false'),
    );
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
  });

  it('keeps guest login truthful when capability is unavailable', async () => {
    const api = {
      authMethods: vi.fn().mockResolvedValue(methods),
      authCapabilities: vi
        .fn()
        .mockResolvedValue({ guestLogin: { available: false } }),
      guestContinue: vi.fn(),
    } as unknown as ApiClient;
    render(
      <AuthExperience
        mode="login"
        api={api}
        onUser={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: '游客登录' }));
    const guest = await screen.findByRole('button', { name: '以游客身份继续' });
    expect(guest).toBeDisabled();
    expect(
      screen.getByText(/GUEST-AUTH-BACKEND-INTEGRATION-REQUEST/),
    ).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(api.guestContinue).not.toHaveBeenCalled();
  });

  it('uses the typed guest endpoint only when capability is available', async () => {
    const onUser = vi.fn();
    const onNavigate = vi.fn();
    const guestContinue = vi.fn().mockResolvedValue(user);
    const api = {
      authMethods: vi.fn().mockResolvedValue(methods),
      authCapabilities: vi
        .fn()
        .mockResolvedValue({ guestLogin: { available: true } }),
      guestContinue,
    } as unknown as ApiClient;
    render(
      <AuthExperience
        mode="register"
        api={api}
        onUser={onUser}
        onNavigate={onNavigate}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: '游客登录' }));
    const guest = await screen.findByRole('button', { name: '以游客身份继续' });
    expect(guest).toBeEnabled();
    fireEvent.click(guest);
    await waitFor(() => expect(guestContinue).toHaveBeenCalledTimes(1));
    expect(onUser).toHaveBeenCalledWith(user);
    expect(onNavigate).toHaveBeenCalledWith('/problems');
  });
});
