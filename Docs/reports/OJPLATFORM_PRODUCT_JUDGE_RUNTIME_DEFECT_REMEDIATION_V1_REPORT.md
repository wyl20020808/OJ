# OJPlatform Product Judge Runtime Defect Remediation V1 Report

## Result

`UNIFIED JUDGE RUNTIME INTEGRATION = PASS`.

The scoped Product/Judge defects were reproduced on the active local runtime,
fixed at the shared Product boundary, covered by regression tests, and
requalified through Browser -> Product -> Judge Service -> Scheduler ->
Host-Agent-owned Worker -> non-root Supervisor -> Sandbox -> Product.

## Root Causes And Fixes

- A+B WA: the published A+B v1 uses the then-configured `EXACT_BYTES` checker. The input is `31 20 32 0A`
  (`1 2\n`) and expected output is `33 0A` (`3\n`), with no BOM and LF line
  endings. `cout << a + b;` emits `33`, so it is correctly WA at the first
  missing newline. `cout << a + b << '\n';` emits `33 0A` and is AC. The
  The published immutable version was not rewritten; new drafts now use
  `TOKEN_WHITESPACE` by the follow-up Default Checker V1 policy, while this
  historical version remains exact.
- Problem 409: the identifier/slug `1234` already existed. The API correctly
  returned `CONFLICT`; the Web author form now presents the Chinese business
  message `题目编号已存在，请更换题目标识。`.
- Judge Data Validate 400: the attempted validation had no draft after the
  prior version had been published. That is correctly
  `VALIDATION_FAILED: At least one testcase required`. A separate executable
  contract gap also existed: Publish had accepted testcase input larger than
  the Judge manifest's 65,536-byte limit.
- Submission 500: published problem `1234` contained a 78,939-byte testcase.
  `createTestcaseSetManifest` rejected it after submission creation, and the
  uncaught contract error surfaced as 500. Validation now checks the Judge
  execution byte limits and verifies retrieved object size/hash. Historic
  already-published invalid data now fails closed as
  `JUDGE_DATA_MANIFEST_INVALID` (409), not 500. Missing published data remains
  `JUDGE_DATA_UNAVAILABLE` (409). The submission route now preserves the safe
  Product error message instead of replacing it with a generic one.

Raw testcase bytes remain valid Judge Data; validation does not impose a UTF-8
text restriction that would alter the byte-oriented checker contract.

## Browser Runtime Evidence

All actions used local Guest `C4F0888B` and the current unified source.

- Existing `unified-runtime-ab-20260902` A/B proof:
  - `9e5d1c74-8b11-4137-bf2f-aae0d818bd46`, no trailing newline: `WA`, testcase
    #1, 47 ms, 4.5 MB.
  - `3901cd58-57dc-4382-aeba-60e15c1cecd4`, trailing newline: `AC`, testcase
    #1, 251 ms.
- Fresh private `runtime-regression-ab-20260903` was created in Browser;
  `01.in` (`1 2\n`) and `01.out` (`3\n`) were uploaded, validation passed,
  and immutable Judge Data v1 was published with `EXACT_BYTES`.
  - `c58fd2ee-a765-4b65-baeb-7a8c7e6a5286`: AC, testcase #1, 251 ms.
  - `010090a8-e4be-4aad-ae17-894e9e08d4a6`: WA, testcase #1, 251 ms.
  - `66ee6c69-194a-47b5-9dd7-c3d8a20e9e8b`: CE with scrubbed compiler
    diagnostics and no testcase execution record.
  - `70335b66-b06e-4a7d-b4d8-be979018768d`: RE, testcase #1, 70 ms, 4.4 MB,
    `Process exited with code 1`.
- Fresh `invalid-judge-data-regression-20260903` accepted an uploaded
  65,537-byte input but Validate returned the displayed safe error
  `Testcase #1 exceeds the Judge execution byte limit`; Publish stayed
  disabled. A submission displayed `No published Judge Data version is
  available`, with no 500.
- A Browser duplicate create using the fresh regression slug returned 409 and
  displayed the explicit Chinese conflict message.

The active Host Agent owned Worker
`cpp20-gcc-13-v1-1788363745996-1` (incarnation
`0442a79c-1374-4905-8cb0-65bf4586183f`) throughout the qualification. No
Worker was started directly.

## Tests

- Focused regression suite: 39 passed.
- `pnpm test`: 775 passed, 5 existing opt-in skips.
- `pnpm test:web`: 12 passed.
- `pnpm integration`: 9 passed.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
  `pnpm test:architecture`, `pnpm build`, `pnpm build:web`, and
  `git diff --check`: PASS.
- `go test ./...` in `apps/judge-worker`: PASS.
- Linux `go test ./...` in `apps/sandbox-supervisor`: PASS.

The first concurrent `pnpm test` invocation had a transient existing Host
Agent temporary-file rename failure. The required standalone rerun passed in
full; no test was changed or skipped.

## Status

`IMPLEMENTED`: YES.

`TESTED`: YES, by the listed automated gates.

`RUNTIME VERIFIED`: YES, for the bounded local Browser/Product scope.

`PRODUCTION READY`: NOT CLAIMED.
