# PHASE 1D Real Data Gap Matrix

| Page | Data needed | Current API support | Gap | Owner |
| --- | --- | --- | --- | --- |
| Home | readiness and real navigation targets | `/ready`, public routes | No product metrics requested | Web |
| Profile/Account | public identity and account state | `/api/auth/me` | Profile editing/session listing depends on future approved API | Auth |
| Problemset | public problems, title/slug/status/limits, pagination | `/api/problems` | Search/filter may need API query support | Backend |
| Problem Detail | statement/examples/limits/current revision/testdata ref | `/api/problems/:idOrSlug` | None for current foundation | Backend |
| Authoring | own drafts, revisions, lifecycle states | existing authoring routes | No new schema required in Bootstrap | Backend + Auth |
| Submit | language catalog, exact revision/testdata refs, intake status | `/api/submissions/languages`, `/api/submissions` | None for intake foundation | Backend |
| My Submissions | owner-scoped list and cursor | `/api/submissions` | None | Backend |
| Submission Detail | owner, problem/revision/testdata/language/source/status | `/api/submissions/:id` | None | Backend |
| Error/403/404 | structured code/request ID and safe state | existing API error envelope | None | Web |

No row requests rating, rank, solved count, acceptance rate, AC count, user count, contest data, or Judge verdicts.

