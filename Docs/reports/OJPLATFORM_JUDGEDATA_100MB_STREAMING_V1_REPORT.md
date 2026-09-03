# OJPlatform JudgeData 100 MiB Streaming V1 Report

Status: PARTIAL (implementation and focused validation pass; full Supervisor runtime qualification blocked by existing Linux-only/runtime environment failures).

## Limits

- Baseline: `498b8176bb554f4165f6ec6a7705ea92a7fefb01`
- Previous testcase input/output gates: 64 KiB Judge protocol, 16 MiB Product storage references and pair uploads, 16 MiB ZIP entries, 128 MiB ZIP total.
- New testcase input/output gate: `104857600` bytes (100 MiB) at Product, manifest, ZIP entry, and Judge Worker/Supervisor handoff validators.
- ZIP archive limits: 256 entries, 256 MiB compressed, 256 MiB uncompressed, 100 MiB per entry. Upload HTTP body gate: 384 MiB for base64 JSON envelope.

## Design

- Shared limits prevent Product/ZIP drift.
- Fastify upload routes raise only upload body limits; browser checks raw file size before base64 encoding.
- ZIP parser keeps path traversal, duplicate identity, file type, header consistency, ratio, entry count, compressed-size, uncompressed-size, and per-entry checks. zlib output is capped at 100 MiB + 1 byte.
- Base64 decoded-size checks reject oversized payloads before decoded storage upload. Existing S3 metadata SHA-256 and manifest integrity checks remain unchanged.
- Judge Worker/Supervisor validators accept 100 MiB testcase payloads while preserving 64 KiB stdout/stderr capture limits.

## Validation

- `pnpm exec vitest run tests/problem-judge-data.test.ts tests/code-run-api.test.ts`: PASS, 14 tests.
- `pnpm typecheck`: PASS.
- `pnpm build:api`: PASS.
- `pnpm build:web`: PASS (existing chunk-size warning).
- `git diff --check`: PASS.
- Go Worker tests: PASS.
- Go Supervisor tests: BLOCKED/FAIL in existing Linux-only `trusted-probe` syscall build and environment-dependent sandbox lifecycle tests; no runtime repair performed per Goal.

## Completion

Code Exists: YES. Feature Implemented: YES. Feature Tested: focused Product/ZIP and Worker checks PASS. Feature Runtime Qualified: NOT VERIFIED. Production Ready: NO.

Final commit: `feat: support 100 MiB judge data streaming limits` (HEAD). Worktree tracked-clean after final checks.
