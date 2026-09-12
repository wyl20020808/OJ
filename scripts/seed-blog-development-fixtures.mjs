import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (process.env.OJPLATFORM_DEVELOPMENT_FIXTURES !== 'true')
  throw new Error(
    'Set OJPLATFORM_DEVELOPMENT_FIXTURES=true before seeding Blog development fixtures.',
  );
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const target = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost', '::1'].includes(target.hostname))
  throw new Error(
    'Blog development fixtures may only target a local database.',
  );

const fixtureUsers = [
  [
    '00000000-0000-4000-8000-000000000301',
    'blog-demo-starlight',
    '开发演示 · 星河漫游者',
  ],
  [
    '00000000-0000-4000-8000-000000000302',
    'blog-demo-code',
    '开发演示 · CodeWithMe',
  ],
  [
    '00000000-0000-4000-8000-000000000303',
    'blog-demo-traveler',
    '开发演示 · 算法旅人',
  ],
  [
    '00000000-0000-4000-8000-000000000304',
    'blog-demo-dream',
    '开发演示 · DreamChaser',
  ],
  [
    '00000000-0000-4000-8000-000000000305',
    'blog-demo-stream',
    '开发演示 · 静水流深',
  ],
];

const categories = [
  ['official-announcement', '官方公告', '平台更新、维护和重要通知', 10],
  ['technical-sharing', '技术分享', '工程实践与平台技术记录', 20],
  ['algorithm-tutorial', '算法教程', '算法、数据结构与题解', 30],
  ['contest-news', '比赛资讯', '比赛预告、复盘与训练安排', 40],
  ['community-news', '社区动态', '社区故事、学习方法与成长记录', 50],
];

const tags = [
  ['algorithm', 'Algorithm', 10],
  ['backend', 'Backend', 20],
  ['frontend', 'Frontend', 30],
  ['contest', 'Contest', 40],
  ['tutorial', 'Tutorial', 50],
  ['database', 'Database', 60],
  ['cpp', 'C++', 70],
  ['dynamic-programming', 'DP', 80],
  ['graph', 'Graph', 90],
  ['community', 'Community', 100],
];

const fixtureNotice =
  '> **DEVELOPMENT FIXTURE / DEMO DATA** — 本文仅用于本地 Blog 页面视觉与接口验收，不代表生产站点内容。';
const body = (title, focus, code = false) => `${fixtureNotice}

# ${title}

${focus}。这篇开发演示文章围绕 OJ 平台学习场景展开，内容结构、段落长度和互动数据用于验证真实页面布局。

## 核心思路

先明确目标和约束，再把问题拆成可验证的小步骤。每一步都保留输入、输出和边界条件，方便读者复现与讨论。

## 实践建议

1. 从最小样例开始验证。
2. 记录复杂度和失败案例。
3. 在评论区说明不同方案的取舍。
${
  code
    ? '\n## 代码片段\n\n```cpp\n#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  ios::sync_with_stdio(false);\n  cin.tie(nullptr);\n  return 0;\n}\n```\n'
    : ''
}
## 小结

