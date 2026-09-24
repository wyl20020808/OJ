/**
 * Host compatibility qualification for the specialized AI capability
 * `code.debug.analyze@1.0` (AI Bridge Stage 7).
 *
 * The suite is hermetic by design: it drives the real OJPlatform host path
 * (site/plugin caller → capability broker → AI module → AI Bridge provider adapter) against a
 * *structural* fake bridge plugin — never an `@aibridge/*` import — and uses the AI Bridge-owned
 * JSON fixtures vendored under `tests/fixtures/aibridge-stage7/` as the compatibility oracle.
 *
 * Scope is deliberately the host's responsibility only: trusted identity, permissions, grant,
 * provenance transport, dispatch, governance attribution, failure mapping. The host never reads,
 * repairs or enriches the consumer's debug input; that still belongs to AI Bridge.
 */
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { CapabilityBroker } from '@ojplatform/capability-broker';
import {
  AIBRIDGE_REQUEST_CONTRACT_VERSION,
  PROMPT_VERSION_PATTERN,
  validatePromptProvenance,
} from '../apps/api/src/modules/ai/provider.js';
import {
  AI_BRIDGE_PROVIDER_ID,
  registerAiModule,
  registerDefaultSiteAiCallers,
} from '../apps/api/src/modules/ai/index.js';
import {
  createRedisIdempotencyStore,
  type RedisEvalLike,
} from '../apps/api/src/modules/ai/redis-stores.js';
import { deriveStoreEncryptionKey } from '../apps/api/src/modules/ai/store-crypto.js';
import {
  createPostgresUsageLedger,
  type SqlQueryLike,
} from '../apps/api/src/modules/ai/usage-ledger.js';
import type {
  AiBridgeHostModuleLike,
  AiBridgePluginLike,
  AiBridgeSuiteModuleLike,
  AiResultLike,
  CapabilityDescriptorLike,
  LogicalRequestUsageRecordLike,
} from '../apps/api/src/modules/ai/types.js';

const SPECIALIZED = 'code.debug.analyze';
const SPECIALIZED_V1 = '1.0';
const CALLER_COLON_KEY = 'consumer:debug:turn-18';

type FixtureDocument = {
  readonly expect: 'accept' | 'reject';
  readonly reason?: string;
  readonly compatibility?: Record<string, unknown>;
  readonly document: Record<string, unknown>;
  readonly validationInput?: Record<string, unknown>;
};

const loadFixture = (name: string): FixtureDocument =>
  JSON.parse(
    readFileSync(
      new URL(
        `./fixtures/aibridge-stage7/fixture-set.v1/${name}`,
        import.meta.url,
      ),
      'utf8',
    ),
  ) as FixtureDocument;

const requestOk = loadFixture('code.debug.analyze.request.ok.json');
const responseOk = loadFixture('code.debug.analyze.response.ok.json');
const compatibility = loadFixture('code.debug.analyze.compatibility.json');
const requestProvenanceInvalid = loadFixture(
  'code.debug.analyze.request.provenance-invalid.json',
);
const requestTrustInvalid = loadFixture(
  'code.debug.analyze.request.trust-invalid.json',
);
const schemaMismatch = loadFixture(
  'ai.structured.generate.response.schema-mismatch.json',
);
const balanceExhausted = loadFixture(
  'ai.text.generate.response.balance-exhausted.json',
);

const requestOkInput = requestOk.document['input'] as Record<string, unknown>;

type RecordedCall = {
  readonly request: Record<string, unknown>;
  readonly trusted: Record<string, unknown>;
  readonly options: unknown;
};

/**
 * A structural Stage 7 bridge plugin: its manifest faithfully reports only the generic primitive
 * refs (as AI Bridge Stage 7 does), while `listCapabilities()` also serves the specialized
 * capability. The host adapter must therefore declare what the bridge actually serves.
 */
