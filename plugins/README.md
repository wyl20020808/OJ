# plugins/

`plugins/OnlineCodeEditor` is a **pinned Git submodule**. The editor stays an
independent repository with its own history, dependencies (`package-lock.json`)
and build/test toolchain; OJPlatform only records which plugin commit it builds
with.

- Remote: `https://github.com/wyl20020808/OnlineEditor.git`
- Path: `plugins/OnlineCodeEditor`
- Pinning: a gitlink commit, **not** a branch. The build never follows the
  plugin's `main`.

## Get the plugin

```sh
# fresh clone
git clone --recurse-submodules <OJPlatform remote>

# existing clone
git submodule update --init --recursive
```

## Update the pinned version

```sh
cd plugins/OnlineCodeEditor
git fetch origin
git checkout <desired commit>
cd ../..
git add plugins/OnlineCodeEditor
git commit -m "chore: bump OnlineCodeEditor to <desired commit>"
```

## Work on the plugin itself

The plugin is a normal repository and can be cloned, built and tested on its
own (`npm run typecheck`, `npm test`, `npm run build`). To develop it against
OJPlatform without touching the pinned commit, point the Web build at your own
checkout:

```sh
OJPLATFORM_ONLINE_CODE_EDITOR_CONTEXT=/path/to/your/checkout
```

Only the `web` Docker image consumes this path, through the
`online-code-editor` named build context. Core-only and Judge-only Compose
operations work without any plugin path.

The wildcard rule in `.gitignore` keeps an accidental stray checkout out of the
repository; `!plugins/OnlineCodeEditor` is what allows the submodule gitlink to
be tracked.
