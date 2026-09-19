import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const production = readFileSync('compose.prod.yaml', 'utf8');
const supervisor = readFileSync(
  'apps/sandbox-supervisor/internal/supervisor/supervisor.go',
  'utf8',
);
const execution = readFileSync(
  'apps/sandbox-supervisor/internal/supervisor/execution.go',
  'utf8',
);
const rootfsDockerfile = readFileSync(
  'scripts/phase2c1-compiler-rootfs.Dockerfile',
  'utf8',
);
const rootfsPrepare = readFileSync(
  'scripts/phase2c1-prepare-compiler-rootfs.sh',
  'utf8',
);
const phase2c2Qualification = readFileSync(
  'scripts/phase2c2-qualification.mjs',
  'utf8',
);
const canonicalRootfsIdentity =
  '191cb6c71d4792e4e78d70882b229eec2b3a028314ca3c15e4e3a1847850eda2';

describe('production Judge qualification gates', () => {
  it('requires all Judge production credentials without development fallback', () => {
    for (const name of [
      'JUDGE_DATABASE_ADMIN_URL',
      'JUDGE_DATABASE_PASSWORD',
      'JUDGE_MIGRATION_DATABASE_URL',
      'JUDGE_RUNTIME_DATABASE_URL',
      'JUDGE_SERVICE_TOKEN',
      'JUDGE_NODE_TOKEN',
    ])
      expect(production).toContain(`\${${name}:?${name}`);
    expect(production).not.toMatch(/dev-only|change-me|demo-token/);
  });

  it('keeps the production service boundary private and bounded', () => {
    expect(production).toContain(
      "'127.0.0.1:${OJPLATFORM_JUDGE_SERVICE_PORT:-3100}:3100'",
    );
    expect(production).not.toMatch(
      /(?:0\.0\.0\.0|\[?::\]?):\$\{OJPLATFORM_JUDGE_SERVICE_PORT/,
    );
    expect(production).toContain("max-size: '10m'");
    expect(production).toContain("max-file: '5'");
    expect(production).not.toMatch(
      /privileged:\s*true|network_mode:\s*host|pid:\s*host|docker\.sock/,
    );
  });

  it('pins reproducible amd64 compiler rootfs inputs and identity ordering', () => {
    expect(rootfsDockerfile).toContain(
      'ubuntu@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517',
    );
    expect(rootfsDockerfile).toContain('UBUNTU_SNAPSHOT=20260820T000000Z');
    expect(rootfsDockerfile).toContain('linux-libc-dev=6.8.0-138.138');
    expect(rootfsPrepare).toContain('export LC_ALL=C');
    expect(phase2c2Qualification).toContain(canonicalRootfsIdentity);
    expect(rootfsDockerfile).not.toMatch(/--platform=.*arm64|aarch64/);
  });

  it('pins explicit descriptor and file-size limits in every OCI process', () => {
    expect(supervisor).toMatch(/compileOpenFileLimit\s*= uint64\(128\)/);
    expect(supervisor).toMatch(/runtimeOpenFileLimit\s*= uint64\(64\)/);
    expect(supervisor).toMatch(/compileFileSizeLimit\s*= uint64\(16 << 20\)/);
    expect(supervisor).toMatch(/runtimeFileSizeLimit\s*= uint64\(512 << 10\)/);
    expect(supervisor).toContain('RLIMIT_NOFILE');
    expect(supervisor).toContain('RLIMIT_FSIZE');
    expect(execution).toContain('preflightWorkspaceCapacity');
    expect(execution).toContain('WORKSPACE_ACCOUNTING_FAILED');
  });

  it('keeps the amd64 deny policy explicit and architecture-scoped', () => {
    expect(supervisor).toContain('SCMP_ARCH_X86_64');
    for (const syscall of [
      'mount',
      'umount2',
      'pivot_root',
      'ptrace',
      'kexec_load',
      'init_module',
      'finit_module',
      'delete_module',
      'reboot',
      'swapon',
      'swapoff',
      'setns',
      'unshare',
      'bpf',
      'perf_event_open',
      'open_by_handle_at',
      'userfaultfd',
      'keyctl',
      'add_key',
      'request_key',
    ])
      expect(supervisor).toContain(`"${syscall}"`);
  });
});
