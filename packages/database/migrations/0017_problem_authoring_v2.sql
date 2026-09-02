ALTER TABLE problems
  ADD COLUMN IF NOT EXISTS background text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS difficulty text CHECK (difficulty IN ('入门','简单','中等','困难','专家'));

ALTER TABLE problem_revisions
  ADD COLUMN IF NOT EXISTS background text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS difficulty text CHECK (difficulty IN ('入门','简单','中等','困难','专家'));
