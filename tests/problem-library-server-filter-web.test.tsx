// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../apps/web/src/app/App.js';

const response = (body: unknown, status = 200) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('problem library server filter integration', () => {
  it('restores canonical URL filters, sends them to the API, and resets pagination on change', async () => {
    const requests: string[] = [];
    window.history.replaceState(
      {},
      '',
      '/problems?page=3&q=binary&difficulty=%E4%B8%AD%E7%AD%89&tagIds=1&provider=CODEFORCES',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith('/api/auth/me')) return response({}, 401);
        if (url.endsWith('/ready')) return response({ status: 'ok' });
        if (url.endsWith('/api/tags'))
          return response([
            {
              id: 1,
              slug: 'enumeration',
              name: '枚举',
              category: '基础算法',
              displayOrder: 0,
              isActive: true,
            },
          ]);
        if (url.includes('/api/problems?'))
          return response({
            items: [
              {
                id: 'p1',
                publicId: 'P0001',
                slug: 'binary-tree',
                title: 'Binary tree',
                difficulty: '中等',
                sourceType: 'EXTERNAL',
                provider: 'CODEFORCES',
                tags: ['枚举'],
                createdAt: '2026-09-10T00:00:00.000Z',
                updatedAt: '2026-09-10T00:00:00.000Z',
              },
            ],
            page: { total: 41, offset: 20, limit: 10 },
          });
        return response({}, 404);
      }),
    );

    render(<App />);
    await screen.findByText('Binary tree');
    await waitFor(() =>
      expect(
        requests.some((url) =>
          url.includes(
            'offset=30&limit=15&search=binary&difficulty=%E4%B8%AD%E7%AD%89&tagIds=1&provider=CODEFORCES',
          ),
        ),
      ).toBe(true),
    );

    fireEvent.click(screen.getByLabelText('普及'));
    await waitFor(() =>
      expect(
        requests.some((url) =>
          url.includes(
            'offset=0&limit=15&search=binary&difficulty=%E7%AE%80%E5%8D%95&tagIds=1&provider=CODEFORCES',
          ),
        ),
      ).toBe(true),
    );
    expect(window.location.search).not.toContain('page=3');
    expect(window.location.search).toContain('tagIds=1');
    expect(window.location.search).toContain('provider=CODEFORCES');
  });

  it('uses the sort selection and labels unsupported filters unavailable', async () => {
    const requests: string[] = [];
    let resolveTags!: (value: ReturnType<typeof response>) => void;
    const tagsRequest = new Promise<ReturnType<typeof response>>((resolve) => {
      resolveTags = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith('/api/auth/me')) return response({}, 401);
        if (url.endsWith('/ready')) return response({ status: 'ok' });
        if (url.endsWith('/api/tags')) return tagsRequest;
        if (url.includes('/api/problems?'))
          return response({
            items: [],
            page: { total: 0, offset: 0, limit: 10 },
            facets: { difficulty: {}, sourceType: {}, provider: {}, tags: [] },
          });
        return response({}, 404);
      }),
    );
    window.history.replaceState({}, '', '/problems');
    render(<App />);
    await screen.findByText('暂无题目');
    expect(
      screen.getByText('时间、内存、通过率及个人通过状态筛选暂不可用。'),
    ).toBeInTheDocument();

    const search = screen.getByLabelText('关键词');
    const listRequests = () =>
      requests.filter((url) => url.includes('/api/problems?')).length;
    const beforeSearch = listRequests();
    await act(async () => {
      resolveTags(response([]));
      await tagsRequest;
    });
    expect(listRequests()).toBe(beforeSearch);
    fireEvent.change(search, { target: { value: 'graph' } });
    expect(listRequests()).toBe(beforeSearch);
    fireEvent.submit(search.closest('form')!);
    await waitFor(() =>
      expect(requests.some((url) => url.includes('search=graph'))).toBe(true),
    );

    fireEvent.change(screen.getByLabelText('题目排序'), {
      target: { value: 'title:asc' },
    });
    await waitFor(() =>
      expect(
        requests.some(
          (url) => url.includes('sort=title') && url.includes('order=asc'),
        ),
      ).toBe(true),
    );
    expect(window.location.search).toContain('sort=title');
  });

  it('does not present a failed tag request as an empty tag catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) return response({}, 401);
        if (url.endsWith('/ready')) return response({ status: 'ok' });
        if (url.endsWith('/api/tags'))
          return response(
            { code: 'INTERNAL_ERROR', message: 'unavailable' },
            500,
          );
        if (url.includes('/api/problems?'))
          return response({
            items: [],
            page: { total: 0, offset: 0, limit: 15 },
            facets: { difficulty: {}, sourceType: {}, provider: {}, tags: [] },
          });
        return response({}, 404);
      }),
    );
    window.history.replaceState({}, '', '/problems');
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '标签筛选暂时不可用',
    );
    expect(screen.getByText('标签数据暂时不可用')).toBeInTheDocument();
    expect(screen.queryByText('暂无标签')).not.toBeInTheDocument();
  });

  it('searches canonical tags, selects one, updates URL state, and resets page', async () => {
    const requests: string[] = [];
    window.history.replaceState({}, '', '/problems?page=2');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith('/api/auth/me')) return response({}, 401);
        if (url.endsWith('/ready')) return response({ status: 'ok' });
        if (url.endsWith('/api/tags'))
          return response([
            {
              id: 1,
              slug: 'enumeration',
              name: '枚举',
              category: '基础算法',
              displayOrder: 1,
              isActive: true,
            },
            {
              id: 2,
              slug: 'dynamic-programming',
              name: '动态规划',
              category: '动态规划',
              displayOrder: 2,
              isActive: true,
            },
          ]);
        if (url.includes('/api/problems?'))
          return response({
            items: [],
            page: { total: 25, offset: 10, limit: 10 },
            facets: { difficulty: {}, sourceType: {}, provider: {}, tags: [] },
          });
        return response({}, 404);
      }),
    );

    render(<App />);
    await screen.findByText('暂无题目');
    fireEvent.click(screen.getByRole('button', { name: /选择标签/ }));
    const dialog = screen.getByRole('dialog', { name: '选择标签' });
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: '搜索标签' }),
      {
        target: { value: 'dynamic-programming' },
      },
    );
    fireEvent.click(within(dialog).getByRole('button', { name: '动态规划' }));

    await waitFor(() =>
      expect(
        requests.some(
          (url) =>
            url.includes('offset=0&limit=15') && url.includes('tagIds=2'),
        ),
      ).toBe(true),
    );
    expect(window.location.search).toBe('?tagIds=2');
    expect(
      screen.queryByRole('dialog', { name: '选择标签' }),
    ).not.toBeInTheDocument();
  });
});
