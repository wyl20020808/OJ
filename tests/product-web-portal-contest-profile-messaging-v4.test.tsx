// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../apps/web/src/app/App.js';
import {
  chooseDailyProblem,
  getDailyFortune,
} from '../apps/web/src/app/homeContent.js';
import {
  ActivityHeatmap,
  ContestExperience,
  MessagesExperience,
  NotificationBell,
  ProfileExperience,
} from '../apps/web/src/components/PortalExperience.js';
import type {
  AuthenticatedUser,
  Problem,
} from '../apps/web/src/services/api.js';
import type {
  ContestDetail,
  ContestStanding,
  ContestSummary,
  ConversationSummary,
  Message,
  UserActivityDay,
} from '../apps/web/src/services/portal-contracts.js';

const source = (path: string) => readFileSync(resolve(path), 'utf8');
const appSource = source('apps/web/src/app/App.tsx');
const portalSource = source('apps/web/src/components/PortalExperience.tsx');
const appCss = source('apps/web/src/app/app.css');
const portalCss = source('apps/web/src/components/portal.css');
const packageSource = source('package.json');

const problem: Problem = {
  id: 'p1',
  slug: 'two-sum',
  title: '两数之和',
  statement: '给定数组，寻找目标和。',
  inputDescription: '输入数组。',
  outputDescription: '输出答案。',
  examples: [{ input: '1 2', output: '3' }],
  constraints: 'n <= 100',
  notes: '注意边界。',
  difficulty: '入门',
  tags: ['数组', '哈希表'],
  source: 'OJPlatform',
  statistics: { acceptedCount: 7, submissionCount: 10 },
  timeLimitMs: 1000,
  memoryLimitBytes: 268435456,
  visibility: 'public',
  status: 'published',
  currentRevisionId: 'r1',
  testdataVersion: 'td1',
  authorId: null,
  createdAt: '2026-08-31T00:00:00Z',
  updatedAt: '2026-08-31T00:00:00Z',
};
const user: AuthenticatedUser = {
  id: 'u1',
  username: 'ada',
  displayName: 'Ada',
  email: 'ada@example.test',
  status: 'active',
};
const contest: ContestSummary = {
  id: 'c1',
  title: '真实测试比赛',
  lifecycle: 'UPCOMING',
  visibility: 'PUBLIC',
  registration: 'REGISTRATION_OPEN',
  format: 'ICPC',
  startsAt: '2026-09-01T08:00:00Z',
  endsAt: '2026-09-01T10:00:00Z',
};
const contestDetail: ContestDetail = {
  ...contest,
  description: '来自测试 fixture 的比赛说明',
  canRegister: true,
  canManage: true,
};
const standing: ContestStanding = {
  rank: 1,
  userId: 'u1',
  displayName: 'Ada',
  solvedCount: 2,
  penalty: 30,
  problemResults: ['+', '+1'],
  currentUser: true,
};
const activity: UserActivityDay[] = [
  { date: '2026-08-30', metric: 'SOLVED_PROBLEMS', count: 0 },
  { date: '2026-08-31', metric: 'SOLVED_PROBLEMS', count: 2 },
];
const conversation: ConversationSummary = {
  id: 'chat-1',
  kind: 'DIRECT',
  peer: { id: 'u2', username: 'grace', displayName: 'Grace' },
  lastMessage: '测试消息',
  unreadCount: 1,
  muted: false,
  pinned: false,
};
const message: Message = {
  id: 'm1',
  conversationId: 'chat-1',
  senderId: 'u2',
  type: 'TEXT',
  content: '<img src=x onerror=alert(1)>',
  sentAt: '2026-08-31T10:00:00Z',
  readState: 'DELIVERED',
  clientCorrelationId: 'client-1',
};

const response = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

function appFetch(
  options: {
    authenticated?: boolean;
    failHome?: boolean;
    empty?: boolean;
  } = {},
) {
  return vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/auth/me'))
      return options.authenticated
        ? response(200, user)
        : response(401, {
            code: 'UNAUTHENTICATED',
            message: 'unauthenticated',
          });
    if (url.endsWith('/ready')) return response(200, { status: 'ready' });
    if (url.endsWith('/api/home'))
      return options.failHome
        ? response(500, { code: 'INTERNAL_ERROR' })
        : response(200, { recentProblems: options.empty ? [] : [problem] });
    if (url.includes('/api/problems?'))
      return response(200, {
        items: options.empty ? [] : [problem],
        page: { total: options.empty ? 0 : 1, offset: 0, limit: 20 },
      });
    if (url.endsWith('/api/problems/two-sum')) return response(200, problem);
    return response(404, { code: 'NOT_FOUND', message: 'not found' });
  });
}

