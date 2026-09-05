// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubmissionDetail } from '../apps/web/src/app/App.js';

const submission = {
  id: 's-v5',
  ownerUserId: 'u-1',
  problemId: 'sum',
  problemRevisionId: 'r-1',
  testdataVersionRef: 'td-1',
  languageId: 'cpp20',
  source: 'int main() { return 0; }',
  sourceBytes: 24,
  status: 'EXECUTION_COMPLETED',
  createdAt: '2026-09-05T15:35:11Z',
  updatedAt: '2026-09-05T15:35:17Z',
  evaluation: {
    evaluationGeneration: 1,
    attemptGeneration: 1,
    status: 'COMPLETED_WITH_VERDICT',
    verdict: 'AC',
    current: true,
  },
} as const;
const evaluation = {
  ...submission.evaluation,
  createdAt: submission.createdAt,
  completedAt: submission.updatedAt,
  detail: {
    testcaseCount: 1,
    completedTestcaseCount: 1,
    totalTimeMs: 128,
    peakMemoryBytes: 4_900_000,
    testcases: [
      { ordinal: 1, verdict: 'AC', timeMs: 128, memoryBytes: 4_900_000 },
    ],
  },
};
function makeApi() {
  return {
    submission: vi.fn().mockResolvedValue(submission),
    submissionEvaluations: vi
      .fn()
      .mockResolvedValue({ items: [submission.evaluation] }),
    submissionEvaluation: vi.fn().mockResolvedValue({ submission, evaluation }),
    problem: vi.fn().mockResolvedValue({
      id: 'sum',
      slug: 'P0001',
      publicId: 'P0001',
      title: '两数之和',
    }),
  } as never;
}
const user = {
  id: 'u-1',
  username: 'ada',
  email: 'ada@example.test',
  displayName: 'Ada',
  status: 'active' as const,
};
afterEach(() => vi.restoreAllMocks());

describe('Evaluation Detail UX V5', () => {
  it('separates result and code tabs, copies source, and centralizes metadata', async () => {
    const api = makeApi();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    render(<SubmissionDetail api={api} id={submission.id} user={user} />);
    expect(
      await screen.findByRole('tab', { name: '评测结果' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Generation History')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /P0001 · 两数之和/ }),
    ).toHaveAttribute('href', '/problems/P0001');
    await screen.findByText('128 ms');
    const info = screen.getByRole('complementary', { name: '评测信息' });
    expect(
      within(info).getByText('Verdict').nextElementSibling,
    ).toHaveTextContent('AC');
    expect(within(info).getByText('Time').nextElementSibling).toHaveTextContent(
      '128 ms',
    );
    fireEvent.click(screen.getByRole('tab', { name: '代码' }));
    expect(screen.getByText(submission.source)).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: '测试点进度' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '复制代码' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      submission.source,
    );
  });

  it('keeps testcase facts inside square cards', async () => {
    const api = makeApi();
    render(<SubmissionDetail api={api} id={submission.id} user={user} />);
    const card = await screen.findByRole('listitem');
    expect(card).toHaveClass('testcase-row');
    expect(card).toHaveTextContent('#1');
    expect(card).toHaveTextContent('AC');
    expect(card).toHaveTextContent('Time 128 ms');
    expect(card).toHaveTextContent('Memory 4.7 MB');
  });
});
