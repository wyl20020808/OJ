# OJPlatform Discussion Hub Experience Wave 2 Report

## Status

`PASS` for implemented and automated Web scope. Manual UI acceptance is
`PENDING USER`; no browser automation was run by contract.

## Source

- Observed main: `f823239152b85c690cbae447e9bf02c80e58b11f`
- Worktree: `D:\OJPlatform-worktrees\discussion-hub-wave2`
- Branch: `codex/discussion-hub-wave2`
- Canonical main modified: no
- Main merged: no

## Domain Audit

The stable Discussion V1 domain supports only `ARTICLE` and `ANNOUNCEMENT`.
Both use `discussion_posts`, the same public API, comments, likes, author
projection, and viewer capability projection. No `DISCUSSION`, `POST`, or
`THREAD` content type exists. This Goal adds no type and no schema migration.

## Information Architecture

`/discussion` is the public content hub. Compact header provides one authoring
entry. Internal tabs expose All, Article, and Announcement with reproducible
query URLs. Refresh and browser history preserve filters because state is read
from `window.location.search`. Existing API title search is exposed without
inventing ranking or full-text behavior. Latest remains the only ordering.

## Content Entry Audit

### Migrate navigation to Discussion

- Global Discussion navigation already points to `/discussion`; all nested
  Discussion routes retain its active state.
- ARTICLE and ANNOUNCEMENT public browsing share `/discussion` and its filters.
- The authoring entry points to the existing `/discussion/new` route.

### Keep domain-specific

- Home `staticAnnouncements` are source-controlled product release/status
  notes. They are not Discussion database records and have no Discussion post
  identifiers. Moving them would require content migration and ownership
  decisions outside this UI Goal, so their existing destinations remain.
- Contest notices, notifications, and messages are contextual/private product
  domains, not public Discussion content.

### Not applicable

- No legacy public article, blog, notice, or announcement routes were found.
- No public Profile article entry was found.
- Admin has no separate public content browser to redirect.

## Presentation

ARTICLE and ANNOUNCEMENT use shared `DiscussionFeedItem`, type badge, author
link, metadata, counts, detail shell, Markdown renderer, actions, and comments.
Announcement distinction is limited to a muted amber badge and left accent.
Feed rows are separated rather than elevated cards and preserve compact density.
Missing summaries remain absent; raw Markdown is not truncated into excerpts.
Deleted authors retain the existing safe fallback and profile route.

Detail width is bounded to 860px. Typography, headings, blockquotes, inline and
block code, tables, images, links, GFM, KaTeX, and horizontal overflow are
covered by the shared renderer and CSS. Owner controls use only server-provided
capabilities. Like and copy-link are compact actions; copy feedback uses local
status because the shared Worker B Toast is not integrated here.

Comments use shared author metadata and renderer, separators instead of cards,
compact edit mode, capability-driven controls, loading/error/empty states, and
bounded code overflow. No V2 reply, ranking, moderation, or notification UI was
added.

## Responsive Rules

Desktop retains dense two-column feed rows with counts at the edge. At 720px
and below, hub header, toolbar, detail heading, and feed stack naturally; tabs
remain one horizontal scroll row; metadata wraps; reading width becomes fluid;
code and tables scroll horizontally. Rules cover requested 1440, 1280, 1024,
768, and narrower layouts statically. Manual visual confirmation is pending.

## Parallel Worker Boundaries

- Worker A overlap: low. No Discussion SQL, repository, route, or UUID behavior
  changed.
- Worker B overlap: medium. Existing `DiscussionEditor` and imported shared
  `MarkdownToolbar` remain functionally unchanged, but both workers may touch
  `DiscussionExperience.tsx` and `app.css`. Integration Lead must preserve
  Worker B's Editor region while taking this branch's Hub and Detail regions.
  No toolbar, article editor, ProblemEditor, or Toast implementation changed.
- Integration dependency on Worker B: connect copy-link success to shared Toast
  after its provider lands. Current accessible inline status remains valid.

## Validation

- Focused Discussion, renderer, navigation, and Wave 2 tests: PASS, 20/20
- Web/root TypeScript typecheck: PASS
- Changed TypeScript lint: PASS
- Web build: PASS; existing large chunk warning remains
- Architecture dependency gate: PASS
- API/root build and typecheck: PASS; no API files changed
- Runtime/browser/manual UI: PENDING USER by no-browser-control contract
- `git diff --check`: PASS before report closeout

## Delivery

No dependency, schema, API, Profile, Team, Problem, Judge Runtime, shared editor,
or Toast code was added. Required changes are committed on the feature branch.