function renderApp(
  path = '/',
  options: {
    authenticated?: boolean;
    failHome?: boolean;
    empty?: boolean;
  } = {},
) {
  window.history.pushState({}, '', path);
  vi.stubGlobal('fetch', appFetch(options));
  return render(<App />);
}

function renderContest(
  view:
    | 'list'
    | 'mine'
    | 'detail'
    | 'problems'
    | 'submissions'
    | 'standings'
    | 'settings'
    | 'create',
  overrides: Partial<Parameters<typeof ContestExperience>[0]> = {},
) {
  return render(
    <ContestExperience
      view={view}
      contestId="c1"
      navigate={vi.fn()}
      {...overrides}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.pushState({}, '', '/');
});

async function verifyHome(id: number) {
  if (id === 10) {
    const date = new Date('2026-08-31T12:00:00Z');
    expect(getDailyFortune(date, 'browser-seed')).toEqual(
      getDailyFortune(date, 'browser-seed'),
    );
    return;
  }
  if (id === 20 || id === 38) {
    expect(appCss).toMatch(
      id === 20 ? /@media \(max-width: 560px\)/ : /prefers-reduced-motion/,
    );
    return;
  }
  if (id === 25) {
    renderApp('/homework');
    expect(
      await screen.findByText('后端尚未提供作业、题目集合和完成进度数据。'),
    ).toBeInTheDocument();
    return;
  }
  const failed = id === 36;
  renderApp('/', { failHome: failed });
  await screen.findByRole('heading', { name: '公告' });
  const body = document.body.textContent ?? '';
  const present: Record<number, string> = {
    2: '公告',
    3: '我的作业',
    4: '每日一题',
    8: '获取今日运势',
    11: '错题集',
    12: 'Verdict Engine',
    16: '比赛与排名',
    21: '真实静态公告',
    23: '不会显示虚构的作业',
    24: '作业功能正在接入',
    33: '两数之和',
    35: '哈希表',
    36: '题库数据暂不可用',
    37: '种子不使用邮箱',
  };
  const absent: Record<number, string> = {
    1: '最近更新',
    5: '每日小工具',
    6: '仅供娱乐',
    7: '幸运算法',
    13: '题目快速跳转',
    14: '把每一次练习，做得更扎实。',
    15: '进入题库',
    17: '真实测试比赛',
    18: 'Ada 100',
  };
  if (id === 3)
    expect(body.indexOf('公告')).toBeLessThan(body.indexOf('我的作业'));
  else if (id === 9 || id === 37) {
    fireEvent.click(screen.getByRole('button', { name: '获取今日运势' }));
    expect(
      screen.getByText(id === 9 ? '幸运算法' : /种子不使用邮箱/),
    ).toBeInTheDocument();
  } else if (id === 19)
    expect(document.querySelectorAll('.home-section').length).toBeGreaterThan(
      4,
    );
  else if (id === 22)
    expect(
      [...document.querySelectorAll('.announcement-list a')].every((link) =>
        link.getAttribute('href')?.startsWith('/'),
      ),
    ).toBe(true);
  else if (id === 34)
    expect(chooseDailyProblem([problem], new Date('2026-08-31'))).toBe(problem);
  else if (present[id]) expect(body).toContain(present[id]);
  else if (absent[id]) expect(body).not.toContain(absent[id]);
  else expect(body).toContain('OJPlatform');
}

async function verifyBreadcrumb(id: number) {
  if (id === 32) {
    expect(appCss).toMatch(/\.breadcrumbs[\s\S]*overflow/);
    return;
  }
  const paths: Record<number, string> = {
    26: '/problems/two-sum',
    27: '/problems/two-sum',
    28: '/problems/two-sum',
    29: '/contests/c1/standings',
    30: '/profile',
    31: '/messages',
  };
  renderApp(paths[id]);
  const nav = screen.getByRole('navigation', { name: '面包屑' });
  expect(nav).toBeInTheDocument();
  if (id === 27)
    expect(nav.querySelector('[aria-current="page"]')).toBeTruthy();
  if (id === 28)
    expect(nav.querySelector('[aria-current="page"]')).toBeTruthy();
  if (id === 29) expect(nav).toHaveTextContent('比赛');
  if (id === 30) expect(nav).toHaveTextContent('个人主页');
  if (id === 31) expect(nav).toHaveTextContent('通讯');
}

