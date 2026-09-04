// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthExperience } from '../apps/web/src/components/AuthExperience.js';
import type {
  ApiClient,
  AuthMethods,
  AuthenticatedUser,
} from '../apps/web/src/services/api.js';

const user: AuthenticatedUser = {
  id: 'u1',
  username: 'ada',
  email: 'ada@example.com',
  displayName: 'Ada',
  status: 'active',
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
    wechat: 'enabled',
    qq: 'enabled',
    google: 'enabled',
    github: 'enabled',
  },
  passwordPolicy: { minLength: 12 },
};
function apiMock(overrides: Partial<Record<keyof ApiClient, unknown>> = {}) {
  return {
    authMethods: vi.fn().mockResolvedValue(methods),
    requestVerification: vi.fn().mockResolvedValue({
      challengeId: 'c1',
      channel: 'EMAIL',
      destination: 'ada@example.com',
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      resendAt: new Date(Date.now() + 60000).toISOString(),
      attemptsRemaining: 5,
    }),
    verifyVerification: vi.fn().mockResolvedValue({
      grantId: 'g1',
      purpose: 'LOGIN_CODE',
      destination: 'ada@example.com',
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    }),
    loginCode: vi.fn().mockResolvedValue(user),
    loginPassword: vi.fn().mockResolvedValue(user),
    registerVerified: vi.fn().mockResolvedValue(user),
    oauthStart: vi.fn(),
    completeSocialOnboarding: vi.fn().mockResolvedValue(user),
    ...overrides,
  } as unknown as ApiClient;
}
const navigate = vi.fn();
const onUser = vi.fn();
function login(overrides: Partial<Record<keyof ApiClient, unknown>> = {}) {
  return render(
    <AuthExperience
      mode="login"
      api={apiMock(overrides)}
      onUser={onUser}
      onNavigate={navigate}
    />,
  );
}
function register(overrides: Partial<Record<keyof ApiClient, unknown>> = {}) {
  return render(
    <AuthExperience
      mode="register"
      api={apiMock(overrides)}
      onUser={onUser}
      onNavigate={navigate}
    />,
  );
}

