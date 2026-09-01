# Judge Node Security Boundary V1

The Judge Service is the node registry and scheduling authority. Judge Workers
authenticate to node-control endpoints with `x-judge-node-token`; Product API
uses the separate `x-judge-service-token` boundary. Both V1 values are
environment-only, require a minimum length, are compared in constant time, and
must differ. Neither secret is logged, returned by a node API, committed, or
placed in qualification evidence.

Unauthenticated callers cannot register a node, heartbeat, claim work, complete
an assignment, drain, offline, list, or inspect nodes. Node credentials do not
authorize Product data access; service management credentials do not substitute
for node control credentials. The deployment environment for Judge Service and
Workers must not contain Product database credentials. Product remains the
sole writer of Product `submission_evaluations` through its adapter contract.

Registration validates a bounded node identity, fresh incarnation, fixed V1
capability contract, capacity, and bounded safe metadata. The scheduler uses
those validated capabilities only to select work; it fails closed when no
compatible current healthy node exists. Old incarnation heartbeat, claim, and
completion attempts are rejected, preventing a stale process from recovering
authority after restart.

Management endpoints are internal/service-authenticated only; no Web
administration UI is introduced. Safe observability includes node state,
capacity, heartbeat age, assignment identity, and scheduler reason. It excludes
source code, testdata bodies, lease tokens, node/service tokens, Product
credentials, and raw worker result internals. V1 is not a claim of mTLS,
per-node secret rotation, production HA, network isolation, or automatic cloud
node creation; those require later qualified work.
