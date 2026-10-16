// Closes the "trust the client's userId" hole on the older routes.
//
// Many routes written before the session cookie existed (Spaces, Space
// items, story title/settings, story templates/clones, comments, and the
// viewer `userId` query on reads) take the acting user from req.body.userId
// or req.query.userId. Anyone could claim to be anyone. Rather than touching
// each handler, this middleware runs first on exactly those routes and makes
// that field mean "the signed-in user": it is overwritten with the session
// user's id, or removed when there is no session (so the route sees a
// missing user and responds as it does for guests).
//
// Two routes had no check at all and get one here:
// - DELETE /creative-space-items/:itemId — only the Space owner.
// - PATCH /story-titles/:id/settings — only the story's owner.
//
// The platform, the web app and the desktop app all send the session cookie
// on these calls, with userId equal to the signed-in user, so nothing they
// do legitimately changes.

import { pool } from './db.js';
import { getSessionUser, sessionTokenFrom } from './sessions.js';

const GUARDED = [
  // Spaces and their items (but not PUT /:id/access, whose body lists other users).
  { methods: '*', re: /^\/creative-spaces(\/(?!.*\/access$).*)?$/ },
  { methods: '*', re: /^\/creative-space-items\/[^/]+$/ },
  // Story title, settings and Space link; the viewer id on story/chapter reads.
  { methods: ['GET', 'PATCH'], re: /^\/story-titles\/[^/]+(\/(settings|space))?$/ },
  { methods: ['GET'], re: /^\/chapters$/ },
  { methods: ['POST'], re: /^\/stories\/template$/ },
  { methods: ['POST'], re: /^\/stories\/[^/]+\/clone$/ },
  { methods: ['POST'], re: /^\/comments$/ },
];

function guarded(req) {
  return GUARDED.some((g) => (g.methods === '*' || g.methods.includes(req.method)) && g.re.test(req.path));
}

async function ownsSpaceOfItem(itemId, userId) {
  const { rows } = await pool.query(
    `SELECT s.user_id FROM creative_space_items i JOIN creative_spaces s ON s.id = i.space_id WHERE i.id = $1`,
    [itemId],
  );
  if (rows.length === 0) return null; // let the route answer 404
  return String(rows[0].user_id) === String(userId);
}

async function ownsStory(storyTitleId, userId) {
  const { rows } = await pool.query('SELECT creator_id FROM story_title WHERE story_title_id = $1', [storyTitleId]);
  if (rows.length === 0) return null;
  if (String(rows[0].creator_id) === String(userId)) return true;
  const access = await pool.query(
    "SELECT 1 FROM story_access WHERE story_title_id = $1 AND user_id = $2 AND role = 'owner'",
    [storyTitleId, userId],
  );
  return access.rows.length > 0;
}

export async function sessionUserGuard(req, res, next) {
  if (!guarded(req)) return next();
  try {
    const user = await getSessionUser(sessionTokenFrom(req));
    const id = user?.id ?? null;

    if (req.body && typeof req.body === 'object' && 'userId' in req.body) {
      if (id) req.body.userId = id;
      else delete req.body.userId;
    }
    if (req.query && 'userId' in req.query) {
      // req.query is a getter in Express 5; mutate the parsed object in place.
      if (id) req.query.userId = id;
      else delete req.query.userId;
    }

    const itemDelete = req.method === 'DELETE' && req.path.match(/^\/creative-space-items\/([^/]+)$/);
    if (itemDelete) {
      if (!id) return res.status(401).json({ error: 'Authentication required' });
      const owns = await ownsSpaceOfItem(itemDelete[1], id);
      if (owns === false) return res.status(403).json({ error: 'Only the Space owner can delete its items' });
    }

    const settings = req.method === 'PATCH' && req.path.match(/^\/story-titles\/([^/]+)\/settings$/);
    if (settings) {
      if (!id) return res.status(401).json({ error: 'Authentication required' });
      const owns = await ownsStory(settings[1], id);
      if (owns === false) return res.status(403).json({ error: "Only the story's owner can change its settings" });
    }

    next();
  } catch (err) {
    console.error('[sessionUserGuard] failed:', err);
    res.status(500).json({ error: 'Failed to check the session' });
  }
}
