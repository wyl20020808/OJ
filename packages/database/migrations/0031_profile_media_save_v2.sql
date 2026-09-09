ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS avatar_object_key text,
  ADD COLUMN IF NOT EXISTS background_object_key text;
