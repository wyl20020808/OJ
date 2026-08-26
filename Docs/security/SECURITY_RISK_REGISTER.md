# Security Risk Register

Living register for design and implementation planning. Current controls below are architecture/document constraints, not verified runtime controls. Status is OPEN unless stated otherwise.

| ID | Risk | Area | Likelihood | Impact | Overall | Current controls | Missing controls | Planned phase | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-RISK-001 | Sandbox escape reaches Judge host. | Sandbox | MEDIUM | CRITICAL | CRITICAL | Independent boundary requirement. | Mature backend, syscall/mount isolation, adversarial qualification. | Judge/Sandbox qualification | OPEN |
| SEC-RISK-002 | Judge credentials are compromised or over-privileged. | Judge Protocol | MEDIUM | CRITICAL | CRITICAL | Worker/DB separation rule. | Credential rotation, mutual auth, least privilege, revocation. | Judge Protocol security | OPEN |
| SEC-RISK-003 | Hidden testdata leaks. | Storage/Judge | MEDIUM | HIGH | HIGH | Versioning and isolation requirements. | Object authorization, mount policy, side-channel review. | Storage and Sandbox | OPEN |
| SEC-RISK-004 | IDOR or authorization defect exposes tenant data. | Auth/API | MEDIUM | HIGH | HIGH | Server-side authorization requirement. | Implemented policy, negative tests, review. | Authorization qualification | OPEN |
| SEC-RISK-005 | Malicious plugin compromises Core. | Plugin Runtime | MEDIUM | CRITICAL | CRITICAL | Public SDK and no-internals rule. | Capability isolation, package provenance, runtime limits. | Plugin security | OPEN |
| SEC-RISK-006 | Object storage is publicly or cross-tenant exposed. | Object Storage | MEDIUM | HIGH | HIGH | Scoped-access design requirement. | Signed/scoped access, policy tests, monitoring. | Storage foundation | OPEN |
| SEC-RISK-007 | Queue/result spoof or replay changes verdicts. | Judge Integrity | MEDIUM | HIGH | HIGH | Protocol/idempotency requirement. | Authenticated envelopes, attempt binding, replay defense. | Judge Protocol security | OPEN |
| SEC-RISK-008 | Submission/compile workload causes DoS. | Availability | HIGH | HIGH | HIGH | Resource-limit requirements. | Admission control, quotas, per-stage limits, telemetry. | Judge foundation | OPEN |
| SEC-RISK-009 | Dependency or image supply chain is compromised. | Supply Chain | MEDIUM | HIGH | HIGH | Pinning/license review policy. | SBOM, provenance, scanning, update process. | Toolchain/deployment | OPEN |
| SEC-RISK-010 | Secrets leak through source, environment, logs, or artifacts. | Secrets | MEDIUM | CRITICAL | CRITICAL | No-secret repository rule. | Secret manager, redaction, rotation, runtime tests. | Security operations | OPEN |
| SEC-RISK-011 | Archive/import path traversal or decompression bomb. | File Handling | MEDIUM | HIGH | HIGH | Validation is required at boundaries. | Safe extraction, quotas, type/content inspection. | Import/upload foundation | OPEN |
| SEC-RISK-012 | Missing admin/rejudge audit prevents accountability. | Audit | MEDIUM | HIGH | HIGH | Audit requirement in baseline. | Immutable event storage, coverage review, alerting. | Audit implementation | OPEN |
