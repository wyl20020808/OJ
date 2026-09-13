import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const cleanOnly = process.argv.includes('--clean');

if (process.env.OJPLATFORM_DEVELOPMENT_FIXTURES !== 'true')
  throw new Error(
    'Set OJPLATFORM_DEVELOPMENT_FIXTURES=true before changing Problem Library development fixtures.',
  );
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const target = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost', '::1'].includes(target.hostname))
  throw new Error(
    'Problem Library development fixtures may only target a local database.',
  );

const scenario = 'PROBLEM_LIBRARY_DATA_SEMANTICS_VISUAL_FIDELITY_V3';
const fixtureViewerId = '00000000-0000-4000-8000-000000000102';
const fixtureAuthorId = '00000000-0000-4000-8000-000000000103';
const fixtureStatisticsOwnerId = '00000000-0000-4000-8000-000000000104';
const fixtureUsers = [
  {
    id: fixtureViewerId,
    username: 'ojplatform-problem-library-demo',
    email: 'ojplatform-problem-library-demo@example.test',
    displayName: 'OJPlatform Problem Library Demo',
  },
  {
    id: fixtureAuthorId,
    username: 'ojplatform-problem-library-author-fixture',
    email: 'ojplatform-problem-library-author-fixture@example.test',
    displayName: 'Problem Library Fixture Author',
  },
  {
    id: fixtureStatisticsOwnerId,
    username: 'ojplatform-problem-library-statistics-fixture',
    email: 'ojplatform-problem-library-statistics-fixture@example.test',
    displayName: 'Problem Library Statistics Fixture',
  },
];

