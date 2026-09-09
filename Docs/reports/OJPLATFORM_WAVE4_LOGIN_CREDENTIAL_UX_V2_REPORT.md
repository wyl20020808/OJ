# OJPlatform Product Experience Wave 4A

## Login Credential UX V2

Status: PASS for implementation and focused automated validation. Manual browser Password Manager acceptance remains pending user.

## Semantics

- Previous Web behavior sent `rememberMe` and requested the configured persistent server session.
- New Web checkbox label is `记住登录信息` (`rememberLoginDetails`). It is UI intent for browser credential save/autofill only.
- Web password login no longer sends `rememberMe`; server legacy support remains unchanged for older clients.
- Logout continues to revoke the server session and clear `oj_session`, regardless of checkbox state.

## Autofill Contract

- Login uses a real HTML `form` with React `onSubmit`.
- Account input: stable `id="login-identifier"`, `name="username"`, `type="text"`, `autocomplete="username"`.
- Password input: stable `id="login-password"`, `name="password"`, `autocomplete="current-password"`.
- Password visibility control preserves the same input value and has accessible labels.
- No Credential Management API was added; native HTML Password Manager behavior remains primary.

## Security

- No password persistence added to localStorage, sessionStorage, IndexedDB, cookies, URL, React persisted state, database, or profile data.
- Existing opaque session token, HttpOnly/SameSite cookie, CSRF, fresh session token, revocation, and password-change revocation contracts remain untouched.
- Existing Web Storage usage is unrelated navigation/UI state; no stored password or token found in Web source.

## UI

- Login card now has explicit field rhythm, password visibility affordance, credential helper copy, focus treatment, and browser autofill-compatible colors.
- Credential checkbox is unchecked by default, keyboard accessible, and rendered only in password mode.
- Existing code-login, guest-login, social-login, error, disabled, and responsive flows remain structurally intact.

## Validation

- Focused rich login UI tests: PASS (61/61).
- `pnpm typecheck`: PASS.
- Root API/Web build (`pnpm build`): PASS.
- Changed-file ESLint: PASS (CSS ignored by ESLint configuration).
- Architecture check: PASS.
- `git diff --check`: PASS.
- Manual Password Manager save prompt and logout/autofill retest: PENDING USER.

## Delivery

No schema migration. No Runtime, Judge, Discussion, Team, Homework, Profile, or Problem changes. Feature branch remains unmerged.
