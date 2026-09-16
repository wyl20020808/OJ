const table = (name) => ({ kind: 'table', name });
const column = (tableName, name) => ({
  kind: 'column',
  table: tableName,
  name,
});
const index = (name) => ({ kind: 'index', name });
const sequence = (name) => ({ kind: 'sequence', name });
const constraint = (tableName, name) => ({
  kind: 'constraint',
  table: tableName,
  name,
});
const query = (description, sql) => ({ kind: 'query', description, sql });

const migrations = [
  {
    id: '0000_platform_metadata',
    checksum:
      '245b2e65f5f8f09c69bb5db733ff0146afa0ae6760cd3f10060b1301ffd6a1bc',
    sideEffects: 'Creates platform metadata key/value storage.',
    evidence: [table('_ojplatform_platform_metadata')],
  },
  {
    id: '0001_auth_foundation',
    checksum:
      '98093a7a5c52482857d084c7ac4bd828b8a4d254cc27889dfafba49c4e3ea35b',
    sideEffects:
      'Enables pgcrypto and creates users, credentials, sessions, and session index.',
    evidence: [
      { kind: 'extension', name: 'pgcrypto' },
      table('users'),
      table('user_credentials'),
      table('auth_sessions'),
      index('auth_sessions_active_idx'),
    ],
  },
  {
    id: '0002_problem_foundation',
    checksum:
      '3f55659cf4c57037462f1c1d5fab40bef949741a543806679f5a75d3e40ced62',
    sideEffects: 'Creates problems and listing/author indexes.',
    evidence: [table('problems'), index('problems_public_listing_idx')],
  },
  {
    id: '0003_authz_foundation',
    checksum:
      'f25e08ee84ae684569d3568f560c6646dde682d54d4d4f0ee4fb612792c3ed55',
    sideEffects: 'Creates authorization roles and user-role membership.',
    evidence: [table('auth_roles'), table('auth_user_roles')],
  },
  {
    id: '0004_problem_authoring_revision',
    checksum:
      'f48eff090e8ede01797107f348ce4a20d390fc46cfa87ff6e2dced49c70c7577',
    sideEffects: 'Creates problem revisions and adds current revision linkage.',
    evidence: [
      table('problem_revisions'),
      column('problems', 'current_revision_id'),
    ],
  },
  {
    id: '0005_submission_intake',
    checksum:
      '939ff56507f3fcc8bfa8fed844ee90e2415ad34416e3964aff4f6f7259783f58',
    sideEffects: 'Creates submission intake storage and query indexes.',
    evidence: [table('submissions'), index('submissions_owner_time_idx')],
  },
  {
    id: '0006_submission_evaluation_history',
    checksum:
      '8d1447cccd5f288622db018faa99aaf7c6c565b4d6904b689662fa10d7553bdd',
    sideEffects: 'Creates versioned submission evaluation history.',
    evidence: [
      table('submission_evaluations'),
      index('submission_evaluations_current_idx'),
    ],
  },
  {
    id: '0007_submission_status_lifecycle',
    checksum:
      'b3f2087ddb1c50535d47a5e599229b6b647549e8986879a4414a5d66f356342b',
    sideEffects:
      'Replaces submission status constraint with judge lifecycle states.',
    evidence: [
      query(
        'submissions lifecycle status constraint',
        `SELECT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'submissions_status_check'
             AND conrelid = 'public.submissions'::regclass
             AND pg_get_constraintdef(oid) LIKE '%LEASED%'
         ) AS ok`,
      ),
    ],
  },
  {
    id: '0006_auth_identity_verification_social',
    checksum:
      'e39c8315b88e07314645eb0f50367c98dbff5074df5b17842e8c190dcae1860b',
    sideEffects:
      'Makes email optional, backfills identities, and creates verification/OAuth state.',
    evidence: [
      column('user_credentials', 'password_login_enabled'),
      table('auth_identities'),
      table('auth_verification_challenges'),
      table('auth_oauth_transactions'),
    ],
  },
  {
    id: '0007_contest_foundation',
    checksum:
      '4f7452533fb0d13bf2e3cddf42be073e96aee6141936f4c16fc8a3745df4fdaf',
    sideEffects:
      'Creates contests, roles, problems, registrations, and submission bindings.',
    evidence: [table('contests'), table('contest_submission_bindings')],
  },
  {
    id: '0008_social_messaging_foundation',
    checksum:
      '942d644cfbf9a19917fbe103d035b3749ead4373777d6bd798f78efa9f09888b',
    sideEffects:
      'Creates friendship, conversation, membership, and message storage.',
    evidence: [table('friend_requests'), table('messages')],
  },
  {
    id: '0009_notifications_foundation',
    checksum:
      'f72e228201a3b5d1311b3965636b62c177c96f702ac9e533af77b40ed275feeb',
    sideEffects: 'Creates notifications and read-state indexes.',
    evidence: [table('notifications'), index('notifications_unread_idx')],
  },
  {
    id: '0010_guest_auth',
    checksum:
      '08e71f872a8d9c1dcba8a4a3a305f38d445360b545bf4e4bf6582476547c2757',
    sideEffects: 'Creates guest identities and rotating resume credentials.',
    evidence: [table('guest_identities'), table('guest_resume_credentials')],
  },
  {
    id: '0011_profile_favorites',
    checksum:
      '00271821e54b669bdd7dc27f2861097dd56c7fabc687db4a47faedbb7a4e092a',
    sideEffects: 'Creates per-user problem favorites.',
    evidence: [table('problem_favorites')],
  },
  {
    id: '0012_product_judge_admin_audit',
    checksum:
      '63a6ef8973d4379b04b7c15ec51279289dd05172060528f701ddeff2f5ada2a9',
    sideEffects: 'Creates Product-side Judge administration audit records.',
    evidence: [table('product_judge_admin_audit')],
  },
  {
    id: '0013_problem_judge_data',
    checksum:
      '02c1cc6ed1947ee72d02cfbe2f6b71efcec525b2fb21109b483f3844fb21c701',
    sideEffects:
      'Creates judge configuration, draft, immutable version, testcase, and object metadata.',
    evidence: [table('problem_judge_configs'), table('judge_data_versions')],
  },
  {
    id: '0014_problem_judge_data_integrity',
    checksum:
      '93c37d23b70042df07d771e9b8eea34ff74010840fee5f789d173056793f2f02',
    sideEffects:
      'Makes object version mandatory and changes object primary key to version plus object.',
    evidence: [
      query(
        'problem_judge_data_objects composite primary key',
        `SELECT EXISTS (
           SELECT 1 FROM pg_constraint c
           WHERE c.conrelid = 'public.problem_judge_data_objects'::regclass
             AND c.contype = 'p'
             AND pg_get_constraintdef(c.oid) = 'PRIMARY KEY (version_id, object_id)'
         ) AS ok`,
      ),
    ],
  },
  {
    id: '0015_submission_judge_data_binding',
    checksum:
      'd322f2704fee7e2741c9e095b30bc720c029904683c352892adb5710ad1d47f8',
    sideEffects:
      'Adds immutable Judge data binding fields and completeness constraint to submissions.',
    evidence: [
      column('submissions', 'judge_data_version_id'),
      constraint('submissions', 'submissions_judge_data_binding_complete'),
    ],
  },
  {
    id: '0016_submission_evaluation_detail',
    checksum:
      '087cf3671c7731e46989ef35d589d3c044f74f53e621d375b2fc30daef737ea0',
    sideEffects: 'Adds JSON evaluation detail.',
    evidence: [column('submission_evaluations', 'detail')],
  },
  {
    id: '0017_problem_authoring_v2',
    checksum:
      'ba8402aef09049ca5f2dde0ebccb323a543458e42003295fc4cea8d6a6876fc4',
    sideEffects:
      'Adds problem background and difficulty to problems and revisions.',
    evidence: [
      column('problems', 'background'),
      column('problem_revisions', 'difficulty'),
    ],
  },
  {
    id: '0018_problem_public_metadata',
    checksum:
      '3833272eb1742c5f05ca5ca01c7d2a19ee033fb751e1ec326a8fe599a14bd365',
    sideEffects:
      'Backfills public numbers and creates source metadata, tag tables, and sequences.',
    evidence: [
      sequence('problems_public_number_seq'),
      column('problems', 'public_number'),
      table('tags'),
      table('problem_tags'),
    ],
  },
  {
    id: '0019_editor_code_drafts',
    checksum:
      '61c1448dedcca77cca0052c5ab8f58982af9f022ac64c8be37bde77861e3c9e2',
    sideEffects: 'Creates per-user editor drafts.',
    evidence: [table('editor_code_drafts')],
  },
  {
    id: '0020_judge_artifacts',
    checksum:
      'fc2304297f17f8bb6b75cfd853c20b79de98744e649ecea81fefbd4da1e93e59',
    sideEffects:
      'Creates immutable Judge artifact metadata; intentionally non-replayable SQL.',
    evidence: [table('judge_artifacts')],
  },
  {
    id: '0021_submission_dispatch',
    checksum:
      'dc63e20de49678c5511465d4686a01cbc6fde97374830b6175ba92a3f3ddc30a',
    sideEffects:
      'Adds dispatch failure state, creates dispatch queue, and backfills pending submissions.',
    evidence: [
      column('submissions', 'dispatch_failure_code'),
      table('submission_dispatches'),
    ],
  },
  {
    id: '0022_problem_delete_provenance',
    checksum:
      'a9561bd6611e78fc20276cf5ed907cdbc55b0697b111726479910a771d6e4984',
    sideEffects:
      'Adds soft-delete and provenance fields and replaces source-type constraint.',
    evidence: [
      column('problems', 'deleted_at'),
      column('problems', 'provenance'),
    ],
  },
  {
    id: '0023_team_core_v1',
    checksum:
      '6e9a7b4c201aa9bcbb12c6e8c88e3dc3d60065e0e199ad1ef029d185a1fc1235',
    sideEffects:
      'Creates teams, memberships, invitations, join requests, and invite codes.',
    evidence: [table('teams'), table('team_invite_codes')],
  },
  {
    id: '0024_problem_tag_catalog',
    checksum:
      'a14e4073f92a6a5264a9513a074b1becd875ce78516b84ef30f1751f54d65e58',
    sideEffects: 'Expands and seeds canonical tag catalog.',
    evidence: [column('tags', 'category'), index('tags_catalog_order_idx')],
  },
  {
    id: '0025_discussion_core',
    checksum:
      'ff55d4f0f6c1bddd2f27422501a4a96639fcde80abb0bcb6f8856797c60a9446',
    sideEffects: 'Creates discussion posts, comments, and post likes.',
    evidence: [table('discussion_posts'), table('discussion_comments')],
  },
  {
    id: '0026_submission_source_permission',
    checksum:
      'fea066bfaaf0f9855d644c75ae8211eabbf0a52a36b2b2bbfd8e087e29d2809b',
    sideEffects:
      'Adds submission:view:any to platform-root when that role exists.',
    evidence: [
      query(
        'platform-root submission source permission invariant',
        `SELECT NOT EXISTS (
           SELECT 1 FROM public.auth_roles
           WHERE name = 'platform-root'
             AND NOT permissions @> ARRAY['submission:view:any']::text[]
         ) AS ok`,
      ),
    ],
  },
  {
    id: '0027_profile_experience',
    checksum:
      '20afeea6a33488b903fed93cf94970321124ba1eb51bce2b417a2eb00f601d86',
    sideEffects: 'Creates extended user profiles.',
    evidence: [table('user_profiles')],
  },
  {
    id: '0028_discussion_comment_likes',
    checksum:
      'cba78b3631642da8748e46ed1c1c9451ad5eaafe92d301810a4ccaa166656fa1',
    sideEffects: 'Creates discussion comment likes.',
    evidence: [table('discussion_comment_likes')],
  },
  {
    id: '0029_team_assignment_v1',
    checksum:
      'c2754358e65d8220d3584f904ad882c6bb9adfb7caa04d5a9f65f3df96ae41ee',
    sideEffects:
      'Creates team assignments, assignment problems, and public-number sequence.',
    evidence: [sequence('assignment_public_number_seq'), table('assignments')],
  },
  {
    id: '0030_discussion_announcement_capability',
    checksum:
      'b6748296bc4efaf91c8e1feb2de2276cec070c1fba5d80725ab1e06183803b8d',
    sideEffects:
      'Adds announcement creation permission to existing privileged roles.',
    evidence: [
      query(
        'announcement permission invariant',
        `SELECT NOT EXISTS (
           SELECT 1 FROM public.auth_roles
           WHERE name IN ('platform-root', 'superadmin')
             AND NOT permissions @> ARRAY['discussion:announcement:create']::text[]
         ) AS ok`,
      ),
    ],
  },
  {
    id: '0031_profile_media_save_v2',
    checksum:
      '82cfd6ba0379feb050a3314d520c67a5ff49a5cc49ecc8c144fec151724ed0bd',
    sideEffects: 'Adds profile avatar and background object keys.',
    evidence: [
      column('user_profiles', 'avatar_object_key'),
      column('user_profiles', 'background_object_key'),
    ],
  },
  {
    id: '0032_submission_integration_fixture_cleanup',
    checksum:
      'f0d1ab9c8dd1943d86e4e7d1d17a547f50d39917240df6189a7a473bfbfb2031',
    transaction: 'unwrap-explicit',
    sideEffects: 'Deletes legacy non-UUID integration submission fixtures.',
    evidence: [
      query(
        'legacy integration submissions absent',
        `SELECT NOT EXISTS (
           SELECT 1 FROM public.submissions
           WHERE owner_user_id LIKE 'integration-%'
             AND owner_user_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
         ) AS ok`,
      ),
    ],
  },
  {
    id: '0033_blog_full_experience',
    checksum:
      '07b3d56edd2d91fab7f3317fcdbf5065feb9626a2d72afc7dee0cbe242b789fb',
    sideEffects:
      'Creates discussion categories/tags and expands post/comment metadata.',
    evidence: [
      table('discussion_categories'),
      table('discussion_post_tags'),
      column('discussion_posts', 'kind'),
    ],
  },
  {
    id: '0034_problem_provider_semantics',
    checksum:
      '166a7349d508846754c6bc10d99946277cd41e9633a20626134f8f609005856c',
    sideEffects:
      'Adds provider identity, backfills revisions, and creates provider listing index.',
    evidence: [
      column('problems', 'provider'),
      constraint('problems', 'problems_provider_check'),
    ],
  },
  {
    id: '0035_problem_revision_source_type',
    checksum:
      '09e72cf5222c4a976b77c0a91ba984ea44ac9867a28dff52ece45473ddd732a5',
    sideEffects:
      'Replaces revision source-type constraint with fixture/API automation values.',
    evidence: [
      query(
        'revision source-type constraint includes API_AUTOMATION',
        `SELECT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'problem_revisions_source_type_check'
             AND conrelid = 'public.problem_revisions'::regclass
             AND pg_get_constraintdef(oid) LIKE '%API_AUTOMATION%'
         ) AS ok`,
      ),
    ],
  },
  {
    id: '0036_contest_development_provenance',
    checksum:
      'badd8bc4bf014265171a0237fca26006aeadde8a4926bcb9716f4143f7e02004',
    sideEffects:
      'Adds contest provenance and development-fixture lookup index.',
    evidence: [
      column('contests', 'provenance'),
      index('contests_development_provenance_idx'),
    ],
  },
];

export const productMigrationManifest = migrations.map(
  (migration, ordinal) => ({
    transaction: 'transactional',
    ...migration,
    ordinal,
  }),
);
