DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM problem_judge_data_objects
    GROUP BY object_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'cannot restore problem_judge_data_objects object_id primary key while object references are shared';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM problem_judge_data_objects
    GROUP BY problem_id, object_key, sha256
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'cannot restore problem_judge_data_objects object key uniqueness while object references are shared';
  END IF;
END $$;

ALTER TABLE problem_judge_data_objects
  DROP CONSTRAINT problem_judge_data_objects_pkey,
  DROP NOT NULL version_id,
  ADD PRIMARY KEY (object_id),
  ADD UNIQUE (problem_id, object_key, sha256);
