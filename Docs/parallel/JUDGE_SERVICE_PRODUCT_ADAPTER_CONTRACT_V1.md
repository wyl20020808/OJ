# Judge Service Product Adapter Contract V1

The Product API owns Product Submission identity and Product PostgreSQL. In
explicit service mode it creates a Submission, sends its immutable execution
input plus an opaque `externalSubmissionId` to `JudgeServiceClient`, and stores
the returned `judgeJobId` with `beginEvaluation` or `startRejudge`.

On an authorized Product read, the Product API polls the service. A terminal
safe DTO is converted by `productPublication` and passed to the Product-owned
`publishEvaluation` repository operation. The Judge Service never imports that
repository and has no Product database configuration.

The adapter preserves evaluation and attempt generation, terminal/non-verdict
taxonomy, duplicate identity, immutable history, and stale rejection enforced
by the Product repository. Network failures leave the existing Product state
unchanged; no client-supplied verdict can be published.
