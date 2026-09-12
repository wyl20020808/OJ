import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (process.env.OJPLATFORM_DEVELOPMENT_FIXTURES !== 'true')
  throw new Error(
    'Set OJPLATFORM_DEVELOPMENT_FIXTURES=true before seeding Problem Library development fixtures.',
  );
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const target = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost', '::1'].includes(target.hostname))
  throw new Error(
    'Problem Library development fixtures may only target a local database.',
  );

const fixtureOwnerId = '00000000-0000-4000-8000-000000000102';
const fixtureOwner = {
  username: 'ojplatform-problem-library-demo',
  email: 'ojplatform-problem-library-demo@example.test',
  displayName: 'OJPlatform Problem Library Fixture',
};

const problems = [
  ['array-dedup', '数组去重与排序', '入门', ['sorting', 'hash-table'], '练习排序与集合去重的基本使用。'],
  ['prefix-sum-range', '静态区间和', '入门', ['prefix-sum'], '用前缀和快速回答多次区间查询。'],
  ['string-palindrome', '回文串判定', '入门', ['two-pointers', 'string-matching'], '判断一个字符串是否左右对称。'],
  ['prime-check', '素数判定', '入门', ['prime-numbers', 'enumeration'], '在平方根范围内完成素数判断。'],
  ['binary-search-first', '第一个满足条件的位置', '入门', ['binary-search'], '练习二分边界和单调条件。'],
  ['grid-bfs-shortest', '网格最短路', '入门', ['breadth-first-search'], '在障碍网格中寻找最少步数。'],
  ['sliding-window-max', '滑动窗口最大值', '简单', ['heap'], '维护窗口内候选值并在线输出答案。'],
  ['merge-intervals', '区间合并', '简单', ['sorting', 'greedy'], '按端点排序后合并重叠区间。'],
  ['linked-list-reverse', '反转链表', '简单', ['linked-list'], '使用迭代指针完成链表翻转。'],
  ['frequency-top-k', '高频元素 Top K', '简单', ['hash-table', 'heap'], '统计频率并选出出现次数最多的元素。'],
  ['knapsack-01', '0/1 背包入门', '简单', ['dynamic-programming', 'knapsack'], '用一维动态规划安排有限容量。'],
  ['gcd-lcm', '最大公约数与最小公倍数', '简单', ['gcd', 'number-theory'], '通过欧几里得算法处理整数关系。'],
  ['tree-level-order', '二叉树层序遍历', '中等', ['binary-tree', 'breadth-first-search'], '按层收集二叉树节点。'],
  ['dijkstra-routing', '单源最短路', '中等', ['shortest-path', 'dijkstra'], '在非负权图上计算最短距离。'],
  ['union-find-connectivity', '动态连通性', '中等', ['disjoint-set-union'], '用并查集维护集合合并与查询。'],
  ['longest-increasing-subsequence', '最长上升子序列', '中等', ['dynamic-programming', 'longest-increasing-subsequence'], '比较 n² DP 与贪心二分优化。'],
  ['kmp-pattern-search', '模式串匹配', '中等', ['string-matching', 'kmp'], '构造失败函数进行线性匹配。'],
  ['topological-schedule', '课程安排', '中等', ['topological-sort', 'breadth-first-search'], '判断依赖关系是否存在环。'],
  ['segment-tree-range', '动态区间查询', '困难', ['segment-tree'], '支持修改与区间聚合查询。'],
  ['network-flow-assignment', '二分匹配分配', '困难', ['network-flow', 'bipartite-matching'], '将匹配问题建模为最大流。'],
  ['tree-path-queries', '树上路径查询', '困难', ['heavy-light-decomposition', 'segment-tree'], '结合树链剖分和线段树回答路径问题。'],
  ['interval-dp-brackets', '区间 DP：括号配对', '困难', ['dynamic-programming', 'interval-dp'], '枚举断点求解区间最优值。'],
  ['suffix-array-repeats', '最长重复子串', '困难', ['suffix-array', 'string-hashing'], '比较后缀排序与哈希判定。'],
  ['convex-hull-perimeter', '凸包周长', '困难', ['computational-geometry', 'convex-hull'], '在平面点集中构造外层边界。'],
  ['centroid-path-count', '树上距离计数', '专家', ['centroid-decomposition', 'tree-difference'], '使用点分治统计满足条件的路径。'],
  ['digit-dp-avoid', '数位 DP：禁用数字', '专家', ['dynamic-programming', 'digit-dp'], '在数位状态中记录前缀限制。'],
  ['min-cost-flow', '最小费用最大流', '专家', ['network-flow', 'shortest-path'], '在容量网络中同时优化流量和代价。'],
  ['mo-queries', '区间离线查询', '专家', ['mo-algorithm'], '按照块排序降低区间移动成本。'],
  ['ntt-convolution', '多项式卷积', '专家', ['ntt', 'fast-exponentiation'], '在模数域中实现快速卷积。'],
  ['virtual-tree-queries', '虚树查询', '专家', ['virtual-tree', 'lowest-common-ancestor'], '压缩关键节点后解决树上查询。'],
];

