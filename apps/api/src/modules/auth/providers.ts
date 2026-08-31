import { createHash } from 'node:crypto';
import type {
  AuthProvider,
  AuthProviderAdapter,
  MessageProvider,
  SocialIdentity,
  VerificationChannel,
} from './v2-types.js';

const providerEnvKey = (provider: AuthProvider, suffix: string) =>
  `OJPLATFORM_OAUTH_${provider.toUpperCase()}_${suffix}`;

const requiredEnv = (name: string, env: NodeJS.ProcessEnv) => {
  const value = env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const fetchWithTimeout = (input: RequestInfo | URL, init?: RequestInit) =>
  fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(10_000),
  });

const jsonResponse = async (
  response: Response,
): Promise<Record<string, unknown>> => {
  if (!response.ok) throw new Error(`provider response ${response.status}`);
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object')
    throw new Error('provider response invalid');
  return body as Record<string, unknown>;
};

const formResponse = async (
  response: Response,
): Promise<Record<string, unknown>> => {
  if (!response.ok) throw new Error(`provider response ${response.status}`);
  const text = await response.text();
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === 'object')
      return body as Record<string, unknown>;
  } catch {
    const params = new URLSearchParams(text);
    return Object.fromEntries(params.entries());
  }
  throw new Error('provider response invalid');
};

const stringField = (body: Record<string, unknown>, key: string) =>
  typeof body[key] === 'string' && body[key] ? String(body[key]) : null;

const configured = (provider: AuthProvider, env: NodeJS.ProcessEnv) =>
  Boolean(
    requiredEnv(providerEnvKey(provider, 'CLIENT_ID'), env) &&
    requiredEnv(providerEnvKey(provider, 'CLIENT_SECRET'), env) &&
    requiredEnv('OJPLATFORM_AUTH_CALLBACK_BASE_URL', env),
  );

const providerEndpoints: Record<
  AuthProvider,
  { authorize: string; token: string; user: string }
> = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    user: 'https://openidconnect.googleapis.com/v1/userinfo',
  },
  github: {
    authorize: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    user: 'https://api.github.com/user',
  },
  wechat: {
    authorize: 'https://open.weixin.qq.com/connect/qrconnect',
    token: 'https://api.weixin.qq.com/sns/oauth2/access_token',
    user: 'https://api.weixin.qq.com/sns/userinfo',
  },
  qq: {
    authorize: 'https://graph.qq.com/oauth2.0/authorize',
    token: 'https://graph.qq.com/oauth2.0/token',
    user: 'https://graph.qq.com/user/get_user_info',
  },
};

function normalizedFromProvider(
  provider: AuthProvider,
  body: Record<string, unknown>,
): SocialIdentity {
  const subject =
    stringField(body, 'sub') ??
    stringField(body, 'id') ??
    stringField(body, 'openid') ??
    stringField(body, 'unionid');
  if (!subject) throw new Error('provider subject missing');
  const email = stringField(body, 'email')
    ?.normalize('NFKC')
    .trim()
    .toLowerCase();
  const emailVerified =
    body.email_verified === true || body.verified_email === true;
  return {
    provider,
    subject,
    ...((stringField(body, 'name') ?? stringField(body, 'nickname'))
      ? {
          displayName:
            stringField(body, 'name') ?? stringField(body, 'nickname')!,
        }
      : {}),
    ...((stringField(body, 'picture') ?? stringField(body, 'avatar'))
      ? {
          avatarUrl:
            stringField(body, 'picture') ?? stringField(body, 'avatar')!,
        }
      : {}),
    ...(email ? { email } : {}),
    ...(email ? { emailVerified } : {}),
  };
}

