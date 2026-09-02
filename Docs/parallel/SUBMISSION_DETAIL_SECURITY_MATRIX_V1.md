# Submission Detail Security Matrix V1

| Boundary | Permitted Product detail | Prohibited |
| --- | --- | --- |
| Judge Service to Product | terminal verdict, safe aggregate measurements, ordinal, safe runtime reason, bounded compiler diagnostic | testcase input/output, expected output, actual stdout, raw record, lease, node token |
| Product database | generation-bound safe detail projection | Judge credential, storage credential, signed retrieval capability, sandbox/rootfs path |
| Product API to browser | authorized summary, generation history, selected safe detail, owner-visible source under existing policy | object key, manifest, testdata content, Judge job/token, lease, node identity, raw stack |
| Web | textual status, safe measurements and reason, bounded diagnostic | direct Judge Service or storage access, fabricated testcase progress |

Compiler diagnostics are normalized as UTF-8 replacement text, stripped of
absolute host-path fragments and bounded before persistence. The projection
labels truncation so the browser never mistakes it for complete compiler
output. Unexpected or malformed authoritative data is rejected rather than
converted into a user-visible verdict or an empty successful detail.

The existing Submission authorization policy is applied before either current
or historical detail. A non-owner obtains no additional detail through a
generation route.
