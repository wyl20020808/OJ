# Delete Problem Contract V1 Proposal

Status: design proposal only. No delete endpoint, migration, soft-delete update, or database mutation was performed by the audit.

## Recommended semantics

Use tombstoning, not physical deletion, for product Problems:

```text
deleted_at timestamptz null
deleted_by uuid/text null
delete_reason text null
```

Deletion is an audited state transition. Problem List excludes deleted rows. Normal Problem Detail returns not found, or an explicit deleted projection only to authorized administrators. New Submission rejects deleted Problems. Existing Submission, Evaluation, JudgeData, ProblemRevision, contest, favorite, and artifact records remain queryable according to their own authorization and retention rules.

## Authorization and confirmation

Allow the creator only when the creator has the explicit delete capability for that Problem; allow `admin`/`high-admin` through an explicit permission such as `problem:delete:any`. Require password-strength authentication where the platform policy requires it, a reason, and a second confirmation carrying the Problem ID/slug and an optimistic version (`updated_at` or revision ID). Emit success/denied audit events with actor, target, reason, request ID, and timestamp.

## References found in current schema

Known foreign keys to `problems`:

| Table | Delete rule | Meaning |
|---|---|---|
| `problem_revisions` | CASCADE | historical authoring snapshots |
| `problem_tags` | CASCADE | tag links |
| `problem_favorites` | CASCADE | user favorites |
| `problem_judge_configs` | CASCADE | judge defaults |
| `problem_judge_drafts` | CASCADE | mutable judge draft |
| `problem_judge_draft_testcases` | CASCADE | draft testcases |
| `editor_code_drafts` | CASCADE | user editor drafts |
| `contest_problems` | RESTRICT | contest membership |
| `judge_data_versions` | RESTRICT | published immutable judge data |
| `problem_judge_data_objects` | RESTRICT | stored judge artifacts |

`submissions.problem_id` and `submissions.problem_revision_id` are application-enforced references without database foreign keys. This makes physical deletion unsafe unless every dependent and external reference is audited. Current read-only checks for the four definite fixtures found zero submissions, judge data, revisions, favorites, drafts, configs, or objects; two fixtures are referenced by `contest_problems` and therefore blocked by RESTRICT.

| Public ID | Known live references | Physical FK-clean at audit time | Product decision |
|---|---|---:|---|
| P0011 | 1 `contest_problems` row | No | Soft delete/tombstone |
| P0012 | none | Yes | Soft delete/tombstone; do not hard delete |
| P0013 | 1 `contest_problems` row | No | Soft delete/tombstone |
| P0014 | none | Yes | Soft delete/tombstone; do not hard delete |

## Hard-delete decision for current inventory

Recommended safe hard-delete count: **0**. Although two unreferenced fixture rows are physically less constrained, hard delete would remove identity and audit history and is not the product contract. Tombstone all four definite generated rows only after an approved, logged cleanup operation. Unknown rows (40) must not be touched.

## Future workflow

1. Mark deleted in one transaction after authorization and confirmation.
2. Keep all historical references and expose an admin audit view.
3. Hide tombstones from public, home, profile, favorites, contest selection, and search projections.
4. Reject new submissions and judge-data mutations against tombstoned Problems.
5. Permit an explicit audited restore only for authorized administrators, if policy allows.
6. Reserve physical purge for a separate retention policy and dependency-proofing job; never use it as normal Delete Problem.
