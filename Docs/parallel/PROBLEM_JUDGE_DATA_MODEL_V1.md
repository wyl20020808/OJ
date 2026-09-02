# Problem Judge Data Model V1

Problem identity remains the existing `problems.id`. Judge data uses mutable draft/config rows and immutable `judge_data_versions` plus frozen testcase rows. Draft revisions are compare-and-swap guarded; publishing requires validated, complete object references and creates the next version. Effective limits are `override ?? default` in milliseconds/bytes and are copied into the published testcase.

Object bytes live in private object storage. PostgreSQL stores object id/key, ownership, size and SHA-256 metadata. Published versions retain references and use `ON DELETE RESTRICT` semantics. A physical object reference may be retained by more than one immutable version; the association key is `(version_id, object_id)`, so creating v2 cannot overwrite or invalidate v1.

Draft testcase rows are removed in the same publish transaction only after their immutable version rows have been inserted. A new draft therefore starts cleanly, while version rows remain the only source for published data.
