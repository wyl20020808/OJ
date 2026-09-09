# Wave 4F Profile Media & Save V2 Main Integration

Date: 2026-09-09
Status: PARTIAL / REAL_FIXTURE_NOT_VERIFIED

## Source and integration

- Main before: `7a7ea79ec8f2a88d3f102204fa37c97da9afc4c7`
- Feature source: `2da6adf086247bd029f17ba56989fc7eb7bb9681`
- Integrated commits: `e595838`, `2da6adf`
- Candidate: `codex/wave4-profile-media-integration-v1`
- Cherry-pick: normal, no conflicts, no whole-file ours/theirs.
- Scope audit: Profile API/Web, shared storage use, tests, migration, and docs only. No Discussion/Homework/Problem/Judge/Sandbox/Plugin changes.

## Implemented and statically verified

- PATCH profile payload excludes read-only `username`; server keeps username read-only.
- Existing update, first-save upsert, optional clearing, field validation/details, success/failure/cancel UI contracts preserved.
- Avatar/background use authenticated multipart routes, shared S3/MinIO client, MIME/signature/size checks, random replacement-safe keys, controlled public delivery, replace/remove/fallback.
- Database stores object keys only; no base64/data URLs/credentials.
- CSRF and owner-only mutation checks preserved.
- Profile/Edit Profile banner, avatar overlay, metadata, media controls, preview, errors, loading, and responsive styles integrated.
- Focused Profile/Web tests: 43 passed.
- Root typecheck, API/Web builds, changed-file lint, architecture test, and diff check: PASS.

## Migration

- TEMP migration `TEMP_profile_media_save_v2` finalized as `0031_profile_media_save_v2` (up/down), unique after `0030_discussion_announcement_capability`.
- Runner registration added in `scripts/migrate.mjs`.
- Full historical replay is blocked by pre-existing `0020_judge_artifacts` relation duplication; historical migration was not modified.
- Current-state forward apply and second-run could not be qualified because qualification containers exited immediately after startup. Schema inspection therefore remains NOT VERIFIED.

## Runtime qualification

- Product PostgreSQL/MinIO startup was attempted with `scripts/infra.mjs`; health briefly reported, then containers exited externally.
- `pg_isready`, container/Windows/Node `SELECT 1`, profile DB fixture, and real MinIO storage fixture: NOT VERIFIED / BLOCKED_BY_ENVIRONMENT.
- No real user data or persistent volume was deleted or reset. Qualification services were not left running.

## Final qualification (2026-09-09)

- Environment root cause: `scripts/infra.mjs` launched Compose through WSL, then WSL exited when the detached command returned. Docker sent SIGTERM to PostgreSQL, Redis, and MinIO; this was `INFRA_SCRIPT_CLEANUP`, not a service crash.
- Minimal fix: keep `Ubuntu-24.04` alive with a detached keeper during `up`; stop keeper during explicit `down`. No compose or volume changes.
- PostgreSQL stable: PASS. `pg_isready`, container `SELECT 1`, Windows TCP `127.0.0.1:55432`, and Windows Node `SELECT 1`: PASS.
- Migration `0031_profile_media_save_v2`: current-state apply PASS; schema columns `avatar_object_key` and `background_object_key` verified; second run PASS. Full historical replay remains the pre-existing `0020_judge_artifacts` relation duplication blocker; `0020` unchanged.
- MinIO stable: PASS. Product storage integration test 6/6 PASS; bucket ensure and PUT/GET/DELETE PASS; API readiness reports storage `ok`.
- Focused Wave4F tests: 11/11 PASS. Root typecheck, build, architecture, and changed-file lint PASS.
- Full historical Vitest run has 13 unrelated pre-existing failures outside Wave4F; no new Wave4F regression identified.

MAIN INTEGRATION = PARTIAL
POSTGRESQL QUALIFICATION = PASS
MINIO QUALIFICATION = PASS
MANUAL UI ACCEPTANCE = PENDING USER
REAL PROFILE DB FIXTURE = NOT VERIFIED (qualification harness quoting error)
AVATAR/BACKGROUND REAL API FIXTURE = NOT VERIFIED
FULL HISTORICAL REPLAY = PRE-EXISTING_BLOCKER
0020 MODIFIED = NO

## Gate

Main merge intentionally not performed. Per task contract, PostgreSQL/MinIO runtime qualification is a merge blocker and no waiver exists. Manual visual acceptance remains PENDING USER.
