# Auth Remember Me Wave 3 Main Integration V1

Status: PASS for implementation and automated integration scope; manual UI and managed runtime smoke remain pending.

## Preflight

- Canonical main before: `2749d13deee9797ffa3e7744b8d1f1e08aba1ed5` (`main`, aligned with `refs/heads/main`).
- Feature source: `09c4a853c5d1a01da8ab0b917ae7ff4aab8d8e90` (`codex/auth-remember-me-wave3`), clean.
- Worker E sticky pagination and Worker D Team/Profile correctness are present in the base and preserved.
- Feature A precheck: PASS. Existing opaque server-side `oj_session`, `auth_sessions.expires_at`, `/api/auth/me`, logout/revocation, and CSRF contracts remain authoritative.

## Integration

Fresh candidate `D:\OJPlatform-worktrees\auth-remember-me-integration-v1` on `codex/auth-remember-me-integration-v1` was created from live main and received a normal cherry-pick of `09c4a85`. No conflicts and no whole-file ours/theirs resolution.

Remember Me is supported on `/api/auth/login` and `/api/auth/login/password` as optional boolean `rememberMe`; omitted means `false`, malformed values reject with `VALIDATION_ERROR`. Normal sessions use finite configured 7-day server TTL and browser-session cookies. Remembered sessions use finite configured 30-day server TTL and matching persistent `Max-Age`. Cookie remains `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production. Every successful login creates a fresh opaque token; invalid login creates neither session nor persistent cookie. Logout, `/api/auth/me`, session revocation, password-change revocation, and CSRF behavior remain unchanged.

Password login UI includes an accessible, default-unchecked `记住我` checkbox; code-login mode keeps it hidden. No credential is written to Web Storage. No schema or migration changed.

## Validation

- Auth focused: `22/23` in selected auth files; one failure is the pre-existing phone verified registration/password-login baseline (`expected 200`, received `400`), reproduced unchanged and unrelated to Remember Me.
- Login UI plus Team/Profile and pagination regression: `74/74`.
- API/Web/root typecheck: PASS.
- API/Web build: PASS.
- Changed-file ESLint: PASS.
- Architecture check: PASS.
- `git diff --check`: PASS.
- Runtime HTTP smoke: NOT RUN; managed runtime was not required for automated contract qualification.
- Manual UI: PENDING USER.

## Safety

`git clean`, `git reset --hard`, force overwrite, history rewrite, and stash deletion were not used. Existing user untracked artifacts and stashes were preserved.

Candidate required dirty files: none. Candidate head: `38a14e9`. Normal merge commit on main: `e2f77d8fe4b341b8ba973399f80a0bc8dab8818f`.

## Main-side revalidation

Canonical checkout remains `main` with `HEAD == refs/heads/main` at `e2f77d8`. Main-side focused auth result is unchanged (`22/23`, same pre-existing phone baseline); UI regression is `74/74`; typecheck, API/Web builds, changed-file lint, architecture, and diff checks pass. Runtime Manager status is clean and DOWN, so HTTP auth smoke was not run.
