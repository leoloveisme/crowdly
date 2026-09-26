// Phase 0 of the "Happy Beings" import (see the plan for context): a
// read-only audit of the target user's Creative Space plus the source GitHub
// repo, run BEFORE scripts/import-happybeings.js so it's clear up front
// whether content already exists (avoid duplicate imports) and what shape
// the repo is actually in.
//
// Usage:
//   node scripts/audit-happybeings-space.js [--email you@example.com] [--space "Happy Beings"]
//
// Makes no writes of any kind.

import dotenv from 'dotenv';
import { pool } from '../src/db.js';
import { fetchRepoTree, discoverBooks } from './lib/happybeingsSource.js';

dotenv.config();

function argValue(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  return process.argv[idx + 1];
}

const EMAIL = argValue('--email', 'leolove@example.com');
const SPACE_NAME = argValue('--space', 'Happy Beings');

async function main() {
  console.log(`[audit] target user: ${EMAIL}, target Space: "${SPACE_NAME}"\n`);

  const { rows: users } = await pool.query(
    'SELECT id, email FROM local_users WHERE email = $1',
    [EMAIL],
  );
  if (users.length === 0) {
    console.log(`[audit] No local_users row found for ${EMAIL}. Nothing further to check.`);
    await pool.end();
    return;
  }
  const userId = users[0].id;
  console.log(`[audit] user id: ${userId}`);

  const { rows: spaces } = await pool.query(
    'SELECT id, name, visibility, published FROM creative_spaces WHERE user_id = $1',
    [userId],
  );
  console.log(`[audit] Creative Spaces owned by this user: ${spaces.map((s) => s.name).join(', ') || '(none)'}`);

  const targetSpace = spaces.find((s) => s.name === SPACE_NAME);
  if (!targetSpace) {
    console.log(`[audit] No Space named "${SPACE_NAME}" found for this user. Import script will need to create one (or pass --space with the correct name).`);
  } else {
    console.log(`[audit] Space "${SPACE_NAME}": id=${targetSpace.id} visibility=${targetSpace.visibility} published=${targetSpace.published}`);

    const { rows: kindCounts } = await pool.query(
      "SELECT kind, count(*) FROM creative_space_items WHERE space_id = $1 AND deleted = false GROUP BY kind",
      [targetSpace.id],
    );
    console.log(`[audit] Space item counts: ${kindCounts.map((r) => `${r.kind}=${r.count}`).join(', ') || '(empty)'}`);

    const { rows: topLevel } = await pool.query(
      "SELECT relative_path, kind FROM creative_space_items WHERE space_id = $1 AND deleted = false AND relative_path !~ '/' ORDER BY relative_path",
      [targetSpace.id],
    );
    console.log('[audit] Top-level Space entries:');
    for (const row of topLevel) console.log(`    ${row.kind === 'folder' ? '📁' : '📄'} ${row.relative_path}`);

    // Confirm whether creative_space_items carries actual file bytes anywhere,
    // or only metadata (name/mime/size/hash) — this determines whether
    // character photos already in the Space are usable as real attachments.
    const { rows: cols } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'creative_space_items'`,
    );
    const byteColumns = cols
      .map((c) => c.column_name)
      .filter((name) => /content|data|bytes|blob|body|storage_key|storage_path|url/i.test(name) && name !== 'size_bytes');
    console.log(
      byteColumns.length > 0
        ? `[audit] creative_space_items has possible byte-storage column(s): ${byteColumns.join(', ')} — verify before relying on them for photo import.`
        : '[audit] creative_space_items has NO byte-storage column (only metadata: name/mime_type/size_bytes/hash). '
          + 'Character photos already listed in the Space are metadata-only — they are not retrievable as real files through this API. '
          + 'Photo import (if desired) should read image bytes directly from the public GitHub repo instead, not from Space items.',
    );
  }

  // Repo-side check.
  console.log('\n[audit] Fetching GitHub repo tree...');
  const tree = await fetchRepoTree();
  const books = discoverBooks(tree);
  console.log(`[audit] Found ${books.length} book folders in the repo:`);
  for (const book of books) {
    const formats = Object.entries(book.formats)
      .map(([name, d]) => `${name} (${d.layout}, ${d.chapterPaths.length} chapter files)`)
      .join(', ');
    console.log(`    - ${book.folder}: ${formats}`);
  }

  // Existing story_title / screenplay_title rows for this creator, to check
  // for prior partial imports the import script should skip.
  const bookTitleGuesses = books.map((b) => b.folder);
  const { rows: existingStories } = await pool.query(
    'SELECT story_title_id, title, visibility, published FROM story_title WHERE creator_id = $1',
    [userId],
  );
  const { rows: existingScreenplays } = await pool.query(
    'SELECT screenplay_id, title, visibility, published FROM screenplay_title WHERE creator_id = $1',
    [userId],
  );

  const matchingStories = existingStories.filter((s) => bookTitleGuesses.includes(s.title));
  const matchingScreenplays = existingScreenplays.filter((s) => bookTitleGuesses.includes(s.title));

  console.log(`\n[audit] This user has ${existingStories.length} story_title row(s) and ${existingScreenplays.length} screenplay_title row(s) total.`);
  if (matchingStories.length === 0 && matchingScreenplays.length === 0) {
    console.log('[audit] None of them match a "Happy Beings" book title — no prior structured import detected. Phase 1 can proceed for all books.');
  } else {
    console.log('[audit] These already match a Happy Beings book title (import script will SKIP re-creating these):');
    for (const s of matchingStories) console.log(`    [story]      ${s.title} (${s.story_title_id}) visibility=${s.visibility} published=${s.published}`);
    for (const s of matchingScreenplays) console.log(`    [screenplay] ${s.title} (${s.screenplay_id}) visibility=${s.visibility} published=${s.published}`);
  }

  console.log('\n[audit] Done.');
  await pool.end();
}

main().catch((err) => {
  console.error('[audit] fatal error:', err);
  process.exit(1);
});
