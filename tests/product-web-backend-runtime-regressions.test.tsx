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
import {
  MessagesExperience,
  NotificationBell,
  NotificationsPage,
  ProfileExperience,
} from '../apps/web/src/components/PortalExperience.js';
import {
  ApiError,
  type ApiClient,
  type AuthenticatedUser,
  type ProfileCapabilities,
} from '../apps/web/src/services/api.js';
import type {
  ConversationSummary,
  FriendSummary,
  Message,
  NotificationSummary,
} from '../apps/web/src/services/portal-contracts.js';

const userError = (code: string, status: number) =>
  new ApiError({ code, message: code, requestId: 'test-request' }, status);

const response = (status: number, body: unknown) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as Response;

const contest = {
  id: 'contest-1',
  title: '真实比赛',
  description: '真实比赛说明',
  ownerUserId: 'owner-1',
  visibility: 'PUBLIC',
  lifecycle: 'UPCOMING',
  format: 'ICPC',
  startsAt: '2026-09-02T10:00:00.000Z',
  endsAt: '2026-09-02T12:00:00.000Z',
  canManage: false,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
} as const;

const friend: FriendSummary = {
  id: 'user-grace',
  username: 'grace',
  displayName: 'Grace',
};

const conversation: ConversationSummary = {
  id: 'conversation-grace',
  kind: 'DIRECT',
  peer: friend,
  unreadCount: 0,
  muted: false,
  pinned: false,
};

const passwordUser: AuthenticatedUser = {
  id: 'user-ada',
  username: 'ada',
  email: 'ada@example.test',
  displayName: 'Ada',
  status: 'active',
};

const availableCapabilities: ProfileCapabilities = {
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
};

function installAppFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init),
  );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

