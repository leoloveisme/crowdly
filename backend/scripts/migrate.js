// Applies backend/migrations/*.sql in order, tracking what's already run in
// a `schema_migrations` table — so deploys don't mean typing `psql -f`
// commands by hand and hoping you remember which ones already ran. Safe to
// run repeatedly: already-applied files are skipped.
//
// Usage: npm run migrate --prefix backend
// (DATABASE_URL comes from backend/.env via dotenv, same as src/server.js.)
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await pool.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log(`schema_migrations: nothing to do (${files.length} already applied)`);
    return;
  }

  for (const file of pending) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    console.log(`applying ${file} ...`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log('  ok');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  FAILED — ${file} was rolled back, nothing after it ran`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`schema_migrations: applied ${pending.length} migration(s)`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end().finally(() => process.exit(1));
  });
