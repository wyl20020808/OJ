import { fileURLToPath } from 'node:url';
import { runMigrationCommand } from './migration-runner.mjs';
import { productMigrationManifest } from './migrations/product-manifest.mjs';

const command = process.argv[2] ?? 'up';
const argumentsAfterCommand = process.argv.slice(3);
const json = argumentsAfterCommand.includes('--json');
const positional = argumentsAfterCommand.filter(
  (argument) => !argument.startsWith('--'),
);
if (positional.length > 1 || (positional.length && command !== 'down')) {
  throw new Error('Only down accepts one explicit latest migration id');
}

const directory = fileURLToPath(
  new URL('../packages/database/migrations/', import.meta.url),
);

try {
  await runMigrationCommand({
    databaseUrl: process.env.DATABASE_URL,
    directory,
    label: 'product',
    manifest: productMigrationManifest,
    command,
    json,
    requestedId: positional[0],
  });
} catch (error) {
  console.error(`Product migration failed: ${error.message}`);
  process.exitCode = 1;
}
