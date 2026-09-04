DROP TABLE IF EXISTS problem_tags;
DROP TABLE IF EXISTS tags;
ALTER TABLE submission_evaluations DROP COLUMN IF EXISTS public_number;
ALTER TABLE problem_revisions DROP COLUMN IF EXISTS source_type;
ALTER TABLE problems DROP COLUMN IF EXISTS source_type;
ALTER TABLE problem_revisions DROP COLUMN IF EXISTS public_number;
ALTER TABLE problems DROP COLUMN IF EXISTS public_number;
DROP SEQUENCE IF EXISTS submission_evaluations_public_number_seq;
DROP SEQUENCE IF EXISTS problems_public_number_seq;
