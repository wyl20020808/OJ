/**
 * `@ojplatform/capability-broker` — the site-wide server capability seam.
 *
 * ```text
 * Site core modules (site.<module>)  ─┐
 * Plugins (plugin.<id>)               ─┼─▶ CapabilityClient ─▶ CapabilityBroker ─▶ capability providers (AI Bridge first)
 * Anonymous buckets (design only)     ─┘
 * ```
 *
 * Identity is host-bound (a client exists only because the host minted it), permissions are
 * deny-by-default, availability distinguishes `DISABLED` from `UNAVAILABLE`, and the host kill
 * switch applies everywhere. The broker is provider-neutral: AI is simply the first provider.
 */
export {
  callerKey,
  isPluginCallerId,
  isSiteCallerId,
  type CallerIdentity,
  type CallerType,
  type TrustedCallerContext,
} from './caller.js';

export { isCapabilityGranted } from './permission.js';

export {
  createSubjectTokenMinter,
  looksLikeSubjectToken,
  SUBJECT_TOKEN_ANONYMOUS_PREFIX,
  SUBJECT_TOKEN_USER_PREFIX,
  type SubjectStability,
  type SubjectTokenMinter,
} from './subject.js';

export {
  CapabilityBroker,
  type BoundCallerContext,
  type CapabilityAvailability,
  type CapabilityBrokerOptions,
  type CapabilityClient,
  type CapabilityDescriptor,
  type CapabilityErrorCode,
  type CapabilityError,
  type CapabilityInvocation,
  type CapabilityProvider,
  type CapabilityResult,
  type CapabilityUsage,
  type HostKillSwitchState,
  type SiteCallerRegistration,
} from './broker.js';
