# OJPlatform Stop Manual Recovery V2

Status: PASS / merged into `main` on 2026-09-05.

Runtime Manager expected blockers now return structured `STOP = BLOCKED` or
`STOP = PARTIAL` outcomes without PowerShell exception output. Blocked stops
continue with application listener diagnostics for Web, API, Judge Service,
Host Agent, and Supervisor, including PID, process, executable, command line,
and ownership classification. Proven OJPlatform listeners receive a specific
PID manual stop command; UNKNOWN and EXTERNAL listeners require confirmation.

Validation: focused contract test, PowerShell 5.1/7 parsing, BAT smoke, and
`git diff --check` passed. A real ACTIVE_JOBS_UNKNOWN smoke showed no stack
trace and preserved unknown/external processes.
