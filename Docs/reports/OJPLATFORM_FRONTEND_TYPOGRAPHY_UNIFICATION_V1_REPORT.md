# OJPlatform Frontend Typography Audit & Unification V1

Date: 2026-09-22
Branch: `codex/frontend-typography-unification-v1`
Base main: `58b7c8bc4bbf8e991f90bab68017aec81dbf4306`
Feature HEAD before this report: `f4c4ced6009c5808d2494079074fe78fe521e1b5`

## Status

```text
TYPOGRAPHY_AUDIT = PASS
TYPOGRAPHY_UNIFICATION = PASS
NUMERIC_TYPOGRAPHY = PASS
CHINESE_TYPOGRAPHY = PASS
CODE_FONT_PRESERVED = YES
BUSINESS_REGRESSION = PASS (typography scope; known main test failure unchanged)
READY_FOR_INTEGRATION = YES
MANUAL UI ACCEPTANCE = PENDING USER
```

## Before inventory

Static inventory covered every CSS/TS/TSX file under `apps/web/src`, including
global styles, shared components, feature styles, form controls, table/metric
surfaces, and the hosted OnlineCodeEditor boundary. Counts overlap where one
declaration contains several fallback names.

| Font / token | Locations / usage | Count before | Problem |
| --- | --- | ---: | --- |
| `font-family` declarations | 11 CSS files | 157 | No canonical token contract |
| Georgia / Times / serif stacks | Home, navbar, contests, problems, submissions, discussion | Georgia 107; Noto Serif 87 | UI text and numbers looked like a different product per page |
| Arial stacks | Icons, labels, contest/homework fragments | 13 | Platform-specific local override |
| KaiTi / STKaiti | slogans and decorative labels | 9 | Third display style mixed into product UI |
| UI sans variants | root plus local page copies | `Noto Sans` 5; YaHei 4; PingFang 4 | Different fallback order and incomplete cross-platform behavior |
| Mono/code stacks | samples, editors, source, IDs and some ordinary UI | 32 references | Legitimate code use mixed with ordinary IDs/numbers |
| Tabular numerals | isolated table/metadata rules | 15 declarations | Most rank/time/metrics/pagination remained proportional |
| Weight 800 | headings, labels, badges, metrics | 33 declarations | Excessively heavy and inconsistent hierarchy |

Computed-style baseline confirmed the static findings. Examples:

- Dashboard sampled four distinct computed stacks; 12/22 sampled elements used
  Georgia/serif.
- Problem list sampled UI sans, two Georgia stacks, and an ordinary-ID mono
  stack; only 31/118 sampled data elements had tabular numerals.
- Submission list used a serif stack on 116/120 sampled elements and no sampled
  element exposed tabular numerals.
- Contest time values used Georgia with proportional numerals.
- Discussion headings used Georgia/宋体 while controls and dates used separate
  sans stacks.
- Hosted editor controls inherited Georgia/宋体 while editor text used a separate
  Consolas stack.

## Typography system

### Canonical tokens

```css
--font-ui: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
  'Microsoft YaHei UI', 'Microsoft YaHei', 'PingFang SC',
  'Noto Sans CJK SC', 'Noto Sans SC', Arial, sans-serif;

--font-code: 'Cascadia Code', SFMono-Regular, Consolas,
  'Liberation Mono', Menlo, monospace;

--font-heading: var(--font-ui);
```

- Body, headings, labels, buttons, navigation, cards, tables, dialogs, forms,
  toasts, and hosted editor chrome use `--font-ui`.
- Headings intentionally use the same family as body text; no artificial display
  family was created.
- Code blocks, inline code, samples, source, markdown/testcase editors,
  CodeMirror content/gutters, and long Judge node IDs use `--font-code`.
- Form controls and `option` explicitly inherit typography.
- No CDN, remote font URL, or new font asset was added.

### Weight hierarchy

- Regular `400`
- Medium `500`
- Semibold `600`
- Bold `700` for genuine emphasis/page titles
- All 33 local `800` declarations were normalized to `700`; no 300/800/900
  declaration remains in Web CSS.

## Numeric system

Normal prose/title/button numbers remain UI Sans. Data-bearing surfaces use
`font-variant-numeric: tabular-nums lining-nums`, including the shared
`.numeric`, `.metric-number`, and `.tabular-number` utilities plus semantic
time/data/table/metric/stat/count/rank/score/rate/pagination/Problem ID surfaces.
Existing feature-local tabular rules were upgraded from tabular-only to tabular
lining numerals.

| Surface | Result |
| --- | --- |
| Metrics/statistics | UI Sans + tabular lining numerals |
| Tables/rank/score | UI Sans + tabular lining numerals |
| Time/memory/runtime/percentages | UI Sans + tabular lining numerals |
| Pagination/counts/AC rate | UI Sans + tabular lining numerals |
| Ordinary Problem/Submission IDs | UI Sans + tabular lining numerals |
| UUID/hash/Judge node ID | Code mono, intentionally |

Chrome measurement at 32px verified equal single-digit widths for
`0/1/2/7/8` (all `18.765625px`) and equal three-digit widths for `111/888`
(both `56.296875px`).

