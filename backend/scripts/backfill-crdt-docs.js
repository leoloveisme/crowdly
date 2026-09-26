// Backfills crdt_documents/crdt_doc_chunks for existing content so every
// chapter, screenplay scene, story title, and screenplay title gets a
// real-time-collaboration-capable CRDT doc, without touching the existing
// plain-column tables (stories.paragraphs, screenplay_block.text, etc.) or
// the legacy *_revisions tables at all — this is purely additive.
//
// Usage:
//   node scripts/backfill-crdt-docs.js                 # dry run (default) — reports what it WOULD do
//   node scripts/backfill-crdt-docs.js --apply          # actually creates the CRDT docs
//   node scripts/backfill-crdt-docs.js --apply --history  # also best-effort replay chapter_revisions/
//                                                          paragraph_revisions/story_title_revisions into
//                                                          the doc's change history (so old revisions show
//                                                          up in the new restore UI, not just the seed state)
//
// Safe to re-run: entities that already have a crdt_documents row of the
// matching doc_type are skipped every time (see ensureCrdtDocumentsTables's
// unique partial indexes in server.js, which this script also relies on to
// avoid racing itself).

import dotenv from 'dotenv';
import { Repo } from '@automerge/automerge-repo';
import * as Automerge from '@automerge/automerge';
import { pool } from '../src/db.js';
import { PostgresStorageAdapter, ensureCrdtDocChunksTable } from '../src/crdt/postgresStorageAdapter.js';
import { changeAttribution } from '../src/crdt/repo.js';
import { CRDT_DOC_TYPE_SEEDERS } from '../src/crdt/seeders.js';

dotenv.config();

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const REPLAY_HISTORY = args.includes('--history');
const BACKFILL_ACTOR = { id: null, email: 'system:backfill' };

const repo = new Repo({
  network: [],
  storage: new PostgresStorageAdapter(pool),
  peerId: 'crowdly-backfill-script',
});

