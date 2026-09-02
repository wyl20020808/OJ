# Web Submission Detail UI State Matrix V1

| State | UI behavior |
| --- | --- |
| queued / judging | overall state and truthful waiting-for-detail message; Product-only polling continues |
| terminal with detail | verdict/status, language, generation, timestamps, aggregates, ordered testcase results |
| CE | terminal verdict, bounded compiler diagnostic and no testcase execution rows |
| historical generation | read-only selected generation detail; current marker remains on the current summary |
| detail request failure after terminal summary | preserve overall terminal result and show a detail retrieval error |
| not found / forbidden / network failure | existing explicit error presentation; do not render an empty result list as success |

Desktop uses a compact table. Tablet retains readable wrapped values. Mobile
uses stacked testcase cards, wraps safe reason and compiler text, and has no
horizontal page overflow. Generation controls are keyboard focusable. The UI
uses Product API data only and never renders storage or Judge-internal fields.
