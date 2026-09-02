# 3B Web Problem/Judge Data Contract Mapping V1

## Scope

The Web client uses only the Product-facing namespace `/api/problems/:problemId/judge-data`. It does not call Judge Service, MinIO administration, or privileged storage endpoints, and it does not carry credentials for those systems.

## Typed Mapping

| Product contract | `ApiClient` method | UI use |
| --- | --- | --- |
| `GET .../judge-data` | `judgeData` | aggregate read contract |
| `GET .../judge-data/draft` | `judgeDraft` | current editable draft |
| `GET .../judge-data/versions` | `judgeVersions` | immutable version history |
| `GET .../judge-data/versions/:versionId` | `judgeVersion` | published version detail read |
| `GET .../judge-data/testcases/:testcaseId` | `judgeTestcase` | metadata-only testcase read |
| `PUT .../draft/config` | `saveJudgeConfig` | defaults/checker/language profiles |
| `POST .../draft/testcases` | `addJudgeTestcase` | future pair metadata import |
| `PATCH .../draft/testcases/:testcaseId` | `updateJudgeTestcase` | per-case limit overrides |
| `DELETE .../draft/testcases/:testcaseId` | `deleteJudgeTestcase` | destructive removal confirmation |
| `POST .../draft/upload` | `uploadJudgeData(..., false)` | single pair upload |
| `POST .../draft/upload-zip` | `uploadJudgeData(..., true)` | ZIP batch upload |
| `POST .../draft/validate` | `validateJudgeData` | validation state/errors/warnings |
| `POST .../publish` | `publishJudgeData` | immutable published version |

`effective* = override ?? defaults` is rendered from the typed draft. Published versions are displayed as history and are never edited in place. Hidden input/output bodies are never rendered; only filenames, sizes, and hashes represented by metadata are available to the component.

Upload selection is a two-step client flow: local `.in/.out` or `.zip` selection first renders a pair preview, then the explicit upload action sends the files to Product Backend for parse/import. The client does not infer or persist backend testcase identities from the preview.

## Qualification Boundary

`tests/problem-editor.test.tsx` uses typed client fixtures and verifies path/credential restrictions. This is contract qualification only. `REAL PRODUCT BACKEND RUNTIME = NOT VERIFIED` until 3A provides the Product endpoints.
