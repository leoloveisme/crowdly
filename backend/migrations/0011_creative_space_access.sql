-- "Only for selected user(s)" Space visibility: when creative_spaces.visibility
-- is 'selected', only the owner and the users listed here may view the Space.
-- creative_spaces.visibility is plain text, so 'selected' needs no enum change.

CREATE TABLE IF NOT EXISTS creative_space_access (
  space_id   uuid NOT NULL REFERENCES creative_spaces(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_creative_space_access_user
  ON creative_space_access(user_id);
