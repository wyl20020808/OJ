/**
 * Structural (call-shape) mirrors of the loaded AI Bridge modules.
 *
 * The OJPlatform API loads `@aibridge/host` and `@aibridge/suite-all` **dynamically** from
 * node_modules when the operator installed the packed artifacts. The repo itself never declares
 * or statically imports them (architecture gate), so every shape the module boundary needs is
 * declared here structurally. Field names follow the AI Bridge contract exactly; anything the
 * bridge adds stays invisible until explicitly mirrored.
 *
 * Nothing in this file trusts loaded-module output beyond the mirrored shape: results pass
 * through verbatim by design (the AI Bridge error vocabulary is already the closed set the
 * broker exposes), and configuration documents are validated by the bridge itself at
 * `createAiBridgeServerPlugin` / `reload` time.
 */

/** `@aibridge/contracts` `CancellationToken` (call shape). */
export type CancellationTokenLike = {
  readonly cancelled: boolean;
  readonly onCancel: (callback: () => void) => () => void;
};

/** `@aibridge/contracts` `AiError` (call shape). The vocabulary is the broker's closed set. */
export type AiErrorLike = {
  readonly code: string;
  readonly reason?: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly stage?: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
};

/** `@aibridge/contracts` `AiUsage` (call shape). Counts and cost only, never content. */
export type AiUsageLike = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly cachedTokens?: number;
  readonly reasoningTokens?: number;
  readonly estimatedCost?: {
    readonly value: number;
    readonly currency: string;
    readonly basis: string;
  };
};

/** `@aibridge/contracts` `AiResult` (call shape). */
export type AiResultLike = {
  readonly status: 'SUCCEEDED' | 'FAILED';
  readonly output?: unknown;
  readonly error?: AiErrorLike;
  readonly usage: AiUsageLike;
  readonly providerMetadata?: Readonly<
    Record<string, string | number | boolean>
  >;
  readonly latencyMs: number;
  readonly requestId: string;
  readonly warnings?: readonly { readonly code: string }[];
};

/** `@aibridge/contracts` `CapabilityDescriptor` (call shape, the fields the host reads). */
export type CapabilityDescriptorLike = {
  readonly id: string;
  readonly version: string;
  readonly status: 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE' | 'DISABLED';
};

/** `@aibridge/contracts` `TrustedDispatchContext` (call shape). */
export type TrustedDispatchContextLike = {
  readonly callerPluginId: string;
  readonly subjectToken?: string;
  readonly grantedPermissions: readonly string[];
  readonly hostRequestId?: string;
  readonly traceId?: string;
};

/** The operator-side status summary (`AiBridgeStatus`, call shape). */
export type AiBridgeStatusLike = {
  readonly status: string;
  readonly reason?: string;
};

/** `@aibridge/host` `AiBridgeServerPlugin` (call shape). */
export type AiBridgePluginLike = {
  readonly id: string;
  readonly providesCapabilities: readonly string[];
  execute(
    request: unknown,
    trustedContext: unknown,
    options?: { readonly cancellation?: CancellationTokenLike },
  ): Promise<AiResultLike>;
  listCapabilities(): readonly CapabilityDescriptorLike[];
  status(): AiBridgeStatusLike;
  reload(
    candidate: unknown,
  ): Promise<{ readonly ok: boolean; readonly failure?: unknown }>;
  diagnostics(): readonly unknown[];
  configSnapshot(): {
    readonly configVersion: string;
    readonly contentDigest: string;
  };
  dispose(): void;
};

/** `@aibridge/host` module (call shape). */
export type AiBridgeHostModuleLike = {
  readonly AIBRIDGE_PLUGIN_ID: string;
  createAiBridgeServerPlugin(options: {
    readonly config: unknown;
    readonly adapterFactories: Readonly<Record<string, unknown>>;
    readonly resolveEndpoint: (provider: unknown) => string;
    readonly secrets?: SecretStorePortLike;
    readonly pluginVersion?: string;
    readonly stores?: {
      readonly idempotency?: IdempotencyStorePortLike;
      readonly rateLimit?: RateLimitStorePortLike;
      readonly quota?: QuotaStorePortLike;
      readonly usageLedger?: UsageLedgerPortLike;
      readonly events?: OperationalEventSinkLike;
      readonly metrics?: MetricsSinkLike;
      readonly operatorLog?: OperatorLogSinkLike;
    };
  }): Promise<
    | { readonly ok: true; readonly value: AiBridgePluginLike }
    | { readonly ok: false; readonly failure: unknown }
  >;
};

