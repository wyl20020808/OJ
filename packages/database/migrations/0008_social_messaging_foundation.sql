CREATE TABLE IF NOT EXISTS friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note text NULL CHECK (note IS NULL OR char_length(note) <= 280),
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','ACCEPTED','REJECTED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  CHECK (requester_user_id <> target_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_one_pending_pair_idx ON friend_requests(LEAST(requester_user_id,target_user_id), GREATEST(requester_user_id,target_user_id)) WHERE state='PENDING';
CREATE INDEX IF NOT EXISTS friend_requests_target_idx ON friend_requests(target_user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS friend_requests_requester_idx ON friend_requests(requester_user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS friendships (
  user_low_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_low_id, user_high_id),
  CHECK (user_low_id < user_high_id)
);
CREATE INDEX IF NOT EXISTS friendships_high_idx ON friendships(user_high_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'DIRECT' CHECK (kind='DIRECT'),
  direct_user_low_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direct_user_high_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NULL,
  UNIQUE (direct_user_low_id, direct_user_high_id),
  CHECK (direct_user_low_id < direct_user_high_id)
);
CREATE INDEX IF NOT EXISTS conversations_last_message_idx ON conversations(last_message_at DESC NULLS LAST, id DESC);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_message_id uuid NULL,
  last_read_at timestamptz NULL,
  muted boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_members_user_idx ON conversation_members(user_id, conversation_id);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  client_message_id text NOT NULL CHECK (char_length(client_message_id) BETWEEN 1 AND 128),
  type text NOT NULL DEFAULT 'TEXT' CHECK (type='TEXT'),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz NULL,
  deleted_at timestamptz NULL,
  UNIQUE (conversation_id, sender_user_id, client_message_id)
);
CREATE INDEX IF NOT EXISTS messages_conversation_cursor_idx ON messages(conversation_id, created_at DESC, id DESC);
