import express from 'express';
import { pool } from './db.js';
import { requireAuth } from './sessions.js';
import { createRateLimiter } from './rateLimit.js';
import { createNotification } from './notifications.js';
import { toUserSummary, USER_SUMMARY_SELECT, USER_SUMMARY_JOIN } from './userSummary.js';

// A single status-tracked table, not Shameless's swipes+matches split — a
// friend request is meant to be visible to its recipient immediately, so
// there's no anonymous layer to hide first. 'pending' also doubles as
// "undecided": leaving a request undecided is simply not calling
// accept/decline, no extra state needed. 'declined' also doubles as "no
// longer friends" after an unfriend, for the same reason Shameless keeps
// unmatched_at instead of deleting matches — the row is the audit trail.
export async function ensureFriendRequestsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS friend_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        requester_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
        addressee_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
        created_at timestamptz NOT NULL DEFAULT now(),
        responded_at timestamptz,
        CHECK (requester_id != addressee_id)
      )
    `);
    // Only one active (pending/accepted) row per pair, regardless of
    // direction — prevents duplicate requests and crossed requests in both
    // directions at once. Excluding 'declined' rows lets a fresh request be
    // sent (or an unfriended pair reconnect) later.
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_active_pair_idx
      ON friend_requests (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))
      WHERE status != 'declined'
    `);
    await pool.query(
      'CREATE INDEX IF NOT EXISTS friend_requests_addressee_idx ON friend_requests(addressee_id, status)',
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS friend_requests_requester_idx ON friend_requests(requester_id, status)',
    );
    console.log('[init] ensured friend_requests table exists');
  } catch (err) {
    console.error('[init] failed to ensure friend_requests table:', err);
  }
}

const DECLINE_COOLDOWN = '24 hours';

const requestLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Too many friend requests sent — try again later.',
});

const router = express.Router();

