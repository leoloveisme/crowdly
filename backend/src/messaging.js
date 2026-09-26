import express from 'express';
import { pool } from './db.js';
import { requireAuth } from './sessions.js';
import { createRateLimiter } from './rateLimit.js';
import { pushEventToUser } from './events.js';
import { toUserSummary, USER_SUMMARY_SELECT, USER_SUMMARY_JOIN } from './userSummary.js';

const MAX_MESSAGE_LENGTH = 5000;

export async function ensureConversationsTable() {
  try {
    // One conversation per accepted friend request, created lazily the first
    // time either side opens the thread (not eagerly on accept) — mirrors
    // Shameless's "don't leave an empty row behind" reasoning for matches.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        friend_request_id uuid NOT NULL UNIQUE REFERENCES friend_requests(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    console.log('[init] ensured conversations table exists');
  } catch (err) {
    console.error('[init] failed to ensure conversations table:', err);
  }
}

export async function ensureMessagesTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      )
    `);
    await pool.query(
      'CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at)',
    );
    console.log('[init] ensured messages table exists');
  } catch (err) {
    console.error('[init] failed to ensure messages table:', err);
  }
}

export async function ensureConversationReadsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_reads (
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
        last_read_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (conversation_id, user_id)
      )
    `);
    console.log('[init] ensured conversation_reads table exists');
  } catch (err) {
    console.error('[init] failed to ensure conversation_reads table:', err);
  }
}

const messageLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'You are sending messages too quickly — slow down.',
});

const router = express.Router();

async function getAcceptedFriendRequest(userA, userB) {
  const { rows } = await pool.query(
    `SELECT id, requester_id, addressee_id FROM friend_requests
     WHERE status = 'accepted'
       AND LEAST(requester_id, addressee_id) = LEAST($1::uuid, $2::uuid)
       AND GREATEST(requester_id, addressee_id) = GREATEST($1::uuid, $2::uuid)`,
    [userA, userB],
  );
  return rows[0] || null;
}

// Confirms `me` is a participant of `conversationId` and returns the other
// participant's id, or null if the conversation doesn't exist / isn't theirs.
async function getConversationParticipant(conversationId, me) {
  const { rows } = await pool.query(
    `SELECT fr.requester_id, fr.addressee_id, fr.status
     FROM conversations c
     JOIN friend_requests fr ON fr.id = c.friend_request_id
     WHERE c.id = $1`,
    [conversationId],
  );
  if (rows.length === 0) return null;
  const { requester_id, addressee_id, status } = rows[0];
  if (requester_id !== me && addressee_id !== me) return null;
  const otherUserId = requester_id === me ? addressee_id : requester_id;
  return { otherUserId, status };
}

router.get('/conversations/with/:friendUserId', requireAuth, async (req, res) => {
  const me = req.user.id;
  const friendUserId = req.params.friendUserId;
  if (friendUserId === me) {
    return res.status(400).json({ error: 'Cannot message yourself' });
  }

  try {
    const friendRequest = await getAcceptedFriendRequest(me, friendUserId);
    if (!friendRequest) {
      return res.status(403).json({ error: 'You are not friends with this user' });
    }

    let { rows } = await pool.query('SELECT * FROM conversations WHERE friend_request_id = $1', [
      friendRequest.id,
    ]);
    if (rows.length === 0) {
      const inserted = await pool.query(
        `INSERT INTO conversations (friend_request_id) VALUES ($1)
         ON CONFLICT (friend_request_id) DO NOTHING
         RETURNING *`,
        [friendRequest.id],
      );
      rows = inserted.rows.length > 0
        ? inserted.rows
        : (await pool.query('SELECT * FROM conversations WHERE friend_request_id = $1', [friendRequest.id])).rows;
    }

    res.json({ conversation: rows[0] });
  } catch (err) {
    console.error('[GET /conversations/with/:friendUserId] failed:', err);
    res.status(500).json({ error: 'Failed to open conversation' });
  }
});

