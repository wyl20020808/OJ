# PHASE 2B Integration Plan

Lead owns backend decision, shared contract, matrix, runtime harness, Worker seam and final report. Integrate in order: security policy, runtime, then Web. Each branch must descend from the common bootstrap commit and preserve the frozen no-source-execution boundary.

Integration gates are contract review, architecture review, focused tests, complete security matrix, real WSL qualification, then product/regression review. No unsandboxed fallback is accepted.