持续复盘比一次写出完美答案更重要。欢迎补充你的实现和观察。`;

const posts = [
  {
    publicId: 'blog-demo-why-algorithms',
    author: 0,
    kind: 'DISCUSSION',
    category: 'community-news',
    title: '为什么我们仍然热爱算法？',
    summary: '是挑战，是成长，也是一次次看见更好的自己。',
    tags: ['algorithm', 'community'],
    daysAgo: 0.08,
    views: 12640,
    featured: true,
    pinned: false,
  },
  {
    publicId: 'blog-demo-growth-roadmap',
    author: 1,
    kind: 'DISCUSSION',
    category: 'community-news',
    title: '从新手到省选：我的一年 OJ 成长之路',
    summary:
      '记录训练节奏、错题复盘和比赛心态，给刚开始刷题的同学一份可执行路线。',
    tags: ['algorithm', 'tutorial', 'community'],
    daysAgo: 0.3,
    views: 8420,
    pinned: true,
  },
  {
    publicId: 'blog-demo-resource-list',
    author: 0,
    kind: 'DISCUSSION',
    category: 'technical-sharing',
    title: '算法学习资源大汇总：从基础到进阶',
    summary: '整理在线题库、经典书籍、视频课程与可持续执行的训练方式。',
    tags: ['algorithm', 'tutorial'],
    daysAgo: 0.8,
    views: 12100,
    pinned: true,
  },
  {
    publicId: 'blog-demo-dijkstra-solution',
    author: 2,
    kind: 'SOLUTION',
    category: 'algorithm-tutorial',
    title: '【题解】单源最短路：Dijkstra 的正确打开方式',
    summary: '从松弛操作到优先队列优化，梳理最容易写错的三个边界。',
    tags: ['algorithm', 'tutorial', 'graph', 'cpp'],
    daysAgo: 1.2,
    views: 4380,
  },
  {
    publicId: 'blog-demo-judge-queue',
    author: 1,
    kind: 'DISCUSSION',
    category: 'technical-sharing',
    title: '一次 Judge 队列延迟排查记录',
    summary: '从请求链路、重试幂等和运行指标出发，定位评测任务等待时间异常。',
    tags: ['backend', 'database'],
    daysAgo: 1.8,
    views: 3260,
  },
  {
    publicId: 'blog-demo-frontend-contract',
    author: 3,
    kind: 'DISCUSSION',
    category: 'technical-sharing',
    title: '前端如何与 API 数据契约保持同步',
    summary: '用明确类型、边界校验和加载状态减少页面中的隐式假设。',
    tags: ['frontend', 'backend', 'tutorial'],
    daysAgo: 2.4,
    views: 2910,
  },
  {
    publicId: 'blog-demo-autumn-contest',
    author: 4,
    kind: 'ANNOUNCEMENT',
    category: 'official-announcement',
    title: '秋季训练赛安排与报名说明',
    summary: '本地开发演示公告：展示比赛时间、参与方式和赛后复盘安排。',
    tags: ['contest'],
    daysAgo: 2.9,
    views: 5100,
    pinned: true,
  },
  {
    publicId: 'blog-demo-weekly-contest-review',
    author: 2,
    kind: 'DISCUSSION',
    category: 'contest-news',
    title: '周赛复盘：如何在压力下分配做题时间',
    summary: '回顾读题顺序、罚时控制和卡题后的止损策略。',
    tags: ['contest', 'community'],
    daysAgo: 3.5,
    views: 3760,
  },
  {
    publicId: 'blog-demo-dp-solution',
    author: 3,
    kind: 'SOLUTION',
    category: 'algorithm-tutorial',
    title: '【题解】0/1 背包：从二维状态到滚动数组',
    summary: '解释状态压缩为什么必须倒序枚举，并给出可验证的反例。',
    tags: ['algorithm', 'tutorial', 'dynamic-programming', 'cpp'],
    daysAgo: 4.2,
    views: 6890,
  },
  {
    publicId: 'blog-demo-database-index',
    author: 1,
    kind: 'DISCUSSION',
    category: 'technical-sharing',
    title: '博客列表查询中的索引与游标分页',
    summary: '讨论稳定排序、复合索引和高并发列表读取的工程取舍。',
    tags: ['backend', 'database'],
    daysAgo: 5.1,
    views: 2470,
  },
  {
    publicId: 'blog-demo-community-monthly',
    author: 4,
    kind: 'ANNOUNCEMENT',
    category: 'official-announcement',
    title: '社区月度内容征集开始',
    summary: '本地开发演示公告：欢迎投稿题解、训练总结和平台技术实践。',
    tags: ['community'],
    daysAgo: 6.2,
    views: 1950,
  },
  {
    publicId: 'blog-demo-union-find-solution',
    author: 0,
    kind: 'SOLUTION',
    category: 'algorithm-tutorial',
    title: '【题解】并查集：从连通性到路径压缩',
    summary: '用三个例子理解集合合并、按秩优化和均摊复杂度。',
    tags: ['algorithm', 'tutorial', 'cpp'],
    daysAgo: 8.4,
    views: 5320,
  },
  {
    publicId: 'blog-demo-cpp-performance',
    author: 2,
    kind: 'DISCUSSION',
    category: 'technical-sharing',
    title: '竞赛 C++ 中值得保留的性能习惯',
    summary: '从输入输出、容器选择到内存布局，整理不牺牲可读性的优化。',
    tags: ['cpp', 'contest', 'tutorial'],
    daysAgo: 11.7,
    views: 4180,
  },
  {
    publicId: 'blog-demo-creator-guide',
    author: 3,
    kind: 'ANNOUNCEMENT',
    category: 'official-announcement',
    title: 'Blog 创作指南与内容规范',
    summary: '本地开发演示公告：说明标题、摘要、代码块和引用资料的推荐写法。',
    tags: ['tutorial', 'community'],
    daysAgo: 15.3,
    views: 2800,
  },
  {
    publicId: 'blog-demo-first-editorial',
    author: 4,
    kind: 'DISCUSSION',
    category: 'community-news',
    title: '第一次写题解，我学会了什么',
    summary: '把脑中的直觉变成可读文字，本身就是一次更严格的算法验证。',
    tags: ['algorithm', 'community', 'tutorial'],
    daysAgo: 20.5,
    views: 2140,
  },
  {
    publicId: 'blog-demo-maintenance',
    author: 1,
    kind: 'ANNOUNCEMENT',
    category: 'official-announcement',
    title: '本地开发环境数据维护说明',
    summary: '本公告和全部演示文章均为 DEVELOPMENT FIXTURE / DEMO DATA。',
    tags: ['backend'],
    daysAgo: 24.1,
    views: 980,
  },
];

const comments = [
  [0, 1, '读完很有共鸣。持续训练之后，解决问题的过程确实会变得更从容。'],
  [0, 2, '希望后续能补充一份不同阶段的训练清单。'],
  [1, 3, '错题复盘这一段很实用，我准备按周整理一次。'],
  [1, 4, '训练节奏比单纯追求题量更重要，感谢分享。'],
  [2, 2, '资源分类很清楚，新手可以先从基础列表开始。'],
  [3, 0, '优先队列中旧状态的判断确实容易遗漏。'],
  [3, 4, '图示和复杂度说明都很直观。'],
  [4, 3, '幂等处理部分很关键，线上排查也经常遇到类似问题。'],
  [5, 1, '前后端同时维护契约测试能减少很多联调成本。'],
  [6, 0, '期待训练赛，赛后会整理复盘。'],
  [7, 4, '卡题后设定止损时间是我最需要练习的部分。'],
  [8, 2, '倒序枚举的反例讲得很清楚。'],
  [9, 3, '游标必须包含稳定的次级排序键，这一点很容易忽略。'],
  [10, 1, '准备投稿一篇图论学习记录。'],
  [11, 4, '路径压缩的均摊分析终于看懂了。'],
  [12, 0, '可读性优先的优化习惯更容易长期坚持。'],
  [13, 2, '规范很清楚，Markdown 示例也很实用。'],
  [14, 1, '写出来之后才发现原先理解里有几个空白。'],
  [0, 4, '评论区的不同经历也很有启发。'],
  [8, 0, '期待再写一篇完全背包的对比。'],
];

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query('BEGIN');

  for (const [id, username, displayName] of fixtureUsers) {
    await client.query(
      `INSERT INTO users(id,username,email,display_name,status)
       VALUES($1,$2,$3,$4,'active')
       ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username,email=EXCLUDED.email,display_name=EXCLUDED.display_name,updated_at=now()`,
      [id, username, `${username}@example.test`, displayName],
    );
  }

  for (const [slug, name, description, displayOrder] of categories) {
    await client.query(
      `INSERT INTO discussion_categories(slug,name,description,display_order,data_origin)
       VALUES($1,$2,$3,$4,'DEVELOPMENT_FIXTURE')
       ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,display_order=EXCLUDED.display_order,is_active=true,data_origin='DEVELOPMENT_FIXTURE',updated_at=now()`,
      [slug, name, description, displayOrder],
    );
  }

  for (const [slug, name, displayOrder] of tags) {
    await client.query(
      `INSERT INTO discussion_tags(slug,name,display_order,data_origin)
       VALUES($1,$2,$3,'DEVELOPMENT_FIXTURE')
       ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name,display_order=EXCLUDED.display_order,is_active=true,data_origin='DEVELOPMENT_FIXTURE',updated_at=now()`,
      [slug, name, displayOrder],
    );
  }

  const postIds = [];
  const now = Date.now();
  for (const post of posts) {
    const publishedAt = new Date(now - post.daysAgo * 86_400_000);
    const type = post.kind === 'ANNOUNCEMENT' ? 'ANNOUNCEMENT' : 'ARTICLE';
    const contentMarkdown = body(
      post.title,
      post.summary,
      post.kind === 'SOLUTION',
    );
    const result = await client.query(
      `INSERT INTO discussion_posts(public_id,author_id,type,kind,status,title,summary,content_markdown,published_at,created_at,updated_at,view_count,category_id,cover_image_url,is_featured,is_pinned,data_origin)
       VALUES($1,$2,$3,$4,'PUBLISHED',$5,$6,$7,$8,$8,$8,$9,(SELECT id FROM discussion_categories WHERE slug=$10),$11,$12,$13,'DEVELOPMENT_FIXTURE')
       ON CONFLICT (public_id) DO UPDATE SET author_id=EXCLUDED.author_id,type=EXCLUDED.type,kind=EXCLUDED.kind,status='PUBLISHED',title=EXCLUDED.title,summary=EXCLUDED.summary,content_markdown=EXCLUDED.content_markdown,published_at=EXCLUDED.published_at,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,view_count=EXCLUDED.view_count,category_id=EXCLUDED.category_id,cover_image_url=EXCLUDED.cover_image_url,is_featured=EXCLUDED.is_featured,is_pinned=EXCLUDED.is_pinned,data_origin='DEVELOPMENT_FIXTURE'
       RETURNING id`,
      [
        post.publicId,
        fixtureUsers[post.author][0],
        type,
        post.kind,
        post.title,
        post.summary,
        contentMarkdown,
        publishedAt,
        post.views,
        post.category,
        '/blog-mountain-hero.png',
        post.featured ?? false,
        post.pinned ?? false,
      ],
    );
    const postId = result.rows[0].id;
    postIds.push(postId);
    await client.query('DELETE FROM discussion_post_tags WHERE post_id=$1', [
      postId,
    ]);
    await client.query(
      `INSERT INTO discussion_post_tags(post_id,tag_id)
       SELECT $1,id FROM discussion_tags WHERE slug = ANY($2::text[])
       ON CONFLICT DO NOTHING`,
      [postId, post.tags],
    );
  }

  await client.query(
    `DELETE FROM discussion_comments
     WHERE post_id = ANY($1::uuid[]) AND data_origin='DEVELOPMENT_FIXTURE'`,
    [postIds],
  );
  await client.query(
    `DELETE FROM discussion_post_likes
     WHERE post_id = ANY($1::uuid[]) AND user_id = ANY($2::uuid[])`,
    [postIds, fixtureUsers.map(([id]) => id)],
  );

  for (const [index, [postIndex, authorIndex, content]] of comments.entries()) {
    await client.query(
      `INSERT INTO discussion_comments(post_id,author_id,content_markdown,status,created_at,updated_at,data_origin)
       VALUES($1,$2,$3,'VISIBLE',$4,$4,'DEVELOPMENT_FIXTURE')`,
      [
        postIds[postIndex],
        fixtureUsers[authorIndex][0],
        content,
        new Date(now - (comments.length - index) * 19 * 60_000),
      ],
    );
  }

  for (const [postIndex, postId] of postIds.entries()) {
    const likeCount = Math.min(
      fixtureUsers.length,
      (postIndex % fixtureUsers.length) + 1,
    );
    for (const [userId] of fixtureUsers.slice(0, likeCount)) {
      await client.query(
        `INSERT INTO discussion_post_likes(post_id,user_id) VALUES($1,$2)
         ON CONFLICT DO NOTHING`,
        [postId, userId],
      );
    }
  }

  await client.query('COMMIT');
  console.log(
    'BLOG DEVELOPMENT FIXTURES SEEDED: 16 posts, 20 comments, 5 categories, 10 tags. DEVELOPMENT FIXTURE / DEMO DATA only.',
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
