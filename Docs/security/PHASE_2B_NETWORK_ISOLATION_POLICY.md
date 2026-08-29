# PHASE 2B Network Isolation Policy

Default Guest networking is disabled with no host network, no inherited interfaces and no route. DNS is unavailable unless a future reviewed probe explicitly requires a controlled endpoint. Bind/listen is denied by the network namespace and policy.

Future trusted probes must verify denial of external internet, LAN, gateway, WSL/host localhost, Redis, PostgreSQL, MinIO, API and Web endpoints using controlled local endpoints only. No public or LAN scanning is allowed. `127.0.0.1` is not assumed safe in WSL2; host and namespace topology must be tested explicitly.

Any network exception requires a versioned policy, fixed destination and separate approval. Arbitrary Submission-selected targets are rejected.

