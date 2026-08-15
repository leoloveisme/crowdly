import { pool } from './db.js';

// Server-verified session layer. Crowdly's other auth endpoints (e.g.
// /auth/change-password) trust a client-supplied userId with no verification —
// acceptable there today, but not for friend requests / messaging, where
// impersonation lets one account act as another. requireAuth below is the
// gate: every friends/messages/notifications route runs through it instead of
// trusting a body/query userId.

export const SESSION_COOKIE_NAME = 'crowdly_session';
const ABSOLUTE_TTL = '30 days';
const IDLE_TTL = '7 days';

export async function ensureSessionsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)');
    console.log('[init] ensured sessions table exists');
  } catch (err) {
    console.error('[init] failed to ensure sessions table:', err);
  }
}

export async function createSession(userId) {
  const { rows } = await pool.query(
    `INSERT INTO sessions (user_id, expires_at)
     VALUES ($1, now() + interval '${ABSOLUTE_TTL}')
     RETURNING token, expires_at`,
    [userId],
  );
  return rows[0];
}

export async function destroySession(token) {
  if (!token) return;
  await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
}

// Looks up a session, rejecting it if past its absolute or idle expiry, and
// touches last_used_at on success (fire-and-forget — a slow touch write
// should never make the request that triggered it slower).
export async function getSessionUser(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT s.token, s.user_id, u.email, u.is_banned
     FROM sessions s
     JOIN local_users u ON u.id = s.user_id
     WHERE s.token = $1
       AND s.expires_at > now()
       AND s.last_used_at > now() - interval '${IDLE_TTL}'`,
    [token],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  if (row.is_banned) return null;

  pool.query('UPDATE sessions SET last_used_at = now() WHERE token = $1', [token]).catch((err) => {
    console.error('[getSessionUser] failed to touch session last_used_at:', err);
  });

  return { id: row.user_id, email: row.email };
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  // Browsers reject Secure cookies over plain http, which is how local dev
  // runs — only require it once the server is actually serving over TLS.
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
};

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  const user = await getSessionUser(token);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = user;
  next();
}
