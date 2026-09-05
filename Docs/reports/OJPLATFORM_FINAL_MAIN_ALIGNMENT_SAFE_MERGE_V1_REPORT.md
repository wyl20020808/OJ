# OJPlatform Final Main Alignment & Safe Merge V1

Status: PASS.

## Git alignment

- Root branch before: `codex/online-code-editor-visibility-v1`
- Root HEAD before: `70a5679f4802210788a05fcef51cc005e576bcc6`
- Latest canonical main before merge: `7b812a861e827a16bc0e4ff923747e18145d729a`
- ABCD candidate branch: `codex/conservative-product-ux-final-integration-v1`
- ABCD candidate HEAD: `2adba6e5f8794278ea8a3c1c569be57e8cca9828`
- Candidate base: `7b812a861e827a16bc0e4ff923747e18145d729a`
- Main drift commits/files: none; merge-base equals latest main.
- Root was switched to `main` without overwriting dirty or untracked user content.

## Reconciliation

Fresh worktree `D:\OJPlatform-worktrees\final-main-alignment-v1` and branch
`codex/final-main-alignment-v1` were created from latest `main`. Normal merge
of the candidate completed without conflicts. Reconciliation HEAD is recorded
as `227fffb80b62cc7988a84b1c68a1699a06ccad78`.

Diff audit covered the candidate range. Changes are limited to the ABCD Web
implementation/tests plus their reports and project status documentation;
runtime, API, authorization, plugin-host, and unrelated judge files were not
changed by this merge.

## Feature and baseline checks

ABCD A/B/C/D contracts and mature baseline contracts are present in the merged
tree, including evaluation tabs/copy/metadata/SSE refresh and stale protection,
field-level authoring previews and Markdown tools, compact public problem IDs,
the `problem.solve.editor` host slot with adapters/fallback/diagnostics,
administration and breadcrumb behavior, evaluation filters and navigation,
Problem and Submission authorization/source access, profile heatmap, shared
Markdown/LaTeX rendering, sample input copy, and Problem info aside/layout.

## Validation evidence

- Critical targeted regressions: PASS, `280/280`.
- Additional baseline/product regressions: PASS, `129/129`.
- Web typecheck: PASS.
- Web build: PASS.
- Candidate-touched lint: PASS.
- Full lint: historical baseline only, nine errors reproduced on pristine main.
- `git diff --check`: PASS.
- Runtime status: DOWN/CLEAN; no runtime repair performed.

## Final gate

Latest main changes preserved: YES. ABCD preserved: YES. Baseline features
preserved: YES. No unexplained diff: YES. New regressions: NONE.

Merge allowed: YES. Final normal merge into canonical `main` was performed
only after rechecking that `main` remained at the recorded latest HEAD.
Main merge commit: `fa4abbbbcd5e55f862a3d4f802e4dc2e4650a8b9`.
Final main HEAD at merge: `fa4abbbbcd5e55f862a3d4f802e4dc2e4650a8b9`; this
report closeout is the subsequent documentation commit on `main`.

User artifacts: `scripts/dev-runtime.ps1` dirty modification and all untracked
artifacts were preserved and not touched. Ready for user normal start: YES.
