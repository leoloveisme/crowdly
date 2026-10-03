// "Ask to collaborate": a reader asks a story's owner for direct editing
// rights (desktop Discovery → "I want to change this story"; approved on the
// web story page). Table: backend/migrations/0021_collaboration_requests.sql.
//
// Approving adds the reader to story_access, which is what lets them sync the
// story's text from the desktop app (see canDesktopSync in server.js).

import express from 'express';
import { pool } from './db.js';
import { requireAuth } from './sessions.js';
import { createNotification } from './notifications.js';
import { USER_SUMMARY_JOIN, USER_SUMMARY_SELECT, toUserSummary } from './userSummary.js';

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

async function loadStoryTitle(storyTitleId) {
  if (!isUuid(storyTitleId)) return null;
  const { rows } = await pool.query(
    'SELECT story_title_id, title, creator_id, visibility FROM story_title WHERE story_title_id = $1',
    [storyTitleId],
  );
  return rows[0] ?? null;
}

async function isExplicitMember(storyTitleId, userId) {
  const { rows } = await pool.query('SELECT 1 FROM story_access WHERE story_title_id = $1 AND user_id = $2', [
    storyTitleId,
    userId,
  ]);
  return rows.length > 0;
}

function serialize(row) {
  return {
    id: row.id,
    story_title_id: row.story_title_id,
    message: row.message,
    status: row.status,
    created_at: row.created_at,
    decided_at: row.decided_at,
    // Only the owner's list joins the requester's profile (see the GET route).
    requester: row.u_id
      ? toUserSummary({ id: row.u_id, email: row.email, username: row.username, profile_page_name: row.profile_page_name })
      : undefined,
  };
}

router.post('/stories/:storyTitleId/collaboration-requests', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';
  try {
    const story = await loadStoryTitle(req.params.storyTitleId);
    if (!story || (story.visibility === 'private' && story.creator_id !== userId)) {
      return res.status(404).json({ error: 'Story not found' });
    }
    if (story.creator_id === userId || (await isExplicitMember(story.story_title_id, userId))) {
      return res.status(409).json({ error: 'You can already edit this story' });
    }
    const existing = await pool.query(
      "SELECT * FROM story_collaboration_requests WHERE story_title_id = $1 AND requester_id = $2 AND status = 'pending'",
      [story.story_title_id, userId],
    );
    if (existing.rows[0]) return res.json({ request: serialize(existing.rows[0]) });
    const { rows } = await pool.query(
      `INSERT INTO story_collaboration_requests (story_title_id, requester_id, message)
       VALUES ($1, $2, $3) RETURNING *`,
      [story.story_title_id, userId, message],
    );
    const who = await pool.query(
      `SELECT ${USER_SUMMARY_SELECT} FROM local_users u ${USER_SUMMARY_JOIN} WHERE u.id = $1`,
      [userId],
    );
    const requesterName = who.rows[0] ? toUserSummary(who.rows[0]).displayName : '';
    if (story.creator_id) {
      createNotification(story.creator_id, 'collaboration_request', {
        requesterName,
        requestId: rows[0].id,
        storyTitleId: story.story_title_id,
        storyTitle: story.title,
        requesterId: userId,
        message,
      }).catch((err) => console.error('[collaboration-requests] notify failed:', err));
    }
    res.status(201).json({ request: serialize(rows[0]) });
  } catch (err) {
    console.error('[POST /stories/:id/collaboration-requests] failed:', err);
    res.status(500).json({ error: 'Failed to send the request' });
  }
});

// The caller's own latest request for a story (desktop "Change this story").
router.get('/stories/:storyTitleId/collaboration-requests/mine', requireAuth, async (req, res) => {
  try {
    if (!isUuid(req.params.storyTitleId)) return res.json({ request: null });
    const { rows } = await pool.query(
      `SELECT * FROM story_collaboration_requests
        WHERE story_title_id = $1 AND requester_id = $2
        ORDER BY created_at DESC LIMIT 1`,
      [req.params.storyTitleId, req.user.id],
    );
    res.json({ request: rows[0] ? serialize(rows[0]) : null });
  } catch (err) {
    console.error('[GET /stories/:id/collaboration-requests/mine] failed:', err);
    res.status(500).json({ error: 'Failed to load the request' });
  }
});

// Pending requests, for the story's owner.
router.get('/stories/:storyTitleId/collaboration-requests', requireAuth, async (req, res) => {
  try {
    const story = await loadStoryTitle(req.params.storyTitleId);
    if (!story || story.creator_id !== req.user.id) return res.status(404).json({ error: 'Story not found' });
    const { rows } = await pool.query(
      `SELECT r.*, ${USER_SUMMARY_SELECT.replace('u.id', 'u.id AS u_id')}
         FROM story_collaboration_requests r
         JOIN local_users u ON u.id = r.requester_id
         ${USER_SUMMARY_JOIN}
        WHERE r.story_title_id = $1 AND r.status = 'pending'
        ORDER BY r.created_at ASC`,
      [story.story_title_id],
    );
    res.json({ requests: rows.map(serialize) });
  } catch (err) {
    console.error('[GET /stories/:id/collaboration-requests] failed:', err);
    res.status(500).json({ error: 'Failed to load requests' });
  }
});

async function decide(req, res, approve) {
  const ownerId = req.user.id;
  if (!isUuid(req.params.requestId)) return res.status(404).json({ error: 'Request not found' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT r.*, st.creator_id, st.title
         FROM story_collaboration_requests r
         JOIN story_title st ON st.story_title_id = r.story_title_id
        WHERE r.id = $1 FOR UPDATE OF r`,
      [req.params.requestId],
    );
    const request = rows[0];
    if (!request || request.creator_id !== ownerId) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This request was already answered' });
    }
    const status = approve ? 'approved' : 'declined';
    await client.query(
      'UPDATE story_collaboration_requests SET status = $1, decided_at = now(), decided_by = $2 WHERE id = $3',
      [status, ownerId, request.id],
    );
    if (approve) {
      await client.query(
        `INSERT INTO story_access (story_title_id, user_id, role)
         VALUES ($1, $2, 'contributor')
         ON CONFLICT (story_title_id, user_id) DO NOTHING`,
        [request.story_title_id, request.requester_id],
      );
    }
    await client.query('COMMIT');
    createNotification(request.requester_id, 'collaboration_request_decided', {
      requestId: request.id,
      storyTitleId: request.story_title_id,
      storyTitle: request.title,
      status,
    }).catch((err) => console.error('[collaboration-requests] notify failed:', err));
    res.json({ status });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[POST /collaboration-requests/:id] failed:', err);
    res.status(500).json({ error: 'Failed to answer the request' });
  } finally {
    client.release();
  }
}

router.post('/collaboration-requests/:requestId/approve', requireAuth, (req, res) => decide(req, res, true));
router.post('/collaboration-requests/:requestId/decline', requireAuth, (req, res) => decide(req, res, false));

export default router;
