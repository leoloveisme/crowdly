CREATE INDEX IF NOT EXISTS github_installations_connected_by_idx
  ON github_installations (connected_by);
