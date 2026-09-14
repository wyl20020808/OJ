# Blog Comment UI Repair V1 Report

## Root UI Problems

- `DiscussionComments.tsx` owns comment data, CRUD, likes, replies, and rendering.
- `DiscussionExperience.css` is the feature-owned style boundary. No new rule was added to `app.css`.
- Legacy Blog selectors imposed `max-height: 450px` and `overflow-y: auto` on the list.
- Composer appeared after the feed; sort controls were UI-only; root and nested rows carried large vertical padding and action spacing.
- Fallback avatars were single-letter circles; reply cards duplicated full comment spacing.

## Reference Analysis

Reference: [`Goals/文章界面.png`](../../Goals/文章界面.png), `1484 × 1060` pixels. Target traits: compact continuous feed, light segmented sorter, header-adjacent composer, `30–36px` visual avatars, single-line metadata, muted inline actions, light reply indentation, and page-owned vertical scrolling.

## Before Screenshot

![BEFORE](assets/blog-comment-ui-repair-v1/before-desktop-1484x1060.png)

Browser geometry: screenshot `1484 × 1060`; CSS viewport `1187 × 848`; DPR `1.25`; `visualViewport.scale = 1`.

Measured BEFORE: card width `450px`; list `clientHeight 450px`, `scrollHeight 573px`, `overflow-y: auto`; first thread `295px`; nested reply `150px`; avatar `28px`; first action row height `67px`.

## Files Changed

- `apps/web/src/features/discussion/DiscussionComments.tsx`
- `apps/web/src/features/discussion/DiscussionContent.tsx`
- `apps/web/src/features/discussion/DiscussionExperience.tsx`
- `apps/web/src/features/discussion/DiscussionExperience.css`
- `tests/blog-comment-ui-repair-v1.test.tsx`
- `tests/e2e/blog-comment-ui-repair-v1.spec.ts`
- this report and screenshot evidence

No API, Auth, database, Judge, Contest, or unrelated page contract changed.

## Comment Header

Real `post.commentCount` remains authoritative. Sort controls moved into the header and now expose real `aria-pressed` state.

## Composer

Authenticated layout is now `[avatar] [说点什么吧...] [发表评论]`, with matched `34px` control height, focus ring, compact primary action, and the existing create-comment API. Anonymous runtime retains the real login prompt. No authentication bypass or fake session was used.

## Comment Item Layout

Metadata is compact and wraps safely for long names. Body and actions share a `35px` content inset. Dividers are lighter. Author badge appears only when comment username matches the real post author.

## Nested Reply Layout

Replies use a one-level `35px` indent, `1px` thread line, light background, small radius, and compact padding. Reply context separates muted `回复` from theme-colored `@username`.

Measured AFTER: list `319px`, `overflow-y: visible`, `scrollHeight = clientHeight = 319px`; ordinary rows `76–77px`; nested reply `85px`; thread with reply `166px`.

## Avatar Handling

Real `avatarUrl` remains first priority. Comments without an avatar use a deterministic local SVG portrait palette derived from username; no remote hotlink, random person, or dependency was added. Non-comment Blog surfaces retain their previous initial fallback.

## Action Bar

Like, reply, edit, and delete are one compact inline row with local SVG icons. Permission-controlled edit/delete rendering is unchanged. Delete is muted until hover.

## Sorting

- 按热度: root comments by like count descending, then newest/id tie-break.
- 按时间: root comments by created time descending, then id tie-break.
- Replies retain chronological thread order.
- Real browser click changed active state without card width change; focused tests verify differing data order.

## Reply / Edit / Delete Interaction

Focused component tests verify reply open/focus/cancel/submit, edit/save, delete, and owner/other-user capability rendering. Existing API methods and payloads are preserved. Live runtime browser was anonymous, so persistent authenticated mutations were not fabricated or submitted.

## Responsive Validation

- Desktop evidence: physical screenshot `1484 × 1060`; CSS viewport `1187 × 848`, DPR `1.25`.
- Tablet: CSS viewport `768 × 1024`, DPR `1.25`; no horizontal overflow; list uses page scroll.
- Mobile: CSS viewport `390 × 844`, DPR `1.25`; no horizontal overflow; reply bounds `43.8–359.6px` within viewport; sorter and thread remain readable.

![Tablet](assets/blog-comment-ui-repair-v1/after-tablet-comments-css-768x1024-dpr1.25.png)

![Mobile](assets/blog-comment-ui-repair-v1/after-mobile-comments-css-390x844-dpr1.25.png)

## After Screenshot

![AFTER](assets/blog-comment-ui-repair-v1/after-desktop-1484x1060.png)

## Reference vs After Comparison

| Reference | Before | After |
| --- | --- | --- |
| ![Reference](assets/blog-comment-ui-repair-v1/reference.png) | ![Before](assets/blog-comment-ui-repair-v1/before-desktop-1484x1060.png) | ![After](assets/blog-comment-ui-repair-v1/after-desktop-1484x1060.png) |

AFTER is visibly denser and closer to the reference: internal scrollbar removed; all four real comments now form one continuous feed; nested reply height fell about `43%`; thread height fell about `44%`; actions no longer create empty rows. Remaining expected differences come from real local data count and anonymous Auth state.

## Tests

- Focused Vitest: `21/21` passed across Blog Comment UI, Discussion Hub, and Discussion Core.
- Real-runtime Playwright: `3/3` passed at desktop, tablet, and mobile.
- Targeted ESLint: PASS.
- Targeted Prettier: PASS.
- `git diff --check`: PASS.

## Build

- Root TypeScript typecheck: PASS.
- Web production build: PASS. Existing Vite large-chunk warning remains non-blocking and unrelated.

## Final Status

```text
COMMENT UI REPAIR = PASS
SCREENSHOT COMPARISON = PASS
COMMENT DENSITY = PASS
COMPOSER = PASS
NESTED REPLIES = PASS
ACTION BAR = PASS
AVATAR PRESENTATION = PASS
SORTING INTERACTION = PASS
RESPONSIVE = PASS
TYPECHECK = PASS
WEB BUILD = PASS
MANUAL UI ACCEPTANCE = PENDING USER
MAIN MERGE = NOT PERFORMED
```
