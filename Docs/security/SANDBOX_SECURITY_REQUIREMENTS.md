# Sandbox Security Requirements

Status: REQUIREMENTS and DESIGN DECISIONS only. No backend is selected, implemented, or production-qualified.

| ID | Requirement | Rationale | Priority | Verification method |
| --- | --- | --- | --- | --- |
| SBX-001 | Execute as an unprivileged identity with no host root and no unnecessary capabilities. | Limits impact of code compromise. | MUST | Privilege/capability inspection and attack tests. |
| SBX-002 | Isolate PID, mount, IPC, and UTS/hostname namespaces as applicable. | Prevents process and host namespace visibility. | MUST | Namespace inspection and escape tests. |
| SBX-003 | Use resource limits for CPU, wall time, memory, process/thread count, file descriptors, output bytes, and workspace/disk size. | Contains intentional computational and storage abuse. | MUST | Limit-exhaustion tests and telemetry. |
| SBX-004 | Apply a tested seccomp or equivalent syscall-filtering strategy; dangerous syscall decisions must be documented. | Reduces kernel attack surface. | MUST | Profile tests and adversarial syscall cases. |
| SBX-005 | Provide an isolated temporary workspace, controlled mounts, read-only inputs where possible, cleanup, and path/symlink traversal resistance. | Prevents host/data access and residue. | MUST | Filesystem traversal, symlink, cleanup tests. |
| SBX-006 | Default-deny network access, including Internet, localhost, metadata services, DNS, host/Docker sockets, and internal services. | Prevents exfiltration and lateral movement. | MUST | Network/DNS/localhost probing tests. |
| SBX-007 | Pass only a minimal, controlled environment and PATH; never mount or inherit secrets. | Prevents environment and credential scraping. | MUST | Environment inspection and secret-probe tests. |
| SBX-008 | Compile and link inside the same or an equivalently isolated, resource-bounded boundary. | Compilation is untrusted processing and can be abused. | MUST | Compiler stress and limit tests. |
| SBX-009 | Enforce per-test-case limits and terminate descendants/orphans deterministically. | Prevents bypass through child processes. | MUST | Timeout, orphan, process-bomb, and cleanup tests. |
| SBX-010 | Treat checker, special judge, interactor, and any user-provided checker as future high-risk untrusted workloads. | These programs can alter result integrity. | MUST | Dedicated future qualification before support. |
| SBX-011 | Bound executable output, stdout/stderr, temporary files, and final artifacts; clean all workspaces. | Prevents output/file floods. | MUST | Flood and residue tests. |
| SBX-012 | Record safe execution metadata (version, limits, image/backend identity, job/attempt, outcome) without secrets. | Enables diagnosis and provenance. | SHOULD | Audit/log review. |
| SBX-013 | Any Sandbox-control failure MUST fail closed; `sandbox unavailable => execute directly on host` is forbidden. | Prevents catastrophic downgrade. | MUST | Backend failure and fault-injection tests. |
| SBX-014 | A backend may not be labelled `PRODUCTION QUALIFIED` until dedicated attack tests pass and evidence is reviewed. | Separates design intent from assurance. | MUST | Qualification review and retained evidence. |

## Future Qualification Matrix

Current status for every row: **NOT YET EXECUTED**.

| Case | Expected behavior | Evidence required | Result |
| --- | --- | --- | --- |
| Normal AC program | Completes with correct bounded result. | Execution record and result. | NOT YET EXECUTED |
| Infinite loop | Wall-time limit kills all descendants; no host residue. | Timeout/kill logs and cleanup inspection. | NOT YET EXECUTED |
| Memory exhaustion | Memory limit terminates job without host impact. | Limit event and host health evidence. | NOT YET EXECUTED |
| Fork/process bomb | Process limit stops explosion; descendants cleaned. | Process-limit event and process inventory. | NOT YET EXECUTED |
| stdout/stderr flood | Output cap terminates or truncates per policy; queue remains healthy. | Byte counts and outcome. | NOT YET EXECUTED |
| Disk/file flood | Workspace quota stops growth and cleans files. | Quota event and post-run filesystem check. | NOT YET EXECUTED |
| Network/localhost/DNS attempt | Connections and resolution denied. | Network policy logs and probe result. | NOT YET EXECUTED |
| Filesystem traversal, symlink escape | Access outside workspace denied. | Traversal probes and mount inspection. | NOT YET EXECUTED |
| `/proc`/`/sys` probing | Sensitive host information unavailable. | Probe results and namespace inspection. | NOT YET EXECUTED |
| Environment secret probing | No secrets exposed. | Minimal environment capture and probe output. | NOT YET EXECUTED |
| Many file descriptors | FD limit enforced and cleanup succeeds. | Limit event and FD inventory. | NOT YET EXECUTED |
| Orphan process attempt | Descendants cannot outlive job. | Post-job process scan. | NOT YET EXECUTED |
| Timeout kill / cleanup | Kill is deterministic and workspace is removed. | Repeated-run evidence. | NOT YET EXECUTED |
| Duplicate execution cleanup | Retry/duplicate leaves isolated, bounded state. | Job-attempt and filesystem audit. | NOT YET EXECUTED |
| Compiler stress / runtime crash | Limits and error mapping remain correct. | Compiler/runtime logs without secrets. | NOT YET EXECUTED |
| Sandbox backend failure | Job fails closed; no unsandboxed fallback. | Fault-injection evidence. | NOT YET EXECUTED |
