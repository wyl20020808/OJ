# Problem Judge Data Storage and Manifest Contract V1

Input/output bytes are uploaded to private MinIO-compatible storage and bound to problem ownership, object key/id, byte size and lowercase SHA-256. ZIP imports accept paired `.in`/`.out` names (including `1` and `01`) and fail closed on missing, duplicate, traversal, absolute, special-file, malformed or oversized entries.

The Product handoff is immutable and follows the existing 2C.4 ordered testcase identity/hash model, including input SHA-256, expected-output SHA-256, checker type, checker version and checker configuration SHA-256. The hash is calculated by the shared Judge runtime helper; Product does not define a second digest format. No `latest` lookup or testcase discovery is permitted after publication; remote transfer remains a later integration concern.
