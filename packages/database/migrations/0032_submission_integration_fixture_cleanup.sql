BEGIN;

DELETE FROM submission_dispatches
WHERE submission_id IN (
  SELECT id
  FROM submissions
  WHERE owner_user_id LIKE 'integration-%'
    AND owner_user_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
);

DELETE FROM submission_evaluations
WHERE submission_id IN (
  SELECT id
  FROM submissions
  WHERE owner_user_id LIKE 'integration-%'
    AND owner_user_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
);

DELETE FROM submissions
WHERE owner_user_id LIKE 'integration-%'
  AND owner_user_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';

COMMIT;
