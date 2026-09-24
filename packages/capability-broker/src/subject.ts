/**
 * Opaque subject tokens (per-subject governance without identity exposure).
 *
 * AI-style capability governance needs a per-user dimension, but a capability provider must never
 * see an email, a username, a raw session token or a cookie. This module mints **stable,
 * server-derived, pseudonymous** subject tokens:
 *
 *  - `ojs1_<base64url(HMAC-SHA256(secret, "oj-subject:v1:" + userId))>` for authenticated users;
 *  - `oja1_<base64url(HMAC-SHA256(secret, "oj-anon:v1:" + bucket))>` for anonymous buckets —
 *    a **separate namespace**, so anonymous demand can never hide inside the user namespace and
 *    every anonymous bucket is its own rate/quota subject.
 *
 * Properties, by construction:
 *
 *  - Not reversible without the server secret; not a weak encoding of the user id.
 *  - Stable across restarts and instances (same secret ⇒ same token), so quotas and ledgers
 *    aggregate correctly.
 *  - Namespace-tagged: a user token can never be replayed as an anonymous token or vice versa.
 *  - Shaped to be opaque downstream (no `@`, no JWT structure, plain base64url characters).
 *
 * The secret comes from the host's secret surface (`OJPLATFORM_AI_SUBJECT_HMAC_KEY`). When absent,
 * the host must construct the minter with `stability: 'PROCESS_LOCAL'` semantics — an ephemeral
 * per-process key — and report subject stability as degraded; that mode exists so a fresh install
 * without AI configuration still boots, not so production can skip the key.
 */
import { createHmac, randomBytes } from 'node:crypto';

export const SUBJECT_TOKEN_USER_PREFIX = 'ojs1_';
export const SUBJECT_TOKEN_ANONYMOUS_PREFIX = 'oja1_';
const USER_DOMAIN = 'oj-subject:v1:';
const ANONYMOUS_DOMAIN = 'oj-anon:v1:';

export type SubjectStability = 'STABLE' | 'PROCESS_LOCAL';

export type SubjectTokenMinter = {
  /** Stable pseudonymous token for one authenticated user id. */
  mintForUser(userId: string): string;
  /**
   * Stable token for one anonymous bucket key (a guest identity, a device bucket — host's choice).
   * Separate namespace from users by construction.
   */
  mintAnonymous(bucket: string): string;
  /** Whether tokens survive a process restart (see the module note). */
  readonly stability: SubjectStability;
};

function base64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function hmac(secret: string, domain: string, value: string): string {
  return base64url(
    createHmac('sha256', secret).update(`${domain}${value}`).digest(),
  );
}

export function createSubjectTokenMinter(
  options: { readonly secret?: string } = {},
): SubjectTokenMinter {
  const secret = options.secret ?? randomBytes(32).toString('base64url');
  const stability: SubjectStability =
    options.secret === undefined ? 'PROCESS_LOCAL' : 'STABLE';
  return {
    mintForUser(userId: string): string {
      return `${SUBJECT_TOKEN_USER_PREFIX}${hmac(secret, USER_DOMAIN, userId)}`;
    },
    mintAnonymous(bucket: string): string {
      return `${SUBJECT_TOKEN_ANONYMOUS_PREFIX}${hmac(secret, ANONYMOUS_DOMAIN, bucket)}`;
    },
    stability,
  };
}

/** True when a value is shaped like one of our subject tokens (loose structural check). */
export function looksLikeSubjectToken(value: string): boolean {
  return (
    (value.startsWith(SUBJECT_TOKEN_USER_PREFIX) ||
      value.startsWith(SUBJECT_TOKEN_ANONYMOUS_PREFIX)) &&
    value.length > 16 &&
    value.length <= 128
  );
}
