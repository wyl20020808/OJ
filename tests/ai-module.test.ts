import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  CapabilityBroker,
  createSubjectTokenMinter,
} from '@ojplatform/capability-broker';
import {
  createAiBridgeCapabilityProvider,
  AIBRIDGE_REQUEST_CONTRACT_VERSION,
} from '../apps/api/src/modules/ai/provider.js';
import {
  registerAiModule,
  registerDefaultSiteAiCallers,
  AI_BRIDGE_PROVIDER_ID,
} from '../apps/api/src/modules/ai/index.js';
import { createSiteAiClient } from '../apps/api/src/modules/ai/site-ai.js';
import { createEnvSecretStore } from '../apps/api/src/modules/ai/secrets.js';
import type {
  AiBridgeHostModuleLike,
  AiBridgePluginLike,
  AiBridgeSuiteModuleLike,
  AiResultLike,
  CapabilityDescriptorLike,
} from '../apps/api/src/modules/ai/types.js';

/**
 * Stage 6 AI module boot tests. A scripted fake AI Bridge plugin (structural shape only — never
 * an `@aibridge/*` import) lets the full broker → module → provider → bridge path run
 * deterministically, including trusted-context composition and governance wiring.
 */

type RecordedCall = {
  readonly request: Record<string, unknown>;
  readonly trusted: Record<string, unknown>;
};

function makeFakePlugin(script: Partial<AiResultLike> = {}) {
  const calls: RecordedCall[] = [];
  const descriptors: CapabilityDescriptorLike[] = [
    { id: 'ai.text.generate', version: '1.0', status: 'AVAILABLE' },
    { id: 'ai.structured.generate', version: '1.0', status: 'AVAILABLE' },
  ];
  const reloads: unknown[] = [];
  const plugin: AiBridgePluginLike = {
    id: AI_BRIDGE_PROVIDER_ID,
    providesCapabilities: [
      'ai.text.generate@1.x',
      'ai.structured.generate@1.x',
    ],
    execute: (request, trustedContext) => {
      calls.push({
        request: request as Record<string, unknown>,
        trusted: trustedContext as Record<string, unknown>,
      });
      return Promise.resolve({
        status: 'SUCCEEDED',
        output: { text: 'fake answer', finishReason: 'STOP' },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        latencyMs: 3,
        requestId: (request as { requestId: string }).requestId,
        ...script,
      });
    },
    listCapabilities: () => descriptors,
    status: () => ({ status: 'ACTIVE' }),
    reload: (candidate) => {
      reloads.push(candidate);
      return Promise.resolve({ ok: true });
    },
    diagnostics: () => [],
    configSnapshot: () => ({
      configVersion: 'cfg-1',
      contentDigest: 'digest-1',
    }),
    dispose: () => undefined,
  };
  return { plugin, calls, reloads };
}

function makeHostModule(
  fake: ReturnType<typeof makeFakePlugin>,
): AiBridgeHostModuleLike {
  return {
    AIBRIDGE_PLUGIN_ID: AI_BRIDGE_PROVIDER_ID,
    createAiBridgeServerPlugin: () =>
      Promise.resolve({ ok: true, value: fake.plugin }),
  };
}

const fakeSuite: AiBridgeSuiteModuleLike = {
  SUITE_ADAPTER_FACTORIES: {},
  suiteResolveEndpoint: () => 'https://example.invalid/v1',
};

const VALID_CONFIG = JSON.stringify({
  providers: [],
  routes: [],
  governance: {},
});

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

async function bootModule(
  env: Record<string, string>,
  host?: AiBridgeHostModuleLike,
) {
  const app = Fastify({ logger: false });
  const broker = new CapabilityBroker({ maxTimeoutMs: 30_000 });
  registerDefaultSiteAiCallers(broker);
  const handle = await registerAiModule(app, {
    broker,
    logger: silentLogger,
    env,
    ...(host === undefined
      ? {}
      : { moduleOverrides: { hostModule: host, suiteModule: fakeSuite } }),
  });
  return { app, broker, handle };
}