router.get('/conversations', requireAuth, async (req, res) => {
  const me = req.user.id;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 5), 50);
  const offset = (page - 1) * pageSize;

  try {
    const { rows } = await pool.query(
      `WITH my_conversations AS (
         SELECT
           c.id AS conversation_id,
           c.created_at,
           CASE WHEN fr.requester_id = $1 THEN fr.addressee_id ELSE fr.requester_id END AS other_user_id
         FROM conversations c
         JOIN friend_requests fr ON fr.id = c.friend_request_id
         WHERE fr.requester_id = $1 OR fr.addressee_id = $1
       )
       SELECT
         mc.conversation_id,
         mc.other_user_id,
         ${USER_SUMMARY_SELECT},
         lm.body AS last_message_body,
         lm.created_at AS last_message_at,
         lm.sender_id AS last_message_sender_id,
         cr.last_read_at
       FROM my_conversations mc
       JOIN local_users u ON u.id = mc.other_user_id
       ${USER_SUMMARY_JOIN}
       LEFT JOIN LATERAL (
         SELECT body, created_at, sender_id FROM messages
         WHERE conversation_id = mc.conversation_id AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 1
       ) lm ON true
       LEFT JOIN conversation_reads cr ON cr.conversation_id = mc.conversation_id AND cr.user_id = $1
       ORDER BY COALESCE(lm.created_at, mc.created_at) DESC
       LIMIT $2 OFFSET $3`,
      [me, pageSize, offset],
    );

    const conversations = rows.map((row) => ({
      conversationId: row.conversation_id,
      with: toUserSummary({ id: row.other_user_id, email: row.email, username: row.username, profile_page_name: row.profile_page_name }),
      lastMessage: row.last_message_body
        ? { body: row.last_message_body, createdAt: row.last_message_at, senderId: row.last_message_sender_id }
        : null,
      unread: Boolean(
        row.last_message_body &&
          row.last_message_sender_id !== me &&
          (!row.last_read_at || row.last_read_at < row.last_message_at),
      ),
    }));

    res.json({ conversations });
  } catch (err) {
    console.error('[GET /conversations] failed:', err);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

router.get('/conversations/unread-count', requireAuth, async (req, res) => {
  const me = req.user.id;
  try {
    const { rows } = await pool.query(
      `WITH my_conversations AS (
         SELECT c.id AS conversation_id
         FROM conversations c
         JOIN friend_requests fr ON fr.id = c.friend_request_id
         WHERE fr.requester_id = $1 OR fr.addressee_id = $1
       )
       SELECT count(*)::int AS count
       FROM my_conversations mc
       JOIN LATERAL (
         SELECT sender_id, created_at FROM messages
         WHERE conversation_id = mc.conversation_id AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 1
       ) lm ON true
       LEFT JOIN conversation_reads cr ON cr.conversation_id = mc.conversation_id AND cr.user_id = $1
       WHERE lm.sender_id != $1
         AND (cr.last_read_at IS NULL OR cr.last_read_at < lm.created_at)`,
      [me],
    );
    res.json({ count: rows[0].count });
  } catch (err) {
    console.error('[GET /conversations/unread-count] failed:', err);
    res.status(500).json({ error: 'Failed to load unread count' });
  }
});

router.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  const me = req.user.id;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 30, 10), 100);
  const offset = (page - 1) * pageSize;

  try {
    const participant = await getConversationParticipant(req.params.id, me);
    if (!participant) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const { rows } = await pool.query(
      `SELECT id, sender_id, body, created_at
       FROM messages
       WHERE conversation_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, pageSize, offset],
    );

    res.json({ messages: rows.reverse() });
  } catch (err) {
    console.error('[GET /conversations/:id/messages] failed:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

router.post('/conversations/:id/messages', requireAuth, messageLimiter, async (req, res) => {
  const me = req.user.id;
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';

  if (!body) {
    return res.status(400).json({ error: 'Message body is required' });
  }
  if (body.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters` });
  }

  try {
    const participant = await getConversationParticipant(req.params.id, me);
    if (!participant) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    // Re-check friendship status at send time, not just at conversation
    // lookup time — the friendship may have ended since the thread was
    // opened, and messaging must stay gated on it being currently active.
    if (participant.status !== 'accepted') {
      return res.status(403).json({ error: 'You are no longer friends with this user' });
    }

    const { rows } = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, me, body],
    );
    const message = rows[0];

    // Message delivery is pushed live but not persisted as a `notifications`
    // row — see the comment in notifications.js on why chat volume is kept
    // out of that table.
    pushEventToUser(participant.otherUserId, {
      type: 'message',
      conversationId: req.params.id,
      message,
    });

    res.status(201).json({ message });
  } catch (err) {
    console.error('[POST /conversations/:id/messages] failed:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

router.post('/conversations/:id/read', requireAuth, async (req, res) => {
  const me = req.user.id;
  try {
    const participant = await getConversationParticipant(req.params.id, me);
    if (!participant) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await pool.query(
      `INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
       VALUES ($1, $2, now())
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = now()`,
      [req.params.id, me],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /conversations/:id/read] failed:', err);
    res.status(500).json({ error: 'Failed to mark conversation read' });
  }
});

export default router;
