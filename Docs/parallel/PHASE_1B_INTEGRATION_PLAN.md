# PHASE 1B Integration Plan

1. Review Auth/Authz, Problem Authoring, and Web Authoring reports and verify scope.
2. Integrate migrations in order `0003_authz_foundation`, then `0004_problem_authoring_revision` through the Lead-owned runner.
3. Compose module registration and routes centrally; connect the public authorization policy and audit hook.
4. Connect Web authoring flows through the typed public API client.
5. Run migration, API, authorization, revision, browser, security, architecture, and full regression gates.
6. Update `Docs/PROJECT_STATUS.md` and close with a permanent Phase 1B report only after all evidence exists.

Non-goals: submissions, judge workers, sandbox, contests, arbitrary plugin execution, untrusted code execution, and production deployment.
