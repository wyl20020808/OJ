# OJPlatform Admin Chinese UX + Notification Popover V1 Report

Date: 2026-09-05

## Scope

This goal was created from local canonical `main` at `1549815` on branch
`codex/admin-cn-notification-v1`.

Implemented notification popover dismissal for outside pointer interaction and
Escape. The listeners exist only while the popover is open and are removed on
close or component unmount. Existing bell toggle, inside interaction, and close
button behavior remain intact.

The visible admin navigation label was already Chinese and is covered by a
focused copy regression test. The only current admin page is the Judge node
surface. It retains English copy because the goal explicitly excludes Judge;
therefore full admin-page Chinese coverage is not claimed.

No Problem page, Evaluation Detail, JudgeData, Judge behavior, Runtime Manager,
or Launcher code was changed. Technical identifiers and API/database values
were not changed.

## Evidence

- Focused tests: PASS, 3 files and 167 tests.
- Web typecheck: PASS.
- Web build: PASS. Vite emitted its existing large-chunk warning.
- Git diff check: PASS.
- Runtime/browser validation: NOT VERIFIED; Start/Stop/Restart was prohibited.

## Final Status

```text
ADMIN CN + NOTIFICATION = PARTIAL

ADMIN NAV CN = PASS
ADMIN PAGES CN = FAIL
TECH IDENTIFIERS PRESERVED = YES

BELL OPEN = PASS
OUTSIDE CLICK CLOSE = PASS
INSIDE CLICK PRESERVED = PASS
X CLOSE = PASS
ESCAPE = PASS

TESTS = PASS (3 files, 167 tests)
TYPECHECK = PASS
BUILD = PASS
DIFF CHECK = PASS

FINAL COMMIT = feat: add notification popover dismissal (this commit)
TRACKED CLEAN = YES (verified after final commit)
```

Overall status is `PARTIAL` solely because translating the remaining current
admin page would modify the explicitly excluded Judge surface.
