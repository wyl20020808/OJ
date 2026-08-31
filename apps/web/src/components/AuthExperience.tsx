import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ApiError,
  type AuthMethods,
  type AuthProvider,
  type ApiClient,
  type AuthenticatedUser,
  type VerificationChallenge,
  type VerificationGrant,
} from '../services/api.js';

type AuthExperienceProps = {
  mode: 'login' | 'register';
  api: ApiClient;
  onUser: (user: AuthenticatedUser) => void;
  onNavigate: (path: string) => void;
};

const fallbackMethods: AuthMethods = {
  registration: { email: false, phone: false },
  login: {
    emailPassword: false,
    phonePassword: false,
    emailCode: false,
    phoneCode: false,
  },
  providers: {
    wechat: 'not_configured',
    qq: 'not_configured',
    google: 'not_configured',
    github: 'not_configured',
  },
  passwordPolicy: { minLength: 8 },
};

const providerLabels: Record<AuthProvider, string> = {
  wechat: '微信',
  qq: 'QQ',
  google: 'Google',
  github: 'GitHub',
};

function messageFor(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function useAuthMethods(api: ApiClient) {
  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [resolved, setResolved] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void api
      .authMethods()
      .then((value) => {
        if (!active) return;
        setMethods(value);
        setResolved(true);
      })
      .catch(() => {
        if (!active) return;
        setResolved(true);
        setError(true);
      });
    return () => {
      active = false;
    };
  }, [api]);
  return { methods: methods ?? fallbackMethods, loading: !resolved, error };
}

function AuthFrame({
  mode,
  eyebrow,
  title,
  description,
  children,
}: {
  mode: 'login' | 'register';
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="auth-experience" data-auth-mode={mode}>
      <aside className="auth-context">
        <p className="eyebrow">OJPLATFORM / {eyebrow}</p>
        <h1>专注练习，稳步进步。</h1>
        <p>每个题目版本、源代码提交和登录身份，都清晰归属于同一个账户。</p>
        <div className="auth-context-list" aria-label="账户原则">
          <span>
            01 <b>已验证身份</b>
          </span>
          <span>
            02 <b>版本化作品</b>
          </span>
          <span>
            03 <b>真实结果</b>
          </span>
        </div>
      </aside>
      <div className="auth-panel auth-panel-modern">
        <p className="panel-label">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="muted">{description}</p>
        {children}
      </div>
    </section>
  );
}

function MethodNotice({
  loading,
  error,
}: {
  loading: boolean;
  error: boolean;
}) {
  if (loading)
    return (
      <p className="inline-notice" role="status" aria-busy="true">
        正在检查可用登录方式…
      </p>
    );
  if (error)
    return (
      <p className="inline-notice notice-warning" role="status">
        暂时无法获取登录方式。认证服务恢复前，不支持的操作会保持禁用。
      </p>
    );
  return null;
}

function ProviderButtons({
  methods,
  api,
  onError,
}: {
  methods: AuthMethods;
  api: ApiClient;
  onError: (value: string) => void;
}) {
  const [pending, setPending] = useState<AuthProvider | null>(null);
  const providers = Object.keys(providerLabels) as AuthProvider[];
  const start = async (provider: AuthProvider) => {
    setPending(provider);
    onError('');
    try {
      const result = await api.oauthStart(provider, window.location.pathname);
      const target = new URL(result.authorizationUrl, window.location.origin);
      if (
        target.origin !== window.location.origin &&
        !target.protocol.startsWith('https')
      )
        throw new Error('OAuth 跳转地址不被允许。');
      window.location.assign(target.toString());
    } catch (error) {
      onError(messageFor(error, '该登录方式暂时无法安全启动。'));
      setPending(null);
    }
  };
  return (
    <div className="provider-grid" aria-label="社交登录方式">
      {providers.map((provider) => {
        const state = methods.providers[provider];
        const enabled = state === 'enabled';
        return (
          <button
            key={provider}
            type="button"
            className="provider-button"
            disabled={!enabled || pending !== null}
            onClick={() => void start(provider)}
            aria-label={`${providerLabels[provider]}${enabled ? '' : ' 暂不可用'}`}
          >
            <span
              className={`provider-mark provider-${provider}`}
              aria-hidden="true"
            >
              {provider === 'github'
                ? '{}'
                : provider.slice(0, 1).toUpperCase()}
            </span>
            <span>
              {pending === provider ? '正在打开…' : providerLabels[provider]}
            </span>
            {!enabled && (
              <small>{state === 'disabled' ? '已禁用' : '暂未配置'}</small>
            )}
          </button>
        );
      })}
    </div>
  );
}

