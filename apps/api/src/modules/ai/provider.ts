/**
 * The capability-provider bridge: adapts the loaded AI Bridge server plugin into the generic
 * `@ojplatform/capability-broker` provider seam.
 *
 * This is the *only* place the two systems meet, and the meeting is narrow:
 *
 *  - **Trusted context composition.** The broker's bound caller context becomes the bridge's
 *    `TrustedDispatchContext` — `callerPluginId` is the broker-composed key (`plugin.<id>` /
 *    `site.<id>`), permissions are the caller's grants, the subject token passes through opaque.
 *    Nothing a consumer sent over HTTP can reach this object.
 *  - **Envelope construction.** The invocation becomes a bridge consumer request: frozen
 *    contract version, host-minted request id, caller-scoped idempotency key, clamped timeout
 *    budget, closed metadata keys. `input` passes through verbatim — the capability owns its
 *    schema, the bridge validates it.
 *  - **Cancellation.** A host `AbortSignal` becomes a bridge `CancellationToken`.
 *  - **Result projection.** The bridge result passes through verbatim (output, usage, the
 *    closed error vocabulary, provider metadata) — it is already the safe, normalized shape the
 *    broker exposes.
 */
import { randomUUID } from 'node:crypto';
import { parsePluginManifest, type PluginManifest } from '@ojplatform/plugin-sdk';
import type {
  BoundCallerContext,
  CapabilityInvocation,
  CapabilityProvider,
  CapabilityResult,
} from '@ojplatform/capability-broker';
import type { AiBridgePluginLike, CancellationTokenLike } from './types.js';

/**
 * The frozen AI Bridge consumer-request contract version (`AIBRIDGE_CONTRACT_VERSION` at the
 * pinned artifact). Drift fails closed (`CONTRACT_VERSION_UNSUPPORTED` on every call) and the
 * packed-artifact qualification suite asserts this value against the loaded module.
 */
export const AIBRIDGE_REQUEST_CONTRACT_VERSION = '1.1';

const abortToCancellation = (signal: AbortSignal): CancellationTokenLike => ({
  get cancelled() {
    return signal.aborted;
  },
  onCancel(callback) {
    if (signal.aborted) {
      callback();
      return () => undefined;
    }
    const listener = (): void => callback();
    signal.addEventListener('abort', listener, { once: true });
    return () => signal.removeEventListener('abort', listener);
  },
});

export type AiBridgeCapabilityProviderOptions = {
  /** The bridge plugin id as registered with the broker (`ai.bridge`). */
  readonly providerId: string;
  /** Operator-facing plugin version (artifact version), recorded in the manifest. */
  readonly pluginVersion: string;
};

export function createAiBridgeCapabilityProvider(
  plugin: AiBridgePluginLike,
  options: AiBridgeCapabilityProviderOptions,
): CapabilityProvider {
  const manifest = parsePluginManifest({
    id: options.providerId,
    name: 'AI Bridge',
    version: options.pluginVersion,
    apiVersion: 1,
    providesCapabilities: [...plugin.providesCapabilities],
    consumesCapabilities: [],
  });
  if (manifest === null) {
    throw new Error(
      `AI Bridge reports capability references the manifest dialect rejects: ${plugin.providesCapabilities.join(', ')}`,
    );
  }

  return {
    providerId: options.providerId,
    manifest: manifest as PluginManifest,
    listCapabilities: () =>
      plugin.listCapabilities().map((descriptor) => ({
        id: descriptor.id,
        version: descriptor.version,
        status: descriptor.status,
      })),
    execute: (capability, version, invocation: CapabilityInvocation, caller: BoundCallerContext): Promise<CapabilityResult> => {
      const envelope = {
        contractVersion: AIBRIDGE_REQUEST_CONTRACT_VERSION,
        requestId: randomUUID(),
        idempotencyKey: invocation.idempotencyKey,
        capability,
        capabilityVersion: version,
        profile: invocation.profile ?? 'balanced',
        input: invocation.input,
        ...(invocation.outputSchema === undefined ? {} : { outputSchema: invocation.outputSchema }),
        ...(invocation.timeoutBudget === undefined
          ? {}
          : {
              timeoutBudget: {
                ...(invocation.timeoutBudget.totalMs === undefined ? {} : { totalMs: invocation.timeoutBudget.totalMs }),
                ...(invocation.timeoutBudget.providerMs === undefined
                  ? {}
                  : { providerMs: invocation.timeoutBudget.providerMs }),
              },
            }),
        ...(invocation.metadata === undefined
          ? {}
          : {
              metadata: {
                ...(invocation.metadata.locale === undefined ? {} : { locale: invocation.metadata.locale }),
                ...(invocation.metadata.traceId === undefined ? {} : { traceId: invocation.metadata.traceId }),
                ...(invocation.metadata.surface === undefined ? {} : { surface: invocation.metadata.surface }),
                ...(invocation.metadata.correlationId === undefined
                  ? {}
                  : { correlationId: invocation.metadata.correlationId }),
              },
            }),
      };
      const trustedContext = {
        callerPluginId: caller.callerKey,
        grantedPermissions: [...caller.permissions],
        ...(caller.subjectToken === undefined ? {} : { subjectToken: caller.subjectToken }),
        ...(invocation.metadata?.correlationId === undefined
          ? {}
          : { hostRequestId: invocation.metadata.correlationId }),
        ...(invocation.metadata?.traceId === undefined ? {} : { traceId: invocation.metadata.traceId }),
      };
      const executeOptions =
        invocation.signal === undefined ? undefined : { cancellation: abortToCancellation(invocation.signal) };
      return plugin.execute(envelope, trustedContext, executeOptions).then((result) => ({
        status: result.status,
        ...(result.output === undefined ? {} : { output: result.output }),
        ...(result.error === undefined
          ? {}
          : {
              error: {
                code: result.error.code as NonNullable<CapabilityResult['error']>['code'],
                message: result.error.message,
                retryable: result.error.retryable,
                ...(result.error.retryAfterMs === undefined ? {} : { retryAfterMs: result.error.retryAfterMs }),
                ...(result.error.stage === undefined ? {} : { stage: result.error.stage }),
                ...(result.error.reason === undefined ? {} : { reason: result.error.reason }),
                ...(result.error.details === undefined ? {} : { details: result.error.details }),
              },
            }),
        usage: {
          ...(result.usage.inputTokens === undefined ? {} : { inputTokens: result.usage.inputTokens }),
          ...(result.usage.outputTokens === undefined ? {} : { outputTokens: result.usage.outputTokens }),
          ...(result.usage.totalTokens === undefined ? {} : { totalTokens: result.usage.totalTokens }),
          ...(result.usage.estimatedCost === undefined ? {} : { estimatedCost: result.usage.estimatedCost }),
        },
        ...(result.warnings === undefined ? {} : { warnings: result.warnings }),
        ...(result.providerMetadata === undefined ? {} : { providerMetadata: result.providerMetadata }),
        latencyMs: result.latencyMs,
        requestId: result.requestId,
      }));
    },
    dispose: () => plugin.dispose(),
  };
}
