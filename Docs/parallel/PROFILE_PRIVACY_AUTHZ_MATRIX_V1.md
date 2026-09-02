# Profile Privacy And Authorization Matrix V1

| Data | Self | Other viewer |
| --- | --- | --- |
| Basic username, display name, joined date | allowed | allowed |
| Overview counts | allowed | public-problem-derived counts only |
| Solved problems | allowed | published public problems only |
| My Problems | own records allowed by existing Problem authorization | published public problems only |
| Favorites | password-authenticated self only | not exposed |
| Account and Security action | self only | hidden |
| Create Problem action | backend `canCreateProblems` self projection only | hidden |
| Teams | unavailable: no Team backend foundation | unavailable |

The browser does not infer roles. The Profile API resolves the viewed user and
the authenticated principal, and applies public Problem visibility filters for
non-self views. The canonical Problem route remains the authorization boundary
for creation and editing.
