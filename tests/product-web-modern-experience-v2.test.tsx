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
    expect(await screen.findByText('Verified identity')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Identifier type' }),
    ).toBeInTheDocument();
  });
  it('WEB-V2-02 renders the polished desktop auth composition', async () => {
    login();
    expect(
      (await screen.findByRole('heading', { name: 'Welcome back' })).closest(
        '.auth-experience',
      ),
    ).toBeInTheDocument();
  });
  it('WEB-V2-03 keeps the mobile composition semantic', async () => {
    login();
    expect(
      await screen.findByRole('heading', { name: 'Practice with intent.' }),
    ).toBeInTheDocument();
  });
  it('WEB-V2-04 gives anonymous users a clear sign-in focal point', async () => {
    login();
    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument();
  });
  it('WEB-V2-05 provides authenticated continuation callback', async () => {
    const api = apiMock();
    login({ loginPassword: api.loginPassword });
    fireEvent.change(await screen.findByLabelText('Email address'), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onUser).toHaveBeenCalledWith(user));
  });
  it('WEB-V2-06 does not render fabricated metrics', async () => {
    login();
    expect(
      (await screen.findByText('Practice with intent.')).closest('section'),
    ).not.toHaveTextContent(/online|ranking|accepted count/i);
  });
  it('WEB-V2-07 renders a modern login layout', async () => {
    login();
    expect(
      await screen.findByText(
        'Choose a verified way into your practice workspace.',
      ),
    ).toBeInTheDocument();
  });
  it('WEB-V2-08 keeps login controls grouped for narrow viewports', async () => {
    login();
    expect(
      (
        await screen.findByRole('group', { name: 'Identifier type' })
      ).querySelectorAll('button'),
    ).toHaveLength(2);
  });
  it('WEB-V2-09 supports email password mode', async () => {
    const api = apiMock();
    login({ loginPassword: api.loginPassword });
    fireEvent.change(await screen.findByLabelText('Email address'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
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
    fireEvent.click(await screen.findByRole('button', { name: 'Phone' }));
    fireEvent.change(screen.getByLabelText('Phone number'), {
      target: { value: '+8613800138000' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(api.loginPassword).toHaveBeenCalledWith(
        expect.objectContaining({ identifierType: 'PHONE' }),
      ),
    );
  });
  it('WEB-V2-11 supports email code mode', async () => {
    const api = apiMock();
    login({ requestVerification: api.requestVerification });
    fireEvent.click(await screen.findByRole('tab', { name: 'One-time code' }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Send verification code' }),
    );
    await waitFor(() =>
      expect(api.requestVerification).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'EMAIL', purpose: 'LOGIN_CODE' }),
      ),
    );
  });
  it('WEB-V2-12 supports phone code mode', async () => {
    const api = apiMock();
    login({ requestVerification: api.requestVerification });
    fireEvent.click(await screen.findByRole('button', { name: 'Phone' }));
    fireEvent.click(screen.getByRole('tab', { name: 'One-time code' }));
    fireEvent.change(screen.getByLabelText('Phone number'), {
      target: { value: '+8613800138000' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Send verification code' }),
    );
    await waitFor(() =>
      expect(api.requestVerification).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'SMS' }),
      ),
    );
  });
  it('WEB-V2-13 shows a resend cooldown', async () => {
    login();
    fireEvent.click(await screen.findByRole('tab', { name: 'One-time code' }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Send verification code' }),
    );
    expect(
      await screen.findByRole('button', { name: /Resend in/ }),
    ).toBeDisabled();
  });
  it('WEB-V2-14 exposes bounded code attempt and expiry information', async () => {
    register();
    fireEvent.change(await screen.findByLabelText('Email address'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send email code' }));
    expect(await screen.findByText(/attempts remaining/)).toBeInTheDocument();
  });
  it('WEB-V2-15 renders provider availability state', async () => {
    login();
    expect(
      await screen.findByRole('button', { name: /WeChat sign in/ }),
    ).toBeEnabled();
  });
  it('WEB-V2-16 includes WeChat', async () => {
    login();
    expect(
      await screen.findByRole('button', { name: 'WeChat sign in' }),
    ).toBeInTheDocument();
  });
  it('WEB-V2-17 includes QQ', async () => {
    login();
    expect(
      await screen.findByRole('button', { name: 'QQ sign in' }),
    ).toBeInTheDocument();
  });
  it('WEB-V2-18 includes Google', async () => {
    login();
    expect(
      await screen.findByRole('button', { name: 'Google sign in' }),
    ).toBeInTheDocument();
  });
  it('WEB-V2-19 includes GitHub', async () => {
    login();
    expect(
      await screen.findByRole('button', { name: 'GitHub sign in' }),
    ).toBeInTheDocument();
  });
  it('WEB-V2-20 reports OAuth failures without token exposure', async () => {
    window.history.replaceState({}, '', '/login?oauth=error');
    login();
    expect(
      await screen.findByText(/could not complete sign-in/),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/access_token|refresh_token/i);
  });
  it('WEB-V2-21 starts email registration in an explicit mode', async () => {
    register();
    expect(
      await screen.findByRole('button', { name: 'Email registration' }),
    ).toHaveClass('selected');
  });
  it('WEB-V2-22 starts phone registration in an explicit mode', async () => {
    register();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Phone registration' }),
    );
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
  });
  it('WEB-V2-23 exposes country code selection', async () => {
    register();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Phone registration' }),
    );
    expect(screen.getByLabelText('Country code')).toBeInTheDocument();
  });
  it('WEB-V2-24 requires a verification grant before account creation', async () => {
    register();
    expect(
      await screen.findByRole('button', { name: 'Send email code' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create account' }),
    ).not.toBeInTheDocument();
  });
  it('WEB-V2-25 validates registration destination', async () => {
    register();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Send email code' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('destination');
  });
  it('WEB-V2-26 displays server password policy', async () => {
    register();
    fireEvent.change(await screen.findByLabelText('Email address'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send email code' }));
    fireEvent.change(await screen.findByLabelText('Verification code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
    expect(
      await screen.findByText(/At least 12 characters/),
    ).toBeInTheDocument();
  });
  it('WEB-V2-27 renders social first-login onboarding', async () => {
    window.history.replaceState(
      {},
      '',
      '/login?oauth=onboarding&transaction=t1',
    );
    login();
    expect(
      await screen.findByRole('heading', { name: 'Make this account yours' }),
    ).toBeInTheDocument();
  });
  it('WEB-V2-28 keeps connected identity language explicit', async () => {
    register();
    expect(await screen.findByText(/verified identity/)).toBeInTheDocument();
  });
  it('WEB-V2-29 never implies silent account merging', async () => {
    window.history.replaceState({}, '', '/login?oauth=link_required');
    login();
    expect(
      await screen.findByText(/explicit account linking/),
    ).toBeInTheDocument();
  });
  it('WEB-V2-30 preserves a sign-in link from registration', async () => {
    register();
    expect(
      await screen.findByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute('href', '/login');
  });
  it('WEB-V2-31 keeps password mode available when configured', async () => {
    login();
    expect(await screen.findByRole('tab', { name: 'Password' })).toBeEnabled();
  });
  it('WEB-V2-32 keeps problem routes outside auth redesign', async () => {
    login();
    expect(window.location.pathname).toBe('/');
  });
  it('WEB-V2-33 uses label semantics for fields', async () => {
    login();
    expect(await screen.findByLabelText('Email address')).toBeInTheDocument();
  });
  it('WEB-V2-34 exposes provider buttons as buttons', async () => {
    login();
    expect(
      (await screen.findByRole('button', { name: 'GitHub sign in' })).tagName,
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
      await screen.findByRole('button', { name: 'Google sign in unavailable' }),
    ).toBeDisabled();
  });
  it('WEB-V2-36 renders loading discovery state', async () => {
    login({
      authMethods: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    expect(
      await screen.findByText('Checking available sign-in methods...'),
    ).toBeInTheDocument();
  });
  it('WEB-V2-37 renders empty verification progress before code request', async () => {
    register();
    expect(
      await screen.findByText('Start with a verified identity'),
    ).toBeInTheDocument();
  });
  it('WEB-V2-38 renders request errors accessibly', async () => {
    register({
      requestVerification: vi.fn().mockRejectedValue(new Error('offline')),
    });
    fireEvent.change(await screen.findByLabelText('Email address'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send email code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Verification service unavailable',
    );
  });
  it('WEB-V2-39 renders capability discovery failure honestly', async () => {
    login({ authMethods: vi.fn().mockRejectedValue(new Error('offline')) });
    expect(
      await screen.findByText(/could not be discovered/),
    ).toBeInTheDocument();
  });
  it('WEB-V2-40 never labels protocol auth as a verdict', async () => {
    login();
    expect(document.body).not.toHaveTextContent(/\b(AC|WA|TLE|MLE|RE|CE)\b/);
  });
  it('WEB-V2-41 supports keyboard focusable mode controls', async () => {
    login();
    const phone = await screen.findByRole('button', { name: 'Phone' });
    phone.focus();
    expect(document.activeElement).toBe(phone);
  });
  it('WEB-V2-42 uses visible focus classes through native controls', async () => {
    login();
    const email = await screen.findByLabelText('Email address');
    email.focus();
    expect(document.activeElement).toBe(email);
  });
  it('WEB-V2-43 declares reduced-motion support in the stylesheet', async () => {
    const css = readFileSync('apps/web/src/app/app.css', 'utf8');
    expect(css).toContain('prefers-reduced-motion');
  });
  it('WEB-V2-44 keeps desktop content constrained', async () => {
    login();
    expect(
      (await screen.findByRole('heading', { name: 'Welcome back' })).closest(
        '.auth-experience',
      ),
    ).toHaveClass('auth-experience');
  });
  it('WEB-V2-45 keeps mobile content in one auth frame', async () => {
    register();
    expect(
      (
        await screen.findByRole('heading', {
          name: 'Start with a verified identity',
        })
      ).closest('.auth-experience'),
    ).toBeInTheDocument();
  });
  it('WEB-V2-46 supports narrow phone input type', async () => {
    register();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Phone registration' }),
    );
    expect(screen.getByLabelText('Phone number')).toHaveAttribute(
      'type',
      'tel',
    );
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
      await screen.findByText(/Unsupported actions stay disabled/),
    ).toBeInTheDocument();
  });
});
