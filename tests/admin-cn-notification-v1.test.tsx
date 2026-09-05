// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { readFile } from 'node:fs/promises';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from '../apps/web/src/components/PortalExperience.js';

describe('Admin Chinese and notification popover V1', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps the visible admin navigation copy in Chinese', async () => {
    const source = await readFile('apps/web/src/app/App.tsx', 'utf8');

    expect(source).toMatch(
      /to="\/admin\/judge\/nodes"[\s\S]*?>\s*管理\s*<\/Link>/,
    );
  });

  it('opens, preserves inside clicks, closes outside, and toggles from bell', () => {
    render(<NotificationBell navigate={vi.fn()} />);
    const bell = screen.getByRole('button', { name: '通知' });

    fireEvent.click(bell);
    const dialog = screen.getByRole('dialog', { name: '通知预览' });
    fireEvent.pointerDown(dialog);
    expect(dialog).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog', { name: '通知预览' })).toBeNull();

    fireEvent.click(bell);
    expect(
      screen.getByRole('dialog', { name: '通知预览' }),
    ).toBeInTheDocument();
    fireEvent.click(bell);
    expect(screen.queryByRole('dialog', { name: '通知预览' })).toBeNull();
  });

  it('closes from X and Escape', () => {
    render(<NotificationBell navigate={vi.fn()} />);
    const bell = screen.getByRole('button', { name: '通知' });

    fireEvent.click(bell);
    fireEvent.click(screen.getByRole('button', { name: '关闭通知' }));
    expect(screen.queryByRole('dialog', { name: '通知预览' })).toBeNull();

    fireEvent.click(bell);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '通知预览' })).toBeNull();
  });

  it('removes document listeners when unmounted', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const view = render(<NotificationBell navigate={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '通知' }));
    const pointerListener = add.mock.calls.find(
      ([type]) => type === 'pointerdown',
    )?.[1];
    const keyboardListener = add.mock.calls.find(
      ([type]) => type === 'keydown',
    )?.[1];
    expect(pointerListener).toBeDefined();
    expect(keyboardListener).toBeDefined();

    view.unmount();
    expect(remove).toHaveBeenCalledWith('pointerdown', pointerListener, true);
    expect(remove).toHaveBeenCalledWith('keydown', keyboardListener);
  });
});
