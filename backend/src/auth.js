import bcrypt from 'bcryptjs';
import { pool } from './db.js';

/**
 * Register a new user in the local Postgres database.
 * Assigns a default role of `consumer` in user_roles.
 */
export async function registerWithEmailPassword(email, password) {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  console.log('[registerWithEmailPassword] Starting registration', { email });

  // Basic check to avoid duplicate emails
  const existing = await pool.query(
    'SELECT 1 FROM local_users WHERE email = $1',
    [email],
  );
  if (existing.rows.length > 0) {
    throw new Error('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const insertUser = await pool.query(
    'INSERT INTO local_users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
    [email, passwordHash],
  );
  const user = insertUser.rows[0];
  console.log('[registerWithEmailPassword] Inserted user row', user);

  // Assign default role `consumer`
  try {
    await pool.query(
      'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
      [user.id, 'consumer'],
    );
  } catch (err) {
    // If role insert fails, log it but do not block account creation
    console.error('[registerWithEmailPassword] failed to assign default role', err);
  }

  return {
    id: user.id,
    email: user.email,
    roles: ['consumer'],
  };
}

/**
 * Log in a user against the local Postgres database.
 *
 * Expects tables:
 *   - local_users(id uuid PRIMARY KEY, email text UNIQUE, password_hash text NOT NULL, created_at timestamptz)
 *   - user_roles(user_id uuid, role text) using the existing app_role enum
 */
export async function loginWithEmailPassword(email, password) {
  const { rows } = await pool.query(
    'SELECT id, email, password_hash, is_banned FROM local_users WHERE email = $1',
    [email]
  );

  if (rows.length === 0) {
    throw new Error('Invalid email or password');
  }

  const user = rows[0];

  if (user.is_banned) {
    throw new Error('Your account has been suspended');
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    throw new Error('Invalid email or password');
  }

  const { rows: roleRows } = await pool.query(
    'SELECT role FROM user_roles WHERE user_id = $1',
    [user.id]
  );

  const roles = roleRows.map((r) => r.role);

  return {
    id: user.id,
    email: user.email,
    roles,
  };
}

/**
 * Change a user's password after verifying their current password.
 */
export async function changePassword(userId, currentPassword, newPassword) {
  if (!userId || !currentPassword || !newPassword) {
    throw new Error('userId, current password, and new password are required');
  }

  const { rows } = await pool.query(
    'SELECT id, password_hash FROM local_users WHERE id = $1',
    [userId],
  );

  if (rows.length === 0) {
    throw new Error('User not found');
  }

  const user = rows[0];
  const ok = await bcrypt.compare(currentPassword, user.password_hash);
  if (!ok) {
    throw new Error('Current password is incorrect');
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE local_users SET password_hash = $1 WHERE id = $2', [
    newHash,
    userId,
  ]);

  return { id: userId };
}

/**
 * Delete a user account after verifying their password. This removes related
 * rows from user_roles and profiles, then deletes the local_users row. Other
 * tables rely on ON DELETE CASCADE or ON DELETE SET NULL for cleanup.
 */
export async function deleteAccountWithPassword(userId, password) {
  if (!userId || !password) {
    throw new Error('userId and password are required');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT id, password_hash FROM local_users WHERE id = $1 FOR UPDATE',
      [userId],
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('User not found');
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      await client.query('ROLLBACK');
      const err = new Error('Invalid password');
      err.code = 'INVALID_PASSWORD';
      throw err;
    }

    // Best-effort cleanup of related rows; many tables already cascade.
    await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM profiles WHERE id = $1', [userId]);

    await client.query('DELETE FROM local_users WHERE id = $1', [userId]);

    await client.query('COMMIT');
    return { id: userId };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[deleteAccountWithPassword] rollback failed', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}
