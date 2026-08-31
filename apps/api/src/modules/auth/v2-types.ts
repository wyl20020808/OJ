import type { User } from '../user/model.js';

export type AuthProvider = 'wechat' | 'qq' | 'google' | 'github';
export type IdentityKind = 'EMAIL' | 'PHONE' | 'PROVIDER';
export type VerificationChannel = 'EMAIL' | 'SMS';
export type VerificationPurpose = 'REGISTER' | 'LOGIN_CODE' | 'ADD_IDENTIFIER';

export type AuthIdentity = {
  id: string;
  userId: string;
  kind: IdentityKind;
  value: string;
  provider?: AuthProvider;
  subject?: string;
  displayName?: string;
  avatarUrl?: string;
  verifiedAt: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type VerificationChallengeRecord = {
  id: string;
  channel: VerificationChannel;
  purpose: VerificationPurpose;
  destination: string;
  codeHash: string;
  expiresAt: Date;
  resendAt: Date;
  attemptCount: number;
  maxAttempts: number;
  consumedAt: Date | null;
  state:
    | 'ISSUED'
    | 'VERIFIED'
    | 'CONSUMED'
    | 'EXPIRED'
    | 'LOCKED_ATTEMPTS'
    | 'SUPERSEDED';
};

export type VerificationGrantRecord = {
  id: string;
  challengeId: string;
  purpose: VerificationPurpose;
  destination: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type AuthOnboardingContinuation = {
  id: string;
  kind: 'OTP' | 'OAUTH';
  identity: {
    kind: IdentityKind;
    value: string;
    provider?: AuthProvider;
    subject?: string;
    displayName?: string;
    avatarUrl?: string;
    email?: string;
    emailVerified?: boolean;
  };
  expiresAt: Date;
  consumedAt: Date | null;
  linkUserId?: string;
};

export type OAuthTransactionRecord = {
  id: string;
  provider: AuthProvider;
  stateHash: string;
  codeVerifier: string;
  nonce: string;
  returnTo: string;
  expiresAt: Date;
  consumedAt: Date | null;
  userId: string | null;
  mode: 'LOGIN' | 'LINK';
};

export type SocialIdentity = {
  provider: AuthProvider;
  subject: string;
  displayName?: string;
  avatarUrl?: string;
  email?: string;
  emailVerified?: boolean;
};

export type AuthV2Repository = {
  findIdentity(input: {
    kind: IdentityKind;
    value?: string;
    provider?: AuthProvider;
    subject?: string;
  }): Promise<AuthIdentity | null>;
  listIdentifiers(userId: string): Promise<AuthIdentity[]>;
  listProviderIdentities(userId: string): Promise<AuthIdentity[]>;
  createUserWithIdentity(input: {
    username: string;
    email: string | null;
    displayName: string;
    passwordHash: string;
    passwordLoginEnabled: boolean;
    identity: {
      kind: IdentityKind;
      value: string;
      provider?: AuthProvider;
      subject?: string;
      displayName?: string;
      avatarUrl?: string;
    };
  }): Promise<{ user: User; identity: AuthIdentity }>;
  addIdentity(input: {
    userId: string;
    kind: IdentityKind;
    value: string;
    provider?: AuthProvider;
    subject?: string;
    displayName?: string;
    avatarUrl?: string;
  }): Promise<AuthIdentity>;
  removeIdentity(userId: string, identityId: string): Promise<boolean>;
  countLoginMethods(userId: string): Promise<number>;
  createVerificationChallenge(
    record: VerificationChallengeRecord,
  ): Promise<void>;
  findVerificationChallenge(
    id: string,
  ): Promise<VerificationChallengeRecord | null>;
  supersedeVerificationChallenges(
    channel: VerificationChannel,
    purpose: VerificationPurpose,
    destination: string,
  ): Promise<void>;
  findLatestVerificationChallenge(
    channel: VerificationChannel,
    purpose: VerificationPurpose,
    destination: string,
  ): Promise<VerificationChallengeRecord | null>;
  updateVerificationChallenge(
    record: VerificationChallengeRecord,
  ): Promise<void>;
  createVerificationGrant(record: VerificationGrantRecord): Promise<void>;
  consumeVerificationGrant(id: string): Promise<VerificationGrantRecord | null>;
  createContinuation(record: AuthOnboardingContinuation): Promise<void>;
  consumeContinuation(id: string): Promise<AuthOnboardingContinuation | null>;
  createOAuthTransaction(record: OAuthTransactionRecord): Promise<void>;
  consumeOAuthTransaction(
    provider: AuthProvider,
    stateHash: string,
  ): Promise<OAuthTransactionRecord | null>;
};

export type AuthMethods = {
  registration: { email: boolean; phone: boolean };
  login: {
    emailPassword: boolean;
    phonePassword: boolean;
    emailCode: boolean;
    phoneCode: boolean;
  };
  providers: Record<AuthProvider, 'enabled' | 'disabled' | 'not_configured'>;
  passwordPolicy: { minLength: number };
};

export type VerificationChallengeResponse = {
  challengeId: string;
  channel: VerificationChannel;
  purpose: VerificationPurpose;
  destination: string;
  expiresAt: string;
  resendAt: string;
  attemptsRemaining: number;
};

export type VerificationGrantResponse = {
  grantId: string;
  purpose: VerificationPurpose;
  destination: string;
  expiresAt: string;
};

export type AuthProviderAdapter = {
  provider: AuthProvider;
  isConfigured: () => boolean;
  getAuthorizationUrl: (input: {
    state: string;
    codeVerifier: string;
    nonce: string;
    redirectUri: string;
  }) => string;
  exchangeCode: (input: {
    code: string;
    codeVerifier: string;
    nonce: string;
    redirectUri: string;
  }) => Promise<unknown>;
  fetchNormalizedIdentity: (token: unknown) => Promise<SocialIdentity>;
};

export type MessageProvider = {
  channel: VerificationChannel;
  isConfigured: () => boolean;
  sendCode: (input: {
    destination: string;
    code: string;
    expiresAt: Date;
  }) => Promise<void>;
};

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export type RateLimiter = {
  check: (input: {
    scope: string;
    subject: string;
    limit: number;
    windowMs: number;
  }) => Promise<RateLimitDecision>;
};
