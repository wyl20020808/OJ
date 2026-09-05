# OJPlatform Problem Statement Preview V2

Status: PARTIAL

Implemented: shared `ProblemStatementRenderer` for Markdown, GFM, LaTeX, KaTeX, and sanitized HTML; formal Problem Detail content surface; authoring split editor and live preview; samples remain editable and are excluded from preview; responsive stacking.

Tested: Web build and targeted ESLint pass. Existing ProblemEditor tests pass 16/17; one legacy assertion expects samples in the old preview and conflicts with the new samples-excluded contract.

Typecheck: BLOCKED by pre-existing missing `pg` declarations in Judge Service/database.
Browser: NOT VERIFIED.
Diff check: PASS.

Markdown/GFM/inline math/block math/XSS protection: IMPLEMENTED through one renderer stack (`react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, `rehype-sanitize`, `skipHtml`).
Same renderer: YES. Samples in preview: NO.
