# Full-Stack Synchronization Matrix V1

Live audit date: 2026-09-22. This matrix describes the composed production path, not standalone module capability. The Web uses the same-origin session cookie for authentication and sends `x-csrf-token` from `oj_csrf` on mutations. Backend authorization remains authoritative.

## Status legend

- `ALIGNED`: the visible route/action uses a composed backend contract and authoritative data.
- `ALIGNED / SERVER-GATED`: the UI may expose a read surface, but the backend makes the final resource/capability decision.
- `EXPLICITLY UNAVAILABLE`: no fake data or success is shown; the missing upstream is named in the UI.
- `DEV FIXTURE ONLY`: available only behind `import.meta.env.DEV` and visibly labelled.
- `FOLLOW-UP`: a real contract exists on only one side or is intentionally not exposed; the reason and next boundary are recorded below.

## Browser routes and visible actions

| Web route | Visible reads/actions | API/domain/persistence | Access and mutation protection | Status |
|---|---|---|---|---|
| `/` | Recent real problems, announcements, contest summary; deterministic “today” selection from those problems | `GET /api/home`, `/api/discussion/posts`, `/api/contests/home-summary`; PostgreSQL problem/discussion/contest data | Public reads | `ALIGNED`; “近期题目” is not presented as a recommendation-engine result; homework links to the real Assignment page |
| `/login`, `/register` | Password/code/OAuth/guest flows according to server capabilities | `/api/auth/*`; Auth service and durable user/session stores | Public entry; server capabilities hide unavailable providers; CSRF on mutations | `ALIGNED` |
| `/profile`, `/account` | Current user's profile, activity/overview/solved/submissions/favorites/contests/problems | `/api/profile/me`, `/api/profiles/:username/*`, `/api/profile/*`; PostgreSQL + object storage | Auth gate; profile backend enforces password/ownership where required | `ALIGNED` |
| `/profiles/:username` | Public profile and public projections | `/api/profiles/:username/*`; PostgreSQL | Public projection; backend privacy/capability response | `ALIGNED / SERVER-GATED` |
| `/settings`, `/account/settings` | Profile/media save, identifiers/identities, session list/revoke | `/api/profile/me*`, `/api/auth/account*`, `/api/auth/sessions*`; PostgreSQL + object storage | Auth gate; CSRF for writes; failed logout/revoke does not report local success | `ALIGNED` |
| `/problems` | Search/filter/sort/page, real counts/tags, author entry | `GET /api/problems`, `/api/tags`; Problem repository/PostgreSQL | Public published list; backend controls private visibility | `ALIGNED` |
| `/problems/:idOrSlug` | Statement, authoritative statistics, related real problems, matching real discussions, favorite action | Problem/discussion routes and `POST /api/profile/favorites/:problemId`; PostgreSQL | Public read; favorite requires authenticated non-Guest account and CSRF | `ALIGNED` |
| `/problems/:idOrSlug/submit` | Language list and submission create | `GET /api/submissions/languages`, `POST /api/submissions`; immutable revision/Judge Data binding, submission repository, Judge dispatch | Auth gate; server submit policy; CSRF; no success/navigation after failure | `ALIGNED` |
| `/author/problems/new` | Create private problem draft | `POST /api/problems`; Problem domain/PostgreSQL | Auth gate; backend authoring policy + CSRF | `ALIGNED` |
| `/author/problems/:id/edit` | Statement/config/testcase/archive/version validation, publication, deletion | `/api/problems/:id*`, `/judge-data/*`; versioned Judge Data + object storage/PostgreSQL | Auth gate; author/capability checks; CSRF and concurrency inputs | `ALIGNED` |
| `/submissions` | Global/mine filters, pagination, statistics | `/api/evaluations`, `/api/evaluations/statistics`; submission/evaluation repository | Public global projection; mine scope is session-aware | `ALIGNED` |
| `/submissions/:id` | Submission/source/evaluation history, SSE progress, cancel | `/api/submissions/:id*`, `/judge/cancel`; Product DB plus Judge control plane | Auth gate; owner/operator policy; CSRF on cancel | `ALIGNED` |
| `/discussion` | Published feed, categories/tags/search | `/api/discussion/posts`, `/blog/overview`; PostgreSQL | Public read | `ALIGNED` |
| `/discussion/:id` | Post, comments, post/comment likes, comment create/edit/delete, post delete | `/api/discussion/posts/:id*`, `/api/discussion/comments/:id*`; PostgreSQL | Public read; owner/moderator checks and CSRF on writes | `ALIGNED` |
| `/discussion/new`, `/discussion/:id/edit` | Create/update/publish discussion content | Discussion mutation routes; PostgreSQL | Auth gate; backend ownership/capability + CSRF | `ALIGNED` |
| `/contests`, `/me/contests` | Public lifecycle groups and current user's relationships | `/api/contests/home-summary`, `/api/profile/contests`; PostgreSQL | Public list; “mine” auth-gated | `ALIGNED` |
| `/contests/new` | Draft creation and initial ordered problem set | `POST /api/contests`, `PUT /api/contests/:id/problems`; PostgreSQL transaction/audit | Auth gate + CSRF; validation is server authoritative | `ALIGNED` |
| `/contests/:id` | Detail and registration/withdrawal | `/api/contests/:id`, `/registration`, `/register`; PostgreSQL | Public/registered/manager visibility; auth + CSRF on registration writes | `ALIGNED / SERVER-GATED` |
| `/contests/:id/problems` | Ordered real contest problems and scores when configured | `GET /api/contests/:id/problems`; PostgreSQL contest-problem binding | Contest visibility/registration/manager policy | `ALIGNED` |
| `/contests/:id/submissions` | Current user's real contest-bound submissions | `GET /api/contests/:id/submissions`; PostgreSQL binding + submissions | Auth gate; registration/resource policy | `ALIGNED READ`; dedicated contest submission creation remains a documented follow-up |
| `/contests/:id/standings` | No client-computed ranking | `GET /api/contests/:id/standings` returns `SCORING_ENGINE_NOT_INTEGRATED` | Contest visibility policy | `EXPLICITLY UNAVAILABLE`; UI states that no ranking is fabricated |
| `/contests/:id/settings` | Draft edit, ordered problems/scores, publish, participant list | Contest PATCH/PUT/publish/participants routes; PostgreSQL | Auth gate followed by `canManage`; CSRF on writes | `ALIGNED / SERVER-GATED` |
| `/teams` | Discoverable and current-user teams, pagination | `/api/teams`, `/api/teams/mine`; Team service/PostgreSQL | Public discovery; membership projection is session-aware | `ALIGNED` |
| `/teams/new` | Team create | `POST /api/teams`; Team service/PostgreSQL | Auth gate + CSRF | `ALIGNED` |
| `/teams/:slug` | Detail, members, join/leave, manager join-request decisions | `/api/teams/:slug*`; Team service/PostgreSQL | Team visibility/membership/manager policy + CSRF | `ALIGNED / SERVER-GATED` |
| `/homework` | Current user's persisted assignments | `GET /api/assignments/mine`; Assignment service/PostgreSQL + submission completion projection | Auth-state-aware gate; no hardcoded dashboard data | `ALIGNED` |
| `/homework/:publicId` | Assignment detail, real completion, publish/close when capable | `/api/assignments/:publicId*`; Assignment service/PostgreSQL | Backend capability flags; failed transition keeps prior UI state | `ALIGNED` |
| `/teams/:slug/assignments` | Team assignments | `GET /api/teams/:slug/assignments`; Assignment service/PostgreSQL | Auth + team policy | `ALIGNED / SERVER-GATED` |
| `/teams/:slug/assignments/new` | Draft/published assignment create | `POST /api/teams/:slug/assignments`; Assignment service/PostgreSQL | Auth-state-aware gate; owner/manager policy + CSRF | `ALIGNED` |
| `/notifications` | Real notifications, unread count, one/all read | `/api/notifications*`; Social module/PostgreSQL | Auth gate, ownership + CSRF | `ALIGNED` |
| `/messages` | Friends/requests/conversations/messages/search/read state | `/api/friends*`, `/api/friend-requests*`, `/api/conversations*`, `/api/messages/*`, `/api/users/search`; Social module/PostgreSQL + limiter | Auth gate; friendship/member/ownership checks + CSRF | `ALIGNED` |
| `/wrong-book` | No guessed failed-problem aggregate | No authoritative wrong-book endpoint | N/A | `EXPLICITLY UNAVAILABLE`; depends on an approved verdict aggregation contract |
| `/operations/sandbox` | Safe qualification projection and approved probes/cleanup controls | `/api/operations/sandbox*`; Sandbox control runtime, never user submissions | Auth gate; backend operator policy is authoritative; CSRF on controls | `ALIGNED / SERVER-GATED` |
| `/admin/judge/nodes`, `/admin/judge/nodes/:id` | Summary/nodes/history/policy; mutation controls only with manage capability | `/api/admin/judge/*`; Product adapter to Judge Service, no direct Judge DB access | Capability response separates `canView` and `canManage`; CSRF/idempotency/concurrency/audit on mutations | `ALIGNED` |
| `/403`, `/forbidden`, `/error`, unknown route | Explicit terminal states | No business API | N/A | `ALIGNED` |