const fixtureNote = 'DEVELOPMENT FIXTURE / DEMO DATA — 仅用于本地题库视觉与接口验收。';
const requiredTagSlugs = [...new Set(problems.flatMap(([, , , tags]) => tags))];
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query('BEGIN');
  const availableTags = await client.query(
    'SELECT slug FROM tags WHERE slug = ANY($1::text[])',
    [requiredTagSlugs],
  );
  const availableTagSlugs = new Set(availableTags.rows.map((row) => row.slug));
  const missingTagSlugs = requiredTagSlugs.filter(
    (slug) => !availableTagSlugs.has(slug),
  );
  if (missingTagSlugs.length)
    throw new Error(
      `Problem tag catalog is incomplete; apply migrations first. Missing: ${missingTagSlugs.join(', ')}`,
    );

  await client.query(
    `INSERT INTO users(id,username,email,display_name,status)
     VALUES($1,$2,$3,$4,'active')
     ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username,email=EXCLUDED.email,display_name=EXCLUDED.display_name,updated_at=now()`,
    [
      fixtureOwnerId,
      fixtureOwner.username,
      fixtureOwner.email,
      fixtureOwner.displayName,
    ],
  );

  const now = Date.now();
  for (const [index, [slug, title, difficulty, tags, summary]] of problems.entries()) {
    const id = `problem-library-demo-${String(index + 1).padStart(2, '0')}`;
    const createdAt = new Date(now - (problems.length - index) * 24 * 60 * 60 * 1000);
    const updatedAt = new Date(now - index * 6 * 60 * 60 * 1000);
    const provenance = JSON.stringify({
      kind: 'DEVELOPMENT_FIXTURE',
      scenario: 'PROBLEM_LIBRARY_FULL_EXPERIENCE_V1',
      fixture: 'local-only',
    });
    const statement = `${summary} ${fixtureNote}`;
    const result = await client.query(
      `INSERT INTO problems(id,slug,title,background,statement,input_description,output_description,examples,constraints,notes,time_limit_ms,memory_limit_bytes,visibility,difficulty,status,testdata_version,author_id,source_type,provenance,created_at,updated_at)
       VALUES($1,$2,$3,'',$4,'标准输入。','标准输出。','[{"input":"1 2","output":"3"}]'::jsonb,'请根据题目要求完成实现。',$5,1000,268435456,'public',$6,'published',NULL,$7,'TEST_FIXTURE',$8::jsonb,$9,$10)
       ON CONFLICT (id) DO UPDATE SET slug=EXCLUDED.slug,title=EXCLUDED.title,statement=EXCLUDED.statement,notes=EXCLUDED.notes,difficulty=EXCLUDED.difficulty,status='published',visibility='public',source_type='TEST_FIXTURE',provenance=EXCLUDED.provenance,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at
       RETURNING id,public_number,current_revision_id`,
      [
        id,
        slug,
        title,
        statement,
        fixtureNote,
        difficulty,
        fixtureOwnerId,
        provenance,
        createdAt,
        updatedAt,
      ],
    );
    const row = result.rows[0];
    if (!row.current_revision_id) {
      const revisionId = `${id}-revision-1`;
      await client.query(
        `INSERT INTO problem_revisions(id,problem_id,public_number,revision_number,slug,title,background,statement,input_description,output_description,examples,constraints,notes,time_limit_ms,memory_limit_bytes,visibility,difficulty,status,testdata_version,author_id,created_by,provenance,created_at)
         VALUES($1,$2,$3,1,$4,$5,'',$6,'标准输入。','标准输出。','[{"input":"1 2","output":"3"}]'::jsonb,'请根据题目要求完成实现。',$7,1000,268435456,'public',$8,'published',NULL,$9,$9,$10::jsonb,$11)
         ON CONFLICT (id) DO NOTHING`,
        [
          revisionId,
          id,
          row.public_number,
          slug,
          title,
          statement,
          fixtureNote,
          difficulty,
          fixtureOwnerId,
          provenance,
          createdAt,
        ],
      );
      await client.query(
        'UPDATE problems SET current_revision_id=$1 WHERE id=$2',
        [revisionId, id],
      );
    }
    await client.query('DELETE FROM problem_tags WHERE problem_id=$1', [id]);
    await client.query(
      `INSERT INTO problem_tags(problem_id,tag_id)
       SELECT $1,id FROM tags WHERE slug = ANY($2::text[])
       ON CONFLICT DO NOTHING`,
      [id, tags],
    );
  }

  await client.query('COMMIT');
  console.log(
    'PROBLEM LIBRARY DEVELOPMENT FIXTURES SEEDED: 30 TEST_FIXTURE problems, no submissions.',
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
