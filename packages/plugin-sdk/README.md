# Plugin SDK

Public Plugin Foundation V1. `PluginRegistry` validates manifests and API version
before activating plugins. `PluginHost` exposes enabled contributions for the
supported `problem.solve.editor` slot. Plugin loading remains application-owned;
this SDK does not load remote code.

Maturity: pre-runtime foundation. This package must not load plugins or depend on Core internals.