/** `@aibridge/suite-all` module (call shape). */
export type AiBridgeSuiteModuleLike = {
  readonly SUITE_ADAPTER_FACTORIES: Readonly<Record<string, unknown>>;
  suiteResolveEndpoint(provider: unknown): string;
};

/* ── Governance store ports (call shapes the bridge calls into) ─────────────────────────── */

/** `@aibridge/host-sdk` `SecretStorePort` (call shape). */
export type SecretStorePortLike = {
  resolve(handle: string): Promise<string | null>;
  has(handle: string): Promise<boolean>;
};

/** `@aibridge/governance` `IdempotencyRecord` (call shape; stored as an opaque JSON document). */
export type IdempotencyRecordLike = {
  readonly identity: string;
  readonly fingerprint: string;
  readonly status: 'IN_FLIGHT' | 'SUCCEEDED' | 'FAILED_FINAL';
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly logicalRequestId: string;
  readonly result?: unknown;
};

/** `@aibridge/governance` `IdempotencyStorePort` (call shape). `claim` must be atomic. */
export type IdempotencyStorePortLike = {
  claim(record: IdempotencyRecordLike): Promise<{
    readonly kind: 'PROCEED' | 'JOIN' | 'REPLAY' | 'CONFLICT';
    readonly record: IdempotencyRecordLike;
  }>;
  complete(
    identity: string,
    status: 'SUCCEEDED' | 'FAILED_FINAL',
    result: unknown,
    nowMs: number,
  ): Promise<void>;
  get(identity: string): Promise<IdempotencyRecordLike | null>;
};

/** `@aibridge/governance` `RateLimitStorePort` (call shape). `tryConsume` must be atomic. */
export type RateLimitStorePortLike = {
  tryConsume(
    bucket: string,
    atMs: number,
    limit: number,
    windowMs: number,
  ): Promise<{ readonly allowed: boolean; readonly retryAfterMs: number }>;
};

/** `@aibridge/governance` `QuotaStorePort` (call shape). Reserve/settle/release must be atomic. */
export type QuotaStorePortLike = {
  reserve(
    bucket: string,
    amount: number,
    limit: number,
  ): Promise<string | null>;
  settle(bucket: string, reservationId: string, actual: number): Promise<void>;
  release(bucket: string, reservationId: string): Promise<void>;
  consumed(bucket: string): Promise<number>;
};

/** `@aibridge/governance` usage record shapes (call shape; appended verbatim to the ledger). */
export type ProviderAttemptUsageRecordLike = Readonly<
  Record<string, unknown>
> & {
  readonly usageRecordId: string;
  readonly logicalRequestId: string;
  readonly attemptId: string;
  readonly callerPluginId: string;
  readonly capability: string;
};

export type LogicalRequestUsageRecordLike = Readonly<
  Record<string, unknown>
> & {
  readonly usageRecordId: string;
  readonly logicalRequestId: string;
  readonly requestId: string;
  readonly callerPluginId: string;
  readonly capability: string;
};

/** `@aibridge/governance` `UsageLedgerPort` (call shape). */
export type UsageLedgerPortLike = {
  appendAttempt(record: ProviderAttemptUsageRecordLike): Promise<void>;
  appendRequest(record: LogicalRequestUsageRecordLike): Promise<void>;
  attempts(
    logicalRequestId?: string,
  ): Promise<readonly ProviderAttemptUsageRecordLike[]>;
  requests(
    logicalRequestId?: string,
  ): Promise<readonly LogicalRequestUsageRecordLike[]>;
};

/* ── Observability sinks (call shapes; events are already normalized, never raw payloads) ── */

export type OperationalEventSinkLike = {
  emit(event: Readonly<Record<string, unknown>>): void;
};

export type MetricsSinkLike = {
  observe(
    metric: string,
    value: number,
    labels?: Readonly<Record<string, string>>,
  ): void;
};

export type OperatorLogSinkLike = {
  log(entry: Readonly<Record<string, unknown>>): void;
};
