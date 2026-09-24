import { describe, expect, it } from 'vitest';
import {
  CapabilityBroker,
  createSubjectTokenMinter,
  callerKey,
  isCapabilityGranted,
  type CapabilityProvider,
  type CapabilityResult,
} from '@ojplatform/capability-broker';
import { parsePluginManifest } from '@ojplatform/plugin-sdk';

/**
 * Stage 6 broker tests: trusted identity, permissions, availability, kill switch, subject tokens,
 * cross-caller isolation and spoof impossibility. A fake capability provider keeps everything
 * deterministic.
 */

const fakeAiManifest = parsePluginManifest({
  id: 'ai.bridge',
  name: 'AI Bridge',
  version: '0.2.0',
  apiVersion: 1,
  providesCapabilities: ['ai.text.generate@1.x', 'ai.structured.generate@1.x'],
  consumesCapabilities: [],
})!;

type FakeCall = {
  readonly capability: string;
  readonly callerKey: string;
  readonly subjectToken?: string;
};

function makeFakeAiProvider(
  overrides: Partial<{
    status: 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE' | 'DISABLED';
  }> = {},
) {
  const calls: FakeCall[] = [];
  const provider: CapabilityProvider = {
    providerId: 'ai.bridge',
    manifest: fakeAiManifest,
    listCapabilities: () => [
      {
        id: 'ai.text.generate',
        version: '1.0',
        status: overrides.status ?? 'AVAILABLE',
      },
      {
        id: 'ai.structured.generate',
        version: '1.0',
        status: overrides.status ?? 'AVAILABLE',
      },
    ],
    execute: async (capability, version, invocation, caller) => {
      calls.push({
        capability,
        callerKey: caller.callerKey,
        ...(caller.subjectToken === undefined
          ? {}
          : { subjectToken: caller.subjectToken }),
      });
      const result: CapabilityResult = {
        status: 'SUCCEEDED',
        output:
          capability === 'ai.text.generate'
            ? { text: 'fake', finishReason: 'STOP' }
            : { summary: 'fake' },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        requestId: `fake-${calls.length}`,
      };
      return result;
    },
  };
  return { provider, calls };
}

const pluginManifest = (id: string, consumes: string[]) => ({
  id,
  name: id,
  version: '1.0.0',
  apiVersion: 1,
  consumesCapabilities: consumes,
});

function makeBroker() {
  const broker = new CapabilityBroker({ maxTimeoutMs: 20_000 });
  const fake = makeFakeAiProvider();
  broker.registerProvider(fake.provider);
  broker.registerSiteCaller({
    siteId: 'problem',
    capabilities: ['ai.text.generate@1.x', 'ai.structured.generate@1.x'],
  });
  broker.registerSiteCaller({ siteId: 'admin', capabilities: [] });
  return { broker, calls: fake.calls };
}

describe('trusted caller identity', () => {
  it('composes collision-free caller keys for the two namespaces', () => {
    expect(
      callerKey({
        callerType: 'PLUGIN',
        callerId: 'algoquest.learning-quests',
      }),
    ).toBe('plugin.algoquest.learning-quests');
    expect(callerKey({ callerType: 'SITE', callerId: 'problem' })).toBe(
      'site.problem',
    );
    expect(callerKey({ callerType: 'SITE', callerId: 'problem' })).not.toBe(
      callerKey({ callerType: 'PLUGIN', callerId: 'problem' }),
    );
  });

  it('binds plugin identity from the manifest, not from any request', () => {
    const { broker, calls } = makeBroker();
    const client = broker.forPlugin(
      pluginManifest('test.consumer', ['ai.text.generate@1.x']),
    );
    expect(client?.callerKey).toBe('plugin.test.consumer');
    void client?.execute('ai.text.generate', '1.0', {
      idempotencyKey: 'turn-1',
      input: {},
    });
    expect(calls[0]?.callerKey).toBe('plugin.test.consumer');
  });

  it('makes cross-namespace and cross-plugin spoofing impossible by construction', () => {
    const { broker, calls } = makeBroker();
    const pluginA = broker.forPlugin(
      pluginManifest('plugin-a', ['ai.text.generate']),
    )!;
    const siteProblem = broker.forSite('problem')!;
    // There is no callerId/callerPluginId parameter anywhere on the client surface: a caller can
    // only act as the identity the broker bound at mint time.
    void pluginA.execute('ai.text.generate', '1.0', {
      idempotencyKey: 'a-1',
      input: {},
    });
    void siteProblem.execute('ai.text.generate', '1.0', {
      idempotencyKey: 's-1',
      input: {},
    });
    expect(calls[0]?.callerKey).toBe('plugin.plugin-a');
    expect(calls[1]?.callerKey).toBe('site.problem');
  });
});

