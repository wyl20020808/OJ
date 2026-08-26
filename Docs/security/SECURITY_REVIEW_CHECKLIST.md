# Security Review Checklist

Use this checklist for future high-risk Goals. Mark each item `PASS`, `FAIL`, `NOT VERIFIED`, or `NOT APPLICABLE` with evidence.

## Authentication

- [ ] Identity source, credential/session lifecycle, recovery, and rate limits reviewed.
- [ ] Authentication errors do not disclose sensitive detail.

## Authorization

- [ ] Server-side authorization covers every operation and object boundary.
- [ ] IDOR/tenant isolation negative tests pass; admin actions use least privilege.

## Sessions / Tokens

- [ ] Issuance, storage, expiry, rotation, revocation, replay, and logging reviewed.
- [ ] Tokens/secrets are absent from URLs, source, logs, and error responses.

## File Upload / Object Storage

- [ ] Size/type/content validation, archive-bomb and path-traversal defenses tested.
- [ ] Object keys, access policies, retention, versioning, and cleanup are reviewed.

## Database / Migrations

- [ ] Migration history is preserved; invariants and transactions are tested.
- [ ] Credentials are least privilege; cross-module table manipulation is absent.

## Plugin Runtime

- [ ] Package provenance, SDK compatibility, capabilities, resource limits, and revocation reviewed.
- [ ] Plugin cannot import Core internals or silently alter Core behavior.

## Judge Protocol

- [ ] Worker identity, job/attempt binding, integrity, replay, duplicate delivery, and failure behavior tested.
- [ ] Worker has no Application PostgreSQL access.

## Judge Worker

- [ ] Queue backpressure, bounded concurrency, cancellation, cleanup, and retry behavior tested.
- [ ] Compilers and user workloads never execute outside the Sandbox boundary.

## Sandbox (strict)

- [ ] Unprivileged identity, capabilities, namespaces, mounts, syscall policy, and host escape resistance qualified.
- [ ] CPU, wall, memory, process, FD, output, disk, network, and descendant limits have attack-test evidence.
- [ ] Internet, localhost, DNS, metadata, host sockets, `/proc`, `/sys`, symlinks, and environment probes tested.
- [ ] Backend failure fails closed; no unsandboxed fallback; cleanup and orphan prevention verified.

## Secrets

- [ ] Secret inventory, injection, rotation, redaction, and repository scan reviewed.

## Logging / Audit

- [ ] Privileged, rejudge, version, installation, and authorization-sensitive actions are attributable without logging secrets.
- [ ] Logs are protected against tampering and have retention/access rules.

## Network Exposure

- [ ] Exposed ports, egress, DNS, service identity, and administrative paths are explicitly reviewed.

## Dependencies

- [ ] Need, license, maintenance, vulnerabilities, provenance, lockfile, and update plan reviewed.

## Deployment

- [ ] Configuration, image/version pinning, least privilege, rollback, observability, and environment parity reviewed.

## Backup / Restore

- [ ] Backup confidentiality, integrity, retention, restore testing, and key recovery reviewed.
