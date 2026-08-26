# Goal Archive Convention

Goal packages use the convention:

```text
OJPLATFORM_<STAGE>_<GOAL_NAME>_V<n>
```

Project-internal Goal records may live under `Docs/GOALS/`. Do not copy arbitrary user ZIP binaries into Git merely to archive them; preserve the authoritative text specification when it is intended to become project history.

Each medium or large Goal should identify its report path, acceptance matrix, allowed writes, non-goals, and final status.
