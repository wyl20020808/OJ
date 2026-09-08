# Profile Experience & Personalization Wave 2 Main Integration V1

Status: PARTIAL

Main before: `925c091fecc6a49fe72b5e5c45b11191262acfd7`  
Main after: `b34c2debc19bab645e1e437e0e90450349c732f2`  
Feature source: `b3d12087be5b280f85f5787e9c4b1c05638b6658`  
Candidate: `codex/profile-experience-integration-v1`

Integrated Profile personalization, Team Core profile visibility, public/self profile APIs, grouped editor, responsive styles, and global Toast save success/error handling. Existing Runtime Recovery, Authoring UX, Correctness, Discussion Hub, activity, heatmap, submissions, stats, and routes preserved. No whole-file ours/theirs resolution.

Migration `0026_profile_experience` renumbered to `0027_profile_experience`; chain tail is `0025_discussion_core`, `0026_submission_source_permission`, `0027_profile_experience`. SQL applied twice against local PostgreSQL; `user_profiles` schema and constraints verified. Full historical runner is NOT VERIFIED/BLOCKED because it replays non-idempotent prior migration and fails at existing `judge_artifacts`.

Validation: focused profile and baseline web tests 32/32 PASS; API/Web typecheck and build PASS; architecture gate PASS; diff check PASS. Manual UI acceptance PENDING USER. Existing dirty tracked/untracked files preserved; no `git clean`, reset, or stash drop used.

Known baseline: sparse profile fixture compatibility required optional `capabilities.activity` and default editor fields; product semantics unchanged.
