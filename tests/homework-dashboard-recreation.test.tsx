// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssignmentPage } from '../apps/web/src/features/assignment/AssignmentPage.js';
import type { ApiClient, Assignment } from '../apps/web/src/services/api.js';

afterEach(cleanup);

const assignment: Assignment = {
  id: 'assignment-1',
  publicId: 'HW-0001',
  team: { slug: 'algorithms', name: '算法训练队' },
  title: '图论训练',
  description: '完成本周训练题。',
  status: 'PUBLISHED',
  startsAt: '2026-09-20T00:00:00.000Z',
  dueAt: '2026-09-30T00:00:00.000Z',
  problemCount: 1,
  completedCount: 0,
  capabilities: {
    canView: true,
    canEdit: false,
    canPublish: false,
    canClose: false,
  },
  problems: [
    {
      publicId: 'P1067',
      problemId: 'problem-1',
      title: '字符串匹配',
      displayOrder: 1,
      completed: false,
    },
  ],
};

describe('Homework dashboard synchronization', () => {
  it('renders persisted assignments and preserves detail navigation', async () => {
    const navigate = vi.fn();
    const api = {
      myAssignments: vi.fn().mockResolvedValue({ items: [assignment] }),
    } as unknown as ApiClient;
    render(
      <AssignmentPage api={api} navigate={navigate} user={{ id: 'user-1' }} />,
    );

    expect(
      await screen.findByRole('heading', { name: '图论训练' }),
    ).toBeTruthy();
    expect(api.myAssignments).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '开始作业' }));
    expect(navigate).toHaveBeenCalledWith('/homework/HW-0001');
  });

  it('does not request protected data before authentication', async () => {
    const navigate = vi.fn();
    const api = { myAssignments: vi.fn() } as unknown as ApiClient;
    render(<AssignmentPage api={api} navigate={navigate} user={null} />);

    expect(
      await screen.findByRole('heading', {
        name: '请先登录后查看我的作业',
      }),
    ).toBeTruthy();
    expect(api.myAssignments).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('shows a real empty state after a successful server response', async () => {
    const api = {
      myAssignments: vi.fn().mockResolvedValue({ items: [] }),
    } as unknown as ApiClient;
    render(
      <AssignmentPage api={api} navigate={vi.fn()} user={{ id: 'user-1' }} />,
    );

    await waitFor(() => expect(api.myAssignments).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('heading', { name: '暂无作业' })).toBeTruthy();
  });
});
