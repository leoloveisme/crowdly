// Phase 1 of the "Happy Beings" import: turns the 7 books in
// github.com/leoloveisme/happybeings into real Stories (and, for Book I, a
// Screenplay) on Crowdly, linked to the target user's existing Creative
// Space, imported as private/unpublished so they can be reviewed
// (scripts/review-happybeings-import.js) before anyone flips them public.
//
// This deliberately goes through the existing HTTP API — the same
// /stories/template + /story-titles/:id/sync-desktop and
// /screenplays/template + /screenplays/:id/sync-desktop contract the desktop
// editor already uses (apps/desktop/src/editor/crowdly_client.py) — rather
// than writing to story_title/stories directly, so it gets the same
// revisions/story_access/story_collaborators bookkeeping those routes already
// do, instead of a second, drifting copy of that logic.
//
// Usage:
//   node scripts/import-happybeings.js                     # dry run (default) — reports what it WOULD do
//   node scripts/import-happybeings.js --apply              # actually creates content (requires the backend running)
//   node scripts/import-happybeings.js --only "Book I"      # limit to book(s) whose folder name contains this substring
//   node scripts/import-happybeings.js --email x@y.com --space "My Space" --base-url http://localhost:4000
//
// Safe to re-run: books already present (by exact title match against this
// creator's story_title/screenplay_title rows) are skipped every time.

import dotenv from 'dotenv';
import { pool } from '../src/db.js';
import { fetchRepoTree, discoverBooks, loadFormat } from './lib/happybeingsSource.js';

dotenv.config();

function argValue(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  return process.argv[idx + 1];
}

const APPLY = process.argv.includes('--apply');
const EMAIL = argValue('--email', 'leolove@example.com');
const SPACE_NAME = argValue('--space', 'Happy Beings');
const BASE_URL = (argValue('--base-url', 'http://localhost:4000') || '').replace(/\/$/, '');
const ONLY = argValue('--only', null);

async function postJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`POST ${path} -> ${res.status}: ${data.error || JSON.stringify(data)}`);
  }
  return data;
}

async function patchJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`PATCH ${path} -> ${res.status}: ${data.error || JSON.stringify(data)}`);
  }
  return data;
}

async function importStory({ title, chapters, userId, creativeSpaceId }) {
  const first = chapters[0];
  const created = await postJson('/stories/template', {
    title,
    chapterTitle: first.chapterTitle,
    paragraphs: first.paragraphs,
    userId,
    creativeSpaceId,
    language: 'en',
  });
  const storyTitleId = created.storyTitleId || created.story_title_id;
  if (!storyTitleId) throw new Error(`/stories/template did not return an id for "${title}"`);

  await postJson(`/story-titles/${storyTitleId}/sync-desktop`, {
    userId,
    title,
    metadata: {},
    chapters: chapters.map((c) => ({ chapterTitle: c.chapterTitle, paragraphs: c.paragraphs })),
    bodyType: 'story',
    creativeSpaceId,
  });

  await patchJson(`/story-titles/${storyTitleId}/settings`, {
    visibility: 'private',
    published: false,
  });

  return storyTitleId;
}

async function importScreenplay({ title, chapters, userId, creativeSpaceId }) {
  const created = await postJson('/screenplays/template', { title, userId });
  const screenplayId = created.screenplayId || created.screenplay_id || created.id;
  if (!screenplayId) throw new Error(`/screenplays/template did not return an id for "${title}"`);

  const scenes = chapters.map((c, i) => ({
    sceneIndex: i + 1,
    slugline: c.chapterTitle,
    paragraphs: c.paragraphs,
  }));

  await postJson(`/screenplays/${screenplayId}/sync-desktop`, {
    userId,
    title,
    metadata: {},
    scenes,
  });

  await patchJson(`/screenplays/${screenplayId}`, {
    visibility: 'private',
    published: false,
  });

  // No API route exists yet to link a screenplay to a Creative Space (only
  // story_title has one, via /stories/template + /story-titles/:id/space).
  // The column exists on screenplay_title (server.js ~805), so set it
  // directly here rather than leaving the screenplay unlinked from the Space.
  if (creativeSpaceId) {
    await pool.query(
      'UPDATE screenplay_title SET creative_space_id = $1, updated_at = now() WHERE screenplay_id = $2',
      [creativeSpaceId, screenplayId],
    );
  }

  return screenplayId;
}

