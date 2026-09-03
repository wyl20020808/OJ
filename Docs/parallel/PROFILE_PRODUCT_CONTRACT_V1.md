# Profile Product Contract V1

Goal: `OJPLATFORM-PROFILE-NAVIGATION-PRODUCT-V1`.

Profile read projections are additive and owned by the Profile module:

- `GET /api/profiles/:username`
- `GET /api/profiles/:username/overview`
- `GET /api/profiles/:username/solved?limit=&cursor=`
- `GET /api/profiles/:username/problems?limit=&cursor=`

The overview is computed by the API from authoritative persisted Problem,
Submission, Submission Evaluation, and Favorite records. The Web client must
not derive counts by combining unrelated APIs.

`solved` means the profile principal has a current authoritative submission
evaluation with `status=COMPLETED_WITH_VERDICT` and `verdict=AC` for the
problem. Its response intentionally excludes submission source, test data,
and evaluation internals.

Lists use stable descending time plus ID ordering and opaque cursor values.
There is no Team projection because no Team domain foundation exists on this
branch.
