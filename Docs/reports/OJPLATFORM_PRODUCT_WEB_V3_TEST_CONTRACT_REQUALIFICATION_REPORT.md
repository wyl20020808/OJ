# OJPlatform Web V3 Legacy Test Contract Reconciliation Report

## Result

`PASS`. All 116 initially failing legacy Web UI assertions were classified and reconciled with the authoritative Simplified Chinese Web V3 contract. The full repository test suite, dedicated WEB-V3 matrix, quality gates, runtime checks, responsive browser review, and console review pass.

`WEB V3 LEGACY TEST CONTRACT RECONCILIATION = PASS`

`PRODUCT WEB CHINESE RICH EXPERIENCE V3 = PASS`

`READY FOR LEAD INTEGRATION = YES`

Lead Integration was not started and no merge was performed.

## Baseline

- Worktree: `D:\OJPlatform-worktrees\phase1b-web-authoring`
- Branch: `codex/product-web-v3-test-contract-requalification`
- Starting HEAD: `cf72deb4bea8c75f398344e10bdeb81862e6d9f7`
- Node: `v22.20.0`
- pnpm: `11.19.0`
- Starting worktree: clean
- Initial `pnpm test`: 346 passed, 116 failed, 4 skipped
- Initial failures by file:
  - `tests/web-recovery.test.tsx`: 6
  - `tests/phase2b-sandbox-ops-ui.test.tsx`: 24
  - `tests/web.test.tsx`: 10
  - `tests/phase2a-worker-ops-ui.test.tsx`: 15
  - `tests/product-web-experience.test.tsx`: 17
  - `tests/product-web-modern-experience-v2.test.tsx`: 44

## Failure Classification

The 116 failing assertions were classified individually by their original test intent:

- `LEGACY_LANGUAGE_CONTRACT`: 114. The behavior, API contract, accessibility purpose, authorization rule, or truth assertion remained valid, while the expected visible English copy or accessible name was stale.
- `INTENTIONAL_WEB_V3_PRODUCT_CHANGE`: 1. The V1 home focal heading expected the superseded V1 composition instead of the approved V3 Chinese workbench heading.
- `REAL_REGRESSION`: 1. `WEB-V2-25` exposed an English registration validation fallback still visible in the otherwise Chinese registration flow.
- `OTHER / INFRA`: 0.

The real-regression audit also found four sibling English fallbacks in the same Web-owned Auth component: empty login identifier, generic login failure, password mismatch/minimum length, and generic registration failure. All five fallbacks were localized at their shared production source rather than hidden by test changes.

## Test Contract Changes

The six failing legacy test clusters were updated under the专项 cross-ownership authorization:

- Web shell/recovery tests now assert Chinese loading, degraded, authorization, authoring, submission, and judge-status presentation while preserving raw protocol enum assertions and no-fake-verdict checks.
- Phase 2A Worker UI tests retain worker lease, heartbeat, cancellation, retry, authorization, and degraded-state intent; only current rendered Chinese presentation was selected.
- Phase 2B Sandbox UI tests retain configured-versus-qualified, fail-closed, unavailable, authorization, and qualification-truth assertions; no Sandbox runtime behavior changed.
- Product Web V1/V2 tests now use current roles, accessible names, labels, routes, capability states, and Chinese copy. Auth tests wait for asynchronous method discovery instead of assuming controls are immediately enabled.
- Underlying API/protocol fields such as `emailPassword`, `phonePassword`, `recentProblems`, raw submission states, and English protocol projection labels remain unchanged.
- The historical `expect(true).toBe(true)` ownership placeholder was replaced with an actual Web import-boundary assertion. No new `.skip`, `.todo`, swallowed error, hidden English alias, test-only production branch, or always-pass assertion was introduced.

`tests/product-web-chinese-rich-experience-v3.test.tsx` received formatting-only normalization from the repository's existing Prettier gate; its behavior and assertions are unchanged.

## Final Verification

- `pnpm format:check`: PASS
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS, 462 passed, 0 failed, 4 pre-existing skipped
- `pnpm test:architecture`: PASS
- `pnpm build`: PASS
- `git diff --check`: PASS
- `WEB-V3-01..60`: 60/60 PASS

## Runtime

Fresh checks on 2026-08-31:

- Web: `http://127.0.0.1:5176/` = 200
- API: `http://127.0.0.1:3011/`
- `GET /health` = 200, `{"status":"ok"}`
- `GET /ready` = 200
- PostgreSQL = `ok`
- Redis = `ok`
- Storage = `ok`
- Same-origin `GET http://127.0.0.1:5176/api/problems?offset=0&limit=1` = 200 JSON

## Browser And Console

The real Web was reviewed at exactly 1440x900, 1024x768, and 390x844. Each viewport covered `/`, `/problems`, a real problem detail, `/login`, `/register`, `/submissions`, `/settings`, and `/sandbox`.

- 1440x900: PASS; Chinese shell and content rendered, all required routes opened, no horizontal overflow.
- 1024x768: PASS; stable responsive layout and no horizontal overflow.
- 390x844: PASS; no horizontal overflow, controls fit, and the mobile navigation opened with Home, Problems, Sign in, and Register links.
- Problem detail used real backend data: `/problems/phase2c1-runtime-1788098004091`.
- `/submissions` and `/settings` truthfully presented the Chinese signed-out gate.
- `/sandbox` is not an available router path in this Web build and truthfully presented the Chinese 404 page; no Sandbox capability was fabricated.
- Browser console errors: 0.
- Browser console warnings: 0.
- Mojibake or unexpected legacy English product shell copy: 0 observed. Backend-owned problem titles/statements remain as stored data.

## Truth, Security, And Ownership

- No fake verdict or mapping from raw completion to AC/WA/TLE/MLE/RE/CE was added.
- No fake problem, submission, ranking, competition, discussion, or capability data was added.
- Unconfigured social providers remain `暂未配置` and disabled.
- Sandbox configured state remains distinct from qualified state; fail-closed assertions remain active.
- Same-origin `/api` proxy is preserved and runtime verified.
- API errors and unavailable capabilities remain explicit rather than falling back to fabricated success.
- Production Judge changes: NONE.
- Production Sandbox/runc changes: NONE.
- Production Queue changes: NONE.
- Production Auth backend changes: NONE.
- Production Problem/testdata backend changes: NONE.
- PostgreSQL/Redis domain changes: NONE.
- Web production change: five Auth validation/error fallbacks localized to Chinese.
- `Docs/PROJECT_STATUS.md`: not modified.

## Git Completion

- Branch: `codex/product-web-v3-test-contract-requalification`
- Starting HEAD: `cf72deb4bea8c75f398344e10bdeb81862e6d9f7`
- Commit subject: `test(web): reconcile legacy contracts for Chinese web v3`
- Final HEAD: the enclosing commit for this report; its immutable hash is recorded in the final task response because a commit cannot contain its own hash.
- Required final worktree state: clean.

## Final

The earlier V3 blocker was resolved by reconciling all 116 stale/failing contracts and fixing the Web-owned Auth fallback regression. Tests were not deleted or skipped, security/truth assertions were retained, and visible English aliases were not reintroduced.

`WEB V3 FINAL REQUALIFICATION = PASS`

`READY FOR LEAD INTEGRATION = YES`
