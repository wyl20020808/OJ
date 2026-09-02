# Unified Host Agent Submission Smoke Matrix V1

| Check | Required path | Current result |
| --- | --- | --- |
| Supervisor readiness | Current-source Supervisor | PASS: `127.0.0.1:19204`, non-root `oj-sandbox` |
| Judge Service readiness | Current-source standalone Judge Service | PASS: `127.0.0.1:3210` |
| Host Agent readiness | Current-source Host Agent | PASS: `127.0.0.1:3218` |
| Trusted template Add/Start | Judge Service -> Host Agent -> Worker | PASS: C++20 trusted template started node `cpp20-gcc-13-v1-1788359772578-1` |
| Worker ONLINE/heartbeat | Host-Agent-owned Worker -> Judge Service | PASS: desired/observed `ONLINE`, healthy heartbeat, incarnation `ac0fbea6-5e25-442f-98c9-91899d5413e4` |
| Real C++20 capability | Worker -> Supervisor -> Sandbox | PASS: `cpp20-gcc-13-v1`, `REAL_SANDBOXED_EXECUTION` |
| Product AC | Browser/Product -> Judge Service -> Host Agent Worker -> Supervisor -> Sandbox -> Product | PASS: `24affb4f-92af-424b-9dc2-161610938c07` -> `AC` |
| Product WA | Browser/Product -> Judge Service -> Host Agent Worker -> Supervisor -> Sandbox -> Product | PASS: `598a0092-858d-4af8-ad3c-890bae9ed11e` -> `WA` |
| Submission Detail testcase rows | Product selected-generation detail | PASS: Browser details showed `#1 AC 253 ms` and `#1 WA 47 ms / 4.5 MB` |

All entries use the current unified source tree and a Host-Agent-owned Worker;
no direct Worker, mock node, fixture, or historical runtime binary is used as
final evidence.
