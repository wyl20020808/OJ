// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../apps/web/src/app/App.js';
import { TagSelector } from '../apps/web/src/components/TagSelector.js';
import {
  appendTeamPage,
  CreateTeam,
  reconcileTeamLists,
  TeamPage,
} from '../apps/web/src/features/team/TeamPage.js';
import type { ApiClient, TeamSummary } from '../apps/web/src/services/api.js';

const team: TeamSummary = {
  id: 'team-1',
  slug: 'alpha-team',
  name: '算法竞赛一队',
  description: 'CSP / NOI 日常训练与题目讨论',
  avatarUrl: null,
  visibility: 'PUBLIC',
  joinPolicy: 'OPEN',
  ownerId: 'u1',
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
  memberCount: 18,
  role: 'OWNER',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

describe('Product UX Repair Wave 1', () => {
  it('keeps tag catalog hidden until trigger, then searches, selects, removes, and escapes', async () => {
    const tags = [
      {
        id: 1,
        name: '枚举',
        slug: 'enumeration',
        category: '基础算法',
        displayOrder: 1,
        isActive: true,
      },
      {
        id: 2,
        name: '动态规划',
        slug: 'dynamic-programming',
        category: '动态规划',
        displayOrder: 2,
        isActive: true,
      },
    ];
    const api = {
      tags: vi.fn().mockResolvedValue(tags),
    } as unknown as ApiClient;
    function Fixture() {
      const [value, setValue] = useState([2]);
      return <TagSelector api={api} value={value} onChange={setValue} />;
    }
    render(<Fixture />);
    await waitFor(() => expect(api.tags).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole('dialog', { name: '选择标签' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '移除标签 动态规划' }),
    ).toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: /选择标签/ });
    fireEvent.mouseEnter(trigger);
    const dialog = screen.getByRole('dialog', { name: '选择标签' });
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(dialog);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(dialog).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(
      screen.getByRole('heading', { name: '基础算法' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: '搜索标签' }), {
      target: { value: 'enumeration' },
    });
    expect(screen.getByRole('button', { name: '枚举' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '动态规划' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '枚举' }));
    expect(
      screen.getByRole('button', { name: '移除标签 枚举' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '移除标签 动态规划' }));
    expect(
      screen.queryByRole('button', { name: '移除标签 动态规划' }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.queryByRole('dialog', { name: '选择标签' }),
    ).not.toBeInTheDocument();
  });

  it('renders one logical team when membership and public results overlap', async () => {
    const api = {
      myTeams: vi.fn().mockResolvedValue({ items: [team] }),
      teams: vi.fn().mockResolvedValue({ items: [team] }),
    } as unknown as ApiClient;
    render(<TeamPage api={api} user={{ id: 'u1' }} navigate={vi.fn()} />);
    expect(await screen.findAllByText(team.name)).toHaveLength(1);
    expect(screen.getByText('@alpha-team')).toBeInTheDocument();
    expect(screen.getByText('18 名成员')).toBeInTheDocument();
    expect(screen.getByText('OWNER')).toBeInTheDocument();
  });

  it('keeps refresh and pagination reconciliation duplicate-free', () => {
    expect(reconcileTeamLists([team], [team]).discoverable).toEqual([]);
    expect(appendTeamPage([team], [team])).toEqual([team]);
    expect(appendTeamPage([], [team, team])).toEqual([team]);
  });

  it('renders structured create controls and blocks duplicate submit events', async () => {
    let resolveCreate!: (value: TeamSummary) => void;
    const createTeam = vi.fn(
      () =>
        new Promise<TeamSummary>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const navigate = vi.fn();
    const api = { createTeam } as unknown as ApiClient;
    render(<CreateTeam api={api} navigate={navigate} />);
    expect(
      screen.getByRole('heading', { name: '基本信息' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: '可见性' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: '加入方式' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('团队预览')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: '创建团队' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('团队名称'), {
      target: { value: 'Alpha Team' },
    });
    expect(screen.getByLabelText('Slug')).toHaveValue('alpha-team');
    expect(submit).toBeEnabled();
    const form = submit.closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(createTeam).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '正在创建...' })).toBeDisabled();
    resolveCreate(team);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/teams/alpha-team'),
    );
  });

  it('renders team overview and member details from real fields', async () => {
    const api = {
      team: vi.fn().mockResolvedValue({ ...team, membershipState: 'OWNER' }),
      teamMembers: vi.fn().mockResolvedValue({
        items: [
          {
            teamId: team.id,
            userId: 'u1',
            username: 'owner',
            displayName: '队长',
            role: 'OWNER',
            joinedAt: '2026-09-08T00:00:00.000Z',
          },
        ],
      }),
    } as unknown as ApiClient;
    render(
      <TeamPage
        api={api}
        slug="alpha-team"
        user={{ id: 'u1' }}
        navigate={vi.fn()}
      />,
    );
    expect(
      await screen.findByRole('heading', { name: team.name }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '团队概览' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '成员' })).toBeInTheDocument();
    expect(screen.getByText('@owner')).toBeInTheDocument();
  });

  it('keeps Discussion active on nested routes and preserves Problem and Team nav', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me'))
          return {
            ok: false,
            status: 401,
            json: async () => ({
              code: 'UNAUTHENTICATED',
              message: 'login',
              requestId: 'r',
            }),
          };
        if (url.endsWith('/ready'))
          return {
            ok: true,
            status: 200,
            json: async () => ({ status: 'ok', dependencies: {} }),
          };
        return { ok: true, status: 200, json: async () => ({ items: [] }) };
      }),
    );
    window.history.pushState({}, '', '/discussion/new');
    render(<App />);
    const discussion = await screen.findByRole('link', { name: '讨论' });
    expect(discussion).toHaveAttribute('href', '/discussion');
    expect(discussion).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Problems' })).toHaveAttribute(
      'href',
      '/problems',
    );
    expect(screen.getByRole('link', { name: '团队' })).toHaveAttribute(
      'href',
      '/teams',
    );
  });
});
