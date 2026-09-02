import { randomUUID } from 'node:crypto';
import type { User } from '../user/model.js';
import type {
  AuthIdentity,
  AuthOnboardingContinuation,
  AuthProvider,
  AuthV2Repository,
  IdentityKind,
  OAuthTransactionRecord,
  VerificationChallengeRecord,
  VerificationGrantRecord,
} from './v2-types.js';

type StoredUser = User & {
  passwordHash: string;
  passwordLoginEnabled?: boolean;
};

const normalize = (value: string) =>
  value.normalize('NFKC').trim().toLowerCase();

export function createMemoryAuthV2Repository(
  users: Map<string, StoredUser>,
): AuthV2Repository {
  const identities = new Map<string, AuthIdentity>();
  const challenges = new Map<string, VerificationChallengeRecord>();
  const grants = new Map<string, VerificationGrantRecord>();
  const continuations = new Map<string, AuthOnboardingContinuation>();
  const oauthTransactions = new Map<string, OAuthTransactionRecord>();

  const values = () => [...identities.values()];
  const identityMatches = (
    identity: AuthIdentity,
    input: {
      kind: IdentityKind;
      value?: string;
      provider?: AuthProvider;
      subject?: string;
    },
  ) =>
    identity.kind === input.kind &&
    (input.kind === 'PROVIDER'
      ? identity.provider === input.provider &&
        identity.subject === input.subject
      : identity.value === input.value);

  return {
    async findIdentity(input) {
      return values().find((item) => identityMatches(item, input)) ?? null;
    },
    async listIdentifiers(userId) {
      return values().filter(
        (item) => item.userId === userId && item.kind !== 'PROVIDER',
      );
    },
    async listProviderIdentities(userId) {
      return values().filter(
        (item) => item.userId === userId && item.kind === 'PROVIDER',
      );
    },
    async createUserWithIdentity(input) {
      const identityValue =
        input.identity.kind === 'PROVIDER'
          ? input.identity.value
          : normalize(input.identity.value);
      const existing = values().find((item) =>
        identityMatches(item, {
          kind: input.identity.kind,
          value: identityValue,
          ...(input.identity.provider
            ? { provider: input.identity.provider }
            : {}),
          ...(input.identity.subject
            ? { subject: input.identity.subject }
            : {}),
        }),
      );
      if (
        existing ||
        [...users.values()].some(
          (item) =>
            normalize(item.username) === normalize(input.username) ||
            (input.email &&
              item.email &&
              normalize(item.email) === normalize(input.email)),
        )
      )
        throw Object.assign(new Error('duplicate identity'), { code: '23505' });
      const now = new Date().toISOString();
      const user: StoredUser = {
        id: randomUUID(),
        username: normalize(input.username),
        email: input.email ?? '',
        displayName: input.displayName,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        passwordHash: input.passwordHash,
        passwordLoginEnabled: input.passwordLoginEnabled,
      };
      users.set(user.id, user);
      const identity: AuthIdentity = {
        id: randomUUID(),
        userId: user.id,
        kind: input.identity.kind,
        value: identityValue,
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
        verifiedAt: now,
        createdAt: now,
        lastUsedAt: null,
      };
      identities.set(identity.id, identity);
      return { user, identity };
    },
    async addIdentity(input) {
      const value =
        input.kind === 'PROVIDER' ? input.value : normalize(input.value);
      const existing = values().find((item) =>
        identityMatches(item, {
          kind: input.kind,
          value,
          ...(input.provider ? { provider: input.provider } : {}),
          ...(input.subject ? { subject: input.subject } : {}),
        }),
      );
      if (existing) {
        if (existing.userId === input.userId) return existing;
        throw Object.assign(new Error('duplicate identity'), { code: '23505' });
      }
      const now = new Date().toISOString();
      const identity: AuthIdentity = {
        id: randomUUID(),
        userId: input.userId,
        kind: input.kind,
        value,
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.subject ? { subject: input.subject } : {}),
        ...(input.displayName ? { displayName: input.displayName } : {}),
        ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
        verifiedAt: now,
        createdAt: now,
        lastUsedAt: null,
      };
      identities.set(identity.id, identity);
      return identity;
    },
    async removeIdentity(userId, identityId) {
      const item = identities.get(identityId);
      if (!item || item.userId !== userId) return false;
      identities.delete(identityId);
      return true;
    },
    async countLoginMethods(userId) {
      const user = users.get(userId);
      const password = user?.passwordLoginEnabled === false ? 0 : 1;
      return (
        password + values().filter((item) => item.userId === userId).length
      );
    },
    async createVerificationChallenge(record) {
      challenges.set(record.id, { ...record });
    },
    async findVerificationChallenge(id) {
      const item = challenges.get(id);
      return item ? { ...item } : null;
    },
    async supersedeVerificationChallenges(channel, purpose, destination) {
      for (const item of challenges.values()) {
        if (
          item.channel === channel &&
          item.purpose === purpose &&
          item.destination === destination &&
          (item.state === 'ISSUED' || item.state === 'VERIFIED')
        ) {
          item.state = 'SUPERSEDED';
          item.consumedAt = new Date();
          for (const grant of grants.values())
            if (grant.challengeId === item.id && !grant.consumedAt)
              grant.consumedAt = new Date();
        }
      }
    },
    async findLatestVerificationChallenge(channel, purpose, destination) {
      const matches = [...challenges.values()].filter(
        (item) =>
          item.channel === channel &&
          item.purpose === purpose &&
          item.destination === destination &&
          (item.state === 'ISSUED' || item.state === 'VERIFIED'),
      );
      return matches.length ? { ...matches[matches.length - 1]! } : null;
    },
    async updateVerificationChallenge(record) {
      challenges.set(record.id, { ...record });
    },
    async createVerificationGrant(record) {
      grants.set(record.id, { ...record });
    },
    async consumeVerificationGrant(id) {
      const item = grants.get(id);
      if (!item || item.consumedAt || item.expiresAt <= new Date()) return null;
      item.consumedAt = new Date();
      grants.set(id, item);
      return { ...item };
    },
    async createContinuation(record) {
      continuations.set(record.id, { ...record });
    },
    async consumeContinuation(id) {
      const item = continuations.get(id);
      if (!item || item.consumedAt || item.expiresAt <= new Date()) return null;
      item.consumedAt = new Date();
      continuations.set(id, item);
      return { ...item };
    },
    async createOAuthTransaction(record) {
      oauthTransactions.set(record.id, { ...record });
    },
    async consumeOAuthTransaction(provider, stateHash) {
      const item = [...oauthTransactions.values()].find(
        (candidate) =>
          candidate.provider === provider &&
          candidate.stateHash === stateHash &&
          !candidate.consumedAt,
      );
      if (!item || item.expiresAt <= new Date()) return null;
      item.consumedAt = new Date();
      oauthTransactions.set(item.id, item);
      return { ...item };
    },
  };
}
