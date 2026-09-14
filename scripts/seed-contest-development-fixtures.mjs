import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const scenario = 'CONTEST_FULL_EXPERIENCE_V1';
const fixtureKind = 'DEVELOPMENT_FIXTURE';
const cleanup = process.argv.includes('--cleanup');

if (process.env.OJPLATFORM_DEVELOPMENT_FIXTURES !== 'true')
  throw new Error(
    'Set OJPLATFORM_DEVELOPMENT_FIXTURES=true before changing Contest development fixtures.',
  );
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const target = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost', '::1'].includes(target.hostname))
  throw new Error(
    'Contest development fixtures may only target a local database.',
  );

const organizerNames = [
  ['weekly', '周赛委员会'],
  ['academy', '算法训练营'],
  ['freshman', '新生训练组'],
  ['dp', '动态规划研究社'],
  ['graph', '图论学习小组'],
  ['string', '字符串专题组'],
  ['ranking', '月度排位赛组委会'],
  ['campus', '高校联合竞赛组'],
];
const organizers = organizerNames.map(([slug, displayName], index) => ({
  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  username: `contest-fixture-organizer-${slug}`,
  email: `organizer-${slug}@contest-fixtures.ojplatform.local`,
  displayName,
}));
const participants = Array.from({ length: 320 }, (_, index) => ({
  id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  username: `contest-fixture-player-${String(index + 1).padStart(3, '0')}`,
  email: `player-${String(index + 1).padStart(3, '0')}@contest-fixtures.ojplatform.local`,
  displayName: `算法选手 ${String(index + 1).padStart(3, '0')}`,
}));

const hour = 60 * 60 * 1000;
const day = 24 * hour;
const contests = [
  [
    '算法基础周赛 #12',
    '入门 · 数组、模拟与基础贪心',
    -2 * hour,
    5 * hour,
    284,
    6,
    'ICPC',
    0,
  ],
  [
    '数据结构挑战赛',
    '进阶 · 栈、队列、并查集与线段树',
    -75 * 60_000,
    4 * hour,
    216,
    7,
    'ICPC',
    1,
  ],
  [
    '新生入门赛',
    '入门 · 熟悉评测流程与常用基础算法',
    -3 * hour,
    8 * hour,
    148,
    4,
    'OI',
    2,
  ],
  [
    '周末算法挑战赛',
    '周赛 · 综合算法与思维训练',
    3 * hour,
    3 * hour,
    196,
    6,
    'ICPC',
    0,
  ],
  [
    '动态规划专题赛',
    '专题 · 线性、背包与区间动态规划',
    day + 4 * hour,
    3 * hour,
    132,
    6,
    'OI',
    3,
  ],
  [
    '图论进阶赛',
    '专题 · 最短路、最小生成树与拓扑排序',
    2 * day + 6 * hour,
    4 * hour,
    118,
    7,
    'ICPC',
    4,
  ],
  [
    '字符串专题赛',
    '专题 · 字符串匹配、哈希与字典树',
    3 * day + 5 * hour,
    3 * hour,
    96,
    5,
    'OI',
    5,
  ],
  [
    '九月月度排位赛',
    '排位赛 · 面向全站选手的综合能力检验',
    7 * day + 4 * hour,
    5 * hour,
    312,
    8,
    'ICPC',
    6,
  ],
  [
    '高校联合算法邀请赛',
    '邀请赛 · 多校联合命题与交流',
    9 * day + 3 * hour,
    5 * hour,
    224,
    8,
    'ICPC',
    7,
  ],
  [
    '暑期训练收官赛',
    '综合 · 暑期训练阶段成果检验',
    -3 * day,
    5 * hour,
    268,
    8,
    'ICPC',
    1,
  ],
  [
    '二分与贪心练习赛',
    '专题 · 二分答案与贪心策略',
    -7 * day,
    3 * hour,
    154,
    6,
    'OI',
    0,
  ],
  [
    '基础数学专题赛',
    '专题 · 数论、组合与快速幂',
    -11 * day,
    4 * hour,
    126,
    6,
    'OI',
    3,
  ],
  [
    '算法基础周赛 #11',
    '周赛 · 基础算法综合练习',
    -15 * day,
    3 * hour,
    238,
    6,
    'ICPC',
    0,
  ],
  [
    '搜索与剪枝挑战赛',
    '专题 · DFS、BFS 与状态空间剪枝',
    -19 * day,
    4 * hour,
    187,
    7,
    'ICPC',
    1,
  ],
  [
    '新生夏季入门赛',
    '入门 · 语法、枚举与简单模拟',
    -24 * day,
    3 * hour,
    82,
    4,
    'OI',
    2,
  ],
  [
    '树与森林专题赛',
    '专题 · 树的遍历、倍增与树形动态规划',
    -29 * day,
    4 * hour,
    143,
    7,
    'ICPC',
    4,
  ],
  [
    '八月月度排位赛',
    '排位赛 · 八月全站综合排名赛',
    -34 * day,
    5 * hour,
    306,
    8,
    'ICPC',
    6,
  ],
  [
    '前缀和与差分练习赛',
    '入门 · 区间统计与离线处理',
    -39 * day,
    3 * hour,
    105,
    5,
    'OI',
    2,
  ],
  [
    '算法基础周赛 #10',
    '周赛 · 稳定覆盖常用算法模型',
    -45 * day,
    3 * hour,
    221,
    6,
    'ICPC',
    0,
  ],
  [
    '最短路专题挑战',
    '专题 · 单源、多源与分层图最短路',
    -51 * day,
    4 * hour,
    176,
    7,
    'ICPC',
    4,
  ],
  [
    '字符串基础练习赛',
    '入门 · 匹配、统计与回文处理',
    -57 * day,
    3 * hour,
    91,
    5,
    'OI',
    5,
  ],
  [
    '七月月度排位赛',
    '排位赛 · 七月全站综合排名赛',
    -63 * day,
    5 * hour,
    298,
    8,
    'ICPC',
    6,
  ],
  [
    '数据结构基础赛',
    '进阶 · 线性结构与基础树结构',
    -69 * day,
    4 * hour,
    164,
    6,
    'ICPC',
    1,
  ],
  [
    '夏季高校新秀赛',
    '邀请赛 · 高校新秀算法交流',
    -76 * day,
    4 * hour,
    132,
    7,
    'ICPC',
    7,
  ],
];

