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
import { ProfileExperience } from '../apps/web/src/components/PortalExperience.js';
import {
  createApiClient,
  type AuthenticatedUser,
  type ProfileCapabilities,
} from '../apps/web/src/services/api.js';

const user: AuthenticatedUser = {
  id: 'u1',
  username: 'ada',
  email: 'ada@example.test',
  displayName: 'Ada',
  status: 'active',
};

const capabilities = (overrides: Partial<ProfileCapabilities> = {}) => ({
  contractVersion: 'profile-capabilities-v1',
  favorites: { available: true },
  myContests: { available: true },
  myProblems: { available: true },
  activity: {
    available: false,
    reason: 'NO_AUTHORITATIVE_PRODUCT_ACTIVITY_SOURCE',
  },
  heatmap: {
    available: false,
    reason: 'UPSTREAM_BLOCKED_BY_AUTHORITATIVE_SUBMISSION_OUTCOME',
  },
  teams: { available: false, reason: 'PRODUCT_DOMAIN_NOT_IMPLEMENTED' },
  homework: { available: false, reason: 'PRODUCT_DOMAIN_NOT_IMPLEMENTED' },
  wrongbook: {
    available: false,
    reason: 'UPSTREAM_BLOCKED_BY_AUTHORITATIVE_SUBMISSION_OUTCOME',
  },
  ...overrides,
});

const response = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

