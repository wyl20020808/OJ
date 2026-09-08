UPDATE auth_roles
SET permissions = array_append(permissions, 'submission:view:any')
WHERE name = 'platform-root'
  AND NOT permissions @> ARRAY['submission:view:any']::text[];
