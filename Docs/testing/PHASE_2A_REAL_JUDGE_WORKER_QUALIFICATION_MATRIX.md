# Phase 2A Real Judge Worker Qualification Matrix

All rows require owner, setup, expected, actual, executed evidence, and PASS/FAIL before Phase 2A closure. Bootstrap freezes these rows; it does not claim execution.

| ID | Owner | Setup / expected | Actual | Evidence | Result |
|---|---|---|---|---|---|
| JW01 | Backend | valid Worker config starts READY | pending | runtime test | PENDING |
| JW02 | Backend | invalid config fails closed | pending | config test | PENDING |
| JW03 | Backend | Redis unavailable is not READY | pending | runtime test | PENDING |
| JW04 | Backend | reconnect restores READY | pending | runtime test | PENDING |
| JW05 | Backend | live instances have unique identity | pending | multi-worker test | PENDING |
| JW06 | Backend | heartbeat emits safe payload | pending | heartbeat test | PENDING |
| JW07 | Backend | heartbeat stops after shutdown | pending | lifecycle test | PENDING |
| JW08 | Backend | drain stops new claims | pending | lifecycle test | PENDING |
| JW09 | Backend | crash leaves lease for recovery | pending | crash test | PENDING |
| JW10 | Backend | restart never reclaims old lease | pending | restart test | PENDING |
| JP01 | Backend | `2A.1` accepted | pending | protocol test | PENDING |
| JP02 | Backend | unsupported version rejected | pending | protocol test | PENDING |
| JP03 | Backend | malformed request rejected | pending | protocol test | PENDING |
| JP04 | Backend | real mode rejected | pending | protocol test | PENDING |
| JP05 | Backend | capability mismatch rejected | pending | protocol test | PENDING |
| JP06 | Backend | result envelope uses `2A.1` | pending | protocol test | PENDING |
| JP07 | Backend | duplicate result safe | pending | integration test | PENDING |
| JP08 | Backend | unknown fixture rejected | pending | fixture test | PENDING |
| JQ01 | Backend | Worker claims queued job | pending | Redis integration | PENDING |
| JQ02 | Backend | two Workers race: one winner | pending | concurrent Redis integration | PENDING |
| JQ03 | Backend | active jobs never exceed configured bound | pending | concurrency test | PENDING |
| JQ04 | Backend | success fixture completes | pending | integration test | PENDING |
| JQ05 | Backend | retryable fixture requeues | pending | integration test | PENDING |
| JQ06 | Backend | terminal fixture terminalizes | pending | integration test | PENDING |
| JQ07 | Backend | stale result rejected | pending | race test | PENDING |
| JQ08 | Backend | restart after claim recovers via lease | pending | runtime test | PENDING |
| JQ09 | Auth/Backend | cancel before claim terminalizes | pending | auth/integration | PENDING |
| JQ10 | Auth/Backend | cancel during fixture cooperates | pending | integration | PENDING |
| JQ11 | Auth/Backend | cancel/completion race has one effect | pending | concurrent test | PENDING |
| JQ12 | Backend | shutdown during active job preserves recovery | pending | lifecycle test | PENDING |
| JH01 | Backend | worker heartbeat visible | pending | runtime test | PENDING |
| JH02 | Backend | job heartbeat/renewal behavior matches contract | pending | lease test | PENDING |
| JH03 | Backend | stale timeout semantics explicit | pending | liveness test | PENDING |
| JH04 | Backend | reconnect recovers heartbeat | pending | runtime test | PENDING |
| JH05 | Backend | heartbeat has no secrets/source/token | pending | log/payload scan | PENDING |
| JS01 | Backend | source marker cannot affect fixture | pending | security test | PENDING |
| JS02 | Backend | no compiler launch | pending | process guard | PENDING |
| JS03 | Backend | no interpreter launch | pending | process guard | PENDING |
| JS04 | Backend | no shell | pending | process guard | PENDING |
| JS05 | Backend | no dynamic user-code import | pending | static/runtime guard | PENDING |
| JS06 | Backend | real execution rejected | pending | protocol test | PENDING |
| JS07 | Backend | source absent from worker logs | pending | log scan | PENDING |
| JS08 | Backend | executable path rejected/absent | pending | validation test | PENDING |
| JS09 | Backend | no direct application DB connection | pending | config/static/runtime test | PENDING |
| JS10 | Backend | fixtures deterministic | pending | fixture test | PENDING |
| JR01 | Lead/Backend | API, Redis, Worker start | pending | runtime harness | PENDING |
| JR02 | Lead/Backend | Worker restart | pending | runtime harness | PENDING |
| JR03 | Lead/Backend | API restart while Worker alive | pending | runtime harness | PENDING |
| JR04 | Lead/Backend | Redis restart while Worker alive | pending | runtime harness | PENDING |
| JR05 | Lead/Backend | two instances live | pending | runtime harness | PENDING |
| JR06 | Lead/Backend | one dies, other continues | pending | runtime harness | PENDING |
| JR07 | Lead/Web | WSL/runtime survives browser journey | pending | browser harness | PENDING |
| JR08 | Lead | cleanup bounded | pending | process/service audit | PENDING |
| JU01 | Web/Auth | owner sees execution stage | pending | API/UI test | PENDING |
| JU02 | Auth/Web | unrelated user denied | pending | API/UI test | PENDING |
| JU03 | Auth/Web | operator diagnostics authorized if exposed | pending | API/UI test | PENDING |
| JU04 | Web | offline/degraded UX is server-backed | pending | UI test | PENDING |
| JU05 | Web | synthetic-only honesty | pending | UI test | PENDING |
| JU06 | Web | no worker secret/lease token | pending | projection test | PENDING |
| JU07 | Web | refresh consistency | pending | UI test | PENDING |
| JU08 | Web | browser console clean | pending | Playwright | PENDING |
| JU09 | Web | responsive baseline | pending | Playwright | PENDING |
| JU10 | Web | keyboard/focus accessible | pending | Playwright | PENDING |
