import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Browser-side AI secret scan (Stage 6).
 *
 * The browser never holds AI Bridge, a provider credential, a provider base URL or the subject
 * HMAC key — the AI capability broker exists precisely so that none of that ever reaches the
 * client. This test mechanically enforces the boundary over everything the browser ships:
 * `apps/web` and the bundled plugin sources. A violation is a security regression, not a style
 * finding.
 */

const roots = ['apps/web/src', 'plugins/OnlineCodeEditor/src'];

/** (pattern, why) — every entry maps to one stage requirement. */
const FORBIDDEN: readonly (readonly [RegExp, string])[] = [
  [/@aibridge\b/, 'the browser must never reference AI Bridge modules'],
  [
    /secret:\/\//,
    'credential handles are server-side configuration, never client code',
  ],
  [
    /OJPLATFORM_AI_SUBJECT_HMAC_KEY/,
    'the subject HMAC key is server-side only',
  ],
  [/OJPLATFORM_AI_CONFIG/, 'AI configuration is server-side only'],
  [
    /\bAIBRIDGE_[A-Z0-9_]+\b/,
    'AI Bridge credential env names are server-side only',
  ],
  [
    /\b(?:OPENAI|DEEPSEEK|XIAOMI)[A-Z0-9_]*_API_KEY\b/,
    'provider API keys never reach the browser',
  ],
  [/api\.openai\.com/, 'provider base URLs never reach the browser'],
  [/api\.deepseek\.com/, 'provider base URLs never reach the browser'],
  [/token-plan\.[a-z]*\.xiaomi/, 'provider base URLs never reach the browser'],
];

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.css',
  '.html',
  '.json',
  '.vue',
]);

function collectSources(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectSources(path));
      continue;
    }
    const dot = entry.lastIndexOf('.');
    if (dot > 0 && SOURCE_EXTENSIONS.has(entry.slice(dot))) {
      files.push(path);
    }
  }
  return files;
}

describe('browser-side AI secret scan', () => {
  it('the shipped browser surface holds no AI Bridge reference, credential handle, key name or provider endpoint', () => {
    const violations: string[] = [];
    for (const root of roots) {
      const absolute = resolve(root);
      for (const file of collectSources(absolute)) {
        const source = readFileSync(file, 'utf8');
        for (const [pattern, why] of FORBIDDEN) {
          const match = pattern.exec(source);
          if (match !== null) {
            violations.push(
              `${relative(resolve('.'), file)}: ${match[0]} (${why})`,
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
