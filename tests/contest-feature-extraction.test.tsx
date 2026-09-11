// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContestPage } from '../apps/web/src/features/contest/ContestPage.js';
import { ContestExperience } from '../apps/web/src/components/PortalExperience.js';
import type { ContestListItem } from '../apps/web/src/services/portal-contracts.js';

const contest: ContestListItem = {
  id: 'contest-1',
  title: 'Contest extraction fixture',
  lifecycle: 'UPCOMING',
  visibility: 'PUBLIC',
  startsAt: '2026-09-11T12:00:00.000Z',
  endsAt: '2026-09-11T14:00:00.000Z',
};

afterEach(cleanup);

describe('Contest feature extraction', () => {
  it('keeps landing data, links, and navigation in the feature', () => {
    const navigate = vi.fn();
    render(
      <ContestPage
        view="list"
        contests={[contest]}
        navigate={navigate}
        loading={false}
      />,
    );

    expect(screen.getByText(contest.title)).toBeInTheDocument();
    expect(screen.getByText('UPCOMING')).toBeInTheDocument();
    const contestLink = document.querySelector<HTMLAnchorElement>(
      'a[href="/contests/contest-1"]',
    );
    expect(contestLink).toBeTruthy();
    expect(contestLink).toHaveAttribute('href', '/contests/contest-1');
    fireEvent.click(contestLink!);
    expect(navigate).toHaveBeenCalledWith('/contests/contest-1');
  });

  it('preserves loading, error retry, and empty states', () => {
    const retry = vi.fn();
    const { rerender } = render(
      <ContestPage
        view="mine"
        contests={[]}
        navigate={vi.fn()}
        loading
      />,
    );
    expect(document.querySelector('.contest-landing-state')).toHaveAttribute(
      'role',
      'status',
    );

    rerender(
      <ContestPage
        view="list"
        contests={[]}
        navigate={vi.fn()}
        loading={false}
        error="request failed"
        onRetry={retry}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '\u91cd\u8bd5' }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(
      <ContestPage
        view="list"
        contests={[]}
        navigate={vi.fn()}
        loading={false}
      />,
    );
    expect(document.querySelector('.contest-showcase-grid')).toBeTruthy();
  });

  it('keeps ContestExperience as the route-compatible feature entry', () => {
    render(
      <ContestExperience
        view="list"
        contests={[contest]}
        navigate={vi.fn()}
      />,
    );
    expect(document.querySelector('.contest-landing')).toBeTruthy();
    expect(screen.getByText(contest.title)).toBeInTheDocument();
  });
});
