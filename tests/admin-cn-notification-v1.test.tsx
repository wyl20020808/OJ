// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { readFile } from 'node:fs/promises';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../apps/web/src/services/api.js';
import { NotificationBell } from '../apps/web/src/components/PortalExperience.js';
import {
  displayJudgeNodeState,
  JudgeMachinesPage,
} from '../apps/web/src/components/JudgeMachinesPage.js';

const { judgeAdmin } = vi.hoisted(() => ({
  judgeAdmin: {
    summary: vi.fn(),
    nodes: vi.fn(),
    node: vi.fn(),
    assignments: vi.fn(),
    jobs: vi.fn(),
    failures: vi.fn(),
    policy: vi.fn(),
    lifecycleCapabilities: vi.fn(),
    mutate: vi.fn(),
    lifecycle: vi.fn(),
    addNode: vi.fn(),
    setMode: vi.fn(),
  },
}));

vi.mock('../apps/web/src/services/judge-admin.js', () => ({
  createJudgeAdminClient: () => judgeAdmin,
}));

const summary = {
  totalNodes: 0,
  onlineCount: 0,
  busyCount: 0,
  drainingCount: 0,
  offlineCount: 0,
  unhealthyCount: 0,
  activeJobs: 0,
  totalCapacity: 0,
  schedulableCapacity: 0,
  staleNodeCount: 0,
  generatedAt: '2026-09-05T00:00:00.000Z',
};

describe('Admin Chinese and notification popover V1', () => {
  beforeEach(() => {
    for (const method of Object.values(judgeAdmin)) method.mockReset();
    judgeAdmin.summary.mockResolvedValue(summary);
    judgeAdmin.nodes.mockResolvedValue({ items: [] });
    judgeAdmin.policy.mockRejectedValue(new Error('not configured'));
    judgeAdmin.lifecycleCapabilities.mockResolvedValue({
      available: false,
      actions: [],
    });
    judgeAdmin.assignments.mockResolvedValue({ items: [] });
    judgeAdmin.jobs.mockResolvedValue({ items: [] });
    judgeAdmin.failures.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps the visible admin navigation copy in Chinese', async () => {
    const source = await readFile('apps/web/src/app/App.tsx', 'utf8');

    expect(source).toMatch(
      /to="\/admin\/judge\/nodes"[\s\S]*?>\s*管理\s*<\/Link>/,
    );
    expect(source).toContain("'judge-nodes': 'Judge 节点管理'");
  });

  it('shows Chinese page, section, card, status, action, and helper copy', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('例行维护');
    render(<JudgeMachinesPage fixture />);

    expect(
      await screen.findByRole('heading', { name: 'Judge 节点管理' }),
    ).toBeInTheDocument();
    expect(screen.getByText('管理 / Judge')).toBeInTheDocument();
    expect(screen.getByText(/Product 后端快照/)).toBeInTheDocument();
    for (const label of [
      '节点总数',
      '在线',
      '忙碌',
      '排空中',
      '离线',
      '异常',
      '已过期',
      '活跃任务 / 总容量',
      '可调度容量',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('节点池模式：不可用')).toBeInTheDocument();
    expect(screen.getByText(/Host Agent：/)).toHaveTextContent(
      'HOST_AGENT_NOT_AVAILABLE',
    );
    expect(
      screen.getByPlaceholderText('节点 ID / 状态 / 运行版本'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '排空任务' })[0]!);
    expect(prompt).toHaveBeenCalledWith(
      '确认排空任务 judge-a，请输入原因',
      '例行维护',
    );
    expect(await screen.findByText(/已提交排空任务/)).toBeInTheDocument();
  });

  it('maps every Judge node state for display without changing enum values', () => {
    expect(
      ['ONLINE', 'BUSY', 'DRAINING', 'OFFLINE', 'UNHEALTHY'].map(
        displayJudgeNodeState,
      ),
    ).toEqual(['在线', '忙碌', '排空中', '离线', '异常']);
    expect(displayJudgeNodeState('FUTURE_STATE')).toBe('未知');
  });

  it('shows Chinese detail labels while preserving technical identifiers', async () => {
    render(<JudgeMachinesPage fixture />);
    fireEvent.click(
      (await screen.findAllByRole('button', { name: '详情' }))[0]!,
    );

    for (const heading of [
      '状态与容量',
      '能力',
      '任务分配',
      '评测任务',
      '失败记录',
    ]) {
      expect(
        await screen.findByRole('heading', { name: heading }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByText(/controlVersion/, { selector: 'p' }),
    ).toHaveTextContent('incarnation');
    expect(screen.getByText('cpp20-gcc-13-v1')).toBeInTheDocument();
    expect(screen.getByText('EXACT_BYTES')).toBeInTheDocument();
    expect(screen.getByText('REAL_SANDBOXED_EXECUTION')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Host Agent 生命周期' }),
    ).toBeInTheDocument();
    for (const action of ['启动', '停止', '重启']) {
      expect(screen.getByRole('button', { name: action })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: '启动' })).toHaveAttribute(
      'title',
      'Host Agent 不可用（HOST_AGENT_NOT_AVAILABLE）',
    );
  });

  it('shows Chinese empty and loading states', async () => {
    const empty = render(<JudgeMachinesPage />);
    expect(await screen.findByText('节点注册表为空')).toBeInTheDocument();
    expect(
      screen.getByText('Product 后端未返回可显示节点。'),
    ).toBeInTheDocument();
    empty.unmount();

    judgeAdmin.summary.mockReturnValue(new Promise(() => undefined));
    render(<JudgeMachinesPage />);
    expect(screen.getByRole('status')).toHaveTextContent(
      '正在加载 Judge 节点…',
    );
  });

  it('localizes errors while retaining HTTP status and backend error code', async () => {
    judgeAdmin.summary.mockRejectedValue(
      new ApiError(
        {
          code: 'JUDGE_UNAVAILABLE',
          message: 'upstream unavailable',
          requestId: 'request-1',
        },
        503,
      ),
    );
    render(<JudgeMachinesPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Judge Service 暂不可用');
    expect(alert).toHaveTextContent(
      'Product 后端当前无法取得 Judge 状态，请稍后重试。',
    );
    expect(alert).toHaveTextContent('JUDGE_UNAVAILABLE');
    expect(alert).toHaveTextContent('HTTP 503');
    expect(alert).toHaveTextContent('请求 ID request-1');
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
