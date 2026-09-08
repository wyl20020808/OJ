// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from '../apps/web/src/components/Toast.js';
import { DiscussionEditor } from '../apps/web/src/features/discussion/DiscussionExperience.js';
import type { ApiClient } from '../apps/web/src/services/api.js';

function ToastProbe() {
  const toast = useToast();
  return (
    <button
      onClick={() =>
        toast({
          kind: 'success',
          title: '保存成功',
          description: '内容已更新',
          duration: 20,
        })
      }
    >
      show
    </button>
  );
}

describe('Unified authoring UX', () => {
  it('renders, stacks, manually dismisses and auto-dismisses toasts', async () => {
    render(
      <ToastProvider>
        <ToastProbe />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'show' }));
    expect(screen.getByRole('status')).toHaveTextContent('保存成功');
    fireEvent.click(screen.getByRole('button', { name: '关闭通知' }));
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'show' }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull(), {
      timeout: 100,
    });
  });

  it('uses shared authoring toolbar and article metadata controls', async () => {
    const api = {
      createDiscussionPost: vi
        .fn()
        .mockResolvedValue({ id: 'p1', publicId: 'p1' }),
      updateDiscussionPost: vi.fn(),
    } as unknown as ApiClient;
    render(
      <DiscussionEditor
        api={api}
        navigate={() => undefined}
        user={
          {
            id: 'u1',
            username: 'writer',
            displayName: 'Writer',
            guest: false,
          } as never
        }
      />,
    );
    expect(screen.getByPlaceholderText('输入文章标题…')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '内容类型' })).toBeInTheDocument();
    expect(screen.getByTitle('粗体 Ctrl+B')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('写下你的文章内容……'),
    ).toBeInTheDocument();
  });
});
