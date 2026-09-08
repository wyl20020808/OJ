UPDATE auth_roles
SET permissions = array_remove(permissions, 'submission:view:any')
WHERE name = 'platform-root';
