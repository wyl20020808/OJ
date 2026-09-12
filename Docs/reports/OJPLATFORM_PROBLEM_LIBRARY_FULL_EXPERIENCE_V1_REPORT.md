# Problem Library Full Experience Completion Report

## Frontend Audit

| 模块 | 需要数据 | 当前来源 | 状态 |
| --- | --- | --- | --- |
| 题目列表、题号、标题、难度、标签、来源 | `GET /api/problems` 题目投影 | Problem API | FULLY_SUPPORTED |
| 搜索、难度、标签、来源、排序、分页 | 查询参数、总数、facets | Problem API | FULLY_SUPPORTED |
| 标签目录与标签计数 | `GET /api/tags`、`facets.tags` | Tag catalog / Problem API | FULLY_SUPPORTED |
| 通过率、提交数 | `statistics.submissionCount/acceptedCount` | Problem API 聚合 | FULLY_SUPPORTED |
| 加载、错误、空状态 | 请求生命周期与结果总数 | 前端本地状态 | FULLY_SUPPORTED |
| 我的收藏、已通过、提交数 | Profile overview | 既有 Profile API | FULLY_SUPPORTED |
| 最近浏览、待练习、网格视图、时间/内存/个人状态筛选 | 无现有产品契约 | 显式不可用 UI | STATIC |
| 近期更新 | 当前列表前五项 | Problem API 当前页 | PARTIAL |
| 热门/推荐题目、难度分布图 | 页面未实现对应模块 | 无 | MISSING_API |

页面不含 mock business rows。Hero 使用已有 `apps/web/public/problem-library-banner.png`，没有缺失图片或图标资源。

## Missing Backend Support

原有 `GET /api/problems`、`GET /api/tags`、服务端搜索、单标签筛选、难度/来源筛选、白名单排序、offset 分页和 facets 已可用。缺口是列表行的权威提交次数与通过率：前端只显示占位符，虽然 API 类型已预留 `statistics`。

审计同时发现 PostgreSQL 搜索条件未限定 `problems` 别名；在统计子查询加入后会产生 `42702 column reference "slug" is ambiguous`。已用 `p.` 限定同一查询谓词中的题目字段。

## APIs Added

未增加路由。`GET /api/problems` 与详情投影现在返回：

```text
statistics: { submissionCount, acceptedCount }
```

统计只读聚合现有 `submissions` 和当前、已完成、`AC` 的 `submission_evaluations`。无提交时返回零；前端据此显示 `暂无记录` 与 `0`，不伪造通过率。

## Database Changes

无迁移、无正式 seed、无生产写入路径变化。聚合读取现有 `0005_submission_intake` 与 `0006_submission_evaluation_history` 表。

## Development Data Added

新增手动执行的 `pnpm seed:problem-library-development`。它要求：

- `OJPLATFORM_DEVELOPMENT_FIXTURES=true`
- `DATABASE_URL` 指向 `127.0.0.1`、`localhost` 或 `::1`

脚本在 `problems.provenance` 写入 `DEVELOPMENT_FIXTURE / PROBLEM_LIBRARY_FULL_EXPERIENCE_V1`，题目来源为 `TEST_FIXTURE`，并只使用 `@example.test` 本地夹具账号。

## Fixture Purpose

仅用于本地 API/UI 视觉验收、搜索、标签、难度、排序与分页验证；不会自动执行，不会写入远程数据库，不生成 submissions 或伪装用户行为。

## Problem Dataset Summary

本次夹具 30 道公开已发布题目，覆盖入门、简单、中等、困难、专家各 6 道，包含基础算法、数据结构、图论、动态规划、字符串、数学、搜索、树与高级技巧。当前本地验收库另有既有 Home 夹具 6 道，因此公共题库响应总数为 36，`limit=20` 可验证第二页。

## Tags Added

夹具复用迁移后的标签目录，覆盖排序、哈希表、前缀和、二分、BFS、最短路、并查集、动态规划、KMP、线段树、网络流、树链剖分、数位 DP、NTT、虚树等。未修改正式标签 seed。

## Statistics Added

统计来自真实表聚合，而非 fixture 数字。开发夹具刻意没有 submission，因此为 `0` 与 `暂无记录`；真实提交完成判题后会自然显示数量和通过率。

## Assets Added

无新增资源。现有题库 banner 正常引用。

## Frontend Fixes

- 补齐侧栏和主筛选区的第五级“专家”难度。
- 使用 `statistics` 渲染通过率与提交数，移除不再准确的占位说明。
- 为“专家”增加对应难度色。

## Tests

- `node_modules\\.bin\\vitest.CMD run tests\\problem-library-server-filter.test.ts tests\\problem.test.ts tests\\product-web-r2.test.tsx` — 18/18 PASS。
- 本地 API (`:3011`)：36 条公共题目；组合搜索、专家难度、`TEST_FIXTURE` 来源、标题排序、分页和统计字段均 PASS。
- `tests/product-web-r3.test.tsx` 现有断言 1 项失败：它要求页面不存在“题库”标题，但当前已完成的复刻页面故意含 Hero 标题。该失败不由本任务改动引入，未为迎合旧断言改变 UI。

## Build

- `pnpm typecheck` — PASS。
- `pnpm build:web` — PASS（仅既有 bundle-size warning）。
- `git diff --check` — pending final commit check。

## Remaining Real Data Debt

- 近期更新卡片仍复用当前结果页，不是独立的“最近更新”查询。
- 最近浏览、待练习、收藏动作、个人未通过筛选、时间/内存/通过率筛选、网格视图均无相应产品契约，继续显式不可用。
- 没有热门/推荐题目或难度分布图模块及契约。
- 迁移标签目录有 81 项，而 in-memory `problemTagSeed` 含额外 `monotonic-queue`；夹具不使用该未迁移 slug，正式目录差异应由独立标签治理任务处理。

PROBLEM LIBRARY COMPLETENESS = PARTIAL

BACKEND SUPPORT = PASS

DEVELOPMENT DATA = PASS

NO PRODUCTION DATA POLLUTION = PASS

TYPECHECK = PASS

BUILD = PASS

MANUAL UI ACCEPTANCE = PENDING USER

MAIN MERGE = NOT PERFORMED
