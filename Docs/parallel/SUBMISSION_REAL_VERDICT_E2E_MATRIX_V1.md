# Submission Real Verdict E2E Matrix V1

| Case | Product binding and dispatch | Worker/Supervisor/browser runtime |
| --- | --- | --- |
| Guest submission ownership | RUNTIME VERIFIED: Guest `F303E02B` created each browser verdict submission | RUNTIME VERIFIED through Product projection |
| Exact v1 binding after v2 exists | TESTED by focused bridge test | NOT VERIFIED as a separate browser mutation matrix |
| AC | RUNTIME VERIFIED: `94e7839a-57b9-450f-92c0-f92c4964dd2b` | RUNTIME VERIFIED: Browser -> Product -> Judge Service -> Worker -> Supervisor -> Sandbox -> Product browser `AC` |
| WA | RUNTIME VERIFIED: `0428e332-111b-43e7-a7c2-a9c535e97b15` | RUNTIME VERIFIED through the same complete path as `WA` |
| CE | RUNTIME VERIFIED: `59efd7d9-ac37-400b-aaa7-330ca84ae51a` | RUNTIME VERIFIED through the same complete path as `CE` |
| RE | RUNTIME VERIFIED: `49d931aa-606d-41ff-aa7e-20a8311a8117` | RUNTIME VERIFIED: Worker received nonzero exit code `7` for all three testcases and Product projected `RE` |
| TLE | RUNTIME VERIFIED: `f97b4bd2-939f-4d46-9d36-5eb80b51838b` | RUNTIME VERIFIED: all three testcases reached their 2000/2001 ms wall limit without a memory-limit event; Product projected `TLE` |
| MLE | RUNTIME VERIFIED: `5251f12c-f16c-4cdb-81ff-e4ffc1aaab7e` | RUNTIME VERIFIED: all three testcases reached the 64 MiB memory peak with memory-limit events; Product projected `MLE` |
| Cancel without verdict | TESTED by 2C.6 real PostgreSQL integration; Product exposes no submission-cancel route or UI | NOT APPLICABLE for a Product browser mutation; no cancellation verdict was fabricated |
| Rejudge new generation / stale rejection | RUNTIME VERIFIED: Guest Product API submission `d2cf2bae-c513-459d-aa1c-f74b35dfa6e8` reached `AC` in generation 1 and `AC` in generation 2; 2C.6 PostgreSQL integration also rejects stale publication and serializes duplicate rejudge commands | RUNTIME VERIFIED for Product API -> Judge Service -> Worker -> Supervisor -> Sandbox; no Product browser rejudge control exists |

No direct Judge fixture is credited as a Product E2E result. The verdict rows
above use Browser -> Product -> Judge Service -> Worker -> Supervisor ->
Sandbox -> Product projection evidence. The existing Product surface has no
submission cancellation or rejudge browser control, so lifecycle browser
mutation is not claimed.
