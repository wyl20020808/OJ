import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrationCommand } from './migration-runner.mjs';
import { judgeMigrationManifest } from './migrations/judge-manifest.mjs';
import { productMigrationManifest } from './migrations/product-manifest.mjs';

const url = process.env.RUNTIME_MIGRATION_DATABASE_URL;
const directory = process.env.RUNTIME_MIGRATION_DIRECTORY;
const label = process.env.RUNTIME_MIGRATION_LABEL;
if (!url || !directory || !label) {
  throw new Error(
    'RUNTIME_MIGRATION_DATABASE_URL, DIRECTORY and LABEL are required',
  );
}

const contracts = {
  product: {
    directory: fileURLToPath(
      new URL('../packages/database/migrations/', import.meta.url),
    ),
    manifest: productMigrationManifest,
  },
  judge: {
    directory: fileURLToPath(
      new URL('../packages/judge-runtime/migrations/', import.meta.url),
    ),
    manifest: judgeMigrationManifest,
  },
};
const contract = contracts[label];
if (!contract) throw new Error(`RUNTIME_MIGRATION_LABEL_INVALID:${label}`);
if (resolve(directory) !== resolve(contract.directory)) {
  throw new Error(`RUNTIME_MIGRATION_DIRECTORY_INVALID:${label}`);
}

try {
  await runMigrationCommand({
    databaseUrl: url,
    directory: contract.directory,
    label,
    manifest: contract.manifest,
  });
} catch (error) {
  console.error(`Runtime migration failed: ${error.message}`);
  process.exitCode = 1;
}
