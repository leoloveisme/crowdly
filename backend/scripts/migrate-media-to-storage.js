// One-off: move media files from local disk (backend/uploads, URLs starting
// with /uploads/) into the configured S3-compatible object storage and rewrite
// their URLs in the database.
//
//   npm run migrate-media-to-storage --prefix backend -- --dry-run
//   npm run migrate-media-to-storage --prefix backend
//   npm run migrate-media-to-storage --prefix backend -- --delete-local
//
// Safe to re-run: rows whose URL no longer starts with /uploads/ are skipped,
// and a file is uploaded under the same key it had locally (media/<story>/…,
// gallery/<story>/…, comics/<comic>/…), so re-uploading is harmless. Local
// files are kept unless --delete-local is given (do that once you've checked
// the bucket). Rows whose local file is missing are reported and left alone.

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { pool } from '../src/db.js';
import { isObjectStorageConfigured, putLocalFileToKey, LOCAL_UPLOADS_ROOT } from '../src/storage.js';

dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');
const DELETE_LOCAL = process.argv.includes('--delete-local');

// Every column that stores an uploaded file's URL.
const COLUMNS = [
  { table: 'story_gallery_images', id: 'id', column: 'image_url' },
  { table: 'chapter_media', id: 'id', column: 'url' },
  { table: 'chapter_media_frames', id: 'id', column: 'image_url' },
  { table: 'comic_page', id: 'page_id', column: 'image_url' },
  { table: 'comic_title', id: 'comic_id', column: 'cover_image_url' },
];

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
};

async function tableExists(table) {
  const { rows } = await pool.query('SELECT to_regclass($1) AS t', [`public.${table}`]);
  return Boolean(rows[0].t);
}

async function main() {
  if (!isObjectStorageConfigured()) {
    console.error('Object storage is not configured (set S3_BUCKET, S3_PUBLIC_BASE_URL and credentials). Nothing to do.');
    process.exitCode = 1;
    return;
  }
  console.log(DRY_RUN ? 'DRY RUN — nothing will be changed.\n' : '');

  const totals = { moved: 0, missing: 0, failed: 0 };
  const moved = [];

  for (const { table, id, column } of COLUMNS) {
    if (!(await tableExists(table))) continue;
    const { rows } = await pool.query(
      `SELECT ${id} AS row_id, ${column} AS url FROM ${table} WHERE ${column} LIKE '/uploads/%'`,
    );
    if (rows.length === 0) continue;
    console.log(`${table}.${column}: ${rows.length} file(s)`);

    for (const row of rows) {
      const key = row.url.slice('/uploads/'.length);
      const localPath = path.join(LOCAL_UPLOADS_ROOT, key);
      if (key.includes('..') || !fs.existsSync(localPath)) {
        console.warn(`  missing on disk, skipped: ${row.url}`);
        totals.missing++;
        continue;
      }
      if (DRY_RUN) {
        console.log(`  would move ${row.url}`);
        totals.moved++;
        continue;
      }
      try {
        const contentType = MIME[path.extname(localPath).toLowerCase()] ?? 'application/octet-stream';
        const newUrl = await putLocalFileToKey(localPath, key, contentType);
        // Only rewrite if nobody changed the row meanwhile.
        await pool.query(`UPDATE ${table} SET ${column} = $1 WHERE ${id} = $2 AND ${column} = $3`, [
          newUrl,
          row.row_id,
          row.url,
        ]);
        moved.push(localPath);
        totals.moved++;
      } catch (err) {
        console.error(`  FAILED ${row.url}: ${err.message}`);
        totals.failed++;
      }
    }
  }

  if (DELETE_LOCAL && !DRY_RUN) {
    for (const file of moved) await fs.promises.unlink(file).catch(() => {});
    console.log(`Deleted ${moved.length} local file(s).`);
  }

  console.log(
    `\n${DRY_RUN ? 'Would move' : 'Moved'} ${totals.moved}, missing ${totals.missing}, failed ${totals.failed}.`,
  );
  if (totals.failed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
