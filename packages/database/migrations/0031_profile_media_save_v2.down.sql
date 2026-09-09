ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS avatar_object_key,
  DROP COLUMN IF EXISTS background_object_key;