const difficulties = ['入门', '简单', '中等', '困难', '专家'];
const fixtureProblems = [
  [
    'LUOGU',
    'P1000',
    'luogu-a-plus-b',
    'A + B Problem',
    '入门',
    ['simulation', 'enumeration'],
    '读取两个整数并输出它们的和。',
  ],
  [
    'LUOGU',
    'P1048',
    'luogu-herb-picking',
    '采药',
    '入门',
    ['dynamic-programming', 'knapsack'],
    '在有限时间内选择价值最大的药草。',
  ],
  [
    'LUOGU',
    'P1216',
    'luogu-number-triangle',
    '数字三角形',
    '简单',
    ['dynamic-programming', 'linear-dp'],
    '寻找数字三角形自顶向下的最大路径和。',
  ],
  [
    'LUOGU',
    'P3379',
    'luogu-lca-template',
    '最近公共祖先',
    '简单',
    ['lowest-common-ancestor', 'binary-tree'],
    '回答树上多组最近公共祖先查询。',
  ],
  [
    'LUOGU',
    'P1886',
    'luogu-sliding-window',
    '滑动窗口',
    '中等',
    ['monotonic-stack', 'two-pointers'],
    '维护每个固定长度窗口的最小值与最大值。',
  ],
  [
    'LUOGU',
    'P1908',
    'luogu-inversion-count',
    '逆序对',
    '中等',
    ['divide-and-conquer', 'fenwick-tree'],
    '统计序列中逆序对的数量。',
  ],
  [
    'LUOGU',
    'P3811',
    'luogu-modular-inverse',
    '乘法逆元',
    '困难',
    ['modular-inverse', 'number-theory'],
    '在线性时间内求出一段区间的模逆元。',
  ],
  [
    'LUOGU',
    'P4779',
    'luogu-shortest-path',
    '单源最短路径',
    '困难',
    ['shortest-path', 'dijkstra'],
    '计算非负权有向图中的单源最短路。',
  ],
  [
    'LUOGU',
    'P5788',
    'luogu-monotonic-stack',
    '单调栈',
    '专家',
    ['monotonic-stack'],
    '寻找每个位置右侧第一个更大的元素。',
  ],
  [
    'LUOGU',
    'P7913',
    'luogu-bridge-allocation',
    '廊桥分配',
    '专家',
    ['greedy', 'sorting'],
    '合理分配有限廊桥以服务更多航班。',
  ],

  [
    'CODEFORCES',
    'CF1A',
    'codeforces-theatre-square',
    'Theatre Square',
    '入门',
    ['number-theory', 'enumeration'],
    'Count square flagstones needed to cover a rectangle.',
  ],
  [
    'CODEFORCES',
    'CF266B',
    'codeforces-queue-school',
    'Queue at the School',
    '入门',
    ['simulation', 'string-matching'],
    'Simulate students changing positions in a queue.',
  ],
  [
    'CODEFORCES',
    'CF71A',
    'codeforces-long-words',
    'Way Too Long Words',
    '简单',
    ['string-matching'],
    'Abbreviate words that exceed a fixed length.',
  ],
  [
    'CODEFORCES',
    'CF4A',
    'codeforces-watermelon',
    'Watermelon',
    '简单',
    ['number-theory'],
    'Determine whether an even split is possible.',
  ],
  [
    'CODEFORCES',
    'CF580A',
    'codeforces-kefa-first-steps',
    'Kefa and First Steps',
    '中等',
    ['two-pointers'],
    'Find the longest non-decreasing contiguous segment.',
  ],
  [
    'CODEFORCES',
    'CF977C',
    'codeforces-less-or-equal',
    'Less or Equal',
    '中等',
    ['sorting', 'binary-search'],
    'Choose a value satisfying an exact rank constraint.',
  ],
  [
    'CODEFORCES',
    'CF25A',
    'codeforces-iq-test',
    'IQ Test',
    '困难',
    ['enumeration'],
    'Locate the number with different parity.',
  ],
  [
    'CODEFORCES',
    'CF520B',
    'codeforces-two-buttons',
    'Two Buttons',
    '困难',
    ['breadth-first-search', 'greedy'],
    'Reach a target with doubling and decrement operations.',
  ],
  [
    'CODEFORCES',
    'CF166A',
    'codeforces-rank-list',
    'Rank List',
    '专家',
    ['sorting'],
    'Count teams tied with a specified rank.',
  ],
  [
    'CODEFORCES',
    'CF455A',
    'codeforces-boredom',
    'Boredom',
    '专家',
    ['dynamic-programming', 'linear-dp'],
    'Maximize score while removing conflicting values.',
  ],

  [
    'ATCODER',
    'AT_ABC_001_A',
    'atcoder-depth-difference',
    'Depth Difference',
    '入门',
    ['simulation'],
    'Compute the difference between two depth readings.',
  ],
  [
    'ATCODER',
    'AT_ABC_081_A',
    'atcoder-placing-marbles',
    'Placing Marbles',
    '入门',
    ['enumeration', 'string-matching'],
    'Count marked positions in a short binary string.',
  ],
  [
    'ATCODER',
    'AT_ABC_086_A',
    'atcoder-product-parity',
    'Product',
    '简单',
    ['number-theory'],
    'Determine whether a product is odd or even.',
  ],
  [
    'ATCODER',
    'AT_ABC_088_B',
    'atcoder-card-game',
    'Card Game for Two',
    '简单',
    ['greedy', 'sorting'],
    'Alternate selecting cards to maximize score difference.',
  ],
  [
    'ATCODER',
    'AT_ABC_106_B',
    'atcoder-odd-eight-divisors',
    '105',
    '中等',
    ['enumeration', 'number-theory'],
    'Count odd integers having exactly eight divisors.',
  ],
  [
    'ATCODER',
    'AT_ABC_170_C',
    'atcoder-forbidden-list',
    'Forbidden List',
    '中等',
    ['enumeration'],
    'Find the nearest integer outside a forbidden set.',
  ],
  [
    'ATCODER',
    'AT_ABC_184_E',
    'atcoder-third-avenue',
    'Third Avenue',
    '困难',
    ['breadth-first-search', 'shortest-path'],
    'Find a shortest grid route with teleport cells.',
  ],
  [
    'ATCODER',
    'AT_ABC_240_F',
    'atcoder-shift-inversions',
    'Shift and Inversions',
    '困难',
    ['fenwick-tree', 'coordinate-compression'],
    'Maintain inversion information under cyclic shifts.',
  ],
  [
    'ATCODER',
    'AT_DP_G',
    'atcoder-longest-path',
    'Longest Path',
    '专家',
    ['dynamic-programming', 'topological-sort'],
    'Find the longest path in a directed acyclic graph.',
  ],
  [
    'ATCODER',
    'AT_DP_V',
    'atcoder-subtree',
    'Subtree',
    '专家',
    ['tree-dp', 'dynamic-programming'],
    'Aggregate connected subtree counts for every root.',
  ],

  [
    'LEETCODE',
    'LC_0001',
    'leetcode-two-sum',
    'Two Sum',
    '入门',
    ['hash-table'],
    'Find two indices whose values sum to a target.',
  ],
  [
    'LEETCODE',
    'LC_0020',
    'leetcode-valid-parentheses',
    'Valid Parentheses',
    '入门',
    ['stack', 'string-matching'],
    'Validate whether brackets are correctly nested.',
  ],
  [
    'LEETCODE',
    'LC_0021',
    'leetcode-merge-lists',
    'Merge Two Sorted Lists',
    '简单',
    ['linked-list'],
    'Merge two increasing linked lists.',
  ],
  [
    'LEETCODE',
    'LC_0053',
    'leetcode-maximum-subarray',
    'Maximum Subarray',
    '简单',
    ['dynamic-programming', 'linear-dp'],
    'Find the contiguous subarray with maximum sum.',
  ],
  [
    'LEETCODE',
    'LC_0076',
    'leetcode-minimum-window',
    'Minimum Window Substring',
    '中等',
    ['two-pointers', 'hash-table'],
    'Find the shortest window covering required characters.',
  ],
  [
    'LEETCODE',
    'LC_0200',
    'leetcode-number-islands',
    'Number of Islands',
    '中等',
    ['depth-first-search', 'breadth-first-search'],
    'Count connected land components in a grid.',
  ],
  [
    'LEETCODE',
    'LC_0215',
    'leetcode-kth-largest',
    'Kth Largest Element',
    '困难',
    ['heap', 'sorting'],
    'Select the kth largest value from an unsorted array.',
  ],
  [
    'LEETCODE',
    'LC_0300',
    'leetcode-longest-increasing',
    'Longest Increasing Subsequence',
    '困难',
    ['longest-increasing-subsequence', 'binary-search'],
    'Compute the longest strictly increasing subsequence.',
  ],
  [
    'LEETCODE',
    'LC_0685',
    'leetcode-redundant-directed',
    'Redundant Connection II',
    '专家',
    ['disjoint-set-union', 'bipartite-graph'],
    'Remove one edge to restore a rooted tree.',
  ],
  [
    'LEETCODE',
    'LC_0847',
    'leetcode-shortest-all-nodes',
    'Shortest Path Visiting All Nodes',
    '专家',
    ['bitmask-dp', 'breadth-first-search'],
    'Visit every graph node using the fewest edges.',
  ],

  [
    'ACWING',
    'ACW_0789',
    'acwing-number-range',
    '数的范围',
    '入门',
    ['binary-search'],
    '查询目标值在有序数组中的起止位置。',
  ],
  [
    'ACWING',
    'ACW_0791',
    'acwing-high-precision-add',
    '高精度加法',
    '入门',
    ['simulation', 'number-theory'],
    '模拟十进制大整数加法。',
  ],
  [
    'ACWING',
    'ACW_0795',
    'acwing-prefix-sum',
    '前缀和',
    '简单',
    ['prefix-sum'],
    '预处理前缀和回答区间求和。',
  ],
  [
    'ACWING',
    'ACW_0836',
    'acwing-union-find',
    '合并集合',
    '简单',
    ['disjoint-set-union'],
    '维护集合合并与连通性查询。',
  ],
  [
    'ACWING',
    'ACW_0847',
    'acwing-graph-layers',
    '图中点的层次',
    '中等',
    ['breadth-first-search', 'shortest-path'],
    '求无权有向图起点到终点的最短距离。',
  ],
  [
    'ACWING',
    'ACW_0895',
    'acwing-lcs',
    '最长上升子序列',
    '中等',
    ['longest-increasing-subsequence', 'dynamic-programming'],
    '用动态规划求最长上升子序列。',
  ],
  [
    'ACWING',
    'ACW_0899',
    'acwing-edit-distance',
    '编辑距离',
    '困难',
    ['dynamic-programming', 'linear-dp'],
    '计算两个字符串之间的最少编辑次数。',
  ],
  [
    'ACWING',
    'ACW_0901',
    'acwing-skiing',
    '滑雪',
    '困难',
    ['dynamic-programming', 'depth-first-search'],
    '在高度矩阵中寻找最长下降路径。',
  ],
  [
    'ACWING',
    'ACW_1171',
    'acwing-distance',
    '距离',
    '专家',
    ['lowest-common-ancestor', 'tree-difference'],
    '回答树上两点之间的距离。',
  ],
  [
    'ACWING',
    'ACW_2175',
    'acwing-flying-pilot',
    '飞行员配对方案问题',
    '专家',
    ['bipartite-matching', 'network-flow'],
    '求二分图最大匹配及配对方案。',
  ],

  [
    'SPOJ',
    'SPOJ_TEST',
    'spoj-life-universe',
    'Life, the Universe, and Everything',
    '入门',
    ['simulation'],
    'Echo values until the sentinel is encountered.',
  ],
  [
    'SPOJ',
    'SPOJ_PRIME1',
    'spoj-prime-generator',
    'Prime Generator',
    '入门',
    ['prime-numbers', 'sieve'],
    'Generate primes inside several integer intervals.',
  ],
  [
    'SPOJ',
    'SPOJ_FCTRL',
    'spoj-factorial-zeroes',
    'Small Factorials',
    '简单',
    ['number-theory'],
    'Count trailing zeroes in factorial values.',
  ],
  [
    'SPOJ',
    'SPOJ_HORRIBLE',
    'spoj-horrible-queries',
    'Horrible Queries',
    '简单',
    ['segment-tree', 'fenwick-tree'],
    'Support range addition and range sum queries.',
  ],
  [
    'SPOJ',
    'SPOJ_NHAY',
    'spoj-needle-haystack',
    'A Needle in the Haystack',
    '中等',
    ['string-matching', 'kmp'],
    'Find all occurrences of a pattern in text.',
  ],
  [
    'SPOJ',
    'SPOJ_PALIN',
    'spoj-next-palindrome',
    'The Next Palindrome',
    '中等',
    ['string-matching', 'two-pointers'],
    'Find the smallest palindrome larger than a number.',
  ],
  [
    'SPOJ',
    'SPOJ_GSS1',
    'spoj-can-you-answer',
    'Can You Answer These Queries I',
    '困难',
    ['segment-tree', 'divide-and-conquer'],
    'Answer maximum subarray queries over fixed data.',
  ],
  [
    'SPOJ',
    'SPOJ_QTREE',
    'spoj-query-tree',
    'Query on a Tree',
    '困难',
    ['heavy-light-decomposition', 'segment-tree'],
    'Update edges and query maximum values on tree paths.',
  ],
  [
    'SPOJ',
    'SPOJ_ADAAPHID',
    'spoj-persistent-range',
    'Ada and Aphids',
    '专家',
    ['fenwick-tree', 'coordinate-compression'],
    'Process historical range information efficiently.',
  ],
  [
    'SPOJ',
    'SPOJ_COT',
    'spoj-count-tree',
    'Count on a Tree',
    '专家',
    ['heavy-light-decomposition', 'binary-search'],
    'Answer kth-value queries along tree paths.',
  ],

  [
    'OTHER',
    'OJ_1001',
    'other-palindrome-check',
    'Palindrome Check · 回文判定',
    '入门',
    ['string-matching', 'two-pointers'],
    '判断字符串是否为回文串。',
  ],
  [
    'OTHER',
    'OJ_1002',
    'other-range-sum',
    'Range Sum Query · 区间求和',
    '入门',
    ['prefix-sum'],
    '回答静态数组上的多次区间求和。',
  ],
  [
    'OTHER',
    'OJ_1101',
    'other-maze-exit',
    '迷宫出口',
    '简单',
    ['breadth-first-search'],
    '在障碍迷宫中寻找最短逃生路线。',
  ],
  [
    'OTHER',
    'OJ_1102',
    'other-schedule-greedy',
    '活动安排',
    '简单',
    ['greedy', 'sorting'],
    '选择最多互不冲突的活动。',
  ],
  [
    'OTHER',
    'OJ_1201',
    'other-course-schedule',
    'Course Schedule · 课程安排',
    '中等',
    ['topological-sort', 'depth-first-search'],
    '判断课程依赖是否形成有向环。',
  ],
  [
    'OTHER',
    'OJ_1202',
    'other-trie-dictionary',
    'Prefix Dictionary · 前缀词典',
    '中等',
    ['trie', 'string-matching'],
    '维护单词集合并回答前缀查询。',
  ],
  [
    'OTHER',
    'OJ_1301',
    'other-convex-perimeter',
    'Convex Hull Perimeter · 凸包周长',
    '困难',
    ['computational-geometry', 'convex-hull'],
    '求平面点集外层凸包的周长。',
  ],
  [
    'OTHER',
    'OJ_1302',
    'other-interval-dp',
    'Bracket Merge · 括号合并',
    '困难',
    ['interval-dp', 'dynamic-programming'],
    '通过区间动态规划求最少补全次数。',
  ],
  [
    'OTHER',
    'OJ_1401',
    'other-polynomial-convolution',
    'Polynomial Convolution · 多项式卷积',
    '专家',
    ['ntt', 'fast-exponentiation'],
    '在模数域中快速计算多项式乘积。',
  ],
  [
    'OTHER',
    'OJ_1402',
    'other-min-cost-flow',
    'Minimum Cost Flow · 最小费用流',
    '专家',
    ['network-flow', 'shortest-path'],
    '在容量限制下同时优化流量与费用。',
  ],
];

