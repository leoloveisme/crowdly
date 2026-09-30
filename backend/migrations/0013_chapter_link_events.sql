-- Audit trail for automatic chapter<->Space-item linking/re-linking
-- (chapterSpaceReconcile.js) — these actions now happen without a human
-- clicking anything, so this is what makes them visible/debuggable
-- afterwards (see the "Auto-sync activity" panel on CreativeSpacePage.tsx).
CREATE TABLE IF NOT EXISTS chapter_link_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id      uuid NOT NULL REFERENCES creative_spaces(id) ON DELETE CASCADE,
  chapter_id    uuid NOT NULL REFERENCES stories(chapter_id) ON DELETE CASCADE,
  old_item_id   uuid,
  new_item_id   uuid,
  event_type    text NOT NULL,
  detail        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chapter_link_events_space_idx ON chapter_link_events(space_id, created_at DESC);