describe('AI module boot posture (optional infrastructure)', () => {
  it('no configuration → NO_CONFIG, provider unregistered, site boots', async () => {
    const { broker, handle } = await bootModule({});
    expect(handle.status()).toEqual({ kind: 'NO_CONFIG' });
    expect(broker.getCapabilityStatus('ai.text.generate')).toBe('UNAVAILABLE');
    expect(broker.listProviders()).toEqual([]);
  });

  it('environment kill switch → whole broker DISABLED', async () => {
    const { broker, handle } = await bootModule({
      OJPLATFORM_AI_DISABLED: 'true',
    });
    expect(handle.status()).toEqual({ kind: 'DISABLED_BY_ENV' });
    expect(broker.getCapabilityStatus('ai.text.generate')).toBe('DISABLED');
    const client = broker.forSite('problem');
    const result = await client?.execute('ai.text.generate', '1.0', {
      idempotencyKey: 'k',
      input: {},
    });
    expect(result?.status).toBe('FAILED');
    expect(result?.error?.reason).toBe('KILL_SWITCH_GLOBAL');
  });

  it('configuration present but artifacts not installed → ARTIFACTS_ABSENT', async () => {
    // No moduleOverrides: the real loader resolves node_modules, where @aibridge/* is absent.
    const { broker, handle } = await bootModule({
      OJPLATFORM_AI_CONFIG_JSON: VALID_CONFIG,
    });
    expect(handle.status().kind).toBe('ARTIFACTS_ABSENT');
    expect(broker.listProviders()).toEqual([]);
  });

  it('invalid configuration JSON → CONFIG_UNREADABLE, site boots', async () => {
    const { handle } = await bootModule({
      OJPLATFORM_AI_CONFIG_JSON: '{not json',
    });
    expect(handle.status().kind).toBe('CONFIG_UNREADABLE');
  });

  it('bridge rejecting the configuration → CONFIG_REJECTED', async () => {
    const rejectingHost: AiBridgeHostModuleLike = {
      AIBRIDGE_PLUGIN_ID: AI_BRIDGE_PROVIDER_ID,
      createAiBridgeServerPlugin: () =>
        Promise.resolve({
          ok: false,
          failure: {
            issues: [
              {
                code: 'INVALID_TYPE',
                path: '$.providers',
                message: 'must be an array',
              },
            ],
          },
        }),
    };
    const { handle } = await bootModule(
      { OJPLATFORM_AI_CONFIG_JSON: VALID_CONFIG },
      rejectingHost,
    );
    const status = handle.status();
    expect(status.kind).toBe('CONFIG_REJECTED');
    if (status.kind === 'CONFIG_REJECTED') {
      expect(status.error).toContain('INVALID_TYPE');
    }
  });

  it('valid config + artifacts → ACTIVE, provider registered, end-to-end call works', async () => {
    const fake = makeFakePlugin();
    const { broker, handle } = await bootModule(
      {
        OJPLATFORM_AI_CONFIG_JSON: VALID_CONFIG,
        OJPLATFORM_AI_SUBJECT_HMAC_KEY: 'test-operator-secret',
      },
      makeHostModule(fake),
    );
    expect(handle.status()).toEqual({
      kind: 'ACTIVE',
      configVersion: 'cfg-1',
      contentDigest: 'digest-1',
    });
    expect(broker.listProviders()).toEqual([AI_BRIDGE_PROVIDER_ID]);
    expect(broker.getCapabilityStatus('ai.text.generate')).toBe('AVAILABLE');

    const site = handle.siteClient('problem');
    expect(site?.callerKey).toBe('site.problem');
    const token = handle.subjectTokens.mintForUser('user-1');
    const result = await site?.generateText({
      idempotencyKey: 'turn-1',
      input: { messages: [{ role: 'user', content: 'hello' }] },
      subjectToken: token,
    });
    expect(result?.status).toBe('SUCCEEDED');
    expect(result?.output).toEqual({
      text: 'fake answer',
      finishReason: 'STOP',
    });
    expect(result?.usage?.totalTokens).toBe(15);

    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0]!;
    // Envelope: frozen contract version, caller-scoped idempotency, capability + version.
    expect(call.request['contractVersion']).toBe(
      AIBRIDGE_REQUEST_CONTRACT_VERSION,
    );
    expect(call.request['idempotencyKey']).toBe('turn-1');
    expect(call.request['capability']).toBe('ai.text.generate');
    expect(call.request['capabilityVersion']).toBe('1.0');
    expect(typeof call.request['requestId']).toBe('string');
    // Trusted context: broker-composed identity, grants, opaque subject — nothing consumer-shaped.
    expect(call.trusted['callerPluginId']).toBe('site.problem');
    expect(call.trusted['grantedPermissions']).toEqual([
      'ai.text.generate@1.x',
      'ai.structured.generate@1.x',
    ]);
    expect(call.trusted['subjectToken']).toBe(token);
  });

  it('plugin caller path: manifest-declared grants reach the bridge verbatim', async () => {
    const fake = makeFakePlugin();
    const { broker } = await bootModule(
      { OJPLATFORM_AI_CONFIG_JSON: VALID_CONFIG },
      makeHostModule(fake),
    );
    const plugin = broker.forPlugin({
      id: 'algoquest.learning-quests',
      name: 'Learning Quests',
      version: '1.0.0',
      apiVersion: 1,
      consumesCapabilities: ['ai.structured.generate@1.x'],
    });
    const result = await plugin?.execute('ai.structured.generate', '1.0', {
      idempotencyKey: 'aq-1',
      input: {},
    });
    expect(result?.status).toBe('SUCCEEDED');
    expect(fake.calls[0]?.trusted['callerPluginId']).toBe(
      'plugin.algoquest.learning-quests',
    );
    expect(fake.calls[0]?.trusted['grantedPermissions']).toEqual([
      'ai.structured.generate@1.x',
    ]);
    // ...while a capability the plugin never declared is denied before any dispatch.
    const denied = await plugin?.execute('ai.text.generate', '1.0', {
      idempotencyKey: 'aq-2',
      input: {},
    });
    expect(denied?.error?.code).toBe('PERMISSION_DENIED');
    expect(fake.calls).toHaveLength(1);
  });

  it('reload delegates atomically to the bridge', async () => {
    const fake = makeFakePlugin();
    const { handle } = await bootModule(
      { OJPLATFORM_AI_CONFIG_JSON: VALID_CONFIG },
      makeHostModule(fake),
    );
    await handle.reload({
      providers: [],
      routes: [],
      governance: { note: 'v2' },
    });
    expect(fake.reloads).toHaveLength(1);
  });

  it('close unregisters the provider (capability goes back to UNAVAILABLE)', async () => {
    const fake = makeFakePlugin();
    const { broker, handle } = await bootModule(
      { OJPLATFORM_AI_CONFIG_JSON: VALID_CONFIG },
      makeHostModule(fake),
    );
    expect(broker.getCapabilityStatus('ai.text.generate')).toBe('AVAILABLE');
    handle.close();
    expect(broker.getCapabilityStatus('ai.text.generate')).toBe('UNAVAILABLE');
    expect(broker.listProviders()).toEqual([]);
  });
});