function makeSpecializedPlugin(
  options: {
    readonly specialized?: Partial<AiResultLike>;
    readonly generic?: Partial<AiResultLike>;
  } = {},
) {
  const calls: RecordedCall[] = [];
  const descriptors: CapabilityDescriptorLike[] = [
    {
      id: 'ai.text.generate',
      version: '1.0',
      status: 'AVAILABLE',
      kind: 'GENERIC',
    },
    {
      id: 'ai.structured.generate',
      version: '1.0',
      status: 'AVAILABLE',
      kind: 'GENERIC',
    },
    {
      id: SPECIALIZED,
      version: SPECIALIZED_V1,
      status: 'AVAILABLE',
      kind: 'SPECIALIZED',
      readiness: 'STABLE',
      instructionMode: 'CONSUMER_COMPOSED',
      requiredPrimitive: 'ai.structured.generate',
    },
  ];
  const responseOutput = responseOk.document['output'];
  const plugin: AiBridgePluginLike = {
    id: AI_BRIDGE_PROVIDER_ID,
    providesCapabilities: [
      'ai.text.generate@1.x',
      'ai.structured.generate@1.x',
    ],
    execute: (request, trustedContext, executeOptions) => {
      const envelope = request as Record<string, unknown>;
      calls.push({
        request: envelope,
        trusted: trustedContext as Record<string, unknown>,
        options: executeOptions,
      });
      if (envelope['capability'] === SPECIALIZED) {
        const input = envelope['input'] as
          | { context?: readonly { name?: string; untrusted?: boolean }[] }
          | undefined;
        const source = input?.context?.find(
          (entry) => entry.name === 'sourceCode',
        );
        if (source !== undefined && source.untrusted === false) {
          return Promise.resolve({
            status: 'FAILED',
            error: {
              code: 'INVALID_REQUEST',
              reason: 'MALFORMED_ENVELOPE',
              message: 'sourceCode must be untrusted context',
              retryable: false,
              stage: 'REQUEST',
            },
            usage: {},
            latencyMs: 2,
            requestId: 'bridge-trust-invalid',
          });
        }
        if (
          envelope['promptApplied'] === true &&
          typeof envelope['promptVersion'] !== 'string'
        ) {
          return Promise.resolve({
            status: 'FAILED',
            error: {
              code: 'INVALID_REQUEST',
              reason: 'MALFORMED_ENVELOPE',
              message: 'promptVersion required when promptApplied is true',
              retryable: false,
              stage: 'REQUEST',
            },
            usage: {},
            latencyMs: 2,
            requestId: 'bridge-provenance-invalid',
          });
        }
        return Promise.resolve({
          status: 'SUCCEEDED',
          output: responseOutput,
          usage: { inputTokens: 96, outputTokens: 18, totalTokens: 114 },
          providerMetadata: { providerId: 'local', modelClass: 'LOCAL' },
          latencyMs: 35,
          requestId: 'req-debug-response-ok-01',
          warnings: [],
          ...options.specialized,
        });
      }
      return Promise.resolve({
        status: 'SUCCEEDED',
        output: { text: 'generic ok' },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        requestId: 'generic-1',
        ...options.generic,
      });
    },
    listCapabilities: () => descriptors,
    status: () => ({ status: 'ACTIVE' }),
    reload: () => Promise.resolve({ ok: true }),
    diagnostics: () => [],
    configSnapshot: () => ({
      configVersion: 'cfg-1',
      contentDigest: 'digest-1',
    }),
    dispose: () => undefined,
  };
  return { plugin, calls };
}

const fakeSuite: AiBridgeSuiteModuleLike = {
  SUITE_ADAPTER_FACTORIES: {},
  suiteResolveEndpoint: () => 'https://example.invalid/v1',
};

const hostModule = (plugin: AiBridgePluginLike): AiBridgeHostModuleLike => ({
  AIBRIDGE_PLUGIN_ID: AI_BRIDGE_PROVIDER_ID,
  createAiBridgeServerPlugin: () =>
    Promise.resolve({ ok: true, value: plugin }),
});

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const VALID_CONFIG = JSON.stringify({
  providers: [],
  routes: [],
  governance: {},
});

