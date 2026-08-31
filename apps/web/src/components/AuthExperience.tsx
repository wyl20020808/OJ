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
  wechat: 'WeChat',
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
        <h1>Practice with intent.</h1>
        <p>
          Keep every problem version, source submission, and identity under one
          clear account.
        </p>
        <div className="auth-context-list" aria-label="Account principles">
          <span>
            01 <b>Verified identity</b>
          </span>
          <span>
            02 <b>Versioned work</b>
          </span>
          <span>
            03 <b>Honest outcomes</b>
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
        Checking available sign-in methods...
      </p>
    );
  if (error)
    return (
      <p className="inline-notice notice-warning" role="status">
        Authentication methods could not be discovered. Unsupported actions stay
        disabled until the Auth service is available.
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
        throw new Error('OAuth destination is not allowed.');
      window.location.assign(target.toString());
    } catch (error) {
      onError(messageFor(error, 'This provider could not start securely.'));
      setPending(null);
    }
  };
  return (
    <div className="provider-grid" aria-label="Social sign-in providers">
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
            aria-label={`${providerLabels[provider]} sign in${enabled ? '' : ' unavailable'}`}
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
              {pending === provider ? 'Opening...' : providerLabels[provider]}
            </span>
            {!enabled && (
              <small>
                {state === 'disabled' ? 'Disabled' : 'Not configured'}
              </small>
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
    cancelled: 'Social sign-in was cancelled. No account changes were made.',
    error:
      'The social provider could not complete sign-in. Try another method.',
    link_required:
      'This provider needs explicit account linking before it can continue.',
    onboarding:
      'Finish your local profile to complete first-time social sign-in.',
  };
  return (
    <p className="inline-notice notice-warning" role="alert">
      {copy[state] ??
        'The sign-in transaction is no longer valid. Start again.'}
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
      return setError('Complete the profile fields to continue.');
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
      setError(
        messageFor(
          reason,
          'Onboarding could not be completed. The transaction may have expired.',
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame
      mode="login"
      eyebrow="FINISH PROFILE"
      title="Make this account yours"
      description="Social sign-in never silently merges accounts. Choose the local profile details to finish onboarding."
    >
      <form onSubmit={submit} noValidate>
        <label>
          Username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Display name
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
          {busy ? 'Finishing...' : 'Continue onboarding'}
        </button>
      </form>
      <p className="field-help">
        Transaction state is server-bound and expires; no provider token is
        stored in the browser.
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
        Verification code
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, '').slice(0, 8))
          }
          placeholder="6-digit code"
          aria-describedby="verification-help"
        />
      </label>
      <p id="verification-help" className="field-help">
        Code sent to {challenge.destination}. Expires{' '}
        {new Date(challenge.expiresAt).toLocaleTimeString()}.{' '}
        {challenge.attemptsRemaining} attempts remaining.
      </p>
      <div className="verification-actions">
        <button
          type="button"
          onClick={onVerify}
          disabled={busy || code.length < 4}
        >
          {busy ? 'Verifying...' : 'Verify code'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={onResend}
          disabled={busy || resendIn > 0}
        >
          {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
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
      setError(messageFor(reason, 'Verification service unavailable.'));
    } finally {
      setBusy(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (authMode === 'code') {
      if (!grant) return setError('Verify the code before signing in.');
      setBusy(true);
      try {
        onUser(await api.loginCode({ grantId: grant.grantId }));
        onNavigate('/problems');
      } catch (reason) {
        setError(
          messageFor(reason, 'The sign-in code was rejected or expired.'),
        );
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!passwordEnabled)
      return setError('Password sign-in for this identifier is unavailable.');
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
      setError(messageFor(reason, 'That code is invalid, expired, or locked.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame
      mode="login"
      eyebrow="SIGN IN"
      title="Welcome back"
      description="Choose a verified way into your practice workspace."
    >
      <MethodNotice loading={methodsLoading} error={methodsError} />
      <OAuthStateNotice />
      <div
        className="segmented-control"
        role="group"
        aria-label="Identifier type"
      >
        <button
          type="button"
          className={identifierType === 'EMAIL' ? 'selected' : ''}
          onClick={() => {
            setIdentifierType('EMAIL');
            setChallenge(null);
            setGrant(null);
          }}
        >
          Email
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
          Phone
        </button>
      </div>
      <div className="mode-tabs" role="tablist" aria-label="Sign-in method">
        <button
          type="button"
          role="tab"
          aria-selected={authMode === 'password'}
          className={authMode === 'password' ? 'active' : ''}
          disabled={!passwordEnabled}
          onClick={() => setAuthMode('password')}
        >
          Password
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={authMode === 'code'}
          className={authMode === 'code' ? 'active' : ''}
          disabled={!codeEnabled}
          onClick={() => setAuthMode('code')}
        >
          One-time code
        </button>
      </div>
      <form onSubmit={submit} noValidate>
        <label>
          {identifierType === 'EMAIL' ? 'Email address' : 'Phone number'}
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
            Password
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
            {busy ? 'Sending...' : 'Send verification code'}
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
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        )}
        {authMode === 'code' && grant && (
          <button type="submit" disabled={busy}>
            {busy ? 'Signing in...' : 'Continue with verified code'}
          </button>
        )}
      </form>
      <div className="social-divider">
        <span>or continue with</span>
      </div>
      <ProviderButtons methods={methods} api={api} onError={setError} />
      <p className="switch">
        New here? <a href="/register">Create an account</a>
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
      setError(messageFor(reason, 'Verification service unavailable.'));
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
      setError(messageFor(reason, 'That code is invalid, expired, or locked.'));
    } finally {
      setBusy(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!grant)
      return setError(
        'Verify your email or phone before creating the account.',
      );
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
      eyebrow="CREATE ACCOUNT"
      title="Start with a verified identity"
      description="Verify possession first, then create the account that owns your work."
    >
      <MethodNotice loading={methodsLoading} error={methodsError} />
      <div
        className="segmented-control"
        role="group"
        aria-label="Registration type"
      >
        <button
          type="button"
          className={identifierType === 'EMAIL' ? 'selected' : ''}
          onClick={() => {
            setIdentifierType('EMAIL');
            setChallenge(null);
            setGrant(null);
          }}
        >
          Email registration
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
          Phone registration
        </button>
      </div>
      <form onSubmit={submit} noValidate>
        {identifierType === 'PHONE' && (
          <label>
            Country code
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            >
              <option value="+1">+1 · US/Canada</option>
              <option value="+44">+44 · UK</option>
              <option value="+86">+86 · China</option>
              <option value="+81">+81 · Japan</option>
            </select>
          </label>
        )}
        <label>
          {identifierType === 'EMAIL' ? 'Email address' : 'Phone number'}
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
              ? 'Sending...'
              : `Send ${identifierType === 'EMAIL' ? 'email' : 'SMS'} code`}
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
            Verified {identifierType === 'EMAIL' ? 'email' : 'phone'} · ready to
            create account
          </div>
        )}
        {grant && (
          <>
            <label>
              Username
              <input
                value={details.username}
                onChange={(event) =>
                  setDetails({ ...details, username: event.target.value })
                }
                required
              />
            </label>
            <label>
              Display name
              <input
                value={details.displayName}
                onChange={(event) =>
                  setDetails({ ...details, displayName: event.target.value })
                }
                required
              />
            </label>
            <label>
              Password
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
              Confirm password
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
              At least {methods.passwordPolicy.minLength} characters, following
              the server policy.
            </p>
            <button type="submit" disabled={busy}>
              {busy ? 'Creating account...' : 'Create account'}
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
        Already registered? <a href="/login">Sign in</a>
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
