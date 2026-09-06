// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileExperience } from '../apps/web/src/components/PortalExperience.js';
import {
  createApiClient,
  type AuthenticatedUser,
} from '../apps/web/src/services/api.js';

const user: AuthenticatedUser = {
  id: 'u1',
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
  teams: { available: false, reason: 'PRODUCT_DOMAIN_NOT_IMPLEMENTED' },
  homework: { available: false, reason: 'PRODUCT_DOMAIN_NOT_IMPLEMENTED' },
  wrongbook: {
    available: false,
    reason: 'UPSTREAM_BLOCKED_BY_AUTHORITATIVE_SUBMISSION_OUTCOME',
  },
};

const response = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

function activityApi(days: unknown[]) {
  const calls: string[] = [];
  const api = createApiClient(
    '',
    vi.fn(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/api/profiles/ada'))
        return response(200, {
          username: 'ada',
          displayName: 'Ada',
          createdAt: '2026-01-01T00:00:00Z',
          capabilities,
          isSelf: true,
          canCreateProblems: false,
        }) as Response;
      if (url.endsWith('/api/profiles/ada/activity'))
        return response(200, { timezone: 'UTC', days }) as Response;
      if (url.endsWith('/api/profiles/ada/overview'))
        return response(200, {
          createdProblemCount: 0,
          solvedProblemCount: 0,
          submissionCount: 0,
          acceptedSubmissionCount: 0,
        }) as Response;
      if (url.includes('/api/profiles/ada/solved?'))
        return response(200, {
          items: [],
          page: { limit: 20, total: 0 },
        }) as Response;
      return response(404, {
        code: 'NOT_FOUND',
        message: 'not found',
      }) as Response;
    }),
  );
  return { api, calls };
}

afterEach(() => cleanup());

describe('Profile heatmap V2', () => {
  it('renders aggregate submission and AC data with tooltip and mobile scroll', async () => {
    const { api, calls } = activityApi([
      { date: '2026-09-05', submissionCount: 3, acceptedCount: 2 },
    ]);
    render(<ProfileExperience user={user} api={api} navigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('tab', { name: '做题记录' }));
    expect(await screen.findByText(/最近一年共 3 次提交/)).toBeInTheDocument();
    const day = screen.getByTitle('2026-09-05：提交 3 次，AC 2 次');
    expect(day).toHaveAttribute('aria-label', '2026-09-05，提交 3 次，AC 2 次');
    expect(document.querySelectorAll('.heatmap-day')).toHaveLength(365);
    expect(document.querySelector('.heatmap-scroll')).toBeInTheDocument();
    expect(calls).toContain('/api/profiles/ada/activity');
    expect(document.body.textContent).not.toContain('source');
  });

  it('renders 365 empty cells for empty profile', async () => {
    const { api } = activityApi([]);
    render(<ProfileExperience user={user} api={api} navigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('tab', { name: '做题记录' }));
    expect(
      await screen.findByText('最近一年共 0 次提交，共 0 个活跃日。'),
    ).toBeInTheDocument();
    expect(document.querySelectorAll('.heatmap-day')).toHaveLength(365);
  });
});
