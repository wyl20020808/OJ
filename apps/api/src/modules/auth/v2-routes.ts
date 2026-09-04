import {
  createHash,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  describePasswordHash,
  hashPassword,
  sessionToken,
  tokenHash,
  verifyPasswordDiagnostic,
} from './crypto.js';
import { publicUser, type AuthContext, type AuthRepository } from './types.js';
import {
  createDefaultMessageProvider,
  createDefaultSocialProvider,
} from './providers.js';
import { createMemoryRateLimiter } from './rate-limiter.js';
import type {
  AuthIdentity,
  AuthMethods,
  AuthOnboardingContinuation,
  AuthProvider,
  AuthProviderAdapter,
  AuthV2Repository,
  IdentityKind,
  MessageProvider,
  OAuthTransactionRecord,
  RateLimiter,
  SocialIdentity,
  VerificationChannel,
  VerificationPurpose,
} from './v2-types.js';

type V2Options = {
  repository: AuthRepository;
  getAuthContext: (request: FastifyRequest) => Promise<AuthContext | null>;
  production?: boolean;
  sessionTtlMs: number;
  verificationTtlMs?: number;
  verificationResendMs?: number;
  verificationMaxAttempts?: number;
  oauthTtlMs?: number;
  callbackBaseUrl?: string;
  allowedReturnPaths?: readonly string[];
  emailProvider?: MessageProvider;
  smsProvider?: MessageProvider;
  socialProviders?: Partial<Record<AuthProvider, AuthProviderAdapter>>;
  rateLimiter?: RateLimiter;
  guestLoginAvailable?: boolean;
  audit?: (
    context: AuthContext | undefined,
    action: string,
    outcome: 'allowed' | 'denied',
    requestId: string,
    resourceId?: string,
  ) => Promise<void>;
};

type Body = Record<string, unknown> | null | undefined;

const providers: AuthProvider[] = ['wechat', 'qq', 'google', 'github'];
const providerSet = new Set(providers);
const purposes = new Set<VerificationPurpose>([
  'REGISTER',
  'LOGIN_CODE',
  'ADD_IDENTIFIER',
]);

const asBody = (value: unknown): Body =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const stringValue = (value: unknown) =>
  typeof value === 'string' ? value : null;
const keysOnly = (body: Body, allowed: ReadonlySet<string>) =>
  Boolean(body) && Object.keys(body!).every((key) => allowed.has(key));

const normalizeEmail = (value: string) =>
  value.normalize('NFKC').trim().toLowerCase();
