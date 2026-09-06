# Team Domain Contract V1

Status: IMPLEMENTED on `codex/team-core-v1`.

Team consumers depend on stable `Team`, `TeamMember`, `TeamInvitation`, `TeamJoinRequest`, and `TeamInviteCode` records. Team identity uses unique lowercase `slug`; membership uses unique `(team_id,user_id)` and roles `OWNER > MANAGER > MEMBER`. Visibility (`PUBLIC`/`PRIVATE`) and join policy (`OPEN`/`REQUEST`/`INVITE_ONLY`) remain independent.

Consumers must use Team API/service contracts, not Team repositories or database tables. Membership mutations are authenticated and authorization is enforced by the API. Future Team Problem Collection and Assignment domains may reference `team_id` and stable public slug while retaining their own ownership and publication rules.

Deferred: ownership transfer, team archive/delete, analytics, billing, tags, discussion, assignments, and content collections.
