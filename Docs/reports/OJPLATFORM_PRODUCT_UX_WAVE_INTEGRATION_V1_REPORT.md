# OJPlatform Product UX Wave Integration V1

Status: PASS

## Sources

- Evaluation UX: `cc6a1fc` (actual branch tip includes `3e81c64` Problem List delivery)
- Submission direct evaluation: `d074af4`
- Root source access: `8082886`
- Problem statement preview: `3fac037`
- Profile heatmap: `6238522`

## Implemented

Evaluation compact progress, upper-right information card, full-height source,
verdict-colored square testcase cards, terminal-aware reconciliation, SSE
subscription preservation, direct submission navigation, authorization via
`submission:view:any`, compact Problem List, shared Markdown/GFM + KaTeX
renderer with sanitization, split authoring preview, and UTC 365-day profile
activity aggregation.

## Validation

- Web typecheck: PASS
- Web build: PASS
- `git diff --check`: PASS
- Focused tests: 47 PASS, including 3-second polling, terminal stop, unmount
  cleanup, SSE retention, and stale terminal protection.
- Browser smoke: NOT VERIFIED (scope/time rule)
- Runtime: NOT APPLICABLE; no feature runtime started

## Merge

Integration branch: `codex/product-ux-wave-integration-v1`

Evaluation App/CSS conflict resolved retaining wave UX and SSE path. Stale
tests now match current product contracts.
