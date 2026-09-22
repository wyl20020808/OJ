// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfilePage } from '../apps/web/src/features/profile/ProfilePage.js';
import {
  ApiError,
  type ApiClient,
  type AuthenticatedUser,
} from '../apps/web/src/services/api.js';

const user: AuthenticatedUser = {
  id: 'user-1',
  username: 'ada',
  email: 'ada@example.test',
  displayName: 'Ada',
  status: 'active',
};

const capabilities = {
  contractVersion: 'profile-capabilities-v1',
  favorites: { available: true },
  myContests: { available: true },
  myProblems: { available: true },
  activity: { available: true },
  heatmap: { available: true },
  teams: { available: true },
  homework: { available: false, reason: 'PRODUCT_DOMAIN_NOT_IMPLEMENTED' },
  wrongbook: { available: false, reason: 'PRODUCT_DOMAIN_NOT_IMPLEMENTED' },
} as const;

function profileApi(overrides: Partial<ApiClient> = {}) {
  return {
    publicProfile: vi.fn().mockResolvedValue({
      username: 'ada',
      displayName: 'Ada',
      headline: 'Practice every day',
      createdAt: '2026-01-01T00:00:00.000Z',
      capabilities,
      isSelf: true,
      canCreateProblems: false,
      teams: [],
    }),
    profileActivity: vi.fn().mockResolvedValue({ timezone: 'UTC', days: [] }),
    profileOverview: vi.fn().mockResolvedValue({
      createdProblemCount: 1,
      solvedProblemCount: 2,
      submissionCount: 3,
      acceptedSubmissionCount: 2,
      favoriteCount: 1,
    }),
    profileSolved: vi.fn().mockResolvedValue({
      items: [],
      page: { limit: 20, total: 0 },
    }),
    profileSubmissions: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'submission-1',
          problemId: 'problem-1',
          slug: 'two-sum',
          title: 'Two Sum',
          languageId: 'cpp20-gcc-13-v1',
          status: 'COMPLETED_WITH_VERDICT',
          verdict: 'AC',
          createdAt: '2026-09-10T09:00:00.000Z',
        },
      ],
      page: { limit: 10 },
    }),
    ...overrides,
  } as unknown as ApiClient;
}

afterEach(cleanup);

describe('Profile UI completeness', () => {
  it('renders real profile data, capability cards, heatmap, and submission history', async () => {
    render(<ProfilePage user={user} api={profileApi()} navigate={vi.fn()} />);

    expect(
      await screen.findByRole('heading', { name: 'Ada' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Profile capabilities')).toHaveTextContent(
      '收藏',
    );
    fireEvent.click(screen.getByRole('tab', { name: '做题记录' }));
    expect(await screen.findByText('Recent submissions')).toBeInTheDocument();
    expect(screen.getByText('Two Sum')).toBeInTheDocument();
    expect(screen.getByText('AC')).toBeInTheDocument();
    expect(document.querySelectorAll('.heatmap-day')).toHaveLength(365);
  });

  it('shows explicit empty submission state instead of a blank panel', async () => {
    const api = profileApi({
      profileSubmissions: vi.fn().mockResolvedValue({
        items: [],
        page: { limit: 10 },
      }),
    });
    render(<ProfilePage user={user} api={api} navigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole('tab', { name: '做题记录' }));
    expect(
      await screen.findByText('No public submissions to display.'),
    ).toBeInTheDocument();
  });

  it('shows retryable API error and development fixture data', async () => {
    const api = profileApi({
      profileSubmissions: vi.fn().mockRejectedValue(
        new ApiError(
          {
            code: 'SERVICE_UNAVAILABLE',
            message: 'offline',
            requestId: 'test',
          },
          503,
        ),
      ),
    });
    render(<ProfilePage user={user} api={api} navigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole('tab', { name: '做题记录' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Submission history',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Preview development fixture' }),
    );
    expect(
      await screen.findByText('Development fixture data is active.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Demo Runner' }),
    ).toBeInTheDocument();
    expect(screen.getByText('DEVELOPMENT FIXTURE DATA')).toBeInTheDocument();
  });
});
