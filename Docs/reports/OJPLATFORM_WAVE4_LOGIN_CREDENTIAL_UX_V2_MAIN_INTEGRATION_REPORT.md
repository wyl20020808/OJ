# OJPlatform Product Experience Wave 4A

## Login Credential UX V2 Main Integration

Status: PASS for candidate integration and focused automated validation. Manual browser Password Manager acceptance remains pending user.

## Preflight

- Main before: `fa53b0083ee2797cd695f6c79482d84e93883ae1`
- Feature source/code: `427ceaf89d7c9b9757ee61e77e41584387303fd5`
- Feature A precheck: PASS. Feature applies cleanly to latest main, has no schema migration, and does not depend on other Wave 4 workers.

## Integration

- Candidate: `D:\OJPlatform-worktrees\wave4-login-credential-integration-v1`
- Branch: `codex/wave4-login-credential-integration-v1`
- Feature application: normal cherry-pick, no conflicts, no whole-file ours/theirs resolution.
- Candidate commit before final report: `e518011eb6af8707741a884b386934b0a3a1fa7c`
- Latest main features preserved: yes.

## Semantics

- Final label: `记住登录信息`.
- New meaning: browser Password Manager credential save/autofill.
- Web password login does not send `rememberMe`, including when checkbox is checked.
- Web API client omits the optional field when absent; explicit legacy callers can still send it.
- Server legacy `rememberMe` contract preserved.
- Logout revokes server session, clears `oj_session`, and leaves `/api/auth/me` anonymous.

## Autofill and UI

- Real form with stable `name`/`id`, `autocomplete="username"`, and `autocomplete="current-password"`.
- Controlled inputs retain browser-populated values; password visibility control preserved.
- Checkbox is unchecked by default, password-mode only, keyboard accessible, and helper copy says browser saves credentials.
- Focus, autofill, error, disabled, responsive, code-login, and existing login polish preserved.

## Security and compatibility

- No password localStorage, sessionStorage, IndexedDB, app cookie, URL, profile, database, or custom vault storage.
- No JWT or refresh credential Web Storage.
- HttpOnly/SameSite cookie, production Secure flag, CSRF, fresh opaque sessions, logout revocation, and password-change revocation preserved.
- No schema change or migration.

## Validation

- Rich login focused suite: PASS, 61/61.
- Legacy auth suite: PASS; auth V2 suite: 17/18, with one pre-existing phone verified registration/password-login fixture failure.
- Pre-integration main reproduces same baseline failure: 17/18.
- API build: PASS.
- Web build: PASS.
- Root typecheck: PASS.
- Changed-file ESLint: PASS.
- Architecture check: PASS.
- `git diff --check`: PASS.
- Runtime smoke: NOT RUN per task scope.
- Password Manager save prompt, logout/autofill, and manual UI: PENDING USER.

## Safety

- `git clean`, `git reset --hard`, force checkout, history rewrite, stash drop, and directory overwrite: not used.
- Existing main dirty untracked artifacts and stashes preserved.

## Next

After main merge, rerun focused rich-login, auth semantics/logout/security, typecheck, builds, architecture, and diff checks from canonical main. Do not merge other Wave 4 workers.
