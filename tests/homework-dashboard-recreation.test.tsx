// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeworkDashboardPage } from '../apps/web/src/features/homework-dashboard/HomeworkDashboardPage.js';

afterEach(cleanup);

describe('Homework dashboard recreation', () => {
  it('renders the complete fixture and preserves problem navigation', () => {
    const navigate = vi.fn();
    render(<HomeworkDashboardPage navigate={navigate} />);

    expect(
      screen.getByRole('heading', {
        name: '当前需要优先完成（本周作业）',
      }),
    ).toBeTruthy();
    expect(screen.getAllByText(/第 \d{2} 课/)).toHaveLength(36);
    expect(screen.getAllByRole('button', { name: /去做题/ })).toHaveLength(6);
    expect(screen.getByLabelText('24 项作业中已完成 8 项')).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'BLOCKQUOTE' &&
          Boolean(element.textContent?.includes('成就更好的自己！')),
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: /去做题/ })[0]!);
    expect(navigate).toHaveBeenCalledWith('/problems/P1067');
  });
});
