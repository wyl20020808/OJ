import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (process.env.OJPLATFORM_DEVELOPMENT_FIXTURES !== 'true')
  throw new Error(
    'Set OJPLATFORM_DEVELOPMENT_FIXTURES=true before seeding Home development fixtures.',
  );
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const target = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost', '::1'].includes(target.hostname))
  throw new Error(
    'Home development fixtures may only target a local database.',
  );

const fixtureOwnerId = '00000000-0000-4000-8000-000000000101';
const fixtureOwner = {
  username: 'ojplatform-home-demo',
  email: 'ojplatform-home-demo@example.test',
  displayName: 'OJPlatform Development Fixture',
};
const problems = [
  [
    'home-demo-two-sum',
    'home-demo-two-sum',
    '两数之和：开发演示',
    '入门',
    ['hash-table', 'two-pointers'],
  ],
  [
    'home-demo-prefix-sum',
    'home-demo-prefix-sum',
    '区间和查询：开发演示',
    '简单',
    ['prefix-sum'],
  ],
  [
    'home-demo-bfs',
    'home-demo-bfs',
    '最短路径入门：开发演示',
    '中等',
    ['breadth-first-search', 'shortest-path'],
  ],
  [
    'home-demo-segment-tree',
    'home-demo-segment-tree',
    '动态区间查询：开发演示',
    '困难',
    ['segment-tree'],
  ],
  [
    'home-demo-dp',
    'home-demo-dp',
    '最长上升子序列：开发演示',
    '中等',
    ['dynamic-programming', 'longest-increasing-subsequence'],
  ],
  [
    'home-demo-number-theory',
    'home-demo-number-theory',
    '质数筛选：开发演示',
    '简单',
    ['number-theory', 'sieve'],
  ],
];
const announcements = [
  [
    'home-demo-announcement-1',
    'OJPlatform 开发演示：首页内容已就绪',
    '本地开发夹具已填充公告、题目和比赛，便于 Home 页面视觉验收。',
  ],
  [
    'home-demo-announcement-2',
    '练习专题更新：基础算法与数据结构',
    '开发演示内容，展示首页公告列表和题目推荐入口。',
  ],
  [
    'home-demo-announcement-3',
    '周末训练赛报名开放',
    '开发演示内容，展示即将开始比赛与站内练习节奏。',
  ],
  [
    'home-demo-announcement-4',
    '题库标签目录完成整理',
    '开发演示内容，推荐卡片将显示真实题目难度和标签。',
  ],
  [
    'home-demo-announcement-5',
    '欢迎来到 OJPlatform 本地开发环境',
    '此内容仅用于开发和视觉验收，不代表生产站点公告。',
  ],
];

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query('BEGIN');
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

  for (const [id, slug, title, difficulty, tags] of problems) {
    const problem = await client.query(
      `INSERT INTO problems(id,slug,title,background,statement,input_description,output_description,examples,constraints,notes,time_limit_ms,memory_limit_bytes,visibility,difficulty,status,testdata_version,author_id,source_type,provenance)
       VALUES($1,$2,$3,'','这是用于 Home 页面开发验收的公开练习题。','标准输入。','标准输出。','[{"input":"1 2","output":"3"}]'::jsonb','n <= 100000','DEVELOPMENT FIXTURE / DEMO DATA',1000,268435456,'public',$4,'published',NULL,$5,'TEST_FIXTURE',$6::jsonb)
       ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,difficulty=EXCLUDED.difficulty,updated_at=now()
       RETURNING id,public_number,current_revision_id`,
      [
        id,
        slug,
        title,
        difficulty,
        fixtureOwnerId,
        JSON.stringify({
          kind: 'DEVELOPMENT_FIXTURE',
          scenario: 'HOME_FULL_EXPERIENCE_V1',
        }),
      ],
    );
    const row = problem.rows[0];
    if (!row.current_revision_id) {
      const revisionId = `${id}-revision-1`;
      await client.query(
        `INSERT INTO problem_revisions(id,problem_id,public_number,revision_number,slug,title,background,statement,input_description,output_description,examples,constraints,notes,time_limit_ms,memory_limit_bytes,visibility,difficulty,status,testdata_version,author_id,created_by,provenance)
         VALUES($1,$2,$3,1,$4,$5,'','这是用于 Home 页面开发验收的公开练习题。','标准输入。','标准输出。','[{"input":"1 2","output":"3"}]'::jsonb,'n <= 100000','DEVELOPMENT FIXTURE / DEMO DATA',1000,268435456,'public',$6,'published',NULL,$7,$7,$8::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [
          revisionId,
          id,
          row.public_number,
          slug,
          title,
          difficulty,
          fixtureOwnerId,
          JSON.stringify({ kind: 'DEVELOPMENT_FIXTURE' }),
        ],
      );
      await client.query(
        'UPDATE problems SET current_revision_id=$1 WHERE id=$2',
        [revisionId, id],
      );
    }
    await client.query(
      `INSERT INTO problem_tags(problem_id,tag_id)
       SELECT $1,id FROM tags WHERE slug = ANY($2::text[])
       ON CONFLICT DO NOTHING`,
      [id, tags],
    );
  }

  for (const [publicId, title, summary] of announcements) {
    await client.query(
      `INSERT INTO discussion_posts(public_id,author_id,type,status,title,summary,content_markdown,published_at)
       VALUES($1,$2,'ANNOUNCEMENT','PUBLISHED',$3,$4,$5,now())
       ON CONFLICT (public_id) DO UPDATE SET title=EXCLUDED.title,summary=EXCLUDED.summary,content_markdown=EXCLUDED.content_markdown,status='PUBLISHED',published_at=now(),updated_at=now()`,
      [publicId, fixtureOwnerId, title, summary, `# ${title}\n\n${summary}`],
    );
  }

  const now = Date.now();
  const contests = [
    [
      '00000000-0000-4000-8000-000000000201',
      '开发演示：周末算法训练赛',
      -60 * 60 * 1000,
      2 * 60 * 60 * 1000,
    ],
    [
      '00000000-0000-4000-8000-000000000202',
      '开发演示：基础算法挑战赛',
      2 * 24 * 60 * 60 * 1000,
      2 * 60 * 60 * 1000,
    ],
    [
      '00000000-0000-4000-8000-000000000203',
      '开发演示：数据结构专题赛',
      5 * 24 * 60 * 60 * 1000,
      3 * 60 * 60 * 1000,
    ],
    [
      '00000000-0000-4000-8000-000000000204',
      '开发演示：图论进阶训练',
      9 * 24 * 60 * 60 * 1000,
      3 * 60 * 60 * 1000,
    ],
  ];
  for (const [id, title, startsAfter, duration] of contests) {
    const startsAt = new Date(now + startsAfter);
    const endsAt = new Date(startsAt.getTime() + duration);
    await client.query(
      `INSERT INTO contests(id,title,description,owner_user_id,visibility,lifecycle,starts_at,ends_at,registration_open_at,registration_close_at,format)
       VALUES($1,$2,'DEVELOPMENT FIXTURE / DEMO DATA',$3,'PUBLIC','PUBLISHED',$4,$5,$6,$7,'ICPC')
       ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,registration_open_at=EXCLUDED.registration_open_at,registration_close_at=EXCLUDED.registration_close_at,lifecycle='PUBLISHED',updated_at=now()`,
      [
        id,
        title,
        fixtureOwnerId,
        startsAt,
        endsAt,
        new Date(startsAt.getTime() - 24 * 60 * 60 * 1000),
        startsAt,
      ],
    );
    await client.query(
      `INSERT INTO contest_roles(contest_id,user_id,role) VALUES($1,$2,'OWNER') ON CONFLICT DO NOTHING`,
      [id, fixtureOwnerId],
    );
  }

  await client.query('COMMIT');
  console.log(
    'HOME DEVELOPMENT FIXTURES SEEDED: 6 problems, 5 announcements, 4 contests.',
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