## Non-route integrations

| Surface | Contract | Status |
|---|---|---|
| OnlineCodeEditor run | `POST /api/code-runs`, `GET /api/code-runs/:id`; Judge boundary | `ALIGNED`; no user code runs in Web/API; sample output comparison is visibly fixed to `EXACT_BYTES`, while formal submissions use the server-bound Judge configuration |
| Editor autosave | `GET/PUT /api/editor/drafts/:problemId/:language` | `ALIGNED`; authenticated owner draft persistence |
| App bootstrap | `GET /api/auth/me`, `/ready`, Judge admin capabilities | `ALIGNED`; non-401 auth failure is shown as service unavailable, not logged-out success |
| Logout | `POST /api/auth/logout` | `ALIGNED`; local identity is cleared only after server success |
| Profile visual fixture | Dynamic import under `import.meta.env.DEV`, visibly labelled `DEVELOPMENT FIXTURE DATA` | `DEV FIXTURE ONLY` |
| Judge page fixture | `fixture` prop used by tests only; production routes never pass it | `TEST ONLY` |

## Explained backend-only / deferred contracts

These are not silent product features and do not create visible fake success.

| Backend contract | Why it is not a live Web action | Required follow-up |
|---|---|---|
| `POST /api/contests/:id/submissions` | Central composition does not provide atomic `createSubmission`/compensation callbacks; route returns `SUBMISSION_BINDING_NOT_INTEGRATED`. Dispatching before binding would risk an orphaned Judge job. | Design one transactional/outbox boundary across submission intake, contest binding, and Judge dispatch; then add the contest submit UI. |
| `POST /api/contests/:id/cancel` | No cancellation control is presented in current contest settings. | Add an explicit destructive-action UX and lifecycle tests in a contest-management goal. |
| Team invitation, invite-code, member-role/remove, join-by-code routes | Current Team UI covers discovery, create, join/leave, members, and join-request approval only. | Add manager/member workflows without exposing raw identifiers as a substitute for UX. |
| `PATCH /api/assignments/:publicId` | Create, view, publish, and close are live; assignment edit UI is not yet exposed. | Add edit form with state/concurrency validation. |
| Auth password-change and identifier-link routes | Current settings surface manages profile/media/sessions/identities but does not expose every account-security mutation. | Add dedicated verified security UX; do not infer success from capability flags. |
| Problem time/memory/acceptance/personal pass-state filters | The list API does not expose all of these query contracts or an authoritative per-user pass-state filter. The Web shows one explicit unavailable note instead of inert controls. | Add server query parameters, indexed repository predicates, and per-user privacy rules before exposing these filters. |
| Discussion follows, article favorites/history, AI summary, and solution-to-problem association | No composed backend contracts currently provide these projections. Controls are disabled or replaced by explicit unavailable text; author summaries are labelled as author content. | Define each durable contract before enabling its control. |
| Team taxonomy and activity calendar | Team data has no authoritative category/tag or activity-event projection. The UI no longer derives activity from team creation dates or offers inert filters. | Add explicit taxonomy/activity schemas and APIs before restoring filters or event markers. |
| Judge admin templates/host-capacity/add-node/update-policy methods | The live page uses summary, nodes, policy mode, lifecycle capability, and node actions; advanced provisioning controls are not generally exposed. | Keep operator-only until a reviewed provisioning UX and Host Agent capability contract exist. |
| Sandbox diagnostics endpoint | Detailed diagnostics are intentionally excluded from the normal Web projection. | Preserve safe-projection/security review before any UI exposure. |

## Remaining explicit product dependencies

1. Contest standings require the authoritative scoring engine.
2. Wrong-book requires an authoritative verdict-derived aggregate and privacy policy.
3. Contest submission creation requires an atomic binding/dispatch design; read-only contest submission history is live.
4. Manual visual acceptance remains `PENDING USER`; automated DOM/browser checks do not replace it.
