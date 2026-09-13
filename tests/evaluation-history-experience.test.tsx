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
import { SubmissionHistoryPage } from '../apps/web/src/features/submissions/SubmissionHistoryPage.js';
import type {
  ApiClient,
  EvaluationList,
  EvaluationStatistics,
} from '../apps/web/src/services/api.js';

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

const statistics: EvaluationStatistics = {
  total: 124_892,
  accepted: 62_421,
  failed: 60_317,
  judging: 2_154,
  passRate: 50,
  today: {
    submissions: 8_342,
    accepted: 4_126,
    activeUsers: 1_892,
    passRate: 49.5,
    submissionDeltaPercent: 12,
    acceptedDeltaPercent: 8,
    activeUserDeltaPercent: 6,
  },
  verdicts: {
    AC: 62_421,
    WA: 24_318,
    RE: 12_421,
    TLE: 8_932,
    MLE: 7_645,
    CE: 7_001,
  },
  trend: Array.from({ length: 7 }, (_, index) => ({
    date: `2026-09-${String(index + 7).padStart(2, '0')}`,
    total: 4_000 + index * 1_000,
    accepted: 2_000 + index * 500,
    failed: 1_800 + index * 420,
  })),
};

const page: EvaluationList = {
  total: 124_892,
  page: 1,
  nextCursor: 'next',
  items: [
    {
      submissionId: 'submission-1',
      publicNumber: 124_892,
      problem: {
        id: 'p1',
        slug: 'a-plus-b',
        publicId: 'P1000',
        title: '两数之和',
      },
      submitter: { id: 'u1', displayName: '追风少年' },
      languageProfileId: 'cpp20-gcc-13-v1',
      status: 'COMPLETED_WITH_VERDICT',
      verdict: 'AC',
      createdAt: '2026-09-13T14:32:18.000Z',
      totalTimeMs: 12,
      peakMemoryBytes: 3.4 * 1024 * 1024,
      sourceBytes: 432,
    },
  ],
};

describe('Evaluation history full experience', () => {
  it('renders aggregated analytics, complete rows, and server-side pagination controls', async () => {
    window.history.replaceState({}, '', '/submissions');
    const evaluations = vi.fn(async () => page);
    const api = {
      evaluations,
      evaluationStatistics: vi.fn(async () => statistics),
    } as unknown as ApiClient;
    render(<SubmissionHistoryPage api={api} user={null} navigate={vi.fn()} />);

    expect(await screen.findByText('124,892')).toBeInTheDocument();
    expect(screen.getAllByText('60,317')).toHaveLength(2);
    expect(screen.getByText('24,318')).toBeInTheDocument();
    expect(screen.getByText('12 ms')).toBeInTheDocument();
    expect(screen.getByText('3.4 MB')).toBeInTheDocument();
    expect(screen.getByText('432 B')).toBeInTheDocument();
    expect(screen.getByText('共 124,892 条记录')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '12490' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '未通过' }));
    await waitFor(() =>
      expect(evaluations).toHaveBeenLastCalledWith(
        1,
        10,
        expect.objectContaining({ failed: true }),
      ),
    );
    fireEvent.change(screen.getByLabelText('每页记录数'), {
      target: { value: '20' },
    });
    await waitFor(() =>
      expect(evaluations).toHaveBeenLastCalledWith(1, 20, expect.any(Object)),
    );
    const problemSearch = screen.getByRole('textbox', {
      name: '搜索评测题目',
    });
    fireEvent.change(problemSearch, {
      target: { value: 'P1000' },
    });
    fireEvent.submit(problemSearch.closest('form')!);
    await waitFor(() =>
      expect(evaluations).toHaveBeenLastCalledWith(
        1,
        20,
        expect.objectContaining({ problemSearch: 'P1000' }),
      ),
    );
  });
});
