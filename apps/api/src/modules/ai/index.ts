/**
 * The OJPlatform AI module: wires AI Bridge into the site-wide capability broker.
 *
 * **AI is optional.** Every failure path here leaves the site fully booted with the AI
 * capability provider unregistered — the broker reports `UNAVAILABLE`/`DISABLED` and any
 * consumer gets the closed error vocabulary. There is deliberately no "AI required" flag: a
 * deployment that must have AI monitors the operator diagnostics route instead of crashing
 * schools that don't use it.
 *
 * Boot sequence (each step can stop the sequence, honestly):
 *
 *  1. `OJPLATFORM_AI_DISABLED` → host kill switch gates the whole broker (`DISABLED`).
 *  2. Configuration (`OJPLATFORM_AI_CONFIG_JSON` / `OJPLATFORM_AI_CONFIG_FILE`) absent → no
 *     provider is registered at all.
 *  3. Packed artifacts (`@aibridge/host`, `@aibridge/suite-all`) absent/invalid → no provider.
 *  4. The bridge validates the configuration document itself; a rejected document → no
 *     provider. An unreadable/invalid *reload* later keeps the active snapshot.
 *  5. On success the plugin becomes a broker capability provider under `ai.bridge`.
 *
 * Governance stores are wired only when durably backed: Redis present → rate/quota (and the
 * encrypted replay cache when an operator secret exists) live under `oj:aibridge:v1:*`;
 * Postgres present → the usage ledger lands in `ai_capability_usage_*`. In-memory development
 * boots fall back to the bridge's own in-memory stores — devhonest, never "production-quiet".
 */
import type { FastifyInstance } from 'fastify';
import { createSubjectTokenMinter, type CapabilityBroker } from '@ojplatform/capability-broker';
import { isAiDisabledByEnv, loadAiConfig, watchAiConfigFile, type AiConfigReloader } from './config.js';
import { loadAiBridgeModules, type AiBridgeModuleOverrides } from './loader.js';
import { createAiBridgeCapabilityProvider } from './provider.js';
import {
  createRedisIdempotencyStore,
  createRedisQuotaStore,
  createRedisRateLimitStore,
  type RedisEvalLike,
} from './redis-stores.js';
import { createEnvSecretStore } from './secrets.js';
import { createSiteAiClient, type SiteAiClient } from './site-ai.js';
import { deriveStoreEncryptionKey } from './store-crypto.js';
import { createPostgresUsageLedger, type SqlQueryLike } from './usage-ledger.js';
import type { AiBridgePluginLike } from './types.js';

export const AI_BRIDGE_PROVIDER_ID = 'ai.bridge';
export const AI_SUBJECT_HMAC_KEY_ENV = 'OJPLATFORM_AI_SUBJECT_HMAC_KEY';

export type AiModuleStatus =
  | { readonly kind: 'DISABLED_BY_ENV' }
  | { readonly kind: 'NO_CONFIG' }
  | { readonly kind: 'CONFIG_UNREADABLE'; readonly error: string }
  | { readonly kind: 'ARTIFACTS_ABSENT'; readonly missing: readonly string[] }
  | { readonly kind: 'ARTIFACTS_INVALID'; readonly error: string }
  | { readonly kind: 'CONFIG_REJECTED'; readonly error: string }
  | { readonly kind: 'ACTIVE'; readonly configVersion: string; readonly contentDigest: string };

export type AiModuleLogger = {
  info(obj: Readonly<Record<string, unknown>>, msg: string): void;
  warn(obj: Readonly<Record<string, unknown>>, msg: string): void;
  error(obj: Readonly<Record<string, unknown>>, msg: string): void;
};

export type AiModuleDeps = {
  readonly broker: CapabilityBroker;
  readonly logger: AiModuleLogger;
  /** ioredis-shaped client; when absent the bridge uses its own in-memory stores. */
  readonly redis?: RedisEvalLike | null;
  /** pg-pool-shaped client; when absent the usage ledger stays in the bridge's memory. */
  readonly db?: SqlQueryLike | null;
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Test seam: inject loaded modules instead of resolving node_modules. */
  readonly moduleOverrides?: AiBridgeModuleOverrides;
};

