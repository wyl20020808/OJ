// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProblemLibraryPage } from '../apps/web/src/features/problem-library/ProblemLibraryPage.js';
import type { ApiClient, Problem } from '../apps/web/src/services/api.js';

const tags: NonNullable<Problem['tagDetails']> = [
  {
    id: 1,
    slug: 'dynamic-programming',
    name: '动态规划',
    category: '动态规划',
    displayOrder: 1,
    isActive: true,
  },
  {
    id: 2,
    slug: 'number-theory',
    name: '数论',
    category: '数学',
    displayOrder: 2,
    isActive: true,
  },
];

const problem: Problem = {
  id: 'problem-1',
  publicId: 'P1000',
  slug: 'a-plus-b',
  title: 'A + B Problem',
  statement: '求两个整数之和。',
  inputDescription: '两个整数。',
  outputDescription: '它们的和。',
  examples: [],
  constraints: '整数范围。',
  timeLimitMs: 1000,
  memoryLimitBytes: 268435456,
  visibility: 'public',
  status: 'published',
  testdataVersion: null,
  authorId: null,
  difficulty: '入门',
  sourceType: 'TEST_FIXTURE',
  tagDetails: tags,
  statistics: { submissionCount: 25, acceptedCount: 18 },
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-12T00:00:00.000Z',
};

describe('Problem Library', () => {
  const problems = vi.fn().mockResolvedValue({
    items: [problem],
    page: { total: 57, offset: 0, limit: 15 },
    facets: {
      difficulty: { 入门: 12 },
      sourceType: { TEST_FIXTURE: 30 },
      tags: [
        { id: 1, count: 18 },
        { id: 2, count: 11 },
      ],
    },
  });
  const api = {
    problems,
    tags: vi.fn().mockResolvedValue(tags),
  } as unknown as ApiClient;

  beforeEach(() => {
    problems.mockClear();
    window.history.replaceState({}, '', '/problems');
  });

  afterEach(cleanup);

  it('loads a dense page and switches between list and grid views', async () => {
    render(<ProblemLibraryPage api={api} user={null} navigate={vi.fn()} />);

    expect(await screen.findByText('A + B Problem')).toBeInTheDocument();
    expect(problems).toHaveBeenCalledWith(
      0,
      15,
      expect.objectContaining({ sort: 'updatedAt', order: 'desc' }),
    );

    fireEvent.click(screen.getByRole('button', { name: '网格视图' }));
    expect(screen.getByRole('list', { name: '题目列表' })).toHaveClass(
      'is-grid',
    );
    expect(screen.getByRole('button', { name: '网格视图' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('searches and selects canonical tag ids', async () => {
    render(<ProblemLibraryPage api={api} user={null} navigate={vi.fn()} />);
    await screen.findByText('A + B Problem');

    fireEvent.click(screen.getByRole('button', { name: '选择标签' }));
    fireEvent.change(screen.getByRole('textbox', { name: '搜索标签' }), {
      target: { value: '数论' },
    });
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '选择标签' })).getByRole(
        'button',
        { name: '数论' },
      ),
    );

    await waitFor(() =>
      expect(problems).toHaveBeenLastCalledWith(
        0,
        15,
        expect.objectContaining({ tagId: 2 }),
      ),
    );
    expect(window.location.search).toContain('tagIds=2');
  });
});
