# PHASE 1A Integration Plan

Lead integrates the three worker branches only after their reports and focused evidence are reviewed.

1. Verify each branch starts at the Bootstrap commit and review scope/diff.
2. Integrate migrations in reserved order (`0001` Auth, `0002` Problem) through the Lead-owned runner/registry.
3. Compose API module registration and routes centrally; wire Auth context and Problem authorization policy.
4. Connect Web's typed client to the public API and resolve accepted Integration Requests.
5. Run format, lint, typecheck, unit/integration, architecture, build, security regression, and browser E2E as applicable.
6. Update `Docs/PROJECT_STATUS.md` and produce the Phase 1A final report. Do not claim Phase 1A PASS until all required evidence exists.

Non-goals remain Submission execution, Judge Worker, Sandbox, Contest, arbitrary plugin execution, untrusted code execution, and production deployment.
