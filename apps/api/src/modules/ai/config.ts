/**
 * The host AI configuration source.
 *
 * AI is optional infrastructure: a deployment without configuration boots normally with the
 * capability broker reporting `UNAVAILABLE`. Configuration is server-side and file/env based —
 * no UI, no request input (AGENTS.md §6).
 *
 * Two sources, first one wins:
 *
 *  - `OJPLATFORM_AI_CONFIG_JSON` — an inline JSON document (containers, tests).
 *  - `OJPLATFORM_AI_CONFIG_FILE` — a path to a versioned JSON document (the recommended form).
 *
 * The document shape is the AI Bridge runtime configuration (`{providers, routes, governance}`,
 * including the bridge kill switch). It is validated by the bridge itself at plugin creation and
 * at every reload; this module only decides *absent / unreadable / loaded* and never invents
 * defaults that could silently widen cost or blast radius.
 *
 * Reload is atomic through the bridge (`ConfigManager`): a syntactically valid but semantically
 * invalid candidate keeps the active snapshot. A syntactically invalid file never reaches the
 * bridge at all — the last good configuration keeps serving and the failure is logged.
 */
import { readFileSync, watch, type FSWatcher } from 'node:fs';

export type AiConfigLoadResult =
  | { readonly kind: 'ABSENT' }
  | {
      readonly kind: 'INVALID';
      readonly error: string;
      readonly source: string;
    }
  | {
      readonly kind: 'LOADED';
      readonly document: unknown;
      readonly source: string;
      readonly filePath?: string;
    };

export const AI_CONFIG_JSON_ENV = 'OJPLATFORM_AI_CONFIG_JSON';
export const AI_CONFIG_FILE_ENV = 'OJPLATFORM_AI_CONFIG_FILE';
/** Host-level emergency stop: wider than the bridge kill switch, gates the whole broker. */
export const AI_DISABLED_ENV = 'OJPLATFORM_AI_DISABLED';

type EnvLike = Readonly<Record<string, string | undefined>>;

export function isAiDisabledByEnv(env: EnvLike = process.env): boolean {
  const value = env[AI_DISABLED_ENV]?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function parseDocument(raw: string, source: string): AiConfigLoadResult {
  try {
    return { kind: 'LOADED', document: JSON.parse(raw) as unknown, source };
  } catch (error) {
    return {
      kind: 'INVALID',
      error: `configuration is not valid JSON: ${error instanceof Error ? error.message : 'parse failure'}`,
      source,
    };
  }
}

/** Read the configured document once. Missing configuration is a normal state, not an error. */
export function loadAiConfig(env: EnvLike = process.env): AiConfigLoadResult {
  const inline = env[AI_CONFIG_JSON_ENV];
  if (typeof inline === 'string' && inline.trim().length > 0) {
    return parseDocument(inline, `env:${AI_CONFIG_JSON_ENV}`);
  }
  const filePath = env[AI_CONFIG_FILE_ENV];
  if (typeof filePath === 'string' && filePath.trim().length > 0) {
    try {
      const raw = readFileSync(filePath, 'utf8');
      const parsed = parseDocument(raw, `file:${filePath}`);
      return parsed.kind === 'LOADED' ? { ...parsed, filePath } : parsed;
    } catch (error) {
      return {
        kind: 'INVALID',
        error: `configuration file cannot be read: ${error instanceof Error ? error.message : 'read failure'}`,
        source: `file:${filePath}`,
      };
    }
  }
  return { kind: 'ABSENT' };
}

export type AiConfigReloader = {
  /** Stop watching. Idempotent. */
  close(): void;
};

/**
 * Watch the configuration file and hand every syntactically valid new document to
 * `applyCandidate` (which is expected to be the bridge's atomic `reload`). Parse failures are
 * reported through `onParseFailure` and otherwise ignored: the active snapshot keeps serving.
 */
export function watchAiConfigFile(options: {
  readonly filePath: string;
  readonly applyCandidate: (document: unknown) => Promise<void> | void;
  readonly onParseFailure?: (error: string) => void;
  readonly debounceMs?: number;
}): AiConfigReloader {
  const debounceMs = options.debounceMs ?? 250;
  let timer: NodeJS.Timeout | null = null;
  let closed = false;
  let watcher: FSWatcher | null = null;

  const reapply = (): void => {
    if (closed) {
      return;
    }
    let raw: string;
    try {
      raw = readFileSync(options.filePath, 'utf8');
    } catch (error) {
      options.onParseFailure?.(
        `configuration file cannot be read: ${error instanceof Error ? error.message : 'read failure'}`,
      );
      return;
    }
    const parsed = parseDocument(raw, `file:${options.filePath}`);
    if (parsed.kind !== 'LOADED') {
      options.onParseFailure?.(
        parsed.kind === 'INVALID' ? parsed.error : 'configuration disappeared',
      );
      return;
    }
    void Promise.resolve(options.applyCandidate(parsed.document)).catch(() => {
      // The bridge's reload reports invalid candidates in-band; a rejection here is a watcher
      // plumbing failure only. The active snapshot keeps serving either way.
    });
  };

  try {
    watcher = watch(options.filePath, () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(reapply, debounceMs);
    });
  } catch {
    // A file that cannot be watched (removed between boot and watch setup) leaves reload
    // disabled; the boot-time snapshot keeps serving.
    watcher = null;
  }

  return {
    close(): void {
      closed = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      watcher?.close();
      watcher = null;
    },
  };
}
