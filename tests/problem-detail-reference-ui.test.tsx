// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../apps/web/src/app/App.js';
import type {
  AuthenticatedUser,
  DiscussionPost,
  Problem,
} from '../apps/web/src/services/api.js';

const problem: Problem = {
  id: 'problem-1216',
  publicNumber: 1216,
  publicId: 'P1216',
  slug: 'number-triangle',
  title: '数字三角形',
  statement: '从三角形顶部走到底部，求路径上的最大数字和。',
  inputDescription: '第一行是行数，随后给出数字三角形。',
  outputDescription: '输出最大路径和。',
  examples: [{ input: '3\n1\n2 3\n4 5 6', output: '10' }],
  constraints: '1 ≤ n ≤ 1000',
  notes: '',
  timeLimitMs: 1000,
  memoryLimitBytes: 128 * 1024 * 1024,
  visibility: 'public',
  status: 'published',
  testdataVersion: 'internal-version-must-stay-hidden',
  currentRevisionId: 'internal-revision-must-stay-hidden',
  authorId: null,
  difficulty: '入门',
  source: '洛谷',
  tags: ['动态规划', '基础'],
  tagDetails: [
    {
      id: 7,
      slug: 'dynamic-programming',
      name: '动态规划',
      category: 'algorithm',
      displayOrder: 1,
      isActive: true,
    },
  ],
  statistics: { submissionCount: 64_331, acceptedCount: 39_887 },
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-09T00:00:00Z',
};

const related: Problem = {
  ...problem,
  id: 'problem-1004',
  publicNumber: 1004,
  publicId: 'P1004',
  slug: 'grid-path',
  title: '方格取数',
  statistics: { submissionCount: 200, acceptedCount: 100 },
};

const post: DiscussionPost = {
  id: 'discussion-1',
  publicId: 'D0001',
  type: 'ARTICLE',
  kind: 'SOLUTION',
  status: 'PUBLISHED',
  title: 'P1216 数字三角形题解汇总',
  summary: '整理多种动态规划写法。',
  contentMarkdown: '正文',
  publishedAt: '2026-09-08T08:00:00Z',
  createdAt: '2026-09-08T08:00:00Z',
  updatedAt: '2026-09-08T08:00:00Z',
  viewCount: 128,
  likeCount: 32,
  commentCount: 9,
  category: null,
  tags: [],
  coverImageUrl: null,
  isFeatured: false,
  isPinned: false,
  dataOrigin: 'USER',
  author: { username: 'solver', displayName: '解题者' },
};

const user: AuthenticatedUser = {
  id: 'user-1',
  username: 'solver',
  displayName: '解题者',
  email: 'solver@example.test',
  status: 'active',
};

const response = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

function renderProblem() {
  window.history.pushState({}, '', '/problems/number-triangle');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return response(200, user);
      if (url.endsWith('/ready')) return response(200, { status: 'ready' });
      if (url.endsWith('/api/problems/number-triangle'))
        return response(200, problem);
      if (url.includes('/api/problems?'))
        return response(200, {
          items: [problem, related],
          page: { total: 2, offset: 0, limit: 6 },
        });
      if (url.includes('/api/discussion/posts?'))
        return response(200, { items: [post] });
      if (url.endsWith('/api/problems/number-triangle/judge-data'))
        return response(200, { defaults: { checker: 'EXACT_BYTES' } });
      return response(404, { code: 'NOT_FOUND', message: 'not found' });
    }),
  );
  render(<App />);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  window.history.pushState({}, '', '/');
});

describe('problem detail reference UI', () => {
  it('renders truthful title statistics, integrated breadcrumbs and related problems', async () => {
    renderProblem();

    await screen.findByRole('heading', { name: '数字三角形' });
    const breadcrumbs = screen.getByRole('navigation', { name: '面包屑' });
    expect(breadcrumbs).toHaveTextContent('题库›P1216 数字三角形');

    const statistics = screen.getByLabelText('题目统计');
    expect(statistics).toHaveTextContent('提交64,331');
    expect(statistics).toHaveTextContent('通过39,887');
    expect(statistics).toHaveTextContent('通过率62.0%');
    expect(statistics).toHaveTextContent('难度入门');
    expect(statistics.querySelectorAll('svg')).toHaveLength(4);

    expect(
      screen.getByRole('navigation', { name: '题目内容' }),
    ).toHaveTextContent('题面讨论提交记录');
    expect(
      await screen.findByRole('link', { name: /P1004方格取数/ }),
    ).toHaveAttribute('href', '/problems/grid-path');
    expect(document.body).not.toHaveTextContent(
      'internal-version-must-stay-hidden',
    );
    expect(document.body).not.toHaveTextContent(
      'internal-revision-must-stay-hidden',
    );
  });

  it('loads matching real discussion content inside the secondary tab', async () => {
    renderProblem();
    await screen.findByRole('heading', { name: '数字三角形' });

    fireEvent.click(screen.getByRole('button', { name: '讨论' }));
    const feed = await screen.findByRole('feed', { name: '题目讨论' });
    expect(
      within(feed).getByRole('heading', { name: post.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '发起讨论' })).toHaveAttribute(
      'href',
      '/discussion/new',
    );
    expect(screen.queryByText(problem.statement)).not.toBeInTheDocument();
  });
});
