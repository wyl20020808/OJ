# OJPlatform Final Code-Only Safe Merge V1

Date: 2026-09-06
Status: PASS for code-only integration and automated gates

## Identity

- Root branch before: `main`
- Root HEAD before: `ec82fa713398faab227c9958fe5d2fad7132369c`
- Candidate: `codex/browser-verified-repair-v2-integration`
- Candidate HEAD: `f4df717cdaa473e1f731fa1434f1596afc7bb2c5`
- Main drift: `NO`; merge-base equals root HEAD
- Integration branch: `codex/final-code-only-safe-merge-v1`
- Integration merge commit: `8288ea54eb09647c4738d3ce1f12157f3bea33ff`

## Feature Presence

All six requested candidate features are present: Admin cross-owner source
authorization, shared Create/Edit authoring, explicit published save with
active revision update, heatmap hover/focus tooltip including zero activity,
normal-flow JudgeData testcase editor layout, and Evaluation testcase card
facts/layout.

## Automated Validation

- Focused feature tests: PASS, `52/52`
- Critical regression subset: PASS, `135/135`
- Web/API typecheck: PASS
- Web/API build: PASS
- Targeted lint on touched paths: PASS; full lint has nine errors also present
  on pristine `main` and is recorded as `PRE-EXISTING BASELINE`
- `git diff --check`: PASS
- Full unit suite: baseline failures reproduced on pristine `main`; no new
  candidate-specific failure remains after authoring compatibility fix
- DB/API runtime: NOT VERIFIED (`ECONNREFUSED 127.0.0.1:55432`)

## Safety

`scripts/dev-runtime.ps1` and all root untracked artifacts were preserved.
No runtime was started or changed. No browser/UI acceptance was performed;
manual UI acceptance remains pending user.
