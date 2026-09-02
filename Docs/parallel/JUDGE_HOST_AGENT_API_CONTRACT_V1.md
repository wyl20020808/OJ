# Judge Host Agent API Contract V1

Capabilities are health/readiness, trusted templates, bounded host capacity, owned slots and idempotent start/stop/restart operations. Requests carry correlation and idempotency identifiers and return operation IDs. Unknown templates, stale identities, duplicate operations and unavailable hosts map to safe stable errors. No raw process output or credentials are projected.
