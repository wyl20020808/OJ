# Problem Tag Catalog V1 Proposal

Status: proposal only. No migration or seed was executed by the read-only audit.

## Target schema

```sql
tags (
  id bigint primary key,
  slug text unique not null,
  name text not null,
  category text not null,
  display_order integer not null default 0,
  is_active boolean not null default true
)

problem_tags (
  problem_id text not null references problems(id),
  tag_id bigint not null references tags(id),
  primary key (problem_id, tag_id)
)
```

Recommended constraints: lowercase kebab-case `slug`; unique `(category, name)`; bounded name/slug length; stable IDs; inactive tags remain readable on historical problems but cannot be newly selected. Add indexes on `problem_tags(tag_id, problem_id)` and `problem_tags(problem_id, tag_id)`, plus `tags(category, display_order, id)`.

## Seed proposal

| name | slug | category |
|---|---|---|
| 枚举 | enumeration | 基础算法 |
| 模拟 | simulation | 基础算法 |
| 排序 | sorting | 基础算法 |
| 前缀和 | prefix-sum | 基础算法 |
| 差分 | difference-array | 基础算法 |
| 双指针 | two-pointers | 基础算法 |
| 贪心 | greedy | 基础算法 |
| 位运算 | bit-manipulation | 基础算法 |
| 链表 | linked-list | 数据结构 |
| 栈 | stack | 数据结构 |
| 队列 | queue | 数据结构 |
| 哈希表 | hash-table | 数据结构 |
| 堆 | heap | 数据结构 |
| 并查集 | disjoint-set-union | 数据结构 |
| 单调栈 | monotonic-stack | 数据结构 |
| 单调队列 | monotonic-queue | 数据结构 |
| 二分查找 | binary-search | 搜索 |
| 深度优先搜索 | depth-first-search | 搜索 |
| 广度优先搜索 | breadth-first-search | 搜索 |
| 回溯 | backtracking | 搜索 |
| 分治 | divide-and-conquer | 搜索 |
| 最短路 | shortest-path | 图论 |
| 最小生成树 | minimum-spanning-tree | 图论 |
| 拓扑排序 | topological-sort | 图论 |
| 强连通分量 | strongly-connected-components | 图论 |
| 网络流 | network-flow | 图论 |
| 二分图 | bipartite-graph | 图论 |
| 动态规划 | dynamic-programming | 动态规划 |
| 背包 | knapsack | 动态规划 |
| 区间动态规划 | interval-dp | 动态规划 |
| 树形动态规划 | tree-dp | 动态规划 |
| 状态压缩动态规划 | bitmask-dp | 动态规划 |
| 最长公共子序列 | longest-common-subsequence | 动态规划 |
| 字符串匹配 | string-matching | 字符串 |
| 字典树 | trie | 字符串 |
| 哈希 | string-hashing | 字符串 |
| 最小表示法 | minimum-representation | 字符串 |
| 正则表达式 | regular-expression | 字符串 |
| 数论 | number-theory | 数学 |
| 组合数学 | combinatorics | 数学 |
| 素数 | prime-numbers | 数学 |
| 最大公约数 | gcd | 数学 |
| 快速幂 | fast-exponentiation | 数学 |
| 概率与期望 | probability-expectation | 数学 |
| 二叉树 | binary-tree | 树 |
| 二叉搜索树 | binary-search-tree | 树 |
| 树状数组 | fenwick-tree | 树 |
| 线段树 | segment-tree | 树 |
| 最近公共祖先 | lowest-common-ancestor | 树 |
| 树上差分 | tree-difference | 树 |
| 计算几何 | computational-geometry | 计算几何 |
| 凸包 | convex-hull | 计算几何 |
| 扫描线 | sweep-line | 计算几何 |
| 线段相交 | segment-intersection | 计算几何 |
| 精度处理 | precision | 计算几何 |
| 离散化 | coordinate-compression | 高级技巧 |
| 扫描线技巧 | sweep-line-technique | 高级技巧 |
| 分块 | sqrt-decomposition | 高级技巧 |
| 莫队算法 | mo-algorithm | 高级技巧 |
| 线性基 | linear-basis | 高级技巧 |
| 快速傅里叶变换 | fast-fourier-transform | 高级技巧 |
| 容斥原理 | inclusion-exclusion | 高级技巧 |

## API migration shape

Keep a compatibility boundary during migration:

1. Backfill one catalog row per distinct current `tags.normalized_key`, preserving display text as `name`; generate reviewed slugs, categories, and order in a separate mapping artifact.
2. Keep `problem_tags` links by tag ID. Do not infer category from free text.
3. Continue accepting legacy `tags: string[]` for one compatibility window. Normalize each input to catalog `tagId`/slug; reject unknown or inactive tags with a typed validation error.
4. Return a richer read projection (`id`, `slug`, `name`, `category`, `displayOrder`) while optionally retaining `tags` string names until Web clients migrate.
5. Create/edit UI should query an active catalog endpoint and submit selected IDs or slugs, with searchable multi-select and deterministic display ordering.

This requires a formal migration and API contract versioning review. Existing free-form values that cannot be mapped must be retained in an exception report and remain visible through a legacy compatibility path; never silently drop them.