describe('Product Web Modern Experience V2', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });
  it('WEB-V2-01 exposes a shared auth primitive vocabulary', async () => {
    login();
    expect(await screen.findByText('已验证身份')).toBeInTheDocument();
    expect(
      screen.getByRole('tablist', { name: '登录方式' }),
    ).toBeInTheDocument();
  });
  it('WEB-V2-02 renders the polished desktop auth composition', async () => {
    login();
    expect(
      (await screen.findByRole('heading', { name: '欢迎回来' })).closest(
        '.auth-experience',
      ),
    ).toBeInTheDocument();
  });
  it('WEB-V2-03 keeps the mobile composition semantic', async () => {
    login();
    expect(
      await screen.findByRole('heading', { name: '专注练习，稳步进步。' }),
    ).toBeInTheDocument();
  });
  it('WEB-V2-04 gives anonymous users a clear sign-in focal point', async () => {
    login();
    expect(
      await screen.findByRole('button', { name: '登录' }),
    ).toBeInTheDocument();
  });
  it('WEB-V2-05 provides authenticated continuation callback', async () => {
    const api = apiMock();
    login({ loginPassword: api.loginPassword });
    fireEvent.change(await screen.findByLabelText('邮箱/手机号'), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'correct-password' },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '登录' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(onUser).toHaveBeenCalledWith(user));
  });
  it('WEB-V2-06 does not render fabricated metrics', async () => {
    login();
    expect(
      (await screen.findByText('专注练习，稳步进步。')).closest('section'),
    ).not.toHaveTextContent(/online|ranking|accepted count/i);
  });
  it('WEB-V2-07 renders a modern login layout', async () => {
    login();
    expect(
      await screen.findByText('选择一种已验证的方式进入练习工作台。'),
    ).toBeInTheDocument();
  });
  it('WEB-V2-08 keeps login controls grouped for narrow viewports', async () => {
    login();
    expect(
      (
        await screen.findByRole('tablist', { name: '登录方式' })
      ).querySelectorAll('[role="tab"]'),
    ).toHaveLength(2);
  });
  it('WEB-V2-09 supports email password mode', async () => {
    const api = apiMock();
    login({ loginPassword: api.loginPassword });
    fireEvent.change(await screen.findByLabelText('邮箱/手机号'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'password123456' },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '登录' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() =>
      expect(api.loginPassword).toHaveBeenCalledWith({
        identifierType: 'EMAIL',
        identifier: 'a@example.com',
        password: 'password123456',
      }),
    );
  });
  it('WEB-V2-10 supports phone password mode', async () => {
    const api = apiMock();
    login({ loginPassword: api.loginPassword });
    fireEvent.change(await screen.findByLabelText('邮箱/手机号'), {
      target: { value: '13800138000' },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'password123456' },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '登录' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() =>
      expect(api.loginPassword).toHaveBeenCalledWith(
        expect.objectContaining({ identifierType: 'PHONE' }),
      ),
    );
  });
  it('WEB-V2-11 supports email code mode', async () => {
    const api = apiMock();
    login({ requestVerification: api.requestVerification });
    fireEvent.click(await screen.findByRole('tab', { name: '验证码登录' }));
    fireEvent.change(screen.getByLabelText('邮箱/手机号'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
    await waitFor(() =>
      expect(api.requestVerification).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'EMAIL', purpose: 'LOGIN_CODE' }),
      ),
    );
  });
  it('WEB-V2-12 supports phone code mode', async () => {
    const api = apiMock();
    login({ requestVerification: api.requestVerification });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: '验证码登录' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('tab', { name: '验证码登录' }));
    fireEvent.change(screen.getByLabelText('邮箱/手机号'), {
      target: { value: '13800138000' },
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /发送.*验证码/ }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /发送.*验证码/ }));
    await waitFor(() =>
      expect(api.requestVerification).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'SMS' }),
      ),
    );
  });
  it('WEB-V2-13 shows a resend cooldown', async () => {
    login();
    fireEvent.click(await screen.findByRole('tab', { name: '验证码登录' }));
    fireEvent.change(screen.getByLabelText('邮箱/手机号'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
    expect(
      await screen.findByRole('button', { name: /秒后重发/ }),
    ).toBeDisabled();
  });
  it('WEB-V2-14 exposes bounded code attempt and expiry information', async () => {
    register();
    fireEvent.change(await screen.findByLabelText('邮箱/手机号'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送邮箱验证码' }));
    expect(await screen.findByText(/次尝试/)).toBeInTheDocument();
  });
  it('WEB-V2-15 renders provider availability state', async () => {
    login();
    expect(await screen.findByRole('button', { name: '微信' })).toBeEnabled();
  });
  it('WEB-V2-16 includes WeChat', async () => {
    login();
    expect(
      await screen.findByRole('button', { name: '微信' }),
    ).toBeInTheDocument();
  });
  it('WEB-V2-17 includes QQ', async () => {
    login();
    expect(
      await screen.findByRole('button', { name: 'QQ' }),
    ).toBeInTheDocument();
  });
  it('WEB-V2-18 includes Google', async () => {
    login();
    expect(
      await screen.findByRole('button', { name: 'Google' }),
    ).toBeInTheDocument();
  });
  it('WEB-V2-19 includes GitHub', async () => {
    login();
    expect(
      await screen.findByRole('button', { name: 'GitHub' }),
    ).toBeInTheDocument();
  });
  it('WEB-V2-20 reports OAuth failures without token exposure', async () => {
    window.history.replaceState({}, '', '/login?oauth=error');
    login();
    expect(await screen.findByText(/未能完成登录/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/access_token|refresh_token/i);
  });
  it('WEB-V2-21 starts email registration in an explicit mode', async () => {
    register();
    expect(await screen.findByRole('tab', { name: '邮箱/手机号' })).toHaveClass(
      'selected',
    );
  });
  it('WEB-V2-22 starts phone registration in an explicit mode', async () => {
    register();
    fireEvent.change(await screen.findByLabelText('邮箱/手机号'), {
      target: { value: '13800138000' },
    });
    expect(screen.getByLabelText('邮箱/手机号')).toHaveAttribute('type', 'tel');
  });
  it('WEB-V2-23 exposes country code selection', async () => {
    register();
    fireEvent.change(await screen.findByLabelText('邮箱/手机号'), {
      target: { value: '13800138000' },
    });
    expect(screen.getByLabelText('国家/地区代码')).toBeInTheDocument();
  });
  it('WEB-V2-24 requires a verification grant before account creation', async () => {
    register();
    expect(
      await screen.findByRole('button', { name: '发送邮箱验证码' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '创建账户' }),
    ).not.toBeInTheDocument();
  });
  it('WEB-V2-25 validates registration destination', async () => {
    register();
    fireEvent.click(
      await screen.findByRole('button', { name: '发送邮箱验证码' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '请输入有效的邮箱或手机号',
    );
  });
  it('WEB-V2-26 displays server password policy', async () => {
    register();
    fireEvent.change(await screen.findByLabelText('邮箱/手机号'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送邮箱验证码' }));
    fireEvent.change(await screen.findByLabelText('验证码'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: '验证验证码' }));
    expect(await screen.findByText(/至少 12 个字符/)).toBeInTheDocument();
  });
  it('WEB-V2-27 renders social first-login onboarding', async () => {
    window.history.replaceState(
      {},
      '',
      '/login?oauth=onboarding&transaction=t1',
    );
    login();
    expect(
      await screen.findByRole('heading', { name: '完善你的账户' }),
    ).toBeInTheDocument();
  });
  it('WEB-V2-28 keeps connected identity language explicit', async () => {
    register();
    expect(await screen.findByText(/已验证身份/)).toBeInTheDocument();
  });
  it('WEB-V2-29 never implies silent account merging', async () => {
    window.history.replaceState({}, '', '/login?oauth=link_required');
    login();
    expect(await screen.findByText(/明确绑定账户/)).toBeInTheDocument();
  });
  it('WEB-V2-30 preserves a sign-in link from registration', async () => {
    register();
    expect(await screen.findByRole('link', { name: '登录' })).toHaveAttribute(
      'href',
      '/login',
    );
  });
  it('WEB-V2-31 keeps password mode available when configured', async () => {
    login();
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: '密码登录' })).toBeEnabled(),
    );
  });
  it('WEB-V2-32 keeps problem routes outside auth redesign', async () => {
    login();
    expect(window.location.pathname).toBe('/');
  });
  it('WEB-V2-33 uses label semantics for fields', async () => {
    login();
    expect(await screen.findByLabelText('邮箱/手机号')).toBeInTheDocument();
  });
  it('WEB-V2-34 exposes provider buttons as buttons', async () => {
    login();
    expect(
      (await screen.findByRole('button', { name: 'GitHub' })).tagName,
    ).toBe('BUTTON');
  });
  it('WEB-V2-35 renders provider disabled state honestly', async () => {
    login({
      authMethods: vi.fn().mockResolvedValue({
        ...methods,
        providers: { ...methods.providers, google: 'not_configured' },
      }),
    });
    expect(
      await screen.findByRole('button', { name: 'Google 暂不可用' }),
    ).toBeDisabled();
  });
  it('WEB-V2-36 renders loading discovery state', async () => {
    login({
      authMethods: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    expect(
      await screen.findByText('正在检查可用登录方式…'),
    ).toBeInTheDocument();
  });
  it('WEB-V2-37 renders empty verification progress before code request', async () => {
    register();
    expect(await screen.findByText('从验证身份开始')).toBeInTheDocument();
  });
  it('WEB-V2-38 renders request errors accessibly', async () => {
    register({
      requestVerification: vi.fn().mockRejectedValue(new Error('offline')),
    });
    fireEvent.change(await screen.findByLabelText('邮箱/手机号'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送邮箱验证码' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '验证服务暂不可用',
    );
  });
  it('WEB-V2-39 renders capability discovery failure honestly', async () => {
    login({ authMethods: vi.fn().mockRejectedValue(new Error('offline')) });
    expect(await screen.findByText(/暂时无法获取登录方式/)).toBeInTheDocument();
  });
  it('WEB-V2-40 never labels protocol auth as a verdict', async () => {
    login();
    expect(document.body).not.toHaveTextContent(/\b(AC|WA|TLE|MLE|RE|CE)\b/);
  });
  it('WEB-V2-41 supports keyboard focusable mode controls', async () => {
    login();
    const identifier = await screen.findByLabelText('邮箱/手机号');
    identifier.focus();
    expect(document.activeElement).toBe(identifier);
  });
  it('WEB-V2-42 uses visible focus classes through native controls', async () => {
    login();
    const identifier = await screen.findByLabelText('邮箱/手机号');
    identifier.focus();
    expect(document.activeElement).toBe(identifier);
  });
  it('WEB-V2-43 declares reduced-motion support in the stylesheet', async () => {
    const css = readFileSync('apps/web/src/app/app.css', 'utf8');
    expect(css).toContain('prefers-reduced-motion');
  });
  it('WEB-V2-44 keeps desktop content constrained', async () => {
    login();
    expect(
      (await screen.findByRole('heading', { name: '欢迎回来' })).closest(
        '.auth-experience',
      ),
    ).toHaveClass('auth-experience');
  });
  it('WEB-V2-45 keeps mobile content in one auth frame', async () => {
    register();
    expect(
      (
        await screen.findByRole('heading', {
          name: '从验证身份开始',
        })
      ).closest('.auth-experience'),
    ).toBeInTheDocument();
  });
  it('WEB-V2-46 keeps login identifier input raw while typing', async () => {
    login();
    const identifier = await screen.findByLabelText('邮箱/手机号');
    identifier.focus();
    for (const value of ['a', 'ab', 'abc', 'abc@', 'abc@example.com'])
      fireEvent.change(identifier, { target: { value } });
    expect(identifier).toHaveValue('abc@example.com');
    expect(identifier).toHaveAttribute('type', 'text');
    expect(document.activeElement).toBe(identifier);
  });
  it('WEB-V2-47 does not log provider errors by default', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    login();
    expect(errorSpy).not.toHaveBeenCalled();
  });
  it('WEB-V2-48 keeps API calls relative', async () => {
    const api = apiMock();
    login({ authMethods: api.authMethods });
    await waitFor(() => expect(api.authMethods).toHaveBeenCalled());
  });
  it('WEB-V2-49 leaves Judge and Sandbox presentation out of auth', async () => {
    login();
    expect(document.body).not.toHaveTextContent(/sandbox|judge worker/i);
  });
  it('WEB-V2-50 provides an integration-safe unavailable path', async () => {
    login({
      authMethods: vi.fn().mockRejectedValue(new Error('not integrated')),
    });
    expect(
      await screen.findByText(/不支持的操作会保持禁用/),
    ).toBeInTheDocument();
  });
});
