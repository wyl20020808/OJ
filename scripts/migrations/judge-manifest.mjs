const table = (name) => ({ kind: 'table', name });
const column = (tableName, name) => ({
  kind: 'column',
  table: tableName,
  name,
});
const index = (name) => ({ kind: 'index', name });

const migrations = [
  {
    id: '0000_judge_service_boundary',
    checksum:
      '589dabc75ce48429dd07cbfaf0929fb2887e8f29258b3a15283af1903d651485',
    sideEffects: 'Creates Judge-only job and evaluation projections.',
    evidence: [table('judge_service_jobs'), table('judge_service_evaluations')],
  },
  {
    id: '0001_dynamic_judge_node_registry',
    checksum:
      '4b393b924a1ef844853bd67c4dcac6a0e215396bd1d32f1c821b3882345d697d',
    sideEffects: 'Creates Judge node registry and assignment leases.',
    evidence: [table('judge_nodes'), table('judge_node_assignments')],
  },
  {
    id: '0002_judge_admin_state',
    checksum:
      '82f24bac5680cdeb06de314cf599f06c727765f6424bac06fcd7252562167810',
    sideEffects:
      'Adds desired/observed state and control version, then backfills nodes.',
    evidence: [
      column('judge_nodes', 'desired_state'),
      index('judge_nodes_admin_state_idx'),
    ],
  },
  {
    id: '0003_judge_pool_control',
    checksum:
      '28d1be64b5fb56d2d4053809198268960029b62240d5744b0ae78c894be6c824',
    sideEffects: 'Creates pool policy and autoscaler decision history.',
    evidence: [
      table('judge_pool_control'),
      table('judge_autoscaler_decisions'),
    ],
  },
];

export const judgeMigrationManifest = migrations.map((migration, ordinal) => ({
  transaction: 'transactional',
  ...migration,
  ordinal,
}));