export function createDefaultSocialProvider(
  provider: AuthProvider,
  env: NodeJS.ProcessEnv = process.env,
): AuthProviderAdapter {
  const endpoint = providerEndpoints[provider];
  return {
    provider,
    isConfigured: () => configured(provider, env),
    getAuthorizationUrl: ({ state, codeVerifier, nonce, redirectUri }) => {
      const clientId =
        requiredEnv(providerEnvKey(provider, 'CLIENT_ID'), env) ?? '';
      const query = new URLSearchParams({
        redirect_uri: redirectUri,
        response_type: 'code',
        state,
      });
      if (provider === 'google') {
        query.set('client_id', clientId);
        query.set('scope', 'openid email profile');
        query.set('nonce', nonce);
        query.set(
          'code_challenge',
          createHash('sha256').update(codeVerifier).digest('base64url'),
        );
        query.set('code_challenge_method', 'S256');
        query.set('access_type', 'online');
      } else if (provider === 'github') {
        query.set('client_id', clientId);
        query.set('scope', 'read:user user:email');
      } else if (provider === 'wechat') {
        query.set('appid', clientId);
        query.set('scope', 'snsapi_login');
      } else {
        query.set('client_id', clientId);
        query.set('scope', 'get_user_info');
      }
      return `${endpoint.authorize}?${query.toString()}${provider === 'wechat' ? '#wechat_redirect' : ''}`;
    },
    exchangeCode: async ({ code, codeVerifier, nonce, redirectUri }) => {
      const clientId = requiredEnv(providerEnvKey(provider, 'CLIENT_ID'), env);
      const clientSecret = requiredEnv(
        providerEnvKey(provider, 'CLIENT_SECRET'),
        env,
      );
      if (!clientId || !clientSecret)
        throw new Error('provider not configured');
      if (provider === 'wechat' || provider === 'qq') {
        const query =
          provider === 'wechat'
            ? new URLSearchParams({
                appid: clientId,
                secret: clientSecret,
                code,
                grant_type: 'authorization_code',
              })
            : new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
              });
        return formResponse(
          await fetchWithTimeout(`${endpoint.token}?${query.toString()}`),
        );
      }
      const response = await fetchWithTimeout(endpoint.token, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      const token = await formResponse(response);
      if (provider === 'google') {
        if (typeof token.id_token !== 'string')
          throw new Error('OIDC id token missing');
        const claims = await jsonResponse(
          await fetchWithTimeout(
            `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token.id_token)}`,
          ),
        );
        const issuer = claims.iss;
        const audience = claims.aud;
        const expiry = Number(claims.exp);
        if (
          issuer !== 'https://accounts.google.com' &&
          issuer !== 'accounts.google.com'
        )
          throw new Error('OIDC issuer invalid');
        if (
          audience !== clientId ||
          !Number.isFinite(expiry) ||
          expiry <= Math.floor(Date.now() / 1000)
        )
          throw new Error('OIDC audience or expiry invalid');
        if (claims.nonce !== nonce) throw new Error('OIDC nonce invalid');
        token.__oidc_claims = claims;
      }
      return token;
    },
    fetchNormalizedIdentity: async (token) => {
      if (!token || typeof token !== 'object')
        throw new Error('provider token invalid');
      const body = token as Record<string, unknown>;
      const accessToken = stringField(body, 'access_token');
      if (!accessToken) throw new Error('provider access token missing');
      let identityResponse: Response;
      let qqSubject: string | undefined;
      if (provider === 'wechat') {
        const openid = stringField(body, 'openid');
        if (!openid) throw new Error('provider subject missing');
        identityResponse = await fetchWithTimeout(
          `${endpoint.user}?${new URLSearchParams({ access_token: accessToken, openid }).toString()}`,
        );
      } else if (provider === 'qq') {
        const openidResponse = await fetchWithTimeout(
          `https://graph.qq.com/oauth2.0/me?access_token=${encodeURIComponent(accessToken)}`,
        );
        const openidText = await openidResponse.text();
        const match = /"openid"\s*:\s*"([^"]+)"/.exec(openidText);
        const openid = match?.[1];
        if (!openid) throw new Error('provider subject missing');
        qqSubject = openid;
        identityResponse = await fetchWithTimeout(
          `${endpoint.user}?${new URLSearchParams({ access_token: accessToken, oauth_consumer_key: requiredEnv(providerEnvKey(provider, 'CLIENT_ID'), env) ?? '', openid }).toString()}`,
        );
      } else {
        identityResponse = await fetchWithTimeout(endpoint.user, {
          headers: {
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json',
          },
        });
      }
      const identityBody = await jsonResponse(identityResponse);
      if (qqSubject) identityBody.openid = qqSubject;
      if (provider === 'github' && !identityBody.email) {
        const emailsResponse = await fetchWithTimeout(
          'https://api.github.com/user/emails',
          {
            headers: {
              authorization: `Bearer ${accessToken}`,
              accept: 'application/json',
            },
          },
        );
        const emails: unknown = await emailsResponse.json();
        if (Array.isArray(emails)) {
          const primary = emails.find(
            (item) =>
              item &&
              typeof item === 'object' &&
              (item as Record<string, unknown>).primary === true &&
              (item as Record<string, unknown>).verified === true,
          );
          if (primary && typeof primary === 'object') {
            identityBody.email = (primary as Record<string, unknown>).email;
            identityBody.verified_email = true;
          }
        }
      }
      return normalizedFromProvider(provider, identityBody);
    },
  };
}

export function createDefaultMessageProvider(
  channel: VerificationChannel,
  env: NodeJS.ProcessEnv = process.env,
): MessageProvider {
  const endpoint = requiredEnv(
    channel === 'EMAIL'
      ? 'OJPLATFORM_EMAIL_PROVIDER_URL'
      : 'OJPLATFORM_SMS_PROVIDER_URL',
    env,
  );
  const apiKey = requiredEnv(
    channel === 'EMAIL'
      ? 'OJPLATFORM_EMAIL_PROVIDER_API_KEY'
      : 'OJPLATFORM_SMS_PROVIDER_API_KEY',
    env,
  );
  return {
    channel,
    isConfigured: () => Boolean(endpoint && apiKey),
    sendCode: async ({ destination, code, expiresAt }) => {
      if (!endpoint || !apiKey) throw new Error('provider not configured');
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          destination,
          code,
          expiresAt: expiresAt.toISOString(),
        }),
      });
      await jsonResponse(response);
    },
  };
}
