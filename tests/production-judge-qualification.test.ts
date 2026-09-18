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
