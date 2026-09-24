/**
 * The site-wide capability broker (Stage 6).
 *
 * One generic seam through which **site core modules** and **plugins** consume server
 * capabilities. AI Bridge is the first capability provider; the broker is deliberately not
 * AI-shaped — a provider registers capability ids with versions, and callers execute them under
 * host-bound identity, permissions, subject and governance.
 *
 * What the broker owns:
 *
 *  - **Trusted caller identity.** Clients are minted only by the broker (`forPlugin`,
 *    `forSite`), from the host's own registration data. A client carries no caller-supplied
 *    identity, so spoofing another plugin or impersonating site core is impossible by
 *    construction, not by validation.
 *  - **Permissions.** Deny-by-default: a caller may execute a capability only when its grants
 *    (plugin manifest `consumesCapabilities`, or server-side site registration) cover it.
 *  - **Availability.** `AVAILABLE / DEGRADED / UNAVAILABLE / DISABLED`, with the host kill switch
 *    (`global / providers / capabilities`) applied on top of every provider's own status. A
 *    disabled capability is reported before any call is made.
 *  - **Timeout clamping.** A host limit can only narrow a caller's budget, never widen it.
 *
 * What the broker deliberately does **not** own: business logic, prompts, provider configuration,
 * secrets, persistence. Capability providers bring their own; the host wires them.
 */
import { parsePluginManifest, type PluginManifest } from '@ojplatform/plugin-sdk';
import { callerKey, isSiteCallerId, type TrustedCallerContext } from './caller.js';
import { isCapabilityGranted } from './permission.js';

export type CapabilityAvailability = 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE' | 'DISABLED';

export type CapabilityDescriptor = {
  readonly id: string;
  readonly version: string;
  readonly status: CapabilityAvailability;
  readonly providerId: string;
};

/** The closed error vocabulary a capability result may carry (call-shape mirror of AI Bridge's). */
export type CapabilityErrorCode =
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'PERMISSION_DENIED'
  | 'INVALID_REQUEST'
  | 'INVALID_RESPONSE'
  | 'SCHEMA_MISMATCH'
  | 'PROVIDER_ERROR'
  | 'MODEL_UNAVAILABLE'
  | 'CONTENT_BLOCKED'
  | 'CANCELLED'
  | 'INTERNAL';

export type CapabilityError = {
  readonly code: CapabilityErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly stage?: string;
  readonly reason?: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
};

export type CapabilityUsage = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCost?: { readonly value: number; readonly currency: string; readonly basis: string };
};

export type CapabilityResult<TOutput = unknown> = {
  readonly status: 'SUCCEEDED' | 'FAILED';
  readonly output?: TOutput;
  readonly error?: CapabilityError;
  readonly usage?: CapabilityUsage;
  readonly warnings?: readonly { readonly code: string }[];
  readonly providerMetadata?: Readonly<Record<string, string | number | boolean>>;
  readonly latencyMs?: number;
  readonly requestId?: string;
};

export type CapabilityInvocation = {
  /** Stable per logical turn (idempotency). Broker never mints this for the caller. */
  readonly idempotencyKey: string;
  readonly input: unknown;
  readonly profile?: string;
  readonly outputSchema?: unknown;
  readonly timeoutBudget?: { readonly totalMs?: number; readonly providerMs?: number };
  /** Host cancellation; providers translate it into their own outbound abort. */
  readonly signal?: AbortSignal;
  readonly metadata?: {
    readonly locale?: string;
    readonly traceId?: string;
    readonly surface?: string;
    readonly correlationId?: string;
  };
};

/** A trusted caller context with its composed key (`plugin.<id>` / `site.<id>`). */
export type BoundCallerContext = TrustedCallerContext & { readonly callerKey: string };

export type CapabilityProvider = {
  readonly providerId: string;
  /** The provider's canonical manifest (`providesCapabilities` must cover what it registers). */
  readonly manifest: PluginManifest;
  /** Provider-side availability, before the host kill switch is applied. */
  listCapabilities(): readonly { readonly id: string; readonly version: string; readonly status: CapabilityAvailability }[];
  execute(
    capability: string,
    version: string,
    invocation: CapabilityInvocation,
    caller: BoundCallerContext,
  ): Promise<CapabilityResult>;
  dispose?(): void;
};

export type SiteCallerRegistration = {
  readonly siteId: string;
  /** Capability references granted to this site module. Server-side only; never request input. */
  readonly capabilities: readonly string[];
  readonly description?: string;
};

export type HostKillSwitchState = {
  readonly global: boolean;
  readonly providers: readonly string[];
  readonly capabilities: readonly string[];
};

export type CapabilityClient = {
  /** The composed trusted caller key this client acts as. */
  readonly callerKey: string;
  readonly callerType: 'PLUGIN' | 'SITE';
  readonly callerId: string;
  readonly permissions: readonly string[];
  capabilityStatus(id: string): CapabilityAvailability;
  listCapabilities(): readonly CapabilityDescriptor[];
  execute(capability: string, version: string, invocation: CapabilityInvocation): Promise<CapabilityResult>;
  /** A derived client acting on behalf of one opaque subject (per-subject governance). */
  withSubject(subjectToken: string): CapabilityClient;
};

