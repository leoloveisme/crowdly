-- Widen notifications.type to every type the backend actually creates.
--
-- The baseline (and the boot-time ensureNotificationsTable(), which used to
-- drop and re-add this constraint on every server start) only allowed
-- 'friend_request', 'friend_accept' and 'follow', so inserts of the newer
-- types failed silently (createNotification() callers .catch() and log):
--   collaboration_request, collaboration_request_decided  (collaboration.js)
--   support_request_status                                (support.js)
-- ensureNotificationsTable() no longer touches the constraint; it's owned by
-- migrations from here on — add new notification types in a new migration.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_type_check') THEN
    ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
  END IF;
  ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'friend_request',
      'friend_accept',
      'follow',
      'collaboration_request',
      'collaboration_request_decided',
      'support_request_status'
    ));
END $$;