router.post('/friends/requests', requireAuth, requestLimiter, async (req, res) => {
  const me = req.user.id;
  const addresseeId = typeof req.body?.addresseeId === 'string' ? req.body.addresseeId.trim() : '';

  if (!addresseeId) {
    return res.status(400).json({ error: 'addresseeId is required' });
  }
  if (addresseeId === me) {
    return res.status(400).json({ error: 'You cannot send a friend request to yourself' });
  }

  try {
    const { rows: addresseeRows } = await pool.query('SELECT id FROM local_users WHERE id = $1', [
      addresseeId,
    ]);
    if (addresseeRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If they already sent me a pending request, treat this as accepting
    // it rather than erroring — matches how most friend-request UIs behave
    // when both sides act at once.
    const { rows: reverseRows } = await pool.query(
      `SELECT id FROM friend_requests
       WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'`,
      [addresseeId, me],
    );
    if (reverseRows.length > 0) {
      const accepted = await acceptRequest(reverseRows[0].id, req.user);
      return res.json({ friendRequest: accepted, autoAccepted: true });
    }

    const { rows: cooldownRows } = await pool.query(
      `SELECT id FROM friend_requests
       WHERE status = 'declined'
         AND responded_at > now() - interval '${DECLINE_COOLDOWN}'
         AND LEAST(requester_id, addressee_id) = LEAST($1::uuid, $2::uuid)
         AND GREATEST(requester_id, addressee_id) = GREATEST($1::uuid, $2::uuid)`,
      [me, addresseeId],
    );
    if (cooldownRows.length > 0) {
      return res.status(429).json({ error: 'Try again later — this request was recently declined.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO friend_requests (requester_id, addressee_id) VALUES ($1, $2) RETURNING *`,
      [me, addresseeId],
    );
    const friendRequest = rows[0];

    await createNotification(addresseeId, 'friend_request', {
      requestId: friendRequest.id,
      fromUserId: me,
      fromEmail: req.user.email,
    });

    res.status(201).json({ friendRequest });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A request already exists between you two.' });
    }
    console.error('[POST /friends/requests] failed:', err);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

router.get('/friends/requests', requireAuth, async (req, res) => {
  const me = req.user.id;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 5), 50);
  const offset = (page - 1) * pageSize;

  try {
    // fr.id is aliased to request_id — without it, this collides with u.id
    // (both named "id") and the pg driver silently keeps only the last one,
    // so the request's own id would disappear under the other user's id.
    const [incoming, outgoing] = await Promise.all([
      pool.query(
        `SELECT fr.id AS request_id, fr.created_at, ${USER_SUMMARY_SELECT}
         FROM friend_requests fr
         JOIN local_users u ON u.id = fr.requester_id
         ${USER_SUMMARY_JOIN}
         WHERE fr.addressee_id = $1 AND fr.status = 'pending'
         ORDER BY fr.created_at DESC
         LIMIT $2 OFFSET $3`,
        [me, pageSize, offset],
      ),
      pool.query(
        `SELECT fr.id AS request_id, fr.created_at, ${USER_SUMMARY_SELECT}
         FROM friend_requests fr
         JOIN local_users u ON u.id = fr.addressee_id
         ${USER_SUMMARY_JOIN}
         WHERE fr.requester_id = $1 AND fr.status = 'pending'
         ORDER BY fr.created_at DESC
         LIMIT $2 OFFSET $3`,
        [me, pageSize, offset],
      ),
    ]);

    res.json({
      incoming: incoming.rows.map((row) => ({ requestId: row.request_id, createdAt: row.created_at, from: toUserSummary(row) })),
      outgoing: outgoing.rows.map((row) => ({ requestId: row.request_id, createdAt: row.created_at, to: toUserSummary(row) })),
    });
  } catch (err) {
    console.error('[GET /friends/requests] failed:', err);
    res.status(500).json({ error: 'Failed to load friend requests' });
  }
});

async function acceptRequest(requestId, user) {
  const { rows } = await pool.query(
    `UPDATE friend_requests SET status = 'accepted', responded_at = now()
     WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
     RETURNING *`,
    [requestId, user.id],
  );
  if (rows.length === 0) return null;
  const friendRequest = rows[0];
  await createNotification(friendRequest.requester_id, 'friend_accept', {
    requestId: friendRequest.id,
    byUserId: user.id,
    byEmail: user.email,
  });
  return friendRequest;
}

router.post('/friends/requests/:id/accept', requireAuth, async (req, res) => {
  try {
    const friendRequest = await acceptRequest(req.params.id, req.user);
    if (!friendRequest) {
      return res.status(404).json({ error: 'Friend request not found' });
    }
    res.json({ friendRequest });
  } catch (err) {
    console.error('[POST /friends/requests/:id/accept] failed:', err);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// Declining an incoming request intentionally does not notify the
// requester — telling someone their request was rejected has no upside and
// only creates an awkward, spam-adjacent notification.
router.post('/friends/requests/:id/decline', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE friend_requests SET status = 'declined', responded_at = now()
       WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
       RETURNING *`,
      [req.params.id, req.user.id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Friend request not found' });
    }
    res.json({ friendRequest: rows[0] });
  } catch (err) {
    console.error('[POST /friends/requests/:id/decline] failed:', err);
    res.status(500).json({ error: 'Failed to decline friend request' });
  }
});

// Cancelling your own outgoing request deletes it outright (not a soft
// decline) — it never became a relationship, so there's nothing worth
// keeping an audit trail of, and this leaves no cooldown for the sender.
router.delete('/friends/requests/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM friend_requests WHERE id = $1 AND requester_id = $2 AND status = 'pending'`,
      [req.params.id, req.user.id],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Friend request not found' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /friends/requests/:id] failed:', err);
    res.status(500).json({ error: 'Failed to cancel friend request' });
  }
});

router.delete('/friends/:userId', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE friend_requests SET status = 'declined', responded_at = now()
       WHERE status = 'accepted'
         AND LEAST(requester_id, addressee_id) = LEAST($1::uuid, $2::uuid)
         AND GREATEST(requester_id, addressee_id) = GREATEST($1::uuid, $2::uuid)`,
      [req.user.id, req.params.userId],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'You are not friends with this user' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /friends/:userId] failed:', err);
    res.status(500).json({ error: 'Failed to unfriend' });
  }
});

// Status of the relationship between the caller and another user, from the
// caller's point of view — the profile page uses this to decide whether the
// "Add friend" button should read Add friend / Request sent / Accept / Friends.
router.get('/friends/status/:userId', requireAuth, async (req, res) => {
  const me = req.user.id;
  const otherId = req.params.userId;

  if (otherId === me) {
    return res.json({ status: 'self' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, requester_id, status FROM friend_requests
       WHERE status != 'declined'
         AND LEAST(requester_id, addressee_id) = LEAST($1::uuid, $2::uuid)
         AND GREATEST(requester_id, addressee_id) = GREATEST($1::uuid, $2::uuid)`,
      [me, otherId],
    );

    if (rows.length === 0) {
      return res.json({ status: 'none' });
    }

    const row = rows[0];
    if (row.status === 'accepted') {
      return res.json({ status: 'friends', requestId: row.id });
    }
    return res.json({
      status: row.requester_id === me ? 'pending_outgoing' : 'pending_incoming',
      requestId: row.id,
    });
  } catch (err) {
    console.error('[GET /friends/status/:userId] failed:', err);
    res.status(500).json({ error: 'Failed to load friend status' });
  }
});

router.get('/friends', requireAuth, async (req, res) => {
  const me = req.user.id;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 5), 50);
  const offset = (page - 1) * pageSize;

  try {
    const { rows } = await pool.query(
      `SELECT
         fr.id AS request_id,
         fr.responded_at AS friends_since,
         ${USER_SUMMARY_SELECT}
       FROM friend_requests fr
       JOIN local_users u ON u.id = CASE WHEN fr.requester_id = $1 THEN fr.addressee_id ELSE fr.requester_id END
       ${USER_SUMMARY_JOIN}
       WHERE fr.status = 'accepted' AND (fr.requester_id = $1 OR fr.addressee_id = $1)
       ORDER BY fr.responded_at DESC
       LIMIT $2 OFFSET $3`,
      [me, pageSize, offset],
    );
    res.json({
      friends: rows.map((row) => ({ friendsSince: row.friends_since, ...toUserSummary(row) })),
    });
  } catch (err) {
    console.error('[GET /friends] failed:', err);
    res.status(500).json({ error: 'Failed to load friends' });
  }
});

export default router;
