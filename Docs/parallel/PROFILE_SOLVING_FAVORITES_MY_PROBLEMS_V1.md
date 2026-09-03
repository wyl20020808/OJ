# Profile Solving Favorites My Problems V1

Favorites use the existing `problem_favorites` table and Profile API mutations.
They are principal-scoped and idempotent through the primary key plus
`INSERT ... ON CONFLICT DO NOTHING`; removal is idempotent. Profile favorite
counts use the same persisted source and only count published public problems.

My Problems uses the canonical Problem identity and `/author/problems/new`.
It does not introduce another authoring flow. A self profile can receive
private or draft rows where the current Profile projection identifies self;
other viewers are constrained to published public rows.

The solved list is an activity projection, not the global evaluation list and
not a submission-history view.