function OAuthStateNotice() {
  const state = useMemo(
    () => new URLSearchParams(window.location.search).get('oauth'),
    [],
  );
  if (!state) return null;
  const copy: Record<string, string> = {
    cancelled: '社交登录已取消，账户未发生变化。',
    error: '社交服务未能完成登录，请尝试其他方式。',
    link_required: '该登录方式需要先明确绑定账户才能继续。',
    onboarding: '请完善本地资料，以完成首次社交登录。',
  };
  return (
    <p className="inline-notice notice-warning" role="alert">
      {copy[state] ?? '登录事务已失效，请重新开始。'}
    </p>
  );
}

function SocialOnboarding({
  api,
  onUser,
  onNavigate,
}: {
  api: ApiClient;
  onUser: (user: AuthenticatedUser) => void;
  onNavigate: (path: string) => void;
}) {
  const transactionId =
    new URLSearchParams(window.location.search).get('transaction') || '';
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!transactionId || !username.trim() || !displayName.trim())
      return setError('请填写完整资料后继续。');
    setBusy(true);
    setError('');
    try {
      onUser(
        await api.completeSocialOnboarding({
          transactionId,
          username: username.trim(),
          displayName: displayName.trim(),
        }),
      );
      onNavigate('/');
    } catch (reason) {
      setError(messageFor(reason, '资料完善未完成，登录事务可能已经过期。'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame
      mode="login"
      eyebrow="FINISH PROFILE"
      title="完善你的账户"
      description="社交登录不会静默合并账户。请填写本地资料以完成首次登录。"
    >
      <form onSubmit={submit} noValidate>
        <label>
          用户名
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          显示名称
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? '完成中…' : '继续完善资料'}
        </button>
      </form>
      <p className="field-help">
        登录事务由服务端绑定并会过期；浏览器不会保存 provider token。
      </p>
    </AuthFrame>
  );
}

function CodeStep({
  challenge,
  code,
  setCode,
  onVerify,
  busy,
  onResend,
  resendIn,
}: {
  challenge: VerificationChallenge;
  code: string;
  setCode: (value: string) => void;
  onVerify: () => void;
  busy: boolean;
  onResend: () => void;
  resendIn: number;
}) {
  return (
    <div className="verification-step">
      <label>
        验证码
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, '').slice(0, 8))
          }
          placeholder="输入验证码"
          aria-describedby="verification-help"
        />
      </label>
      <p id="verification-help" className="field-help">
        验证码已发送至 {challenge.destination}，将于{' '}
        {new Date(challenge.expiresAt).toLocaleTimeString('zh-CN')} 失效，剩余{' '}
        {challenge.attemptsRemaining} 次尝试。
      </p>
      <div className="verification-actions">
        <button
          type="button"
          onClick={onVerify}
          disabled={busy || code.length < 4}
        >
          {busy ? '验证中…' : '验证验证码'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={onResend}
          disabled={busy || resendIn > 0}
        >
          {resendIn > 0 ? `${resendIn} 秒后重发` : '重新发送验证码'}
        </button>
      </div>
    </div>
  );
}

