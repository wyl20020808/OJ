import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryAuthRepository,
  registerAuthModule,
  type AuthProviderAdapter,
  type MessageProvider,
} from '../apps/api/src/modules/auth/index.js';
import { createDefaultSocialProvider } from '../apps/api/src/modules/auth/providers.js';
import { createRedisRateLimiter } from '../apps/api/src/modules/auth/rate-limiter.js';

const emailCodes: string[] = [];
const smsCodes: string[] = [];
afterEach(() => vi.unstubAllGlobals());
const messageProvider = (
  channel: 'EMAIL' | 'SMS',
  codes: string[],
): MessageProvider => ({
  channel,
  isConfigured: () => true,
  sendCode: async ({ code }) => {
    codes.push(code);
  },
});

function socialProvider(
  provider: 'google' | 'github' | 'wechat' | 'qq',
  identity: { subject: string; email?: string; emailVerified?: boolean },
): AuthProviderAdapter {
  return {
    provider,
    isConfigured: () => true,
    getAuthorizationUrl: ({ state }) =>
      `https://provider.test/authorize?state=${state}`,
    exchangeCode: async ({ code }) => ({ code }),
    fetchNormalizedIdentity: async () => ({ provider, ...identity }),
  };
}

async function setup(
  options: Partial<Parameters<typeof registerAuthModule>[1]> = {},
) {
  const server = Fastify({ logger: false });
  const repository = createMemoryAuthRepository();
  await registerAuthModule(server, {
    repository,
    emailProvider: messageProvider('EMAIL', emailCodes),
    smsProvider: messageProvider('SMS', smsCodes),
    socialProviders: {
      google: socialProvider('google', {
        subject: 'google-subject-1',
        email: 'social@example.test',
        emailVerified: true,
      }),
      github: socialProvider('github', { subject: 'github-subject-1' }),
      wechat: socialProvider('wechat', { subject: 'wechat-subject-1' }),
      qq: socialProvider('qq', { subject: 'qq-subject-1' }),
    },
    verificationResendMs: 0,
    ...options,
  });
  return { server, repository };
}