export type CapabilityBrokerOptions = {
  /** Host-level ceiling. Clamps every caller budget **down**, never up. */
  readonly maxTimeoutMs?: number;
};

const EMPTY_SWITCH: HostKillSwitchState = { global: false, providers: [], capabilities: [] };

function denial(message: string, reason: string, code: CapabilityErrorCode = 'PERMISSION_DENIED'): CapabilityResult<never> {
  return {
    status: 'FAILED',
    error: { code, message, retryable: false, stage: 'PERMISSION', reason },
  };
}

function unavailable(message: string, reason: string): CapabilityResult<never> {
  return {
    status: 'FAILED',
    error: { code: 'UNAVAILABLE', message, retryable: false, stage: 'ROUTING', reason },
  };
}

type Registration = {
  readonly provider: CapabilityProvider;
  /** capability id → declared version. */
  readonly capabilities: ReadonlyMap<string, string>;
};

export class CapabilityBroker {
  readonly #providers = new Map<string, Registration>();
  readonly #siteCallers = new Map<string, SiteCallerRegistration>();
  readonly #maxTimeoutMs: number | undefined;
  #killSwitch: HostKillSwitchState = EMPTY_SWITCH;
  #disposed = false;

  constructor(options: CapabilityBrokerOptions = {}) {
    this.#maxTimeoutMs = options.maxTimeoutMs;
  }

  /** Register a capability provider. Duplicate capability ids are rejected, not merged. */
  registerProvider(provider: CapabilityProvider): void {
    if (this.#providers.has(provider.providerId)) {
      throw new Error(`a capability provider is already registered as "${provider.providerId}"`);
    }
    const declared = provider.manifest.providesCapabilities;
    const listed = provider.listCapabilities();
    const capabilities = new Map<string, string>();
    for (const entry of listed) {
      const declaredForProvider = declared.some(
        (ref) => ref === entry.id || ref.startsWith(`${entry.id}@`),
      );
      if (!declaredForProvider) {
        throw new Error(
          `provider "${provider.providerId}" lists capability "${entry.id}" but its manifest does not declare providing it`,
        );
      }
      const existing = this.#findByCapability(entry.id);
      if (existing !== null) {
        throw new Error(
          `capability "${entry.id}" is already provided by "${existing.provider.providerId}"`,
        );
      }
      capabilities.set(entry.id, entry.version);
    }
    this.#providers.set(provider.providerId, { provider, capabilities });
  }

  unregisterProvider(providerId: string): boolean {
    const registration = this.#providers.get(providerId);
    if (registration === undefined) {
      return false;
    }
    this.#providers.delete(providerId);
    registration.provider.dispose?.();
    return true;
  }