const fixtureNote =
  'DEVELOPMENT FIXTURE / DEMO DATA — 仅用于本地题库数据语义、视觉与接口验收，不代表第三方平台同步结果。';
const requiredTagSlugs = [
  ...new Set(fixtureProblems.flatMap(([, , , , , tags]) => tags)),
];
const fixtureProblemIds = fixtureProblems.map(
  (_, index) => `problem-library-demo-${String(index + 1).padStart(2, '0')}`,
);
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const deleteFixtureSubmissions = async () => {
  await client.query(
    `DELETE FROM submissions
     WHERE id LIKE 'problem-library-demo-%-submission-%'
        OR id LIKE 'problem-library-viewer-submission-%'`,
  );
};

try {
  await client.query('BEGIN');

  if (cleanOnly) {
    await deleteFixtureSubmissions();
    await client.query(
      'DELETE FROM problem_favorites WHERE user_id = ANY($1::uuid[])',
      [[fixtureViewerId, fixtureAuthorId, fixtureStatisticsOwnerId]],
    );
    await client.query(
      `DELETE FROM problems
       WHERE id LIKE 'problem-library-demo-%'
         AND provenance->>'kind'='DEVELOPMENT_FIXTURE'
         AND provenance->>'scenario' IN ($1, 'PROBLEM_LIBRARY_FULL_EXPERIENCE_V2')`,
      [scenario],
    );
    await client.query('COMMIT');
    console.log('PROBLEM LIBRARY DEVELOPMENT FIXTURES CLEANED.');
    await client.end();
    process.exit(0);
  }

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

  for (const user of fixtureUsers)
    await client.query(
      `INSERT INTO users(id,username,email,display_name,status)
       VALUES($1,$2,$3,$4,'active')
       ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username,email=EXCLUDED.email,display_name=EXCLUDED.display_name,updated_at=now()`,
      [user.id, user.username, user.email, user.displayName],
    );

  await deleteFixtureSubmissions();
  await client.query('DELETE FROM problem_favorites WHERE user_id=$1', [
    fixtureViewerId,
  ]);

  const anchor = Date.parse('2026-09-13T08:00:00.000Z');
  const problemRows = [];
  for (const [
    index,
    [provider, providerProblemId, slug, title, difficulty, tags, summary],
  ] of fixtureProblems.entries()) {
    const id = fixtureProblemIds[index];
    const createdAt = new Date(
      anchor - (fixtureProblems.length - index) * 86_400_000,
    );
    const updatedAt = new Date(anchor - index * 14_400_000);
    const provenance = JSON.stringify({
      kind: 'DEVELOPMENT_FIXTURE',
      scenario,
      fixture: 'local-only',
      declaredProvider: provider,
      synchronized: false,
    });
    const statement = `${summary} ${fixtureNote}`;
    const result = await client.query(
      `INSERT INTO problems(id,slug,title,background,statement,input_description,output_description,examples,constraints,notes,time_limit_ms,memory_limit_bytes,visibility,difficulty,status,testdata_version,author_id,source_type,provider,provider_problem_id,provenance,created_at,updated_at)
       VALUES($1,$2,$3,'',$4,'标准输入。','标准输出。','[{"input":"1 2","output":"3"}]'::jsonb,'请根据题目要求完成实现。',$5,1000,268435456,'public',$6,'published',NULL,$7,'TEST_FIXTURE',$8,$9,$10::jsonb,$11,$12)
       ON CONFLICT (id) DO UPDATE SET slug=EXCLUDED.slug,title=EXCLUDED.title,statement=EXCLUDED.statement,notes=EXCLUDED.notes,difficulty=EXCLUDED.difficulty,status='published',visibility='public',author_id=EXCLUDED.author_id,source_type='TEST_FIXTURE',provider=EXCLUDED.provider,provider_problem_id=EXCLUDED.provider_problem_id,provenance=EXCLUDED.provenance,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at
       RETURNING id,public_number,current_revision_id`,
      [
        id,
        slug,
        title,
        statement,
        fixtureNote,
        difficulty,
        fixtureAuthorId,
        provider,
        providerProblemId,
        provenance,
        createdAt,
        updatedAt,
      ],
    );
    const row = result.rows[0];
    const revisionId = row.current_revision_id ?? `${id}-revision-1`;
    await client.query(
      `INSERT INTO problem_revisions(id,problem_id,public_number,revision_number,slug,title,background,statement,input_description,output_description,examples,constraints,notes,time_limit_ms,memory_limit_bytes,visibility,difficulty,status,testdata_version,author_id,created_by,source_type,provider,provider_problem_id,provenance,created_at)
       VALUES($1,$2,$3,1,$4,$5,'',$6,'标准输入。','标准输出。','[{"input":"1 2","output":"3"}]'::jsonb,'请根据题目要求完成实现。',$7,1000,268435456,'public',$8,'published',NULL,$9,$9,'TEST_FIXTURE',$10,$11,$12::jsonb,$13)
       ON CONFLICT (id) DO UPDATE SET slug=EXCLUDED.slug,title=EXCLUDED.title,statement=EXCLUDED.statement,notes=EXCLUDED.notes,difficulty=EXCLUDED.difficulty,status='published',visibility='public',author_id=EXCLUDED.author_id,created_by=EXCLUDED.created_by,source_type='TEST_FIXTURE',provider=EXCLUDED.provider,provider_problem_id=EXCLUDED.provider_problem_id,provenance=EXCLUDED.provenance,created_at=EXCLUDED.created_at`,
      [
        revisionId,
        id,
        row.public_number,
        slug,
        title,
        statement,
        fixtureNote,
        difficulty,
        fixtureAuthorId,
        provider,
        providerProblemId,
        provenance,
        createdAt,
      ],
    );
    await client.query(
      'UPDATE problems SET current_revision_id=$1 WHERE id=$2',
      [revisionId, id],
    );
    await client.query('DELETE FROM problem_tags WHERE problem_id=$1', [id]);
    await client.query(
      `INSERT INTO problem_tags(problem_id,tag_id)
       SELECT $1,id FROM tags WHERE slug = ANY($2::text[])
       ON CONFLICT DO NOTHING`,
      [id, tags],
    );

    const submissionCount = 240 + ((index * 137) % 1_100);
    const difficultyIndex = difficulties.indexOf(difficulty);
    const acceptanceBase = [88, 76, 60, 43, 27][difficultyIndex];
    const acceptanceRate = acceptanceBase - (index % 6);
    const acceptedCount = Math.floor((submissionCount * acceptanceRate) / 100);
    await client.query(
      `INSERT INTO submissions(id,owner_user_id,problem_id,problem_revision_id,testdata_version_ref,language_id,source,status,created_at,updated_at)
       SELECT $1 || '-submission-' || lpad(series::text,4,'0'),$2,$1,$3,'development-fixture-v3','cpp20-gcc-13-v1','// PROBLEM LIBRARY V3 DEVELOPMENT FIXTURE','QUEUED',$4::timestamptz + make_interval(mins => series),$4::timestamptz + make_interval(mins => series)
       FROM generate_series(1,$5::int) AS series`,
      [id, fixtureStatisticsOwnerId, revisionId, createdAt, submissionCount],
    );
    await client.query(
      `INSERT INTO submission_evaluations(submission_id,evaluation_generation,attempt_generation,judge_job_id,verdict_record_digest,evaluation_record_digest,status,verdict,current,detail,created_at,updated_at,completed_at)
       SELECT s.id,1,0,'development-fixture-' || s.id,md5('verdict-' || s.id),md5('evaluation-' || s.id),'COMPLETED_WITH_VERDICT',CASE WHEN series <= $2::int THEN 'AC' ELSE 'WA' END,TRUE,jsonb_build_object('fixture',$3::text,'localOnly',true),s.created_at,s.updated_at,s.updated_at
       FROM generate_series(1,$4::int) AS series
       JOIN submissions s ON s.id=$1 || '-submission-' || lpad(series::text,4,'0')`,
      [id, acceptedCount, scenario, submissionCount],
    );
    problemRows.push({ id, revisionId, updatedAt });
  }

  for (const [index, problem] of problemRows.slice(0, 34).entries()) {
    const attempts = 2 + (index % 4);
    const submissionPrefix = `problem-library-viewer-submission-${String(index + 1).padStart(2, '0')}`;
    await client.query(
      `INSERT INTO submissions(id,owner_user_id,problem_id,problem_revision_id,testdata_version_ref,language_id,source,status,created_at,updated_at)
       SELECT $1 || '-' || lpad(series::text,2,'0'),$2,$3,$4,'development-fixture-v3','cpp20-gcc-13-v1','// PROBLEM LIBRARY V3 DEMO VIEWER FIXTURE','QUEUED',$5::timestamptz + make_interval(mins => series),$5::timestamptz + make_interval(mins => series)
       FROM generate_series(1,$6::int) AS series`,
      [
        submissionPrefix,
        fixtureViewerId,
        problem.id,
        problem.revisionId,
        problem.updatedAt,
        attempts,
      ],
    );
    await client.query(
      `INSERT INTO submission_evaluations(submission_id,evaluation_generation,attempt_generation,judge_job_id,verdict_record_digest,evaluation_record_digest,status,verdict,current,detail,created_at,updated_at,completed_at)
       SELECT s.id,1,0,'development-fixture-' || s.id,md5('verdict-' || s.id),md5('evaluation-' || s.id),'COMPLETED_WITH_VERDICT',CASE WHEN series=$2::int THEN 'AC' ELSE 'WA' END,TRUE,jsonb_build_object('fixture',$3::text,'viewer',true),s.created_at,s.updated_at,s.updated_at
       FROM generate_series(1,$2::int) AS series
       JOIN submissions s ON s.id=$1 || '-' || lpad(series::text,2,'0')`,
      [submissionPrefix, attempts, scenario],
    );
  }

  await client.query(
    `INSERT INTO problem_favorites(user_id,problem_id,created_at)
     SELECT $1,fixture.id,$2::timestamptz - make_interval(days => fixture.ordinal::int)
     FROM unnest($3::text[]) WITH ORDINALITY AS fixture(id,ordinal)
     ON CONFLICT DO NOTHING`,
    [fixtureViewerId, new Date(anchor), fixtureProblemIds.slice(0, 18)],
  );

  await client.query('COMMIT');
  console.log(
    `PROBLEM LIBRARY DEVELOPMENT FIXTURES SEEDED: ${fixtureProblems.length} public problems, 7 providers, 5 difficulties, deterministic submissions, demo viewer profile.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
