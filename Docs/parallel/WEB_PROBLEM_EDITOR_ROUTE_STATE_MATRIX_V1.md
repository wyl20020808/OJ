# 3B Problem Editor Route/State Matrix V1

| Route/state | Expected behavior | Evidence |
| --- | --- | --- |
| `/author/problems/:id/edit` | authenticated editor with three tabs | focused RTL test |
| unauthenticated | existing login-required state remains authoritative | existing Web tests |
| loading | loading heading; no partial editor controls | component state |
| problem missing/unavailable | controlled state with retry/error message | component state |
| no draft/empty draft | typed empty draft normalization and empty testcase state | focused RTL test |
| statement dirty | before-unload protection; explicit save/error state | component implementation |
| data invalid | validation errors shown; publish disabled | focused RTL test/typed state |
| uploading/partial import | progress text and backend error surfaced; file reset | focused RTL test |
| stale/backend/storage failure | API error remains visible; no fake production fallback | client error path |
| publish pending/success/conflict | confirmation summary, immutable version notice, error surfaced | focused RTL test |
| permission denied | controls disabled by capability; backend 403 remains handled | focused RTL test |

The new ProblemEditor replaces the legacy form only for existing problem edit routes. New problem creation continues to use the existing create flow until a server-issued problem id exists.