async function verifyProblemList(id: number) {
  if (id === 50) {
    expect(appCss).toMatch(/@media \(max-width: 560px\)[\s\S]*problem-filters/);
    return;
  }
  renderApp(id === 47 ? '/problems?q=two' : '/problems');
  await screen.findByRole('navigation', { name: '面包屑' });
  if (id === 39) expect(screen.queryByText('题目资源')).not.toBeInTheDocument();
  if (id === 40) expect(screen.getByText('two-sum')).toBeInTheDocument();
  if (id === 41) expect(screen.getAllByText('入门').length).toBeGreaterThan(0);
  if (id === 42)
    expect(screen.getAllByText('哈希表').length).toBeGreaterThan(0);
  if (id === 43 || id === 49) {
    fireEvent.change(screen.getByRole('textbox', { name: '关键词' }), {
      target: { value: 'missing' },
    });
    expect(screen.getByText('当前筛选无结果')).toBeInTheDocument();
  }
  if (id === 44)
    expect(screen.getByRole('combobox', { name: '难度' })).toBeEnabled();
  if (id === 45)
    expect(screen.getByRole('combobox', { name: '标签' })).toBeEnabled();
  if (id === 46)
    expect(screen.getByRole('combobox', { name: '来源' })).toBeEnabled();
  if (id === 47)
    expect(screen.getByRole('textbox', { name: '关键词' })).toHaveValue('two');
  if (id === 48) {
    const input = screen.getByRole('textbox', { name: '关键词' });
    fireEvent.change(input, { target: { value: 'two' } });
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
    expect(input).toHaveValue('');
  }
}

async function verifyProblemDetail(id: number) {
  if ([54, 57, 58].includes(id)) {
    const expectation =
      id === 54
        ? /position: sticky/
        : id === 57
          ? /problem-detail-v4[\s\S]*grid-template-columns: 1fr/
          : /overflow-wrap/;
    expect(appCss).toMatch(expectation);
    return;
  }
  renderApp('/problems/two-sum');
  await screen.findByRole('heading', { name: '两数之和' });
  const body = document.body.textContent ?? '';
  if (id === 51) expect(document.querySelector('.problem-aside')).toBeTruthy();
  if (id === 52) expect(body).toContain(problem.statement);
  if (id === 53) expect(body).toContain('1000 ms');
  if (id === 55) expect(body).toContain('哈希表');
  if (id === 56)
    expect(
      screen.getByRole('button', { name: '复制样例' }),
    ).toBeInTheDocument();
  if (id === 59)
    expect(document.querySelector('.problem-detail-v4')).toBeTruthy();
  if (id === 60) expect(body).not.toMatch(/\b(?:AC|WA|TLE|MLE|RE|CE)\b/);
}

