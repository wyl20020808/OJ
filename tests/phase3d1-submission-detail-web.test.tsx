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
import { SubmissionDetail } from '../apps/web/src/app/App.js';

const user = {
  id: 'u-1',
  username: 'ada',
  email: 'ada@example.test',
  displayName: 'Ada',
  status: 'active' as const,
};
const submission = {
  id: 's-7',
  ownerUserId: 'u-1',
  problemId: 'sum',
  problemRevisionId: 'r-1',
  testdataVersionRef: 'td-1',
  languageId: 'cpp20',
  source: '#include <iostream>\nint main() {}',
  sourceBytes: 31,
  status: 'EXECUTION_COMPLETED',
  createdAt: '2026-09-02T00:00:00.000Z',
  updatedAt: '2026-09-02T00:01:00.000Z',
  evaluation: {
    evaluationGeneration: 2,
    attemptGeneration: 1,
    status: 'COMPLETED_WITH_VERDICT',
    verdict: 'AC',
    current: true,
  },
};

function apiFor(evaluations: Record<number, Record<string, unknown>>) {
  const submissionEvaluation = vi.fn().mockImplementation((_id, generation) =>
    Promise.resolve({
      submission: {
        id: submission.id,
        languageId: submission.languageId,
        createdAt: submission.createdAt,
      },
      evaluation: evaluations[generation],
    }),
  );
  return {
    api: {
      submission: vi.fn().mockResolvedValue(submission),
      submissionEvaluations: vi.fn().mockResolvedValue({
        items: [
          {
            evaluationGeneration: 2,
            attemptGeneration: 1,
            status: 'COMPLETED_WITH_VERDICT',
            verdict: 'AC',
            current: true,
          },
          {
            evaluationGeneration: 1,
            attemptGeneration: 1,
            status: 'COMPLETED_WITH_VERDICT',
            verdict: 'WA',
            current: false,
          },
        ],
      }),
      submissionEvaluation,
    } as never,
    submissionEvaluation,
  };
}

afterEach(cleanup);

describe('Phase 3D.1 submission detail Web projection', () => {
  it('shows authoritative testcase facts and keeps earlier generations read-only', async () => {
    const { api, submissionEvaluation } = apiFor({
      2: {
        evaluationGeneration: 2,
        attemptGeneration: 1,
        status: 'COMPLETED_WITH_VERDICT',
        verdict: 'AC',
        current: true,
        createdAt: submission.createdAt,
        completedAt: '2026-09-02T00:01:00.000Z',
        detail: {
          testcaseCount: 2,
          completedTestcaseCount: 2,
          totalTimeMs: 28,
          peakMemoryBytes: 3_670_016,
          testcases: [
            { ordinal: 1, verdict: 'AC', timeMs: 12, memoryBytes: 3_355_443 },
            { ordinal: 2, verdict: 'AC', timeMs: 16, memoryBytes: 3_670_016 },
          ],
        },
      },
      1: {
        evaluationGeneration: 1,
        attemptGeneration: 1,
        status: 'COMPLETED_WITH_VERDICT',
        verdict: 'WA',
        current: false,
        createdAt: submission.createdAt,
        detail: {
          testcaseCount: 1,
          completedTestcaseCount: 1,
          totalTimeMs: 21,
          peakMemoryBytes: 3_145_728,
          testcases: [
            { ordinal: 1, verdict: 'WA', timeMs: 21, memoryBytes: 3_145_728 },
          ],
        },
      },
    });
    render(<SubmissionDetail api={api} id={submission.id} user={user} />);

    expect(
      await screen.findByRole('heading', { name: 'Submission #s-7' }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('测试点 2 AC')).toHaveTextContent('✓');
    expect(screen.getByText('28 ms')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Generation 2 - Current/ }),
    ).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /Generation 1\s*WA/ }));
    await waitFor(() => expect(screen.getAllByText('21 ms')).toHaveLength(2));
    expect(screen.getAllByText('WA').length).toBeGreaterThan(0);
    expect(submissionEvaluation).toHaveBeenLastCalledWith(submission.id, 1);
  });

  it('does not invent testcase progress for a non-terminal evaluation', async () => {
    const { api } = apiFor({
      2: {
        evaluationGeneration: 2,
        attemptGeneration: 1,
        status: 'RUNNING',
        current: true,
        createdAt: submission.createdAt,
        detail: {
          testcaseCount: 1,
          completedTestcaseCount: 1,
          testcases: [{ ordinal: 1, verdict: 'AC', timeMs: 9 }],
        },
      },
      1: {
        evaluationGeneration: 1,
        attemptGeneration: 1,
        status: 'COMPLETED_WITH_VERDICT',
        verdict: 'WA',
        current: false,
        createdAt: submission.createdAt,
      },
    });
    render(<SubmissionDetail api={api} id={submission.id} user={user} />);

    expect(
      await screen.findByText('正在评测，详细测试点结果将在评测完成后显示。'),
    ).toBeInTheDocument();
    expect(screen.queryByText('#1')).not.toBeInTheDocument();
  });

  it('renders bounded compiler diagnostics without manufacturing testcase execution', async () => {
    const { api } = apiFor({
      2: {
        evaluationGeneration: 2,
        attemptGeneration: 1,
        status: 'COMPLETED_WITH_VERDICT',
        verdict: 'CE',
        current: true,
        createdAt: submission.createdAt,
        completedAt: '2026-09-02T00:01:00.000Z',
        detail: {
          testcaseCount: 0,
          completedTestcaseCount: 0,
          testcases: [],
          compile: {
            status: 'FAILED',
            diagnostics: 'main.cpp:4: error: expected ;',
            truncated: false,
          },
        },
      },
      1: {
        evaluationGeneration: 1,
        attemptGeneration: 1,
        status: 'COMPLETED_WITH_VERDICT',
        verdict: 'WA',
        current: false,
        createdAt: submission.createdAt,
      },
    });
    render(<SubmissionDetail api={api} id={submission.id} user={user} />);

    expect(
      await screen.findByText('main.cpp:4: error: expected ;'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('该评测代没有可展示的测试点执行记录。'),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /judgeJobId|testcaseSetId|storage credential/i,
    );
  });
});
