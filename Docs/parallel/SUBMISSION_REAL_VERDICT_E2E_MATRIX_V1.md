# Submission Real Verdict E2E Matrix V1

| Case | Product binding and dispatch | Worker/Supervisor/browser runtime |
| --- | --- | --- |
| Guest submission ownership | TESTED by focused API test | NOT VERIFIED |
| Exact v1 binding after v2 exists | TESTED by focused bridge test | NOT VERIFIED |
| AC | NOT VERIFIED | NOT VERIFIED |
| WA | NOT VERIFIED | NOT VERIFIED |
| CE | NOT VERIFIED | NOT VERIFIED |
| RE | NOT VERIFIED | NOT VERIFIED |
| TLE | NOT VERIFIED | NOT VERIFIED |
| MLE | NOT VERIFIED | NOT VERIFIED |
| Cancel without verdict | inherited 2C.6 TESTED | NOT VERIFIED for Product browser flow |
| Rejudge new generation / stale rejection | inherited 2C.6 TESTED | NOT VERIFIED for Product browser flow |

No direct Judge fixture is credited as a Product E2E result. Runtime rows need
Browser -> Product -> Judge Service -> Worker -> Supervisor -> Sandbox ->
Product projection evidence before they may be marked PASS.
