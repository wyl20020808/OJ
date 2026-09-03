// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PluginHost, PROBLEM_SOLVE_EDITOR_SLOT, parsePluginManifest } from '../packages/plugin-sdk/src/index.js';
import { ProblemSolveEditorSlot } from '../apps/web/src/plugins/ProblemSolveEditorSlot.js';

const manifest = { id: 'ojplatform.online-code-editor', name: 'Online Code Editor', version: '0.1.0', apiVersion: '1', entry: './dist/plugin.js', contributes: { slots: [PROBLEM_SOLVE_EDITOR_SLOT] } };
const plugin = { id: manifest.id, version: manifest.version, apiVersion: 1, activate: () => ({ slot: PROBLEM_SOLVE_EDITOR_SLOT, render: (context: unknown) => <div>Editor {(context as { slug: string }).slug}</div> }) };

describe('Plugin Foundation V1', () => {
  afterEach(cleanup);
  it('rejects malformed and unsupported manifests', () => {
    expect(parsePluginManifest({ ...manifest, contributes: {} })).toBeNull();
    expect(parsePluginManifest({ ...manifest, apiVersion: '2' })).toBeNull();
  });
  it('registers contributions and supports enable/disable', () => {
    const host = new PluginHost();
    expect(host.register(manifest, plugin)?.manifest.id).toBe(manifest.id);
    expect(host.contributions(PROBLEM_SOLVE_EDITOR_SLOT)).toHaveLength(1);
    expect(host.setEnabled(manifest.id, false)).toBe(true);
    expect(host.contributions(PROBLEM_SOLVE_EDITOR_SLOT)).toHaveLength(0);
    expect(host.setEnabled(manifest.id, true)).toBe(true);
  });
  it('renders known slot and ignores unknown slot', () => {
    const host = new PluginHost();
    host.register(manifest, plugin);
    render(<ProblemSolveEditorSlot host={host} context={{ problemId: 'p1', slug: 'hello', samples: [] }} />);
    expect(screen.getByText('Editor hello')).toBeInTheDocument();
    cleanup();
    render(<ProblemSolveEditorSlot host={host} context={{ problemId: 'p1', slug: 'hello', samples: [] }} />);
    expect(host.contributions('unknown.slot')).toHaveLength(0);
  });
});
