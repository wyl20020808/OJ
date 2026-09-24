/**
 * The environment secret store (`secret://env/<NAME>` handles).
 *
 * AI Bridge configuration never carries a credential value — only a *handle*. This adapter
 * resolves handles against the process environment at call time. The resolved value is handed
 * to the bridge in memory and is never logged, echoed into an error, or projected anywhere
 * (AGENTS.md §3). Unknown handle schemes resolve to `null`, so a misconfigured provider fails
 * closed as an auth/configuration failure, never as an accidental anonymous request.
 */
import type { SecretStorePortLike } from './types.js';

export const ENV_SECRET_HANDLE_PREFIX = 'secret://env/';

export function createEnvSecretStore(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SecretStorePortLike {
  return {
    resolve(handle: string): Promise<string | null> {
      if (!handle.startsWith(ENV_SECRET_HANDLE_PREFIX)) {
        return Promise.resolve(null);
      }
      const name = handle.slice(ENV_SECRET_HANDLE_PREFIX.length);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        return Promise.resolve(null);
      }
      const value = env[name];
      return Promise.resolve(
        typeof value === 'string' && value.length > 0 ? value : null,
      );
    },
    has(handle: string): Promise<boolean> {
      return this.resolve(handle).then((value) => value !== null);
    },
  };
}