function routeSetup(url: string) {
  window.history.pushState({}, '', url);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

describe('Product Web Backend runtime regressions', () => {
  it('uses the password-only My Contests projection and exposes Guest denial with retry', async () => {
    let projectionCalls = 0;
    const fetcher = installAppFetch((url) => {
      if (url.endsWith('/api/auth/me'))
        return response(401, {
          code: 'UNAUTHENTICATED',
          message: 'unauthenticated',
          requestId: 'auth',
        });
      if (url.endsWith('/ready'))
        return response(200, { status: 'ok', dependencies: {} });
      if (url.includes('/api/profile/contests?')) {
        projectionCalls += 1;
        if (projectionCalls === 1)
          return response(403, {
            code: 'GUEST_ACCOUNT_REQUIRES_UPGRADE',
            message: 'upgrade required',
            requestId: 'profile',
          });
        return response(200, {
          items: [
            {
              id: 'contest-1',
              title: '我的创建比赛',
              visibility: 'PUBLIC',
              lifecycle: 'UPCOMING',
              startsAt: contest.startsAt,
              endsAt: contest.endsAt,
              relationship: 'CREATED',
              relationshipAt: contest.createdAt,
            },
          ],
          page: { limit: 20 },
        });
      }
      return response(404, {
        code: 'NOT_FOUND',
        message: 'not found',
        requestId: 'fallback',
      });
    });

    routeSetup('/contests/mine');
    render(<App />);

    expect(
      await screen.findByText('游客账号需要升级为正式账号后才能使用此能力。'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('我的创建比赛')).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).includes('/api/profile/contests?limit=20'),
      ),
    ).toBe(true);
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).includes('/api/contests?limit=20'),
      ),
    ).toBe(false);
    expect(screen.queryByText('ICPC')).not.toBeInTheDocument();
  });

  it('uses Backend pointsConfig score instead of a stale fallback score', async () => {
    installAppFetch((url) => {
      if (url.endsWith('/api/auth/me'))
        return response(401, {
          code: 'UNAUTHENTICATED',
          message: 'unauthenticated',
          requestId: 'auth',
        });
      if (url.endsWith('/ready'))
        return response(200, { status: 'ok', dependencies: {} });
      if (url.endsWith('/api/contests/contest-1'))
        return response(200, contest);
      if (url.endsWith('/api/contests/contest-1/problems'))
        return response(200, {
          items: [
            {
              problemId: 'problem-1',
              label: 'A',
              title: '后端分值题目',
              score: 10,
              pointsConfig: { score: 100 },
            },
          ],
        });
      if (url.endsWith('/api/contests/contest-1/register'))
        return response(200, { status: 'NOT_REGISTERED' });
      return response(404, {
        code: 'NOT_FOUND',
        message: 'not found',
        requestId: 'fallback',
      });
    });

    routeSetup('/contests/contest-1/problems');
    render(<App />);
    expect(await screen.findByText('100 分')).toBeInTheDocument();
    expect(screen.queryByText('10 分')).not.toBeInTheDocument();
  });

  it('keeps the Backend standings-unavailable reason instead of inventing rankings', async () => {
    installAppFetch((url) => {
      if (url.endsWith('/api/auth/me'))
        return response(401, {
          code: 'UNAUTHENTICATED',
          message: 'unauthenticated',
          requestId: 'auth',
        });
      if (url.endsWith('/ready'))
        return response(200, { status: 'ok', dependencies: {} });
      if (url.endsWith('/api/contests/contest-1'))
        return response(200, contest);
      if (url.endsWith('/api/contests/contest-1/problems'))
        return response(200, { items: [] });
      if (url.endsWith('/api/contests/contest-1/registration'))
        return response(200, { status: 'NOT_REGISTERED' });
      if (url.endsWith('/api/contests/contest-1/standings'))
        return response(503, {
          available: false,
          reason: 'SCORING_ENGINE_NOT_INTEGRATED',
        });
      return response(404, {
        code: 'NOT_FOUND',
        message: 'not found',
        requestId: 'fallback',
      });
    });

    routeSetup('/contests/contest-1/standings');
    render(<App />);
    expect(
      await screen.findByText('SCORING_ENGINE_NOT_INTEGRATED'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '后端计分引擎尚未接入，Web 不会在客户端计算或伪造正式排名。',
      ),
    ).toBeInTheDocument();
  });

  it('retries a failed contest list request instead of presenting an empty list', async () => {
    let contestCalls = 0;
    installAppFetch((url) => {
      if (url.endsWith('/api/auth/me'))
        return response(401, {
          code: 'UNAUTHENTICATED',
          message: 'unauthenticated',
          requestId: 'auth',
        });
      if (url.endsWith('/ready'))
        return response(200, { status: 'ok', dependencies: {} });
      if (url.endsWith('/api/notifications/unread-count'))
        return response(200, { count: 0 });
      if (url.includes('/api/contests?limit=20')) {
        contestCalls += 1;
        return contestCalls === 1
          ? response(500, {
              code: 'INTERNAL_ERROR',
              message: 'unavailable',
              requestId: 'contest',
            })
          : response(200, { items: [contest] });
      }
      return response(404, {
        code: 'NOT_FOUND',
        message: 'not found',
        requestId: 'fallback',
      });
    });

    routeSetup('/contests');
    render(<App />);
    expect(
      await screen.findByText('比赛列表暂时不可用，请稍后重试。'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('真实比赛')).toBeInTheDocument();
    expect(contestCalls).toBe(2);
  });

  it('retries a failed notification list request instead of presenting no notifications', async () => {
    let notificationCalls = 0;
    installAppFetch((url) => {
      if (url.endsWith('/api/auth/me'))
        return response(401, {
          code: 'UNAUTHENTICATED',
          message: 'unauthenticated',
          requestId: 'auth',
        });
      if (url.endsWith('/ready'))
        return response(200, { status: 'ok', dependencies: {} });
      if (url.endsWith('/api/notifications/unread-count'))
        return response(200, { count: 0 });
      if (url.includes('/api/notifications?limit=50')) {
        notificationCalls += 1;
        return notificationCalls === 1
          ? response(500, {
              code: 'INTERNAL_ERROR',
              message: 'unavailable',
              requestId: 'notification',
            })
          : response(200, {
              items: [
                {
                  id: 'notification-1',
                  category: 'SYSTEM',
                  title: '真实通知',
                  body: '通知正文',
                  createdAt: '2026-09-01T00:00:00.000Z',
                  read: false,
                },
              ],
            });
      }
      return response(404, {
        code: 'NOT_FOUND',
        message: 'not found',
        requestId: 'fallback',
      });
    });

    routeSetup('/notifications');
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '通知暂时不可用，请稍后重试。',
    );
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('真实通知')).toBeInTheDocument();
    expect(notificationCalls).toBe(2);
  });

  it('retries a failed messaging bootstrap instead of presenting empty conversations', async () => {
    let conversationCalls = 0;
    installAppFetch((url) => {
      if (url.endsWith('/api/auth/me'))
        return response(401, {
          code: 'UNAUTHENTICATED',
          message: 'unauthenticated',
          requestId: 'auth',
        });
      if (url.endsWith('/ready'))
        return response(200, { status: 'ok', dependencies: {} });
      if (url.endsWith('/api/notifications/unread-count'))
        return response(200, { count: 0 });
      if (url.endsWith('/api/messages/unread-count'))
        return response(200, { count: 0 });
      if (url.endsWith('/api/conversations')) {
        conversationCalls += 1;
        return conversationCalls === 1
          ? response(500, {
              code: 'INTERNAL_ERROR',
              message: 'unavailable',
              requestId: 'conversation',
            })
          : response(200, { items: [conversation] });
      }
      if (url.endsWith('/api/friends')) return response(200, { items: [] });
      if (url.endsWith('/api/friend-requests?direction=incoming'))
        return response(200, { items: [] });
      if (url.endsWith('/api/friend-requests?direction=outgoing'))
        return response(200, { items: [] });
      return response(404, {
        code: 'NOT_FOUND',
        message: 'not found',
        requestId: 'fallback',
      });
    });

    routeSetup('/messages');
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '通讯数据暂时不可用，请稍后重试。',
    );
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(
      await screen.findByRole('button', { name: /Grace/ }),
    ).toBeInTheDocument();
    expect(conversationCalls).toBe(2);
  });

  it('does not turn unread-count failures into zero-state data', async () => {
    const unreadNotifications = vi
      .fn()
      .mockRejectedValueOnce(userError('INTERNAL_ERROR', 500))
      .mockResolvedValue({ count: 2 });
    const unreadMessages = vi
      .fn()
      .mockRejectedValueOnce(userError('INTERNAL_ERROR', 500))
      .mockResolvedValue({ count: 3 });
    const api = {
      unreadNotifications,
      notifications: vi.fn().mockResolvedValue({ items: [] }),
      unreadMessages,
    } as unknown as ApiClient;

    const { unmount } = render(
      <NotificationBell api={api} navigate={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '通知' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '未读通知状态暂不可用，请稍后重试。',
    );
    fireEvent.click(screen.getByRole('button', { name: '重试未读状态' }));
    await waitFor(() => expect(unreadNotifications).toHaveBeenCalledTimes(2));
    unmount();

    render(<MessagesExperience api={api} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '未读消息状态暂不可用，请稍后重试。',
    );
    fireEvent.click(screen.getByRole('button', { name: '重试未读状态' }));
    await waitFor(() => expect(unreadMessages).toHaveBeenCalledTimes(2));
  });

  it('retries a failed profile favorite projection', async () => {
    const favoriteCalls = vi
      .fn()
      .mockRejectedValueOnce(userError('INTERNAL_ERROR', 500))
      .mockResolvedValue({ items: [], page: { limit: 20, total: 0 } });
    const api = {
      profileCapabilities: vi.fn().mockResolvedValue(availableCapabilities),
      publicProfile: vi.fn().mockResolvedValue({
        username: 'ada',
        displayName: 'Ada',
        createdAt: '2026-01-01T00:00:00Z',
        capabilities: availableCapabilities,
        isSelf: true,
        canCreateProblems: true,
      }),
      profileOverview: vi.fn().mockResolvedValue({
        createdProblemCount: 0,
        solvedProblemCount: 0,
        submissionCount: 0,
        acceptedSubmissionCount: 0,
        favoriteCount: 0,
      }),
      profileFavorites: favoriteCalls,
    } as unknown as ApiClient;

    render(
      <ProfileExperience user={passwordUser} api={api} navigate={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: '收藏' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '收藏列表暂时不可用',
    );
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(favoriteCalls).toHaveBeenCalledTimes(2));
  });

  it('keeps the Backend friend-request ID for cancellation', async () => {
    const cancelFriendRequest = vi.fn().mockResolvedValue(undefined);
    const api = {
      unreadMessages: vi.fn().mockResolvedValue({ count: 0 }),
      searchUsers: vi.fn().mockResolvedValue({ items: [friend] }),
      sendFriendRequest: vi
        .fn()
        .mockResolvedValue({ id: 'request-from-server', state: 'PENDING' }),
      cancelFriendRequest,
    } as unknown as ApiClient;

    render(<MessagesExperience api={api} />);
    fireEvent.click(screen.getByRole('tab', { name: '添加好友' }));
    fireEvent.change(screen.getByLabelText('用户名或 UID'), {
      target: { value: 'grace' },
    });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    expect(await screen.findByText('Grace')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '添加好友' }));
    await waitFor(() =>
      expect(api.sendFriendRequest).toHaveBeenCalledWith(
        'user-grace',
        undefined,
      ),
    );
    fireEvent.click(screen.getByRole('tab', { name: '新的朋友' }));
    fireEvent.click(screen.getByRole('button', { name: '取消申请' }));
    await waitFor(() =>
      expect(cancelFriendRequest).toHaveBeenCalledWith('request-from-server'),
    );
  });

  it('creates a direct conversation from a real friend', async () => {
    const createDirectConversation = vi
      .fn()
      .mockResolvedValue({ id: conversation.id, kind: 'DIRECT' });
    const api = {
      unreadMessages: vi.fn().mockResolvedValue({ count: 0 }),
      createDirectConversation,
      conversations: vi.fn().mockResolvedValue({
        items: [
          {
            id: conversation.id,
            kind: 'DIRECT',
            peer: friend,
            unreadCount: 0,
          },
        ],
      }),
      conversationMessages: vi.fn().mockResolvedValue({ items: [] }),
    } as unknown as ApiClient;

    render(<MessagesExperience api={api} friends={[friend]} />);
    fireEvent.click(screen.getByRole('tab', { name: '通讯录' }));
    fireEvent.click(screen.getByRole('button', { name: '发消息' }));
    await waitFor(() =>
      expect(createDirectConversation).toHaveBeenCalledWith('user-grace'),
    );
    expect(await screen.findByRole('button', { name: /Grace/ })).toHaveClass(
      'selected',
    );
  });

  it('reuses the client message ID when retrying a failed send', async () => {
    const sent: Array<{ id: string; body: string; correlationId: string }> = [];
    const sentMessage: Message = {
      id: 'message-1',
      conversationId: conversation.id,
      senderId: 'me',
      type: 'TEXT',
      content: '同一条消息',
      sentAt: '2026-09-01T00:00:00.000Z',
      clientCorrelationId: 'stable-client-id',
    };
    const sendMessage = vi.fn(
      (id: string, body: string, correlationId: string) => {
        sent.push({ id, body, correlationId });
        return sent.length === 1
          ? Promise.reject(userError('INTERNAL_ERROR', 500))
          : Promise.resolve(sentMessage);
      },
    );
    const api = {
      unreadMessages: vi.fn().mockResolvedValue({ count: 0 }),
      conversationMessages: vi.fn().mockResolvedValue({ items: [] }),
      sendMessage,
    } as unknown as ApiClient;
    vi.stubGlobal('crypto', { randomUUID: () => 'stable-client-id' });

    render(<MessagesExperience api={api} conversations={[conversation]} />);
    fireEvent.click(screen.getByRole('button', { name: /Grace/ }));
    await screen.findByLabelText('输入消息');
    fireEvent.change(screen.getByLabelText('输入消息'), {
      target: { value: '同一条消息' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(
      await screen.findByRole('button', { name: '重新发送' }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '重新发送' }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    expect(sent).toEqual([
      {
        id: conversation.id,
        body: '同一条消息',
        correlationId: 'stable-client-id',
      },
      {
        id: conversation.id,
        body: '同一条消息',
        correlationId: 'stable-client-id',
      },
    ]);
    expect(document.querySelector('.message-bubble')).toHaveTextContent(
      '同一条消息',
    );
  });

  it('filters notification categories without hiding the real social categories', async () => {
    const notifications: NotificationSummary[] = [
      {
        id: 'system-1',
        category: 'SYSTEM',
        title: '系统通知',
        body: '系统正文',
        createdAt: '2026-09-01T00:00:00.000Z',
        read: false,
      },
      {
        id: 'contest-1',
        category: 'CONTEST',
        title: '比赛通知',
        body: '比赛正文',
        createdAt: '2026-09-01T00:00:00.000Z',
        read: false,
      },
      {
        id: 'message-1',
        category: 'DIRECT_MESSAGE',
        title: '私聊通知',
        body: '私聊正文',
        createdAt: '2026-09-01T00:00:00.000Z',
        read: false,
      },
    ];
    const api = {
      unreadNotifications: vi.fn().mockResolvedValue({ count: 3 }),
    } as unknown as ApiClient;

    render(<NotificationsPage api={api} notifications={notifications} />);
    await screen.findByText('系统通知');
    fireEvent.click(screen.getByRole('tab', { name: '社交' }));
    expect(screen.getByRole('tab', { name: '社交' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('私聊通知')).toBeInTheDocument();
    expect(screen.queryByText('比赛通知')).not.toBeInTheDocument();
    expect(screen.queryByText('系统通知')).not.toBeInTheDocument();
  });
});
