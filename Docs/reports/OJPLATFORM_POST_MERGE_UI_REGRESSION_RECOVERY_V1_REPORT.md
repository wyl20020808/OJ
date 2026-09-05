# OJPlatform Post-Merge UI Regression Recovery V1

Status: PARTIAL. Recovery implemented on `codex/post-merge-ui-regression-recovery-v1`; Web build and focused test evidence are blocked because this worktree has no installed Vite/test dependencies.

Root cause: merge commit `2b0e534` resolved the Wave integration with an older `apps/web/src/app/App.tsx` shape. Git comparison against `7386a77` shows the merge removed `dedupeBreadcrumbHistory`, replaced the global `EvaluationListItem` list with the older submission list, and dropped its filter controls and seven-column layout. The same merge retained the newer Evaluation Detail UX V4, SSE, and 3-second refresh code. `app.css` also retained the five-column old list styling.

Implemented recovery: restored breadcrumb identity de-duplication; restored evaluation list API filtering for verdict/status/problem/submitter, global rows, resource columns, and baseline list CSS; preserved Admin navigation permission gate and Evaluation Detail UX V4. No root worktree artifacts were touched.

Validation: `git diff --check` PASS. `npm run build` BLOCKED (`vite` unavailable). Vitest focused run produced no usable evidence in the dependency-free worktree. Browser smoke BLOCKED by the same environment. Additional silent regressions audited: Problem List compact, Markdown/LaTeX renderer, authoring preview, direct submission flow, root source access, profile heatmap, SSE, and 3-second refresh remain present in current code.
