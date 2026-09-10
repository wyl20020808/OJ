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
      '/problems?page=3&q=binary&difficulty=%E4%B8%AD%E7%AD%89&tagIds=1&sourceType=EXTERNAL',
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
                tags: ['枚举'],
                createdAt: '2026-09-10T00:00:00.000Z',
                updatedAt: '2026-09-10T00:00:00.000Z',
              },
            ],
            page: { total: 41, offset: 40, limit: 20 },
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
            'offset=40&limit=20&search=binary&difficulty=%E4%B8%AD%E7%AD%89&tagIds=1&sourceType=EXTERNAL',
          ),
        ),
      ).toBe(true),
    );

    fireEvent.click(screen.getByLabelText('简单'));
    await waitFor(() =>
      expect(
        requests.some((url) =>
          url.includes(
            'offset=0&limit=20&search=binary&difficulty=%E7%AE%80%E5%8D%95&tagIds=1&sourceType=EXTERNAL',
          ),
        ),
      ).toBe(true),
    );
    expect(window.location.search).not.toContain('page=3');
    expect(window.location.search).toContain('tagIds=1');
    expect(window.location.search).toContain('sourceType=EXTERNAL');
  });

  it('uses the sort selection in the server request and disables unsupported filters', async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith('/api/auth/me')) return response({}, 401);
        if (url.endsWith('/ready')) return response({ status: 'ok' });
        if (url.endsWith('/api/tags')) return response([]);
        if (url.includes('/api/problems?'))
          return response({
            items: [],
            page: { total: 0, offset: 0, limit: 20 },
            facets: { difficulty: {}, sourceType: {}, tags: [] },
          });
        return response({}, 404);
      }),
    );
    window.history.replaceState({}, '', '/problems');
    render(<App />);
    await screen.findByText('暂无题目');
    expect(screen.getByLabelText('时间限制')).toBeDisabled();
    expect(screen.getByLabelText('内存限制')).toBeDisabled();
    expect(screen.getByLabelText('通过率')).toBeDisabled();

    const search = screen.getByLabelText('关键词');
    const listRequests = () =>
      requests.filter((url) => url.includes('/api/problems?')).length;
    const beforeSearch = listRequests();
    fireEvent.change(search, { target: { value: 'graph' } });
    expect(listRequests()).toBe(beforeSearch);
    fireEvent.submit(search.closest('form')!);
    await waitFor(() =>
      expect(requests.some((url) => url.includes('search=graph'))).toBe(true),
    );

    fireEvent.change(screen.getByLabelText('题目排序'), {
      target: { value: 'updatedAt:desc' },
    });
    await waitFor(() =>
      expect(
        requests.some(
          (url) => url.includes('sort=updatedAt') && url.includes('order=desc'),
        ),
      ).toBe(true),
    );
    expect(window.location.search).toContain('sort=updatedAt');
  });
});
