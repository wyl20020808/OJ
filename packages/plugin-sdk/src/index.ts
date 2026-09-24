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

/**
 * A capability reference in a manifest: `id`, `id@major` or `id@major.x`.
 *
 * Capability ids are host-neutral dotted names (`ai.text.generate`); the optional suffix pins a
 * major. Provider models, credentials and prompts are never manifest material.
 */
export type CapabilityRef = string;

const CAPABILITY_REF_PATTERN =
  /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){1,5}(?:@[1-9][0-9]*(?:\.x)?)?$/;

export function isCapabilityRef(value: unknown): value is CapabilityRef {
  return typeof value === 'string' && CAPABILITY_REF_PATTERN.test(value);
}

/**
 * The bare capability id of a reference (`ai.text.generate@1.x` → `ai.text.generate`).
 */
export function capabilityRefId(ref: CapabilityRef): string {
  const separator = ref.indexOf('@');
  return separator === -1 ? ref : ref.slice(0, separator);
}

export type PluginManifest = {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly apiVersion: string | number;
  readonly entry: string | null;
  readonly contributes: { readonly slots: readonly string[] };
  /** Capabilities this plugin provides to the host (server-side capability providers). */
  readonly providesCapabilities: readonly CapabilityRef[];
  /** Capabilities this plugin consumes. The host grants exactly these, deny-by-default. */
  readonly consumesCapabilities: readonly CapabilityRef[];
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

function parseCapabilityRefs(
  value: unknown,
  issues: string[],
): CapabilityRef[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    issues.push('capabilities must be an array of capability references');
    return null;
  }
  const refs: CapabilityRef[] = [];
  for (const entry of value) {
    if (!isCapabilityRef(entry)) {
      issues.push(`invalid capability reference: ${String(entry)}`);
      return null;
    }
    refs.push(entry);
  }
  return refs;
}

/**
 * Parse a plugin manifest in the canonical host plugin dialect.
 *
 * Canonical fields: `id`, `name`, `version`, `apiVersion`, `entry`, `contributes.slots`,
 * `providesCapabilities`, `consumesCapabilities`.
 *
 * Compatibility (documented, deliberate):
 *  - `pluginApiVersion` is accepted as a legacy alias of `apiVersion` and normalized. Exactly one
 *    of the two may be present; both present with different values is rejected.
 *  - `contributes` may be omitted entirely (a server-capability plugin has no browser slot). When
 *    present it must still carry a `slots` array of strings.
 *  - `entry` may be null or absent when the manifest declares no slots; a slot-contributing
 *    plugin still requires a non-empty entry.
 *
 * Unknown fields are ignored, as in V1 — capability data is additive and never breaks an older
 * parser.
 */
export function parsePluginManifest(value: unknown): PluginManifest | null {
  if (!isRecord(value)) return null;
  const c = value.contributes;
  const apiVersion =
    value.apiVersion !== undefined && value.pluginApiVersion === undefined
      ? value.apiVersion
      : value.apiVersion === undefined && value.pluginApiVersion !== undefined
        ? value.pluginApiVersion
        : value.apiVersion !== undefined &&
            value.pluginApiVersion !== undefined &&
            String(value.apiVersion) === String(value.pluginApiVersion)
          ? value.apiVersion
          : undefined;
  const issues: string[] = [];
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.name !== 'string' ||
    !value.name ||
    typeof value.version !== 'string' ||
    !value.version ||
    (typeof apiVersion !== 'string' && typeof apiVersion !== 'number') ||
    String(apiVersion) !== String(PLUGIN_API_VERSION)
  )
    return null;
  const slots =
    c === undefined
      ? []
      : isRecord(c) &&
          Array.isArray(c.slots) &&
          c.slots.every((slot) => typeof slot === 'string')
        ? [...c.slots]
        : null;
  if (slots === null) return null;
  const entry = value.entry;
  const entryValid =
    entry === undefined || entry === null
      ? slots.length === 0
      : typeof entry === 'string' && entry.length > 0;
  if (!entryValid) {
    return null;
  }
  const provides = parseCapabilityRefs(value.providesCapabilities, issues);
  const consumes = parseCapabilityRefs(value.consumesCapabilities, issues);
  if (provides === null || consumes === null) return null;
  return {
    id: value.id,
    name: value.name,
    version: value.version,
    apiVersion,
    entry: typeof entry === 'string' && entry.length > 0 ? entry : null,
    contributes: { slots },
    providesCapabilities: provides,
    consumesCapabilities: consumes,
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
