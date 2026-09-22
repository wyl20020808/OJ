// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../apps/web/src/app/App.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

describe('Homework dashboard navbar', () => {
  it('uses the shared navigation and marks homework active', async () => {
    window.history.pushState({}, '', '/homework');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
        json: async () => ({
          code: 'UNAUTHENTICATED',
          message: 'unauthenticated',
        }),
      }),
    );

    render(<App />);

    const homeworkLink = await screen.findByRole('link', { name: '作业' });
    expect(homeworkLink).toHaveAttribute('href', '/homework');
    expect(homeworkLink).toHaveClass('active');
    expect(document.querySelector('.app-navbar')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', {
        name: '请先登录后查看我的作业',
      }),
    ).toBeInTheDocument();
  });
});
