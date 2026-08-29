# PHASE 2B Sandbox Security Qualification Matrix

Bootstrap status: **PENDING IMPLEMENTATION**. These rows are not PASS claims.

Each row uses the columns `OWNER | SETUP | EXPECTED | ACTUAL | EVIDENCE | RESULT`.

| IDs | OWNER | SETUP | EXPECTED | ACTUAL | EVIDENCE | RESULT |
|---|---|---|---|---|---|---|
| SB01-SB06 | Lead/Runtime | contract, registry and malformed requests | known version/hash/policy accepted; unknown and real mode rejected | implementation pending | future contract tests | PENDING IMPLEMENTATION |
| FS01-FS10 | Runtime | isolated guest filesystem probes | only assigned workspace/input visible; host and traversal denied; cleanup verified | implementation pending | future trusted probes | PENDING IMPLEMENTATION |
| NET01-NET10 | Runtime | network namespace and controlled endpoints | external, LAN, gateway, localhost and internal services denied | implementation pending | future network probes | PENDING IMPLEMENTATION |
| PS01-PS10 | Runtime | user/PID/mount namespaces, seccomp and dropped capabilities | no host signal/ptrace/mount/device/namespace escape; limits enforced | implementation pending | future process probes | PENDING IMPLEMENTATION |
| RL2B-01-RL2B-10 | Runtime | cgroup/watchdog pressure probes | CPU, wall, memory, process, output, file, cancel and concurrent limits bounded | implementation pending | future resource probes | PENDING IMPLEMENTATION |
| ENV01-ENV08 | Security/Runtime | minimal environment and result collection | app, DB, Redis, object-store, host and proxy secrets absent | implementation pending | future env/log audit | PENDING IMPLEMENTATION |
| LC01-LC10 | Runtime | lifecycle success/failure/cancel/repeat/concurrency | all states explicit; no orphan; cleanup failure blocks closure | implementation pending | future lifecycle tests | PENDING IMPLEMENTATION |
| WI01-WI06 | Lead/Runtime | Worker-to-Sandbox seam | no app DB, real mode disabled, hash/policy/cancel/result-only contract | implementation pending | future integration tests | PENDING IMPLEMENTATION |

