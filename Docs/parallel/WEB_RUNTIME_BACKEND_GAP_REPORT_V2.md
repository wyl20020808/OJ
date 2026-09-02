# Web Runtime Backend Gap Report V2

## GAP-WEB-01: Contest mutation UI is local-only

- Domain: Contest
- UI: `apps/web/src/components/PortalExperience.tsx`, `ContestCreate`
- Route: expected `POST /api/contests`, `PUT /api/contests/:id/problems`, `POST /api/contests/:id/publish`
- Request: title, ISO start/end, visibility, format, problem IDs
- Expected: authenticated draft and membership persist in PostgreSQL
- Actual: submit only sets a local-page message; no request is sent
- Classification: `WEB_BUG`
- Backend reference: `PRODUCT_BACKEND_COMPOSED_ROUTE_MATRIX_V1.md` Contest rows
- Persistence: not verified because no mutation is issued
- Owner/severity: Web / HIGH
- Reproduction: open `/contests/new`, enter valid title and times, submit, inspect Network; reload and the draft is absent
- Next action: pass the typed API client into `ContestCreate`, submit draft, bind problems, and expose publish only after backend success.

## GAP-WEB-02: Contest registration/edit/participant actions are unavailable

- Domain: Contest
- UI: `ContestExperience` detail/settings views
- Routes: `PATCH /api/contests/:id`, `POST /api/contests/:id/register`, `GET /api/contests/:id/registration`, `GET /api/contests/:id/participants`
- Expected: controls follow `canManage`/registration state and persist
- Actual: detail button is disabled; settings and participant views show integration notices
- Classification: `WEB_BUG`
- Backend reference: composed route matrix Contest rows
- Persistence: not verified by Web
- Owner/severity: Web / HIGH
- Reproduction: open a composed contest detail; inspect disabled registration and settings placeholders
- Next action: wire read/mutation methods and map 401/403/409 to controlled UI.

## GAP-WEB-03: Social controls are disabled despite composed routes

- Domain: Social/Friends
- UI: `AddFriend`, `FriendRequests` in `PortalExperience.tsx`
- Routes: `GET /api/users/search`, `POST /api/friend-requests`, `POST /api/friend-requests/:id/accept|reject`, `DELETE /api/friend-requests/:id`
- Expected: search, send, accept/reject/cancel, and refresh state
- Actual: inputs and buttons are disabled; only read props are rendered
- Classification: `WEB_BUG`
- Backend reference: composed route matrix Social rows
- Persistence: API A/B flow confirmed durable; Web path not exercised
- Owner/severity: Web / HIGH
- Reproduction: open `/messages`, choose `添加好友` or `新的朋友`; controls cannot be used
- Next action: wire typed callbacks, update lists after mutation, and show 409 duplicate state.

## GAP-WEB-04: Message composer and message loading are not wired

- Domain: Messaging/Unread
- UI: `MessagesExperience`
- Routes: `GET /api/conversations/:id/messages`, `POST /api/conversations/:id/messages`, `POST /api/conversations/:id/read`, `GET /api/messages/unread-count`
- Expected: selected conversation loads messages, send is idempotent, read state updates
- Actual: summaries are read from API, but textarea and send button are disabled; no message fetch/read callback
- Classification: `WEB_BUG`
- Backend reference: composed route matrix Messaging rows
- Persistence: API A/B flow and restart persistence passed; Web path not exercised
- Owner/severity: Web / HIGH
- Reproduction: open a populated conversation in `/messages`; composer says service is being integrated
- Next action: pass typed load/send/read handlers, generate client correlation IDs, and expose unread count truthfully.

## GAP-WEB-05: Notification bell/read actions remain placeholder

- Domain: Notifications
- UI: `NotificationBell`, `NotificationsPage`
- Routes: `GET /api/notifications`, `GET /api/notifications/unread-count`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`
- Expected: list, count, mark-one and mark-all read
- Actual: page reads list through App, but bell says service is integrating and no read buttons exist
- Classification: `WEB_BUG`
- Backend reference: composed route matrix Notifications rows
- Persistence: API notification list/unread confirmed; read UI not exercised
- Owner/severity: Web / MEDIUM
- Reproduction: open `/notifications` or click bell after a social/message event
- Next action: pass counts/actions into bell and add truthful read controls.

## GAP-WEB-06: Home contest/notification summaries are not composed into the page

- Domain: Home
- UI: `Home` in `apps/web/src/app/App.tsx`
- Routes: `GET /api/contests/home-summary`, notification routes
- Expected: supported summaries are loaded; unsupported modules remain explicit
- Actual: contest panel and notification bell are static integration notices/placeholders
- Classification: `CAPABILITY_MISMATCH`
- Backend reference: composed route matrix Home/Contest/Notifications rows
- Persistence: n/a
- Owner/severity: Web / MEDIUM
- Reproduction: open `/`; panel does not request home-summary
- Next action: add read-only summary adapters and retain explicit unavailable states for missing providers.

## GAP-WEB-07: Profile activity/favorites/team tabs have no authoritative backend source

- Domain: Profile
- UI: `ProfileExperience`
- Routes: `/api/auth/me` and `/api/auth/profile` only; no activity/favorites/team APIs in composed matrix
- Expected: only authoritative data is displayed
- Actual: Web correctly renders capability shells
- Classification: `CAPABILITY_MISMATCH`
- Backend reference: backend support matrix and composed route matrix
- Persistence: not applicable
- Owner/severity: Backend/Web planning / LOW
- Reproduction: open `/profile`, switch tabs, observe explicit unavailable text
- Next action: backend gap closure must define contract before Web implementation; do not invent schema.

## GAP-WEB-08: Error matrix lacks complete browser evidence

- Domain: Errors
- UI: global state/error surfaces
- Routes: representative 400/401/403/404/409/429/5xx
- Expected: all six error classes verified in browser
- Actual: 401/404/409 and controlled 5xx surfaces are covered by tests/API evidence; 429 and all browser retries were not fully exercised
- Classification: `NOT_VERIFIED`
- Backend reference: error envelopes in composed modules
- Persistence: n/a
- Owner/severity: Worker / LOW
- Reproduction: requires rate-limit and injected 5xx browser scenarios
- Next action: add deterministic browser fixtures or dedicated runtime test route in a future qualification goal; do not weaken production behavior.
