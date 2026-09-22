import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const referencePath = new URL(
  '../Docs/reports/artifacts/fullstack-sync-v1/current-vitest.json',
  import.meta.url,
);
const outputPath = join(
  tmpdir(),
  `ojplatform-vitest-baseline-${process.pid}.json`,
);
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const result = spawnSync(
  pnpm,
  [
    'exec',
    'vitest',
    'run',
    '--reporter=json',
    `--outputFile=${outputPath}`,
    '--maxWorkers=1',
    '--no-file-parallelism',
  ],
  {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === 'win32',
  },
);

if (!existsSync(outputPath)) {
  process.stderr.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if (result.error) console.error(result.error);
  console.error('Vitest did not produce the baseline comparison report.');
  process.exit(result.status || 2);
}

const reference = JSON.parse(readFileSync(referencePath, 'utf8'));
const actual = JSON.parse(readFileSync(outputPath, 'utf8'));
rmSync(outputPath, { force: true });

const stripAnsi = (value) => value.replace(/\u001b\[[0-9;]*m/g, '');
const testFile = (value) => {
  const normalized = value.replaceAll('\\', '/');
  const marker = normalized.lastIndexOf('/tests/');
  return marker >= 0 ? normalized.slice(marker + 1) : normalized;
};
const identity = (suite, assertion) =>
  `${testFile(suite.name)} :: ${assertion.fullName}`;
const signature = (assertion) =>
  stripAnsi(assertion.failureMessages?.[0] ?? '').split(/\r?\n/, 1)[0];

const collect = (report) => {
  const tests = new Map();
  for (const suite of report.testResults) {
    for (const assertion of suite.assertionResults) {
      tests.set(identity(suite, assertion), {
        status: assertion.status,
        signature: signature(assertion),
      });
    }
  }
  return tests;
};

const expectedTests = collect(reference);
const actualTests = collect(actual);
const missing = [...expectedTests.keys()].filter(
  (key) => !actualTests.has(key),
);
const newFailures = [];
const changedFailures = [];
const newPending = [];
const resolvedFailures = [];

for (const [key, current] of actualTests) {
  const expected = expectedTests.get(key);
  if (current.status === 'failed') {
    if (!expected || expected.status !== 'failed') newFailures.push(key);
    else if (current.signature !== expected.signature)
      changedFailures.push({
        test: key,
        expected: expected.signature,
        actual: current.signature,
      });
  }
  if (
    ['pending', 'todo', 'skipped'].includes(current.status) &&
    (!expected || !['pending', 'todo', 'skipped'].includes(expected.status))
  )
    newPending.push(key);
}

for (const [key, expected] of expectedTests) {
  if (expected.status === 'failed' && actualTests.get(key)?.status === 'passed')
    resolvedFailures.push(key);
}

const summary = {
  reference: {
    files: reference.testResults.length,
    tests: reference.numTotalTests,
    failed: reference.numFailedTests,
    pending: reference.numPendingTests,
  },
  actual: {
    files: actual.testResults.length,
    tests: actual.numTotalTests,
    passed: actual.numPassedTests,
    failed: actual.numFailedTests,
    pending: actual.numPendingTests,
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

if (
  result.error ||
  ![0, 1].includes(result.status) ||
  actual.numTotalTests < reference.numTotalTests ||
  actual.testResults.length < reference.testResults.length ||
  missing.length ||
  newFailures.length ||
  changedFailures.length ||
  newPending.length
) {
  if (result.error) console.error(result.error);
  if (missing.length) console.error('Missing tests:', missing);
  if (newFailures.length) console.error('New failures:', newFailures);
  if (changedFailures.length)
    console.error('Changed failure signatures:', changedFailures);
  if (newPending.length) console.error('New pending tests:', newPending);
  process.exit(1);
}

console.log(
  `Vitest baseline gate PASS: ${actual.numPassedTests} passed, ` +
    `${actual.numFailedTests} known failures, ${resolvedFailures.length} resolved.`,
);
