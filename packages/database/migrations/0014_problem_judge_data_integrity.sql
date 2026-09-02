ALTER TABLE problem_judge_data_objects
  DROP CONSTRAINT IF EXISTS problem_judge_data_objects_pkey,
  DROP CONSTRAINT IF EXISTS problem_judge_data_objects_problem_id_object_key_sha256_key;

ALTER TABLE problem_judge_data_objects
  ALTER COLUMN version_id SET NOT NULL,
  ADD PRIMARY KEY (version_id, object_id);
