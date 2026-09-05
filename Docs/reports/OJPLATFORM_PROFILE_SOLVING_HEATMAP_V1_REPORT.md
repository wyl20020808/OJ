# PROFILE SOLVING HEATMAP V1

Status: PASS (code and focused tests); browser runtime not verified.

- 365-day UTC daily aggregation endpoint: `/api/profiles/:username/activity`.
- Returns only date, submission count, and accepted count; source/private submission fields excluded.
- Uses current evaluation verdict for AC; empty users receive 365 zero cells.
- Profile UI renders grid heatmap with neutral zero cells and date/submission/AC tooltip. Existing horizontal scroll supports mobile.

Evidence:

- `pnpm exec tsc -b --pretty false` PASS.
- `pnpm exec vitest run tests/product-web-profile-backend-requalification.test.tsx tests/web.test.tsx` PASS (15 tests).
- `git diff --check` PASS.
- Browser runtime: NOT VERIFIED.

Remaining risk: direct PostgreSQL integration tests for aggregate SQL and cross-midnight fixtures were not available in this worktree.
