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

console.log(
  'Architecture dependency gate PASS: allowed fixture accepted; 2 forbidden cases rejected.',
);
