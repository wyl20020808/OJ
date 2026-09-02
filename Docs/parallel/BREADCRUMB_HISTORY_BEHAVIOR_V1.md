# Breadcrumb History Behavior V1

Breadcrumbs record meaningful pathname visits in `sessionStorage` under
`ojplatform:breadcrumb-history:v1`. They retain at most five items, replace a
consecutive visit to the same pathname instead of duplicating it, and render
the current route as the final non-link item.

Query-only state is ignored because entries use `location.pathname`. Login,
registration, forbidden, error, and not-found routes are transient and are not
persisted. A refresh restores this browser-session history; a direct URL with
no stored history displays only that route. Browser Back and Forward use the
normal browser history and record the resulting meaningful current pathname.

Labels use known product labels and route entity identifiers as the safe
fallback until an already-loaded entity title is available. The breadcrumb
never stores route state, query values, or sensitive data.