describe('capability provider bridge (unit)', () => {
  it('rejects capability references the manifest dialect cannot express', () => {
    const fake = makeFakePlugin();
    const bad: AiBridgePluginLike = {
      ...fake.plugin,
      providesCapabilities: ['Not.A.Ref'],
    };
    expect(() =>
      createAiBridgeCapabilityProvider(bad, {
        providerId: AI_BRIDGE_PROVIDER_ID,
        pluginVersion: 'test',
      }),
    ).toThrow();
  });

  it('bridges AbortSignal into a cancellation token', async () => {
    const fake = makeFakePlugin();
    let seenCancellation:
      | { cancelled: boolean; onCancel: (cb: () => void) => () => void }
      | undefined;
    const plugin: AiBridgePluginLike = {
      ...fake.plugin,
      execute: (_request, _trusted, options) => {
        seenCancellation = options?.cancellation;
        return Promise.resolve({
          status: 'SUCCEEDED',
          output: {},
          usage: {},
          latencyMs: 1,
          requestId: 'r',
        });
      },
    };
    const broker = new CapabilityBroker();
    broker.registerSiteCaller({
      siteId: 'problem',
      capabilities: ['ai.text.generate'],
    });
    broker.registerProvider(
      createAiBridgeCapabilityProvider(plugin, {
        providerId: AI_BRIDGE_PROVIDER_ID,
        pluginVersion: 'test',
      }),
    );
    const controller = new AbortController();
    const promise = broker
      .forSite('problem')!
      .execute('ai.text.generate', '1.0', {
        idempotencyKey: 'c-1',
        input: {},
        signal: controller.signal,
      });
    await promise;
    expect(seenCancellation).toBeDefined();
    expect(seenCancellation!.cancelled).toBe(false);
    let fired = false;
    seenCancellation!.onCancel(() => {
      fired = true;
    });
    controller.abort();
    expect(seenCancellation!.cancelled).toBe(true);
    expect(fired).toBe(true);
  });
});

describe('environment secret store', () => {
  it('resolves secret://env/ handles and nothing else', async () => {
    const store = createEnvSecretStore({ AIBRIDGE_RELAY_API_KEY: 'sk-test' });
    await expect(
      store.resolve('secret://env/AIBRIDGE_RELAY_API_KEY'),
    ).resolves.toBe('sk-test');
    await expect(
      store.has('secret://env/AIBRIDGE_RELAY_API_KEY'),
    ).resolves.toBe(true);
    await expect(store.resolve('secret://env/MISSING_KEY')).resolves.toBeNull();
    await expect(store.resolve('https://evil.example/key')).resolves.toBeNull();
    await expect(store.resolve('secret://env/not a name')).resolves.toBeNull();
  });
});

describe('site AI client', () => {
  it('is null for unregistered site ids and bound for registered ones', async () => {
    const { broker } = await bootModule({});
    expect(createSiteAiClient(broker, 'unregistered')).toBeNull();
    const client = createSiteAiClient(broker, 'problem');
    expect(client?.callerKey).toBe('site.problem');
  });

  it('subject tokens come from the module minter with stable/opaque shape', async () => {
    const { handle } = await bootModule({
      OJPLATFORM_AI_SUBJECT_HMAC_KEY: 'operator-secret',
    });
    expect(handle.subjectTokens.stability).toBe('STABLE');
    const token = handle.subjectTokens.mintForUser('user-9');
    expect(token).toMatch(/^ojs1_/);
    expect(
      createSubjectTokenMinter({ secret: 'operator-secret' }).mintForUser(
        'user-9',
      ),
    ).toBe(token);
  });
});
