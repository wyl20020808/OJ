# PHASE 1E-R Parallel Ownership

Auth owns public Judge authorization decisions, audit hooks and A01-A14 tests. Queue owns JudgeJob/Redis lease, retry, recovery, fake-worker guard and Q01-Q19/R01-R10/S01-S09 tests. Web owns status UX and W01-W10 browser tests. Lead owns contracts, central API, runtime lifecycle, shared configuration, all workers' integration requests, Playwright W11/W12, final regression, reports and PROJECT_STATUS.

Workers may not edit root manifests/lockfiles, AGENTS.md, PROJECT_STATUS, shared contracts, central composition, migration registry, shared CI, another workstream's scope, or any code that executes submitted source. Shared needs must be recorded as `INTEGRATION REQUEST: requested change; reason; affected file; contract impact; tests required.`

