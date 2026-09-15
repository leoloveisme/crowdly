// Part B of "let users work with their content via the UI": the Happy
// Beings Creative Space has 541 file/folder items, but (per
// scripts/audit-happybeings-space.js) they've only ever been metadata —
// creative_space_items never stored real bytes until
// backend/src/creativeSpaceFiles.js added that. This script back-fills real
// content for every item whose relative_path matches a file that actually
// exists in the public GitHub repo (the Happy Beings book text + character
// photos). Items with no GitHub counterpart — the .git/.obsidian/.crowdly
// entries, which only ever existed on the user's local disk — are reported
// as skipped, not invented.
//
// Usage:
//   node scripts/backfill-happybeings-space-content.js               # dry run (default)
//   node scripts/backfill-happybeings-space-content.js --apply       # actually store content
//   node scripts/backfill-happybeings-space-content.js --apply --space "Happy Beings" --email leolove@example.com

import dotenv from 'dotenv';
import { pool } from '../src/db.js';
import { storeItemContent, guessMimeType } from '../src/creativeSpaceFiles.js';
import { fetchRepoTree, fetchRawFileBinary } from './lib/happybeingsSource.js';

dotenv.config();

function argValue(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  return process.argv[idx + 1];
}

const APPLY = process.argv.includes('--apply');
const EMAIL = argValue('--email', 'leolove@example.com');
const SPACE_NAME = argValue('--space', 'Happy Beings');

// The Space mirrors the repo's own working-directory root (the folder
// itself is not a path prefix inside the Space), so an item's relative_path
// maps 1:1 onto a repo path.
function repoPathFor(relativePath) {
  return relativePath;
}

async function main() {
  console.log(`[backfill] mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes — pass --apply to actually store content)'}`);
  console.log(`[backfill] target user: ${EMAIL}, target Space: "${SPACE_NAME}"\n`);

  const { rows: users } = await pool.query('SELECT id FROM local_users WHERE email = $1', [EMAIL]);
  if (users.length === 0) throw new Error(`No local_users row for ${EMAIL}`);
  const userId = users[0].id;

  const { rows: spaces } = await pool.query(
    'SELECT id FROM creative_spaces WHERE user_id = $1 AND name = $2',
    [userId, SPACE_NAME],
  );
  if (spaces.length === 0) throw new Error(`No Space named "${SPACE_NAME}" for this user`);
  const spaceId = spaces[0].id;

  console.log('[backfill] Fetching GitHub repo tree...');
  const repoPaths = new Set(await fetchRepoTree());

  const { rows: items } = await pool.query(
    "SELECT id, relative_path, name, storage_path FROM creative_space_items WHERE space_id = $1 AND kind = 'file' AND deleted = false ORDER BY relative_path",
    [spaceId],
  );

  let matched = 0;
  let alreadyStored = 0;
  let skippedNoSource = 0;
  let failed = 0;

  for (const item of items) {
    const repoPath = repoPathFor(item.relative_path);
    if (!repoPaths.has(repoPath)) {
      skippedNoSource += 1;
      continue;
    }

    matched += 1;
    if (item.storage_path) {
      alreadyStored += 1;
      continue;
    }

    if (!APPLY) {
      console.log(`  would fetch + store: ${item.relative_path}`);
      continue;
    }

    try {
      const buffer = await fetchRawFileBinary(repoPath);
      await storeItemContent({
        spaceId,
        itemId: item.id,
        buffer,
        mimeType: guessMimeType(item.name),
        updatedBy: userId,
      });
      console.log(`  ✅ stored (${buffer.length} bytes): ${item.relative_path}`);
    } catch (err) {
      failed += 1;
      console.error(`  ❌ failed: ${item.relative_path}: ${err.message}`);
    }
  }

  console.log('\n[backfill] Summary:');
  console.log(`  total file items in Space: ${items.length}`);
  console.log(`  matched a GitHub path: ${matched} (${alreadyStored} already had stored content)`);
  console.log(`  skipped — no recoverable source (.git/.obsidian/.crowdly/local-only): ${skippedNoSource}`);
  if (APPLY) console.log(`  failed: ${failed}`);

  await pool.end();
}

main().catch((err) => {
  console.error('[backfill] fatal error:', err);
  process.exit(1);
});
