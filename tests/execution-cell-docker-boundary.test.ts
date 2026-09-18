import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd();
const sourceExtensions = new Set([
  '.go',
  '.js',
  '.mjs',
  '.ps1',
  '.sh',
  '.ts',
  '.yaml',
  '.yml',
]);

const collectFiles = (root: string): string[] =>
  readdirSync(join(repositoryRoot, root), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(path);
      }
      return sourceExtensions.has(extname(entry.name)) ? [path] : [];
    },
  );

const executionCellFiles = [
  ...collectFiles('apps/judge-worker'),
  ...collectFiles('apps/judge-host-agent'),
  ...collectFiles('apps/sandbox-supervisor'),
].filter(
  (path) =>
    !path.endsWith('_test.go') &&
    !path.includes(
      `${join('apps', 'sandbox-supervisor', 'cmd', 'trusted-probe')}`,
    ),
);

const provisioningFiles = [
  ...collectFiles('config'),
  ...collectFiles('deploy'),
  ...collectFiles('scripts'),
];

describe('execution-cell Docker privilege boundary', () => {
  it('keeps production execution-cell source independent of Docker', () => {
    const forbidden =
      /docker(?:\.sock)?|docker_host|containerd|nerdctl|podman/i;
    const violations = executionCellFiles.flatMap((path) => {
      const lines = readFileSync(join(repositoryRoot, path), 'utf8').split(
        /\r?\n/u,
      );
      return lines.flatMap((line, index) =>
        forbidden.test(line)
          ? [
              `${relative(repositoryRoot, join(repositoryRoot, path))}:${index + 1}`,
            ]
          : [],
      );
    });

    expect(violations).toEqual([]);
  });

  it('does not provision oj-sandbox into the Docker group', () => {
    const membershipMutation =
      /(?:usermod|gpasswd|adduser|groupadd)[^\n]*(?:oj-sandbox[^\n]*docker|docker[^\n]*oj-sandbox)/i;
    const violations = provisioningFiles.filter((path) =>
      membershipMutation.test(readFileSync(join(repositoryRoot, path), 'utf8')),
    );

    expect(violations).toEqual([]);
  });

  it('uses the trusted WSL operator for Docker infrastructure helpers', () => {
    const helpers = [
      'scripts/dev-runtime.ps1',
      'scripts/infra.mjs',
      'scripts/infra-wait.mjs',
      'scripts/qualify-migration-architecture.mjs',
      'scripts/runtime-port-reconcile.ps1',
    ];
    const violations = helpers.filter((path) => {
      const compact = readFileSync(join(repositoryRoot, path), 'utf8').replace(
        /\s+/gu,
        '',
      );
      return !compact.includes("'--user','root'");
    });

    expect(violations).toEqual([]);
  });
});
