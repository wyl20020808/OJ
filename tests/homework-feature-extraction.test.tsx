// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssignmentPage } from '../apps/web/src/features/assignment/AssignmentPage.js';
import type { ApiClient } from '../apps/web/src/services/api.js';

afterEach(cleanup);

describe('Homework feature extraction', () => {
  it('preserves assignment listing, homework navigation, and owner controls', async () => {
    const api = {
      teamAssignments: vi.fn().mockResolvedValue({
        items: [
          {
            publicId: 'HW-1',
            title: 'Week 1',
            status: 'PUBLISHED',
            startsAt: null,
            dueAt: null,
            completedCount: 0,
            problemCount: 1,
            team: { name: 'Team', slug: 'team' },
            capabilities: {},
            problems: [],
          },
        ],
      }),
      team: vi.fn().mockResolvedValue({ membershipState: 'OWNER' }),
    } as unknown as ApiClient;
    const navigate = vi.fn();
    render(
      <AssignmentPage
        api={api}
        navigate={navigate}
        user={{ id: 'u1' }}
        teamSlug="team"
      />,
    );
    expect(
      await screen.findByRole('heading', { name: 'Team作业' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '开始作业' }));
    expect(navigate).toHaveBeenCalledWith('/homework/HW-1');
    expect(screen.getByRole('button', { name: '创建作业' })).toBeTruthy();
  });
});
