# Problem Authoring V2 API Matrix

| Endpoint | V2 behavior |
| --- | --- |
| `POST /api/problems` | Validates and persists V2 content using the existing server-derived owner and CSRF path. |
| `PATCH /api/problems/:idOrSlug` | Updates V2 content through the existing owner authorization and revision semantics. |
| `GET /api/problems/:idOrSlug` | Returns background, difficulty, canonical ordered `samples`, and legacy `examples` compatibility projection. |
| Judge Data endpoints | Unchanged and independent from public samples and visibility. |

Title and statement remain required. Background, formats, constraints, notes,
and zero public samples are representable. Text and sample payloads are bounded.
