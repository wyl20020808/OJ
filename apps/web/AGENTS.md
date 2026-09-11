# OJPlatform Web Frontend Architecture Rules

These rules apply to all changes under `apps/web`. They supplement the repository
root `AGENTS.md`; they do not weaken its architecture, security, contract, or
testing requirements.

## 1. Core Principle

Frontend code should be organized by feature/page ownership.

A page should own its components, styles, hooks, API adapters, types, and tests.
Avoid centralizing unrelated pages.

## 2. App.tsx Responsibility

`src/app/App.tsx` is application composition only.

Allowed:

- router registration
- global providers
- auth bootstrap
- application shell
- global error boundary
- top-level layout

Not allowed:

- large page JSX
- feature-specific UI
- feature-specific state
- feature-specific API calls
- feature-specific styles
- business logic

If `App.tsx` grows because of a page, extract the page into its owning feature.

## 3. app.css Responsibility

`src/app/app.css` only contains:

- CSS reset
- global variables
- design tokens
- typography defaults
- global layout primitives
- shared utility classes
- application shell styles

It must not contain page styles, including selectors such as:

```css
.home-*
.problem-library-*
.profile-*
.discussion-*
.team-*
.homework-*
```

Page styles must not live here.

## 4. Feature Folder Structure

Preferred structure:

```text
src/features/
  problem-library/
    ProblemLibraryPage.tsx
    ProblemLibraryPage.css
    components/
      ProblemFilters.tsx
      ProblemTable.tsx
      Pagination.tsx
    hooks/
      useProblemLibrary.ts
    api/
      problemLibraryApi.ts
    types.ts
  profile/
    ProfilePage.tsx
    ProfilePage.css
    components/
    hooks/
    api/
    types.ts
```

Create only the folders a feature needs. A feature owns its page-specific code,
and unrelated pages must not be placed in the same feature folder.

## 5. Component Ownership

Large components must be split by responsibility. Do not grow a page into a
multi-thousand-line component.

Prefer a structure such as:

```text
ProblemLibraryPage
├─ ProblemFilters
├─ ProblemList
├─ ProblemRow
├─ Pagination
└─ EmptyState
```

Extract components because they have a distinct responsibility, not merely to
move lines between files.

## 6. CSS Rules

Prefer colocated styles:

```text
Component.tsx
Component.css
```

or:

```text
feature/
  components/
    Table.tsx
    Table.css
```

Avoid an `everything.css` pattern. Before creating styles, check whether a
shared component or existing token already satisfies the need. Do not duplicate
equivalent styles.

## 7. Shared Components

Reusable UI primitives belong in `src/components/`.

Examples include Button, Input, Modal, Dialog, Toast, Tabs, Card, and Table
primitives. Do not create page-named variants such as `ProfileButton.css`,
`HomeButton.css`, and `ProblemButton.css` when they implement the same UI
primitive.

Keep shared components generic and stable. Feature-specific compositions belong
to the feature that owns them.

## 8. Hooks Rules

Business interaction logic should not remain inside huge components. Put
feature-specific interaction logic in feature hooks, for example:

```text
hooks/
  useProblemQuery.ts
  useProfileSave.ts
  useTeamMembers.ts
```

Avoid pages with hundreds of lines of `useEffect` and `useState` handling.

## 9. API Rules

Frontend code must not invent business data. Do not introduce mock production
rows, fake statistics, random numbers, hardcoded user state, or fake API
responses.

If the backend does not provide data, show an explicit empty state, `—`, or a
disabled state. Do not pretend data exists.

## 10. Backend Contract Preservation

Frontend refactoring must preserve API routes, response contracts,
authentication, authorization, CSRF requirements, loading states, error
handling, and empty states. Never replace a real API with static mock data for
visual purposes.

## 11. Parallel Development Rules

To reduce merge conflicts, prefer modifying the owning `features/<feature>/`
area. Avoid simultaneous unrelated changes to `App.tsx`, `app.css`, router
composition, or shared components. When practical, one feature has one worker
and one ownership area.

## 12. Existing Large File Migration Rule

Existing files may contain legacy code. Do not put new feature code in
`App.tsx` or `app.css` merely because legacy code already lives there. When
touching a legacy area, prefer incremental extraction:

```text
Before: App.tsx contains Home, Problem, Profile, and Discussion UI.
After:  App.tsx contains routes; features/ owns home, problem-library,
        profile, and discussion.
```

## 13. Refactoring Rules

Never perform a full `App.tsx` rewrite, full CSS rewrite, unrelated migration,
or move every feature at once. Extract one feature at a time, then run its
relevant tests and build checks before the next extraction.

## 14. UI Quality Rules

UI improvements must preserve real business data, real API behavior, real
permissions, and real routes. Avoid fake cards, fake statistics, decorative
business data, meaningless badges, and duplicated layouts.

## 15. Definition of Done

Every frontend feature should verify:

```text
Component ownership clear
Page code isolated
No unnecessary App.tsx growth
No unnecessary app.css growth
API contract preserved
Loading handled
Error handled
Empty handled
Typecheck PASS
Build PASS
Relevant tests PASS
Diff clean
```

## 16. Before Starting Any Frontend Task

Codex must first answer:

```text
Which feature owns this change?

Does this belong in App.tsx, app.css, a shared component, or a feature folder?

Can this avoid touching global files?
```

Priority: feature isolation over quick implementation.

## 17. Do Not Apply Browser Human Acceptance

Codex may inspect code, run tests, run builds, and check DOM contracts. Codex
does not replace user manual UI acceptance.

```text
MANUAL UI ACCEPTANCE = PENDING USER
```

## Caveman Usage for Frontend

Use caveman for:

- frontend architecture migration
- App.tsx/app.css extraction
- large page refactoring
- component ownership analysis
- design system migration
- multi-page UI modernization

Before frontend refactoring, analyze:

- component ownership
- shared dependencies
- routing impact
- API contracts
- CSS ownership
- merge conflict risk

Do not use caveman to justify:

- putting more page code into App.tsx
- putting more page CSS into app.css
- replacing real APIs with mock data
- removing permissions or loading states
