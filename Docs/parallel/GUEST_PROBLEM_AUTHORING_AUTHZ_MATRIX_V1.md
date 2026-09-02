# Guest Problem Authoring Authorization Matrix V1

| Principal | Own private problem | Another private problem | Judge Admin |
| --- | --- | --- |
| Guest G1 | create, read, edit, judge-data view/manage/publish | denied | denied |
| Guest G2 | own resources only | edit and hidden judge-data denied | denied |
| Registered non-owner | denied unless an existing server-side manager/admin policy grants access | denied | existing password/operator rules only |

Ownership is the persisted `problems.author_id`, assigned only by `ProblemService` from the authenticated Product session principal. Browser input never supplies or controls it. Guest sessions use the existing rotating HttpOnly resume credential. If both the active session and resume credential are lost or revoked, the guest-owned draft remains private but is intentionally unrecoverable until a future account-recovery/upgrade capability exists.
