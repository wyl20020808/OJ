# OJPlatform Admin Cross-Owner Submission Source Access V2

Status: PASS for focused authorization and projection scope; browser runtime NOT VERIFIED.

## Root Cause

Submission detail authorization had the intended owner and `submission:view:any` checks, but Product composition did not consistently project the canonical capability into Auth/Web. The resolver also inherited configured operator username shortcuts, so the formal submission capability path was not the sole cross-owner authority.

## Implemented

- Auth user projections now receive server-resolved `canViewAnySubmission` capability.
- Submission authorization resolves cross-owner access from explicit user-id permission maps or persisted `submission:view:any` roles. No username or `root` special case.
- Detail route remains final source boundary. Global evaluation list, evaluation detail, SSE, and profile projections remain source-free.
- Web renders Code tab only when authorized detail response includes source.

## Matrix

| Principal | Result |
| --- | --- |
| Submission owner | ALLOW |
| Explicit cross-owner capability | ALLOW |
| Normal other user | DENIED |
| Anonymous | DENIED |

## Evidence

- TESTED: focused API/Auth/Web suites, 19 passing.
- TYPECHECK: `pnpm typecheck` PASS.
- BUILD: `pnpm build` PASS.
- DIFF CHECK: `git diff --check` PASS.
- FULL TEST: PARTIAL; unrelated baseline/environment failures remain (database unavailable, pre-existing foundation/version mismatch, Phase 2A async UI, phone-auth fixture).
- BROWSER: NOT VERIFIED; runtime startup requires clean tracked checkout and current worktree contains intended edits.
- SOURCE LEAK: NO in list/evaluation/SSE/profile paths.

## Final

ADMIN SOURCE ACCESS V2 = PASS
BACKEND AUTH = PASS
FRONTEND = PASS
NO username/root special-case.
No merge with main.
