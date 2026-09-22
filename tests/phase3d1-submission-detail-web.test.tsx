// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
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
      submissionSource: vi.fn().mockResolvedValue({
        submissionId: submission.id,
        languageId: submission.languageId,
        source: submission.source,
      }),
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

class FixtureEventSource {
  static instances: FixtureEventSource[] = [];
  readonly listeners = new Map<
    string,
    Array<(event: MessageEvent<string>) => void>
  >();
  readonly close = vi.fn();

  constructor(
    readonly url: string | URL,
    readonly options?: EventSourceInit,
  ) {
    FixtureEventSource.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string, data: Record<string, unknown>) {
    const event = new MessageEvent<string>(type, {
      data: JSON.stringify(data),
    });
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

afterEach(() => {
  FixtureEventSource.instances = [];
  vi.unstubAllGlobals();
});

describe('Phase 3D.1 submission detail Web projection', () => {
  it('shows authoritative testcase facts and keeps earlier generations read-only', async () => {
    const { api } = apiFor({
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
      await screen.findByRole('heading', { name: /^评测 #s-7/ }),
    ).toBeInTheDocument();
    const progress = await screen.findByRole('region', { name: '测试点进度' });
    expect(within(progress).getByLabelText('测试点 2 AC')).toHaveTextContent(
      '✓',
    );
    expect(screen.getByText('28 ms')).toBeInTheDocument();
    const information = screen.getByRole('complementary', {
      name: '评测信息',
    });
    expect(
      within(information).getByText('语言').nextElementSibling,
    ).toHaveTextContent('cpp20');
    expect(
      within(information).getByText('状态').nextElementSibling,
    ).toHaveTextContent('COMPLETED_WITH_VERDICT');
    const main = document.querySelector('.submission-primary');
    expect(main?.nextElementSibling).toBe(information);
    expect(
      screen.queryByRole('button', { name: /Generation 2 - Current/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Generation History')).not.toBeInTheDocument();
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
    const information = screen.getByRole('complementary', {
      name: '评测信息',
    });
    expect(within(information).getByText('状态')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /judgeJobId|testcaseSetId|storage credential/i,
    );
  });

  it('applies authoritative testcase SSE fixtures without terminal regression', async () => {
    vi.stubGlobal('EventSource', FixtureEventSource);
    const waiting = [1, 2, 3].map((ordinal) => ({
      ordinal,
      status: 'WAITING',
    }));
    const { api } = apiFor({
      2: {
        evaluationGeneration: 2,
        attemptGeneration: 1,
        status: 'RUNNING',
        current: true,
        createdAt: submission.createdAt,
        detail: {
          testcaseCount: 3,
          completedTestcaseCount: 0,
          testcases: waiting,
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
    Object.assign(api as object, {
      submissionEvaluationStreamUrl: vi.fn().mockReturnValue('/stream'),
    });
    render(<SubmissionDetail api={api} id={submission.id} user={user} />);

    const progress = await screen.findByRole('region', { name: '测试点进度' });
    expect(
      within(progress).getByLabelText('测试点 1 WAITING'),
    ).toHaveTextContent('·');
    await waitFor(() => expect(FixtureEventSource.instances).toHaveLength(1));
    const stream = FixtureEventSource.instances[0]!;
    expect(stream.url).toBe('/stream');
    expect(stream.options).toEqual({ withCredentials: true });

    stream.emit('testcase.updated', {
      status: 'RUNNING',
      detail: {
        testcaseCount: 3,
        completedTestcaseCount: 0,
        testcases: [{ ordinal: 1, status: 'RUNNING' }, ...waiting.slice(1)],
      },
    });
    expect(
      await within(progress).findByLabelText('测试点 1 RUNNING'),
    ).toHaveTextContent('…');

    stream.emit('testcase.updated', {
      status: 'RUNNING',
      detail: {
        testcaseCount: 3,
        completedTestcaseCount: 1,
        testcases: [
          { ordinal: 1, status: 'AC', verdict: 'AC', timeMs: 11 },
          ...waiting.slice(1),
        ],
      },
    });
    expect(
      await within(progress).findByLabelText('测试点 1 AC'),
    ).toHaveTextContent('✓');

    stream.emit('testcase.updated', {
      status: 'RUNNING',
      detail: {
        testcaseCount: 3,
        completedTestcaseCount: 1,
        testcases: [
          { ordinal: 1, status: 'AC', verdict: 'AC', timeMs: 11 },
          { ordinal: 2, status: 'RUNNING' },
          waiting[2],
        ],
      },
    });
    expect(
      await within(progress).findByLabelText('测试点 2 RUNNING'),
    ).toHaveTextContent('…');

    stream.emit('testcase.updated', {
      status: 'RUNNING',
      detail: {
        testcaseCount: 3,
        completedTestcaseCount: 2,
        testcases: [
          { ordinal: 1, status: 'AC', verdict: 'AC', timeMs: 11 },
          { ordinal: 2, status: 'WA', verdict: 'WA', timeMs: 14 },
          waiting[2],
        ],
      },
    });
    expect(
      await within(progress).findByLabelText('测试点 2 WA'),
    ).toHaveTextContent('×');

    stream.emit('testcase.updated', {
      status: 'RUNNING',
      detail: {
        testcaseCount: 3,
        completedTestcaseCount: 1,
        testcases: [
          { ordinal: 1, status: 'RUNNING' },
          { ordinal: 2, status: 'WA', verdict: 'WA', timeMs: 14 },
          waiting[2],
        ],
      },
    });
    expect(within(progress).getByLabelText('测试点 1 AC')).toHaveTextContent(
      '✓',
    );

    stream.emit('testcase.updated', {
      status: 'RUNNING',
      detail: {
        testcaseCount: 3,
        completedTestcaseCount: 3,
        testcases: [
          { ordinal: 1, status: 'AC', verdict: 'AC', timeMs: 11 },
          { ordinal: 2, status: 'WA', verdict: 'WA', timeMs: 14 },
          { ordinal: 3, status: 'SKIPPED' },
        ],
      },
    });
    expect(
      await within(progress).findByLabelText('测试点 3 SKIPPED'),
    ).toHaveTextContent('!');

    stream.emit('evaluation.terminal', {
      status: 'COMPLETED_WITH_VERDICT',
      verdict: 'WA',
      completedAt: '2026-09-02T00:01:00.000Z',
      detail: {
        testcaseCount: 3,
        completedTestcaseCount: 3,
        testcases: [
          { ordinal: 1, status: 'AC', verdict: 'AC', timeMs: 11 },
          { ordinal: 2, status: 'WA', verdict: 'WA', timeMs: 14 },
          { ordinal: 3, status: 'SKIPPED' },
        ],
      },
    });
    await waitFor(() => expect(stream.close).toHaveBeenCalledOnce());
  });

  it('reconciles non-terminal snapshots every 3 seconds and stops after terminal', async () => {
    vi.useFakeTimers();
    const snapshot = {
      evaluationGeneration: 2,
      attemptGeneration: 1,
      status: 'RUNNING',
      current: true,
      createdAt: submission.createdAt,
      detail: {
        testcaseCount: 1,
        completedTestcaseCount: 0,
        testcases: [{ ordinal: 1, status: 'RUNNING' }],
      },
    };
    const { api, submissionEvaluation } = apiFor({ 2: snapshot, 1: snapshot });
    submissionEvaluation
      .mockResolvedValueOnce({ evaluation: snapshot })
      .mockResolvedValueOnce({
        evaluation: {
          ...snapshot,
          status: 'COMPLETED_WITH_VERDICT',
          verdict: 'AC',
        },
      })
      .mockResolvedValue({ evaluation: { ...snapshot, status: 'RUNNING' } });
    const clearSpy = vi.spyOn(window, 'clearInterval');
    render(<SubmissionDetail api={api} id={submission.id} user={user} />);
    await vi.waitFor(() =>
      expect(submissionEvaluation).toHaveBeenCalledTimes(1),
    );
    await vi.advanceTimersByTimeAsync(3000);
    await vi.waitFor(() =>
      expect(submissionEvaluation).toHaveBeenCalledTimes(2),
    );
    await vi.waitFor(() =>
      expect(
        within(
          screen.getByRole('complementary', { name: '评测信息' }),
        ).getByText('COMPLETED_WITH_VERDICT'),
      ).toBeInTheDocument(),
    );
    await vi.advanceTimersByTimeAsync(6000);
    expect(submissionEvaluation).toHaveBeenCalledTimes(2);
    cleanup();
    expect(clearSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
