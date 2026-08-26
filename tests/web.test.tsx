// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, ErrorBoundary, NotFound } from '../apps/web/src/app/App.js';

describe('Web platform shell', () => {
  afterEach(() => {
    cleanup();
  });
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  it('renders loading then healthy state', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) }),
    );
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking platform health',
    );
    expect(await screen.findByText('Platform is ready.')).toBeInTheDocument();
  });
  it('renders an accessible error state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
  });
  it('renders controlled not-found UI', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading')).toHaveTextContent('Page not found');
  });
  it('catches render failures at the application boundary', () => {
    const Broken = () => {
      throw new Error('render failure');
    };
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('could not render');
  });
});
