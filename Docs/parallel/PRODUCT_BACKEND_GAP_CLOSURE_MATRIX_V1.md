# Product Backend Gap Closure Matrix V1

| Gap ID | Domain | Qualification Finding | Backend Decision | API/DB Change | Runtime | Capability | Upstream | Evidence |
|---|---|---|---|---|---|---|---|---|
| BE-GAP-01 | Favorites | No authoritative favorite contract | Implemented | `0011_profile_favorites`; profile favorite routes | PASS | available for password accounts | none | Central PostgreSQL restart test |
| BE-GAP-02 | My contests | Existing owner/role/registration data | Implemented projection | `/api/profile/contests` | PASS | available for password accounts | none | Created and registered runtime assertions |
| BE-GAP-03 | My problems | Existing `problems.author_id` | Implemented projection | `/api/profile/problems` | PASS | available for password accounts | none | Authored runtime assertion |
| BE-GAP-04 | Profile capability model | Profile tabs lacked an authoritative source declaration | Implemented | `/api/profile/capabilities` | PASS | explicit per-domain state/reason | none | Anonymous, regular and Guest runtime assertions |
| BE-GAP-05 | Public profile | Public projection needed privacy audit | Implemented safe projection | `/api/profiles/:username` | PASS | supported | none | Email absent from response assertion |
| BE-GAP-06 | Activity | No low-risk authoritative product activity feed | Deferred truthfully | capability only | PASS | unavailable | `NO_AUTHORITATIVE_PRODUCT_ACTIVITY_SOURCE` | Capability response |
| BE-GAP-07 | Heatmap/Wrong-book | Requires authoritative submission outcome | Deferred truthfully | capability only | PASS | unavailable | `UPSTREAM_BLOCKED_BY_AUTHORITATIVE_SUBMISSION_OUTCOME` | Capability response |
| BE-GAP-08 | Teams/Homework | No composed product domain | Deferred truthfully | capability only | PASS | unavailable | `PRODUCT_DOMAIN_NOT_IMPLEMENTED` | Capability response |

No Web, Judge, scoring, submission outcome, wrong-book or `PROJECT_STATUS` change is included.
