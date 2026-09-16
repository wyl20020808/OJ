import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadMigrationFiles,
  migrationChecksum,
  unwrapManagedTransaction,
  // @ts-expect-error JavaScript CLI module intentionally has no published type surface.
} from '../scripts/migration-runner.mjs';
// @ts-expect-error JavaScript manifest is consumed by Node migration tooling.
import { judgeMigrationManifest } from '../scripts/migrations/judge-manifest.mjs';
// @ts-expect-error JavaScript manifest is consumed by Node migration tooling.
import { productMigrationManifest } from '../scripts/migrations/product-manifest.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('migration architecture', () => {
  it('pins complete, isolated Product and Judge inventories', async () => {
    const product = await loadMigrationFiles({
      directory: resolve('packages/database/migrations'),
      label: 'product',
      manifest: productMigrationManifest,
    });
    const judge = await loadMigrationFiles({
      directory: resolve('packages/judge-runtime/migrations'),
      label: 'judge',
      manifest: judgeMigrationManifest,
    });

    expect(product).toHaveLength(39);
    expect(judge).toHaveLength(4);
    expect(product.map(({ id }: { id: string }) => id)).toContain(
      '0020_judge_artifacts',
    );
    expect(judge.map(({ id }: { id: string }) => id)).not.toContain(
      '0020_judge_artifacts',
    );
    expect(
      product.every(
        ({ evidence }: { evidence: unknown[] }) => evidence.length > 0,
      ),
    ).toBe(true);
    expect(
      judge.every(
        ({ evidence }: { evidence: unknown[] }) => evidence.length > 0,
      ),
    ).toBe(true);
  });

  it('fails closed when tracked historical SQL changes without manifest approval', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'ojplatform-migration-checksum-'),
    );
    temporaryDirectories.push(directory);
    const original =
      'CREATE TABLE immutable_history(id integer PRIMARY KEY);\n';
    await writeFile(join(directory, '0000_immutable_history.sql'), original);
    const manifest = [
      {
        id: '0000_immutable_history',
        ordinal: 0,
        checksum: migrationChecksum(original),
        transaction: 'transactional',
        sideEffects: 'Synthetic immutable history fixture.',
        evidence: [{ kind: 'table', name: 'immutable_history' }],
      },
    ];
    await loadMigrationFiles({ directory, label: 'synthetic', manifest });

    await writeFile(
      join(directory, '0000_immutable_history.sql'),
      `${original}ALTER TABLE immutable_history ADD COLUMN changed boolean;\n`,
    );

    await expect(
      loadMigrationFiles({ directory, label: 'synthetic', manifest }),
    ).rejects.toThrow(
      'MIGRATION_FILE_CHECKSUM_MISMATCH:synthetic:0000_immutable_history',
    );
  });

  it('unwraps only the explicitly declared historical transaction wrapper', () => {
    const migration = {
      id: '0032_submission_integration_fixture_cleanup',
      transaction: 'unwrap-explicit',
    };
    expect(
      unwrapManagedTransaction('BEGIN;\nSELECT 1;\nCOMMIT;\n', migration),
    ).toContain('SELECT 1;');
    expect(() => unwrapManagedTransaction('SELECT 1;', migration)).toThrow(
      'MIGRATION_TRANSACTION_WRAPPER_INVALID',
    );
  });

  it('requires Product and Judge runners to use their own URL variables', () => {
    const baseEnvironment = { ...process.env };
    delete baseEnvironment.DATABASE_URL;
    delete baseEnvironment.JUDGE_DATABASE_URL;

    const product = spawnSync(
      process.execPath,
      ['scripts/migrate.mjs', 'status'],
      {
        cwd: resolve('.'),
        env: {
          ...baseEnvironment,
          JUDGE_DATABASE_URL: 'postgres://ignored.invalid/judge',
        },
        encoding: 'utf8',
      },
    );
    const judge = spawnSync(
      process.execPath,
      ['scripts/judge-service-migrate.mjs', 'status'],
      {
        cwd: resolve('.'),
        env: {
          ...baseEnvironment,
          DATABASE_URL: 'postgres://ignored.invalid/product',
        },
        encoding: 'utf8',
      },
    );

    expect(product.status).not.toBe(0);
    expect(product.stderr).toContain('MIGRATION_DATABASE_URL_REQUIRED:product');
    expect(judge.status).not.toBe(0);
    expect(judge.stderr).toContain('MIGRATION_DATABASE_URL_REQUIRED:judge');
  });
});