function profileApi(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  return createApiClient('', vi.fn(handler as typeof fetch));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WEB Profile ↔ Backend requalification', () => {
  it('uses the Profile capability, public profile, and projection routes', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const api = profileApi(async (input, init) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET' });
      if (url.endsWith('/api/profile/capabilities'))
        return response(200, capabilities()) as Response;
      if (url.endsWith('/api/profiles/ada'))
        return response(200, {
          username: 'ada',
          displayName: 'Ada Public',
          createdAt: '2026-01-01T00:00:00Z',
          capabilities: capabilities(),
          isSelf: true,
          canCreateProblems: true,
        }) as Response;
      if (url.endsWith('/api/profiles/ada/overview'))
        return response(200, {
          createdProblemCount: 1,
          solvedProblemCount: 2,
          submissionCount: 3,
          acceptedSubmissionCount: 2,
          favoriteCount: 1,
        }) as Response;
      if (url.includes('/api/profiles/ada/solved?'))
        return response(200, {
          items: [],
          page: { limit: 20, total: 0 },
        }) as Response;
      if (url.includes('/api/profiles/ada/submissions?'))
        return response(200, {
          items: [],
          page: { limit: 10 },
        }) as Response;
      if (url.includes('/api/profiles/ada/problems?'))
        return response(200, {
          items: [],
          page: { limit: 20, total: 0 },
        }) as Response;
      if (url.includes('/api/profile/favorites?'))
        return response(200, {
          items: [],
          page: { limit: 10, total: 0, nextCursor: 'cursor-2' },
        }) as Response;
      if (url.endsWith('/api/profile/favorites/p1'))
        return response(
          init?.method === 'DELETE' ? 204 : 201,
          undefined,
        ) as Response;
      if (url.includes('/api/profile/contests?'))
        return response(200, { items: [], page: { limit: 20 } }) as Response;
      if (url.includes('/api/profile/problems?'))
        return response(200, {
          items: [],
          page: { limit: 20, total: 0 },
        }) as Response;
      return response(404, {
        code: 'NOT_FOUND',
        message: 'not found',
      }) as Response;
    });

    await api.profileCapabilities();
    await api.publicProfile('ada');
    await api.profileOverview('ada');
    await api.profileSolved('ada');
    await api.profileSubmissions('ada');
    await api.profileProblemsFor('ada');
    await api.profileFavorites(10, 'cursor-1');
    await api.addFavorite('p1');
    await api.removeFavorite('p1');
    await api.profileContests('REGISTERED');
    await api.profileProblems();

    expect(calls).toEqual([
      { url: '/api/profile/capabilities', method: 'GET' },
      { url: '/api/profiles/ada', method: 'GET' },
      { url: '/api/profiles/ada/overview', method: 'GET' },
      { url: '/api/profiles/ada/solved?limit=20', method: 'GET' },
      { url: '/api/profiles/ada/submissions?limit=10', method: 'GET' },
      { url: '/api/profiles/ada/problems?limit=20', method: 'GET' },
      {
        url: '/api/profile/favorites?limit=10&cursor=cursor-1',
        method: 'GET',
      },
      { url: '/api/profile/favorites/p1', method: 'POST' },
      { url: '/api/profile/favorites/p1', method: 'DELETE' },
      {
        url: '/api/profile/contests?limit=20&kind=REGISTERED',
        method: 'GET',
      },
      { url: '/api/profile/problems?limit=20', method: 'GET' },
    ]);
  });

  it('renders favorites and performs real add/remove mutations', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const api = profileApi(async (input, init) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET' });
      if (url.endsWith('/api/profile/capabilities'))
        return response(200, capabilities()) as Response;
      if (url.endsWith('/api/profiles/ada'))
        return response(200, {
          username: 'ada',
          displayName: 'Ada',
          createdAt: '2026-01-01T00:00:00Z',
          capabilities: capabilities(),
          isSelf: true,
          canCreateProblems: true,
        }) as Response;
      if (url.endsWith('/api/profiles/ada/overview'))
        return response(200, {
          createdProblemCount: 1,
          solvedProblemCount: 2,
          submissionCount: 3,
          acceptedSubmissionCount: 2,
          favoriteCount: 1,
        }) as Response;
      if (url.includes('/api/profile/favorites?'))
        return response(200, {
          items: [
            {
              problemId: 'p1',
              slug: 'two-sum',
              title: '两数之和',
              timeLimitMs: 1000,
              memoryLimitBytes: 268435456,
              favoritedAt: '2026-08-31T00:00:00Z',
            },
          ],
          page: { limit: 20, total: 1 },
        }) as Response;
      if (url.endsWith('/api/profile/favorites/p1'))
        return response(
          init?.method === 'DELETE' ? 204 : 201,
          undefined,
        ) as Response;
      return response(404, {
        code: 'NOT_FOUND',
        message: 'not found',
      }) as Response;
    });

    render(<ProfileExperience user={user} api={api} navigate={vi.fn()} />);
    await screen.findByText('已解决题目');
    fireEvent.click(screen.getByRole('tab', { name: '收藏' }));
    expect(await screen.findByText('两数之和')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '移除收藏' }));
    await waitFor(() =>
      expect(screen.getByText('暂无收藏题目。')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText('添加题目收藏'), {
      target: { value: 'p1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加收藏' }));
    await waitFor(() =>
      expect(calls.some((call) => call.method === 'POST')).toBe(true),
    );
    expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
  });

  it('keeps Guest capabilities unavailable without showing mutation controls', async () => {
    const guest: AuthenticatedUser = {
      ...user,
      guest: true,
      email: null,
      upgradeHint: '升级账号后即可使用完整功能。',
    };
    const api = profileApi(async (input) => {
      if (String(input).endsWith('/api/profile/capabilities'))
        return response(
          200,
          capabilities({
            favorites: {
              available: false,
              reason: 'GUEST_ACCOUNT_REQUIRES_UPGRADE',
            },
            myContests: {
              available: false,
              reason: 'GUEST_ACCOUNT_REQUIRES_UPGRADE',
            },
            myProblems: {
              available: false,
              reason: 'GUEST_ACCOUNT_REQUIRES_UPGRADE',
            },
          }),
        ) as Response;
      if (String(input).endsWith('/api/profiles/ada'))
        return response(200, {
          username: 'ada',
          displayName: 'Ada',
          createdAt: '2026-01-01T00:00:00Z',
          capabilities: capabilities({
            favorites: {
              available: false,
              reason: 'GUEST_ACCOUNT_REQUIRES_UPGRADE',
            },
          }),
          isSelf: true,
          canCreateProblems: false,
        }) as Response;
      if (String(input).endsWith('/api/profiles/ada/overview'))
        return response(200, {
          createdProblemCount: 0,
          solvedProblemCount: 0,
          submissionCount: 0,
          acceptedSubmissionCount: 0,
        }) as Response;
      return response(404, {
        code: 'NOT_FOUND',
        message: 'not found',
      }) as Response;
    });
    render(<ProfileExperience user={guest} api={api} navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: '收藏' }));
    expect(
      (
        await screen.findAllByText(
          '游客账号需要升级为正式账号后才能使用此能力。',
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByLabelText('添加题目收藏')).not.toBeInTheDocument();
  });

  it('renders public profile fields without private identifiers', async () => {
    const api = profileApi(async (input) => {
      if (String(input).endsWith('/api/profiles/ada'))
        return response(200, {
          username: 'ada',
          displayName: 'Ada Public',
          createdAt: '2026-01-01T00:00:00Z',
          capabilities: capabilities(),
          isSelf: false,
          canCreateProblems: false,
          email: 'private@example.test',
          phone: '+8613800000000',
        }) as Response;
      return response(404, {
        code: 'NOT_FOUND',
        message: 'not found',
      }) as Response;
    });
    render(
      <ProfileExperience
        user={null}
        username="ada"
        api={api}
        navigate={vi.fn()}
      />,
    );
    expect(
      await screen.findByRole('heading', { name: 'Ada Public' }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('private@example.test');
    expect(document.body.textContent).not.toContain('+8613800000000');
  });
});
