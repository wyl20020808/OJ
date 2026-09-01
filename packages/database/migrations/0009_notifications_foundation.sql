CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('FRIEND_REQUEST','FRIEND_ACCEPTED','DIRECT_MESSAGE','CONTEST')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 1000),
  target_route text NULL CHECK (target_route IS NULL OR target_route ~ '^/(contests|messages|notifications)(/|$)'),
  actor_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  entity_type text NULL,
  entity_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz NULL
);
CREATE INDEX IF NOT EXISTS notifications_user_cursor_idx ON notifications(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(user_id, created_at DESC, id DESC) WHERE read_at IS NULL;
