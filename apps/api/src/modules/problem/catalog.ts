import type { ProblemTag } from './model.js';

export interface TagCatalogRepository {
  list(query?: {
    search?: string;
    activeOnly?: boolean;
  }): Promise<ProblemTag[]>;
  getByIds(ids: number[]): Promise<ProblemTag[]>;
}

export const problemTagSeed: Omit<ProblemTag, 'id'>[] = [
  ['枚举', 'enumeration', '基础算法'],
  ['模拟', 'simulation', '基础算法'],
  ['排序', 'sorting', '基础算法'],
  ['前缀和', 'prefix-sum', '基础算法'],
  ['差分', 'difference-array', '基础算法'],
  ['双指针', 'two-pointers', '基础算法'],
  ['贪心', 'greedy', '基础算法'],
  ['位运算', 'bit-manipulation', '基础算法'],
  ['链表', 'linked-list', '数据结构'],
  ['栈', 'stack', '数据结构'],
  ['队列', 'queue', '数据结构'],
  ['哈希表', 'hash-table', '数据结构'],
  ['堆', 'heap', '数据结构'],
  ['并查集', 'disjoint-set-union', '数据结构'],
  ['单调栈', 'monotonic-stack', '数据结构'],
  ['单调队列', 'monotonic-queue', '数据结构'],
  ['树状数组', 'fenwick-tree', '数据结构'],
  ['线段树', 'segment-tree', '数据结构'],
  ['二分查找', 'binary-search', '搜索'],
  ['DFS', 'depth-first-search', '搜索'],
  ['BFS', 'breadth-first-search', '搜索'],
  ['回溯', 'backtracking', '搜索'],
  ['分治', 'divide-and-conquer', '搜索'],
  ['最短路', 'shortest-path', '图论'],
  ['Dijkstra', 'dijkstra', '图论'],
  ['Floyd', 'floyd', '图论'],
  ['Bellman-Ford', 'bellman-ford', '图论'],
  ['最小生成树', 'minimum-spanning-tree', '图论'],
  ['拓扑排序', 'topological-sort', '图论'],
  ['强连通分量', 'strongly-connected-components', '图论'],
  ['网络流', 'network-flow', '图论'],
  ['二分图', 'bipartite-graph', '图论'],
  ['二分图匹配', 'bipartite-matching', '图论'],
  ['动态规划', 'dynamic-programming', '动态规划'],
  ['背包', 'knapsack', '动态规划'],
  ['线性DP', 'linear-dp', '动态规划'],
  ['区间DP', 'interval-dp', '动态规划'],
  ['树形DP', 'tree-dp', '动态规划'],
  ['状压DP', 'bitmask-dp', '动态规划'],
  ['数位DP', 'digit-dp', '动态规划'],
  ['最长公共子序列', 'longest-common-subsequence', '动态规划'],
  ['最长上升子序列', 'longest-increasing-subsequence', '动态规划'],
  ['字符串匹配', 'string-matching', '字符串'],
  ['KMP', 'kmp', '字符串'],
  ['Trie', 'trie', '字符串'],
  ['AC自动机', 'aho-corasick', '字符串'],
  ['字符串哈希', 'string-hashing', '字符串'],
  ['Manacher', 'manacher', '字符串'],
  ['后缀数组', 'suffix-array', '字符串'],
  ['后缀自动机', 'suffix-automaton', '字符串'],
  ['数论', 'number-theory', '数学'],
  ['组合数学', 'combinatorics', '数学'],
  ['素数', 'prime-numbers', '数学'],
  ['筛法', 'sieve', '数学'],
  ['最大公约数', 'gcd', '数学'],
  ['扩展欧几里得', 'extended-gcd', '数学'],
  ['快速幂', 'fast-exponentiation', '数学'],
  ['逆元', 'modular-inverse', '数学'],
  ['中国剩余定理', 'chinese-remainder-theorem', '数学'],
  ['矩阵', 'matrix', '数学'],
  ['概率与期望', 'probability-expectation', '数学'],
  ['博弈论', 'game-theory', '数学'],
  ['FFT', 'fft', '数学'],
  ['NTT', 'ntt', '数学'],
  ['二叉树', 'binary-tree', '树'],
  ['二叉搜索树', 'binary-search-tree', '树'],
  ['LCA', 'lowest-common-ancestor', '树'],
  ['树链剖分', 'heavy-light-decomposition', '树'],
  ['树上差分', 'tree-difference', '树'],
  ['点分治', 'centroid-decomposition', '树'],
  ['虚树', 'virtual-tree', '树'],
  ['计算几何', 'computational-geometry', '计算几何'],
  ['凸包', 'convex-hull', '计算几何'],
  ['扫描线', 'sweep-line', '计算几何'],
  ['线段相交', 'segment-intersection', '计算几何'],
  ['旋转卡壳', 'rotating-calipers', '计算几何'],
  ['精度处理', 'precision', '计算几何'],
  ['离散化', 'coordinate-compression', '高级技巧'],
  ['分块', 'sqrt-decomposition', '高级技巧'],
  ['莫队', 'mo-algorithm', '高级技巧'],
  ['CDQ分治', 'cdq-divide-and-conquer', '高级技巧'],
  ['整体二分', 'parallel-binary-search', '高级技巧'],
  ['启发式合并', 'small-to-large', '高级技巧'],
  ['线性基', 'linear-basis', '高级技巧'],
  ['容斥原理', 'inclusion-exclusion', '高级技巧'],
].map(([name, slug, category], index) => ({
  name: String(name),
  slug: String(slug),
  category: String(category),
  displayOrder: index,
  isActive: true,
}));