  listProviders(): readonly string[] {
    return [...this.#providers.keys()].sort();
  }

  /** Register a first-party site module as a capability consumer. Server-side wiring only. */
  registerSiteCaller(registration: SiteCallerRegistration): void {
    if (!isSiteCallerId(registration.siteId)) {
      throw new Error(`invalid site caller id "${registration.siteId}"`);
    }
    if (this.#siteCallers.has(registration.siteId)) {
      throw new Error(`a site caller is already registered as "${registration.siteId}"`);
    }
    this.#siteCallers.set(registration.siteId, registration);
  }

  siteCallerIds(): readonly string[] {
    return [...this.#siteCallers.keys()].sort();
  }

  /**
   * A client bound to one first-party site module. `null` when the module was never registered
   * server-side — an unregistered site module consumes nothing.
   */
  forSite(siteId: string): CapabilityClient | null {
    const registration = this.#siteCallers.get(siteId);
    if (registration === undefined) {
      return null;
    }
    return this.#makeClient('SITE', siteId, [...registration.capabilities]);
  }

  /**
   * A client bound to one loaded plugin's manifest identity. Grants are exactly the manifest's
   * `consumesCapabilities` — the plugin cannot widen them at call time. `null` when the manifest
   * does not parse or declares no consumed capabilities.
   */
  forPlugin(manifestInput: unknown): CapabilityClient | null {
    const manifest = parsePluginManifest(manifestInput);
    if (manifest === null) {
      return null;
    }
    return this.#makeClient('PLUGIN', manifest.id, [...manifest.consumesCapabilities]);
  }

  /** The host kill switch. Applied on top of provider-side status, everywhere. */
  setKillSwitch(state: HostKillSwitchState): void {
    this.#killSwitch = {
      global: state.global,
      providers: [...state.providers],
      capabilities: [...state.capabilities],
    };
  }

  getKillSwitch(): HostKillSwitchState {
    return { ...this.#killSwitch, providers: [...this.#killSwitch.providers], capabilities: [...this.#killSwitch.capabilities] };
  }

  /** Governance-resolved status of one capability. `DISABLED` (switched off) beats everything. */
  getCapabilityStatus(id: string): CapabilityAvailability {
    if (this.#killSwitch.global) {
      return 'DISABLED';
    }
    if (this.#killSwitch.capabilities.includes(id)) {
      return 'DISABLED';
    }
    const registration = this.#findByCapability(id);
    if (registration === null) {
      return 'UNAVAILABLE';
    }
    if (this.#killSwitch.providers.includes(registration.provider.providerId)) {
      return 'DISABLED';
    }
    const listed = registration.provider.listCapabilities().find((entry) => entry.id === id);
    if (listed === undefined) {
      return 'UNAVAILABLE';
    }
    return listed.status === 'DISABLED' ? 'DISABLED' : listed.status;
  }

  listAvailableCapabilities(): readonly CapabilityDescriptor[] {
    const descriptors: CapabilityDescriptor[] = [];
    for (const [providerId, registration] of this.#providers) {
      for (const entry of registration.provider.listCapabilities()) {
        descriptors.push({
          id: entry.id,
          version: entry.version,
          status: this.getCapabilityStatus(entry.id),
          providerId,
        });
      }
    }
    return descriptors.sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Resolve a capability reference to its provider and declared version. */
  resolveCapability(id: string): { readonly provider: CapabilityProvider; readonly version: string } | null {
    const registration = this.#findByCapability(id);
    if (registration === null) {
      return null;
    }
    const version = registration.capabilities.get(id);
    return version === undefined ? null : { provider: registration.provider, version };
  }

  dispose(): void {
    this.#disposed = true;
    for (const registration of this.#providers.values()) {
      registration.provider.dispose?.();
    }
    this.#providers.clear();
  }

  #findByCapability(id: string): Registration | null {
    for (const registration of this.#providers.values()) {
      if (registration.capabilities.has(id)) {
        return registration;
      }
    }
    return null;
  }

  #makeClient(callerType: 'PLUGIN' | 'SITE', callerId: string, permissions: readonly string[], subjectToken?: string): CapabilityClient {
    const key = callerKey({ callerType, callerId });
    const broker = this;
    const context = (): BoundCallerContext => ({
      callerType,
      callerId,
      permissions: [...permissions],
      ...(subjectToken === undefined ? {} : { subjectToken }),
      callerKey: key,
    });
    return {
      callerKey: key,
      callerType,
      callerId,
      permissions: [...permissions],
      capabilityStatus: (id: string, version?: string) => broker.getCapabilityStatus(id, version),
      listCapabilities: () => broker.listAvailableCapabilities(),
      execute: (capability: string, version: string, invocation: CapabilityInvocation) =>
        broker.#execute(context(), capability, version, invocation),
      withSubject: (token: string) => {
        if (token.length === 0) {
          throw new Error('subject token must be a non-empty opaque token');
        }
        return broker.#makeClient(callerType, callerId, permissions, token);
      },
    };
  }

  async #execute(
    caller: BoundCallerContext,
    capability: string,
    version: string,
    invocation: CapabilityInvocation,
  ): Promise<CapabilityResult> {
    if (this.#disposed) {
      return unavailable('This capability broker has been disposed.', 'BROKER_DISPOSED');
    }
    if (this.#killSwitch.global) {
      return unavailable('Capabilities are disabled by the operator for this deployment.', 'KILL_SWITCH_GLOBAL');
    }
    if (this.#killSwitch.capabilities.includes(capability)) {
      return unavailable('This capability is switched off by the operator.', 'KILL_SWITCH_CAPABILITY');
    }
    const registration = this.#findByCapability(capability);
    if (registration === null) {
      return unavailable(`No provider offers the capability "${capability}".`, 'CAPABILITY_UNKNOWN');
    }
    if (this.#killSwitch.providers.includes(registration.provider.providerId)) {
      return unavailable('Every provider that could serve this capability is switched off.', 'KILL_SWITCH_PROVIDER');
    }
    if (!isCapabilityGranted(caller.permissions, capability, version)) {
      return denial(
        `"${caller.callerKey}" has not been granted the capability "${capability}".`,
        'CALLER_NOT_PERMITTED',
      );
    }
    const clamped = this.#clamp(invocation);
    return registration.provider.execute(capability, version, clamped, caller);
  }

  /** Host deadline: clamp **down** only. A caller's shorter budget is never widened. */
  #clamp(invocation: CapabilityInvocation): CapabilityInvocation {
    const max = this.#maxTimeoutMs;
    if (max === undefined || invocation.timeoutBudget === undefined) {
      return invocation;
    }
    const budget = invocation.timeoutBudget;
    const total = budget.totalMs === undefined ? max : Math.min(budget.totalMs, max);
    const provider = budget.providerMs === undefined ? undefined : Math.min(budget.providerMs, total);
    return { ...invocation, timeoutBudget: { totalMs: total, ...(provider === undefined ? {} : { providerMs: provider }) } };
  }
}