## Chinese and cross-platform behavior

- Windows resolves the leading system stack to Segoe UI with explicit
  Microsoft YaHei UI / Microsoft YaHei Chinese fallbacks.
- macOS has `-apple-system` plus PingFang SC.
- Linux has system UI plus Noto Sans CJK SC / Noto Sans SC.
- English, Chinese, punctuation, and numbers now share one UI family policy and
  baseline instead of serif/sans/mono mixtures.
- Existing font sizes and layout spacing were preserved; only typography-related
  family, numeric features, and weight normalization changed.

## Cleanup and outliers

- All app-source `font-family` declarations now resolve through `--font-ui`,
  `--font-code`, `--font-heading`, or intentional `inherit`.
- Removed app-source Georgia, Times New Roman, Noto Serif, Songti, SimSun,
  KaiTi/STKaiti, random Arial, and duplicated raw sans/mono stacks.
- Hosted OnlineCodeEditor UI is explicitly normalized at the host boundary;
  `.cm-content`, `.cm-gutters`, textareas, pre, and code remain canonical mono.
- Required outliers:
  - KaTeX mathematical glyph fonts: existing bundled dependency assets, required
    for formula rendering and unchanged by this task.
  - Code surfaces and long node IDs: canonical `--font-code` by policy.

## Visual and computed-style evidence

Screenshots are local evidence only and were not committed:

- Before: `C:/Users/WYL20/AppData/Local/Temp/opencode/typography-before/`
- After: `C:/Users/WYL20/AppData/Local/Temp/opencode/typography-after/`
- Captured at identical `1440x1000` and `1024x768` viewports for Dashboard,
  Problem list, Problem detail, Submission list, Contest/Leaderboard and other
  available routes.

After computed-style findings:

- Dashboard, login/register, problems, submissions, contests, profile,
  discussion, leaderboard, and accessible Judge/auth states use the exact
  canonical UI stack for ordinary UI.
- Problem list: 118/118 sampled elements use canonical UI; 48 sampled data
  elements expose tabular lining numerals.
- Submission list: 120/120 sampled elements use canonical UI; 98 sampled data
  elements expose tabular lining numerals.
- Hosted editor chrome uses canonical UI; CodeMirror content uses canonical code.
- No app-source serif/Arial/alternate mono computed outlier remained.
- No new browser font request occurred.

Responsive/browser checks passed at 1440, 1024, and 720 CSS pixels (the latter
also representing a 1440-wide layout at 200% effective width): no document
horizontal overflow and no visible control clipping. The only reported clipped
control was the intentional 1x1 screen-reader-only editor button.

Browser smoke covered home, auth pages, Problem list/detail, live CodeMirror DOM,
Submission list/auth gate, Contest/Leaderboard, profile, discussion and Judge
authorization state. Browser `pageerror` count was zero. Expected guest 401/403,
unavailable checker 503 diagnostics, and an existing React list-key warning were
not fatal JavaScript errors and are outside typography scope.

## Changed files

- `apps/web/src/app/app.css`: canonical tokens/defaults, numeric policy, form
  inheritance, hosted editor boundary.
- Shared/component styles: navbar, portal, Judge machines, Problem editor.
- Feature styles: Home, Contest, Problem Library, Submissions, Discussion,
  Profile, Homework Dashboard.
- `tests/web-typography-contract.test.ts`: token, remote-font, canonical
  declaration, tabular numeral, form inheritance, ordinary-ID and CodeMirror
  regression contract.

No API, backend, Judge, schema, deployment, environment, or business contract
was changed.

## Validation

| Gate | Result |
| --- | --- |
| TypeScript | PASS |
| Web production build | PASS (existing chunk-size warning only) |
| Typography contract | PASS, 4/4 |
| Focused Web regression | PASS, 59/59 |
| Architecture gate | PASS |
| Changed TS lint | PASS |
| Changed TS format | PASS |
| `git diff --check` | PASS |
| Chrome computed-style/screenshot smoke | PASS |
| Responsive / effective 200% width | PASS |
| New font downloads | NONE |

The repository-wide `pnpm test:web` is not green on either feature or unchanged
main: 11/12 pass and the submission-history test fails because its baseline mock
omits `statistics.trend`, causing the existing `SummaryCards` `undefined.map`.
Running the same command on live main reproduced the identical failure. It was
not changed under this typography-only task. Repository-wide lint likewise has
eight pre-existing errors in API, Judge Service, and the generated Web plugin
declaration; changed-file lint passes.

## Deployment

```text
PRODUCTION_RUNTIME_CONTRACT_CHANGED = NO
NEW_FONT_ASSETS = NO
DEPLOYMENT_CHANGE = NO
MIGRATION_CHANGE = NO
```

## Git

Feature commits before report/status documentation:

- `9ab6247 style(web): define unified typography system`
- `b53de9b test(web): protect typography tokens`
- `d305446 style(web): normalize editor typography boundary`
- `44ec76d style(web): preserve canonical editor code stack`
- `f4c4ced style(web): enforce editor code font token`

Main was not merged. AlgoQuest was not accessed or modified.
