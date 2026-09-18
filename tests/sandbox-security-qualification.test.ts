import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const runner = readFileSync(
  join(root, 'tests/security/run-sandbox-security-qualification.sh'),
  'utf8',
);
const client = readFileSync(
  join(root, 'tests/security/sandbox_security_qualification.py'),
  'utf8',
);
const fixtures = readdirSync(join(root, 'tests/security/fixtures'))
  .filter((name) => name.endsWith('.cpp'))
  .map((name) => ({
    name,
    source: readFileSync(join(root, 'tests/security/fixtures', name), 'utf8'),
  }));

describe('sandbox security qualification safety gate', () => {
  it('requires explicit dual opt-in and dedicated non-root identity', () => {
    expect(runner).toContain('OJ_RUN_SANDBOX_SECURITY_QUALIFICATION');
    expect(runner).toContain('OJ_ACK_BOUNDED_UNTRUSTED_FIXTURES');
    expect(runner).toContain('id -un)" != "oj-sandbox"');
    expect(runner).toContain('id -u)" == "0"');
    expect(runner).toContain('sandbox_uid=$(id -u)');
    expect(client).toContain('OJ_PHASE6B5_SUPERVISOR_UID');
  });

  it('uses only task-owned paths and alternate loopback ports', () => {
    expect(runner).toContain('mktemp -d "/tmp/ojplatform-${run_id}-XXXXXX"');
    expect(runner).toContain('port=19625');
    expect(client).toContain('listener.bind(("127.0.0.1", 19626))');
    expect(runner).not.toMatch(/docker\s+(system|volume|network)\s+prune/);
    expect(runner).not.toMatch(/killall|pkill|chmod\s+777|chmod\s+666/);
  });

  it('keeps adversarial fixtures short, bounded, and local-only', () => {
    expect(fixtures.length).toBe(14);
    for (const fixture of fixtures) {
      expect(fixture.source.length, fixture.name).toBeLessThan(8_000);
      expect(fixture.source, fixture.name).not.toMatch(
        /https?:\/\/|system\s*\(|exec[lvpe]*\s*\(/,
      );
    }
    expect(client).toContain('timeout=35');
    expect(client).toContain('max_workers=2');
    expect(client).toContain('RLIMIT_NOFILE enforcement failed');
    expect(client).toContain('RLIMIT_FSIZE enforcement failed');
    expect(client).toContain('bounded multi-file workspace failed');
  });

  it('keeps qualification out of default test execution', () => {
    const packageJson = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    ) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['qualify:sandbox-security']).toBe(
      'bash tests/security/run-sandbox-security-qualification.sh',
    );
    expect(packageJson.scripts.test).toBe('vitest run');
  });
});
