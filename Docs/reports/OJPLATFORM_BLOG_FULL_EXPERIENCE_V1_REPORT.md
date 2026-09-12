# Blog Full Experience Completion Report

Date: 2026-09-12

Branch: `codex/blog-full-experience-v1`

Feature commit: `4a54cb4 feat: complete Blog data experience`

## Frontend Audit

### BLOG DATA CONTRACT（实施前）

| 模块 | 需要数据 | 当前来源 | 状态 |
| --- | --- | --- | --- |
| 文章列表 | 标题、摘要、作者、时间、互动统计 | Discussion posts API | PARTIAL |
| 公告列表 | 公告类型、标题、摘要、作者、时间 | Discussion posts API | PARTIAL |
| 分类 | 分类名称、计数、筛选值 | 页面静态数组 | STATIC |
| 标签 | 标签名称、计数、筛选值 | 页面静态数组 | STATIC |
| 作者信息 | 用户名、显示名、可选头像 | Discussion author projection | FULLY_SUPPORTED |
| 发布时间 | 发布/更新时间 | Discussion posts API | FULLY_SUPPORTED |
| 阅读/评论/点赞 | 聚合计数、当前用户点赞状态 | Discussion posts API | PARTIAL |
| 封面图片 | 稳定 URL、比例与回退 | 固定 CSS hero / 列表无数据字段 | STATIC |
| 热门文章 | 全局热度排序 | 无 | MISSING_API |
| 推荐文章 | 推荐集合 | 无；首条文章充当精选 | MISSING_API |
| 搜索 | 标题、摘要、分类、标签 | API 仅标题查询 | PARTIAL |
| 分页 | 游标、加载下一页 | API 有 `nextCursor`，UI 未消费 | PARTIAL |
| 文章详情 | 正文、作者、统计、评论 | Discussion detail/comments API | PARTIAL |
| 最近评论 | 全局最新评论 | 首屏前四篇逐篇请求后拼接 | PARTIAL |
| 全局统计/作者榜 | 全站计数与作者文章数 | 当前页前端推导 | PARTIAL |
| loading/error/empty | 可恢复状态 | 前端已有状态组件 | FULLY_SUPPORTED |
| 题解类型 | 显式内容类型 | 标题启发式判断 | MISSING_API |

实施后，列表、公告、分类、标签、作者、时间、统计、封面、热门、推荐、搜索、游标分页、详情和空/错/加载状态均由真实 API 契约支持；页面不再从首屏数据伪造全局侧栏数据。

## Missing Backend Support

实施前缺口：

- 无 Blog overview 聚合 API。
- 无分类、标签及文章关联表。
- 无显式 `DISCUSSION / SOLUTION / ANNOUNCEMENT` kind。
- 无封面、精选、置顶、数据来源字段。
- 搜索不覆盖摘要、正文、分类、标签。
- 列表详情无当前查看者点赞状态；详情刷新会重复增加阅读量。
- 热门、推荐、作者榜、全局统计、最新评论只能由页面局部数据近似生成。

## APIs Added

- 新增 `GET /api/discussion/blog/overview`：精选、热门、推荐、分类、标签、作者榜、全局统计、最新评论。
- `GET /api/discussion/posts` 新增 `kind`、`category`、`tag` 筛选；搜索扩展到标题、摘要、正文、分类和标签。
- 列表/详情 projection 新增 category、tags、cover、featured、pinned、data origin、viewer liked。
- 详情读取支持 `trackView=false`，用于评论/点赞后的无副作用刷新。
- create/update 接口接受受校验的 Blog metadata，未改变认证架构。

## Database Changes

- migration `0033_blog_full_experience` 新增：
  - `discussion_categories`
  - `discussion_tags`
  - `discussion_post_tags`
  - post kind/category/cover/featured/pinned/data_origin
  - comment data_origin
  - 查询索引、外键、约束及 down migration
- migration runner 支持指定迁移名，允许在已有开发库中仅应用 `0033_blog_full_experience`。
- 完整历史迁移重放仍被旧 `judge_artifacts already exists` 状态阻断；指定 `0033` 实际应用成功。

## Development Data Added

- 新增 `pnpm db:seed:blog-development`。
- 固定数据集：5 位开发演示作者、16 篇内容、20 条评论、5 个分类、10 个标签。
- 内容构成：9 篇讨论文章、3 篇题解、4 篇公告。
- 每篇内容均有标题、摘要、作者、发布时间、分类、标签、阅读量、评论/点赞关系和本地封面。
- 脚本可重复运行，按固定 public ID/upsert 写入。

