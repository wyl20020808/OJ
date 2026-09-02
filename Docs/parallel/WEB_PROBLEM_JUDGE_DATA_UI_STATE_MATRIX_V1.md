# 3B Judge Data UI State Matrix V1

| Area | Implemented behavior |
| --- | --- |
| Draft/published | DRAFT badge, latest immutable versions, testcase count, override count |
| Testcase metadata | ordinal, optional label, input/output filename and sizes; no hidden body content |
| Limits | time, memory, and output each have an explicit Override checkbox; unchecked values say Default; effective values follow defaults |
| Default changes | settings save recalculates inherited effective values while preserving explicit overrides |
| Upload | file input accepts `.in`, `.out`, `.zip` and multiple files for pair upload; progress and backend partial/error text are visible |
| Validation | valid/invalid state, errors, and warnings are rendered; publishing requires VALID |
| Publish | destructive/irreversible confirmation lists testcase count, checker, defaults, and override count; old versions remain immutable |
| Access | `problem.edit`, `problem.judge_data.manage`, and `problem.judge_data.publish` are reflected by disabled controls; server remains authority |
| Responsive | testcase rows become stacked cards at tablet/mobile widths; tabs scroll without page overflow |
| Accessibility | labels, semantic navigation, dialog role, visible focus styles inherited from design system, keyboard-operable buttons/inputs |

Known integration boundary: backend parsing, archive safety enforcement, storage availability, and real publish conflict semantics are Product Backend responsibilities and are not runtime-qualified in this Goal.
