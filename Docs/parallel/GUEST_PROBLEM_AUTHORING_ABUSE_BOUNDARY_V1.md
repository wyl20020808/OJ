# Guest Problem Authoring Abuse Boundary V1

Guest authoring reuses the Product Guest principal and existing bounded upload controls.

- Guest problem creation: Redis fixed-window limit, keyed by canonical Guest user id, five per hour.
- Guest Judge Data manage/publish: Redis fixed-window limit, keyed by canonical Guest user id and operation, sixty per minute; Redis failure denies the mutation.
- Pair upload: two independently bounded 16 MiB files.
- ZIP import: bounded entry count, compressed/decompressed size, compression ratio, depth, pair normalization, and traversal/special-file rejection.
- Testcase count: the existing testcase-set maximum remains authoritative.
- Storage: the browser has no S3/MinIO credentials, object key, hidden input, or expected-output bytes.

The browser is limited to Product API requests. It does not call Judge Service or MinIO administration.
