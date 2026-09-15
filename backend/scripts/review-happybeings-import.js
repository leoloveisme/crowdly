// Phase 2 of the "Happy Beings" import: a read-only structural review of
// what scripts/import-happybeings.js created, so a human reviewer (per the
// plan) has a short, targeted list of things to actually look at instead of
// re-reading all ~140 chapters end to end — chapter order/counts, empty or
// suspiciously short chapters, and leftover markdown/wikilink artifacts the
// source-format conversion might have missed. It does not decide anything;
// it only flags. Publishing is a separate, explicit step (see
// scripts/publish-happybeings.js).
//
// Usage:
//   node scripts/review-happybeings-import.js [--email you@example.com]

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

// Patterns that suggest something leaked through from the source markdown
// instead of being cleanly converted to plain prose paragraphs.
const ARTIFACT_PATTERNS = [
  { name: 'wikilink brackets', re: /\[\[|\]\]/ },
  { name: 'markdown heading inside paragraph', re: /(^|\n)#{1,6}\s/ },
  { name: 'embedded image/transclusion', re: /!\[\[/ },
];

function checkParagraphs(paragraphs) {
  const issues = [];
  if (!paragraphs || paragraphs.length === 0) {
    issues.push('0 paragraphs');
    return issues;
  }
  for (const p of paragraphs) {
    for (const { name, re } of ARTIFACT_PATTERNS) {
      if (re.test(p)) issues.push(name);
    }
  }
  return [...new Set(issues)];
}

async function reviewStory(storyTitleId, title) {
  const { rows: chapters } = await pool.query(
    'SELECT chapter_index, chapter_title, paragraphs FROM stories WHERE story_title_id = $1 ORDER BY chapter_index',
    [storyTitleId],
  );
  const { rows: [row] } = await pool.query(
    'SELECT visibility, published FROM story_title WHERE story_title_id = $1',
    [storyTitleId],
  );

  console.log(`\n[story] "${title}" (${storyTitleId}) — visibility=${row.visibility} published=${row.published}`);
  console.log(`    ${chapters.length} chapter(s):`);
  let flagged = 0;
  for (const ch of chapters) {
    const paraCount = ch.paragraphs?.length || 0;
    const issues = checkParagraphs(ch.paragraphs);
    const shortWarning = paraCount <= 1 ? ['very short (1 paragraph) — worth a glance'] : [];
    const allIssues = [...issues, ...shortWarning];
    const flag = allIssues.length > 0 ? ` ⚠ ${allIssues.join('; ')}` : '';
    if (allIssues.length > 0) flagged += 1;
    console.log(`      ${String(ch.chapter_index).padStart(2)}. ${ch.chapter_title.padEnd(45)} (${paraCount} paragraphs)${flag}`);
  }
  return { flagged, total: chapters.length };
}

async function reviewScreenplay(screenplayId, title) {
  const { rows: scenes } = await pool.query(
    `SELECT sc.scene_index, sc.slugline,
            COALESCE(json_agg(b.text ORDER BY b.block_index) FILTER (WHERE b.block_id IS NOT NULL), '[]') AS blocks
     FROM screenplay_scene sc
     LEFT JOIN screenplay_block b ON b.scene_id = sc.scene_id
     WHERE sc.screenplay_id = $1
     GROUP BY sc.scene_id
     ORDER BY sc.scene_index`,
    [screenplayId],
  );
  const { rows: [row] } = await pool.query(
    'SELECT visibility, published FROM screenplay_title WHERE screenplay_id = $1',
    [screenplayId],
  );

  console.log(`\n[screenplay] "${title}" (${screenplayId}) — visibility=${row.visibility} published=${row.published}`);
  console.log(`    ${scenes.length} scene(s):`);
  let flagged = 0;
  for (const sc of scenes) {
    const blockCount = sc.blocks?.length || 0;
    const issues = checkParagraphs(sc.blocks);
    const shortWarning = blockCount <= 1 ? ['very short (1 block) — worth a glance'] : [];
    const allIssues = [...issues, ...shortWarning];
    const flag = allIssues.length > 0 ? ` ⚠ ${allIssues.join('; ')}` : '';
    if (allIssues.length > 0) flagged += 1;
    console.log(`      ${String(sc.scene_index).padStart(2)}. ${sc.slugline.padEnd(45)} (${blockCount} blocks)${flag}`);
  }
  return { flagged, total: scenes.length };
}

async function main() {
  console.log(`[review] target user: ${EMAIL}\n`);

  const { rows: users } = await pool.query('SELECT id FROM local_users WHERE email = $1', [EMAIL]);
  if (users.length === 0) throw new Error(`No local_users row for ${EMAIL}`);
  const userId = users[0].id;

  console.log('[review] Fetching GitHub repo tree to know which titles are Happy Beings books...');
  const tree = await fetchRepoTree();
  const books = discoverBooks(tree);
  const bookTitles = new Set(books.map((b) => b.folder));

  const { rows: stories } = await pool.query(
    'SELECT story_title_id, title FROM story_title WHERE creator_id = $1 ORDER BY title',
    [userId],
  );
  const { rows: screenplays } = await pool.query(
    'SELECT screenplay_id, title FROM screenplay_title WHERE creator_id = $1 ORDER BY title',
    [userId],
  );

  const matchingStories = stories.filter((s) => bookTitles.has(s.title));
  const matchingScreenplays = screenplays.filter((s) => bookTitles.has(s.title));

  if (matchingStories.length === 0 && matchingScreenplays.length === 0) {
    console.log('[review] No imported Happy Beings stories/screenplays found for this user. Run scripts/import-happybeings.js --apply first.');
    await pool.end();
    return;
  }

  const results = [];
  for (const s of matchingStories) {
    results.push({ kind: 'story', title: s.title, ...(await reviewStory(s.story_title_id, s.title)) });
  }
  for (const s of matchingScreenplays) {
    results.push({ kind: 'screenplay', title: s.title, ...(await reviewScreenplay(s.screenplay_id, s.title)) });
  }

  console.log('\n[review] Summary:');
  for (const r of results) {
    const status = r.flagged === 0 ? '✅ no automatic flags' : `⚠ ${r.flagged}/${r.total} chapter(s)/scene(s) flagged for a manual look`;
    console.log(`  [${r.kind.padEnd(10)}] ${r.title.padEnd(50)} ${status}`);
  }
  console.log('\n[review] This only checks structure (counts, obvious leftover markdown syntax). It cannot judge prose quality, '
    + 'translation issues, or whether chapter order reads well — that part is still on you. '
    + 'Everything imported is private/unpublished (see visibility/published above); publishing to the public feeds is a separate, '
    + 'deliberate step (flip visibility/published via the existing Story/Screenplay settings UI or PATCH '
    + '/story-titles/:id/settings and PATCH /screenplays/:id) once you\'re satisfied — not something this script does.');

  await pool.end();
}

main().catch((err) => {
  console.error('[review] fatal error:', err);
  process.exit(1);
});
