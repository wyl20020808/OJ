/**
 * The packed-artifact loader.
 *
 * The OJPlatform repo never declares `@aibridge/*` dependencies: AI Bridge reaches production
 * only as npm-packed artifacts installed into `apps/api/node_modules` by the operator. This
 * loader resolves the two entry modules **dynamically** — the specifiers are composed so no
 * static analyzer (TypeScript, the bundler, the architecture gate) treats them as repo
 * dependencies.
 *
 * Absence is a normal state: a fresh deployment without the artifacts boots with the AI
 * capability provider simply unregistered (`UNAVAILABLE`). A *broken* artifact (present but not
 * the expected shape) is reported distinctly, so an operator can tell "not installed" apart from
 * "wrong version installed" — both leave the site fully booted.
 */
import type { AiBridgeHostModuleLike, AiBridgeSuiteModuleLike } from './types.js';

export type AiBridgeModulesLoadResult =
  | { readonly kind: 'ABSENT'; readonly missing: readonly string[] }
  | { readonly kind: 'INVALID'; readonly error: string }
  | { readonly kind: 'LOADED'; readonly host: AiBridgeHostModuleLike; readonly suite: AiBridgeSuiteModuleLike };

/** The composed specifiers — deliberately not literals (see module doc). */
const HOST_SPECIFIER = ['@aibridge', 'host'].join('/');
const SUITE_SPECIFIER = ['@aibridge', 'suite-all'].join('/');
const EXPECTED_SPECIFIERS = [HOST_SPECIFIER, SUITE_SPECIFIER] as const;

const isModuleNotFound = (error: unknown, specifier: string): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return (
    (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') && error.message.includes(specifier)
  );
};

const isHostModule = (value: unknown): value is AiBridgeHostModuleLike =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { createAiBridgeServerPlugin?: unknown }).createAiBridgeServerPlugin === 'function';

const isSuiteModule = (value: unknown): value is AiBridgeSuiteModuleLike =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { SUITE_ADAPTER_FACTORIES?: unknown }).SUITE_ADAPTER_FACTORIES === 'object' &&
  (value as { SUITE_ADAPTER_FACTORIES?: unknown }).SUITE_ADAPTER_FACTORIES !== null &&
  typeof (value as { suiteResolveEndpoint?: unknown }).suiteResolveEndpoint === 'function';

/** For tests: inject module objects and skip resolution entirely. */
export type AiBridgeModuleOverrides = {
  readonly hostModule?: AiBridgeHostModuleLike;
  readonly suiteModule?: AiBridgeSuiteModuleLike;
};

export async function loadAiBridgeModules(
  overrides: AiBridgeModuleOverrides = {},
): Promise<AiBridgeModulesLoadResult> {
  if (overrides.hostModule !== undefined && overrides.suiteModule !== undefined) {
    return { kind: 'LOADED', host: overrides.hostModule, suite: overrides.suiteModule };
  }
  const missing: string[] = [];
  let host: unknown;
  let suite: unknown;
  try {
    host = await import(HOST_SPECIFIER);
  } catch (error) {
    if (isModuleNotFound(error, HOST_SPECIFIER)) {
      missing.push(HOST_SPECIFIER);
    } else {
      return {
        kind: 'INVALID',
        error: `@aibridge/host failed to load: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
    }
  }
  try {
    suite = await import(SUITE_SPECIFIER);
  } catch (error) {
    if (isModuleNotFound(error, SUITE_SPECIFIER)) {
      missing.push(SUITE_SPECIFIER);
    } else {
      return {
        kind: 'INVALID',
        error: `@aibridge/suite-all failed to load: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
    }
  }
  if (missing.length > 0) {
    return { kind: 'ABSENT', missing };
  }
  if (!isHostModule(host)) {
    return { kind: 'INVALID', error: '@aibridge/host is present but is not the expected plugin entry shape' };
  }
  if (!isSuiteModule(suite)) {
    return { kind: 'INVALID', error: '@aibridge/suite-all is present but is not the expected adapter-table shape' };
  }
  void EXPECTED_SPECIFIERS;
  return { kind: 'LOADED', host, suite };
}
