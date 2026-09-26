import express from 'express';
import { pool } from './db.js';
import { requireAuth } from './sessions.js';
import { pushEventToUser } from './events.js';

export async function ensureNotificationsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        recipient_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
        type text NOT NULL CHECK (type IN ('friend_request', 'friend_accept', 'follow')),
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        read_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(
      'CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_id, created_at DESC)',
    );
    // Widen the type CHECK for databases where the table already existed
    // before 'follow' was added to the allowed list above.
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'notifications_type_check' AND table_name = 'notifications'
        ) THEN
          ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
        END IF;
        ALTER TABLE notifications
          ADD CONSTRAINT notifications_type_check
          CHECK (type IN ('friend_request', 'friend_accept', 'follow'));
      END
      $$;
    `);
    console.log('[init] ensured notifications table exists');
  } catch (err) {
    console.error('[init] failed to ensure notifications table:', err);
  }
}

// Single write path for every notification: persists the row (so it's still
// there next time the recipient loads the app) and pushes it live over SSE
// if they're currently connected. Message arrival does NOT go through this —
// see messaging.js — that's a much higher-volume event pushed live without
// being persisted as a notification row, to keep this table from being
// dominated by chat traffic.
export async function createNotification(recipientId, type, payload) {
  const { rows } = await pool.query(
    `INSERT INTO notifications (recipient_id, type, payload) VALUES ($1, $2, $3) RETURNING *`,
    [recipientId, type, payload],
  );
  const notification = rows[0];
  pushEventToUser(recipientId, { type: 'notification', notification });
  return notification;
}

const router = express.Router();

router.get('/notifications', requireAuth, async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 5), 50);
  const offset = (page - 1) * pageSize;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM notifications
       WHERE recipient_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, pageSize + 1, offset],
    );
    const hasMore = rows.length > pageSize;
    res.json({ notifications: rows.slice(0, pageSize), hasMore });
  } catch (err) {
    console.error('[GET /notifications] failed:', err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.get('/notifications/unread-count', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT count(*)::int AS count FROM notifications WHERE recipient_id = $1 AND read_at IS NULL',
      [req.user.id],
    );
    res.json({ count: rows[0].count });
  } catch (err) {
    console.error('[GET /notifications/unread-count] failed:', err);
    res.status(500).json({ error: 'Failed to load unread count' });
  }
});

router.post('/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE notifications SET read_at = now()
       WHERE id = $1 AND recipient_id = $2 AND read_at IS NULL
       RETURNING *`,
      [req.params.id, req.user.id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[POST /notifications/:id/read] failed:', err);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

router.post('/notifications/read-all', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET read_at = now() WHERE recipient_id = $1 AND read_at IS NULL',
      [req.user.id],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /notifications/read-all] failed:', err);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

export default router;
