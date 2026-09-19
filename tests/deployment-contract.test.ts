import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const gitMode = (path) => {
  const result = spawnSync('git', ['ls-files', '-s', '--', path], {
    encoding: 'utf8',
  });
  expect(result.status, `git ls-files failed for ${path}`).toBe(0);
  return result.stdout.trim().split(/\s+/)[0];
};

const compose = readFileSync('compose.yaml', 'utf8');
const production = readFileSync('compose.prod.yaml', 'utf8');
const envTemplate = readFileSync('.env.production.example', 'utf8');
const install = readFileSync('deploy/judge-host/install.sh', 'utf8');
const supervisorUnit = readFileSync(
  'deploy/judge-host/systemd/ojplatform-supervisor.service',
  'utf8',
);
const workerUnit = readFileSync(
  'deploy/judge-host/systemd/ojplatform-worker.service',
  'utf8',
);
const hostAgentUnit = readFileSync(
  'deploy/judge-host/systemd/ojplatform-host-agent.service',
  'utf8',
);
const apparmor = readFileSync(
  'deploy/judge-host/apparmor/ojplatform-runc',
  'utf8',
);
const guide = readFileSync(
  'Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md',
  'utf8',
);

const requiredFromOverlay = [
  ...new Set(
    [...production.matchAll(/\$\{([A-Z0-9_]+):\?/g)].map((match) => match[1]),
  ),
].sort();
const templateKeys = new Set(
  [...envTemplate.matchAll(/^([A-Z0-9_]+)=/gm)].map((match) => match[1]),
);

describe('Phase 7A deployment contract', () => {
  it('keeps Docker Compose as the only container orchestrator', () => {
    expect(compose).toContain('name: ${OJPLATFORM_COMPOSE_PROJECT_NAME');
    expect(production).toContain('x-production-logging: &production-logging');
    // No custom launcher, wrapper CLI, or vendored compose replacement.
    expect(existsSync('deploy/ojplatform')).toBe(false);
    expect(existsSync('ojplatform')).toBe(false);
    for (const file of [
      'compose.yaml',
      'compose.dev.yaml',
      'compose.prod.yaml',
    ])
      expect(existsSync(file), file).toBe(true);
  });

  it('decouples Core/Judge operations from the OnlineCodeEditor build input', () => {
    // A required-variable gate here would make every Judge-only render depend on
    // a plugin checkout even though only the Web image consumes it.
    expect(compose).not.toMatch(/OJPLATFORM_ONLINE_CODE_EDITOR_CONTEXT:\?/);
    expect(compose).toContain(
      'online-code-editor: ${OJPLATFORM_ONLINE_CODE_EDITOR_CONTEXT:-./plugins/OnlineCodeEditor}',
    );
    // Compose resolves the relative default against the project directory, so
    // the rendered value is absolute while still being repository-local.
    expect(guide).toContain('Core-only and Judge-only Compose');
  });

  it('keeps the OnlineCodeEditor checkout out of the main build context', () => {
    // The plugin is a separate repository. Treating it as a pnpm workspace
    // package or copying it into the main Docker context breaks
    // `--frozen-lockfile` builds the moment a checkout exists.
    const workspace = readFileSync('pnpm-workspace.yaml', 'utf8');
    expect(workspace).not.toMatch(/^\s*-\s*plugins\/\*\s*$/m);
    const dockerignore = readFileSync('.dockerignore', 'utf8');
    expect(dockerignore).toMatch(/^plugins$/m);
    expect(compose).toContain('online-code-editor:');
  });

  it('exposes exactly one host provisioning script for non-Compose resources', () => {
    expect(install.startsWith('#!/usr/bin/env bash')).toBe(true);
    expect(install).toContain('set -euo pipefail');
    expect(install).toContain('umask 0027');
    for (const step of [
      'check_prerequisites',
      'provision_users',
      'provision_directories',
      'provision_apparmor',
      'build_binaries',
      'provision_rootfs',
      'provision_env_files',
      'install_units',
      'start_units',
      'check_security_gates',
    ])
      expect(install, step).toContain(`${step}`);
  });

  it('never grants privileged group membership or performs destructive cleanup', () => {
    expect(install).not.toMatch(/usermod\s+-aG\s+docker/);
    expect(install).not.toMatch(/gpasswd\s+-a\s+\S+\s+docker/);
    expect(install).not.toMatch(
      /docker\s+(system|volume|network|image)\s+prune/,
    );
    expect(install).not.toMatch(/docker\s+rm\s+-f\s+\$\(docker/);
    expect(install).not.toMatch(/rm\s+-rf\s+\/(?:\s|$)/);
    expect(install).not.toMatch(/git\s+clean|git\s+reset\s+--hard/);
    // Privileged group membership is actively removed when found.
    expect(install).toContain('enforce_no_privileged_groups');
    expect(install).toContain('gpasswd -d');
  });

  it('never overwrites existing host secrets on re-run', () => {
    expect(install).toContain('write_file_if_absent');
    expect(install).toContain('keeping existing values');
    expect(install).toMatch(/re-running|re-run|idempotent/i);
  });

  it('keeps every host artifact LF-only and free of unbound-name references', () => {
    // Windows checkouts default to CRLF, which makes `#!/usr/bin/env bash\r`
    // fail on Linux, and `gate "$gate_x"` expands an unset variable under
    // `set -u`. Both are silent until the script actually runs on the host.
    const raw = (path) => readFileSync(path);
    for (const path of [
      'deploy/judge-host/install.sh',
      'deploy/judge-host/systemd/ojplatform-worker.service',
      'deploy/judge-host/systemd/ojplatform-host-agent.service',
      'deploy/judge-host/systemd/ojplatform-supervisor.service',
      'deploy/judge-host/apparmor/ojplatform-runc',
    ]) {
      const bytes = raw(path);
      expect(bytes.includes(Buffer.from('\r\n')), `${path} has CRLF`).toBe(
        false,
      );
    }
    expect(install.startsWith('#!/usr/bin/env bash\n')).toBe(true);
    // Function names are passed as words, never as variable expansions.
    expect(install).not.toMatch(/^\s*gate\s+"\$gate_/m);
    expect(install).toContain('  gate gate_sandbox_groups');
  });

  it('works on a fresh clone that has no node_modules or toolchain state', () => {
    // A fresh production checkout has no node_modules, so any build step that
    // relies on the pnpm workspace would fail. The Host Agent must be bundled
    // with an on-demand pinned esbuild and its single runtime dependency
    // deployed next to the bundle.
    expect(install).not.toContain(
      '--filter @ojplatform/judge-host-agent build:host',
    );
    expect(install).toContain('dlx esbuild@${HOST_AGENT_ESBUILD_VERSION}');
    expect(install).toContain('--external:fastify');
    expect(install).toContain('pnpm --dir "${HOST_AGENT_DIR}" install --prod');
    expect(install).toContain('HOST_AGENT_ESBUILD_VERSION="0.28.2"');
  });

  it('checks kernel capabilities with the real /proc field spelling', () => {
    // /proc/self/status uses `Seccomp:`; a case-sensitive lowercase match
    // reports a false negative on every normal kernel.
    expect(install).toContain("grep -qi '^Seccomp:' /proc/self/status");
    expect(install).not.toMatch(/grep\s+-qw\s+seccomp/);
  });

  it('fails closed on missing prerequisites and security gates', () => {
    expect(install).toContain('must run as root');
    expect(install).toContain('cgroup v2 (unified hierarchy) is required');
    expect(install).toContain('seccomp is unavailable in this kernel');
    expect(install).toContain('user namespaces are unavailable in this kernel');
    expect(install).toContain('refusing to report success');
    // Non-secret output only.
    expect(install).not.toMatch(/echo\s+.*\$\{?.*PASSWORD/);
    expect(install).not.toMatch(/echo\s+.*\$\{?.*TOKEN/);
  });

  it('preserves compiler rootfs integrity and identity contract', () => {
    expect(install).toContain(
      '191cb6c71d4792e4e78d70882b229eec2b3a028314ca3c15e4e3a1847850eda2',
    );
    expect(install).toContain('phase2c1-prepare-compiler-rootfs.sh');
    expect(install).toContain('-perm /222');
    expect(install).toContain('--allow-rootfs-identity-drift');
    expect(install).toContain('--rebuild-rootfs');
  });

  it('runs the execution cell as dedicated non-root identities', () => {
    expect(install).toContain('oj-sandbox');
    expect(install).toContain('oj-worker');
    expect(install).toContain('oj-host-agent');
    expect(workerUnit).toContain('User=oj-worker');
    expect(workerUnit).toContain(
      'EnvironmentFile=/etc/ojplatform/judge-host.env',
    );
    expect(hostAgentUnit).toContain('User=oj-host-agent');
    expect(hostAgentUnit).toContain(
      '@NODE_BIN@ /opt/ojplatform/host-agent/dist/server.mjs',
    );
    expect(supervisorUnit).toContain(
      'ExecStart=/opt/ojplatform/bin/ojplatform-supervisor -listen 127.0.0.1:19092',
    );
    for (const unit of [workerUnit, hostAgentUnit]) {
      expect(unit).toContain('Restart=always');
      expect(unit).toContain('NoNewPrivileges=yes');
      expect(unit).not.toContain('User=root');
      expect(unit).not.toContain('docker.sock');
    }
    // Supervisor is a user unit so it keeps delegated cgroup controllers.
    expect(supervisorUnit).toContain('WantedBy=default.target');
    expect(supervisorUnit).toContain('NoNewPrivileges=yes');
  });

  it('grants only the user-namespace permission through AppArmor', () => {
    expect(apparmor).toContain('profile ojplatform-runc @RUNC_BIN@');
    expect(apparmor).toContain('userns,');
    expect(apparmor).not.toMatch(/kernel\.unprivileged_userns_clone\s*=\s*1/);
    expect(apparmor).not.toContain('flags=(complain)');
  });

  it('records the executable bit for scripts the deployment guide runs directly', () => {
    // A fresh Linux clone only gets the executable bit from the Git index.
    // Without 100755 the documented `sudo ./deploy/judge-host/install.sh`
    // fails with "Permission denied".
    expect(gitMode('deploy/judge-host/install.sh')).toBe('100755');
    expect(gitMode('scripts/phase2c1-prepare-compiler-rootfs.sh')).toBe(
      '100755',
    );
    // install.sh must not depend on that bit for the rootfs helper it calls.
    expect(install).toContain(
      'bash "${REPO_ROOT}/scripts/phase2c1-prepare-compiler-rootfs.sh"',
    );
  });

  it('documents every production-required variable in the env template', () => {
    expect(requiredFromOverlay.length).toBeGreaterThan(20);
    const missing = requiredFromOverlay.filter(
      (name) => !templateKeys.has(name),
    );
    expect(missing).toEqual([]);
    // No real or demo production secret, and no machine-specific absolute path.
    expect(envTemplate).not.toMatch(/D:\\\\|C:\\\\|\/home\/[a-z]+\/OJPlatform/);
    expect(envTemplate).toMatch(/<set-strong-random-value>/);
    expect(envTemplate).toContain('REQUIRED');
  });

  it('keeps the two-command deployment story visible and standard', () => {
    expect(guide).toContain(
      'docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build',
    );
    expect(guide).toContain('sudo ./deploy/judge-host/install.sh');
    expect(guide).toContain('There is no project-specific status CLI');
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain('Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md');
    expect(readme).toContain(
      'docker compose -f compose.yaml -f compose.prod.yaml',
    );
  });
});
