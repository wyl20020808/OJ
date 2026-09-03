# Web Problem Authoring V2 State Matrix

| Surface | Content state | Save behavior |
| --- | --- | --- |
| `/author/problems/new` | Wide authoring workspace: basics, background, statement, formats, public samples, constraints, notes. | Creates through `POST /api/problems`, then opens the canonical edit route. |
| `/author/problems/:id/edit` statement tab | Loads and edits the same V2 fields, with edit/preview and unsaved-change protection. | Saves through `PATCH /api/problems/:id`. |
| Public samples | Zero or more numbered input/output editors; add and delete reindexes in UI. | Server canonicalizes ordinal, preserving order on reload. |
| Judge Data / settings tabs | Existing separate domain. | No public sample or visibility coupling. |
