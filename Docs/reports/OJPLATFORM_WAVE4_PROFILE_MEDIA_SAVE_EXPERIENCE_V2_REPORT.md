# Product Experience Wave 4F: Profile Media & Save Experience V2

Status: PARTIAL

Base main: `7a7ea79ec8f2a88d3f102204fa37c97da9afc4c7`
Worktree: `D:\OJPlatform-worktrees\wave4-profile-media-save-v2`
Branch: `codex/wave4-profile-media-save-v2`

## Implemented

- Fixed profile save contract: read-only `username` and media fields are excluded from PATCH payload.
- PATCH validation now returns field-level `details`; optional fields may be cleared; existing upsert behavior is preserved.
- Added TEMP migration adding canonical `avatar_object_key` and `background_object_key` references.
- Reused application S3/MinIO client. Added authenticated multipart upload endpoints for avatar/background with MIME, signature, and size validation.
- Added controlled public media delivery route, immutable cache headers, replacement-safe random keys, and remove endpoints.
- Added Profile and Edit Profile media previews, picker controls, remove actions, loading/error states, and responsive styling.

## Root cause

`PATCH /api/profile/me` rejected the frontend's full `EditableProfile` object because it included read-only `username`. The generic toast hid the structured contract failure.

## Evidence

- Root TypeScript check: PASS.
- API and Web TypeScript checks: PASS.
- Focused Profile/Web tests: 37/37 PASS.
- Changed-file ESLint: PASS.
- `git diff --check`: PASS.
- PostgreSQL migration apply/second-run: NOT VERIFIED.
- MinIO upload/read/replace/remove runtime fixture: NOT VERIFIED.
- Manual visual/profile upload acceptance: PENDING USER.

## Security and scope

Authenticated password users only; CSRF remains supplied by shared API client. No arbitrary user ID or client-selected delete key is accepted. Database stores object keys only; no base64 or credentials persist. Judge, Sandbox, Runtime Plugin, and OnlineCodeEditor were not modified.

Migration is intentionally temporary and final numbering is pending integration. Main was not merged or modified.