function LoginExperience({
  api,
  onUser,
  onNavigate,
}: Omit<AuthExperienceProps, 'mode'>) {
  const oauthState = useMemo(
    () => new URLSearchParams(window.location.search).get('oauth'),
    [],
  );
  if (oauthState === 'onboarding')
    return (
      <SocialOnboarding api={api} onUser={onUser} onNavigate={onNavigate} />
    );
  const {
    methods,
    loading: methodsLoading,
    error: methodsError,
  } = useAuthMethods(api);
  const [identifierType, setIdentifierType] = useState<'EMAIL' | 'PHONE'>(
    'EMAIL',
  );
  const [authMode, setAuthMode] = useState<'password' | 'code'>('password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(
    null,
  );
  const [grant, setGrant] = useState<VerificationGrant | null>(null);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [cooldown]);
  const codeEnabled =
    identifierType === 'EMAIL'
      ? methods.login.emailCode
      : methods.login.phoneCode;
  const passwordEnabled =
    identifierType === 'EMAIL'
      ? methods.login.emailPassword
      : methods.login.phonePassword;
  const sendCode = async () => {
    if (!identifier.trim())
      return setError('Enter your email or phone number first.');
    setBusy(true);
    setError('');
    try {
      const next = await api.requestVerification({
        channel: identifierType === 'EMAIL' ? 'EMAIL' : 'SMS',
        purpose: 'LOGIN_CODE',
        destination: identifier.trim(),
      });
      setChallenge(next);
      setGrant(null);
      setCode('');
      setCooldown(
        Math.max(
          0,
          Math.ceil((new Date(next.resendAt).getTime() - Date.now()) / 1000),
        ),
      );
    } catch (reason) {
      setError(messageFor(reason, '验证服务暂不可用。'));
    } finally {
      setBusy(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (authMode === 'code') {
      if (!grant) return setError('请先验证验证码，再登录。');
      setBusy(true);
      try {
        onUser(await api.loginCode({ grantId: grant.grantId }));
        onNavigate('/problems');
      } catch (reason) {
        setError(messageFor(reason, '验证码被拒绝或已过期。'));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!passwordEnabled) return setError('该身份类型暂不支持密码登录。');
    setBusy(true);
    try {
      onUser(
        await api.loginPassword({
          identifierType,
          identifier: identifier.trim(),
          password,
        }),
      );
      onNavigate('/problems');
    } catch (reason) {
      setError(
        messageFor(reason, 'Sign-in failed. Check your details and try again.'),
      );
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    if (!challenge) return;
    setBusy(true);
    setError('');
    try {
      setGrant(await api.verifyVerification(challenge.challengeId, code));
    } catch (reason) {
      setError(messageFor(reason, '验证码无效、已过期或已锁定。'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame
      mode="login"
      eyebrow="登录"
      title="欢迎回来"
      description="选择一种已验证的方式进入练习工作台。"
    >
      <MethodNotice loading={methodsLoading} error={methodsError} />
      <OAuthStateNotice />
      <div className="segmented-control" role="group" aria-label="登录身份类型">
        <button
          type="button"
          className={identifierType === 'EMAIL' ? 'selected' : ''}
          onClick={() => {
            setIdentifierType('EMAIL');
            setChallenge(null);
            setGrant(null);
          }}
        >
          邮箱
        </button>
        <button
          type="button"
          className={identifierType === 'PHONE' ? 'selected' : ''}
          onClick={() => {
            setIdentifierType('PHONE');
            setChallenge(null);
            setGrant(null);
          }}
        >
          手机号
        </button>
      </div>
      <div className="mode-tabs" role="tablist" aria-label="登录方式">
        <button
          type="button"
          role="tab"
          aria-selected={authMode === 'password'}
          className={authMode === 'password' ? 'active' : ''}
          disabled={!passwordEnabled}
          onClick={() => setAuthMode('password')}
        >
          密码登录
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={authMode === 'code'}
          className={authMode === 'code' ? 'active' : ''}
          disabled={!codeEnabled}
          onClick={() => setAuthMode('code')}
        >
          验证码登录
        </button>
      </div>
      <form onSubmit={submit} noValidate>
        <label>
          {identifierType === 'EMAIL' ? '邮箱地址' : '手机号'}
          <input
            type={identifierType === 'EMAIL' ? 'email' : 'tel'}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        {authMode === 'password' ? (
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
        ) : !challenge ? (
          <button
            type="button"
            className="secondary"
            onClick={() => void sendCode()}
            disabled={busy || !codeEnabled}
          >
            {busy ? '发送中…' : '发送验证码'}
          </button>
        ) : (
          <CodeStep
            challenge={challenge}
            code={code}
            setCode={setCode}
            onVerify={() => void verify()}
            busy={busy}
            onResend={() => void sendCode()}
            resendIn={cooldown}
          />
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {authMode === 'password' && (
          <button type="submit" disabled={busy || !passwordEnabled}>
            {busy ? '登录中…' : '登录'}
          </button>
        )}
        {authMode === 'code' && grant && (
          <button type="submit" disabled={busy}>
            {busy ? '登录中…' : '使用已验证验证码继续'}
          </button>
        )}
      </form>
      <div className="social-divider">
        <span>或使用以下方式继续</span>
      </div>
      <ProviderButtons methods={methods} api={api} onError={setError} />
      <p className="switch">
        还没有账户？<a href="/register">注册账户</a>
      </p>
    </AuthFrame>
  );
}

function RegisterExperience({
  api,
  onNavigate,
}: Omit<AuthExperienceProps, 'mode' | 'onUser'>) {
  const {
    methods,
    loading: methodsLoading,
    error: methodsError,
  } = useAuthMethods(api);
  const [identifierType, setIdentifierType] = useState<'EMAIL' | 'PHONE'>(
    'EMAIL',
  );
  const [destination, setDestination] = useState('');
  const [country, setCountry] = useState('+1');
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(
    null,
  );
  const [grant, setGrant] = useState<VerificationGrant | null>(null);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [details, setDetails] = useState({
    username: '',
    displayName: '',
    password: '',
    confirm: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [cooldown]);
  const registrationEnabled =
    identifierType === 'EMAIL'
      ? methods.registration.email
      : methods.registration.phone;
  const normalizedDestination =
    identifierType === 'PHONE'
      ? `${country}${destination.replace(/\D/g, '')}`
      : destination.trim();
  const requestCode = async () => {
    if (!destination.trim())
      return setError('Enter the destination you want to verify.');
    setBusy(true);
    setError('');
    try {
      const next = await api.requestVerification({
        channel: identifierType === 'EMAIL' ? 'EMAIL' : 'SMS',
        purpose: 'REGISTER',
        destination: normalizedDestination,
      });
      setChallenge(next);
      setGrant(null);
      setCode('');
      setCooldown(
        Math.max(
          0,
          Math.ceil((new Date(next.resendAt).getTime() - Date.now()) / 1000),
        ),
      );
    } catch (reason) {
      setError(messageFor(reason, '验证服务暂不可用。'));
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    if (!challenge) return;
    setBusy(true);
    setError('');
    try {
      setGrant(await api.verifyVerification(challenge.challengeId, code));
    } catch (reason) {
      setError(messageFor(reason, '验证码无效、已过期或已锁定。'));
    } finally {
      setBusy(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!grant) return setError('创建账户前，请先验证邮箱或手机号。');
    if (
      details.password.length < methods.passwordPolicy.minLength ||
      details.password !== details.confirm
    )
      return setError(
        `Use a matching password of at least ${methods.passwordPolicy.minLength} characters.`,
      );
    setBusy(true);
    try {
      await api.registerVerified({
        grantId: grant.grantId,
        identifierType,
        username: details.username.trim(),
        displayName: details.displayName.trim(),
        password: details.password,
      });
      onNavigate('/login');
    } catch (reason) {
      setError(messageFor(reason, 'Registration could not be completed.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame
      mode="register"
      eyebrow="注册"
      title="从验证身份开始"
      description="先验证你对邮箱或手机号的控制权，再创建属于你的账户。"
    >
      <MethodNotice loading={methodsLoading} error={methodsError} />
      <div className="segmented-control" role="group" aria-label="注册方式">
        <button
          type="button"
          className={identifierType === 'EMAIL' ? 'selected' : ''}
          onClick={() => {
            setIdentifierType('EMAIL');
            setChallenge(null);
            setGrant(null);
          }}
        >
          邮箱注册
        </button>
        <button
          type="button"
          className={identifierType === 'PHONE' ? 'selected' : ''}
          onClick={() => {
            setIdentifierType('PHONE');
            setChallenge(null);
            setGrant(null);
          }}
        >
          手机号注册
        </button>
      </div>
      <form onSubmit={submit} noValidate>
        {identifierType === 'PHONE' && (
          <label>
            国家/地区代码
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            >
              <option value="+1">+1 · 美国/加拿大</option>
              <option value="+44">+44 · 英国</option>
              <option value="+86">+86 · 中国</option>
              <option value="+81">+81 · 日本</option>
            </select>
          </label>
        )}
        <label>
          {identifierType === 'EMAIL' ? '邮箱地址' : '手机号'}
          <input
            type={identifierType === 'EMAIL' ? 'email' : 'tel'}
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        {!grant && !challenge && (
          <button
            type="button"
            onClick={() => void requestCode()}
            disabled={busy || !registrationEnabled}
          >
            {busy
              ? '发送中…'
              : `发送${identifierType === 'EMAIL' ? '邮箱' : '短信'}验证码`}
          </button>
        )}
        {challenge && !grant && (
          <CodeStep
            challenge={challenge}
            code={code}
            setCode={setCode}
            onVerify={() => void verify()}
            busy={busy}
            onResend={() => void requestCode()}
            resendIn={cooldown}
          />
        )}
        {grant && (
          <div className="verified-grant" role="status">
            {identifierType === 'EMAIL' ? '邮箱' : '手机号'}已验证 ·
            可以创建账户
          </div>
        )}
        {grant && (
          <>
            <label>
              用户名
              <input
                value={details.username}
                onChange={(event) =>
                  setDetails({ ...details, username: event.target.value })
                }
                required
              />
            </label>
            <label>
              显示名称
              <input
                value={details.displayName}
                onChange={(event) =>
                  setDetails({ ...details, displayName: event.target.value })
                }
                required
              />
            </label>
            <label>
              密码
              <input
                type="password"
                value={details.password}
                onChange={(event) =>
                  setDetails({ ...details, password: event.target.value })
                }
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              确认密码
              <input
                type="password"
                value={details.confirm}
                onChange={(event) =>
                  setDetails({ ...details, confirm: event.target.value })
                }
                autoComplete="new-password"
                required
              />
            </label>
            <p className="field-help">
              至少 {methods.passwordPolicy.minLength}{' '}
              个字符，遵循服务端密码策略。
            </p>
            <button type="submit" disabled={busy}>
              {busy ? '创建中…' : '创建账户'}
            </button>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
      <p className="switch">
        已有账户？<a href="/login">登录</a>
      </p>
    </AuthFrame>
  );
}

export function AuthExperience(props: AuthExperienceProps) {
  return props.mode === 'login' ? (
    <LoginExperience
      api={props.api}
      onUser={props.onUser}
      onNavigate={props.onNavigate}
    />
  ) : (
    <RegisterExperience api={props.api} onNavigate={props.onNavigate} />
  );
}
