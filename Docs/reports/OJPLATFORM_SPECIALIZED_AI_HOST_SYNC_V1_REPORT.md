# OJPlatform Specialized AI Host Sync V1 — Report

## STATUS

PASS.

- `IMPLEMENTED` — Host recognizes and dispatches `code.debug.analyze@1.0`, transports consumer
  prompt provenance, and preserves logical capability identity through the existing caller
  identity → permission → broker → governance → AI Bridge adapter path.
- `TESTED` — new host conformance suite (27 tests) plus extended broker/manifest suites; full
  repository unit baseline and integration suite re-run.
- `RUNTIME VERIFIED` — not separately attempted; the host path is exercised in-process against a
  structural fake bridge plugin per the packed-artifact loader contract. Real provider traffic is
  out of scope for this task.
- `NOT VERIFIED` — real consumer (AlgoQuest) AI end-to-end; a live packed AI Bridge Stage 7
  artifact installed in a running deployment.
- `BLOCKED` — none.

Scope note: this is a **small additive host patch**. AI Bridge and AlgoQuest were not modified.
No new database migration was created.

## GOAL

Close the OJPlatform half of AI Bridge Stage 7: the host grants, discovers, and dispatches the
specialized capability `code.debug.analyze@1.0`, and transports the consumer's mandatory prompt
provenance pair (`promptApplied`, `promptVersion`) safely — without owning debug teaching, prompt
content, or any business prompt.

## CAPABILITY

| Aspect | Result | Evidence |
| --- | --- | --- |
| Discovery | PASS | `GET /api/ai/capabilities` / broker discovery lists `code.debug.analyze@1.0` with `kind: SPECIALIZED`, `readiness: STABLE`, independent `status` |
| Grant | PASS | site caller registration and plugin `consumesCapabilities` both cover `code.debug.analyze` / `@1.x` / `@1.0` |
| Dispatch | PASS | authorized callers reach the adapter with logical `capability: code.debug.analyze`, `capabilityVersion: 1.0` |

The AI Bridge plugin manifest deliberately declares only its two generic primitives, so the host
adapter declares a capability reference for every specialized id the loaded plugin actually
serves. This is a host-side adaptation; AI Bridge was not edited.

## IDENTITY

- Plugin caller: PASS — `plugin.<id>` bound from the parsed manifest; grants are exactly
  `consumesCapabilities`.
- Site caller: PASS — `site.<id>` bound from server-side registration.
- Spoof prevention: PASS — a plugin caller cannot obtain the capability by claiming another
  identity; the adapter receives the host-bound `callerPluginId` and unauthorized callers get
  `PERMISSION_DENIED` / `CALLER_NOT_PERMITTED` with zero provider dispatch.

## PERMISSIONS

- Manifest: PASS — capability references accept bare id, `@major`, `@major.x`, and `@major.minor`.
- Host policy: PASS — one permission model for generic and specialized capabilities; no second
  permission system.
- Unauthorized: PASS — DENY, zero dispatch.

## PROVENANCE

- `promptApplied`: PASS — transported; `true` requires a valid `promptVersion`.
- `promptVersion`: PASS — opaque, shape-validated (`^[A-Za-z0-9._-]{1,64}$`), never interpreted.
- Validation: PASS — invalid combinations rejected at the host boundary as `INVALID_REQUEST` /
  `INVALID_PROMPT_PROVENANCE` with no dispatch; no silent normalization; omitted provenance stays
  omitted (the host never invents `promptApplied: false`).
- Roundtrip: PASS — `{promptApplied: true, promptVersion: "debug-v7"}` arrives unchanged at the
  adapter.
- Retry/fallback/repair/replay: PASS — logical request provenance stays stable across reliability
  paths; it is not request identity.

## TRUST

- Instructions: PASS — trusted, consumer-composed.
- Context: PASS — untrusted `context[]` entries labelled `untrusted: true`; trusted/untrusted are
  not flattened before the broker boundary.
- Host enrichment: NONE — the host never augments a request from judge data, hidden tests, private
  solutions, or user records.

## GOVERNANCE

- Rate: PASS — Redis sliding-window store wired; store behaviour covered by the Redis integration
  suite.
- Quota: PASS — Redis reserve/settle/release store wired.
- Usage: PASS — usage ledger keyed on logical `code.debug.analyze` with caller identity, subject
  attribution, and safe provider/model metadata; provenance stored as a bounded JSON label, not
  content.
- Kill switch: PASS — global, provider, and capability kills honour existing precedence; a
  capability kill performs zero provider calls.
- Idempotency: PASS — opaque bounded keys (including colon-delimited) are preserved via stable
  digest, so distinct keys never collapse; replay/conflict semantics unchanged.

## AIBRIDGE

- Packed integration: PASS — the existing packed-artifact loader path is unchanged; host tests use
  a structural fake plugin and never import `@aibridge/*` source.
- Contract compatibility: PASS — `AIBRIDGE_REQUEST_CONTRACT_VERSION` is `1.2`, cross-checked
  against the vendored Stage 7 compatibility fixture; the frozen `aibridge.fields/v1` dialect is
  unchanged.
- Repo modified: NO.

## ALGOQUEST

- Repo modified: NO.
- Real AI E2E: NOT RUN.

## TESTS

| Gate | Result |
| --- | --- |
| AI tests | PASS — new suite 27 tests; 5 AI suites 80/80 |
| OJ baseline | PASS — 1122 passed / 48 known failures / 0 new (`missing 0, newFailures 0, changedFailureSignatures 0, newPending 0`) |
| New failures | 0 |
| OnlineCodeEditor | PASS — manifest regression test and editor-dependent `.tsx` suites load and pass |
| Typecheck | PASS |
| Lint | PASS |
| Build | PASS |
| Security | PASS — browser bundle secret scan clean; no prompt content in host logs; no source code in usage logs; no diagnostics in metrics; no provider secrets in the browser |

Fixtures are verbatim snapshots of AI Bridge's own Stage 7 fixture set, vendored under
`tests/fixtures/aibridge-stage7/` with provenance noted; there is no cross-repository import and no
absolute path coupling in production code or configuration.

## DEPLOYMENT

- Runtime contract changed: NO (no new env, DB, or runtime dependency).
- Migration: NONE.
- `deploy/`, compose, and installer: untouched.

## GIT

| Item | Value |
| --- | --- |
| Base SHA | `5f9513fdc897ec2c15d3f8a5955b78ac358275a5` |
| Feature head | `65b328bb664f8f879d2853163c6c008fe12be0a2` |
| Merge commit | `4848116230da61ad8606f1ee341199f9999356d4` (`--no-ff`) |
| Main after | `4848116` |
| Push | NO |

Merged tree is identical to the qualified feature tree (`git diff` empty).

## NEXT

- AI Bridge Stage 7 Host Qualification: **PASS**.
- Ready for AlgoQuest Real-AI Sync: **YES** (real consumer E2E remains pending and is a separate
  effort).
