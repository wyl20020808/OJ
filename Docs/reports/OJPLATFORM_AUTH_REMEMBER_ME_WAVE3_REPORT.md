# OJPlatform Auth Remember Me Wave 3 Report

Status: PASS for the scoped Remember Me feature. Manual UI acceptance remains pending user review.

## Current Auth Architecture

- Session type: opaque random session token in an `oj_session` cookie.
- Storage: server-side `auth_sessions` repository; only token hash, user id, expiry, and revocation metadata are stored.
- Validation: `/api/auth/me` resolves the cookie token against the active, finite server-side session and active account.
- Logout and account/session revocation continue to invalidate server sessions.
- CSRF remains the existing double-submit `oj_csrf` cookie contract; Remember Me does not create a separate auth endpoint or bypass CSRF.

## Remember Me Contract

- Login request accepts optional boolean `rememberMe`; omitted means `false` for backward compatibility.
- Normal login: server session TTL is the configured normal TTL (default 7 days), and `oj_session` is a browser-session cookie with no `Max-Age`/`Expires`.
- Remembered login: server session TTL and cookie `Max-Age` use the configured remembered TTL (default 30 days).
- Both lifetimes are finite and configurable through `OJPLATFORM_AUTH_SESSION_TTL_MS` and `OJPLATFORM_AUTH_REMEMBERED_SESSION_TTL_MS` (explicit module options override environment defaults).
- Session token generation remains fresh on every successful login; no session fixation relaxation.
- Wrong credentials return before session creation and do not emit a persistent session cookie.

## Cookie / Logout / Security

`oj_session` remains `HttpOnly`, `SameSite=Lax`, `Path=/`, and adds `Secure` in production. Domain is unchanged. Logout clears the cookie and revokes the server session for both normal and remembered sessions. No password, JWT, or refresh credential is stored in Web Storage; Remember Me is component state only.

## UI

The password-login form now includes an unchecked, keyboard-accessible, feature-scoped `记住我` checkbox using the existing accent token. It is hidden for code-login mode, preserves the existing submitting/disabled/error states, and sends the selected boolean through the typed API client.

## Migration

No schema migration required. Existing `auth_sessions.expires_at` already expresses the lifetime contract.

## Validation Evidence

- Auth/session focused tests: PASS, 9 tests.
- Web rich-login tests: PASS, 61 tests, including Remember Me UI assertion.
- Combined focused run: PASS, 70 tests.
- API/Web TypeScript build: PASS (`pnpm build`).
- Typecheck: PASS (`pnpm typecheck`).
- Changed-file ESLint: PASS.
- `git diff --check`: PASS.
- Broader `product-identity-auth-jit-v2` run: one pre-existing phone normalization failure (`supports phone verified registration and password login by phone`, expected 200, received 400); unrelated to Remember Me and not changed by this feature.
- Browser/runtime manual UI acceptance: PENDING USER by task contract; no browser automation performed.

## Integration Overlap

Changed files are limited to Auth module routes/config, typed Web API client, Login experience styling/component, focused Auth/Web tests, `.env.example`, and this report. No Discussion, Team/Profile, Homework, Problem Library, or Judge Runtime files were modified.

