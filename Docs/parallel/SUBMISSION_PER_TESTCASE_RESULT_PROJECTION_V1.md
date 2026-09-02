# Submission Per-Testcase Result Projection V1

Judge execution and verdict records remain authoritative. For a terminal
authoritative evaluation, Judge Service validates the immutable record binding
and maps only safe values into the Product projection:

| Product field | Judge-authoritative source |
| --- | --- |
| testcase ordinal and verdict | sealed verdict case in manifest order |
| time and peak memory | matching sealed aggregate testcase execution record |
| exit code / reason | qualified runtime facts and sealed verdict reason |
| total time | sum of projected testcase wall times |
| peak memory | maximum projected testcase peak memory |
| CE diagnostic | bounded, normalized compiler stderr from the terminal record |

The projection is stored in `submission_evaluations.detail`, keyed by
`(submission_id, evaluation_generation)`. It is published with the existing
evaluation digest, job identity, attempt and current-generation guard. An
identical publication is idempotent. A conflicting duplicate or a stale
generation fails closed. Generation history is read-only; creating generation
2 never changes generation 1 detail.

CE has an empty testcase list because the authoritative compiler failure
preceded testcase execution. Nonterminal and non-verdict states have no
invented rows. Product never receives or stores hidden testcase input, expected
output, actual stdout, object key, checker payload, or raw record digest as
submission-detail data.
