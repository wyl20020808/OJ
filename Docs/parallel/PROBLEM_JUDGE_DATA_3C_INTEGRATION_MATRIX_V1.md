# Problem Judge Data 3C Integration Matrix V1

Base: `e8b1db6298d5800ca8a45de39b8231a9f4373c4b`.
Merged Backend: `da5d495f70f528602fc6ed70aa7bef56ac08d05b`.
Merged Web: `0e8efe58742502f70eff3547d1d5b073e566a518`.

| Boundary | Integrated behavior |
| --- | --- |
| Web -> Product | Only `/api/problems/:problemId/judge-data` is used. The browser sends bounded JSON base64 payloads to Product; it receives metadata only. Judge Data routes resolve the editor's public slug to the canonical Product `problem_id` before persistence. |
| Product -> PostgreSQL | Judge drafts, immutable versions, testcase metadata, and object associations use migrations `0013` and `0014`. |
| Product -> MinIO | Product-owned S3 credentials write private objects. Startup idempotently ensures the configured bucket exists. |
| Judge Admin | The existing password/operator-only Judge Admin boundary remains separate from problem authoring. |

The former Web `FormData` and fixture-only validation shape were reconciled to the actual 3A Product route shapes. Product normalizes backend draft status to the UI validation state; no Judge Service, Worker, or direct storage call is introduced.
