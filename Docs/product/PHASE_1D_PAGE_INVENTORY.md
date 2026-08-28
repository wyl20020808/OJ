# PHASE 1D Page Inventory

| Area | Pages/states | Real data/API dependency | Owner |
| --- | --- | --- | --- |
| Global | App Shell, navigation, Home, 403, 404, generic error, loading/empty | readiness, public capability links, structured errors | Web |
| Auth | Login, Register, Profile, Account, session state | auth register/login/me/logout and supported account/session contracts | Auth + Web |
| Problems | Problemset, Problem Detail | problem list/detail, pagination, revision/testdata metadata | Backend + Web |
| Authoring | Dashboard, create/edit Problem, Revision History | authoring public routes and authorization states | Backend + Web |
| Submissions | Submit, My Submissions, Submission Detail | language catalog, create/list/detail, intake status and safe source text | Backend + Web |

Explicitly excluded: Contest pages, Judge-result pages, rating/rank/solved/acceptance dashboards, user-count metrics, and any fabricated product statistics.

