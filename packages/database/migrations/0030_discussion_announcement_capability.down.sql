UPDATE auth_roles
SET permissions = array_remove(permissions, 'discussion:announcement:create')
WHERE name IN ('platform-root', 'superadmin');
