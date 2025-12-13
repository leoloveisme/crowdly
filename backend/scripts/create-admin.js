import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from '../src/db.js';

dotenv.config();

const [,, email, password] = process.argv;

if (!email || !password) {
  console.error('Usage: npm run create-admin -- <email> <password>');
  process.exit(1);
}

async function main() {
  try {
    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      'INSERT INTO local_users (id, email, password_hash) VALUES ($1, $2, $3)',
      [id, email, passwordHash]
    );

    await pool.query(
      'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
      [id, 'platform_admin']
    );

    console.log('Admin user created:', email);
  } catch (err) {
    console.error('Failed to create admin:', err);
  } finally {
    await pool.end();
  }
}

main();
