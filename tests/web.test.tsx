// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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
      vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ status: 'ok', dependencies: {} }),
      }),
    );
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking platform readiness',
    );
    expect(await screen.findByText('Platform is ready.')).toBeInTheDocument();
  });
  it('renders an accessible error state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
  });
  it('renders a controlled degraded readiness state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 503,
        json: async () => ({
          status: 'not_ready',
          dependencies: { redis: 'unavailable' },
        }),
      }),
    );
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('not ready');
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
  it('protects the authoring workspace when unauthenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me'))
          return {
            status: 401,
            json: async () => ({
              code: 'UNAUTHENTICATED',
              message: 'Sign in required',
              requestId: 'r1',
            }),
          };
        return {
          status: 200,
          json: async () => ({ status: 'ok', dependencies: {} }),
        };
      }),
    );
    window.history.pushState({}, '', '/author');
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Sign in required' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Sign in' })[1]).toHaveAttribute(
      'href',
      '/login',
    );
  });
  it('validates and saves a new draft through the typed client', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url.endsWith('/api/auth/me'))
            return {
              status: 200,
              json: async () => ({
                id: 'u1',
                username: 'author',
                email: 'a@example.com',
                displayName: 'Author',
                status: 'active',
              }),
            };
          if (url.endsWith('/ready'))
            return {
              status: 200,
              json: async () => ({ status: 'ok', dependencies: {} }),
            };
          if (url.endsWith('/api/problems') && init?.method === 'POST')
            return {
              status: 201,
              json: async () => ({
                id: 'p1',
                slug: 'hello-world',
                title: 'Hello World',
                status: 'draft',
                visibility: 'private',
                statement: 's',
                inputDescription: 'i',
                outputDescription: 'o',
                constraints: 'c',
                examples: [],
                timeLimitMs: 1000,
                memoryLimitBytes: 1024,
                notes: '',
                authorId: 'u1',
                testdataVersion: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }),
            };
          return {
            status: 200,
            json: async () => ({
              items: [],
              page: { total: 0, offset: 0, limit: 100 },
            }),
          };
        },
      );
    vi.stubGlobal('fetch', fetcher);
    window.history.pushState({}, '', '/author/problems/new');
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Create problem' }),
    ).toBeInTheDocument();
    fireEvent.submit(
      screen.getByRole('button', { name: 'Save draft' }).closest('form')!,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Complete all required fields',
    );
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Hello World' },
    });
    fireEvent.change(screen.getByLabelText('Slug'), {
      target: { value: 'hello-world' },
    });
    fireEvent.change(screen.getByLabelText('Statement'), {
      target: { value: 's' },
    });
    fireEvent.change(screen.getByLabelText('Input description'), {
      target: { value: 'i' },
    });
    fireEvent.change(screen.getByLabelText('Output description'), {
      target: { value: 'o' },
    });
    fireEvent.change(screen.getByLabelText('Constraints'), {
      target: { value: 'c' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/api/problems',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });
});