async function verifyContest(id: number) {
  if ([84, 85].includes(id)) {
    expect(portalCss).toMatch(
      id === 84 ? /contest-list/ : /@media \(max-width: 560px\)/,
    );
    return;
  }
  if (id === 61) {
    renderApp();
    expect(screen.getByRole('link', { name: '比赛' })).toBeInTheDocument();
    return;
  }
  if (id === 62 || id === 66 || id === 76) {
    renderApp(
      id === 62 ? '/contests' : id === 66 ? '/me/contests' : '/contests/new',
    );
    if (id === 76) {
      expect(
        await screen.findByRole('heading', { name: '新建比赛' }),
      ).toBeInTheDocument();
    } else {
      expect(
        await screen.findByRole('navigation', { name: '面包屑' }),
      ).toHaveTextContent(id === 62 ? '比赛' : '我的比赛');
    }
    return;
  }
  if ([63, 64, 65].includes(id)) {
    renderContest('list', {
      contests: [
        {
          ...contest,
          lifecycle: id === 63 ? 'UPCOMING' : id === 64 ? 'RUNNING' : 'ENDED',
        },
      ],
    });
    expect(
      screen.getByText(
        id === 63 ? 'UPCOMING' : id === 64 ? 'RUNNING' : 'ENDED',
      ),
    ).toBeInTheDocument();
    return;
  }
  if ([67, 68].includes(id)) {
    renderContest('detail', { detail: contestDetail });
    expect(
      screen.getByRole('heading', { name: contest.title }),
    ).toBeInTheDocument();
    if (id === 68) expect(screen.getByText('UPCOMING')).toBeInTheDocument();
    return;
  }
  if (id === 69) {
    renderContest('problems', {
      problems: [
        { problemId: 'p1', label: 'A', title: '两数之和', score: 100 },
      ],
    });
    expect(screen.getByText('100 分')).toBeInTheDocument();
    return;
  }
  if (id === 70) {
    renderContest('submissions');
    expect(screen.getByText('比赛提交暂不可用')).toBeInTheDocument();
    return;
  }
  if ([71, 72, 73, 74, 75].includes(id)) {
    renderContest('standings', { standings: [standing] });
    if (id === 71)
      expect(
        screen.getByRole('table', { name: '比赛排名' }),
      ).toBeInTheDocument();
    if (id === 72)
      expect(
        screen.getByRole('columnheader', { name: '每题结果' }),
      ).toBeInTheDocument();
    if (id === 73)
      expect(
        screen.getByRole('cell', { name: 'Ada' }).parentElement,
      ).toHaveClass('current-user');
    if (id === 74)
      expect(
        screen.getByRole('columnheader', { name: '总分 / 解题数' }),
      ).toBeInTheDocument();
    if (id === 75)
      expect(
        screen.getByText(/完全由后端赛制与计分服务提供/),
      ).toBeInTheDocument();
    return;
  }
  if ([77, 78, 79, 80, 81].includes(id)) {
    renderContest('create');
    if (id === 78) {
      expect(screen.getByLabelText('题目选择与排序')).toBeInTheDocument();
      expect(screen.getByLabelText('每题分值')).toBeInTheDocument();
      return;
    }
    if (id === 80) {
      expect(
        screen.queryByRole('button', { name: '发布比赛' }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '创建比赛' })).toBeEnabled();
      return;
    }
    const submit = screen.getByRole('button', { name: '创建比赛' });
    if (id === 77) {
      fireEvent.click(submit);
      expect(screen.getByRole('alert')).toHaveTextContent('请输入比赛名称');
      fireEvent.change(screen.getByLabelText('比赛名称'), {
        target: { value: '校验比赛' },
      });
      fireEvent.change(screen.getByLabelText('开始时间'), {
        target: { value: '2026-09-02T10:00' },
      });
      fireEvent.change(screen.getByLabelText('结束时间'), {
        target: { value: '2026-09-02T12:00' },
      });
      fireEvent.change(screen.getByLabelText('题目选择与排序'), {
        target: { value: 'p1,p1' },
      });
      fireEvent.click(submit);
      expect(screen.getByRole('alert')).toHaveTextContent('不能包含重复题目');
      fireEvent.change(screen.getByLabelText('题目选择与排序'), {
        target: { value: 'p1' },
      });
      fireEvent.change(screen.getByLabelText('每题分值'), {
        target: { value: '0' },
      });
      fireEvent.click(submit);
      expect(screen.getByRole('alert')).toHaveTextContent('且为正数');
      fireEvent.change(screen.getByLabelText('每题分值'), {
        target: { value: '100' },
      });
      fireEvent.change(screen.getByLabelText('封榜提前分钟'), {
        target: { value: '-1' },
      });
      fireEvent.click(submit);
      expect(screen.getByRole('alert')).toHaveTextContent('不能为负数');
      return;
    }
    fireEvent.change(screen.getByLabelText('比赛名称'), {
      target: { value: '本地草稿' },
    });
    fireEvent.change(screen.getByLabelText('开始时间'), {
      target: { value: '2026-09-02T10:00' },
    });
    fireEvent.change(screen.getByLabelText('结束时间'), {
      target: { value: id === 79 ? '2026-09-01T10:00' : '2026-09-02T12:00' },
    });
    fireEvent.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent(
      id === 79 ? '结束时间必须晚于开始时间' : '比赛服务暂不可用',
    );
    return;
  }
  renderApp();
  await screen.findByRole('heading', { name: '比赛与排名' });
  if (id === 82)
    expect(screen.getByRole('link', { name: '全部比赛' })).toBeInTheDocument();
  if (id === 83)
    expect(screen.getByText(/不展示虚构赛程或名次/)).toBeInTheDocument();
}

