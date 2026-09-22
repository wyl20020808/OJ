export const PLUGIN_API_VERSION = 1 as const;
export const PROBLEM_SOLVE_EDITOR_SLOT = 'problem.solve.editor' as const;
export const SUPPORTED_PLUGIN_SLOTS = [PROBLEM_SOLVE_EDITOR_SLOT] as const;
export type PluginSlot = (typeof SUPPORTED_PLUGIN_SLOTS)[number];
export type PublicProblemSample = {
  readonly input: string;
  readonly output: string;
};
export type ProblemSolveEditorContext = {
  readonly problemId: string;
  readonly slug: string;
  readonly samples: readonly PublicProblemSample[];
  readonly problemRevisionId?: string;
  readonly checker?: 'EXACT_BYTES' | 'TOKEN_WHITESPACE';
  readonly codeRunAdapter?: unknown;
  readonly submissionAdapter?: unknown;
  readonly onViewSubmission?: (submissionId: string) => void;
};
export type PluginContext = { readonly sdkVersion: string };
export type PluginContribution = {
  readonly slot: string;
  readonly render: (context: unknown) => unknown;
};
export type PluginManifest = {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly apiVersion: string | number;
  readonly entry: string;
  readonly contributes: { readonly slots: readonly string[] };
};
export type OJPlatformPlugin = {
  readonly id: string;
  readonly version: string;
  readonly apiVersion: string | number;
  readonly activate: (
    context: PluginContext,
  ) => PluginContribution | readonly PluginContribution[] | void;
};
export type RegisteredPlugin = {
  readonly manifest: PluginManifest;
  readonly plugin: OJPlatformPlugin;
  enabled: boolean;
  readonly contributions: readonly PluginContribution[];
};
export const pluginSdkVersion = '1.0.0';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
export function parsePluginManifest(value: unknown): PluginManifest | null {
  if (!isRecord(value)) return null;
  const c = value.contributes;
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.name !== 'string' ||
    !value.name ||
    typeof value.version !== 'string' ||
    !value.version ||
    (typeof value.apiVersion !== 'string' &&
      typeof value.apiVersion !== 'number') ||
    String(value.apiVersion) !== String(PLUGIN_API_VERSION) ||
    typeof value.entry !== 'string' ||
    !value.entry ||
    !isRecord(c) ||
    !Array.isArray(c.slots) ||
    !c.slots.every((slot) => typeof slot === 'string')
  )
    return null;
  return {
    id: value.id,
    name: value.name,
    version: value.version,
    apiVersion: value.apiVersion,
    entry: value.entry,
    contributes: { slots: [...c.slots] },
  };
}
const isPlugin = (value: unknown): value is OJPlatformPlugin =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.version === 'string' &&
  (typeof value.apiVersion === 'string' ||
    typeof value.apiVersion === 'number') &&
  String(value.apiVersion) === String(PLUGIN_API_VERSION) &&
  typeof value.activate === 'function';
export class PluginRegistry {
  private readonly plugins = new Map<string, RegisteredPlugin>();
  register(
    manifestInput: unknown,
    pluginInput: unknown,
  ): RegisteredPlugin | null {
    const manifest = parsePluginManifest(manifestInput);
    if (!manifest || !isPlugin(pluginInput) || pluginInput.id !== manifest.id)
      return null;
    let activated: PluginContribution | readonly PluginContribution[] | void;
    try {
      activated = pluginInput.activate({ sdkVersion: pluginSdkVersion });
    } catch {
      return null;
    }
    const contributions = (
      activated === undefined
        ? []
        : Array.isArray(activated)
          ? activated
          : [activated]
    ).filter(
      (item): item is PluginContribution =>
        isRecord(item) &&
        typeof item.slot === 'string' &&
        typeof item.render === 'function' &&
        manifest.contributes.slots.includes(item.slot) &&
        SUPPORTED_PLUGIN_SLOTS.includes(item.slot as PluginSlot),
    );
    const registered = {
      manifest,
      plugin: pluginInput,
      enabled: true,
      contributions,
    };
    this.plugins.set(manifest.id, registered);
    return registered;
  }
  setEnabled(id: string, enabled: boolean): boolean {
    const plugin = this.plugins.get(id);
    if (!plugin) return false;
    plugin.enabled = enabled;
    return true;
  }
  isEnabled(id: string): boolean {
    return this.plugins.get(id)?.enabled === true;
  }
  get(id: string): RegisteredPlugin | undefined {
    return this.plugins.get(id);
  }
  getContributions(slot: string): readonly PluginContribution[] {
    if (!SUPPORTED_PLUGIN_SLOTS.includes(slot as PluginSlot)) return [];
    return [...this.plugins.values()]
      .filter((p) => p.enabled)
      .flatMap((p) => p.contributions.filter((c) => c.slot === slot));
  }
}
export class PluginHost {
  constructor(readonly registry = new PluginRegistry()) {}
  register(manifest: unknown, plugin: unknown): RegisteredPlugin | null {
    return this.registry.register(manifest, plugin);
  }
  setEnabled(id: string, enabled: boolean): boolean {
    return this.registry.setEnabled(id, enabled);
  }
  contributions(slot: string): readonly PluginContribution[] {
    return this.registry.getContributions(slot);
  }
}