async function bootWithPlugin(plugin: AiBridgePluginLike) {
  const app = Fastify({ logger: false });
  const broker = new CapabilityBroker({ maxTimeoutMs: 30_000 });
  registerDefaultSiteAiCallers(broker);
  // A dedicated site caller authorized for the specialized capability only.
  broker.registerSiteCaller({
    siteId: 'debug-coach',
    capabilities: [`${SPECIALIZED}@${SPECIALIZED_V1}`],
    description: 'debug coach identity',
  });
  const handle = await registerAiModule(app, {
    broker,
    logger: silentLogger,
    env: { OJPLATFORM_AI_CONFIG_JSON: VALID_CONFIG },
    moduleOverrides: { hostModule: hostModule(plugin), suiteModule: fakeSuite },
  });
  return { app, broker, handle };
}

const pluginCaller = (consumes: readonly string[]) => ({
  id: 'algoquest.learning-quests',
  name: 'Learning Quests',
  version: '1.0.0',
  apiVersion: 1,
  providesCapabilities: [],
  consumesCapabilities: [...consumes],
});

const callArgs = (
  overrides: Partial<{
    idempotencyKey: string;
    input: unknown;
    provenance: Record<string, unknown>;
  }> = {},
) => ({
  idempotencyKey: CALLER_COLON_KEY,
  input: requestOkInput,
  provenance: {
    promptApplied: true,
    promptVersion: 'debug.analysis.v1',
  },
  ...overrides,
});

describe('specialized capability grant and discovery', () => {
  it('registers even though the bridge manifest omits the specialized ref', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    expect(broker.listProviders()).toContain(AI_BRIDGE_PROVIDER_ID);
    const ids = broker.listAvailableCapabilities().map((entry) => entry.id);
    expect(ids).toContain(SPECIALIZED);
  });

  it('discovers the specialized capability with kind + readiness distinct from availability', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    const descriptor = broker
      .listAvailableCapabilities()
      .find((entry) => entry.id === SPECIALIZED);
    expect(descriptor).toMatchObject({
      id: SPECIALIZED,
      version: SPECIALIZED_V1,
      status: 'AVAILABLE',
      kind: 'SPECIALIZED',
      readiness: 'STABLE',
      providerId: AI_BRIDGE_PROVIDER_ID,
    });

    broker.setKillSwitch({
      global: false,
      providers: [],
      capabilities: [SPECIALIZED],
    });
    const disabled = broker
      .listAvailableCapabilities()
      .find((entry) => entry.id === SPECIALIZED);
    // Availability degrades to DISABLED; maturity (readiness) is unchanged.
    expect(disabled?.status).toBe('DISABLED');
    expect(disabled?.readiness).toBe('STABLE');
  });

  it('cross-checks the host request contract against the AI Bridge compatibility fixture', () => {
    expect(AIBRIDGE_REQUEST_CONTRACT_VERSION).toBe(
      compatibility.compatibility?.['contractVersion'],
    );
    expect(compatibility.compatibility?.['logicalCapability']).toBe(
      SPECIALIZED,
    );
    expect(compatibility.compatibility?.['colonIdempotencyKey']).toBe(
      'consumer:debug:turn-17',
    );
  });
});

describe('specialized dispatch and logical identity', () => {
  it('dispatches an authorized site caller and preserves the logical capability identity', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    const result = await broker
      .forSite('debug-coach')!
      .execute(SPECIALIZED, SPECIALIZED_V1, callArgs());

    expect(result.status).toBe('SUCCEEDED');
    expect(fake.calls).toHaveLength(1);
    const request = fake.calls[0]!.request;
    // Logical capability identity is NOT rewritten to the underlying primitive.
    expect(request['capability']).toBe(SPECIALIZED);
    expect(request['capabilityVersion']).toBe(SPECIALIZED_V1);
    expect(request['contractVersion']).toBe(AIBRIDGE_REQUEST_CONTRACT_VERSION);
  });

  it('lets an authorized plugin caller dispatch the specialized capability', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    const client = broker.forPlugin(
      pluginCaller([`${SPECIALIZED}@${SPECIALIZED_V1}`]),
    );
    const result = await client!.execute(
      SPECIALIZED,
      SPECIALIZED_V1,
      callArgs(),
    );
    expect(result.status).toBe('SUCCEEDED');
    expect(fake.calls).toHaveLength(1);
  });

  it('returns the specialized result verbatim', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    const result = await broker
      .forSite('debug-coach')!
      .execute(SPECIALIZED, SPECIALIZED_V1, callArgs());
    expect(result.output).toEqual(responseOk.document['output']);
  });

  it('keeps the opaque colon-delimited idempotency key intact', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    await broker
      .forSite('debug-coach')!
      .execute(SPECIALIZED, SPECIALIZED_V1, callArgs());
    expect(fake.calls[0]!.request['idempotencyKey']).toBe(CALLER_COLON_KEY);
  });
});

