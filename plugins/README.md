# plugins/

Repository-local checkout location for the separate `OnlineCodeEditor`
repository.

The plugin stays an independent Git repository with its own history. It is not
committed here, not vendored, and not squashed into OJPlatform history;
`plugins/` is Git-ignored.

```sh
git clone <your OnlineCodeEditor remote> plugins/OnlineCodeEditor
```

Only the `web` Docker image consumes this path, through the
`OJPLATFORM_ONLINE_CODE_EDITOR_CONTEXT` build input. Core-only and Judge-only
Compose operations never require it.

There is currently no authoritative remote for this repository inside the
project, so it cannot be added as a pinned Git submodule yet. See
`Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md`.
