# Product Judge Data Retrieval Trust Boundary V1

`ProductJudgeDataSubmissionBridge` is the only V1 Product-to-Judge data bridge.
The Product API reads the exact private input and expected-output objects using
its existing storage adapter, verifies object metadata, byte length, and
SHA-256, constructs the existing 2C.4 testcase manifest, and verifies that its
hash equals the bound published manifest hash.

The resulting immutable manifest is sent over the authenticated Product to
Judge Service request. The Worker receives the job payload required for the
existing Worker/Supervisor protocol, but receives neither Product PostgreSQL
access nor MinIO/S3 credentials. The browser can call Product routes only; no
storage URL, hidden testcase byte, Judge token, or retrieval credential is
projected to it.

Missing objects, storage outages, non-UTF-8 V1 testcase data, byte-size/hash
mismatches, unavailable retrieval, and binding mismatches fail closed before
dispatch. This V1 uses no signed capability: retries reconstruct data through
the authenticated Product API boundary and the exact durable binding.
