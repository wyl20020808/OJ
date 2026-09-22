# OJPlatform Full-Stack Synchronization V1

Date: 2026-09-22

Branch: `codex/fullstack-sync-v1`

Base main: `ed192ff411b62337fc5071c3f59cef70d0388f2c`

Qualified feature HEAD before this report: `fbc1e914d4782888f29d2600f4e04b92000baa1e`

## Status

```text
FULL_STACK_SYNCHRONIZATION = PASS
FRESH_MAIN_INTEGRATION = PASS
FRONTEND_BACKEND_CONTRACT_ALIGNMENT = PASS
TRUTHFUL_UNAVAILABLE_STATES = PASS
AUTOMATED_BROWSER_RUNTIME = PASS
BASELINE_FAILURE_COMPARISON = PASS (exact identities/signatures unchanged)
MERGED_TO_INTEGRATION_CANDIDATE = YES
READY_FOR_MAIN_FAST_FORWARD = YES
MANUAL UI ACCEPTANCE = PENDING USER
```

## Scope and result

The composed Web experience was audited route by route against the API, domain,
persistence, authentication, authorization, CSRF, and Judge boundaries. Visible
actions now either use authoritative backend contracts or explicitly explain the
missing product dependency. Fabricated success, data, rankings, activity,
taxonomy, controls, and local-only authentication conclusions were removed.

The durable route/action/contract inventory is
`Docs/FULLSTACK_SYNC_MATRIX.md`. It records every synchronized browser surface,
the non-route editor/bootstrap/logout integrations, and backend-only or deferred
contracts that intentionally remain outside the current Web experience.

## Implemented synchronization

### Authentication and mutation behavior

- Protected routes use explicit authentication-state gates rather than rendering
  a logged-out conclusion before bootstrap completes.
- Non-401 identity bootstrap failures are presented as service unavailability;
  they are not converted into anonymous success.
- Logout clears local identity only after server logout succeeds.
- Existing same-origin session-cookie and CSRF contracts remain authoritative
  for mutations.

### Authoritative product flows

- `/homework` now uses persisted Assignment APIs. The static Homework dashboard,
  fixture data, and its page-specific components/styles were deleted.
- Assignment links and rows use the public `publicId`; the Web contract no longer
  exposes the internal `problemId` for assignment problem rows.
- Problem favorites use the real Profile favorite mutation and enforce the
  authenticated, non-Guest boundary.
- Contest detail, registration, management, ordered problems, participants, and
  current-user submission history consume live Contest contracts.
- Discussion, Team, Problem Library, Home, and related navigation surfaces use
  real projections and show explicit loading, empty, unavailable, and failure
  states rather than fabricated business data.
- OnlineCodeEditor sample-run comparison is visibly `EXACT_BYTES`; formal
  Submission judging remains bound to server-authoritative Judge configuration.

### Capability and outage semantics

- Judge administration capability is `{ canView, canManage }`; read access and
  mutation access are distinct, and an upstream outage is not rendered as an
  authorization denial.
- The Web exposes Judge mutations only when `canManage` is true; backend policy,
  idempotency, concurrency, CSRF, and audit enforcement remain authoritative.
- The API-to-Judge boundary remains the Judge Service control plane. No Worker
  Product PostgreSQL access or Web/API execution of untrusted code was added.

## Explicitly unavailable and deferred

- Contest standings remain unavailable with
  `SCORING_ENGINE_NOT_INTEGRATED`; no client ranking is computed.
- Wrong-book remains unavailable until an authoritative verdict-derived
  aggregation and privacy contract exists.
- Dedicated contest submission creation remains deferred. The current central
  composition cannot atomically bind the Contest submission and dispatch the
  Judge job; the route reports `SUBMISSION_BINDING_NOT_INTEGRATED` instead of
  risking an orphaned job. Read-only contest submission history is live.
- Unsupported Problem Library personal/result filters, Discussion AI/follow/
  history projections, Team taxonomy/activity projections, and advanced Judge
  provisioning controls remain disabled, absent, or explicitly unavailable.
- Manual visual acceptance remains `PENDING USER`; automated browser evidence
  does not replace it.

## Validation

### Static, build, and architecture gates

| Gate | Result |
| --- | --- |
| Repository formatting | PASS |
| Repository lint | PASS |
| Root TypeScript typecheck | PASS |
| Architecture gate | PASS |
| Root build | PASS |
| API build | PASS |
| Web production build | PASS |
| `git diff --check` | PASS |

### Full Vitest baseline comparison

The comparison is by exact failed test identity and failure signature, not by
aggregate count. Evidence is committed under
`Docs/reports/artifacts/fullstack-sync-v1/`.

| Result | Baseline `ed192ff` | Feature `fbc1e91` |
| --- | ---: | ---: |
| Test files | 99 | 100 |
| Passed test files | 85 | 86 |
| Failed test files | 14 | 14 |
| Tests | 1066 | 1082 |
| Passed | 1013 | 1029 |
| Failed | 48 | 48 |
| Pending | 5 | 5 |

