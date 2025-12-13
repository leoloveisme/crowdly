import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Expected env var, e.g. postgres://user:password@localhost:5432/crowdly
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[db] DATABASE_URL is not set. Set it in backend/.env to connect to the crowdly database.');
}

export const pool = new Pool({
  connectionString,
});
