# OJPlatform Product Correctness Wave 2: Discussion Publish and Admin Source

Date: 2026-09-08
Branch: `codex/product-correctness-wave2`
Observed main: `f823239152b85c690cbae447e9bf02c80e58b11f`

## Outcome

Status: **PASS** for implementation, focused tests, PostgreSQL qualification,
typechecks, builds, changed-file lint, architecture, and diff validation. The
managed Product runtime and a manual browser session were not started because
the task explicitly excludes Runtime Manager repair; the API and Web behavior
was exercised through Fastify and React harnesses.

## Discussion UUID Root Cause

`PostgresDiscussionRepository.get()` used one PostgreSQL parameter in
`p.id=$1 OR p.public_id=$1`. The left comparison required `$1` to be `uuid`,
while the right comparison required the same parameter to be `text`. PostgreSQL
therefore raised `operator does not exist: text = uuid`. The same faulty key
predicate existed in `update`, `publish`, `tombstone`, and `incrementViews`.
Publishing an existing draft called `get()` before `publish()`, so the visible
error occurred in the real Editor, Web client, route, repository chain.

The repository now classifies its canonical generated UUID key and generated
`post-*` public key, then emits exactly one typed predicate: `id=$1` for an
internal UUID or `public_id=$1` for a public text ID. No schema cast or migration
was used to conceal the mismatch.

### Identifier Contract

| Identifier | Database | Domain / repository | API / route |
| --- | --- | --- | --- |
| `discussion_posts.id` | `uuid` | TypeScript `string`, generated UUID | route `string`; UUID predicate |
| `discussion_posts.public_id` | `text` | TypeScript `string`, generated `post-*` | route `string`; text predicate |
| post `author_id`, `deleted_by` | `uuid` | canonical User ID `string` | authenticated User ID |
| `discussion_comments.id` | `uuid` | TypeScript `string` | route `string`; UUID predicate |
| comment `post_id`, `author_id`, `parent_comment_id` | `uuid` | canonical entity/User ID `string` | resolved internal IDs |
| `discussion_post_likes.post_id`, `user_id` | `uuid` | canonical entity/User ID `string` | resolved post and authenticated User IDs |

`discussion_comments` has no `deleted_by` column. Migration
`0025_discussion_core` matches this contract and was not rewritten. Discussion
needs no schema change.

PostgreSQL qualification created a transaction-local User and draft Article,
published the draft through its text public ID, verified UUID storage,
`PUBLISHED`, non-null `published_at`, public list, and detail, then tested denied
and allowed Announcement publication. The transaction was rolled back; fixture
count after the test was zero.

## Admin Submission Source Root Cause

Previous repairs correctly added `submission:view:any` evaluation, session
capability projection, and source-tab gating. Their Product test injected
`operatorUsernames: new Set(['source-admin'])`, so it proved a configured test
shortcut rather than the user's persisted administrator role.

Read-only PostgreSQL forensics showed the real `root` administrator assigned to
`platform-root`. That role had Judge and Problem administration permissions but
did not contain `submission:view:any`. Consequently `/api/auth/me` projected
`canViewAnySubmission: false`; the backend denied cross-owner detail, and the
Web never received source. This was a permission-data integration omission, not
an owner-scoped Submission repository query or a source storage failure.

Temporary forward migration `0026_submission_source_permission` adds the
existing canonical `submission:view:any` capability only to the existing
`platform-root` role. It does not hardcode a username in Web or route logic.
The final migration number is not locked and must be selected by Integration
Lead.

Submission source now also has an explicit endpoint:
`GET /api/submissions/:id/source`. It uses the same backend
`SubmissionService.detail()` authorization as Submission and Evaluation detail
and returns only `submissionId`, `languageId`, and `source`. The Evaluation Web
view calls this endpoint and shows its Code tab only after an allowed response;
copy uses that response. A failed source request now leaves the evaluation detail
available, hides source controls and content, and displays an explicit
`源代码暂不可用。` error. Existing detail response behavior remains compatible.

### Authorization Matrix

| Principal | Source endpoint | Web source UI |
| --- | --- | --- |
| Owner | `200`, exact source | shown |
| Ordinary other user | `403` | unavailable |
| `submission:view:any` administrator | `200`, exact source | shown |
| Anonymous | `401` | unavailable |

Evaluation history and generation routes authorize through the same Submission
policy. The dedicated source endpoint is shared by the current Submission /
Evaluation detail page, preventing separate UI authorization logic.

## Validation

- Focused Discussion, Submission, Auth, Authz, Evaluation, and Web tests:
  current rerun `9 files, 55 tests` passed.
- PostgreSQL integration: `1 file, 1 test` passed; all fixtures and permission
  changes rolled back. A later rerun was blocked because the shared PostgreSQL
  listener was no longer available; the earlier transaction-scoped PASS remains
  the database qualification evidence.
- API typecheck: passed.
- Web typecheck: passed.
- Root typecheck: passed.
- API build: passed.
- Web build: passed with the existing chunk-size warning.
- Changed-file ESLint: passed.
- Changed-file Prettier check: passed for all touched files except two shared
  files with pre-existing whole-file format drift; changed hunks follow local
  format and ESLint passes.
- Architecture dependency gate: passed.
- `git diff --check`: passed.
- New regressions: none observed.
- Runtime smoke / manual browser: not verified; no Runtime Manager or Judge
  changes were made.

## Integration

High-risk shared files are `apps/api/src/modules/submission/routes.ts`,
`apps/web/src/app/App.tsx`, and `apps/web/src/services/api.ts`. Migration conflict
risk is **MEDIUM** because `0026` is a temporary feature-branch number.
Integration Lead must renumber both migration files together and ensure the
final Product migration registry/scanner includes them. Migration final number
locked: **NO**. Ready for integration: **YES**.

Real persistent data mutated: **NO**. Required dirty and untracked files after
delivery: **0**.
