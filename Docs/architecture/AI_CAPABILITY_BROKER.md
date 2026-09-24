# AI Capability Broker and Prompt Provenance

Status: current. Applies to the site-wide capability broker (`@ojplatform/capability-broker`),
the OJPlatform AI module (`apps/api/src/modules/ai`), and the AI Bridge capability provider.

This note covers the **host** side only. Teaching semantics, business prompts, and prompt
composition belong to the consumer (e.g. a plugin); OJPlatform never owns them.

## 1. The seam

`CapabilityBroker` is a generic, non-AI-shaped seam. A provider registers capability ids with
versions; a caller executes them under host-bound identity, permissions, subject, and governance.
AI Bridge is the first provider (`ai.bridge`); site core modules and plugins are callers.

Nothing a request body carries can widen identity or permissions:

- **Caller identity** is bound by the broker (`forPlugin` from a parsed manifest, `forSite` from
  server-side registration) and composed as `plugin.<id>` / `site.<id>`. A client carries no
  caller-supplied identity, so spoofing another plugin is impossible by construction.
- **Permissions** are deny-by-default. Grants come only from a plugin manifest's
  `consumesCapabilities` (host-registered) or an explicit server-side site registration.
- **Availability** (`AVAILABLE` / `DEGRADED` / `UNAVAILABLE` / `DISABLED`) is the host kill switch
  applied over the provider's own status; a disabled capability is reported before any call.

## 2. Capability references

A capability reference is `id` (bare), `id@major`, `id@major.x`, or `id@major.minor`. The major
is the compatibility boundary: a `code.debug.analyze@1.0` request is covered by a bare grant, an
`@1` grant, an `@1.x` grant, or an exact `@1.0` grant — but a differently pinned grant denies.

Generic (`ai.text.generate`, `ai.structured.generate`) and specialized (`code.debug.analyze`)
capabilities use **one** permission model; there is no second permission system.

## 3. Generic vs specialized, and logical identity

A provider may declare a **specialized** capability whose logical id must be preserved end to end:
the broker, the AI adapter, the result, the usage ledger, and governance attribution all key on
`code.debug.analyze@1.0`, even though AI Bridge internally runs it over the `ai.structured.generate`
primitive. The host never rewrites the logical capability into the primitive.

Discovery returns descriptors with `kind` (`GENERIC` / `SPECIALIZED`) and `readiness`
(`STABLE` / `EXPERIMENTAL` / `RESERVED`). `readiness` is **maturity** and is independent of
availability `status`: a stable capability whose provider is switched off is still `readiness:
STABLE` with `status: DISABLED`.

The AI adapter declares exactly what the loaded plugin serves. AI Bridge's own manifest
`providesCapabilities` lists only its generic primitives, so the adapter adds a declaration for
every specialized id the plugin actually lists — the host adapter, not AI Bridge, is the entity
registered with the broker.

## 4. Prompt provenance transport

Some capabilities are "consumer-composed": the consumer authors the instructions (and business
prompt) and passes two opaque labels describing that prompt:

| Field | Meaning |
| --- | --- |
| `promptApplied` | `true` when a consumer-authored prompt was applied |
| `promptVersion` | opaque label for that prompt, `^[A-Za-z0-9._-]{1,64}$` |

Invariants, enforced at the host (AI adapter) boundary before any dispatch:

- `promptApplied: true` **requires** a valid `promptVersion`.
- `promptApplied: false` **must not** carry a `promptVersion`.
- Omitted provenance stays omitted — the host never invents `promptApplied: false`.

An invalid combination is rejected as `INVALID_REQUEST` / reason `INVALID_PROMPT_PROVENANCE`
with **no** provider dispatch. There is no silent normalization.

The host never interprets, generates, rewrites, or renumbers `promptVersion`; it validates the
shape, transports it verbatim, and stores it as safe attribution. Prompt **content** never enters
host logs, the usage ledger, or metrics.

## 5. Trust channels

Trusted and untrusted inputs stay separate to the provider boundary. `instructions` is trusted,
consumer-composed text; `context[]` entries are untrusted and labelled (`untrusted: true`). The
host does not flatten the two into one indistinguishable string. Protocol mapping into a single
provider wire message is allowed only at the AI Bridge / provider transport layer.

The host does not inspect, enrich, or supplement capability input: it never augments a
`code.debug.analyze` request from judge data, hidden tests, private solutions, or user records.
Whatever the allow-listed consumer supplies is what is dispatched.

## 6. Governance

Rate limits, quotas, the usage ledger, cost attribution, the kill switch, and operational events
are keyed on the **logical** capability, so specialized usage is distinguishable from generic
`ai.structured.generate` usage. The ledger stores counts/cost plus the provenance labels only.

- **Kill switch** precedence: global → capability → provider (most specific wins; `DISABLED`
  beats). A capability-level kill performs zero provider calls.
- **Idempotency** keys are opaque and bounded; the host hashes the identity string rather than
  sanitizing it, so distinct colon-delimited keys (e.g. `consumer:debug:turn-18`) never collapse.
- **Cancellation** propagates: a host `AbortSignal` becomes a provider cancellation token and an
  outbound abort.
- **Errors** keep the closed vocabulary (`SCHEMA_MISMATCH`, `INVALID_RESPONSE`, `CONTENT_BLOCKED`,
  `RATE_LIMITED`, …) with a stable, sanitized, non-provider-specific mapping — never a generic 500.

## 7. Host boundaries

- No public arbitrary raw-prompt proxy endpoint exists; the only AI route is the operator-gated
  `GET /api/ai/capabilities` discovery/diagnostics route.
- AI is optional: a missing configuration or missing packed artifacts leaves the site fully
  booted with the capability `UNAVAILABLE`, never a failed boot.

## 8. Permission examples

Server-side site registration (identity and grants declared at wiring time):

```ts
broker.registerSiteCaller({
  siteId: 'debug-coach',
  capabilities: ['code.debug.analyze@1.0'], // or 'code.debug.analyze', 'code.debug.analyze@1.x'
});
```

Plugin manifest (grants are exactly this array; the plugin cannot widen them at call time):

```json
{
  "id": "algoquest.learning-quests",
  "apiVersion": 1,
  "providesCapabilities": [],
  "consumesCapabilities": ["code.debug.analyze@1.0"]
}
```

An unregistered caller, or a caller whose grants do not cover the capability, is denied with
`PERMISSION_DENIED` / reason `CALLER_NOT_PERMITTED` and zero provider dispatch.
