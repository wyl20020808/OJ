# Problem Judge Data API Error Matrix V1

Stable errors are `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `DUPLICATE`/`STALE_*` (409), `INVALID_PAIR`, `INVALID_LIMIT`, `VALIDATION_FAILED`, `UNSAFE_ARCHIVE`, `UPLOAD_TOO_LARGE`, `INTEGRITY_MISMATCH`, `STORAGE_UNAVAILABLE` and `DB_UNAVAILABLE`. Responses contain only code, safe message and request id; stack traces, credentials, local paths and hidden content are excluded.