export type AiModuleHandle = {
  /** The broker this module registered into. */
  readonly broker: CapabilityBroker;
  /** Stable opaque subject tokens (`ojs1_` / `oja1_` namespaces). */
  readonly subjectTokens: ReturnType<typeof createSubjectTokenMinter>;
  /** Current module state, for the operator diagnostics route. */
  status(): AiModuleStatus;
  /** The site-core client for a registered site caller (`problem`, `submission`, ...). */
  siteClient(siteId: string): SiteAiClient | null;
  /** Atomic configuration reload: an invalid candidate keeps the active snapshot. */
  reload(document: unknown): Promise<boolean>;
  /** Stop watching, dispose the plugin, unregister the provider. Idempotent. */
  close(): void;
};

const describeFailure = (failure: unknown): string => {
  if (failure === null || typeof failure !== 'object') {
    return 'the bridge rejected the configuration';
  }
  const issues = (failure as { issues?: unknown }).issues;
  if (Array.isArray(issues) && issues.length > 0) {
    const first = issues[0] as { code?: unknown; path?: unknown; message?: unknown };
    return `configuration rejected: ${String(first.code ?? 'INVALID')} at ${String(first.path ?? '$')} (${String(
      first.message ?? 'invalid',
    )})`;
  }
  const message = (failure as { message?: unknown }).message;
  return typeof message === 'string' ? message : 'the bridge rejected the configuration';
};

/**
 * The site caller namespaces Stage 6 registers. Grants are declared now so per-caller
 * governance (rate, quota, attribution) is exercisable; **no business route consumes AI in
 * Stage 6** — these are identity fixtures, not features.
 */
export function registerDefaultSiteAiCallers(broker: CapabilityBroker): void {
  const aiV1 = ['ai.text.generate@1.x', 'ai.structured.generate@1.x'] as const;
  broker.registerSiteCaller({ siteId: 'problem', capabilities: aiV1, description: 'problem module identity' });
  broker.registerSiteCaller({ siteId: 'submission', capabilities: aiV1, description: 'submission module identity' });
  broker.registerSiteCaller({ siteId: 'content', capabilities: aiV1, description: 'content module identity' });
  broker.registerSiteCaller({ siteId: 'admin', capabilities: [], description: 'operator identity, no AI grants' });
}

