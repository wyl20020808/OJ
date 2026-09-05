# OJPlatform Root Submission Source Access V1 Report

Status: PASS

## Audit

`GET /api/submissions/:id` returns source only after `SubmissionService.detail`
authorizes the submission. Owner access is direct ownership; cross-owner access
requires the existing `submission:view:any` permission and a password session.
Evaluation history and SSE routes reuse the same detail authorization. Global
evaluation list projection excludes source. Web renders source only from the
authorized detail response; it does not replace backend authorization.

## Implemented

- Extended the public submission authorization policy with a canonical permission
  resolver.
- Wired Postgres and in-memory Product composition to that resolver.
- Removed duplicated cross-owner permission checks from composition while keeping
  password-strength enforcement.
- No username-based root bypass. No list, SSE, or public evaluation source leak.

## Security Matrix

| Principal | Result |
| --- | --- |
| Submission owner | PASS |
| Root/highest admin capability (`submission:view:any`) | PASS |
| Unrelated normal user | DENIED |
| Anonymous | DENIED |

## Evidence

- TESTED: focused `submission-authz` and Product access tests, 9 passing.
- TESTED: `pnpm typecheck`.
- TESTED: `pnpm build`.
- TESTED: `git diff --check`.
- RUNTIME VERIFIED: not run; browser runtime intentionally skipped per task limit.
- No merge with `main`.

## Final

ROOT SUBMISSION SOURCE ACCESS = PASS
OWNER ACCESS = PASS
ROOT ACCESS = PASS
NORMAL OTHER ACCESS = DENIED
ANONYMOUS ACCESS = DENIED
USERNAME HARDCODE = NO
BACKEND AUTH = PASS
FRONTEND = PASS
TYPECHECK = PASS
BUILD = PASS
DIFF CHECK = PASS
