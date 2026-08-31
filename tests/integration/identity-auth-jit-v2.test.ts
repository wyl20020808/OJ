import { readFile } from 'node:fs/promises';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../packages/database/src/index.js';
import { loadConfig } from '../../apps/api/src/config.js';
import {
  createPostgresAuthRepository,
  registerAuthModule,
  type AuthProviderAdapter,
  type MessageProvider,
} from '../../apps/api/src/modules/auth/index.js';

const database = createDatabase({ url: loadConfig().databaseUrl });
const username = `jitdb${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`;
const email = `${username}@example.test`;
let code = '';

const emailProvider: MessageProvider = {
  channel: 'EMAIL',
  isConfigured: () => true,
  sendCode: async (input) => {
    code = input.code;
  },
};
const google: AuthProviderAdapter = {
  provider: 'google',
  isConfigured: () => true,
  getAuthorizationUrl: ({ state }) => `https://provider.test/?state=${state}`,
  exchangeCode: async () => ({}),
  fetchNormalizedIdentity: async () => ({
    provider: 'google',
    subject: `db-${username}`,
  }),
};

beforeAll(async () => {
  await database.pool.query(
    await readFile(
      'packages/database/migrations/0006_auth_identity_verification_social.sql',
      'utf8',
    ),
  );
});

afterAll(async () => {
  await database.pool.query('DELETE FROM users WHERE username=$1', [username]);
  await database.pool.end();
});

describe('AUTH-JIT V2 PostgreSQL identity integration', () => {
  it('persists verified identity, grant consumption, JIT onboarding, and OAuth binding', async () => {
    const server = Fastify({ logger: false });
    const repository = createPostgresAuthRepository(database.pool);
    await registerAuthModule(server, {
      repository,
      emailProvider,
      smsProvider: {
        channel: 'SMS',
        isConfigured: () => false,
        sendCode: async () => undefined,
      },
      socialProviders: { google },
      verificationResendMs: 0,
    });
    const challenge = await server.inject({
      method: 'POST',
      url: '/api/auth/verification/request',
      payload: { channel: 'EMAIL', purpose: 'REGISTER', destination: email },
    });
    expect(challenge.statusCode).toBe(201);
    const grant = await server.inject({
      method: 'POST',
      url: `/api/auth/verification/challenges/${challenge.json().challengeId}/verify`,
      payload: { code },
    });
    expect(grant.statusCode).toBe(200);
    const registration = await server.inject({
      method: 'POST',
      url: '/api/auth/register/verified',
      payload: {
        grantId: grant.json().grantId,
        identifierType: 'EMAIL',
        username,
        displayName: 'Database JIT',
        password: 'DatabaseJitPass123!',
      },
    });
    expect(registration.statusCode).toBe(201);
    const otpChallenge = await server.inject({
      method: 'POST',
      url: '/api/auth/verification/request',
      payload: { channel: 'EMAIL', purpose: 'LOGIN_CODE', destination: email },
    });
    const otpGrant = await server.inject({
      method: 'POST',
      url: `/api/auth/verification/challenges/${otpChallenge.json().challengeId}/verify`,
      payload: { code },
    });
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/auth/login/code',
          payload: { grantId: otpGrant.json().grantId },
        })
      ).statusCode,
    ).toBe(200);
    const oauthStart = await server.inject({
      method: 'POST',
      url: '/api/auth/oauth/google/start',
      payload: {},
    });
    const state = new URL(oauthStart.json().authorizationUrl).searchParams.get(
      'state',
    );
    const oauth = await server.inject({
      method: 'GET',
      url: `/api/auth/oauth/google/callback?state=${state}&code=db`,
    });
    expect(oauth.statusCode).toBe(409);
    await server.close();
  });
});