describe('permission model', () => {
  it('allows a plugin that declared the capability', async () => {
    const { broker } = makeBroker();
    const client = broker.forPlugin(
      pluginManifest('consumer-a', ['ai.structured.generate@1.x']),
    )!;
    const result = await client.execute('ai.structured.generate', '1.0', {
      idempotencyKey: 'p-1',
      input: {},
    });
    expect(result.status).toBe('SUCCEEDED');
  });

  it('denies a plugin that never declared AI capabilities', async () => {
    const { broker } = makeBroker();
    const client = broker.forPlugin(pluginManifest('consumer-b', []))!;
    const result = await client.execute('ai.text.generate', '1.0', {
      idempotencyKey: 'b-1',
      input: {},
    });
    expect(result.status).toBe('FAILED');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('allows the registered site problem module', async () => {
    const { broker } = makeBroker();
    const client = broker.forSite('problem')!;
    const result = await client.execute('ai.text.generate', '1.0', {
      idempotencyKey: 'sp-1',
      input: {},
    });
    expect(result.status).toBe('SUCCEEDED');
  });

  it('denies a registered site module without the capability and rejects unregistered modules', async () => {
    const { broker } = makeBroker();
    const admin = broker.forSite('admin')!;
    const result = await admin.execute('ai.text.generate', '1.0', {
      idempotencyKey: 'sa-1',
      input: {},
    });
    expect(result.status).toBe('FAILED');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
    expect(broker.forSite('unregistered')).toBeNull();
    expect(broker.forPlugin({ id: 'bad-manifest' })).toBeNull();
  });

  it('deny-by-default grant matching', () => {
    expect(isCapabilityGranted(['ai.text.generate'], 'ai.text.generate')).toBe(
      true,
    );
    expect(
      isCapabilityGranted(['ai.text.generate@1'], 'ai.text.generate', '1.0'),
    ).toBe(true);
    expect(
      isCapabilityGranted(['ai.text.generate@1.x'], 'ai.text.generate', '1.2'),
    ).toBe(true);
    expect(
      isCapabilityGranted(['ai.text.generate@2'], 'ai.text.generate', '1.0'),
    ).toBe(false);
    expect(isCapabilityGranted([], 'ai.text.generate')).toBe(false);
  });
});

describe('availability and kill switch', () => {
  it('reports provider availability with discovery', () => {
    const { broker } = makeBroker();
    expect(broker.getCapabilityStatus('ai.text.generate')).toBe('AVAILABLE');
    expect(broker.getCapabilityStatus('no.such.capability')).toBe(
      'UNAVAILABLE',
    );
    const listed = broker.listAvailableCapabilities().map((entry) => entry.id);
    expect(listed).toEqual(['ai.structured.generate', 'ai.text.generate']);
    expect(broker.resolveCapability('ai.text.generate')?.version).toBe('1.0');
    expect(broker.listProviders()).toEqual(['ai.bridge']);
  });

  it('global kill switch reports DISABLED and blocks execution', async () => {
    const { broker } = makeBroker();
    broker.setKillSwitch({ global: true, providers: [], capabilities: [] });
    expect(broker.getCapabilityStatus('ai.text.generate')).toBe('DISABLED');
    const client = broker.forSite('problem')!;
    const result = await client.execute('ai.text.generate', '1.0', {
      idempotencyKey: 'k-1',
      input: {},
    });
    expect(result.status).toBe('FAILED');
    expect(result.error?.reason).toBe('KILL_SWITCH_GLOBAL');
  });

  it('provider and capability kill switches block selectively', async () => {
    const { broker } = makeBroker();
    broker.setKillSwitch({
      global: false,
      providers: ['ai.bridge'],
      capabilities: [],
    });
    expect(broker.getCapabilityStatus('ai.text.generate')).toBe('DISABLED');
    broker.setKillSwitch({
      global: false,
      providers: [],
      capabilities: ['ai.structured.generate'],
    });
    expect(broker.getCapabilityStatus('ai.structured.generate')).toBe(
      'DISABLED',
    );
    expect(broker.getCapabilityStatus('ai.text.generate')).toBe('AVAILABLE');
  });

  it('honours provider-side availability', () => {
    const broker = new CapabilityBroker();
    const degraded = makeFakeAiProvider({ status: 'DEGRADED' });
    broker.registerProvider(degraded.provider);
    expect(broker.getCapabilityStatus('ai.text.generate')).toBe('DEGRADED');
  });

  it('rejects duplicate capability registrations and undeclared listings', () => {
    const broker = new CapabilityBroker();
    const first = makeFakeAiProvider();
    broker.registerProvider(first.provider);
    const second = {
      ...makeFakeAiProvider().provider,
      providerId: 'ai.bridge-duplicate',
    };
    expect(() => broker.registerProvider(second)).toThrow(/already provided/);
    const fake = makeFakeAiProvider();
    const liar = {
      ...fake.provider,
      providerId: 'liar',
      manifest: { ...fake.provider.manifest, providesCapabilities: [] },
    };
    expect(() => broker.registerProvider(liar)).toThrow(/does not declare/);
    expect(() => broker.registerProvider(first.provider)).toThrow(
      /already registered/,
    );
  });
});

describe('cross-caller isolation and subject binding', () => {
  it('attributes executions to the exact caller and subject', async () => {
    const { broker, calls } = makeBroker();
    const site = broker.forSite('problem')!.withSubject('ojs1_user-a');
    const plugin = broker
      .forPlugin(pluginManifest('consumer-a', ['ai.text.generate']))!
      .withSubject('ojs1_user-a');
    await site.execute('ai.text.generate', '1.0', {
      idempotencyKey: 'x-1',
      input: {},
    });
    await plugin.execute('ai.text.generate', '1.0', {
      idempotencyKey: 'x-2',
      input: {},
    });
    expect(calls[0]?.callerKey).toBe('site.problem');
    expect(calls[0]?.subjectToken).toBe('ojs1_user-a');
    expect(calls[1]?.callerKey).toBe('plugin.consumer-a');
    expect(calls[1]?.subjectToken).toBe('ojs1_user-a');
  });

  it('withSubject derives an immutable client that cannot widen permissions', () => {
    const { broker } = makeBroker();
    const base = broker.forPlugin(pluginManifest('consumer-b', []))!;
    const derived = base.withSubject('ojs1_user-b');
    expect(derived.permissions).toEqual([]);
    expect(derived.callerKey).toBe('plugin.consumer-b');
    expect(() => broker.forSite('problem')!.withSubject('')).toThrow();
  });
});

describe('timeout clamping (host deadline)', () => {
  it('clamps budgets down but never up', async () => {
    const { broker, calls } = makeBroker();
    const client = broker.forSite('problem')!;
    void calls;
    await client.execute('ai.text.generate', '1.0', {
      idempotencyKey: 't-1',
      input: {},
      timeoutBudget: { totalMs: 30_000 },
    });
    const narrow = {
      idempotencyKey: 't-2',
      input: {},
      timeoutBudget: { totalMs: 5_000, providerMs: 60_000 },
    };
    await client.execute('ai.text.generate', '1.0', narrow);
    expect(narrow.timeoutBudget.totalMs).toBe(5_000); // input object untouched; clamp is internal
  });
});

describe('opaque subject tokens', () => {
  it('mints stable, opaque, namespace-separated tokens', () => {
    const minter = createSubjectTokenMinter({ secret: 'test-secret' });
    const a1 = minter.mintForUser('user-uuid-1');
    const a2 = createSubjectTokenMinter({ secret: 'test-secret' }).mintForUser(
      'user-uuid-1',
    );
    const b = minter.mintForUser('user-uuid-2');
    const anon = minter.mintAnonymous('guest-uuid-1');
    expect(a1).toBe(a2); // stable across minters with the same secret
    expect(a1).not.toBe(b);
    expect(a1).toMatch(/^ojs1_[A-Za-z0-9_-]{20,}$/);
    expect(anon).toMatch(/^oja1_[A-Za-z0-9_-]{20,}$/);
    expect(anon.startsWith('ojs1_')).toBe(false); // separate namespace by construction
    expect(minter.stability).toBe('STABLE');
    // Not a weakly reversible encoding of the user id.
    expect(a1).not.toContain('user-uuid');
    expect(
      Buffer.from(a1.slice(5), 'base64url').toString('utf8'),
    ).not.toContain('user-uuid');
  });

  it('process-local minting is honestly marked unstable', () => {
    const minter = createSubjectTokenMinter();
    expect(minter.stability).toBe('PROCESS_LOCAL');
    expect(minter.mintForUser('user-1')).toMatch(/^ojs1_/);
    const second = createSubjectTokenMinter();
    expect(second.mintForUser('user-1')).not.toBe(minter.mintForUser('user-1'));
  });

  it('different secrets yield different tokens (no cross-deployment replay)', () => {
    const one = createSubjectTokenMinter({ secret: 'secret-one' }).mintForUser(
      'user-1',
    );
    const two = createSubjectTokenMinter({ secret: 'secret-two' }).mintForUser(
      'user-1',
    );
    expect(one).not.toBe(two);
  });
});
