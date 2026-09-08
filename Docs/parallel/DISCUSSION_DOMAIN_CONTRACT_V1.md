# Discussion Domain Contract V1

## Stable V1

`discussion_posts` is shared base for `ARTICLE` and `ANNOUNCEMENT`. Stable fields: `id`, `public_id`, `author_id`, `type`, `status`, `title`, `summary`, `content_markdown`, `published_at`, `created_at`, `updated_at`, `deleted_at`, `deleted_by`, `view_count`.

`discussion_comments` supports nullable `parent_comment_id`; V1 API presents flat paginated list. `discussion_post_likes` has unique `(post_id,user_id)` and explicit POST/DELETE semantics.

Public API base: `/api/discussion/posts`. Drafts require owner or capability; public list/detail expose only `PUBLISHED`. Mutations require authenticated password session and CSRF. Announcement creation requires `discussion:announcement:create`; moderation uses `discussion:post:moderate` and `discussion:comment:moderate`.

Web routes: `/discussion`, `/discussion/:idOrSlug`, `/discussion/new`, `/discussion/:idOrSlug/edit`.

## V2 Reserved

Reply tree rendering, comment likes, pinning, comment lock, reports/moderation UI, and hot ranking are deferred. Existing `parent_comment_id`, tombstone statuses, and capability names are extension points.
