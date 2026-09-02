ALTER TABLE problem_revisions DROP COLUMN IF EXISTS difficulty, DROP COLUMN IF EXISTS background;
ALTER TABLE problems DROP COLUMN IF EXISTS difficulty, DROP COLUMN IF EXISTS background;
