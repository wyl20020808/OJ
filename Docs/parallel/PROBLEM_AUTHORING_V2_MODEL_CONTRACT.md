# Problem Authoring V2 Model Contract

`Problem` and `ProblemRevision` remain the canonical authoring model. V2 adds
`background` and nullable bounded `difficulty` to both snapshots. Existing
`statement`, input/output descriptions, constraints and notes remain in the
same canonical rows.

Difficulty is one of `入门`, `简单`, `中等`, `困难`, or `专家`; the API rejects all
other values. Existing records default to an empty background and null
difficulty, so legacy problems remain readable.

Published-problem edits retain the existing revision flow. Visibility remains
the existing problem lifecycle value and is not derived from Judge Data.