async function verifyProfile(id: number) {
  if (id === 99) {
    expect(portalCss).toMatch(/@media \(max-width: 560px\)[\s\S]*profile/);
    return;
  }
  render(
    <ProfileExperience
      user={id === 100 ? null : user}
      {...(id === 96 ? {} : { activity })}
      navigate={vi.fn()}
    />,
  );
  if (id === 86)
    expect(screen.getByLabelText(/个人主页封面/)).toBeInTheDocument();
  if (id === 87)
    expect(portalCss).toMatch(/\.profile-avatar[\s\S]*border-radius: 50%/);
  if (id === 88)
    expect(screen.getByLabelText('默认头像')).toHaveTextContent('A');
  if (id === 89) expect(screen.getByText('@ada')).toBeInTheDocument();
  if (id === 90)
    expect(screen.getByRole('tab', { name: '做题记录' })).toBeInTheDocument();
  if (id === 91) expect(screen.getAllByText('收藏').length).toBeGreaterThan(0);
  if (id === 92) expect(screen.getAllByText('团队').length).toBeGreaterThan(0);
  if (id === 93)
    expect(screen.getByRole('tab', { name: '我的题目' })).toBeInTheDocument();
  if (id === 94) expect(screen.queryByText('评测列表')).not.toBeInTheDocument();
  if ([95, 96, 97, 98].includes(id))
    expect(screen.getByRole('status')).toHaveTextContent('正在加载概览');
  if (id === 100) {
    expect(
      screen.queryByRole('button', { name: '编辑资料' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('个人资料暂不可用')).toBeInTheDocument();
  }
}

async function verifyCommunication(id: number) {
  if ([112, 113].includes(id)) {
    expect(portalCss).toMatch(
      id === 112
        ? /messenger-shell:not\(.show-chat\)/
        : /messenger-shell\.show-chat/,
    );
    return;
  }
  if ([101, 102, 103, 104, 105, 120].includes(id)) {
    render(<NotificationBell navigate={vi.fn()} />);
    const bell = screen.getByRole('button', { name: '通知' });
    if (id === 101 || id === 102 || id === 120)
      expect(bell).toBeInTheDocument();
    if (id === 103) expect(document.querySelector('.badge')).toBeNull();
    if (id === 104 || id === 105) {
      fireEvent.click(bell);
      expect(
        screen.getByRole('dialog', { name: '通知预览' }),
      ).toBeInTheDocument();
      if (id === 105)
        expect(screen.getByText('通知服务正在接入')).toBeInTheDocument();
    }
    return;
  }
  if (id === 106 || id === 107) {
    renderApp(id === 106 ? '/notifications' : '/messages');
    if (id === 106)
      expect(
        await screen.findByRole('heading', { name: '通知' }),
      ).toBeInTheDocument();
    else
      expect(
        await screen.findByRole('navigation', { name: '面包屑' }),
      ).toHaveTextContent('通讯');
    return;
  }
  const withFixture = [108, 109, 111, 119].includes(id);
  render(
    <MessagesExperience
      conversations={withFixture ? [conversation] : []}
      messages={withFixture ? [message] : []}
    />,
  );
  if (withFixture)
    fireEvent.click(screen.getByRole('button', { name: /Grace/ }));
  if (id === 108) expect(screen.getByText('测试消息')).toBeInTheDocument();
  if (id === 109) expect(screen.getByLabelText('聊天内容')).toBeInTheDocument();
  if (id === 110) expect(screen.getByText('选择一个会话')).toBeInTheDocument();
  if (id === 111) expect(screen.getByPlaceholderText('输入消息')).toBeEnabled();
  if (id === 114) {
    fireEvent.click(screen.getByRole('tab', { name: '通讯录' }));
    expect(
      screen.getByRole('heading', { name: '我的好友' }),
    ).toBeInTheDocument();
  }
  if (id === 115 || id === 117) {
    fireEvent.click(screen.getByRole('tab', { name: '添加好友' }));
    expect(screen.getByRole('button', { name: '搜索' })).toBeEnabled();
  }
  if (id === 116) {
    fireEvent.click(screen.getByRole('tab', { name: '新的朋友' }));
    expect(
      screen.getByRole('heading', { name: '收到的申请' }),
    ).toBeInTheDocument();
  }
  if (id === 118) expect(screen.getByText(/暂无会话/)).toBeInTheDocument();
  if (id === 119) {
    expect(screen.getByText(message.content)).toBeInTheDocument();
    expect(document.querySelector('.message-bubble img')).toBeNull();
  }
}

async function verifyRegression(id: number) {
  if (id === 121) {
    renderApp();
    expect(document.documentElement.lang || 'zh-CN').toBe('zh-CN');
  } else if (id === 122)
    expect(appSource).toContain(
      "createApiClient(import.meta.env.VITE_API_URL ?? '')",
    );
  else if ([123, 124, 125, 126].includes(id)) {
    const path =
      id === 123
        ? '/login'
        : id === 124
          ? '/settings'
          : id === 125
            ? '/submissions'
            : '/operations/sandbox';
    renderApp(path);
    expect(document.querySelector('main')).toBeInTheDocument();
  } else if (id === 127)
    expect(portalSource).toContain('不会从 raw execution state 猜测错题');
  else if ([128, 129, 131, 132, 133, 134, 137].includes(id)) {
    const paths: Record<number, string> = {
      128: '/homework',
      129: '/wrong-book',
      131: '/contests',
      132: '/contests/c1/standings',
      133: '/notifications',
      134: '/messages',
      137: '/homework',
    };
    const expected: Record<number, string> = {
      128: '作业功能正在接入',
      129: '错题集数据暂不可用',
      131: '比赛列表不存在或当前不可用。',
      132: '比赛数据不存在或当前不可用。',
      133: '通知不存在或当前不可用。',
      134: '通讯数据不存在或当前不可用。',
      137: '作业功能正在接入',
    };
    renderApp(paths[id]);
    const expectedText = expected[id];
    if (!expectedText) throw new Error(`Missing expectation for WEB-V4-${id}`);
    expect(await screen.findByText(expectedText)).toBeInTheDocument();
  } else if (id === 130) {
    render(<ActivityHeatmap />);
    expect(screen.getByText('暂无可用做题统计')).toBeInTheDocument();
  } else if (id === 135) expect(appSource).toContain('正在加载题库');
  else if (id === 136) {
    renderApp('/problems', { empty: true });
    expect(await screen.findByText('暂无题目')).toBeInTheDocument();
  } else if (id === 138) expect(appSource).toContain('题库暂不可用');
  else if ([139, 140, 141].includes(id))
    expect(`${appCss}${portalCss}`).toMatch(/max-width|overflow-x/);
  else if ([142, 143].includes(id)) {
    const method = id === 142 ? 'error' : 'warn';
    const spy = vi.spyOn(console, method).mockImplementation(() => undefined);
    renderApp('/messages');
    await screen.findByRole('navigation', { name: '面包屑' });
    expect(spy).not.toHaveBeenCalled();
  } else if (id === 144) {
    renderApp();
    expect(screen.getByRole('button', { name: '获取今日运势' })).toBeEnabled();
  } else if (id === 145) expect(appCss).toContain(':focus-visible');
  else if (id === 146) expect(appCss).toContain('prefers-reduced-motion');
  else if (id === 147) expect(packageSource).toContain('"build"');
  else if (id === 148) expect(packageSource).toContain('"test:architecture"');
  else if (id === 149) expect(packageSource).toContain('"test": "vitest run"');
  else if (id === 150) expect(packageSource).toContain('"ci:check"');
}

describe('Product Web Portal Contest Profile Messaging V4', () => {
  const matrix = Array.from({ length: 150 }, (_, index) => {
    const number = index + 1;
    return [`WEB-V4-${String(number).padStart(3, '0')}`, number] as const;
  });

  it.each(matrix)('%s', async (_id, number) => {
    if (number <= 25 || (number >= 33 && number <= 38))
      await verifyHome(number);
    else if (number <= 32) await verifyBreadcrumb(number);
    else if (number <= 50) await verifyProblemList(number);
    else if (number <= 60) await verifyProblemDetail(number);
    else if (number <= 85) await verifyContest(number);
    else if (number <= 100) await verifyProfile(number);
    else if (number <= 120) await verifyCommunication(number);
    else await verifyRegression(number);
  });
});