export async function registerAiModule(app: FastifyInstance, deps: AiModuleDeps): Promise<AiModuleHandle> {
  const env = deps.env ?? process.env;
  const logger = deps.logger;
  const subjectTokens = createSubjectTokenMinter({
    ...(env[AI_SUBJECT_HMAC_KEY_ENV] === undefined ? {} : { secret: env[AI_SUBJECT_HMAC_KEY_ENV] }),
  });

  let status: AiModuleStatus = { kind: 'NO_CONFIG' };
  let plugin: AiBridgePluginLike | null = null;
  let reloader: AiConfigReloader | null = null;
  let closed = false;

  if (isAiDisabledByEnv(env)) {
    deps.broker.setKillSwitch({ global: true, providers: [], capabilities: [] });
    status = { kind: 'DISABLED_BY_ENV' };
    logger.warn({ module: 'ai' }, 'AI capability disabled by operator environment kill switch');
  } else {
    const config = loadAiConfig(env);
    if (config.kind === 'ABSENT') {
      status = { kind: 'NO_CONFIG' };
      logger.info({ module: 'ai' }, 'no AI configuration; AI capabilities unavailable, site boots normally');
    } else if (config.kind === 'INVALID') {
      status = { kind: 'CONFIG_UNREADABLE', error: config.error };
      logger.warn({ module: 'ai', source: config.source }, `AI configuration unreadable: ${config.error}`);
    } else {
      const modules = await loadAiBridgeModules(deps.moduleOverrides ?? {});
      if (modules.kind === 'ABSENT') {
        status = { kind: 'ARTIFACTS_ABSENT', missing: modules.missing };
        logger.info(
          { module: 'ai', missing: [...modules.missing] },
          'AI Bridge artifacts not installed; AI capabilities unavailable, site boots normally',
        );
      } else if (modules.kind === 'INVALID') {
        status = { kind: 'ARTIFACTS_INVALID', error: modules.error };
        logger.error({ module: 'ai' }, modules.error);
      } else {
        const redis = deps.redis ?? null;
        const db = deps.db ?? null;
        const secret = env[AI_SUBJECT_HMAC_KEY_ENV];
        const stores = {
          ...(redis !== null && typeof secret === 'string' && secret.length > 0
            ? { idempotency: createRedisIdempotencyStore(redis, deriveStoreEncryptionKey(secret)) }
            : {}),
          ...(redis !== null ? { rateLimit: createRedisRateLimitStore(redis) } : {}),
          ...(redis !== null ? { quota: createRedisQuotaStore(redis) } : {}),
          ...(db !== null ? { usageLedger: createPostgresUsageLedger(db) } : {}),
          events: { emit: (event: Readonly<Record<string, unknown>>) => logger.info({ module: 'ai', event }, 'ai event') },
          operatorLog: {
            log: (entry: Readonly<Record<string, unknown>>) => logger.warn({ module: 'ai', entry }, 'ai operator log'),
          },
        };
        const created = await modules.host.createAiBridgeServerPlugin({
          config: config.document,
          adapterFactories: modules.suite.SUITE_ADAPTER_FACTORIES,
          resolveEndpoint: (provider) => modules.suite.suiteResolveEndpoint(provider),
          secrets: createEnvSecretStore(env),
          // No pluginVersion override: the packed artifact reports its own version.
          stores,
        });
        if (!created.ok) {
          status = { kind: 'CONFIG_REJECTED', error: describeFailure(created.failure) };
          logger.warn({ module: 'ai' }, `AI Bridge rejected the configuration: ${status.error}`);
        } else {
          plugin = created.value;
          const provider = createAiBridgeCapabilityProvider(plugin, {
            providerId: AI_BRIDGE_PROVIDER_ID,
            pluginVersion: 'host-loaded',
          });
          deps.broker.registerProvider(provider);
          const snapshot = plugin.configSnapshot();
          status = { kind: 'ACTIVE', configVersion: snapshot.configVersion, contentDigest: snapshot.contentDigest };
          logger.info(
            { module: 'ai', configVersion: snapshot.configVersion },
            'AI Bridge active: capability provider registered with the site broker',
          );
          if (config.filePath !== undefined) {
            const active = plugin;
            reloader = watchAiConfigFile({
              filePath: config.filePath,
              applyCandidate: async (document) => {
                const result = await active.reload(document);
                if (result.ok) {
                  const next = active.configSnapshot();
                  status = { kind: 'ACTIVE', configVersion: next.configVersion, contentDigest: next.contentDigest };
                  logger.info({ module: 'ai', configVersion: next.configVersion }, 'AI configuration reloaded');
                } else {
                  logger.warn(
                    { module: 'ai', failure: describeFailure(result.failure) },
                    'AI configuration reload rejected; active snapshot keeps serving',
                  );
                }
              },
              onParseFailure: (error) =>
                logger.warn({ module: 'ai', error }, 'AI configuration file changed but is unreadable; keeping active'),
            });
          }
        }
      }
    }
  }

  const handle: AiModuleHandle = {
    broker: deps.broker,
    subjectTokens,
    status: () => status,
    siteClient: (siteId) => createSiteAiClient(deps.broker, siteId),
    reload: async (document) => {
      if (plugin === null) {
        return false;
      }
      const result = await plugin.reload(document);
      if (result.ok) {
        const next = plugin.configSnapshot();
        status = { kind: 'ACTIVE', configVersion: next.configVersion, contentDigest: next.contentDigest };
        return true;
      }
      return false;
    },
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      reloader?.close();
      reloader = null;
      if (plugin !== null) {
        deps.broker.unregisterProvider(AI_BRIDGE_PROVIDER_ID);
        plugin.dispose();
        plugin = null;
      }
    },
  };
  app.addHook('onClose', async () => handle.close());
  return handle;
}

export * from './config.js';
export * from './loader.js';
export * from './provider.js';
export * from './redis-stores.js';
export * from './secrets.js';
export * from './site-ai.js';
export * from './store-crypto.js';
export * from './types.js';
export * from './usage-ledger.js';
