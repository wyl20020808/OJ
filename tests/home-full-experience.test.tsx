// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from '../apps/web/src/app/App.js';

const response = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

it('renders recommendation cards from public Home API problems', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me'))
        return response(401, {
          code: 'UNAUTHENTICATED',
          message: 'unauthenticated',
          requestId: 'test',
        });
      if (url.endsWith('/ready')) return response(200, { status: 'ready' });
      if (url.endsWith('/api/home'))
        return response(200, {
          recentProblems: [
            {
              id: 'problem-1',
              slug: 'demo-prefix-sum',
              title: '区间和查询',
              statement: '',
              inputDescription: '',
              outputDescription: '',
              examples: [],
              constraints: '',
              notes: '',
              timeLimitMs: 1000,
              memoryLimitBytes: 268435456,
              visibility: 'public',
              status: 'published',
              testdataVersion: null,
              authorId: null,
              difficulty: '简单',
              tags: ['前缀和'],
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
        });
      return response(404, {
        code: 'NOT_FOUND',
        message: 'not found',
        requestId: 'test',
      });
    }),
  );

  render(<App />);

  expect(await screen.findAllByText('区间和查询')).not.toHaveLength(0);
  expect(screen.getByText('简单 · 前缀和')).toBeInTheDocument();
  expect(screen.queryByText('入门必刷')).not.toBeInTheDocument();
});