describe('prompt provenance transport and validation', () => {
  it('roundtrips promptApplied / promptVersion through broker → adapter → bridge', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    await broker.forSite('debug-coach')!.execute(
      SPECIALIZED,
      SPECIALIZED_V1,
      callArgs({
        provenance: { promptApplied: true, promptVersion: 'debug-v7' },
      }),
    );
    expect(fake.calls[0]!.request['promptApplied']).toBe(true);
    expect(fake.calls[0]!.request['promptVersion']).toBe('debug-v7');
  });

  it('passes input trust channels through without flattening', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    await broker
      .forSite('debug-coach')!
      .execute(SPECIALIZED, SPECIALIZED_V1, callArgs());
    const input = fake.calls[0]!.request['input'] as {
      instructions: unknown;
      context: readonly { name: string; untrusted: boolean }[];
    };
    expect(input).toEqual(requestOkInput);
    expect(input.context.map((entry) => entry.name)).toEqual([
      'sourceCode',
      'diagnostics',
    ]);
    expect(input.context.every((entry) => entry.untrusted === true)).toBe(true);
  });

  it('rejects promptApplied without promptVersion at the host boundary, dispatching nothing', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    const result = await broker
      .forSite('debug-coach')!
      .execute(
        SPECIALIZED,
        SPECIALIZED_V1,
        callArgs({ provenance: { promptApplied: true } }),
      );
    expect(result.status).toBe('FAILED');
    expect(result.error?.code).toBe('INVALID_REQUEST');
    expect(result.error?.reason).toBe('INVALID_PROMPT_PROVENANCE');
    expect(fake.calls).toHaveLength(0);
  });

  it('rejects a promptVersion with promptApplied false', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    const result = await broker.forSite('debug-coach')!.execute(
      SPECIALIZED,
      SPECIALIZED_V1,
      callArgs({
        provenance: { promptApplied: false, promptVersion: 'debug-v7' },
      }),
    );
    expect(result.error?.reason).toBe('INVALID_PROMPT_PROVENANCE');
    expect(fake.calls).toHaveLength(0);
  });

  it('rejects a malformed promptVersion shape instead of normalizing it', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    const result = await broker.forSite('debug-coach')!.execute(
      SPECIALIZED,
      SPECIALIZED_V1,
      callArgs({
        provenance: { promptApplied: true, promptVersion: 'bad version!' },
      }),
    );
    expect(result.error?.reason).toBe('INVALID_PROMPT_PROVENANCE');
    expect(fake.calls).toHaveLength(0);
  });

  it('leaves an omitted provenance pair absent instead of inventing false', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    const result = await broker
      .forSite('debug-coach')!
      .execute(SPECIALIZED, SPECIALIZED_V1, {
        idempotencyKey: CALLER_COLON_KEY,
        input: requestOkInput,
      });
    expect(result.status).toBe('SUCCEEDED');
    // Absent is transported as absent — never normalized into an invented value.
    expect(fake.calls[0]!.request).not.toHaveProperty('promptApplied');
    expect(fake.calls[0]!.request).not.toHaveProperty('promptVersion');
  });

  it('rejects the AI Bridge promptVersion-absent fixture at the host boundary', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    const document = requestProvenanceInvalid.document;
    const result = await broker
      .forSite('debug-coach')!
      .execute(SPECIALIZED, SPECIALIZED_V1, {
        idempotencyKey: document['idempotencyKey'] as string,
        input: document['input'],
        provenance: { promptApplied: document['promptApplied'] as boolean },
      });
    expect(result.error?.reason).toBe('INVALID_PROMPT_PROVENANCE');
    expect(fake.calls).toHaveLength(0);
  });

  it('validates provenance shape structurally', () => {
    expect(validatePromptProvenance(undefined)).toBeNull();
    expect(
      validatePromptProvenance({
        promptApplied: true,
        promptVersion: 'a.b-c_1',
      }),
    ).toBeNull();
    expect(validatePromptProvenance({ promptApplied: false })).toBeNull();
    expect(validatePromptProvenance({ promptApplied: true })).not.toBeNull();
    expect(
      validatePromptProvenance({ promptApplied: false, promptVersion: 'x' }),
    ).not.toBeNull();
    expect(PROMPT_VERSION_PATTERN.test('debug.analysis.v1')).toBe(true);
    expect(PROMPT_VERSION_PATTERN.test('has space')).toBe(false);
  });

  it('forwards an invalid trust-channel request without repairing it', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    const input = requestTrustInvalid.document['input'];
    const result = await broker
      .forSite('debug-coach')!
      .execute(SPECIALIZED, SPECIALIZED_V1, {
        idempotencyKey: 'consumer:debug:turn-20',
        input,
        provenance: { promptApplied: true, promptVersion: 'debug.analysis.v1' },
      });
    // The host forwarded the request unmodified; the bridge is the one that rejects it.
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.request['input']).toEqual(input);
    expect(result.status).toBe('FAILED');
    expect(result.error?.reason).toBe('MALFORMED_ENVELOPE');
  });

  it('keeps logical prompt provenance stable across a reliability retry/repair envelope', async () => {
    const fake = makeSpecializedPlugin({ specialized: { status: 'FAILED' } });
    const { broker } = await bootWithPlugin(fake.plugin);
    await broker.forSite('debug-coach')!.execute(
      SPECIALIZED,
      SPECIALIZED_V1,
      callArgs({
        provenance: { promptApplied: true, promptVersion: 'debug-v7' },
      }),
    );
    // Even when the bridge reports a failure from a repaired attempt, the logical request
    // provenance the host transported is unchanged.
    expect(fake.calls[0]!.request['promptVersion']).toBe('debug-v7');
    expect(fake.calls[0]!.request['promptApplied']).toBe(true);
  });
});

