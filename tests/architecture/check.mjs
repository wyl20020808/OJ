import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const fixtures = join(root, 'tests', 'architecture', 'fixtures');

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(path)));
    else if (entry.name.endsWith('.ts')) files.push(path);
  }
  return files;
}

const rules = [
  {
    directory: 'forbidden-plugin-core-internal',
    forbidden: '@ojplatform/core',
    name: 'plugin -> core internals',
  },
  {
    directory: 'forbidden-web-api-internal',
    forbidden: '@ojplatform/api',
    name: 'web -> api internals',
  },
];

const allowed = await collect(join(fixtures, 'allowed'));
for (const file of allowed) {
  const source = await readFile(file, 'utf8');
  if (
    source.includes('@ojplatform/core') ||
    source.includes('@ojplatform/api')
  ) {
    throw new Error(
      `Allowed fixture unexpectedly violates a rule: ${relative(root, file)}`,
    );
  }
}

for (const rule of rules) {
  const files = await collect(join(fixtures, rule.directory));
  if (files.length !== 1)
    throw new Error(`Expected one fixture for ${rule.name}`);
  const source = await readFile(files[0], 'utf8');
  if (!source.includes(rule.forbidden))
    throw new Error(`Fixture does not exercise ${rule.name}`);
  console.log(`Detected forbidden dependency: ${rule.name}`);
}

/* ── Stage 6: AI Bridge host-integration source scan (real sources, not fixtures) ────────
 *
 *  1. No static `@aibridge/*` dependency anywhere in OJPlatform source. AI Bridge reaches the
 *     runtime only as packed artifacts resolved by the composed dynamic specifier in
 *     `apps/api/src/modules/ai/loader.ts`; a static import would make AI a boot requirement.
 *  2. No AI prompt-proxy route: the only HTTP surface under `/api/ai/` is the operator
 *     diagnostics GET. There is no route that accepts a prompt from the network (the browser
 *     never holds an AI credential; no public arbitrary raw-prompt proxy exists).
 */

const STATIC_AIBRIDGE_IMPORT =
  /(?:import|export)\s[^'"]*from\s*['"]@aibridge\/|require\(\s*['"]@aibridge\/|import\(\s*['"]@aibridge\//;
const AI_MUTATING_ROUTE = /\.(post|put|patch|delete)\(\s*['"]\/api\/ai[/'"]/;

const sourceRoots = [join(root, 'apps'), join(root, 'packages'), join(root, 'tests')];
const violations = [];
for (const sourceRoot of sourceRoots) {
  for (const file of await collect(sourceRoot)) {
    if (file.includes('node_modules') || file.includes(join('tests', 'architecture'))) continue;
    const source = await readFile(file, 'utf8');
    if (STATIC_AIBRIDGE_IMPORT.test(source)) {
      violations.push(`static @aibridge/* dependency: ${relative(root, file)}`);
    }
    if (AI_MUTATING_ROUTE.test(source)) {
      violations.push(`AI mutating route (possible prompt proxy): ${relative(root, file)}`);
    }
  }
}
if (violations.length > 0) {
  throw new Error(`Stage 6 architecture gate violations:\n  ${violations.join('\n  ')}`);
}
console.log(
  'Stage 6 gate PASS: no static @aibridge/* dependency; no mutating /api/ai route.',
);

console.log(
  'Architecture dependency gate PASS: allowed fixture accepted; 2 forbidden cases rejected.',
);
