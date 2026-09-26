import express from 'express';
import { pool } from './db.js';
import { requireAuth } from './sessions.js';
import { createRateLimiter } from './rateLimit.js';
import { createNotification } from './notifications.js';

// Follows are one-directional and require no acceptance, unlike
// friend_requests — a composite primary key is enough to prevent
// duplicates, with no status column needed.
export async function ensureFollowsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS follows (
        follower_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
        followee_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (follower_id, followee_id),
        CHECK (follower_id != followee_id)
      )
    `);
    await pool.query(
      'CREATE INDEX IF NOT EXISTS follows_followee_idx ON follows(followee_id)',
    );
    console.log('[init] ensured follows table exists');
  } catch (err) {
    console.error('[init] failed to ensure follows table:', err);
  }
}

const followLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 60,
  message: 'Too many follow actions — try again later.',
});

const router = express.Router();

router.post('/follows/:userId', requireAuth, followLimiter, async (req, res) => {
  const me = req.user.id;
  const followeeId = req.params.userId;

  if (followeeId === me) {
    return res.status(400).json({ error: 'You cannot follow yourself' });
  }

  try {
    const { rows: userRows } = await pool.query('SELECT id FROM local_users WHERE id = $1', [
      followeeId,
    ]);
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { rowCount } = await pool.query(
      `INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [me, followeeId],
    );

    if (rowCount > 0) {
      await createNotification(followeeId, 'follow', {
        byUserId: me,
        byEmail: req.user.email,
      });
    }

    res.status(201).json({ following: true });
  } catch (err) {
    console.error('[POST /follows/:userId] failed:', err);
    res.status(500).json({ error: 'Failed to follow user' });
  }
});

router.delete('/follows/:userId', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2', [
      req.user.id,
      req.params.userId,
    ]);
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /follows/:userId] failed:', err);
    res.status(500).json({ error: 'Failed to unfollow user' });
  }
});

router.get('/follows/status/:userId', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2',
      [req.user.id, req.params.userId],
    );
    res.json({ following: rows.length > 0 });
  } catch (err) {
    console.error('[GET /follows/status/:userId] failed:', err);
    res.status(500).json({ error: 'Failed to load follow status' });
  }
});

export default router;