describe('specialized permission, spoof and kill-switch boundaries', () => {
  it('denies an unauthorized plugin caller with zero dispatch', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    const client = broker.forPlugin(pluginCaller([]));
    const result = await client!.execute(
      SPECIALIZED,
      SPECIALIZED_V1,
      callArgs(),
    );
    expect(result.status).toBe('FAILED');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
    expect(result.error?.reason).toBe('CALLER_NOT_PERMITTED');
    expect(fake.calls).toHaveLength(0);
  });

  it('denies a site caller granted only generic capabilities', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    const result = await broker
      .forSite('problem')!
      .execute(SPECIALIZED, SPECIALIZED_V1, callArgs());
    expect(result.error?.reason).toBe('CALLER_NOT_PERMITTED');
    expect(fake.calls).toHaveLength(0);
  });

  it('binds caller identity from the runtime, so a plugin cannot claim another identity', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    // A caller may not widen its own grants by asserting another plugin's manifest: `forPlugin`
    // mints identity from the *registered* manifest, and the invocation carries no identity.
    const impostor = broker.forPlugin(pluginCaller([]));
    expect(impostor!.callerKey).toBe('plugin.algoquest.learning-quests');
    const result = await impostor!.execute(
      SPECIALIZED,
      SPECIALIZED_V1,
      callArgs(),
    );
    expect(result.error?.reason).toBe('CALLER_NOT_PERMITTED');
    expect(fake.calls).toHaveLength(0);

    // The authorized caller's identity comes from the broker, not the request body.
    await broker
      .forSite('debug-coach')!
      .execute(SPECIALIZED, SPECIALIZED_V1, callArgs());
    expect(fake.calls[0]!.trusted['callerPluginId']).toBe('site.debug-coach');
  });

  it('applies a capability kill switch with zero provider calls', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    broker.setKillSwitch({
      global: false,
      providers: [],
      capabilities: [SPECIALIZED],
    });
    const result = await broker
      .forSite('debug-coach')!
      .execute(SPECIALIZED, SPECIALIZED_V1, callArgs());
    expect(result.error?.code).toBe('UNAVAILABLE');
    expect(result.error?.reason).toBe('KILL_SWITCH_CAPABILITY');
    expect(fake.calls).toHaveLength(0);
  });

  it('applies the global and provider kill switches', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    broker.setKillSwitch({ global: true, providers: [], capabilities: [] });
    expect(broker.getCapabilityStatus(SPECIALIZED)).toBe('DISABLED');
    const globalResult = await broker
      .forSite('debug-coach')!
      .execute(SPECIALIZED, SPECIALIZED_V1, callArgs());
    expect(globalResult.error?.reason).toBe('KILL_SWITCH_GLOBAL');

    broker.setKillSwitch({
      global: false,
      providers: [AI_BRIDGE_PROVIDER_ID],
      capabilities: [],
    });
    const providerResult = await broker
      .forSite('debug-coach')!
      .execute(SPECIALIZED, SPECIALIZED_V1, callArgs());
    expect(providerResult.error?.reason).toBe('KILL_SWITCH_PROVIDER');
    expect(fake.calls).toHaveLength(0);
  });
});

