// Postgres-backed StorageAdapterInterface for @automerge/automerge-repo.
//
// automerge-repo stores each document as a set of binary "chunks" (one
// snapshot chunk plus zero or more incremental-change chunks) addressed by a
// hierarchical key: string[], e.g. [docId, "snapshot", hash] or
// [docId, "incremental", hash]. This adapter persists those chunks as rows
// in `crdt_doc_chunks` instead of the filesystem, so a document survives
// backend restarts/redeploys and can be read from any backend instance.
//
// Key segments are joined with ":" to form a lookup/prefix-matchable string.
// This assumes no key segment (document ids, the literal "snapshot"/
// "incremental", and hex change hashes) ever contains a literal ":" — true
// for every key shape automerge-repo currently produces.

const KEY_SEPARATOR = ':';

function encodeKey(keyPath) {
  return keyPath.join(KEY_SEPARATOR);
}

function decodeKey(keyStr) {
  return keyStr.split(KEY_SEPARATOR);
}

export async function ensureCrdtDocChunksTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crdt_doc_chunks (
      key_str    text PRIMARY KEY,
      key_path   text[] NOT NULL,
      data       bytea NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS crdt_doc_chunks_prefix_idx
      ON crdt_doc_chunks (key_str text_pattern_ops);
  `);
}

export class PostgresStorageAdapter {
  constructor(pool) {
    this.pool = pool;
  }

  async load(keyPath) {
    const keyStr = encodeKey(keyPath);
    const { rows } = await this.pool.query(
      'SELECT data FROM crdt_doc_chunks WHERE key_str = $1',
      [keyStr],
    );
    if (rows.length === 0) return undefined;
    return new Uint8Array(rows[0].data);
  }

  async save(keyPath, data) {
    const keyStr = encodeKey(keyPath);
    await this.pool.query(
      `INSERT INTO crdt_doc_chunks (key_str, key_path, data, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (key_str) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [keyStr, keyPath, Buffer.from(data)],
    );
  }

  async remove(keyPath) {
    const keyStr = encodeKey(keyPath);
    await this.pool.query('DELETE FROM crdt_doc_chunks WHERE key_str = $1', [keyStr]);
  }

  async loadRange(keyPrefix) {
    const prefixStr = encodeKey(keyPrefix);
    const { rows } = await this.pool.query(
      `SELECT key_str, data FROM crdt_doc_chunks
       WHERE key_str = $1 OR key_str LIKE $2`,
      [prefixStr, `${prefixStr}${KEY_SEPARATOR}%`],
    );
    return rows.map((row) => ({
      key: decodeKey(row.key_str),
      data: new Uint8Array(row.data),
    }));
  }

  async removeRange(keyPrefix) {
    const prefixStr = encodeKey(keyPrefix);
    await this.pool.query(
      `DELETE FROM crdt_doc_chunks WHERE key_str = $1 OR key_str LIKE $2`,
      [prefixStr, `${prefixStr}${KEY_SEPARATOR}%`],
    );
  }
}