## Fixture Purpose

- 仅用于本地 Blog 页面接口、布局与视觉验收。
- 必须显式设置 `OJPLATFORM_DEVELOPMENT_FIXTURES=true`。
- 数据库主机必须为 localhost/127.0.0.1/::1；非本地地址硬拒绝。
- 所有记录使用 `DEVELOPMENT_FIXTURE` 来源；正文显式显示 `DEVELOPMENT FIXTURE / DEMO DATA`，不伪装生产文章。
- 脚本不接入生产启动、迁移或运行时路径。

## Blog Dataset Summary

- 分类：官方公告、技术分享、算法教程、比赛资讯、社区动态。
- 标签覆盖：Algorithm、Backend、Frontend、Contest、Tutorial 等 10 个标签。
- 本地 API 运行证据：overview 返回 5 分类、10 标签、5 作者、5 条最新评论；列表首屏 8 条且返回下一页游标。
- 当前本地库共返回 22 条已发布内容，包含 16 条明确标记的 Blog demo fixture 与既有开发数据。

## Assets Added

- 未新增远程依赖或不稳定图片 URL。
- fixture 复用仓库内稳定资源 `/blog-mountain-hero.png`。
- 图标继续使用现有内联 SVG；不存在空图标或外部 CDN 依赖。

## UI Problems Fixed

- 卡片 footer 改为可换行 flex；作者、日期、分类、DEMO 标记和统计区不再绝对挤压。
- 统计区设置稳定收缩规则，长日期/作者文本不会覆盖阅读量与评论数。
- 移除造成底部 meta 冲突的固定布局假设。
- 封面使用真实 `<img>`、固定宽高比和 `object-fit: cover`。
- 窄屏下三栏降级、卡片内容/封面堆叠、详情侧栏回流。
- 桌面 1488、平板 900、手机 390 三视口 E2E 均未发现横向溢出或 footer 子元素相交。

## Frontend Fixes

- 页面接入 Blog overview，移除静态分类/标签和首屏派生统计。
- 接入显式内容 kind、分类/标签筛选、8 条游标“加载更多”。
- 接入真实封面、热门文章、推荐/精选、作者榜和最新评论。
- 详情页接入 viewer-like，互动刷新不重复累计阅读量。
- 搜索提示改为实际契约范围；保留 loading/error/empty 可恢复状态。
- fixture 卡片和详情显示 DEMO/DEVELOPMENT FIXTURE 标签。

## Tests

- Focused Discussion/Web：3 files，21 tests，PASS。
- PostgreSQL Discussion integration：2 files，3 tests，PASS。
- Blog runtime E2E：4 tests，PASS。
  - desktop/tablet/mobile feed layout
  - cover load
  - cursor pagination
  - article detail/content/comments
- Targeted changed-file ESLint：PASS。
- `git diff --check`：PASS（提交前重新执行）。
- Repository-wide lint 仍有 9 个与本 Goal 无关的既有错误，涉及 code-run、judge-service、Portal 和 editor declaration；未扩大范围修改。

## Build

- Root typecheck：PASS。
- Web build：PASS（保留既有 >500 kB chunk warning）。
- API build：PASS。
- 隔离运行时 API `3011`、Web `5174`：PASS。
- Runtime Manager 未强停既有 Judge：其 active-job 状态无法确认，按安全规则拒绝 stop。为避免影响既有任务，本 Goal 使用独立 API/Web 端口验证。

## Remaining Real Data Debt

- 收藏、关注、浏览历史仍为明确 `data-ui-only`，未伪造后端状态。
- 题解到 Problem 的持久关系仍未建立；当前详情明确显示“待后端接入”。
- AI 自动摘要仍为界面预览，仅使用文章真实摘要，不宣称 AI 生成。
- 分类/标签已有读取和文章 metadata 写入契约，但独立运营管理 UI 不在本 Goal 范围。
- 人工浏览器视觉验收由用户执行；自动化布局验收不能替代人工验收。

BLOG COMPLETENESS = PASS

BACKEND SUPPORT = PASS

DEVELOPMENT DATA = PASS

UI LAYOUT QUALITY = PASS

NO PRODUCTION DATA POLLUTION = PASS

TYPECHECK = PASS

BUILD = PASS

MANUAL UI ACCEPTANCE = PENDING USER

MAIN MERGE = NOT PERFORMED
