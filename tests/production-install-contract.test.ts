import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const install = readFileSync('deploy/install.sh', 'utf8');
const doctor = readFileSync('deploy/doctor.sh', 'utf8');
const judgeHost = readFileSync('deploy/judge-host/install.sh', 'utf8');
const readme = readFileSync('README.md', 'utf8');
const guide = readFileSync(
  'Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md',
  'utf8',
);

const gitModeOf = (path: string) => {
  const result = spawnSync('git', ['ls-files', '-s', '--', path], {
    encoding: 'utf8',
  });
  expect(result.status, `git ls-files failed for ${path}`).toBe(0);
  return result.stdout.trim().split(/\s+/)[0];
};

describe('Phase 7B one-command production deployment contract', () => {
  it('ships an executable one-command installer', () => {
    expect(existsSync('deploy/install.sh')).toBe(true);
    expect(gitModeOf('deploy/install.sh')).toBe('100755');
    expect(install.startsWith('#!/usr/bin/env bash\n')).toBe(true);
    expect(install).toContain('set -euo pipefail');
    expect(install).not.toContain('\r\n');
  });

  it('keeps Docker Compose as the only container orchestrator', () => {
    expect(install).toContain('docker compose');
    expect(install).toContain(
      'readonly COMPOSE_FILES=(-f "${REPO_ROOT}/compose.yaml" -f "${REPO_ROOT}/compose.prod.yaml")',
    );
    expect(install).toContain('JUDGE_PROFILE=(--profile judge)');
    // No private container lifecycle implementation.
    for (const forbidden of [
      'docker create',
      'docker start',
      'docker run -d ',
      'kubectl',
      'containerd-ctr',
    ])
      expect(install).not.toContain(forbidden);
    expect(existsSync('deploy/ojplatform')).toBe(false);
  });

  it('fails closed on unsupported platforms and resources', () => {
    expect(install).toContain('requires Linux');
    expect(install).toContain('Linux ARM64 is NOT QUALIFIED');
    expect(install).toContain('unsupported architecture');
    expect(install).toContain('at least 2 CPUs are required');
    expect(install).toContain('at least 4 GiB RAM is required');
    expect(install).toContain('at least 15 GiB free');
  });

  it('installs Docker from the official repository only when needed', () => {
    expect(install).toContain('https://download.docker.com/linux/ubuntu');
    expect(install).toContain(
      'docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin',
    );
    expect(install).toContain('--skip-docker-install');
    // Reuses an existing installation instead of reinstalling.
    expect(install).toContain('if docker_ready; then');
    // Never weakens host security to make Docker work.
    for (const forbidden of [
      'chmod 777 /var/run/docker.sock',
      'ufw disable',
      'setenforce 0',
      'aa-disable',
    ])
      expect(install).not.toContain(forbidden);
  });

  it('acquires the pinned plugin submodule without following its branch', () => {
    expect(install).toContain('submodule update --init --recursive');
    expect(install).toContain('does not match the pinned gitlink');
    // The installer deploys the checkout; it must never move the checkout itself.
    expect(install).not.toMatch(/git\s+pull/);
    expect(install).not.toMatch(/git\s+checkout/);
    expect(install).not.toMatch(/git\s+reset/);
    // The execution-cell script consumes the already-acquired checkout.
    expect(judgeHost).not.toContain('git clone');
  });

  it('generates secrets once and never overwrites or prints them', () => {
    expect(install).toContain('random_secret()');
    expect(install).toContain('openssl rand -base64 48');
    expect(install).toContain('head -c 48 /dev/urandom');
    expect(install).toContain('reusing existing ${ENV_FILE}');
    expect(install).toContain('install -m 0600 /dev/null "${ENV_FILE}"');
    expect(install).toContain('chmod 0600 "${ENV_FILE}"');
    // Never echo a secret value.
    expect(install).not.toMatch(/log .*\$\{?(value|secret|password)/i);
  });

  it('refuses to start on top of unrelated listeners', () => {
    expect(install).toContain('check_ports()');
    expect(install).toContain('occupied by unrelated processes');
    expect(install).not.toMatch(/kill\s+-9/);
  });

  it('waits for real health before reporting success', () => {
    expect(install).toContain('wait_for_health()');
    expect(install).toContain('HEALTH_TIMEOUT=');
    expect(install).toContain('did not become healthy');
    expect(install).toContain('API readiness failed');
    expect(install).toContain('OnlineCodeEditor bundle is served');
    // Success text must come after the health gate in the script order.
    expect(install.indexOf('wait_for_health\n')).toBeLessThan(
      install.indexOf('summary\n'),
    );
  });

  it('delegates the host execution cell instead of duplicating it', () => {
    expect(install).toContain(
      '"${SCRIPT_PATH}/judge-host/install.sh" --env-file "${ENV_FILE}"',
    );
    expect(install).toContain('--skip-judge-host');
  });

  it('ships a read-only doctor with a machine-readable verdict', () => {
    expect(existsSync('deploy/doctor.sh')).toBe(true);
    expect(gitModeOf('deploy/doctor.sh')).toBe('100755');
    expect(doctor).toContain('read-only diagnostics');
    expect(doctor).toContain('DEPLOY_DOCTOR=PASS');
    expect(doctor).toContain('DEPLOY_DOCTOR=FAIL');
    for (const forbidden of [
      'apt-get install',
      'systemctl restart',
      'systemctl start',
      'docker compose up',
      'rm -rf',
      'chmod ',
      'chown ',
    ])
      expect(doctor).not.toContain(forbidden);
  });

  it('does not require Node, pnpm or Go on the production host', () => {
    expect(install).not.toMatch(
      /dnf install|apt-get install -y -qq nodejs|apt-get install -y -qq golang/,
    );
    expect(judgeHost).toContain(
      'readonly GO_BUILDER_IMAGE="golang:1.22-bookworm"',
    );
    expect(judgeHost).toContain('docker run --rm');
    expect(judgeHost).not.toMatch(/^\s*go build /m);
    expect(judgeHost).not.toMatch(/^\s*pnpm\s/m);
  });

  it('keeps the documented manual two-command path working', () => {
    expect(guide).toContain(
      'docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build',
    );
    expect(guide).toContain('sudo ./deploy/judge-host/install.sh');
    expect(install).toContain('two-command manual path remains supported');
  });

  it('documents the one-command quick start without machine-specific paths', () => {
    expect(readme).toContain('git clone --recurse-submodules');
    expect(readme).toContain('sudo ./deploy/install.sh');
    for (const file of [readme, guide, install, doctor]) {
      expect(file).not.toMatch(
        /D:\\\\OJPlatform|C:\\\\Users|[\\/]home[\\/]ojplatform[\\/]/,
      );
    }
  });
});
