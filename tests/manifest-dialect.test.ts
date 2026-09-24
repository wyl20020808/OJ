import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROBLEM_SOLVE_EDITOR_SLOT,
  PluginHost,
  capabilityRefId,
  isCapabilityRef,
  parsePluginManifest,
} from '@ojplatform/plugin-sdk';

/**
 * Stage 6 manifest evolution: the canonical dialect grew capability declarations and a legacy
 * `pluginApiVersion` alias — without regressing the existing OnlineCodeEditor manifest shape.
 */

const browserManifest = {
  id: 'ojplatform.online-code-editor',
  name: 'Online Code Editor',
  version: '0.1.0',
  apiVersion: '1',
  entry: './dist/plugin.js',
  contributes: { slots: [PROBLEM_SOLVE_EDITOR_SLOT] },
};

const serverManifest = {
  id: 'ai.bridge',
  name: 'AI Bridge',
  version: '0.2.0',
  apiVersion: 1,
  entry: '@aibridge/host',
  contributes: { slots: [] },
  providesCapabilities: ['ai.text.generate@1.x', 'ai.structured.generate@1.x'],
  consumesCapabilities: [],
};

describe('canonical manifest parsing (Stage 6)', () => {
  it('accepts the canonical server-capability dialect', () => {
    const manifest = parsePluginManifest(serverManifest);
    expect(manifest?.id).toBe('ai.bridge');
    expect(manifest?.providesCapabilities).toEqual(['ai.text.generate@1.x', 'ai.structured.generate@1.x']);
    expect(manifest?.consumesCapabilities).toEqual([]);
    expect(manifest?.contributes.slots).toEqual([]);
    expect(manifest?.entry).toBe('@aibridge/host');
  });

  it('defaults omitted contributes to an empty slot list', () => {
    const { contributes: _omitted, ...withoutContributes } = serverManifest;
    const manifest = parsePluginManifest(withoutContributes);
    expect(manifest?.contributes.slots).toEqual([]);
  });

  it('accepts a null entry only when no slots are declared', () => {
    const manifest = parsePluginManifest({ ...serverManifest, entry: null });
    expect(manifest?.entry).toBeNull();
    expect(parsePluginManifest({ ...browserManifest, entry: null })).toBeNull();
    expect(parsePluginManifest({ ...serverManifest, entry: '' })).toBeNull();
  });

  it('still rejects a present-but-malformed contributes', () => {
    expect(parsePluginManifest({ ...browserManifest, contributes: {} })).toBeNull();
    expect(parsePluginManifest({ ...browserManifest, contributes: { slots: 'nope' } })).toBeNull();
    expect(parsePluginManifest({ ...browserManifest, contributes: { slots: [42] } })).toBeNull();
  });

  it('still rejects an unsupported apiVersion', () => {
    expect(parsePluginManifest({ ...serverManifest, apiVersion: '2' })).toBeNull();
    expect(parsePluginManifest({ ...serverManifest, apiVersion: 0 })).toBeNull();
  });

  it('accepts the legacy pluginApiVersion alias and normalizes it', () => {
    const legacy = {
      id: 'legacy.consumer',
      name: 'Legacy Consumer',
      version: '1.0.0',
      pluginApiVersion: 1,
      providesCapabilities: [],
      consumesCapabilities: ['ai.structured.generate@1.x'],
    };
    const manifest = parsePluginManifest(legacy);
    expect(manifest?.apiVersion).toBe(1);
    expect(manifest?.consumesCapabilities).toEqual(['ai.structured.generate@1.x']);
    expect(manifest?.providesCapabilities).toEqual([]);
    expect(manifest?.entry).toBeNull();
  });

  it('rejects conflicting apiVersion / pluginApiVersion pairs', () => {
    expect(
      parsePluginManifest({ ...serverManifest, pluginApiVersion: 2 }),
    ).toBeNull();
    // Agreeing values are accepted (harmless duplicate declaration).
    const agreeing = parsePluginManifest({ ...serverManifest, pluginApiVersion: 1 });
    expect(agreeing?.apiVersion).toBe(1);
  });

  it('rejects malformed capability references', () => {
    expect(parsePluginManifest({ ...serverManifest, providesCapabilities: ['AI.Text.Generate'] })).toBeNull();
    expect(parsePluginManifest({ ...serverManifest, providesCapabilities: ['ai.text.generate@0.x'] })).toBeNull();
    expect(parsePluginManifest({ ...serverManifest, providesCapabilities: 'ai.text.generate' })).toBeNull();
    expect(parsePluginManifest({ ...serverManifest, consumesCapabilities: ['openai.*'] })).toBeNull();
  });
});

describe('capability references', () => {
  it('validates and projects references', () => {
    expect(isCapabilityRef('ai.text.generate')).toBe(true);
    expect(isCapabilityRef('ai.structured.generate@1')).toBe(true);
    expect(isCapabilityRef('ai.structured.generate@1.x')).toBe(true);
    expect(isCapabilityRef('education.idea.evaluate@1')).toBe(true);
    expect(isCapabilityRef('Not.A.Ref')).toBe(false);
    expect(isCapabilityRef('a..b')).toBe(false);
    expect(isCapabilityRef('a')).toBe(false);
    expect(capabilityRefId('ai.text.generate@1.x')).toBe('ai.text.generate');
    expect(capabilityRefId('ai.text.generate')).toBe('ai.text.generate');
  });
});

describe('OnlineCodeEditor regression', () => {
  it('the checked-in OnlineCodeEditor manifest parses identically to the V1 shape', () => {
    const document = JSON.parse(
      readFileSync(resolve('plugins/OnlineCodeEditor/plugin.manifest.json'), 'utf8'),
    ) as Record<string, unknown>;
    const manifest = parsePluginManifest(document);
    expect(manifest?.id).toBe('ojplatform.online-code-editor');
    expect(manifest?.apiVersion).toBe('1');
    expect(manifest?.entry).toBe('./src/plugin.ts');
    expect(manifest?.contributes.slots).toEqual(['problem.solve.editor']);
    // V1 fields still default cleanly.
    expect(manifest?.providesCapabilities).toEqual([]);
    expect(manifest?.consumesCapabilities).toEqual([]);
  });

  it('browser plugin registration is unchanged', () => {
    const host = new PluginHost();
    const registration = host.register(browserManifest, {
      id: browserManifest.id,
      version: browserManifest.version,
      apiVersion: 1,
      activate: () => ({
        slot: PROBLEM_SOLVE_EDITOR_SLOT,
        render: () => 'editor',
      }),
    });
    expect(registration?.manifest.id).toBe(browserManifest.id);
    expect(host.contributions(PROBLEM_SOLVE_EDITOR_SLOT)).toHaveLength(1);
  });
});