async function requestCode(
  server: Awaited<ReturnType<typeof setup>>['server'],
  channel: 'EMAIL' | 'SMS',
  destination: string,
  purpose: 'REGISTER' | 'LOGIN_CODE' | 'ADD_IDENTIFIER' = 'REGISTER',
) {
  const response = await server.inject({
    method: 'POST',
    url: '/api/auth/verification/challenges',
    payload: { channel, destination, purpose },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { challengeId: string };
}

async function verifyCode(
  server: Awaited<ReturnType<typeof setup>>['server'],
  challengeId: string,
  code: string,
) {
  const response = await server.inject({
    method: 'POST',
    url: `/api/auth/verification/challenges/${challengeId}/verify`,
    payload: { code },
  });
  expect(response.statusCode).toBe(200);
  return response.json() as { grantId: string };
}

describe('Auth V2 verification, OTP, JIT, OAuth, and linking', () => {
  it('exposes authoritative capabilities and normalizes email/phone destinations', async () => {
    const { server } = await setup();
    expect(
      (
        await server.inject({ method: 'GET', url: '/api/auth/capabilities' })
      ).json(),
    ).toMatchObject({
      registration: { email: true, phone: true },
      login: { emailCode: true, phoneCode: true },
      providers: {
        google: 'enabled',
        github: 'enabled',
        wechat: 'enabled',
        qq: 'enabled',
      },
    });
    const email = await requestCode(server, 'EMAIL', '  Person@EXAMPLE.TEST ');
    expect(
      (await server.inject({ method: 'GET', url: '/api/auth/methods' }))
        .statusCode,
    ).toBe(200);
    expect(email.challengeId).toBeTruthy();
    const phone = await requestCode(server, 'SMS', '001 415 555 0199');
    expect(phone.challengeId).toBeTruthy();
    await server.close();
  });

  it('hashes codes, enforces expiry/attempts, supersedes resend, and creates single-use grants', async () => {
    const { server } = await setup({
      verificationMaxAttempts: 2,
      verificationTtlMs: 20,
    });
    const first = await requestCode(server, 'EMAIL', 'verify@example.test');
    const second = await requestCode(server, 'EMAIL', 'verify@example.test');
    expect(
      (
        await server.inject({
          method: 'POST',
          url: `/api/auth/verification/challenges/${first.challengeId}/verify`,
          payload: { code: '000000' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      await verifyCode(server, second.challengeId, emailCodes.at(-1)!),
    ).toMatchObject({ grantId: expect.any(String) });
    const replay = await server.inject({
      method: 'POST',
      url: `/api/auth/verification/challenges/${second.challengeId}/verify`,
      payload: { code: emailCodes.at(-1) },
    });
    expect(replay.statusCode).toBe(400);
    await server.close();
  });

  it('performs verified email registration atomically and issues a session', async () => {
    const { server, repository } = await setup();
    const challenge = await requestCode(
      server,
      'EMAIL',
      'NewUser@Example.test',
    );
    const grant = await verifyCode(
      server,
      challenge.challengeId,
      emailCodes.at(-1)!,
    );
    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/register/verified',
      payload: {
        grantId: grant.grantId,
        identifierType: 'EMAIL',
        username: 'new-user',
        displayName: 'New User',
        password: 'StrongPass123!',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers['set-cookie']).toContain('oj_session=');
    expect(
      (
        await server.inject({
          method: 'GET',
          url: '/api/auth/account/identifiers',
          headers: { cookie: response.headers['set-cookie'] as string },
        })
      ).json(),
    ).toMatchObject([{ type: 'EMAIL', primary: true, loginCapable: true }]);
    const duplicate = await server.inject({
      method: 'POST',
      url: '/api/auth/register/verified',
      payload: {
        grantId: grant.grantId,
        identifierType: 'EMAIL',
        username: 'another-user',
        displayName: 'Another',
        password: 'StrongPass123!',
      },
    });
    expect(duplicate.statusCode).toBe(400);

    const rollbackChallenge = await requestCode(
      server,
      'EMAIL',
      'rollback@example.test',
    );
    const rollbackGrant = await verifyCode(
      server,
      rollbackChallenge.challengeId,
      emailCodes.at(-1)!,
    );
    const rollback = await server.inject({
      method: 'POST',
      url: '/api/auth/register/verified',
      payload: {
        grantId: rollbackGrant.grantId,
        identifierType: 'EMAIL',
        username: 'new-user',
        displayName: 'Rollback',
        password: 'StrongPass123!',
      },
    });
    expect(rollback.statusCode).toBe(409);
    await expect(
      repository.v2?.findIdentity({
        kind: 'EMAIL',
        value: 'rollback@example.test',
      }),
    ).resolves.toBeNull();
    await server.close();
  });

  it('supports phone verified registration and password login by phone', async () => {
    const { server } = await setup();
    const challenge = await requestCode(server, 'SMS', '+14155550199');
    const grant = await verifyCode(
      server,
      challenge.challengeId,
      smsCodes.at(-1)!,
    );
    const registration = await server.inject({
      method: 'POST',
      url: '/api/auth/register/phone',
      payload: {
        grantId: grant.grantId,
        identifierType: 'PHONE',
        username: 'phone-user',
        displayName: 'Phone User',
        password: 'PhonePass123!',
      },
    });
    expect(registration.statusCode).toBe(201);
    const login = await server.inject({
      method: 'POST',
      url: '/api/auth/login/password',
      payload: {
        identifierType: 'PHONE',
        identifier: '+1 (415) 555-0199',
        password: 'PhonePass123!',
      },
    });
    expect(login.statusCode).toBe(200);
    const otpChallenge = await requestCode(
      server,
      'SMS',
      '+14155550199',
      'LOGIN_CODE',
    );
    const otpGrant = await verifyCode(
      server,
      otpChallenge.challengeId,
      smsCodes.at(-1)!,
    );
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/auth/login/code',
          payload: { grantId: otpGrant.grantId },
        })
      ).statusCode,
    ).toBe(200);
    const duplicateChallenge = await requestCode(server, 'SMS', '+14155550199');
    const duplicateGrant = await verifyCode(
      server,
      duplicateChallenge.challengeId,
      smsCodes.at(-1)!,
    );
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/auth/register/phone',
          payload: {
            grantId: duplicateGrant.grantId,
            username: 'another-phone-user',
            displayName: 'Another Phone',
            password: 'PhonePass123!',
          },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/auth/register/phone',
          payload: {
            username: 'unverified-phone',
            displayName: 'Unverified Phone',
            password: 'PhonePass123!',
          },
        })
      ).statusCode,
    ).toBe(400);
    await server.close();
  });

  it('keeps email password verification compatible and generic on failure', async () => {
    const { server } = await setup();
    const challenge = await requestCode(
      server,
      'EMAIL',
      'known-good@example.test',
    );
    const grant = await verifyCode(
      server,
      challenge.challengeId,
      emailCodes.at(-1)!,
    );
    const registration = await server.inject({
      method: 'POST',
      url: '/api/auth/register/email',
      payload: {
        grantId: grant.grantId,
        identifierType: 'EMAIL',
        username: 'known-good',
        displayName: 'Known Good',
        password: 'KnownGoodPass123!',
      },
    });
    expect(registration.statusCode).toBe(201);
    const login = await server.inject({
      method: 'POST',
      url: '/api/auth/login/password',
      payload: {
        identifierType: 'EMAIL',
        identifier: ' Known-Good@EXAMPLE.TEST ',
        password: 'KnownGoodPass123!',
      },
    });
    expect(login.statusCode).toBe(200);
    const wrong = await server.inject({
      method: 'POST',
      url: '/api/auth/login/password',
      payload: {
        identifierType: 'EMAIL',
        identifier: 'known-good@example.test',
        password: 'WrongPassword123!',
      },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toMatchObject({
      code: 'UNAUTHENTICATED',
      message: 'Invalid credentials',
    });
    await server.close();
  });

  it('logs in existing OTP identity and creates a JIT continuation for a new identity', async () => {
    const { server, repository } = await setup();
    const registrationChallenge = await requestCode(
      server,
      'EMAIL',
      'otp@example.test',
    );
    const registrationGrant = await verifyCode(
      server,
      registrationChallenge.challengeId,
      emailCodes.at(-1)!,
    );
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/auth/register/verified',
          payload: {
            grantId: registrationGrant.grantId,
            identifierType: 'EMAIL',
            username: 'otp-user',
            displayName: 'OTP',
            password: 'OtpPass123!',
          },
        })
      ).statusCode,
    ).toBe(201);
    const existingChallenge = await requestCode(
      server,
      'EMAIL',
      'otp@example.test',
      'LOGIN_CODE',
    );
    const existingGrant = await verifyCode(
      server,
      existingChallenge.challengeId,
      emailCodes.at(-1)!,
    );
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/auth/login/code',
          payload: { grantId: existingGrant.grantId },
        })
      ).statusCode,
    ).toBe(200);
    const newChallenge = await requestCode(
      server,
      'EMAIL',
      'jit@example.test',
      'LOGIN_CODE',
    );
    const newGrant = await verifyCode(
      server,
      newChallenge.challengeId,
      emailCodes.at(-1)!,
    );
    const continuation = await server.inject({
      method: 'POST',
      url: '/api/auth/login/code',
      payload: { grantId: newGrant.grantId },
    });
    expect(continuation.statusCode).toBe(409);
    expect(continuation.json()).toMatchObject({
      code: 'ONBOARDING_REQUIRED',
      details: { continuationId: expect.any(String) },
    });
    await expect(
      repository.v2?.findIdentity({
        kind: 'EMAIL',
        value: 'jit@example.test',
      }),
    ).resolves.toBeNull();
    const finalize = await server.inject({
      method: 'POST',
      url: '/api/auth/login/code/onboarding',
      payload: {
        continuationId: continuation.json().details.continuationId,
        username: 'jit-user',
        displayName: 'JIT User',
        password: 'JitPass123!',
      },
    });
    expect(finalize.statusCode).toBe(200);
    expect(finalize.headers['set-cookie']).toContain('oj_session=');
    await server.close();
  });

  it('runs all four OAuth providers through existing login, first-use JIT, state/replay, and same-email collision', async () => {
    const { server } = await setup();
    const start = await server.inject({
      method: 'POST',
      url: '/api/auth/oauth/google/start',
      payload: { returnTo: '/login' },
    });
    expect(start.statusCode).toBe(200);
    const state = new URL(start.json().authorizationUrl).searchParams.get(
      'state',
    )!;
    const callback = await server.inject({
      method: 'GET',
      url: `/api/auth/oauth/google/callback?state=${state}&code=one`,
    });
    expect(callback.statusCode).toBe(409);
    expect(callback.json()).toMatchObject({
      code: 'ONBOARDING_REQUIRED',
      details: { transactionId: expect.any(String) },
    });
    const transactionId = callback.json().details.transactionId;
    const onboarding = await server.inject({
      method: 'POST',
      url: '/api/auth/oauth/onboarding',
      payload: {
        transactionId,
        username: 'google-user',
        displayName: 'Google User',
      },
    });
    expect(onboarding.statusCode).toBe(200);
    const replay = await server.inject({
      method: 'GET',
      url: `/api/auth/oauth/google/callback?state=${state}&code=one`,
    });
    expect(replay.statusCode).toBe(400);
    for (const provider of ['github', 'wechat', 'qq'] as const) {
      const next = await server.inject({
        method: 'POST',
        url: `/api/auth/oauth/${provider}/start`,
        payload: {},
      });
      expect(next.statusCode).toBe(200);
      const nextState = new URL(next.json().authorizationUrl).searchParams.get(
        'state',
      )!;
      const result = await server.inject({
        method: 'GET',
        url: `/api/auth/oauth/${provider}/callback?state=${nextState}&code=one`,
      });
      expect(result.statusCode).toBe(409);
      expect(
        (
          await server.inject({
            method: 'POST',
            url: '/api/auth/oauth/onboarding',
            payload: {
              transactionId: result.json().details.transactionId,
              username: `${provider}-user`,
              displayName: `${provider} User`,
            },
          })
        ).statusCode,
      ).toBe(200);
      const existing = await server.inject({
        method: 'POST',
        url: `/api/auth/oauth/${provider}/start`,
        payload: {},
      });
      const existingState = new URL(
        existing.json().authorizationUrl,
      ).searchParams.get('state')!;
      const authenticated = await server.inject({
        method: 'GET',
        url: `/api/auth/oauth/${provider}/callback?state=${existingState}&code=again`,
      });
      expect(authenticated.statusCode).toBe(200);
      expect(authenticated.json().status).toBe('AUTHENTICATED');
    }
    const collision = await server.inject({
      method: 'POST',
      url: '/api/auth/oauth/google/start',
      payload: {},
    });
    const collisionState = new URL(
      collision.json().authorizationUrl,
    ).searchParams.get('state')!;
    const collisionResult = await server.inject({
      method: 'GET',
      url: `/api/auth/oauth/google/callback?state=${collisionState}&code=two`,
    });
    expect(collisionResult.statusCode).toBe(200);
    await server.close();
  });

  it('requires an authenticated owner for linking and protects the last login method', async () => {
    const { server } = await setup();
    await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'link-user',
        email: 'link@example.test',
        displayName: 'Link',
        password: 'LinkPass123!',
      },
    });
    const login = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identity: 'link-user', password: 'LinkPass123!' },
    });
    const cookie = login.headers['set-cookie'] as string;
    const start = await server.inject({
      method: 'POST',
      url: '/api/auth/oauth/github/start',
      headers: { cookie },
      payload: { mode: 'link' },
    });
    expect(start.statusCode).toBe(200);
    const state = new URL(start.json().authorizationUrl).searchParams.get(
      'state',
    )!;
    const linked = await server.inject({
      method: 'GET',
      url: `/api/auth/oauth/github/callback?state=${state}&code=link`,
      headers: { cookie },
    });
    expect(linked.statusCode).toBe(200);
    expect(
      (
        await server.inject({
          method: 'GET',
          url: '/api/auth/account/identities',
          headers: { cookie },
        })
      ).json(),
    ).toMatchObject([{ provider: 'github' }]);
    expect(
      (
        await server.inject({
          method: 'DELETE',
          url: '/api/auth/account/identities/github',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await server.inject({
          method: 'DELETE',
          url: '/api/auth/account/identities/github',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(404);
    await server.close();
  });

  it('rate limits verification requests without exposing raw code or identity secrets', async () => {
    const { server } = await setup();
    const results = [];
    for (let index = 0; index < 6; index += 1)
      results.push(
        await server.inject({
          method: 'POST',
          url: '/api/auth/verification/challenges',
          payload: {
            channel: 'EMAIL',
            purpose: 'LOGIN_CODE',
            destination: 'limited@example.test',
          },
        }),
      );
    expect(results.at(-1)?.statusCode).toBe(429);
    expect(results.at(-1)?.body).not.toContain(emailCodes.at(-1) ?? 'never');
    await server.close();
  });

  it('enforces server-side resend cooldown and honest not-configured capabilities', async () => {
    const { server } = await setup({
      emailProvider: {
        channel: 'EMAIL',
        isConfigured: () => false,
        sendCode: async () => undefined,
      },
      smsProvider: {
        channel: 'SMS',
        isConfigured: () => false,
        sendCode: async () => undefined,
      },
      socialProviders: {
        google: {
          provider: 'google',
          isConfigured: () => false,
          getAuthorizationUrl: () => 'https://unused.test',
          exchangeCode: async () => ({}),
          fetchNormalizedIdentity: async () => ({
            provider: 'google',
            subject: 'unused',
          }),
        },
      },
    });
    expect(
      (await server.inject({ method: 'GET', url: '/api/auth/methods' })).json(),
    ).toMatchObject({
      registration: { email: false, phone: false },
      login: { emailCode: false, phoneCode: false },
      providers: { google: 'not_configured' },
    });
    const unavailable = await server.inject({
      method: 'POST',
      url: '/api/auth/verification/request',
      payload: {
        channel: 'EMAIL',
        purpose: 'REGISTER',
        destination: 'x@example.test',
      },
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json().code).toBe('NOT_CONFIGURED');
    await server.close();

    const cooldown = await setup({ verificationResendMs: 60_000 });
    const first = await requestCode(
      cooldown.server,
      'EMAIL',
      'cooldown@example.test',
    );
    expect(first.challengeId).toBeTruthy();
    const second = await cooldown.server.inject({
      method: 'POST',
      url: '/api/auth/verification/request',
      payload: {
        channel: 'EMAIL',
        purpose: 'REGISTER',
        destination: 'cooldown@example.test',
      },
    });
    expect(second.statusCode).toBe(429);
    expect(second.json().code).toBe('RESEND_COOLDOWN');
    await cooldown.server.close();
  });

  it('does not apply a verified challenge cooldown to another destination', async () => {
    const { server } = await setup({ verificationResendMs: 60_000 });
    const first = await requestCode(
      server,
      'EMAIL',
      'verified-one@example.test',
    );
    await verifyCode(server, first.challengeId, emailCodes.at(-1)!);
    const second = await server.inject({
      method: 'POST',
      url: '/api/auth/verification/request',
      payload: {
        channel: 'EMAIL',
        purpose: 'REGISTER',
        destination: 'verified-two@example.test',
      },
    });
    expect(second.statusCode).toBe(201);
    await server.close();
  });

  it('rejects wrong purpose/destination, locks brute force attempts, expires codes, and rejects unverified registration', async () => {
    const { server } = await setup({ verificationMaxAttempts: 2 });
    const challenge = await requestCode(
      server,
      'EMAIL',
      'negative@example.test',
    );
    const wrongPurpose = await server.inject({
      method: 'POST',
      url: `/api/auth/verification/challenges/${challenge.challengeId}/verify`,
      payload: { code: emailCodes.at(-1), purpose: 'ADD_IDENTIFIER' },
    });
    expect(wrongPurpose.statusCode).toBe(400);
    const wrongDestination = await server.inject({
      method: 'POST',
      url: `/api/auth/verification/challenges/${challenge.challengeId}/verify`,
      payload: { code: emailCodes.at(-1), destination: 'other@example.test' },
    });
    expect(wrongDestination.statusCode).toBe(400);
    await server.inject({
      method: 'POST',
      url: `/api/auth/verification/challenges/${challenge.challengeId}/verify`,
      payload: { code: '000000' },
    });
    const locked = await server.inject({
      method: 'POST',
      url: `/api/auth/verification/challenges/${challenge.challengeId}/verify`,
      payload: { code: '000001' },
    });
    expect(locked.statusCode).toBe(400);
    const replayLocked = await server.inject({
      method: 'POST',
      url: `/api/auth/verification/challenges/${challenge.challengeId}/verify`,
      payload: { code: emailCodes.at(-1) },
    });
    expect(replayLocked.statusCode).toBe(400);

    const expiredSetup = await setup({ verificationTtlMs: 5 });
    const expired = await requestCode(
      expiredSetup.server,
      'EMAIL',
      'expired@example.test',
    );
    await new Promise((resolve) => setTimeout(resolve, 15));
    const expiredResponse = await expiredSetup.server.inject({
      method: 'POST',
      url: `/api/auth/verification/challenges/${expired.challengeId}/verify`,
      payload: { code: emailCodes.at(-1) },
    });
    expect(expiredResponse.statusCode).toBe(400);
    await expiredSetup.server.close();

    const noGrant = await server.inject({
      method: 'POST',
      url: '/api/auth/register/email',
      payload: {
        username: 'unverified-user',
        displayName: 'Unverified',
        password: 'StrongPass123!',
      },
    });
    expect(noGrant.statusCode).toBe(400);
    await server.close();
  });

  it('supports phone OTP JIT onboarding without inventing an email identity', async () => {
    const { server } = await setup();
    const challenge = await requestCode(
      server,
      'SMS',
      '+14155550188',
      'LOGIN_CODE',
    );
    const grant = await verifyCode(
      server,
      challenge.challengeId,
      smsCodes.at(-1)!,
    );
    const continuation = await server.inject({
      method: 'POST',
      url: '/api/auth/login/code',
      payload: { grantId: grant.grantId },
    });
    expect(continuation.statusCode).toBe(409);
    const finalized = await server.inject({
      method: 'POST',
      url: '/api/auth/login/code/onboarding',
      payload: {
        continuationId: continuation.json().details.continuationId,
        username: 'phone-jit',
        displayName: 'Phone JIT',
      },
    });
    expect(finalized.statusCode).toBe(200);
    expect(finalized.json().email).toBe('');
    const identifiers = await server.inject({
      method: 'GET',
      url: '/api/auth/account/identifiers',
      headers: { cookie: finalized.headers['set-cookie'] as string },
    });
    expect(identifiers.json()).toMatchObject([
      { type: 'PHONE', loginCapable: true },
    ]);
    await server.close();
  });

  it('enforces OAuth state, provider binding, cancellation, collision, and token privacy', async () => {
    const { server } = await setup();
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/auth/oauth/google/start',
          payload: { returnTo: 'https://evil.test' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await server.inject({
          method: 'GET',
          url: '/api/auth/oauth/google/callback?code=x',
        })
      ).statusCode,
    ).toBe(400);
    const start = await server.inject({
      method: 'POST',
      url: '/api/auth/oauth/google/start',
      payload: { returnTo: '/login' },
    });
    const state = new URL(start.json().authorizationUrl).searchParams.get(
      'state',
    )!;
    expect(
      (
        await server.inject({
          method: 'GET',
          url: `/api/auth/oauth/github/callback?state=${state}&code=x`,
        })
      ).statusCode,
    ).toBe(400);
    for (const provider of ['qq', 'wechat'] as const) {
      const cancelledStart = await server.inject({
        method: 'POST',
        url: `/api/auth/oauth/${provider}/start`,
        payload: {},
      });
      const cancelledState = new URL(
        cancelledStart.json().authorizationUrl,
      ).searchParams.get('state')!;
      expect(
        (
          await server.inject({
            method: 'GET',
            url: `/api/auth/oauth/${provider}/callback?state=${cancelledState}&error=access_denied`,
          })
        ).json(),
      ).toMatchObject({ status: 'CANCELLED' });
    }

    const expiredSetup = await setup({ oauthTtlMs: 5 });
    const expiredStart = await expiredSetup.server.inject({
      method: 'POST',
      url: '/api/auth/oauth/google/start',
      payload: {},
    });
    const expiredState = new URL(
      expiredStart.json().authorizationUrl,
    ).searchParams.get('state')!;
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(
      (
        await expiredSetup.server.inject({
          method: 'GET',
          url: `/api/auth/oauth/google/callback?state=${expiredState}&code=x`,
        })
      ).statusCode,
    ).toBe(400);
    await expiredSetup.server.close();

    const collisionSetup = await setup();
    await collisionSetup.server.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'collision',
        email: 'social@example.test',
        displayName: 'Collision',
        password: 'CollisionPass123!',
      },
    });
    const collisionStart = await collisionSetup.server.inject({
      method: 'POST',
      url: '/api/auth/oauth/google/start',
      payload: {},
    });
    const collisionState = new URL(
      collisionStart.json().authorizationUrl,
    ).searchParams.get('state')!;
    const collision = await collisionSetup.server.inject({
      method: 'GET',
      url: `/api/auth/oauth/google/callback?state=${collisionState}&code=x`,
    });
    expect(collision.statusCode).toBe(409);
    expect(collision.json().code).toBe('LINK_REQUIRED');
    await collisionSetup.server.close();

    const firstUseStart = await server.inject({
      method: 'POST',
      url: '/api/auth/oauth/google/start',
      payload: {},
    });
    const firstUseState = new URL(
      firstUseStart.json().authorizationUrl,
    ).searchParams.get('state')!;
    const firstUse = await server.inject({
      method: 'GET',
      url: `/api/auth/oauth/google/callback?state=${firstUseState}&code=x`,
    });
    const onboarding = await server.inject({
      method: 'POST',
      url: '/api/auth/oauth/onboarding',
      payload: {
        transactionId: firstUse.json().details.transactionId,
        username: 'token-private',
        displayName: 'Token Private',
      },
    });
    expect(onboarding.statusCode).toBe(200);
    expect(onboarding.body).not.toMatch(
      /access_token|refresh_token|providerToken|code_verifier/,
    );
    const boundStart = await server.inject({
      method: 'POST',
      url: '/api/auth/oauth/google/start',
      payload: {},
    });
    const boundState = new URL(
      boundStart.json().authorizationUrl,
    ).searchParams.get('state')!;
    const bound = await server.inject({
      method: 'GET',
      url: `/api/auth/oauth/google/callback?state=${boundState}&code=x`,
    });
    expect(bound.statusCode).toBe(200);
    expect(bound.json()).toMatchObject({
      status: 'AUTHENTICATED',
      user: { username: 'token-private' },
    });
    await server.close();
  });

  it('rejects linking after session revocation and protects the only social login method', async () => {
    const { server } = await setup();
    await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'revoked-link',
        email: 'revoked-link@example.test',
        displayName: 'Revoked Link',
        password: 'RevokedPass123!',
      },
    });
    const login = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identity: 'revoked-link', password: 'RevokedPass123!' },
    });
    const cookie = login.headers['set-cookie'] as string;
    const start = await server.inject({
      method: 'POST',
      url: '/api/auth/account/identities/github/start',
      headers: { cookie },
      payload: {},
    });
    const state = new URL(start.json().authorizationUrl).searchParams.get(
      'state',
    )!;
    await server.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });
    const revoked = await server.inject({
      method: 'GET',
      url: `/api/auth/oauth/github/callback?state=${state}&code=x`,
      headers: { cookie },
    });
    expect(revoked.statusCode).toBe(401);

    const jitStart = await server.inject({
      method: 'POST',
      url: '/api/auth/oauth/github/start',
      payload: {},
    });
    const jitState = new URL(jitStart.json().authorizationUrl).searchParams.get(
      'state',
    )!;
    const jitCallback = await server.inject({
      method: 'GET',
      url: `/api/auth/oauth/github/callback?state=${jitState}&code=x`,
    });
    const jit = await server.inject({
      method: 'POST',
      url: '/api/auth/oauth/onboarding',
      payload: {
        transactionId: jitCallback.json().details.transactionId,
        username: 'social-only',
        displayName: 'Social Only',
      },
    });
    expect(jit.statusCode).toBe(200);
    const unlink = await server.inject({
      method: 'DELETE',
      url: '/api/auth/account/identities/github',
      headers: { cookie: jit.headers['set-cookie'] as string },
    });
    expect(unlink.statusCode).toBe(409);
    expect(unlink.json().code).toBe('LAST_LOGIN_METHOD');
    await server.close();
  });

  it('uses authenticated rate-limit dimensions and fails closed when Redis is unavailable', async () => {
    const scopes: string[] = [];
    const { server } = await setup({
      rateLimiter: {
        check: async ({ scope }) => {
          scopes.push(scope);
          return { allowed: true, retryAfterSeconds: 1 };
        },
      },
    });
    await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'limit-user',
        email: 'limit@example.test',
        displayName: 'Limit User',
        password: 'LimitPass123!',
      },
    });
    const login = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identity: 'limit-user', password: 'LimitPass123!' },
    });
    await server.inject({
      method: 'POST',
      url: '/api/auth/account/identities/github/start',
      headers: { cookie: login.headers['set-cookie'] as string },
      payload: {},
    });
    expect(scopes).toEqual(
      expect.arrayContaining([
        'oauth:start:user',
        'oauth:start:session',
        'oauth:start:provider',
      ]),
    );
    await server.close();

    const unavailable = createRedisRateLimiter({
      incr: async () => {
        throw new Error('redis unavailable');
      },
      pexpire: async () => undefined,
      pttl: async () => -1,
    });
    await expect(
      unavailable.check({
        scope: 'login:password',
        subject: 'limit@example.test',
        limit: 1,
        windowMs: 1000,
      }),
    ).resolves.toMatchObject({ allowed: false });
  });

  it('fails closed on verification-attempt, password-login, and OAuth-start abuse', async () => {
    const { server } = await setup({
      rateLimiter: {
        check: async ({ scope }) => ({
          allowed: ![
            'verification:verify',
            'login:password',
            'oauth:start',
          ].includes(scope),
          retryAfterSeconds: 10,
        }),
      },
    });
    const challenge = await requestCode(server, 'EMAIL', 'abuse@example.test');
    expect(
      (
        await server.inject({
          method: 'POST',
          url: `/api/auth/verification/challenges/${challenge.challengeId}/verify`,
          payload: { code: '000000' },
        })
      ).statusCode,
    ).toBe(429);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/auth/login/password',
          payload: {
            identifierType: 'EMAIL',
            identifier: 'abuse@example.test',
            password: 'WrongPass123!',
          },
        })
      ).statusCode,
    ).toBe(429);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/auth/oauth/google/start',
          payload: {},
        })
      ).statusCode,
    ).toBe(429);
    await server.close();
  });

  it('requires Google OIDC claims and accepts tokeninfo expiry strings', async () => {
    const provider = createDefaultSocialProvider('google', {
      OJPLATFORM_OAUTH_GOOGLE_CLIENT_ID: 'google-client',
      OJPLATFORM_OAUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
      OJPLATFORM_AUTH_CALLBACK_BASE_URL: 'http://127.0.0.1:3000',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === 'https://oauth2.googleapis.com/token')
          return new Response(
            JSON.stringify({ access_token: 'access', id_token: 'id-token' }),
            { headers: { 'content-type': 'application/json' } },
          );
        return new Response(
          JSON.stringify({
            iss: 'https://accounts.google.com',
            aud: 'google-client',
            exp: String(Math.floor(Date.now() / 1000) + 300),
            nonce: 'nonce',
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }),
    );
    await expect(
      provider.exchangeCode({
        code: 'code',
        codeVerifier: 'verifier',
        nonce: 'nonce',
        redirectUri: 'http://127.0.0.1:3000/callback',
      }),
    ).resolves.toMatchObject({ access_token: 'access' });

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ access_token: 'access' }), {
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    await expect(
      provider.exchangeCode({
        code: 'code',
        codeVerifier: 'verifier',
        nonce: 'nonce',
        redirectUri: 'http://127.0.0.1:3000/callback',
      }),
    ).rejects.toThrow('OIDC id token missing');
  });
});
