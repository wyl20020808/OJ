// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../apps/web/src/app/App.js';
import { ProblemEditor } from '../apps/web/src/components/ProblemEditor.js';
import type { ApiClient, Problem } from '../apps/web/src/services/api.js';

const problem: Problem = {
  id: 'p1',
  slug: 'sum',
  title: 'A+B Problem',
  statement: 'Compute a sum.',
  inputDescription: 'Two integers.',
  outputDescription: 'Their sum.',
  examples: [],
  constraints: 'Integers.',
  notes: '',
  timeLimitMs: 1000,
  memoryLimitBytes: 256 * 1024 * 1024,
  visibility: 'public',
  status: 'published',
  testdataVersion: 'td1',
  authorId: 'u1',
  capabilities: { canEdit: true },
  createdAt: '2026-09-02T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
};

const response = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const appCss = readFileSync(
  resolve(process.cwd(), 'apps/web/src/app/app.css'),
  'utf8',
);

function renderApp(
  path: string,
  user: Record<string, unknown>,
  detail = problem,
) {
  window.history.pushState({}, '', path);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return response(user);
      if (url.endsWith('/ready'))
        return response({ status: 'ok', dependencies: {} });
      if (url.includes('/api/problems?'))
        return response({
          items: [problem],
          page: { total: 1, offset: 0, limit: 20 },
        });
      if (url.endsWith('/api/problems/sum')) return response(detail);
      if (url.endsWith('/api/submissions/languages'))
        return response([
          {
            id: 'cpp20',
            name: 'C++ 20',
            extension: '.cpp',
            maxSourceBytes: 65_536,
          },
        ]);
      if (url.includes('/api/evaluations'))
        return response({
          items: [
            {
              submissionId: 's1',
              problem: { id: 'p1', slug: 'sum', title: 'A+B Problem' },
              submitter: { id: 'u1', displayName: 'Owner' },
              languageProfileId: 'cpp20',
              status: 'QUEUED',
              createdAt: '2026-09-02T00:00:00.000Z',
            },
          ],
          nextCursor: null,
        });
      return response({});
    }),
  );
  render(<App />);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Web UI polish', () => {
  it('shows the canonical editor entry from the server capability', async () => {
    renderApp('/problems/sum', {
      id: 'u1',
      username: 'guest-owner',
      email: null,
      displayName: 'Guest owner',
      status: 'active',
      guest: true,
    });

    expect(
      await screen.findByRole('button', { name: '编辑题目' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('题目操作')).toHaveTextContent(
      '提交代码编辑题目收藏',
    );
    expect(screen.getByRole('link', { name: '编辑题目' })).toHaveAttribute(
      'href',
      '/author/problems/p1/edit',
    );
    expect(screen.getByRole('link', { name: '提交代码' })).toHaveAttribute(
      'href',
      '/problems/sum/submit',
    );
    expect(screen.getByRole('link', { name: '提交代码' })).not.toHaveAttribute(
      'href',
      expect.stringContaining('#solve'),
    );
    expect(
      await screen.findByRole('heading', { name: 'Online Code Editor' }),
    ).toBeInTheDocument();
  });

  it('opens the traditional submission surface from the problem action', async () => {
    renderApp('/problems/sum', {
      id: 'u2',
      username: 'reader',
      email: 'reader@example.test',
      displayName: 'Reader',
      status: 'active',
    });

    fireEvent.click(await screen.findByRole('link', { name: '提交代码' }));
    expect(
      await screen.findByRole('heading', { name: '提交代码' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('编程语言')).toBeInTheDocument();
    expect(screen.getByLabelText('源代码')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '提交源代码' }),
    ).toBeInTheDocument();
  });

  it('hides internal metadata and copies only whitespace-preserved sample input', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderApp(
      '/problems/sum',
      {
        id: 'u2',
        username: 'reader',
        email: 'reader@example.test',
        displayName: 'Reader',
        status: 'active',
      },
      {
        ...problem,
        currentRevisionId: '6b58a19a-160e-455e-9ee3-e8c9788212bc',
        testdataVersion: 'phase1c-e2e-v1',
        examples: [{ input: '  1 2\n\n', output: '3\n' }],
      },
    );

    await screen.findByRole('heading', { name: 'A+B Problem' });
    expect(
      screen.queryByText('6b58a19a-160e-455e-9ee3-e8c9788212bc'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('phase1c-e2e-v1')).not.toBeInTheDocument();
    expect(screen.getByLabelText('样例 1 输入')).toHaveTextContent('1 2');
    expect(screen.getByLabelText('样例 1 输出')).toHaveTextContent('3');
    expect(screen.getByLabelText('样例 1 输入')).toHaveClass(
      'sample-code',
      'sample-input',
    );

    fireEvent.click(screen.getByRole('button', { name: '复制样例' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('  1 2\n\n'));
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining('3'));
  });

  it('keeps the information card in document flow and samples light', () => {
    expect(appCss).not.toMatch(
      /\.problem-aside\s*\{[^}]*position:\s*(?:sticky|fixed)/,
    );
    expect(appCss).toMatch(
      /\.sample-code\s*\{[^}]*background:\s*#f7f9fa[^}]*color:\s*var\(--ink\)/,
    );
    expect(appCss).toMatch(
      /\.sample-code\s*\{[^}]*white-space:\s*pre[^}]*overflow-x:\s*auto/,
    );
  });

  it('does not expose an editor entry for a non-owner', async () => {
    renderApp(
      '/problems/sum',
      {
        id: 'u2',
        username: 'reader',
        email: 'reader@example.test',
        displayName: 'Reader',
        status: 'active',
      },
      { ...problem, capabilities: { canEdit: false } },
    );

    await screen.findByRole('heading', { name: 'A+B Problem' });
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: '编辑题目' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('moves the authenticated Guest create entry into the problem library', async () => {
    renderApp('/problems', {
      id: 'u1',
      username: 'guest-owner',
      email: null,
      displayName: 'Guest owner',
      status: 'active',
      guest: true,
    });

    const create = await screen.findByRole('link', { name: '新建题目' });
    expect(create).toHaveAttribute('href', '/author/problems/new');
    expect(screen.queryByText('我的题目')).not.toBeInTheDocument();
  });

  it('uses the real global evaluation contract for the evaluation list', async () => {
    renderApp('/submissions', {
      id: 'u1',
      username: 'owner',
      email: 'owner@example.test',
      displayName: 'Owner',
      status: 'active',
    });

    expect(
      await screen.findByRole('heading', { name: '评测列表' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '评测列表' })).toHaveTextContent(
      '#s1sum A+B ProblemOwnercpp20',
    );
    expect(screen.getByRole('link', { name: '查看评测 s1' })).toHaveAttribute(
      'href',
      '/submissions/s1',
    );
    expect(screen.queryByText('int main() {}')).not.toBeInTheDocument();
  });

  it('navigates from the evaluation row body and keeps filter controls local', async () => {
    renderApp('/submissions', {
      id: 'u1',
      username: 'owner',
      email: 'owner@example.test',
      displayName: 'Owner',
      status: 'active',
    });
    await screen.findByRole('heading', { name: '评测列表' });
    fireEvent.click(screen.getAllByRole('row')[1]!);
    expect(window.location.pathname).toBe('/submissions/s1');

    cleanup();
    window.history.pushState({}, '', '/submissions');
    renderApp('/submissions', {
      id: 'u1',
      username: 'owner',
      email: 'owner@example.test',
      displayName: 'Owner',
      status: 'active',
    });
    await screen.findByRole('heading', { name: '评测列表' });
    fireEvent.change(screen.getByRole('combobox', { name: '结果' }), {
      target: { value: 'AC' },
    });
    expect(window.location.pathname).toBe('/submissions');
  });

  it('shows the admin entry only when the backend capability allows it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me'))
          return response({
            id: 'root',
            username: 'root',
            email: 'root@example.test',
            displayName: 'Root',
            status: 'active',
          });
        if (url.endsWith('/api/admin/judge/capabilities'))
          return response({ canView: true });
        if (url.endsWith('/ready')) return response({ status: 'ok' });
        return response({ items: [], nextCursor: null });
      }),
    );
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(await screen.findByRole('link', { name: '管理' })).toHaveAttribute(
      'href',
      '/admin/judge/nodes',
    );
  });

  it('saves the statement without editor refresh or problem publication controls', async () => {
    const api = {
      problem: vi.fn().mockResolvedValue(problem),
      judgeDraft: vi.fn().mockResolvedValue({
        problemId: 'p1',
        defaults: {
          timeLimitMs: 1000,
          memoryLimitBytes: 1,
          outputLimitBytes: 1,
          checker: 'EXACT_BYTES',
          allowedLanguageProfiles: [],
        },
        testcases: [],
        validation: { state: 'UNKNOWN', errors: [], warnings: [] },
        updatedAt: '2026-09-02T00:00:00.000Z',
      }),
      judgeVersions: vi.fn().mockResolvedValue([]),
      updateProblem: vi.fn().mockResolvedValue(problem),
      validateJudgeData: vi.fn(),
      publishJudgeData: vi.fn(),
    } as unknown as ApiClient;
    render(<ProblemEditor api={api} problemId="p1" />);

    fireEvent.click(await screen.findByRole('button', { name: '保存题面' }));
    await waitFor(() =>
      expect(api.updateProblem).toHaveBeenCalledWith('p1', expect.any(Object)),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      '题面草稿已保存',
    );
    expect(
      screen.queryByRole('button', { name: '刷新' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '发布题目' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '评测数据' }));
    expect(
      screen.getByRole('button', { name: '发布新数据版本' }),
    ).toBeInTheDocument();
  });
});