export const inMemoryTagCatalog = problemTagSeed.map((tag, index) => ({
  ...tag,
  id: index + 1,
}));

export class InMemoryTagCatalogRepository implements TagCatalogRepository {
  async list(query: { search?: string; activeOnly?: boolean } = {}) {
    const search = query.search?.toLocaleLowerCase();
    return inMemoryTagCatalog.filter(
      (tag) =>
        (!query.activeOnly || tag.isActive) &&
        (!search ||
          `${tag.name} ${tag.slug} ${tag.category}`
            .toLocaleLowerCase()
            .includes(search)),
    );
  }
  async getByIds(ids: number[]) {
    return inMemoryTagCatalog.filter((tag) => ids.includes(tag.id));
  }
}

export class PostgresTagCatalogRepository implements TagCatalogRepository {
  constructor(
    private readonly pool: {
      query(
        text: string,
        values?: unknown[],
      ): Promise<{ rows: Record<string, unknown>[] }>;
    },
  ) {}
  async list(query: { search?: string; activeOnly?: boolean } = {}) {
    const values: unknown[] = [];
    const clauses = [query.activeOnly === false ? 'TRUE' : 'is_active = TRUE'];
    if (query.search) {
      values.push(`%${query.search}%`);
      clauses.push(
        `(name ILIKE $${values.length} OR slug ILIKE $${values.length} OR category ILIKE $${values.length})`,
      );
    }
    const result = await this.pool.query(
      `SELECT id, slug, name, category, display_order, is_active FROM tags WHERE ${clauses.join(' AND ')} ORDER BY category, display_order, id`,
      values,
    );
    return result.rows.map(mapTag);
  }
  async getByIds(ids: number[]) {
    if (!ids.length) return [];
    const result = await this.pool.query(
      'SELECT id, slug, name, category, display_order, is_active FROM tags WHERE id = ANY($1::bigint[])',
      [ids],
    );
    return result.rows.map(mapTag);
  }
}

const mapTag = (row: Record<string, unknown>): ProblemTag => ({
  id: Number(row.id),
  slug: String(row.slug),
  name: String(row.name ?? row.display_name),
  category: String(row.category ?? '未分类'),
  displayOrder: Number(row.display_order ?? 0),
  isActive: Boolean(row.is_active ?? true),
});
