# AI Bridge Stage 7 compatibility fixtures (read-only snapshots)

Verbatim copies of AI Bridge's own fixture set used as the Host compatibility oracle.

- Source: `AIBridge` `feature/stage7-specialized-capabilities` (`7b7b598`),
  `Docs/fixtures/fixture-set.v1/`.
- `fixtureSetVersion` `1.0`; every file keeps its own `binding` marker.
- These are **data snapshots, not imports**: OJPlatform never imports AI Bridge source and never
  reads the sibling repository at runtime or test time. Copying the JSON keeps the Host
  compatibility tests hermetic and lets a drift check fail loudly when AI Bridge changes a
  contract version.
- Do not edit a snapshot in place. Re-copy from AI Bridge when its fixture set is revised.

`binding` semantics (AI Bridge's own): `FROZEN` fixtures are contract-binding; `ILLUSTRATIVE`
fixtures show a valid shape but are not byte-pinned.
