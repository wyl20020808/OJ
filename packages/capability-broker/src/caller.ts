/**
 * Trusted caller identity (site-wide capability governance).
 *
 * A caller is whoever the **host runtime** says it is — never a value the request body carries.
 * There are exactly two namespaces:
 *
 *  - `PLUGIN` — a loaded plugin, bound from its parsed manifest identity by the host's plugin
 *    capability runtime. A plugin cannot choose its id.
 *  - `SITE` — a first-party server module of OJPlatform itself, registered server-side at wiring
 *    time (`site.problem`, `site.submission`, …). Site callers are deliberately **not** lumped
 *    into one `site.global` identity: per-caller rate limits, quotas and usage attribution would
 *    otherwise be meaningless.
 *
 * The composed key (`plugin.<id>` / `site.<id>`) is what downstream capability providers receive
 * as the trusted caller id. Namespace prefixes make a plugin and a site module with the same local
 * name impossible to confuse, and make cross-namespace spoofing structurally impossible: a plugin
 * caller's key always begins with `plugin.` and that prefix is added by the host, never taken from
 * caller input.
 */

export type CallerType = 'PLUGIN' | 'SITE';

export const SITE_CALLER_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;
export const PLUGIN_CALLER_PATTERN = /^[a-z][a-z0-9._-]{1,127}$/;

/** The identity half of a trusted caller (permissions and subject travel separately). */
export type CallerIdentity = {
  readonly callerType: CallerType;
  readonly callerId: string;
};

/** Who is calling, what they may call, and on whose behalf — all host-bound. */
export type TrustedCallerContext = {
  readonly callerType: CallerType;
  readonly callerId: string;
  /** Capability references granted to this caller. Deny by default. */
  readonly permissions: readonly string[];
  /** Opaque, host-minted subject token (per-user / per-subject governance). */
  readonly subjectToken?: string;
  /** The host's request id, for correlation. */
  readonly requestId?: string;
  /** Opaque trace id, for the operator channel. */
  readonly traceId?: string;
};

/** The composed, collision-free trusted caller id (`plugin.<id>` / `site.<id>`). */
export function callerKey(identity: CallerIdentity): string {
  return identity.callerType === 'PLUGIN'
    ? `plugin.${identity.callerId}`
    : `site.${identity.callerId}`;
}

export function isSiteCallerId(value: string): boolean {
  return SITE_CALLER_PATTERN.test(value);
}

export function isPluginCallerId(value: string): boolean {
  return PLUGIN_CALLER_PATTERN.test(value);
}
