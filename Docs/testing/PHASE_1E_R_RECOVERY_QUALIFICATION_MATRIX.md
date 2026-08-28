# PHASE 1E-R Recovery Qualification Matrix

Bootstrap baseline: prior results are evidence only where stated. Every `PENDING` row requires executed recovery-wave evidence before Phase 1E PASS.

## Authorization

| ID | Owner | Setup | Expected | Actual | Evidence | Status | Severity |
|---|---|---|---|---|---|---|---|
| A01 | Auth | unauthenticated GET | denied 401/403 | pending | composed API test | PENDING | high |
| A02 | Auth | owner view | own job visible | prior policy pass | judge-authz test | PENDING | high |
| A03 | Auth | unrelated view | denied | prior policy pass | judge-authz test | PENDING | high |
| A04 | Auth | operator inspect | allowed | prior policy pass | judge-authz test | PENDING | high |
| A05 | Auth | ordinary inspect | denied | prior policy pass | judge-authz test | PENDING | high |
| A06 | Auth | operator retry | allowed nonterminal | pending | composed API test | PENDING | high |
| A07 | Auth | ordinary retry | denied | prior policy pass | judge-authz test | PENDING | high |
| A08 | Auth | terminal retry | denied | prior policy pass | judge-authz test | PENDING | high |
| A09 | Auth | cancel states | contract-consistent | pending | API/policy test | PENDING | medium |
| A10 | Auth | inactive/deactivated | denied | prior policy pass | judge-authz test | PENDING | high |
| A11 | Auth | forged ownership ids | denied | pending | composed API test | PENDING | high |
| A12 | Auth | audit source field | absent | prior policy pass | audit assertion | PENDING | high |
| A13 | Auth | audit secret fields | absent | prior policy pass | audit assertion | PENDING | high |
| A14 | Auth | unknown operation | deny default | pending | policy/API test | PENDING | high |

## Queue

| ID | Owner | Setup | Expected | Actual | Evidence | Status | Severity |
|---|---|---|---|---|---|---|---|
| Q01 | Queue | one submission enqueue | one QUEUED job | prior pass | Redis test | PENDING | high |
| Q02 | Queue | sequential duplicate | same job | prior pass | Redis test | PENDING | high |
| Q03 | Queue | 20 duplicates | one job | prior pass | real Redis probe | PENDING | high |
| Q04 | Queue | 20 distinct submissions | 20 linked jobs | pending | real Redis test | PENDING | high |
| Q05 | Queue | one claim | valid lease | prior pass | Redis test | PENDING | high |
| Q06 | Queue | double claim race | one winner | prior pass | real Redis probe | PENDING | high |
| Q07 | Queue | expiry | lease invalid | pending | clocked test | PENDING | high |
| Q08 | Queue | recover stale | requeue/terminal | pending | recovery test | PENDING | high |
| Q09 | Queue | matching completion | terminal synthetic | prior pass | Redis test | PENDING | high |
| Q10 | Queue | duplicate complete | no double effect | prior pass | Redis test | PENDING | high |
| Q11 | Queue | wrong token | reject | prior pass | real Redis probe | PENDING | high |
| Q12 | Queue | old token recovery | reject | pending | recovery test | PENDING | high |
| Q13 | Queue | retryable failure | requeue | pending | queue test | PENDING | high |
| Q14 | Queue | retry claim | attempt increments once | pending | queue test | PENDING | high |
| Q15 | Queue | retry cap | terminal/defer documented | pending | queue test | PENDING | high |
| Q16 | Queue | terminal failure | no requeue | pending | queue test | PENDING | high |
| Q17 | Queue | late stale complete | cannot overwrite | pending | race test | PENDING | critical |
| Q18 | Queue | complete/expiry race | convergent state | pending | race test | PENDING | critical |
| Q19 | Queue | stale/new attempt race | new attempt preserved | pending | race test | PENDING | critical |

## Runtime

| ID | Owner | Setup | Expected | Actual | Evidence | Status | Severity |
|---|---|---|---|---|---|---|---|
| R01 | Queue/Lead | Redis down before enqueue | controlled failure | pending | fault test | PENDING | high |
| R02 | Queue/Lead | disconnect during operation | no corruption | pending | fault test | PENDING | high |
| R03 | Queue/Lead | reconnect | recovery/idempotency | pending | fault test | PENDING | high |
| R04 | Queue/Lead | Redis restart | queued job retained | prior local RDB pass | restart probe | PENDING | high |
| R05 | Lead | API restart after enqueue | one job remains | pending | runtime test | PENDING | high |
| R06 | Lead | API restart during lease | contract recovery | pending | runtime test | PENDING | high |
| R07 | Queue | crash after lease | stale recovery | pending | fault test | PENDING | high |
| R08 | Queue | crash before ack | duplicate-safe replay | pending | fault test | PENDING | high |
| R09 | Lead | full browser runtime | containers survive | prior failure | Docker events/logs | PENDING | critical |
| R10 | Queue | malformed payload | safe rejection | pending | queue test | PENDING | high |

## Security

| ID | Owner | Setup | Expected | Actual | Evidence | Status | Severity |
|---|---|---|---|---|---|---|---|
| S01 | Queue | compiler-like source | never compile | pending | spawn guard | PENDING | critical |
| S02 | Queue | interpreter-like source | never execute | pending | spawn guard | PENDING | critical |
| S03 | Queue | eval-like source | never eval | pending | instrumentation | PENDING | critical |
| S04 | Queue | shell-like source | never shell | pending | instrumentation | PENDING | critical |
| S05 | Queue | import-like source | never dynamic import | pending | instrumentation | PENDING | critical |
| S06 | Queue | all hostile strings | no compiler/interpreter child | pending | process guard | PENDING | critical |
| S07 | Queue | filesystem payload | no side effect | pending | temp-dir guard | PENDING | critical |
| S08 | Queue | network payload | no network side effect | pending | network guard | PENDING | critical |
| S09 | Queue/Lead | logs with source | no source body | pending | captured logs | PENDING | high |
| S10 | Web | synthetic completion | no real verdict wording | prior UI pass | Web test | PENDING | critical |

## Web

| ID | Owner | Setup | Expected | Actual | Evidence | Status | Severity |
|---|---|---|---|---|---|---|---|
| W01 | Web | queued job | Queued server status | pending | browser test | PENDING | high |
| W02 | Web | leased/running fake | qualification-only state | pending | browser test | PENDING | high |
| W03 | Web | retryable failure | retry metadata | pending | browser test | PENDING | high |
| W04 | Web | terminal failure | protocol failure state | pending | browser test | PENDING | high |
| W05 | Web | synthetic complete | explicit synthetic label | prior UI pass | Web test | PENDING | critical |
| W06 | Web | refresh each state | unchanged server state | pending | browser test | PENDING | high |
| W07 | Web | history/detail | same projection | pending | browser test | PENDING | high |
| W08 | Web/Auth | unrelated user | forbidden | pending | browser/API test | PENDING | high |
| W09 | Web | unknown state | safe fallback | prior UI pass | Web test | PENDING | medium |
| W10 | Web | status text scan | no AC/WA/TLE/MLE | prior UI pass | Web test | PENDING | critical |
| W11 | Lead | real journey run 1 | complete PASS | prior fail | Playwright output | PENDING | critical |
| W12 | Lead | real journey run 2 | complete PASS | incomplete | Playwright output | PENDING | critical |

