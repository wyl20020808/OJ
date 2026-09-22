import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const referencePath = new URL(
  '../Docs/reports/artifacts/fullstack-sync-v1/e2e-baseline.json',
  import.meta.url,
);
const outputPath = join(
  tmpdir(),
  `ojplatform-playwright-baseline-${process.pid}.json`,
);
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const result = spawnSync(
  pnpm,
  ['exec', 'playwright', 'test', '--reporter=json'],
  {
    encoding: 'utf8',
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: outputPath },
    maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === 'win32',
  },
);

if (!existsSync(outputPath)) {
  process.stderr.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if (result.error) console.error(result.error);
  console.error('Playwright did not produce the baseline comparison report.');
  process.exit(result.status || 2);
}

const reference = JSON.parse(readFileSync(referencePath, 'utf8'));
const report = JSON.parse(readFileSync(outputPath, 'utf8'));
rmSync(outputPath, { force: true });

const stripAnsi = (value) => value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
const signature = (test) => {
  const failedResult = [...(test.results ?? [])]
    .reverse()
    .find((entry) => entry.error || entry.errors?.length);
  const message =
    failedResult?.error?.message ??
    failedResult?.errors?.[0]?.message ??
    'UNKNOWN_FAILURE';
  return stripAnsi(message).split(/\r?\n/, 1)[0].trim();
};
const outcome = (test) => {
  if (test.status === 'skipped') return { status: 'skipped', signature: '' };
  if (test.status === 'unexpected')
    return { status: 'failed', signature: signature(test) };
  if (test.status === 'flaky') return { status: 'failed', signature: 'FLAKY' };
  return { status: 'passed', signature: '' };
};

const actual = new Map();
const collect = (suite, ancestors = []) => {
  const titles =
    suite.line === 0 || !suite.title ? ancestors : [...ancestors, suite.title];
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const reportFile = spec.file.replaceAll('\\', '/');
      const file = reportFile.startsWith('tests/e2e/')
        ? reportFile
        : `tests/e2e/${reportFile}`;
      const identity = `${file}:${spec.line}:${spec.column} › ${[
        ...titles,
        spec.title,
      ].join(' › ')}`;
      actual.set(identity, outcome(test));
    }
  }
  for (const child of suite.suites ?? []) collect(child, titles);
};
for (const suite of report.suites ?? []) collect(suite);

const expected = new Map(reference.tests.map((test) => [test.identity, test]));
const missing = [...expected.keys()].filter((key) => !actual.has(key));
const newFailures = [];
const changedFailures = [];
const newPending = [];
const resolvedFailures = [];

for (const [identity, current] of actual) {
  const prior = expected.get(identity);
  if (current.status === 'failed') {
    if (!prior || prior.status !== 'failed') newFailures.push(identity);
    else if (current.signature !== prior.signature)
      changedFailures.push({
        test: identity,
        expected: prior.signature,
        actual: current.signature,
      });
  }
  if (current.status === 'skipped' && prior?.status !== 'skipped')
    newPending.push(identity);
}
for (const [identity, prior] of expected) {
  if (prior.status === 'failed' && actual.get(identity)?.status === 'passed')
    resolvedFailures.push(identity);
}

const count = (status) =>
  [...actual.values()].filter((test) => test.status === status).length;
const summary = {
  reference: {
    tests: reference.tests.length,
    failed: reference.tests.filter((test) => test.status === 'failed').length,
    skipped: reference.tests.filter((test) => test.status === 'skipped').length,
  },
  actual: {
    tests: actual.size,
    passed: count('passed'),
    failed: count('failed'),
    skipped: count('skipped'),
  },
  comparison: {
    missing: missing.length,
    newFailures: newFailures.length,
    changedFailureSignatures: changedFailures.length,
    newPending: newPending.length,
    resolvedFailures: resolvedFailures.length,
  },
};
console.log(JSON.stringify(summary, null, 2));

const reportErrors = report.errors ?? [];
if (
  result.error ||
  ![0, 1].includes(result.status) ||
  actual.size < reference.tests.length ||
  reportErrors.length ||
  missing.length ||
  newFailures.length ||
  changedFailures.length ||
  newPending.length
) {
  if (result.error) console.error(result.error);
  if (reportErrors.length)
    console.error('Playwright report errors:', reportErrors);
  if (missing.length) console.error('Missing E2E tests:', missing);
  if (newFailures.length) console.error('New E2E failures:', newFailures);
  if (changedFailures.length)
    console.error('Changed E2E failure signatures:', changedFailures);
  if (newPending.length) console.error('New pending E2E tests:', newPending);
  process.exit(1);
}

console.log(
  `Playwright baseline gate PASS: ${count('passed')} passed, ` +
    `${count('failed')} known failures, ${count('skipped')} known skipped, ` +
    `${resolvedFailures.length} resolved.`,
);