async function alreadyCatalogued(docType, entityColumn, entityId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM crdt_documents WHERE doc_type = $1 AND ${entityColumn} = $2`,
    [docType, entityId],
  );
  return rows.length > 0;
}

async function catalogueDoc(client, { docKey, docType, entity, createdBy }) {
  await client.query(
    `INSERT INTO crdt_documents
       (doc_key, story_title_id, chapter_id, branch_id, screenplay_id, scene_id, doc_type, is_canonical, owner_user_id, created_by)
     VALUES ($1, $2, $3, NULL, $4, $5, $6, true, $7, $7)`,
    [
      docKey,
      entity.storyTitleId || null,
      entity.chapterId || null,
      entity.screenplayId || null,
      entity.sceneId || null,
      docType,
      createdBy,
    ],
  );
}

/** Best-effort: replay chapter_revisions + paragraph_revisions as a sequence of Automerge changes so old history shows up in the restore UI. Never fatal — a failure here still leaves the doc's single seed-state snapshot intact. */
async function replayChapterHistory(handle, chapterId) {
  const { rows: titleRevs } = await pool.query(
    `SELECT prev_chapter_title, new_chapter_title, prev_paragraphs, new_paragraphs, created_by, created_at, revision_number
     FROM chapter_revisions WHERE chapter_id = $1 ORDER BY revision_number ASC`,
    [chapterId],
  );
  for (const rev of titleRevs) {
    handle.change((d) => {
      if (rev.new_chapter_title != null) d.title = rev.new_chapter_title;
      if (Array.isArray(rev.new_paragraphs)) {
        const paras = rev.new_paragraphs;
        while (d.paragraphs.length > paras.length) d.paragraphs.deleteAt(d.paragraphs.length - 1);
        for (let i = 0; i < paras.length; i++) {
          if (i >= d.paragraphs.length) d.paragraphs.insertAt(i, paras[i] || '');
          else if (d.paragraphs[i] !== (paras[i] || '')) Automerge.updateText(d, ['paragraphs', i], paras[i] || '');
        }
      }
    }, {
      message: changeAttribution({ id: rev.created_by, email: null }),
      time: rev.created_at ? Math.floor(new Date(rev.created_at).getTime() / 1000) : Math.floor(Date.now() / 1000),
    });
  }
}

async function replayStoryTitleHistory(handle, storyTitleId) {
  const { rows: revs } = await pool.query(
    `SELECT new_title, created_by, created_at, revision_number
     FROM story_title_revisions WHERE story_title_id = $1 ORDER BY revision_number ASC`,
    [storyTitleId],
  );
  for (const rev of revs) {
    handle.change((d) => {
      if (rev.new_title != null && d.title !== rev.new_title) Automerge.updateText(d, ['title'], rev.new_title);
    }, {
      message: changeAttribution({ id: rev.created_by, email: null }),
      time: rev.created_at ? Math.floor(new Date(rev.created_at).getTime() / 1000) : Math.floor(Date.now() / 1000),
    });
  }
}

async function backfillEntities(docType, entityColumn, listQuery) {
  const { rows: entities } = await pool.query(listQuery);
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of entities) {
    const entityId = row[entityColumn];
    if (await alreadyCatalogued(docType, entityColumn, entityId)) {
      skipped += 1;
      continue;
    }

    if (!APPLY) {
      created += 1; // "would create"
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const seeder = CRDT_DOC_TYPE_SEEDERS[docType];
      const seeded = await seeder(client, entityId);
      if (!seeded) {
        await client.query('ROLLBACK');
        continue;
      }

      const handle = repo.create(seeded.value);
      handle.change((d) => { Object.assign(d, seeded.value); }, {
        message: changeAttribution(BACKFILL_ACTOR),
        time: Math.floor(Date.now() / 1000),
      });

      if (REPLAY_HISTORY) {
        try {
          if (docType === 'chapter') await replayChapterHistory(handle, entityId);
          if (docType === 'story_title') await replayStoryTitleHistory(handle, entityId);
        } catch (histErr) {
          console.warn(`[backfill] history replay failed for ${docType} ${entityId} (doc still created with seed state):`, histErr.message);
        }
      }

      await catalogueDoc(client, {
        docKey: handle.documentId,
        docType,
        entity: seeded.entity,
        createdBy: null,
      });

      await client.query('COMMIT');
      created += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      failed += 1;
      console.error(`[backfill] failed for ${docType} ${entityId}:`, err.message);
    } finally {
      client.release();
    }
  }

  return { docType, total: entities.length, created, skipped, failed };
}

async function main() {
  await ensureCrdtDocChunksTable(pool);

  console.log(`[backfill] mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes — pass --apply to actually create docs)'}${REPLAY_HISTORY ? ', with history replay' : ''}`);

  const results = [];
  results.push(await backfillEntities('chapter', 'chapter_id', 'SELECT chapter_id FROM stories'));
  results.push(await backfillEntities('scene', 'scene_id', 'SELECT scene_id FROM screenplay_scene'));
  results.push(await backfillEntities('story_title', 'story_title_id', 'SELECT story_title_id FROM story_title'));
  results.push(await backfillEntities('screenplay_title', 'screenplay_id', 'SELECT screenplay_id FROM screenplay_title'));

  console.log('\n[backfill] summary:');
  for (const r of results) {
    console.log(`  ${r.docType.padEnd(18)} total=${r.total} created=${r.created} skipped(already catalogued)=${r.skipped} failed=${r.failed}`);
  }

  if (APPLY) {
    // automerge-repo debounces/throttles storage writes — without this,
    // pool.end() below races ahead of the last documents' actual saves and
    // silently drops them (only surfaced as async console errors, not a
    // thrown exception here). shutdown() awaits every pending flush first.
    console.log('[backfill] flushing pending document saves...');
    await repo.shutdown();
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[backfill] fatal error:', err);
  process.exit(1);
});
