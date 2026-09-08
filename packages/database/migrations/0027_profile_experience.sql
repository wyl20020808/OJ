CREATE TABLE IF NOT EXISTS user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 60),
  headline text NOT NULL DEFAULT '' CHECK (length(headline) <= 100),
  bio text NOT NULL DEFAULT '' CHECK (length(bio) <= 800),
  location text NOT NULL DEFAULT '' CHECK (length(location) <= 100),
  organization text NOT NULL DEFAULT '' CHECK (length(organization) <= 120),
  website text NOT NULL DEFAULT '' CHECK (length(website) <= 300),
  github text NOT NULL DEFAULT '' CHECK (length(github) <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
