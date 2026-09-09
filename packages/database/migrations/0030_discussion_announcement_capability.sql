UPDATE auth_roles
SET permissions = array_append(permissions, 'discussion:announcement:create')
WHERE name IN ('platform-root', 'superadmin')
  AND NOT permissions @> ARRAY['discussion:announcement:create']::text[];