const contestIds = contests.map(
  (_, index) =>
    `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
);
const fixtureUsers = [...organizers, ...participants];
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query('BEGIN');

  if (cleanup) {
    await client.query(
      `DELETE FROM contests
       WHERE provenance->>'kind'=$1 AND provenance->>'scenario'=$2`,
      [fixtureKind, scenario],
    );
    await client.query(
      `DELETE FROM users
       WHERE id=ANY($1::uuid[])
         AND email LIKE '%@contest-fixtures.ojplatform.local'`,
      [fixtureUsers.map(({ id }) => id)],
    );
    await client.query('COMMIT');
    console.log('CONTEST DEVELOPMENT FIXTURES CLEANED.');
  } else {
    const problems = await client.query(
      `SELECT id,title
       FROM problems
       WHERE visibility='public' AND status='published' AND deleted_at IS NULL
         AND provenance->>'kind'='DEVELOPMENT_FIXTURE'
       ORDER BY public_number NULLS LAST,id
       LIMIT 12`,
    );
    if (problems.rowCount < 8)
      throw new Error(
        'Contest fixtures require at least 8 public development problems. Run seed:problem-library-development first.',
      );

    for (const user of fixtureUsers) {
      await client.query(
        `INSERT INTO users(id,username,email,display_name,status)
         VALUES($1,$2,$3,$4,'active')
         ON CONFLICT (id) DO NOTHING`,
        [user.id, user.username, user.email, user.displayName],
      );
    }
    const storedUsers = await client.query(
      'SELECT id,username,email FROM users WHERE id=ANY($1::uuid[])',
      [fixtureUsers.map(({ id }) => id)],
    );
    const storedById = new Map(storedUsers.rows.map((row) => [row.id, row]));
    for (const user of fixtureUsers) {
      const stored = storedById.get(user.id);
      if (stored?.username !== user.username || stored?.email !== user.email)
        throw new Error(`Fixture user identity collision: ${user.id}`);
    }

    const anchor = new Date();
    anchor.setMinutes(0, 0, 0);
    for (const [index, spec] of contests.entries()) {
      const [
        title,
        description,
        startsAfter,
        duration,
        participantCount,
        problemCount,
        format,
        organizerIndex,
      ] = spec;
      const id = contestIds[index];
      const startsAt = new Date(anchor.getTime() + startsAfter);
      const endsAt = new Date(startsAt.getTime() + duration);
      const registrationOpenAt = new Date(startsAt.getTime() - 14 * day);
      const registrationCloseAt = startsAt;
      const provenance = JSON.stringify({
        kind: fixtureKind,
        scenario,
        datasetVersion: 1,
        anchor: anchor.toISOString(),
      });
      const result = await client.query(
        `INSERT INTO contests(id,title,description,owner_user_id,visibility,lifecycle,starts_at,ends_at,registration_open_at,registration_close_at,format,provenance)
         VALUES($1,$2,$3,$4,'PUBLIC','PUBLISHED',$5,$6,$7,$8,$9,$10::jsonb)
         ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,owner_user_id=EXCLUDED.owner_user_id,visibility='PUBLIC',lifecycle='PUBLISHED',starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,registration_open_at=EXCLUDED.registration_open_at,registration_close_at=EXCLUDED.registration_close_at,format=EXCLUDED.format,provenance=EXCLUDED.provenance,updated_at=now()
         WHERE contests.provenance->>'kind'=$11 AND contests.provenance->>'scenario'=$12
         RETURNING id`,
        [
          id,
          title,
          description,
          organizers[organizerIndex].id,
          startsAt,
          endsAt,
          registrationOpenAt,
          registrationCloseAt,
          format,
          provenance,
          fixtureKind,
          scenario,
        ],
      );
      if (!result.rowCount)
        throw new Error(`Fixture contest identity collision: ${id}`);

      await client.query('DELETE FROM contest_problems WHERE contest_id=$1', [
        id,
      ]);
      for (let problemIndex = 0; problemIndex < problemCount; problemIndex++) {
        const problem =
          problems.rows[(index + problemIndex) % problems.rows.length];
        await client.query(
          `INSERT INTO contest_problems(contest_id,problem_id,ordinal,label,points_config)
           VALUES($1,$2,$3,$4,$5::jsonb)`,
          [
            id,
            problem.id,
            problemIndex + 1,
            String.fromCharCode(65 + problemIndex),
            JSON.stringify({ score: 100 }),
          ],
        );
      }

      await client.query(
        'DELETE FROM contest_registrations WHERE contest_id=$1',
        [id],
      );
      for (
        let participantIndex = 0;
        participantIndex < participantCount;
        participantIndex++
      ) {
        const participant =
          participants[(participantIndex + index * 17) % participants.length];
        await client.query(
          `INSERT INTO contest_registrations(contest_id,user_id,status,registered_at,updated_at)
           VALUES($1,$2,'ACTIVE',$3,$3)`,
          [
            id,
            participant.id,
            new Date(registrationOpenAt.getTime() + participantIndex * 60_000),
          ],
        );
      }
      await client.query(
        `INSERT INTO contest_roles(contest_id,user_id,role)
         VALUES($1,$2,'OWNER')
         ON CONFLICT (contest_id,user_id) DO UPDATE SET role='OWNER'`,
        [id, organizers[organizerIndex].id],
      );
    }

    await client.query('COMMIT');
    console.log(
      `CONTEST DEVELOPMENT FIXTURES SEEDED: ${contests.length} contests, ${participants.length} participant accounts, ${organizers.length} organizers. DEVELOPMENT FIXTURE / DEMO DATA only.`,
    );
  }
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