describe('specialized failure mapping, cancellation and attribution', () => {
  it('passes the specialized failure vocabulary through instead of a generic 500', async () => {
    const fake = makeSpecializedPlugin({
      specialized: {
        status: 'FAILED',
        output: undefined,
        error: schemaMismatch.document['error'] as never,
        warnings: schemaMismatch.document['warnings'] as never,
      },
    });
    const { broker } = await bootWithPlugin(fake.plugin);
    const result = await broker
      .forSite('debug-coach')!
      .execute(SPECIALIZED, SPECIALIZED_V1, callArgs());
    expect(result.status).toBe('FAILED');
    expect(result.error?.code).toBe('SCHEMA_MISMATCH');
    expect(result.error?.reason).toBe('OUTPUT_REPAIR_EXHAUSTED');
    expect(result.error?.stage).toBe('VALIDATION');
    expect(result.warnings?.[0]?.code).toBe('OUTPUT_REPAIRED');
  });

  it('preserves every closed error code a specialized call may return', async () => {
    // The host must never collapse a governance/validation failure into a generic INTERNAL/500.
    const codes = [
      'SCHEMA_MISMATCH',
      'INVALID_RESPONSE',
      'CONTENT_BLOCKED',
      'RATE_LIMITED',
    ] as const;
    for (const code of codes) {
      const fake = makeSpecializedPlugin({
        specialized: {
          status: 'FAILED',
          output: undefined,
          error: { code, message: 'normalized', retryable: false } as never,
        },
      });
      const { broker } = await bootWithPlugin(fake.plugin);
      const result = await broker
        .forSite('debug-coach')!
        .execute(SPECIALIZED, SPECIALIZED_V1, callArgs());
      expect(result.status).toBe('FAILED');
      expect(result.error?.code).toBe(code);
    }
  });

  it('passes an operator-facing provider failure through untouched', async () => {
    const fake = makeSpecializedPlugin({
      specialized: {
        status: 'FAILED',
        output: undefined,
        error: balanceExhausted.document['error'] as never,
      },
    });
    const { broker } = await bootWithPlugin(fake.plugin);
    const result = await broker
      .forSite('debug-coach')!
      .execute(SPECIALIZED, SPECIALIZED_V1, callArgs());
    expect(result.error?.code).toBe('PROVIDER_ERROR');
    expect(result.error?.reason).toBe('PROVIDER_BALANCE_EXHAUSTED');
    expect(result.error?.retryable).toBe(false);
    expect(result.error?.stage).toBe('PROVIDER');
  });

  it('propagates host cancellation into the bridge execute options', async () => {
    const fake = makeSpecializedPlugin();
    const { broker } = await bootWithPlugin(fake.plugin);
    const controller = new AbortController();
    controller.abort();
    await broker.forSite('debug-coach')!.execute(SPECIALIZED, SPECIALIZED_V1, {
      ...callArgs(),
      signal: controller.signal,
    });
    const cancellation = (
      fake.calls[0]!.options as { cancellation?: { cancelled: boolean } }
    ).cancellation;
    expect(cancellation?.cancelled).toBe(true);
  });

  it('attributes usage to the logical capability and trusted caller, never the primitive', async () => {
    const captured: { text: string; params?: readonly unknown[] }[] = [];
    const sql: SqlQueryLike = {
      query: (text, params) => {
        captured.push(params === undefined ? { text } : { text, params });
        return Promise.resolve({ rows: [] });
      },
    };
    const ledger = createPostgresUsageLedger(sql);
    await ledger.appendRequest({
      usageRecordId: 'ur-1',
      logicalRequestId: 'lr-1',
      requestId: 'rq-1',
      callerPluginId: 'site.debug-coach',
      capability: SPECIALIZED,
      capabilityVersion: SPECIALIZED_V1,
      promptApplied: true,
      promptVersion: 'debug.analysis.v1',
    } as LogicalRequestUsageRecordLike);

    const params = captured[0]?.params ?? [];
    expect(params).toContain(SPECIALIZED);
    expect(params).not.toContain('ai.structured.generate');
    expect(params).toContain('site.debug-coach');
    expect(
      params.some(
        (param) =>
          typeof param === 'string' && param.includes('debug.analysis.v1'),
      ),
    ).toBe(true);
  });
});

