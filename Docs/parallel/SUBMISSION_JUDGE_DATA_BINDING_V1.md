# Submission Judge Data Binding V1

Each Product Submission stores `judgeDataVersionId`, `judgeDataVersionNumber`,
and `judgeDataManifestSha256` alongside the existing immutable problem revision,
testdata version reference, language, source, and owner identity. The Product
API selects a published JudgeDataVersion while creating the Submission, then
stores that exact version's `testdataVersionId`; callers cannot choose these
binding fields.

Before initial dispatch and every local rejudge dispatch, Product resolves the
stored version ID only. It rejects a missing version, changed version number,
manifest hash mismatch, revision mismatch, testdata mismatch, or unsupported
language profile. It never resolves `latest` after the Submission exists.

An ordinary retry remains inside the existing Judge evaluation generation and
uses the already-dispatched immutable Judge job. A rejudge creates a new
evaluation generation and reuses the same Submission binding. Selecting newer
Judge Data is not a V1 action.
