ALTER TABLE judge_nodes
  ADD COLUMN IF NOT EXISTS desired_state text NOT NULL DEFAULT 'ONLINE' CHECK (desired_state IN ('ONLINE','DRAINING','OFFLINE')),
  ADD COLUMN IF NOT EXISTS observed_state text NOT NULL DEFAULT 'ONLINE' CHECK (observed_state IN ('REGISTERING','ONLINE','BUSY','DRAINING','OFFLINE','UNHEALTHY')),
  ADD COLUMN IF NOT EXISTS control_version integer NOT NULL DEFAULT 1 CHECK (control_version > 0);
UPDATE judge_nodes SET desired_state=CASE WHEN state='DRAINING' THEN 'DRAINING' WHEN state='OFFLINE' THEN 'OFFLINE' ELSE 'ONLINE' END, observed_state=state WHERE desired_state='ONLINE' AND observed_state='ONLINE';
CREATE INDEX IF NOT EXISTS judge_nodes_admin_state_idx ON judge_nodes(desired_state, observed_state, node_id);
