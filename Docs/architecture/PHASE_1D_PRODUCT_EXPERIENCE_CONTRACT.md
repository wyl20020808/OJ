# PHASE 1D Product Experience Contract

This contract freezes the real-data Product Experience and UI Foundation boundary. Product pages may present only data available through public API contracts. No fabricated rating, rank, solved count, acceptance rate, AC count, user count, contest data, or Judge verdict is permitted.

## Experience boundary

Web consumes typed public API responses only. API internals, database repositories, Auth internals, and Problem internals are not Web dependencies. Loading, empty, error, forbidden, not-found, and unauthenticated states are first-class states and must not be replaced with invented content.

## Supported product surfaces

The shared surface includes App Shell/navigation, Home, 403/404/error states, Login/Register, Profile/Account and supported session state, Problemset, Problem Detail, Authoring Dashboard/Create/Edit/Revision History, Submit, My Submissions, and Submission Detail. Contest, Judge-result, rating, rank, and metric pages are explicitly out of scope.

## Data semantics

Problem and submission pages show exact server identifiers, status, limits, revision and testdata references, ownership where authorized, and intake-only statuses. Account pages show only the public current-user/account contract. Product data gaps are tracked in the Phase 1D data gap matrix; a gap is not permission to create placeholder statistics.

## Visual and accessibility boundary

The UI uses reusable tokens/components, readable content density, obvious actions, semantic headings/labels, keyboard focus, responsive layout, and safe text rendering. Final visual evidence targets 1440px desktop and 390px mobile viewports.

Changes to this contract require a Lead Integration Request and decision. Workers may not modify it directly.

