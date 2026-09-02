# Unified Host Agent Submission Smoke Matrix V1

| Check | Required path | Current result |
| --- | --- | --- |
| Supervisor readiness | Current-source Supervisor | NOT VERIFIED in this integration session |
| Judge Service readiness | Current-source standalone Judge Service | NOT VERIFIED in this integration session |
| Host Agent readiness | Current-source Host Agent | NOT VERIFIED in this integration session |
| Trusted template Add/Start | Judge Service -> Host Agent -> Worker | TESTED by focused integration tests; RUNTIME NOT VERIFIED |
| Worker ONLINE/heartbeat | Host-Agent-owned Worker -> Judge Service | TESTED by focused integration tests; RUNTIME NOT VERIFIED |
| Real C++20 capability | Worker -> Supervisor -> Sandbox | NOT VERIFIED in this integration session |
| Product AC | Browser/Product -> Judge Service -> Host Agent Worker -> Supervisor -> Sandbox -> Product | NOT VERIFIED |
| Product WA | Browser/Product -> Judge Service -> Host Agent Worker -> Supervisor -> Sandbox -> Product | NOT VERIFIED |
| Submission Detail testcase rows | Product selected-generation detail | TESTED; fresh integrated browser/runtime evidence NOT VERIFIED |

This matrix intentionally does not reuse the historical 2C.8D or 3D runtime binaries as evidence for the unified source tree.
