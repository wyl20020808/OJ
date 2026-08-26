# OJPlatform Trust Boundaries

This is a design-time model. Communication shown as allowed still requires authenticated, authorized, integrity-protected contracts.

```text
Internet / Browser [UNTRUSTED]
             |
             v
      Web / API Boundary
             |
       API / Core [APP]
       /       |       \
      v        v        v
 PostgreSQL  Redis/Q   Object Storage
             |
             v
   Judge Coordination Boundary
             |
             v
      Judge Worker [BOUNDED]
             |
             v
       Sandbox Host
             |
             v
   Untrusted Process [HOSTILE]

 Plugin Host [SEPARATE CAPABILITY]
             |
       Public Plugin SDK only
```

| Source -> destination | Trust / allowed data | Required controls | Prohibited / failure behavior |
| --- | --- | --- | --- |
| Browser -> API | Browser untrusted; requests, source, credentials | TLS at deployment, authentication, server-side authorization, input validation, rate/resource limits | UI hiding is not authorization; reject invalid/unauthorized requests. |
| Browser -> Admin operation | Untrusted client to privileged action | Strong authentication, authorization, CSRF/session protections as applicable, audit | Never authorize from UI visibility; deny by default. |
| API -> PostgreSQL | Application trusted boundary | Least-privilege credentials, transactions, constraints, migration discipline | No secret leakage; fail without partial consistency. |
| API -> Redis/Queue | Application to transient coordination | Authenticated connection, scoped keys, integrity, TTL/backpressure | Queue failure must not fabricate Judge success. |
| API -> Object Storage | Application to large objects | Scoped credentials, object authorization, size/type limits, immutable/versioned keys | No public exposure by default; reject unsafe upload/import. |
| API -> Judge Coordinator | Application contract | Explicit authenticated job contract, version/attempt identity, audit | Invalid jobs rejected; no direct Worker DB access. |
| Judge Worker -> Coordinator | Bounded service trust | Mutual service authentication, authorization, signed/bound result identity, replay/idempotency checks | Unknown, duplicate, or stale results are rejected or safely ignored. |
| Judge Worker -> Application PostgreSQL | **FORBIDDEN** | None; enforce network/credential separation | Never grant direct access. |
| Judge Worker -> Sandbox | Bounded execution control | Explicit Sandbox API, resource limits, lifecycle ownership | Sandbox failure fails closed; no host execution fallback. |
| Sandbox -> network | Untrusted process | Default deny; explicit reviewed exceptions only | No Internet, localhost, metadata, DNS, host socket, or internal-service access by default. |
| Sandbox -> host filesystem | Untrusted process | Isolated workspace, explicit mounts, read-only inputs, cleanup | No host rootfs, secrets, sockets, or uncontrolled paths. |
| Plugin -> Core | Plugin is not Core-trusted | Public SDK/capabilities only, package identity and permissions | No Core internals, monkey-patching, or direct private storage. |
| Plugin -> Public Plugin SDK | Contract boundary | Versioned API, capability checks, resource limits, audit | Unsupported contract fails explicitly. |
| Object Storage/Queue -> application | Externalized state | Integrity, authorization, validation, version/provenance checks | Malformed or unauthorized objects/jobs do not become trusted state. |

All boundaries require explicit failure behavior and appropriate audit events for privileged, version-changing, rejudge, installation, and authorization-sensitive actions.