const normalizePhone = (value: string) => {
  let normalized = value
    .normalize('NFKC')
    .trim()
    .replace(/[\s().-]/g, '');
  if (normalized.startsWith('00')) normalized = `+${normalized.slice(2)}`;
  if (!normalized.startsWith('+'))
    normalized = /^1\d{10}$/.test(normalized)
      ? `+86${normalized}`
      : `+${normalized}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
};
const normalizeMainlandChinaPhone = (value: string) =>
  /^1[3-9]\d{9}$/.test(value.normalize('NFKC').trim())
    ? `+86${value.normalize('NFKC').trim()}`
    : null;
const validEmail = (value: string) =>
  value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validUsername = (value: string) =>
  /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/.test(value) &&
  value.length >= 3 &&
  value.length <= 32;
const normalizeUsername = (value: string) =>
  value.normalize('NFKC').trim().toLowerCase();
const normalizeDisplayName = (value: string) => {
  const normalized = value.normalize('NFKC').trim();
  return normalized.length >= 1 && normalized.length <= 80 ? normalized : null;
};
const validPassword = (value: string) =>
  value.length >= 8 && value.length <= 200;
const hashCode = (challengeId: string, code: string) =>
  createHash('sha256').update(`${challengeId}:${code}`, 'utf8').digest('hex');
const hashState = (state: string) =>
  createHash('sha256').update(state).digest('hex');
const safeReturnPath = (value: string) =>
  value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
    ? value
    : null;

const productDatabaseName = () => {
  try {
    const pathname = new URL(process.env.DATABASE_URL ?? '').pathname;
    return pathname.replace(/^\//, '') || 'unknown';
  } catch {
    return 'unknown';
  }
};

const sendError = (
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
) => {
  const body: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  } = {
    code,
    message,
    requestId: reply.request.id,
  };
  if (details !== undefined) body.details = details;
  return reply.status(statusCode).send(body);
};

const providerDisabled = (provider: AuthProvider, env: NodeJS.ProcessEnv) =>
  env[`OJPLATFORM_OAUTH_${provider.toUpperCase()}_DISABLED`] === 'true';

const masked = (value: string, kind: IdentityKind) => {
  if (kind === 'PHONE') return `${value.slice(0, 3)}****${value.slice(-2)}`;
  if (kind === 'EMAIL') {
    const at = value.indexOf('@');
    if (at <= 1) return `***${value.slice(at)}`;
    return `${value.slice(0, 1)}***${value.slice(at)}`;
  }
  return 'Connected provider';
};

const identityProjection = (identity: AuthIdentity, primary: boolean) => ({
  id: identity.id,
  type: identity.kind,
  maskedValue: masked(identity.value, identity.kind),
  verifiedAt: identity.verifiedAt,
  primary,
  loginCapable: true,
});

const providerProjection = (identity: AuthIdentity) => ({
  provider: identity.provider,
  subjectLabel: 'Connected provider',
  linkedAt: identity.createdAt,
});

export async function registerAuthV2Routes(
  app: FastifyInstance,
  options: V2Options,
) {
  const store = options.repository.v2;
  const memoryLimiter = createMemoryRateLimiter();
  const limiter = options.rateLimiter ?? memoryLimiter;
  const emailProvider =
    options.emailProvider ?? createDefaultMessageProvider('EMAIL');
  const smsProvider =
    options.smsProvider ?? createDefaultMessageProvider('SMS');
  const social: Record<AuthProvider, AuthProviderAdapter> = {
    wechat:
      options.socialProviders?.wechat ?? createDefaultSocialProvider('wechat'),
    qq: options.socialProviders?.qq ?? createDefaultSocialProvider('qq'),
    google:
      options.socialProviders?.google ?? createDefaultSocialProvider('google'),
    github:
      options.socialProviders?.github ?? createDefaultSocialProvider('github'),
  };
  const verificationTtl = options.verificationTtlMs ?? 10 * 60 * 1000;
  const resendCooldown = options.verificationResendMs ?? 60 * 1000;
  const maxAttempts = options.verificationMaxAttempts ?? 5;
  const oauthTtl = options.oauthTtlMs ?? 10 * 60 * 1000;
  const callbackBase =
    options.callbackBaseUrl ??
    process.env.OJPLATFORM_AUTH_CALLBACK_BASE_URL ??
    'http://127.0.0.1:3000';
  const allowedReturnPaths = new Set(
    options.allowedReturnPaths ??
      (
        process.env.OJPLATFORM_AUTH_ALLOWED_RETURN_PATHS ??
        '/,/login,/register,/problems,/profile'
      )
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
  );
  const authStore = (reply: FastifyReply): AuthV2Repository | null => {
    if (store) return store;
    sendError(
      reply,
      501,
      'NOT_CONFIGURED',
      'Identity service is not configured',
    );
    return null;
  };

  const audit = async (
    context: AuthContext | undefined,
    action: string,
    outcome: 'allowed' | 'denied',
    requestId: string,
    resourceId?: string,
  ) => options.audit?.(context, action, outcome, requestId, resourceId);

  const rateLimit = async (
    request: FastifyRequest,
    reply: FastifyReply,
    scope: string,
    subject: string,
    limit: number,
    windowMs: number,
    dimensions?: { context?: AuthContext; provider?: AuthProvider },
  ) => {
    const checks = [
      limiter.check({ scope, subject, limit, windowMs }),
      limiter.check({
        scope: `${scope}:ip`,
        subject: request.ip,
        limit,
        windowMs,
      }),
      limiter.check({
        scope: `${scope}:global`,
        subject: 'global',
        limit: Math.max(limit * 100, 100),
        windowMs,
      }),
    ];
    if (dimensions?.context?.userId)
      checks.push(
        limiter.check({
          scope: `${scope}:user`,
          subject: dimensions.context.userId,
          limit,
          windowMs,
        }),
      );
    if (dimensions?.context?.sessionId)
      checks.push(
        limiter.check({
          scope: `${scope}:session`,
          subject: dimensions.context.sessionId,
          limit,
          windowMs,
        }),
      );
    if (dimensions?.provider)
      checks.push(
        limiter.check({
          scope: `${scope}:provider`,
          subject: dimensions.provider,
          limit: Math.max(limit * 10, 10),
          windowMs,
        }),
      );
    const decisions = await Promise.all(checks);
    const denied = decisions.find((item) => !item.allowed);
    if (!denied) return true;
    sendError(reply, 429, 'RATE_LIMITED', 'Too many authentication attempts', {
      retryAfterSeconds: denied.retryAfterSeconds,
    });
    return false;
  };

  const contextUser = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = await options.getAuthContext(request);
    if (!context) {
      sendError(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
      return null;
    }
    const user = await options.repository.findById(context.userId);
    if (!user || user.status !== 'active') {
      sendError(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
      return null;
    }
    return { context, user };
  };

  const issueSession = async (
    userId: string,
    reply: FastifyReply,
    strength: 'password' = 'password',
  ) => {
    const token = sessionToken();
    await options.repository.createSession({
      userId,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + options.sessionTtlMs),
    });
    reply.header(
      'set-cookie',
      `oj_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${options.production ? '; Secure' : ''}; Max-Age=${Math.floor(options.sessionTtlMs / 1000)}`,
    );
    return strength;
  };

  const findDestinationIdentity = async (
    storeValue: AuthV2Repository,
    kind: 'EMAIL' | 'PHONE',
    destination: string,
  ) => storeValue.findIdentity({ kind, value: destination });

  const createRandomPasswordHash = () => hashPassword(sessionToken());

  const createJitUser = async (
    storeValue: AuthV2Repository,
    input: {
      username: string;
      displayName: string;
      password?: string;
      identity: AuthOnboardingContinuation['identity'];
    },
  ) => {
    const passwordLoginEnabled = Boolean(input.password);
    const passwordHash = input.password
      ? await hashPassword(input.password)
      : await createRandomPasswordHash();
    const email =
      input.identity.kind === 'EMAIL'
        ? input.identity.value
        : input.identity.email && input.identity.emailVerified
          ? input.identity.email
          : null;
    return storeValue.createUserWithIdentity({
      username: input.username,
      email,
      displayName: input.displayName,
      passwordHash,
      passwordLoginEnabled,
      identity: {
        kind: input.identity.kind,
        value: input.identity.value,
        ...(input.identity.provider
          ? { provider: input.identity.provider }
          : {}),
        ...(input.identity.subject ? { subject: input.identity.subject } : {}),
        ...(input.identity.displayName
          ? { displayName: input.identity.displayName }
          : {}),
        ...(input.identity.avatarUrl
          ? { avatarUrl: input.identity.avatarUrl }
          : {}),
      },
    });
  };

  const completeContinuation = async (
    request: FastifyRequest,
    reply: FastifyReply,
    continuationId: string,
    username: string,
    displayName: string,
    password?: string,
  ) => {
    const storeValue = authStore(reply);
    if (!storeValue) return;
    const requestContext = await options.getAuthContext(request);
    if (
      !validUsername(username) ||
      !displayName ||
      !validDisplayName(displayName)
    )
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Invalid onboarding data',
      );
    if (password !== undefined && !validPassword(password))
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Invalid onboarding data',
      );
    if (
      !(await rateLimit(
        request,
        reply,
        'onboarding:finalize',
        continuationId,
        10,
        10 * 60 * 1000,
        { ...(requestContext ? { context: requestContext } : {}) },
      ))
    )
      return;
    const continuation = await storeValue.consumeContinuation(continuationId);
    if (!continuation)
      return sendError(
        reply,
        400,
        'ONBOARDING_EXPIRED',
        'Onboarding is invalid or expired',
      );
    try {
      if (continuation.linkUserId) {
        const current = await options.repository.findById(
          continuation.linkUserId,
        );
        if (!current || current.status !== 'active')
          return sendError(
            reply,
            401,
            'UNAUTHENTICATED',
            'Authentication required',
          );
        const context = await contextUser(request, reply);
        if (!context || context.user.id !== continuation.linkUserId)
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Identity linking is forbidden',
          );
        await storeValue.addIdentity({
          userId: continuation.linkUserId,
          kind: continuation.identity.kind,
          value: continuation.identity.value,
          ...(continuation.identity.provider
            ? { provider: continuation.identity.provider }
            : {}),
          ...(continuation.identity.subject
            ? { subject: continuation.identity.subject }
            : {}),
          ...(continuation.identity.displayName
            ? { displayName: continuation.identity.displayName }
            : {}),
          ...(continuation.identity.avatarUrl
            ? { avatarUrl: continuation.identity.avatarUrl }
            : {}),
        });
        await audit(
          context.context,
          'identity:link',
          'allowed',
          request.id,
          continuation.id,
        );
        return reply.send(publicUser(current));
      }
      const result = await createJitUser(storeValue, {
        username,
        displayName,
        ...(password !== undefined ? { password } : {}),
        identity: continuation.identity,
      });
      await issueSession(result.user.id, reply);
      await audit(
        undefined,
        'identity:jit_signup',
        'allowed',
        request.id,
        result.user.id,
      );
      return reply.send(publicUser(result.user));
    } catch (cause) {
      if (isDuplicate(cause))
        return sendError(
          reply,
          409,
          'DUPLICATE_IDENTITY',
          'Username or identity is already registered',
        );
      throw cause;
    }
  };

  app.get('/api/auth/methods', async (_request, reply) =>
    reply.send(await methods()),
  );
  app.get('/api/auth/capabilities', async (_request, reply) =>
    reply.send(await methods()),
  );

  async function methods(): Promise<
    AuthMethods & { guestLogin: { available: boolean } }
  > {
    const providerStates = Object.fromEntries(
      providers.map((provider) => {
        if (providerDisabled(provider, process.env))
          return [provider, 'disabled'];
        return [
          provider,
          social[provider].isConfigured() ? 'enabled' : 'not_configured',
        ];
      }),
    ) as AuthMethods['providers'];
    return {
      registration: {
        email: emailProvider.isConfigured(),
        phone: smsProvider.isConfigured(),
      },
      login: {
        emailPassword: true,
        phonePassword: true,
        emailCode: emailProvider.isConfigured(),
        phoneCode: smsProvider.isConfigured(),
      },
      providers: providerStates,
      passwordPolicy: { minLength: 8 },
      guestLogin: { available: options.guestLoginAvailable === true },
    };
  }

  const requestVerification = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const storeValue = authStore(reply);
    if (!storeValue) return;
    const body = asBody(request.body);
    const channel = stringValue(body?.channel) as VerificationChannel | null;
    const purpose = stringValue(body?.purpose) as VerificationPurpose | null;
    const rawDestination = stringValue(body?.destination);
    if (
      !body ||
      !keysOnly(body, new Set(['channel', 'purpose', 'destination'])) ||
      !channel ||
      !(['EMAIL', 'SMS'] as const).includes(channel) ||
      !purpose ||
      !purposes.has(purpose) ||
      !rawDestination
    )
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Invalid verification request',
      );
    const destination =
      channel === 'EMAIL'
        ? normalizeEmail(rawDestination)
        : normalizePhone(rawDestination);
    if (
      !destination ||
      (channel === 'EMAIL' && !validEmail(destination)) ||
      (channel === 'SMS' && !normalizePhone(destination))
    )
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Invalid verification destination',
      );
    const current =
      purpose === 'ADD_IDENTIFIER' ? await contextUser(request, reply) : null;
    if (purpose === 'ADD_IDENTIFIER' && !current) return;
    const provider = channel === 'EMAIL' ? emailProvider : smsProvider;
    if (!provider.isConfigured())
      return sendError(
        reply,
        503,
        'NOT_CONFIGURED',
        'Verification provider is not configured',
      );
    if (
      !(await rateLimit(
        request,
        reply,
        'verification:request',
        destination,
        5,
        15 * 60 * 1000,
        { ...(current ? { context: current.context } : {}) },
      ))
    )
      return;
    const latest = await storeValue.findLatestVerificationChallenge(
      channel,
      purpose,
      destination,
    );
    if (latest && latest.resendAt > new Date())
      return sendError(
        reply,
        429,
        'RESEND_COOLDOWN',
        'Please wait before requesting another code',
        {
          retryAfterSeconds: Math.ceil(
            (latest.resendAt.getTime() - Date.now()) / 1000,
          ),
        },
      );
    await storeValue.supersedeVerificationChallenges(
      channel,
      purpose,
      destination,
    );
    const id = randomUUID();
    const now = Date.now();
    const expiresAt = new Date(now + verificationTtl);
    const resendAt = new Date(now + resendCooldown);
    const code = String(randomInt(100000, 1000000));
    try {
      await provider.sendCode({ destination, code, expiresAt });
    } catch {
      return sendError(
        reply,
        503,
        'PROVIDER_ERROR',
        'Verification provider is temporarily unavailable',
      );
    }
    await storeValue.createVerificationChallenge({
      id,
      channel,
      purpose,
      destination,
      codeHash: hashCode(id, code),
      expiresAt,
      resendAt,
      attemptCount: 0,
      maxAttempts,
      consumedAt: null,
      state: 'ISSUED',
    });
    return reply.status(201).send({
      challengeId: id,
      channel,
      purpose,
      destination,
      expiresAt: expiresAt.toISOString(),
      resendAt: resendAt.toISOString(),
      attemptsRemaining: maxAttempts,
    });
  };
  app.post('/api/auth/verification/challenges', requestVerification);
  app.post('/api/auth/verification/request', requestVerification);

  const verifyChallenge = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const storeValue = authStore(reply);
    if (!storeValue) return;
    const challengeId = stringValue((request.params as { id?: unknown }).id);
    const body = asBody(request.body);
    const code = stringValue(body?.code);
    if (!challengeId || !code || !/^\d{4,8}$/.test(code))
      return sendError(
        reply,
        400,
        'INVALID_VERIFICATION',
        'Verification code is invalid or expired',
      );
    if (
      !(await rateLimit(
        request,
        reply,
        'verification:verify',
        challengeId,
        10,
        10 * 60 * 1000,
      ))
    )
      return;
    const challenge = await storeValue.findVerificationChallenge(challengeId);
    if (!challenge || challenge.state !== 'ISSUED')
      return sendError(
        reply,
        400,
        'INVALID_VERIFICATION',
        'Verification code is invalid or expired',
      );
    const expectedPurpose = stringValue(body?.purpose);
    const expectedDestination = stringValue(body?.destination);
    if (
      (expectedPurpose && expectedPurpose !== challenge.purpose) ||
      (expectedDestination && expectedDestination !== challenge.destination)
    )
      return sendError(
        reply,
        400,
        'INVALID_VERIFICATION',
        'Verification code is invalid or expired',
      );
    if (challenge.expiresAt <= new Date()) {
      challenge.state = 'EXPIRED';
      await storeValue.updateVerificationChallenge(challenge);
      return sendError(
        reply,
        400,
        'INVALID_VERIFICATION',
        'Verification code is invalid or expired',
      );
    }
    const supplied = Buffer.from(hashCode(challenge.id, code));
    const expected = Buffer.from(challenge.codeHash);
    const matches =
      supplied.length === expected.length &&
      timingSafeEqual(supplied, expected);
    if (!matches) {
      challenge.attemptCount += 1;
      if (challenge.attemptCount >= challenge.maxAttempts) {
        challenge.state = 'LOCKED_ATTEMPTS';
        challenge.consumedAt = new Date();
      }
      await storeValue.updateVerificationChallenge(challenge);
      return sendError(
        reply,
        400,
        'INVALID_VERIFICATION',
        'Verification code is invalid or expired',
      );
    }
    challenge.state = 'VERIFIED';
    await storeValue.updateVerificationChallenge(challenge);
    const grantId = randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await storeValue.createVerificationGrant({
      id: grantId,
      challengeId: challenge.id,
      purpose: challenge.purpose,
      destination: challenge.destination,
      expiresAt,
      consumedAt: null,
    });
    return reply.send({
      grantId,
      purpose: challenge.purpose,
      destination: challenge.destination,
      expiresAt: expiresAt.toISOString(),
    });
  };
  app.post('/api/auth/verification/challenges/:id/verify', verifyChallenge);
  app.post('/api/auth/verification/verify', async (request, reply) => {
    const body = asBody(request.body);
    const challengeId = stringValue(body?.challengeId);
    if (!challengeId)
      return sendError(
        reply,
        400,
        'INVALID_VERIFICATION',
        'Verification code is invalid or expired',
      );
    request.params = { id: challengeId };
    return verifyChallenge(request, reply);
  });

  const registerVerified = async (
    request: FastifyRequest,
    reply: FastifyReply,
    fixedType?: 'EMAIL' | 'PHONE',
  ) => {
    const storeValue = authStore(reply);
    if (!storeValue) return;
    const body = asBody(request.body);
    const grantId = stringValue(body?.grantId);
    const identifierType =
      fixedType ??
      (stringValue(body?.identifierType) as 'EMAIL' | 'PHONE' | null);
    const username = stringValue(body?.username);
    const name = stringValue(body?.displayName);
    const password = stringValue(body?.password);
    if (
      !body ||
      !keysOnly(
        body,
        new Set([
          'grantId',
          'identifierType',
          'username',
          'displayName',
          'password',
        ]),
      ) ||
      !grantId ||
      !identifierType ||
      !(['EMAIL', 'PHONE'] as const).includes(identifierType) ||
      !username ||
      !name ||
      !password ||
      !validPassword(password) ||
      !validUsername(normalizeUsername(username)) ||
      !validDisplayName(name)
    )
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Invalid verified registration data',
      );
    if (
      fixedType &&
      body?.identifierType !== undefined &&
      body.identifierType !== fixedType
    )
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Invalid verified registration data',
      );
    if (
      !(await rateLimit(
        request,
        reply,
        'registration:verified:grant',
        grantId,
        10,
        15 * 60 * 1000,
      ))
    )
      return;
    const grant = await storeValue.consumeVerificationGrant(grantId);
    if (!grant || grant.purpose !== 'REGISTER')
      return sendError(
        reply,
        400,
        'INVALID_VERIFICATION',
        'Verification grant is invalid or expired',
      );
    if (identifierType === 'EMAIL' && !validEmail(grant.destination))
      return sendError(
        reply,
        400,
        'INVALID_VERIFICATION',
        'Verification grant is invalid or expired',
      );
    if (identifierType === 'PHONE' && !normalizePhone(grant.destination))
      return sendError(
        reply,
        400,
        'INVALID_VERIFICATION',
        'Verification grant is invalid or expired',
      );
    if (
      !(await rateLimit(
        request,
        reply,
        'registration:verified',
        grant.destination,
        10,
        15 * 60 * 1000,
      ))
    )
      return;
    if (
      (await findDestinationIdentity(
        storeValue,
        identifierType,
        grant.destination,
      )) ||
      (identifierType === 'EMAIL' &&
        (await options.repository.findByIdentity(grant.destination)))
    )
      return sendError(
        reply,
        409,
        'DUPLICATE_IDENTITY',
        'Email or phone is already registered',
      );
    try {
      const result = await storeValue.createUserWithIdentity({
        username: normalizeUsername(username),
        email: identifierType === 'EMAIL' ? grant.destination : null,
        displayName: name,
        passwordHash: await hashPassword(password),
        passwordLoginEnabled: true,
        identity: {
          kind: identifierType,
          value: grant.destination,
        },
      });
      await issueSession(result.user.id, reply);
      await audit(
        undefined,
        'identity:verified_registration',
        'allowed',
        request.id,
        result.user.id,
      );
      return reply.status(201).send(publicUser(result.user));
    } catch (cause) {
      if (isDuplicate(cause))
        return sendError(
          reply,
          409,
          'DUPLICATE_IDENTITY',
          'Email or phone is already registered',
        );
      throw cause;
    }
  };
  app.post('/api/auth/register/verified', registerVerified);
  app.post('/api/auth/register/email', (request, reply) =>
    registerVerified(request, reply, 'EMAIL'),
  );
  app.post('/api/auth/register/phone', (request, reply) =>
    registerVerified(request, reply, 'PHONE'),
  );

  const passwordLogin = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const body = asBody(request.body);
    const type = stringValue(body?.identifierType) as 'EMAIL' | 'PHONE' | null;
    const rawIdentifier = stringValue(body?.identifier);
    const password = stringValue(body?.password);
    if (
      !body ||
      !keysOnly(body, new Set(['identifierType', 'identifier', 'password'])) ||
      !type ||
      !(['EMAIL', 'PHONE'] as const).includes(type) ||
      !rawIdentifier ||
      !password
    )
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid credentials');
    const identifier =
      type === 'EMAIL'
        ? normalizeEmail(rawIdentifier)
        : normalizeMainlandChinaPhone(rawIdentifier);
    if (!identifier || (type === 'EMAIL' && !validEmail(identifier)))
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid credentials');
    if (
      !(await rateLimit(
        request,
        reply,
        'login:password',
        identifier,
        10,
        10 * 60 * 1000,
      ))
    )
      return;
    const storeValue = store;
    const identity = storeValue
      ? await findDestinationIdentity(storeValue, type, identifier)
      : null;
    const found = identity
      ? await options.repository.findByIdentity(
          (await options.repository.findById(identity.userId))?.username ?? '',
        )
      : await options.repository.findByIdentity(identifier);
    const credentialMetadata = found
      ? describePasswordHash(found.passwordHash)
      : null;
    const verification = found
      ? await verifyPasswordDiagnostic(password, found.passwordHash)
      : null;
    app.log.info(
      {
        event: 'auth.password_login_diagnostic',
        requestId: request.id,
        identifierType: type,
        identifier: masked(identifier, type),
        normalized: true,
        userFound: Boolean(found),
        userId: found?.id,
        userStatus: found?.status,
        passwordLoginEnabled: found?.passwordLoginEnabled !== false,
        credentialPresent: Boolean(found?.passwordHash),
        credential: credentialMetadata,
        verifier: verification?.reason ?? 'not-run',
        database: productDatabaseName(),
      },
      'Password login diagnostic',
    );
    if (
      !found ||
      found.status !== 'active' ||
      found.passwordLoginEnabled === false ||
      !verification?.ok
    ) {
      await audit(undefined, 'identity:password_login', 'denied', request.id);
      return sendError(reply, 401, 'UNAUTHENTICATED', 'Invalid credentials');
    }
    if (storeValue && identity) {
      // last-used timestamps are intentionally not exposed; login remains server-authoritative.
      void identity;
    }
    await issueSession(found.id, reply);
    await audit(
      { userId: found.id, sessionId: 'new', strength: 'password' },
      'identity:password_login',
      'allowed',
      request.id,
      found.id,
    );
    return reply.send(publicUser(found));
  };
  app.post('/api/auth/login/password', passwordLogin);

  const codeLogin = async (request: FastifyRequest, reply: FastifyReply) => {
    const storeValue = authStore(reply);
    if (!storeValue) return;
    const body = asBody(request.body);
    const grantId = stringValue(body?.grantId);
    if (!body || !keysOnly(body, new Set(['grantId'])) || !grantId)
      return sendError(
        reply,
        400,
        'INVALID_VERIFICATION',
        'Verification grant is invalid or expired',
      );
    if (
      !(await rateLimit(
        request,
        reply,
        'login:code',
        grantId,
        10,
        10 * 60 * 1000,
      ))
    )
      return;
    const grant = await storeValue.consumeVerificationGrant(grantId);
    if (!grant || grant.purpose !== 'LOGIN_CODE')
      return sendError(
        reply,
        400,
        'INVALID_VERIFICATION',
        'Verification grant is invalid or expired',
      );
    const kind: 'EMAIL' | 'PHONE' = grant.destination.startsWith('+')
      ? 'PHONE'
      : 'EMAIL';
    const identity = await findDestinationIdentity(
      storeValue,
      kind,
      grant.destination,
    );
    if (identity) {
      const user = await options.repository.findById(identity.userId);
      if (!user || user.status !== 'active')
        return sendError(
          reply,
          401,
          'UNAUTHENTICATED',
          'Authentication required',
        );
      await issueSession(user.id, reply);
      await audit(
        { userId: user.id, sessionId: 'new', strength: 'password' },
        'identity:code_login',
        'allowed',
        request.id,
        user.id,
      );
      return reply.send(publicUser(user));
    }
    const continuationId = randomUUID();
    await storeValue.createContinuation({
      id: continuationId,
      kind: 'OTP',
      identity: { kind, value: grant.destination },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      consumedAt: null,
    });
    return sendError(
      reply,
      409,
      'ONBOARDING_REQUIRED',
      'Complete onboarding to finish sign-in',
      {
        continuationId,
        destination: grant.destination,
      },
    );
  };
  app.post('/api/auth/login/code', codeLogin);

  const onboarding = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = asBody(request.body);
    const continuationId =
      stringValue(body?.continuationId) ?? stringValue(body?.transactionId);
    const username = stringValue(body?.username);
    const name = stringValue(body?.displayName);
    const password = stringValue(body?.password);
    if (
      !body ||
      !keysOnly(
        body,
        new Set([
          'continuationId',
          'transactionId',
          'username',
          'displayName',
          'password',
        ]),
      ) ||
      !continuationId ||
      !username ||
      !name
    )
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Invalid onboarding data',
      );
    return completeContinuation(
      request,
      reply,
      continuationId,
      normalizeUsername(username),
      name,
      password ?? undefined,
    );
  };
  app.post('/api/auth/login/code/onboarding', onboarding);
  app.post('/api/auth/login/onboarding', onboarding);
  app.post('/api/auth/onboarding', onboarding);
  app.post('/api/auth/oauth/onboarding', onboarding);

  const oauthStart = async (
    request: FastifyRequest,
    reply: FastifyReply,
    fixedProvider?: AuthProvider,
    forcedMode?: 'LOGIN' | 'LINK',
  ) => {
    const provider =
      fixedProvider ??
      (stringValue(
        (request.params as { provider?: unknown }).provider,
      ) as AuthProvider | null);
    const body = asBody(request.body);
    const requestedReturnTo = safeReturnPath(
      stringValue(body?.returnTo) ?? '/',
    );
    const returnTo =
      requestedReturnTo && allowedReturnPaths.has(requestedReturnTo)
        ? requestedReturnTo
        : null;
    const mode =
      forcedMode ?? (stringValue(body?.mode) === 'link' ? 'LINK' : 'LOGIN');
    if (!provider || !providerSet.has(provider) || !returnTo)
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid OAuth request');
    const adapter = social[provider];
    if (providerDisabled(provider, process.env) || !adapter.isConfigured())
      return sendError(
        reply,
        503,
        'NOT_CONFIGURED',
        'Social provider is not configured',
      );
    let context: AuthContext | undefined;
    if (mode === 'LINK') {
      const current = await contextUser(request, reply);
      if (!current) return;
      context = current.context;
    }
    if (
      !(await rateLimit(
        request,
        reply,
        'oauth:start',
        provider,
        10,
        10 * 60 * 1000,
        { ...(context ? { context } : {}), provider },
      ))
    )
      return;
    const state = sessionToken();
    const codeVerifier = sessionToken();
    const nonce = sessionToken();
    const transaction: OAuthTransactionRecord = {
      id: randomUUID(),
      provider,
      stateHash: hashState(state),
      codeVerifier,
      nonce,
      returnTo,
      expiresAt: new Date(Date.now() + oauthTtl),
      consumedAt: null,
      userId: context?.userId ?? null,
      mode,
    };
    const storeValue = authStore(reply);
    if (!storeValue) return;
    await storeValue.createOAuthTransaction(transaction);
    const authorizationUrl = adapter.getAuthorizationUrl({
      state,
      codeVerifier,
      nonce,
      redirectUri: `${callbackBase}/api/auth/oauth/${provider}/callback`,
    });
    return reply.send({ authorizationUrl });
  };
  for (const provider of providers) {
    app.post(`/api/auth/oauth/${provider}/start`, (request, reply) =>
      oauthStart(request, reply, provider),
    );
    app.get(`/api/auth/oauth/${provider}/start`, (request, reply) =>
      oauthStart(request, reply, provider),
    );
    app.post(
      `/api/auth/account/identities/${provider}/start`,
      (request, reply) => oauthStart(request, reply, provider, 'LINK'),
    );
  }

  const oauthCallback = async (
    request: FastifyRequest,
    reply: FastifyReply,
    fixedProvider?: AuthProvider,
  ) => {
    const provider =
      fixedProvider ??
      (stringValue(
        (request.params as { provider?: unknown }).provider,
      ) as AuthProvider | null);
    const query = (request.query ?? {}) as Record<string, unknown>;
    const body = asBody(request.body);
    const state = stringValue(query.state) ?? stringValue(body?.state);
    const code = stringValue(query.code) ?? stringValue(body?.code);
    const providerError = stringValue(query.error) ?? stringValue(body?.error);
    if (!provider || !providerSet.has(provider) || !state)
      return sendError(
        reply,
        400,
        'INVALID_OAUTH',
        'OAuth transaction is invalid or expired',
      );
    const storeValue = authStore(reply);
    if (!storeValue) return;
    const requestContext = await options.getAuthContext(request);
    if (
      !(await rateLimit(
        request,
        reply,
        'oauth:callback',
        provider,
        10,
        10 * 60 * 1000,
        { ...(requestContext ? { context: requestContext } : {}), provider },
      ))
    )
      return;
    const transaction = await storeValue.consumeOAuthTransaction(
      provider,
      hashState(state),
    );
    if (!transaction)
      return sendError(
        reply,
        400,
        'INVALID_OAUTH',
        'OAuth transaction is invalid or expired',
      );
    if (providerError || !code)
      return reply.send({
        status: 'CANCELLED',
        returnTo: transaction.returnTo,
      });
    const adapter = social[provider];
    if (providerDisabled(provider, process.env) || !adapter.isConfigured())
      return sendError(
        reply,
        503,
        'NOT_CONFIGURED',
        'Social provider is not configured',
      );
    let identity: SocialIdentity;
    try {
      const token = await adapter.exchangeCode({
        code,
        codeVerifier: transaction.codeVerifier,
        nonce: transaction.nonce,
        redirectUri: `${callbackBase}/api/auth/oauth/${provider}/callback`,
      });
      identity = await adapter.fetchNormalizedIdentity(token);
      if (identity.provider !== provider || !identity.subject.trim())
        throw new Error('provider identity mismatch');
    } catch {
      return sendError(
        reply,
        502,
        'PROVIDER_ERROR',
        'Social provider could not complete sign-in',
      );
    }
    const bound = await storeValue.findIdentity({
      kind: 'PROVIDER',
      provider,
      subject: identity.subject,
    });
    if (transaction.mode === 'LINK') {
      if (!transaction.userId)
        return sendError(
          reply,
          401,
          'UNAUTHENTICATED',
          'Authentication required',
        );
      const current = await options.repository.findById(transaction.userId);
      if (!current || current.status !== 'active')
        return sendError(
          reply,
          401,
          'UNAUTHENTICATED',
          'Authentication required',
        );
      const context = await contextUser(request, reply);
      if (!context || context.user.id !== transaction.userId)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Identity linking is forbidden',
        );
      if (bound && bound.userId !== transaction.userId)
        return sendError(
          reply,
          409,
          'LINK_REQUIRED',
          'This provider is linked to another account',
        );
      if (!bound) {
        if (identity.email) {
          const emailIdentity = await storeValue.findIdentity({
            kind: 'EMAIL',
            value: normalizeEmail(identity.email),
          });
          if (emailIdentity && emailIdentity.userId !== transaction.userId)
            return sendError(
              reply,
              409,
              'LINK_REQUIRED',
              'Explicit account linking is required',
            );
          const legacyEmail = await options.repository.findByIdentity(
            normalizeEmail(identity.email),
          );
          if (legacyEmail && legacyEmail.id !== transaction.userId)
            return sendError(
              reply,
              409,
              'LINK_REQUIRED',
              'Explicit account linking is required',
            );
        }
        await storeValue.addIdentity({
          userId: transaction.userId,
          kind: 'PROVIDER',
          value: identity.subject,
          provider,
          subject: identity.subject,
          ...(identity.displayName
            ? { displayName: identity.displayName }
            : {}),
          ...(identity.avatarUrl ? { avatarUrl: identity.avatarUrl } : {}),
        });
      }
      await audit(
        context.context,
        'identity:link',
        'allowed',
        request.id,
        transaction.userId,
      );
      return reply.send({
        status: 'AUTHENTICATED',
        user: publicUser(current),
        returnTo: transaction.returnTo,
      });
    }
    if (bound) {
      const user = await options.repository.findById(bound.userId);
      if (!user || user.status !== 'active')
        return sendError(
          reply,
          401,
          'UNAUTHENTICATED',
          'Authentication required',
        );
      await issueSession(user.id, reply);
      await audit(
        { userId: user.id, sessionId: 'new', strength: 'password' },
        'identity:social_login',
        'allowed',
        request.id,
        user.id,
      );
      return reply.send({
        status: 'AUTHENTICATED',
        user: publicUser(user),
        returnTo: transaction.returnTo,
      });
    }
    if (
      identity.email &&
      ((await storeValue.findIdentity({
        kind: 'EMAIL',
        value: normalizeEmail(identity.email),
      })) ||
        (await options.repository.findByIdentity(
          normalizeEmail(identity.email),
        )))
    )
      return sendError(
        reply,
        409,
        'LINK_REQUIRED',
        'Explicit account linking is required',
      );
    const continuationId = randomUUID();
    await storeValue.createContinuation({
      id: continuationId,
      kind: 'OAUTH',
      identity: {
        kind: 'PROVIDER',
        value: identity.subject,
        provider,
        subject: identity.subject,
        ...(identity.displayName ? { displayName: identity.displayName } : {}),
        ...(identity.avatarUrl ? { avatarUrl: identity.avatarUrl } : {}),
        ...(identity.email ? { email: normalizeEmail(identity.email) } : {}),
        ...(identity.email
          ? { emailVerified: identity.emailVerified === true }
          : {}),
      },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      consumedAt: null,
    });
    return sendError(
      reply,
      409,
      'ONBOARDING_REQUIRED',
      'Complete onboarding to finish sign-in',
      {
        transactionId: continuationId,
        returnTo: transaction.returnTo,
      },
    );
  };
  for (const provider of providers)
    app.get(`/api/auth/oauth/${provider}/callback`, (request, reply) =>
      oauthCallback(request, reply, provider),
    );
  for (const provider of providers)
    app.post(`/api/auth/oauth/${provider}/callback`, (request, reply) =>
      oauthCallback(request, reply, provider),
    );

  app.post('/api/auth/account/identifiers', async (request, reply) => {
    const current = await contextUser(request, reply);
    if (!current) return;
    const storeValue = authStore(reply);
    if (!storeValue) return;
    const body = asBody(request.body);
    const grantId = stringValue(body?.grantId);
    const identifierType = stringValue(body?.identifierType) as
      'EMAIL' | 'PHONE' | null;
    if (
      !body ||
      !keysOnly(body, new Set(['grantId', 'identifierType'])) ||
      !grantId ||
      !identifierType ||
      !(['EMAIL', 'PHONE'] as const).includes(identifierType)
    )
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Invalid identifier link request',
      );
    const grant = await storeValue.consumeVerificationGrant(grantId);
    if (!grant || grant.purpose !== 'ADD_IDENTIFIER')
      return sendError(
        reply,
        400,
        'INVALID_VERIFICATION',
        'Verification grant is invalid or expired',
      );
    const kind: 'EMAIL' | 'PHONE' = grant.destination.startsWith('+')
      ? 'PHONE'
      : 'EMAIL';
    if (kind !== identifierType)
      return sendError(
        reply,
        400,
        'INVALID_VERIFICATION',
        'Verification grant is invalid or expired',
      );
    try {
      await storeValue.addIdentity({
        userId: current.user.id,
        kind,
        value: grant.destination,
      });
      await audit(
        current.context,
        'identity:add_identifier',
        'allowed',
        request.id,
        current.user.id,
      );
      const identifiers = await storeValue.listIdentifiers(current.user.id);
      const added = identifiers.find(
        (item) => item.kind === kind && item.value === grant.destination,
      );
      return reply
        .status(201)
        .send(identityProjection(added!, identifiers[0]?.id === added?.id));
    } catch (cause) {
      if (isDuplicate(cause))
        return sendError(
          reply,
          409,
          'DUPLICATE_IDENTITY',
          'Identity is already registered',
        );
      throw cause;
    }
  });
  app.get('/api/auth/account/identifiers', async (request, reply) => {
    const current = await contextUser(request, reply);
    if (!current) return;
    const storeValue = authStore(reply);
    if (!storeValue) return;
    return reply.send(
      (await storeValue.listIdentifiers(current.user.id)).map((item, index) =>
        identityProjection(item, index === 0),
      ),
    );
  });
  app.get('/api/auth/account/identities', async (request, reply) => {
    const current = await contextUser(request, reply);
    if (!current) return;
    const storeValue = authStore(reply);
    if (!storeValue) return;
    return reply.send(
      (await storeValue.listProviderIdentities(current.user.id)).map(
        providerProjection,
      ),
    );
  });
  app.delete(
    '/api/auth/account/identities/:provider',
    async (request, reply) => {
      const current = await contextUser(request, reply);
      if (!current) return;
      const storeValue = authStore(reply);
      if (!storeValue) return;
      const provider = stringValue(
        (request.params as { provider?: unknown }).provider,
      ) as AuthProvider | null;
      if (!provider || !providerSet.has(provider))
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid provider');
      const identity = (
        await storeValue.listProviderIdentities(current.user.id)
      ).find((item) => item.provider === provider);
      if (!identity)
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          'Connected identity not found',
        );
      if ((await storeValue.countLoginMethods(current.user.id)) <= 1)
        return sendError(
          reply,
          409,
          'LAST_LOGIN_METHOD',
          'At least one login method is required',
        );
      await storeValue.removeIdentity(current.user.id, identity.id);
      await audit(
        current.context,
        'identity:unlink',
        'allowed',
        request.id,
        identity.id,
      );
      return reply.status(204).send();
    },
  );
  app.delete('/api/auth/account/identifiers/:id', async (request, reply) => {
    const current = await contextUser(request, reply);
    if (!current) return;
    const storeValue = authStore(reply);
    if (!storeValue) return;
    const id = stringValue((request.params as { id?: unknown }).id);
    const identity = id
      ? (await storeValue.listIdentifiers(current.user.id)).find(
          (item) => item.id === id,
        )
      : null;
    if (!id || !identity)
      return sendError(reply, 404, 'NOT_FOUND', 'Identity not found');
    if (identity.kind === 'EMAIL' && identity.value === current.user.email)
      return sendError(
        reply,
        409,
        'LAST_LOGIN_METHOD',
        'Primary email cannot be removed',
      );
    if ((await storeValue.countLoginMethods(current.user.id)) <= 1)
      return sendError(
        reply,
        409,
        'LAST_LOGIN_METHOD',
        'At least one login method is required',
      );
    if (!(await storeValue.removeIdentity(current.user.id, id)))
      return sendError(reply, 404, 'NOT_FOUND', 'Identity not found');
    await audit(current.context, 'identity:unlink', 'allowed', request.id, id);
    return reply.status(204).send();
  });
  for (const provider of providers) {
    const link = async (request: FastifyRequest, reply: FastifyReply) => {
      const current = await contextUser(request, reply);
      if (!current) return;
      const body = asBody(request.body);
      const transactionId = stringValue(body?.transactionId);
      if (!transactionId)
        return sendError(
          reply,
          400,
          'VALIDATION_ERROR',
          'OAuth linking transaction is required',
        );
      const storeValue = authStore(reply);
      if (!storeValue) return;
      const continuation = await storeValue.consumeContinuation(transactionId);
      if (
        !continuation ||
        continuation.kind !== 'OAUTH' ||
        continuation.identity.provider !== provider
      )
        return sendError(
          reply,
          400,
          'INVALID_OAUTH',
          'OAuth linking transaction is invalid or expired',
        );
      if (continuation.linkUserId !== current.user.id)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Identity linking is forbidden',
        );
      await storeValue.addIdentity({
        userId: current.user.id,
        ...continuation.identity,
      });
      await audit(
        current.context,
        'identity:link',
        'allowed',
        request.id,
        current.user.id,
      );
      return reply.status(204).send();
    };
    app.post(`/api/auth/account/identities/${provider}/link`, link);
    app.post(`/api/auth/account/identities/${provider}`, link);
  }
}

const validDisplayName = (value: string) =>
  normalizeDisplayName(value) !== null;
const isDuplicate = (cause: unknown) =>
  typeof cause === 'object' &&
  cause !== null &&
  'code' in cause &&
  cause.code === '23505';
