# OJPlatform Default Checker Token Whitespace V1 Report

## Result

`DEFAULT CHECKER = TOKEN_WHITESPACE`.

New Judge Data drafts now default to `TOKEN_WHITESPACE`, so insignificant
whitespace such as a final newline does not make an otherwise correct answer
fail. `EXACT_BYTES` remains available as an explicit advanced Judge setting.

## Scope

- Product fallback defaults used when the first testcase, pair upload, or ZIP
  upload creates a Judge Data draft now use `TOKEN_WHITESPACE`.
- The Web editor fallback shown when no draft exists uses
  `TOKEN_WHITESPACE`.
- The existing Checker setting still exposes both `Token whitespace` and
  `Exact bytes`; an author can explicitly save `EXACT_BYTES`.
- Existing drafts and immutable published Judge Data versions are not rewritten
  and retain their stored checker binding.

## Verification

- Backend regression proves a new pair defaults to `TOKEN_WHITESPACE`.
- Web regression proves an empty editor selects `TOKEN_WHITESPACE` and retains
  the `EXACT_BYTES` option.
- Existing explicit `EXACT_BYTES` configuration and manifest tests continue to
  pass.
- Focused Judge Data/Web tests: 25 passed.
- TypeScript workspace typecheck: PASS.

`PRODUCTION READY`: NOT CLAIMED.