describe('idempotency key fidelity', () => {
  it('keeps distinct colon-delimited identities distinct and never lossy-sanitizes', async () => {
    const capturedKeys: string[] = [];
    const fakeRedis = {
      eval: (...args: unknown[]) => {
        capturedKeys.push(String(args[2]));
        return Promise.resolve(['PROCEED', false]);
      },
      hgetall: () => Promise.resolve({}),
      pttl: () => Promise.resolve(-2),
    };
    const store = createRedisIdempotencyStore(
      fakeRedis as unknown as RedisEvalLike,
      deriveStoreEncryptionKey('unit-test-store-secret'),
    );
    const base = {
      fingerprint: 'fp-1',
      status: 'IN_FLIGHT' as const,
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + 60_000,
      logicalRequestId: 'lr-1',
    };
    await store.claim({ ...base, identity: 'consumer:debug:turn-18' });
    await store.claim({ ...base, identity: 'consumer:debug:turn-19' });
    await store.claim({ ...base, identity: 'consumer:debug:turn-18' });

    // Distinct keys stay distinct; the same key is stable.
    expect(capturedKeys[0]).not.toBe(capturedKeys[1]);
    expect(capturedKeys[0]).toBe(capturedKeys[2]);
    // The identity is carried as a stable digest, so no opaque label is dropped or rewritten.
    expect(capturedKeys[0]).not.toContain('consumer:debug');
  });
});

describe('optional subsystem posture', () => {
  it('boots without AI and reports the specialized capability unavailable', async () => {
    const app = Fastify({ logger: false });
    const broker = new CapabilityBroker({ maxTimeoutMs: 30_000 });
    registerDefaultSiteAiCallers(broker);
    const handle = await registerAiModule(app, {
      broker,
      logger: silentLogger,
      env: {},
    });
    expect(handle.status().kind).toBe('NO_CONFIG');
    expect(broker.getCapabilityStatus(SPECIALIZED)).toBe('UNAVAILABLE');
    expect(
      broker
        .listAvailableCapabilities()
        .some((entry) => entry.id === SPECIALIZED),
    ).toBe(false);
  });
});
