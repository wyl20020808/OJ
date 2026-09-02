# Phase 3C Problem Judge Data Lead Integration + Guest Authoring V1 Report

## Integration

Started from 2C.8BC `e8b1db6298d5800ca8a45de39b8231a9f4373c4b`. The full 3A head `da5d495f70f528602fc6ed70aa7bef56ac08d05b` was merged first as `f9b3549`; migration conflict resolution retained `0012_product_judge_admin_audit` before 3A `0013` and `0014`. The full 3B head `0e8efe58742502f70eff3547d1d5b073e566a518` was then merged with history preserved. 3A and 3B were divergent from 2C.8BC (merge bases `4e3f682...` and `75e7d2d...`); their intended slices did not overlap.

## Implemented

- Reconciled Web JSON uploads, CSRF header propagation, and backend draft-status normalization with actual Product routes.
- Fixed asynchronous Product principal resolution in all Judge Data routes.
- Added server-side Guest create/edit-own/Judge Data view/manage/publish-own authorization using persisted problem ownership.
- Kept Guest out of Judge Admin, storage credentials, and hidden testcase bytes.
- Added Guest creation/mutation rate limits keyed by canonical Guest user id; retained existing pair/ZIP/testcase limits.
- Restricted authenticated problem listings to public records plus records owned by the current principal.
- Added Product startup bucket provisioning for the configured MinIO bucket.

## Tested

Focused Vitest evidence covers G1 creation, server ownership binding, config, pair upload, per-case overrides, validate, publish, G2 denial, registered non-owner denial, Judge Admin denial, metadata-only projection, CSRF, ZIP safety, default inheritance, version immutability, and v2 versioning. The complete unit, Web, integration, lint, format, typecheck, architecture, build, and migration gates passed during this Goal.

## Runtime Status

`pnpm db:migrate` passed, then the current-branch Product API returned `/ready` with PostgreSQL, Redis, and MinIO storage all `ok`. A real Guest G1 browser session created a private Draft, edited the statement, saved Judge Settings, uploaded a `.in`/`.out` pair and a valid ZIP batch, applied independent time/memory/output overrides, validated, published v1, reloaded, changed the new Draft, and published v2. The reloaded version history retained v1 with two testcases while v2 had one testcase, evidencing that v1 was not overwritten.

A separate Guest G2 session received `403 FORBIDDEN` from Product Backend for both owner-problem edit and hidden Judge Data metadata. The same session received `403 FORBIDDEN` at the Judge Admin node route. Desktop `1440x900`, tablet `1024x768`, and mobile `390x844` editor checks had no horizontal overflow or console errors. Browser traffic stayed on Product API routes; no MinIO credential, hidden testcase bytes, direct Judge Service call, or MinIO Admin access was exposed.

This is runtime qualification of the stated local Product flow, not a production, sandbox, submission, Product-to-Judge transfer, or Worker-execution qualification. Goal status: `PASS`.

## Scope

No submission flow, Product-to-Judge transfer, Worker execution, Host Agent, 2C.8E, SPJ, interactive, subtasks, or contest scoring was implemented.