async function main() {
  console.log(`[import] mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes — pass --apply to actually import)'}`);
  console.log(`[import] target user: ${EMAIL}, target Space: "${SPACE_NAME}", backend: ${BASE_URL}${ONLY ? `, filter: "${ONLY}"` : ''}\n`);

  const { rows: users } = await pool.query('SELECT id FROM local_users WHERE email = $1', [EMAIL]);
  if (users.length === 0) throw new Error(`No local_users row for ${EMAIL}`);
  const userId = users[0].id;

  const { rows: spaces } = await pool.query(
    'SELECT id FROM creative_spaces WHERE user_id = $1 AND name = $2',
    [userId, SPACE_NAME],
  );
  const creativeSpaceId = spaces[0]?.id || null;
  if (!creativeSpaceId) {
    console.warn(`[import] WARNING: no Space named "${SPACE_NAME}" found for this user — imported content will not be linked to a Space.`);
  }

  if (APPLY) {
    const health = await fetch(`${BASE_URL}/creative-spaces?userId=${userId}`).catch(() => null);
    if (!health) {
      throw new Error(`Could not reach backend at ${BASE_URL}. Start it first (npm run dev in backend/).`);
    }
  }

  const { rows: existingStories } = await pool.query(
    'SELECT title FROM story_title WHERE creator_id = $1',
    [userId],
  );
  const { rows: existingScreenplays } = await pool.query(
    'SELECT title FROM screenplay_title WHERE creator_id = $1',
    [userId],
  );
  const existingStoryTitles = new Set(existingStories.map((r) => r.title));
  const existingScreenplayTitles = new Set(existingScreenplays.map((r) => r.title));

  console.log('[import] Fetching GitHub repo tree...');
  const tree = await fetchRepoTree();
  let books = discoverBooks(tree);
  if (ONLY) books = books.filter((b) => b.folder.includes(ONLY));
  console.log(`[import] Processing ${books.length} book folder(s).\n`);

  const summary = [];

  for (const book of books) {
    for (const [formatName, descriptor] of Object.entries(book.formats)) {
      const isScreenplay = formatName === 'screenplay';
      const existingTitles = isScreenplay ? existingScreenplayTitles : existingStoryTitles;

      console.log(`[import] ${book.folder} / ${formatName}: fetching and parsing chapters...`);
      const { title, chapters, warnings } = await loadFormat(descriptor);

      if (warnings.unmatchedTocEntries.length > 0) {
        console.warn(`    ⚠ ToC entries with no matching file (skipped, nothing invented): ${warnings.unmatchedTocEntries.join(', ')}`);
      }
      if (warnings.extraFiles.length > 0) {
        console.warn(`    ⚠ Chapter files not listed in the ToC (appended at the end): ${warnings.extraFiles.join(', ')}`);
      }

      if (chapters.length === 0) {
        console.warn(`    ⚠ No chapters resolved for "${title}" — skipping.`);
        summary.push({ book: book.folder, format: formatName, title, status: 'skipped (no chapters)' });
        continue;
      }

      if (existingTitles.has(title)) {
        console.log(`    already imported ("${title}") — skipping.`);
        summary.push({ book: book.folder, format: formatName, title, status: 'skipped (already imported)' });
        continue;
      }

      console.log(`    "${title}": ${chapters.length} chapters (first: "${chapters[0].chapterTitle}", last: "${chapters[chapters.length - 1].chapterTitle}")`);

      if (!APPLY) {
        summary.push({ book: book.folder, format: formatName, title, status: `would import (${chapters.length} chapters)` });
        continue;
      }

      try {
        const id = isScreenplay
          ? await importScreenplay({ title, chapters, userId, creativeSpaceId })
          : await importStory({ title, chapters, userId, creativeSpaceId });
        console.log(`    ✅ imported as ${isScreenplay ? 'screenplay' : 'story'} ${id} (private, unpublished)`);
        summary.push({ book: book.folder, format: formatName, title, status: `imported (${id})` });
        existingTitles.add(title);
      } catch (err) {
        console.error(`    ❌ failed: ${err.message}`);
        summary.push({ book: book.folder, format: formatName, title, status: `FAILED: ${err.message}` });
      }
    }
  }

  console.log('\n[import] Summary:');
  for (const row of summary) {
    console.log(`  ${row.book.padEnd(55)} ${row.format.padEnd(11)} ${row.title.padEnd(45)} ${row.status}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[import] fatal error:', err);
  process.exit(1);
});