Exact comparison:

```text
EXISTING_FAILURE_IDENTITIES = 48
NEW_FAILURE_IDENTITIES = 0
RESOLVED_FAILURE_IDENTITIES = 0
FAILURE_SIGNATURE_CHANGES = 0
```

The repository-wide suite is therefore not globally green, but this feature
introduces no new failure and changes no existing failure signature.

### Pinned OnlineCodeEditor

Pinned revision: `09877bf30a344bfd8d61775d1ee64c8ae61c9f86`.

- Plugin tests: PASS, 56/56.
- Plugin build: PASS.
- The submodule revision was not changed.
- A pre-existing React key warning in the plugin `ExecutionPanel` remains a
  follow-up and was not hidden or fixed by changing the pinned revision.

### Managed runtime and browser

- Runtime startup, status, and qualification used the managed Runtime Manager.
- Infrastructure readiness and Doctor checks passed from exact product commit
  `fbc1e91`; the Judge worker reached ONLINE.
- `tests/e2e/fullstack-sync-v1-runtime.spec.ts` passed against
  `http://127.0.0.1:5173` in 9.2 seconds.
- The installed-Chrome journey covered registration/login, persisted Problem and
  favorite behavior, Team/Assignment/Homework, Discussion, contest creation and
  history, standings unavailability, wrong-book unavailability, Judge denial,
  and logout.
- Expected authentication 401 and standings 503 responses were accepted. No
  page error or unexpected HTTP failure passed the test.
- The in-app browser connection was unavailable; installed-Chrome Playwright
  supplied the automated browser evidence instead.

Qualification created uniquely prefixed records only in local development data;
no production path was used.

## Compatibility and deployment

```text
MIGRATION_CHANGE = NO
DEPLOYMENT_CHANGE = NO
PLUGIN_REVISION_CHANGE = NO
JUDGE_PROTOCOL_CHANGE = NO
PUBLIC API CHANGE = YES (Judge capability response)
WEB CONTRACT CLEANUP = YES (Assignment problem-row DTO)
```

The Judge capability response intentionally distinguishes `canView` from
`canManage`. Assignment problem rows intentionally omit the internal
`problemId` and use public identifiers. Corresponding Web consumers and tests
were updated together.

## Git

Qualified implementation commits before report/status documentation:

- `9a9d781` — `feat: synchronize full-stack web flows`
- `fbc1e91` — `test: qualify synchronized runtime flows`

Main was not merged or pushed at feature qualification time.
`D:\OJPlatformPlugins\AlgoQuest` was not accessed or modified.

## Final integration

The integration candidate was created in a fresh worktree from fetched
`origin/main` `ed192ff411b62337fc5071c3f59cef70d0388f2c`. Feature tip
`547782e2cb4b591ecc9d7e4900d61bbd57bfc771` was merged with `--no-ff` as
`c71be34a1a6a11a101c6046a85cedfcdf4d6fa21`; there were no conflicts.

The first candidate full-suite run exposed one timing-dependent extra request in
the Problem Library test: tag-catalog readiness could reload an unfiltered list
even though no category filter depended on the catalog. Focused reproduction
passed, and an unmodified full rerun returned to the exact baseline signature,
but the redundant request was still corrected rather than dismissed as a flake.
Integration commit `c05ed7a8d201bfa102c6a5b6c13dd073403e09d9`
now gates catalog readiness only when a category filter needs tag expansion; the
test deterministically resolves the catalog and proves that no second list load
occurs.

Final candidate evidence at product code commit `c05ed7a`:

| Gate | Result |
| --- | --- |
| Format, lint, typecheck | PASS |
| Architecture gate | PASS |
| Root, API, Web builds | PASS |
| Full Vitest | 1082 total; 1029 passed; 48 failed; 5 pending |
| Exact baseline diff | `new=0`; `resolved=0`; `signature changes=0` |
| Problem Library focused regression | PASS, 4/4 |
| Pinned editor tests/build | PASS, 56/56; build PASS |
| Managed runtime start + Doctor | PASS / READY |
| Explicit-source runtime status | `MIXED SOURCE = False`; worker ONLINE |
| Installed-Chrome composed journey | PASS, 1/1 in 5.5s |
| `git diff --check` | PASS |

The first fresh-worktree Web build was attempted before installing the pinned
submodule's own lockfile and therefore could not resolve CodeMirror packages.
After `npm ci` in the unchanged pinned submodule, plugin tests/build and the Web
build passed. This was a worktree setup prerequisite, not a source failure.

The managed runtime was stopped through `scripts/dev-runtime.ps1`, restarted
with the integration checkout as the explicit source, and verified by Doctor.
The final browser journey again covered the persisted and explicitly unavailable
flows listed above, with no page error or unexpected HTTP failure accepted.
