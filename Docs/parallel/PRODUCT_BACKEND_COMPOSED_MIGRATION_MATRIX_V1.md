# Product Backend Composed Migration Matrix V1

Registry: `scripts/migrate.mjs`
Order is numeric, explicit, deterministic, and executed in the listed direction.

| ID | File | Domain | Source Branch | Registry Position | Fresh DB | Existing DB | Down/Up | Notes |
|---|---|---|---|---:|---|---|---|---|
| 0000 | `0000_platform_metadata.sql` | Platform | base | 1 | PASS | PASS | PASS | Shared metadata |
| 0001 | `0001_auth_foundation.sql` | Auth | base | 2 | PASS | PASS | PASS | Users, credentials, sessions |
| 0002 | `0002_problem_foundation.sql` | Problem | base | 3 | PASS | PASS | PASS | Existing shared problem schema |
| 0003 | `0003_authz_foundation.sql` | Authz | base | 4 | PASS | PASS | PASS | Roles and audit foundation |
| 0004 | `0004_problem_authoring_revision.sql` | Problem | base | 5 | PASS | PASS | PASS | Revision schema |
| 0005 | `0005_submission_intake.sql` | Submission | base | 6 | PASS | PASS | PASS | Submission intake |
| 0006 | `0006_auth_identity_verification_social.sql` | Auth V2 | `codex/product-identity-verification-social-v2` (`f4e4020`) | 7 | PASS | PASS | PASS | Recovered Auth-owned migration; no duplicate schema |
| 0007 | `0007_contest_foundation.sql` | Contest | `codex/product-backend-contest-messaging-foundation-v1` (`8d85fa1`) | 8 | PASS | PASS | PASS | Contest lifecycle and registration |
| 0008 | `0008_social_messaging_foundation.sql` | Social/Messaging | `codex/product-backend-contest-messaging-foundation-v1` (`8d85fa1`) | 9 | PASS | PASS | PASS | Friend, conversation and message tables |
| 0009 | `0009_notifications_foundation.sql` | Notifications | `codex/product-backend-contest-messaging-foundation-v1` (`8d85fa1`) | 10 | PASS | PASS | PASS | Notification persistence |
| 0010 | `0010_guest_auth.sql` | Guest Auth | `codex/product-backend-guest-auth-contract-reconciliation-v2` (`6f4cca4`) | 11 | PASS | PASS | PASS | Guest tables after Auth V2 nullable email |
| 0011 | `0011_profile_favorites.sql` | Profile Favorites | Runtime Gap Closure V1 | 12 | PASS | PASS | PASS | User/problem uniqueness and stable per-user index |

## Lifecycle Evidence

- Registry uniqueness: PASS; `0000` through `0011` occur once.
- Deterministic order: PASS; up uses ascending order and down uses the exact reverse.
- Fresh database up: PASS (isolated PostgreSQL qualification database).
- Existing baseline upgrade: PASS (baseline `0000` through `0010`, then `0011`).
- Reverse down and up again: PASS; `0011` through `0000` reverse successfully after test data cleanup, followed by a second ascending run.
- Schema checks: Auth identity/verification/OAuth, contest, social/messaging, notifications and Guest tables were present after composed up.

`0006` is Auth V2-owned and was absent only from the prior integration ancestry;
it was recovered from the source branch and registered without renumbering or
recreating equivalent tables.
