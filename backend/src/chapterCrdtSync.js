// Chapter <-> CRDT doc plumbing for chapter/Space sync (see
// chapterSpaceSync.js, chapterSpaceReconcile.js). Only chapters that are
// actually linked to a Space file ever get a doc created here — this is
// deliberately not "every chapter gets a live CRDT doc", to avoid bloating
// the automerge-repo with docs nothing needs.
//
// Unlike the live HTTP routes (POST /crdt/docs/ensure, apply-content), the
// callers here have no req.user to gate against — they act with the
// server's own authority, the same precedent as the 'github-sync'/
// 'google-drive-sync' actors elsewhere in this codebase.
//
// Materialization: nothing before this wrote a CRDT doc's changes back into
// `stories` (even the older Phase 2 GitHub link in githubSync.js only ever
// pushed *out* to GitHub). initChapterCrdtSync() attaches a 'change'
// listener per chapter doc that projects the doc's current value into
// `stories`/`chapter_revisions`, so CRDT becomes a real, live backbone for
// any chapter that's linked, not a side channel nothing reads.

import { pool } from './db.js';
import * as Automerge from '@automerge/automerge';
import { seedChapterDoc } from './crdt/seeders.js';
import { changeAttribution, parseAttribution } from './crdt/repo.js';

let crdtRepo = null;

async function nextChapterRevisionNumber(chapterId) {
  const { rows } = await pool.query(
    'SELECT revision_number FROM chapter_revisions WHERE chapter_id = $1 ORDER BY revision_number DESC LIMIT 1',
    [chapterId],
  );
  if (rows.length === 0) return 1;
  return Number(rows[0].revision_number) + 1;
}

function lastChangeAttribution(doc) {
  const history = Automerge.getHistory(doc);
  if (history.length === 0) return { userId: null, userName: null, source: null };
  return parseAttribution(history[history.length - 1].change.message);
}

const REVISION_REASON_BY_SOURCE = {
  'external-sync': 'Synced from Space file',
  'auto-relink': 'Merged after the connected repo/folder was reorganized',
  'auto-create': 'Chapter created',
};

/** Projects a chapter CRDT doc's current value into `stories`/`chapter_revisions`, skipping if nothing actually changed (the common case right after a human edit already wrote the same content directly — see PATCH /chapters/:chapterId). */
async function materializeChapterDoc(chapterId, doc) {
  const title = doc.title || '';
  const paragraphs = (doc.paragraphs || []).map((p) => p || '');

  const { rows } = await pool.query(
    'SELECT chapter_title, paragraphs, story_title_id FROM stories WHERE chapter_id = $1',
    [chapterId],
  );
  if (rows.length === 0) return;
  const existing = rows[0];

  const unchanged = (existing.chapter_title || '') === title
    && JSON.stringify(existing.paragraphs || []) === JSON.stringify(paragraphs);
  if (unchanged) return;

  const { userId, source } = lastChangeAttribution(doc);
  const revisionReason = REVISION_REASON_BY_SOURCE[source] || 'Synced';

  await pool.query('UPDATE stories SET chapter_title = $1, paragraphs = $2 WHERE chapter_id = $3', [
    title,
    paragraphs,
    chapterId,
  ]);

  const revisionNumber = await nextChapterRevisionNumber(chapterId);
  await pool.query(
    `INSERT INTO chapter_revisions
       (chapter_id, prev_chapter_title, new_chapter_title, prev_paragraphs, new_paragraphs, created_by, revision_number, revision_reason, language)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [chapterId, existing.chapter_title, title, existing.paragraphs, paragraphs, userId || null, revisionNumber, revisionReason, 'en'],
  );

  if (existing.story_title_id) {
    try {
      await pool.query('UPDATE story_title SET updated_at = now() WHERE story_title_id = $1', [existing.story_title_id]);
    } catch (errTs) {
      console.error('[chapterCrdtSync] failed to bump story_title.updated_at:', errTs);
    }
  }
}

async function attachMaterializationListener(chapterId, docKey) {
  const handle = await crdtRepo.find(docKey);
  await handle.whenReady();
  handle.on('change', ({ doc }) => {
    materializeChapterDoc(chapterId, doc).catch((err) => {
      console.error('[chapterCrdtSync] materialization failed for chapter', chapterId, err);
    });
  });
}

/**
 * Returns the doc_key for chapterId's CRDT doc, creating (and seeding from
 * the chapter's current `stories` row) one if it doesn't exist yet, and
 * attaching the materialization listener to it either way.
 */
export async function ensureChapterCrdtDoc(chapterId) {
  if (!crdtRepo) throw new Error('CRDT repo is not yet initialized');

  const existing = await pool.query(
    "SELECT doc_key FROM crdt_documents WHERE doc_type = 'chapter' AND chapter_id = $1",
    [chapterId],
  );
  if (existing.rows.length > 0) {
    const docKey = existing.rows[0].doc_key;
    await attachMaterializationListener(chapterId, docKey);
    return docKey;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Re-check inside the transaction in case another ensure call for the
    // same never-before-seen chapter raced us here.
    const raced = await client.query(
      "SELECT doc_key FROM crdt_documents WHERE doc_type = 'chapter' AND chapter_id = $1",
      [chapterId],
    );
    if (raced.rows.length > 0) {
      await client.query('COMMIT');
      const docKey = raced.rows[0].doc_key;
      await attachMaterializationListener(chapterId, docKey);
      return docKey;
    }

    const seeded = await seedChapterDoc(client, chapterId);
    if (!seeded) {
      await client.query('ROLLBACK');
      throw new Error(`Chapter ${chapterId} not found`);
    }

    const handle = crdtRepo.create(seeded.value);
    handle.change((d) => { Object.assign(d, seeded.value); }, {
      message: changeAttribution(null, 'chapter-space-sync'),
      time: Math.floor(Date.now() / 1000),
    });

    await client.query(
      `INSERT INTO crdt_documents
         (doc_key, story_title_id, chapter_id, branch_id, screenplay_id, scene_id, doc_type, is_canonical, owner_user_id, created_by)
       VALUES ($1, $2, $3, NULL, NULL, NULL, 'chapter', true, NULL, NULL)`,
      [handle.documentId, seeded.entity.storyTitleId, seeded.entity.chapterId],
    );
    await client.query('COMMIT');

    await attachMaterializationListener(chapterId, handle.documentId);
    return handle.documentId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Ensures the doc exists, then returns its live, ready-to-use handle. */
export async function getChapterCrdtHandle(chapterId) {
  const docKey = await ensureChapterCrdtDoc(chapterId);
  const handle = await crdtRepo.find(docKey);
  await handle.whenReady();
  return handle;
}

/** Call once at server startup, right after crdtRepo is created (see server.js) — attaches the materialization listener for every chapter doc that already exists. */
export async function initChapterCrdtSync(crdtRepoInstance) {
  crdtRepo = crdtRepoInstance;
  try {
    const { rows } = await pool.query("SELECT chapter_id, doc_key FROM crdt_documents WHERE doc_type = 'chapter'");
    for (const row of rows) {
      await attachMaterializationListener(row.chapter_id, row.doc_key);
    }
    console.log(`[init] attached chapter CRDT materialization listeners for ${rows.length} chapter doc(s)`);
  } catch (err) {
    console.error('[init] failed to attach chapter CRDT materialization listeners:', err);
  }
}
