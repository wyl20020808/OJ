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
import { App } from '../apps/web/src/app/App.js';
import { ProblemEditor } from '../apps/web/src/components/ProblemEditor.js';
import {
  ApiError,
  createApiClient,
  type ApiClient,
  type JudgeDraft,
  type Problem,
} from '../apps/web/src/services/api.js';

const problem: Problem = {
  id: 'p1',
  slug: 'hello-world',
  title: 'Hello World',
  statement: 'Print hello.',
  inputDescription: 'No input.',
  outputDescription: 'Print hello.',
  examples: [],
  constraints: 'None.',
  notes: '',
  timeLimitMs: 1000,
  memoryLimitBytes: 256 * 1024 * 1024,
  visibility: 'private',
  status: 'draft',
  testdataVersion: null,
  authorId: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const testcase = (
  overrides: Partial<JudgeDraft['testcases'][number]> = {},
) => ({
  testcaseId: 'tc1',
  ordinal: 1,
  label: 'sample',
  input: {
    objectId: 'in-1',
    fileName: '01.in',
    sizeBytes: 1024,
    sha256: 'in-hash',
  },
  expectedOutput: {
    objectId: 'out-1',
    fileName: '01.out',
    sizeBytes: 2048,
    sha256: 'out-hash',
  },
  timeLimitMsOverride: null,
  memoryLimitBytesOverride: null,
  outputLimitBytesOverride: null,
  effectiveTimeLimitMs: 1000,
  effectiveMemoryLimitBytes: 256 * 1024 * 1024,
  effectiveOutputLimitBytes: 64 * 1024 * 1024,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const draft = (testcases = [testcase()]): JudgeDraft => ({
  problemId: 'p1',
  defaults: {
    timeLimitMs: 1000,
    memoryLimitBytes: 256 * 1024 * 1024,
    outputLimitBytes: 64 * 1024 * 1024,
    checker: 'EXACT_BYTES',
    allowedLanguageProfiles: ['cpp17'],
  },
  testcases,
  validation: { state: 'UNKNOWN', errors: [], warnings: [] },
  updatedAt: '2026-01-01T00:00:00Z',
});

const version = {
  versionId: 'v1',
  problemId: 'p1',
  versionNumber: 1,
  manifestSha256: 'manifest-hash',
  testcaseCount: 1,
  checker: 'EXACT_BYTES' as const,
  createdAt: '2026-01-01T00:00:00Z',
  publishedAt: '2026-01-01T00:00:00Z',
  publishedBy: 'author',
};

function makeApi(overrides: Partial<Record<keyof ApiClient, unknown>> = {}) {
  return {
    problem: vi.fn().mockResolvedValue(problem),
    judgeDraft: vi.fn().mockResolvedValue(draft()),
    judgeVersions: vi.fn().mockResolvedValue([version]),
    updateProblem: vi.fn().mockResolvedValue(problem),
    saveJudgeConfig: vi.fn().mockResolvedValue(draft()),
    updateJudgeTestcase: vi.fn().mockResolvedValue(testcase()),
    validateJudgeData: vi.fn().mockResolvedValue({
      state: 'VALID',
      errors: [],
      warnings: [],
    }),
    publishJudgeData: vi.fn().mockResolvedValue(version),
    uploadJudgeData: vi.fn().mockResolvedValue(draft()),
    deleteJudgeTestcase: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ApiClient;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ProblemEditor judge-data contract UI', () => {
  it('renders the route editor with statement, data, settings tabs and published history', async () => {
    const api = makeApi();
    render(<ProblemEditor api={api} problemId="p1" />);

    expect(
      await screen.findByRole('heading', { name: /编辑题目：Hello World/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: '题目编辑分区' }),
    ).toHaveTextContent('题面评测数据评测设置');
    expect(screen.getByText('DRAFT')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '评测数据' }));
    expect(
      screen.getByRole('heading', { name: 'Judge Data' }),
    ).toBeInTheDocument();
    expect(screen.getByText('01.in / 01.out')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '版本历史' }),
    ).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '评测设置' }));
    expect(
      screen.getByRole('heading', { name: '评测设置' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('默认时间（毫秒）')).toHaveValue(1000);
  });

  it('wires the author edit URL to the ProblemEditor route', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              id: 'u1',
              username: 'author',
              email: 'a@example.test',
              displayName: 'Author',
              status: 'active',
            }),
          };
        }
        if (url.endsWith('/ready'))
          return {
            status: 200,
            ok: true,
            json: async () => ({ status: 'ok' }),
          };
        if (url.endsWith('/api/problems/p1'))
          return { status: 200, ok: true, json: async () => problem };
        if (url.endsWith('/api/problems/p1/judge-data/draft'))
          return { status: 200, ok: true, json: async () => draft() };
        if (url.endsWith('/api/problems/p1/judge-data/versions'))
          return { status: 200, ok: true, json: async () => [version] };
        return {
          status: 200,
          ok: true,
          json: async () => ({
            items: [],
            page: { total: 0, offset: 0, limit: 20 },
          }),
        };
      });
    vi.stubGlobal('fetch', fetcher);
    window.history.pushState({}, '', '/author/problems/p1/edit');
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: /编辑题目：Hello World/ }),
    ).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith('/api/problems/p1', expect.anything());
  });

  it('shows empty draft state and keeps testcase content metadata-only', async () => {
    const api = makeApi({ judgeDraft: vi.fn().mockResolvedValue(draft([])) });
    render(<ProblemEditor api={api} problemId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '评测数据' }));
    expect(
      screen.getByRole('heading', { name: '暂无测试点' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/上传 \.in 与 \.out、\.ans 或 \.txt 文件，或 ZIP/),
    ).toBeInTheDocument();
    expect(screen.queryByText('in-hash')).not.toBeInTheDocument();
    expect(screen.queryByText('out-hash')).not.toBeInTheDocument();
  });

  it('defaults an empty judge-data editor to token whitespace while retaining exact bytes', async () => {
    const api = makeApi({ judgeDraft: vi.fn().mockResolvedValue(null) });
    render(<ProblemEditor api={api} problemId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '评测设置' }));
    const checker = screen.getByLabelText('Checker');
    expect(checker).toHaveValue('TOKEN_WHITESPACE');
    expect(checker).toContainHTML(
      '<option value="EXACT_BYTES">Exact bytes</option>',
    );
  });

  it('supports inherited defaults and independent testcase overrides with reset', async () => {
    const api = makeApi({
      judgeDraft: vi.fn().mockResolvedValue(
        draft([
          testcase(),
          testcase({
            testcaseId: 'tc2',
            ordinal: 2,
            label: null,
            timeLimitMsOverride: 2000,
            effectiveTimeLimitMs: 2000,
          }),
        ]),
      ),
    });
    render(<ProblemEditor api={api} problemId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '评测数据' }));
    expect(screen.getAllByText(/Default/).length).toBeGreaterThanOrEqual(3);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(6);
    fireEvent.click(checkboxes[0]!);
    expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
    fireEvent.click(checkboxes[0]!);
    expect(screen.getAllByText(/Default/).length).toBeGreaterThanOrEqual(3);
  });

  it('saves judge defaults through the typed config endpoint', async () => {
    const api = makeApi();
    render(<ProblemEditor api={api} problemId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '评测设置' }));
    fireEvent.change(screen.getByLabelText('默认时间（毫秒）'), {
      target: { value: '2500' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
    await waitFor(() =>
      expect(api.saveJudgeConfig).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ timeLimitMs: 2500 }),
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      '评测设置已保存',
    );
  });

  it('requires destructive confirmation before deleting a testcase', async () => {
    const api = makeApi();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ProblemEditor api={api} problemId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '评测数据' }));
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(confirm).toHaveBeenCalledWith('确定删除测试点 #1 吗？');
    expect(api.deleteJudgeTestcase).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() =>
      expect(api.deleteJudgeTestcase).toHaveBeenCalledWith('p1', 'tc1'),
    );
    expect(screen.queryByText('01.in / 01.out')).not.toBeInTheDocument();
  });

  it('uploads a pair or ZIP through the Product judge-data client and reports partial errors', async () => {
    const uploadJudgeData = vi
      .fn()
      .mockResolvedValueOnce(draft([testcase()]))
      .mockRejectedValueOnce(
        new ApiError(
          { code: 'ZIP_PARTIAL', message: '部分文件无法导入', requestId: 'r1' },
          422,
        ),
      );
    const api = makeApi({ uploadJudgeData });
    render(<ProblemEditor api={api} problemId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '评测数据' }));
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    fireEvent.change(input, {
      target: {
        files: [new File(['in'], '01.in'), new File(['ans'], '01.ans')],
      },
    });
    expect(await screen.findByText('01.in / 01.ans')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '上传选中的数据' }));
    await waitFor(() =>
      expect(uploadJudgeData).toHaveBeenCalledWith(
        'p1',
        expect.any(Array),
        false,
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      '测试点已导入草稿',
    );
    fireEvent.change(input, {
      target: { files: [new File(['zip'], 'batch.zip')] },
    });
    fireEvent.click(screen.getByRole('button', { name: '上传选中的数据' }));
    await waitFor(() =>
      expect(uploadJudgeData).toHaveBeenCalledWith(
        'p1',
        expect.any(File),
        true,
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      '部分文件无法导入',
    );
  });

  it('validates then requires publish confirmation and records the immutable version', async () => {
    const api = makeApi();
    render(<ProblemEditor api={api} problemId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '评测数据' }));
    fireEvent.click(screen.getByRole('button', { name: '校验草稿' }));
    await waitFor(() =>
      expect(api.validateJudgeData).toHaveBeenCalledWith('p1'),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('校验通过');
    fireEvent.click(screen.getByRole('button', { name: '发布新数据版本' }));
    expect(
      screen.getByRole('dialog', { name: '发布评测数据？' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认发布' }));
    await waitFor(() =>
      expect(api.publishJudgeData).toHaveBeenCalledWith('p1'),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      '数据版本 v1 已发布',
    );
  });

  it('shows Judge Data validation errors and keeps publication unavailable', async () => {
    const api = makeApi({
      validateJudgeData: vi.fn().mockRejectedValue(
        new ApiError(
          {
            code: 'TESTCASE_SIZE_EXCEEDED',
            message: 'Testcase #1 exceeds the Judge execution byte limit',
            requestId: 'r400',
          },
          400,
        ),
      ),
    });
    render(<ProblemEditor api={api} problemId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '评测数据' }));
    fireEvent.click(screen.getByRole('button', { name: '校验草稿' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Testcase #1 exceeds the Judge execution byte limit',
    );
    expect(
      screen.getByRole('button', { name: '发布新数据版本' }),
    ).toBeDisabled();
  });

  it('surfaces stale publish conflicts instead of claiming success', async () => {
    const api = makeApi({
      validateJudgeData: vi
        .fn()
        .mockResolvedValue({ state: 'VALID', errors: [], warnings: [] }),
      publishJudgeData: vi.fn().mockRejectedValue(
        new ApiError(
          {
            code: 'STALE_CONFLICT',
            message: '草稿已过期',
            requestId: 'r409',
          },
          409,
        ),
      ),
    });
    render(<ProblemEditor api={api} problemId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '评测数据' }));
    fireEvent.click(screen.getByRole('button', { name: '校验草稿' }));
    await screen.findByText('校验通过，可以发布。');
    fireEvent.click(screen.getByRole('button', { name: '发布新数据版本' }));
    fireEvent.click(screen.getByRole('button', { name: '确认发布' }));
    expect(await screen.findByRole('status')).toHaveTextContent('草稿已过期');
    expect(
      screen.queryByText(/已发布，旧版本保持不可变/),
    ).not.toBeInTheDocument();
  });

  it('honors permissions in the UI while preserving backend 403 errors', async () => {
    const forbidden = new ApiError(
      { code: 'FORBIDDEN', message: '没有评测数据权限', requestId: 'r403' },
      403,
    );
    const api = makeApi({
      judgeDraft: vi.fn().mockRejectedValue(forbidden),
      judgeVersions: vi.fn().mockRejectedValue(forbidden),
    });
    render(
      <ProblemEditor
        api={api}
        problemId="p1"
        canEdit={false}
        canManage={false}
        canPublish={false}
      />,
    );
    expect(
      await screen.findByRole('heading', { name: '无权访问评测数据' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('没有评测数据权限');
  });

  it('keeps a readable editor when version history is unavailable', async () => {
    const api = makeApi({
      judgeVersions: vi.fn().mockRejectedValue(
        new ApiError(
          {
            code: 'STORAGE_UNAVAILABLE',
            message: '版本存储暂不可用',
            requestId: 'r-storage',
          },
          503,
        ),
      ),
    });
    render(<ProblemEditor api={api} problemId="p1" />);
    expect(
      await screen.findByRole('heading', { name: /编辑题目：Hello World/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '评测数据' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      '版本历史暂不可用：版本存储暂不可用',
    );
    expect(
      screen.getByRole('heading', { name: 'Judge Data' }),
    ).toBeInTheDocument();
  });

  it('supports statement edit/preview and preserves existing samples in the shared model', async () => {
    const api = makeApi({
      problem: vi.fn().mockResolvedValue({
        ...problem,
        examples: [{ input: '1 2', output: '3', note: 'sum' }],
      }),
    });
    render(<ProblemEditor api={api} problemId="p1" />);
    expect(
      await screen.findByRole('heading', { name: /编辑题目：Hello World/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '预览' }));
    expect(screen.getByRole('heading', { name: '样例' })).toBeInTheDocument();
    expect(screen.getByText('1 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    expect(screen.getByLabelText('输入样例 1')).toHaveValue('1 2');
  });

  it('adds, removes, and saves ordered public samples through the problem API', async () => {
    const updateProblem = vi.fn().mockResolvedValue(problem);
    const api = makeApi({ updateProblem });
    render(<ProblemEditor api={api} problemId="p1" />);
    await screen.findByRole('heading', { name: /编辑题目：Hello World/ });
    fireEvent.click(screen.getByRole('button', { name: '添加样例' }));
    fireEvent.change(screen.getByLabelText('输入样例 1'), {
      target: { value: '1 2' },
    });
    fireEvent.change(screen.getByLabelText('输出样例 1'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加样例' }));
    fireEvent.click(screen.getAllByRole('button', { name: '删除' })[1]!);
    fireEvent.click(screen.getByRole('button', { name: '保存题面' }));
    await waitFor(() =>
      expect(updateProblem).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({
          samples: [{ ordinal: 1, input: '1 2', output: '3' }],
        }),
      ),
    );
  });

  it('uses only Product judge-data paths and no privileged Judge/storage endpoints', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi
      .fn()
      .mockImplementation(async (url: string, init?: RequestInit) => {
        requests.push(init === undefined ? { url } : { url, init });
        return { ok: true, status: 200, json: async () => ({}) };
      });
    const client = createApiClient('', fetcher);
    await client.judgeData('p1');
    await client.judgeDraft('p1');
    await client.judgeVersions('p1');
    await client.judgeVersion('p1', 'v1');
    await client.judgeTestcase('p1', 'tc1');
    await client.saveJudgeConfig('p1', {
      timeLimitMs: 1000,
      memoryLimitBytes: 1,
      outputLimitBytes: 1,
      checker: 'EXACT_BYTES',
      allowedLanguageProfiles: [],
    });
    await client.validateJudgeData('p1');
    await client.publishJudgeData('p1');
    expect(requests).toHaveLength(8);
    expect(
      requests.every(({ url }) =>
        url.startsWith('/api/problems/p1/judge-data'),
      ),
    ).toBe(true);
    expect(
      requests.some(({ url }) =>
        /\/v1\/|minio|storage\/admin|judge\/admin/i.test(url),
      ),
    ).toBe(false);
    expect(
      requests.every(
        ({ init }) =>
          init?.headers &&
          !Object.keys(init.headers).some((key) =>
            /authorization|credential|token/i.test(key),
          ),
      ),
    ).toBe(true);
  });

  it('keeps the editor keyboard usable and exposes a mobile-friendly testcase list', async () => {
    const api = makeApi();
    render(<ProblemEditor api={api} problemId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '评测数据' }));
    const tabs = screen.getByRole('navigation', { name: '题目编辑分区' });
    const dataTab = screen.getByRole('button', { name: '评测数据' });
    dataTab.focus();
    expect(dataTab).toHaveFocus();
    expect(tabs.querySelectorAll('button')).toHaveLength(3);
    expect(document.querySelector('.testcase-row')).toBeInTheDocument();
    expect(document.querySelector('table')).toBeNull();
  });
});
