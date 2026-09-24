/**
 * The site-core AI client (`SiteAiClient`).
 *
 * The only surface OJPlatform site modules use to consume AI capabilities. It is a thin,
 * honest wrapper over the capability broker: identity comes from the broker's registration
 * (never from call arguments), subjects are opaque host-minted tokens, and every call carries a
 * caller-scoped idempotency key the caller itself must supply — one logical turn is one billable
 * call, and the client refuses to pretend otherwise.
 *
 * Stage 6 wires the identity namespaces and governance; no business route consumes this yet.
 */
import type {
  CapabilityAvailability,
  CapabilityBroker,
  CapabilityInvocation,
  CapabilityResult,
} from '@ojplatform/capability-broker';

export const AI_TEXT_GENERATE = 'ai.text.generate';
export const AI_STRUCTURED_GENERATE = 'ai.structured.generate';
export const AI_CAPABILITY_V1 = '1.0';

export type SiteAiCall = {
  /** Caller-chosen, stable per logical turn. Required — never minted for the caller. */
  readonly idempotencyKey: string;
  /** The capability-owned input shape. */
  readonly input: unknown;
  /** Opaque subject token (per-subject rate/quota/ledger attribution). */
  readonly subjectToken?: string;
  readonly profile?: string;
  readonly outputSchema?: unknown;
  readonly timeoutBudget?: {
    readonly totalMs?: number;
    readonly providerMs?: number;
  };
  readonly signal?: AbortSignal;
  readonly metadata?: CapabilityInvocation['metadata'];
};

export type SiteAiClient = {
  /** The site caller id this client acts as (broker-bound). */
  readonly siteId: string;
  /** The composed trusted caller key (`site.<id>`). */
  readonly callerKey: string;
  capabilityStatus(capability: string): CapabilityAvailability;
  generateText(call: SiteAiCall): Promise<CapabilityResult>;
  generateStructured(call: SiteAiCall): Promise<CapabilityResult>;
};

/** Mint the site-core client for a registered site caller, or `null` when unregistered. */
export function createSiteAiClient(
  broker: CapabilityBroker,
  siteId: string,
): SiteAiClient | null {
  const base = broker.forSite(siteId);
  if (base === null) {
    return null;
  }
  const invoke = (
    capability: string,
    call: SiteAiCall,
  ): Promise<CapabilityResult> => {
    const client =
      call.subjectToken === undefined
        ? base
        : base.withSubject(call.subjectToken);
    return client.execute(capability, AI_CAPABILITY_V1, {
      idempotencyKey: call.idempotencyKey,
      input: call.input,
      ...(call.profile === undefined ? {} : { profile: call.profile }),
      ...(call.outputSchema === undefined
        ? {}
        : { outputSchema: call.outputSchema }),
      ...(call.timeoutBudget === undefined
        ? {}
        : { timeoutBudget: call.timeoutBudget }),
      ...(call.signal === undefined ? {} : { signal: call.signal }),
      ...(call.metadata === undefined ? {} : { metadata: call.metadata }),
    });
  };
  return {
    siteId,
    callerKey: base.callerKey,
    capabilityStatus: (capability) => base.capabilityStatus(capability),
    generateText: (call) => invoke(AI_TEXT_GENERATE, call),
    generateStructured: (call) => invoke(AI_STRUCTURED_GENERATE, call),
  };
}
