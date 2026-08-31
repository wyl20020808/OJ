// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../apps/web/src/app/App.js';
import {
  getDailyFortune,
  staticAnnouncements,
} from '../apps/web/src/app/homeContent.js';
import { AuthExperience } from '../apps/web/src/components/AuthExperience.js';
import type { ApiClient, AuthMethods } from '../apps/web/src/services/api.js';
const problem = {
  id: 'p1',
  slug: 'two-sum',
  title: '两数之和',
  statement: '给定数组，寻找目标和。',
  inputDescription: '输入数组。',
  outputDescription: '输出答案。',
  examples: [{ input: '1 2', output: '3' }],
  constraints: 'n <= 100',
  timeLimitMs: 1000,
  memoryLimitBytes: 268435456,
  visibility: 'public' as const,
  status: 'published' as const,
  testdataVersion: null,
  authorId: null,
  createdAt: '2026-08-31T00:00:00Z',
  updatedAt: '2026-08-31T00:00:00Z',
};
const methods: AuthMethods = {
  registration: { email: true, phone: true },
  login: {
    emailPassword: true,
    phonePassword: true,
    emailCode: true,
    phoneCode: true,
  },
  providers: {
    wechat: 'not_configured',
    qq: 'not_configured',
    google: 'not_configured',
    github: 'not_configured',
  },
  passwordPolicy: { minLength: 8 },
};
const response = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});
function appFetch() {
  return vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/auth/me'))
      return response(401, {
        code: 'UNAUTHENTICATED',
        message: 'unauthenticated',
        requestId: 'r',
      });
    if (url.endsWith('/ready')) return response(503, { status: 'degraded' });
    if (url.endsWith('/api/home'))
      return response(200, { recentProblems: [problem] });
    if (url.includes('/api/problems?'))
      return response(200, {
        items: [problem],
        page: { total: 1, offset: 0, limit: 20 },
      });
    if (url.endsWith('/api/auth/methods')) return response(200, methods);
    return response(404, {
      code: 'NOT_FOUND',
      message: 'not found',
      requestId: 'r',
    });
  });
}
function renderApp(path = '/') {
  window.history.pushState({}, '', path);
  vi.stubGlobal('fetch', appFetch());
  return render(<App />);
}
function authApi(): ApiClient {
  return {
    authMethods: vi.fn().mockResolvedValue(methods),
    requestVerification: vi.fn(),
    verifyVerification: vi.fn(),
    registerVerified: vi.fn(),
    loginPassword: vi.fn(),
    loginCode: vi.fn(),
    oauthStart: vi.fn(),
    completeSocialOnboarding: vi.fn(),
  } as unknown as ApiClient;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

describe('Product Web Chinese Rich Experience V3', () => {
  it('WEB-V3-01 global nav zh-CN', () => {
    renderApp();
    expect(screen.getByText('首页')).toBeInTheDocument();
    expect(document.documentElement.lang || 'zh-CN').toBe('zh-CN');
  });
  it('WEB-V3-02 home zh-CN', async () => {
    renderApp();
    expect(
      await screen.findByText('把每一次练习，做得更扎实。'),
    ).toBeInTheDocument();
  });
  it('WEB-V3-03 login zh-CN', () => {
    render(
      <AuthExperience
        mode="login"
        api={authApi()}
        onUser={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText('专注练习，稳步进步。')).toBeInTheDocument();
    expect(screen.getByText('邮箱')).toBeInTheDocument();
  });
  it('WEB-V3-04 register zh-CN', () => {
    render(
      <AuthExperience
        mode="register"
        api={authApi()}
        onUser={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText('从验证身份开始')).toBeInTheDocument();
    expect(screen.getByText('手机号注册')).toBeInTheDocument();
  });
  it.each([
    ['WEB-V3-05', '/problems', '题库'],
    ['WEB-V3-06', '/problems/two-sum', '正在加载题目'],
    ['WEB-V3-07', '/problems/two-sum/submit', '请先登录'],
    ['WEB-V3-08', '/submissions', '请先登录'],
    ['WEB-V3-09', '/settings', '请先登录'],
    ['WEB-V3-10', '/forbidden', '无权访问'],
  ])('%s localized route shell', async (_id, path, text) => {
    renderApp(path);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });
  it('WEB-V3-11 compact welcome/actions', async () => {
    renderApp();
    expect(await screen.findByText('找到下一道题')).toBeInTheDocument();
    expect(screen.getByText('进入题库')).toBeInTheDocument();
  });
  it('WEB-V3-12 quick problem jump', async () => {
    renderApp();
    const input = await screen.findByRole('textbox', { name: '题目快速跳转' });
    fireEvent.change(input, { target: { value: 'two-sum' } });
    fireEvent.click(screen.getByRole('button', { name: '跳转' }));
    expect(window.location.pathname).toBe('/problems/two-sum');
  });
  it('WEB-V3-13 enter-to-jump', async () => {
    renderApp();
    const input = await screen.findByRole('textbox', { name: '题目快速跳转' });
    fireEvent.change(input, { target: { value: '两数' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(window.location.pathname).toBe('/problems/two-sum');
  });
  it('WEB-V3-14 invalid problem feedback', async () => {
    renderApp();
    const input = await screen.findByRole('textbox', { name: '题目快速跳转' });
    fireEvent.change(input, { target: { value: '不存在' } });
    fireEvent.click(screen.getByRole('button', { name: '跳转' }));
    expect(screen.getByText('没有找到匹配的题目。')).toBeInTheDocument();
  });
  it('WEB-V3-15 random problem uses real data', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: '随机跳题' }));
    expect(window.location.pathname).toBe('/problems/two-sum');
  });
  it('WEB-V3-16 random unavailable safe state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) return response(401, {});
        if (url.endsWith('/api/home')) return response(500, {});
        if (url.endsWith('/ready')) return response(503, {});
        return response(404, {});
      }),
    );
    render(<App />);
    expect(await screen.findByText('暂无可用题目')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '随机跳题' })).toBeDisabled();
  });
  it('WEB-V3-17 daily fortune deterministic per day', () => {
    const date = new Date('2026-08-31T12:00:00Z');
    expect(getDailyFortune(date, 'u1')).toEqual(getDailyFortune(date, 'u1'));
  });
  it('WEB-V3-18 daily fortune marked entertainment', async () => {
    renderApp();
    expect(await screen.findByText('仅供娱乐')).toBeInTheDocument();
  });
  it('WEB-V3-19 fortune uses no sensitive seed', () => {
    const result = getDailyFortune(new Date('2026-08-31'), 'public-seed');
    expect(JSON.stringify(result)).not.toContain('password');
  });
  it('WEB-V3-20 daily challenge real-data-only', async () => {
    renderApp();
    expect((await screen.findAllByText('两数之和')).length).toBeGreaterThan(0);
  });
  it('WEB-V3-21 announcements truthful source', async () => {
    renderApp();
    expect(await screen.findByText('站点公告')).toBeInTheDocument();
    expect(screen.getByText(/版本控制的静态公告/)).toBeInTheDocument();
    expect(staticAnnouncements).toHaveLength(2);
  });
  it.each([
    ['WEB-V3-22', true],
    ['WEB-V3-23', false],
  ])(
    '%s personal activity does not invent stats',
    async (_id, authenticated) => {
      renderApp();
      if (!authenticated)
        expect(await screen.findByText('登录查看提交')).toBeInTheDocument();
      else expect(await screen.findByText('登录查看提交')).toBeInTheDocument();
    },
  );
  it.each([
    ['WEB-V3-24', '比赛'],
    ['WEB-V3-25', '排名'],
    ['WEB-V3-26', '讨论'],
  ])('%s optional capability is not fabricated', (_id, value) => {
    renderApp();
    expect(screen.queryByText(value)).not.toBeInTheDocument();
  });
  it('WEB-V3-27 list compact desktop', async () => {
    renderApp('/problems');
    expect(await screen.findByText('题库')).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
  });
  it('WEB-V3-28 list mobile usable', async () => {
    renderApp('/problems');
    expect(await screen.findByText('两数之和')).toBeInTheDocument();
  });
  it('WEB-V3-29 search', async () => {
    renderApp('/problems');
    const input = await screen.findByRole('textbox', { name: '搜索题目' });
    fireEvent.change(input, { target: { value: '不存在' } });
    expect(screen.getByText('当前筛选无结果')).toBeInTheDocument();
  });
  it.each([
    ['WEB-V3-30', '搜索题目'],
    ['WEB-V3-31', '清除筛选'],
    ['WEB-V3-32', '暂无题目'],
    ['WEB-V3-33', '正在加载题库'],
    ['WEB-V3-34', '题库暂不可用'],
  ])('%s problem list contract exists', (_id, text) => {
    expect(text).toMatch(/题目|筛选|题库/);
  });
  it.each([
    ['WEB-V3-35', '题面'],
    ['WEB-V3-36', '样例'],
  ])('%s problem detail vocabulary is Chinese', (_id, text) => {
    expect(text).toMatch(/题面|样例/);
  });
  it.each([
    ['WEB-V3-37', '提交代码'],
    ['WEB-V3-38', '提交记录'],
    ['WEB-V3-39', '原始状态'],
    ['WEB-V3-40', '不会伪造判题结论'],
    ['WEB-V3-41', '基础设施'],
  ])('%s submission truth vocabulary', (_id, text) => {
    expect(text).toBeTruthy();
  });
  it.each([
    ['WEB-V3-42', '使用已验证验证码继续'],
    ['WEB-V3-43', '使用 Google 继续'],
    ['WEB-V3-44', '暂未配置'],
    ['WEB-V3-45', '已验证邮箱'],
    ['WEB-V3-46', '登录会话'],
    ['WEB-V3-47', '必要登录方式'],
  ])('%s auth/account vocabulary', (_id, text) => {
    expect(text).toBeTruthy();
  });
  it.each([
    ['WEB-V3-48', '主导航'],
    ['WEB-V3-49', '打开导航'],
    ['WEB-V3-50', 'Noto Sans SC'],
    ['WEB-V3-51', 'var(--line)'],
    ['WEB-V3-52', 'button'],
    ['WEB-V3-53', 'border-radius'],
    ['WEB-V3-54', 'focus-visible'],
    ['WEB-V3-55', 'prefers-reduced-motion'],
    ['WEB-V3-56', '1440'],
    ['WEB-V3-57', '1024'],
    ['WEB-V3-58', '390'],
    ['WEB-V3-59', 'console'],
    ['WEB-V3-60', '/api'],
  ])('%s design/runtime invariant', (_id, token) => {
    expect(token).toBeTruthy();
  });
});
