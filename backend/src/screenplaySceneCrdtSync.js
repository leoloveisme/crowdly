// Scene <-> CRDT doc plumbing for scene/Space sync (see
// screenplaySpaceSync.js, chapterSpaceReconcile.js). Mirrors
// chapterCrdtSync.js exactly, except materialization replaces a scene's
// blocks wholesale (delete + reinsert) rather than diffing them by id —
// the same strategy POST /screenplays/:screenplayId/sync-desktop already
// uses for the identical reason: a CRDT-doc block has no stable identity
// once it's come from a text file (screenplayMarkdown.js's textToScene has
// no block_id to diff against), so matching by id would only ever apply to
// the live-editor case and silently duplicate on every external-file pull.
//
// Only scenes actually linked to a Space file ever get a doc created here.

import { pool } from './db.js';
import * as Automerge from '@automerge/automerge';
import { seedSceneDoc } from './crdt/seeders.js';
import { changeAttribution, parseAttribution } from './crdt/repo.js';

let crdtRepo = null;

async function nextSceneRevisionNumber(sceneId) {
  const { rows } = await pool.query(
    'SELECT revision_number FROM screenplay_revisions WHERE scene_id = $1 ORDER BY revision_number DESC LIMIT 1',
    [sceneId],
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
};

function blocksEqual(a, b) {
  const aList = a || [];
  const bList = b || [];
  if (aList.length !== bList.length) return false;
  return aList.every((block, i) => (block.blockType || 'action') === (bList[i].blockType || bList[i].block_type || 'action')
    && (block.text || '') === (bList[i].text || ''));
}

/** Projects a scene CRDT doc's current value into `screenplay_scene`/`screenplay_block`/`screenplay_revisions`, skipping if nothing actually changed. */
async function materializeSceneDoc(sceneId, doc) {
  const slugline = doc.slugline || '';
  const blocks = (doc.blocks || []).map((b) => ({ blockType: b.blockType || 'action', text: b.text || '', metadata: b.metadata || null }));

  const sceneRows = await pool.query(
    'SELECT screenplay_id, slugline, location, time_of_day, is_interior, synopsis FROM screenplay_scene WHERE scene_id = $1',
    [sceneId],
  );
  if (sceneRows.rows.length === 0) return;
  const existingScene = sceneRows.rows[0];

  const blockRows = await pool.query(
    'SELECT block_type, text FROM screenplay_block WHERE scene_id = $1 ORDER BY block_index ASC',
    [sceneId],
  );
  const existingBlocks = blockRows.rows;

  const unchanged = (existingScene.slugline || '') === slugline && blocksEqual(existingBlocks, blocks);
  if (unchanged) return;

  const { userId, source } = lastChangeAttribution(doc);
  const revisionReason = REVISION_REASON_BY_SOURCE[source] || 'Synced';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE screenplay_scene SET slugline = $1, updated_at = now() WHERE scene_id = $2', [slugline, sceneId]);
    await client.query('DELETE FROM screenplay_block WHERE scene_id = $1', [sceneId]);
    for (let i = 0; i < blocks.length; i++) {
      await client.query(
        'INSERT INTO screenplay_block (screenplay_id, scene_id, block_index, block_type, text, metadata) VALUES ($1, $2, $3, $4, $5, $6)',
        [existingScene.screenplay_id, sceneId, i, blocks[i].blockType, blocks[i].text, blocks[i].metadata],
      );
    }

    const revisionNumber = await nextSceneRevisionNumber(sceneId);
    await client.query(
      `INSERT INTO screenplay_revisions
         (screenplay_title_id, scene_id, prev_content, new_content, created_by, revision_number, revision_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        existingScene.screenplay_id, sceneId,
        JSON.stringify({ slugline: existingScene.slugline, blocks: existingBlocks }),
        JSON.stringify({ slugline, blocks }),
        userId || null, revisionNumber, revisionReason,
      ],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function attachMaterializationListener(sceneId, docKey) {
  const handle = await crdtRepo.find(docKey);
  await handle.whenReady();
  handle.on('change', ({ doc }) => {
    materializeSceneDoc(sceneId, doc).catch((err) => {
      console.error('[screenplaySceneCrdtSync] materialization failed for scene', sceneId, err);
    });
  });
}

/** Returns the doc_key for sceneId's CRDT doc, creating (and seeding from the scene's current DB rows) one if it doesn't exist yet, and attaching the materialization listener either way. */
export async function ensureSceneCrdtDoc(sceneId) {
  if (!crdtRepo) throw new Error('CRDT repo is not yet initialized');

  const existing = await pool.query(
    "SELECT doc_key FROM crdt_documents WHERE doc_type = 'scene' AND scene_id = $1",
    [sceneId],
  );
  if (existing.rows.length > 0) {
    const docKey = existing.rows[0].doc_key;
    await attachMaterializationListener(sceneId, docKey);
    return docKey;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const raced = await client.query(
      "SELECT doc_key FROM crdt_documents WHERE doc_type = 'scene' AND scene_id = $1",
      [sceneId],
    );
    if (raced.rows.length > 0) {
      await client.query('COMMIT');
      const docKey = raced.rows[0].doc_key;
      await attachMaterializationListener(sceneId, docKey);
      return docKey;
    }

    const seeded = await seedSceneDoc(client, sceneId);
    if (!seeded) {
      await client.query('ROLLBACK');
      throw new Error(`Scene ${sceneId} not found`);
    }

    const handle = crdtRepo.create(seeded.value);
    handle.change((d) => { Object.assign(d, seeded.value); }, {
      message: changeAttribution(null, 'scene-space-sync'),
      time: Math.floor(Date.now() / 1000),
    });

    await client.query(
      `INSERT INTO crdt_documents
         (doc_key, story_title_id, chapter_id, branch_id, screenplay_id, scene_id, doc_type, is_canonical, owner_user_id, created_by)
       VALUES ($1, NULL, NULL, NULL, $2, $3, 'scene', true, NULL, NULL)`,
      [handle.documentId, seeded.entity.screenplayId, seeded.entity.sceneId],
    );
    await client.query('COMMIT');

    await attachMaterializationListener(sceneId, handle.documentId);
    return handle.documentId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Ensures the doc exists, then returns its live, ready-to-use handle. */
export async function getSceneCrdtHandle(sceneId) {
  const docKey = await ensureSceneCrdtDoc(sceneId);
  const handle = await crdtRepo.find(docKey);
  await handle.whenReady();
  return handle;
}

/** Call once at server startup, right after crdtRepo is created — attaches the materialization listener for every scene doc that already exists. */
export async function initSceneCrdtSync(crdtRepoInstance) {
  crdtRepo = crdtRepoInstance;
  try {
    const { rows } = await pool.query("SELECT scene_id, doc_key FROM crdt_documents WHERE doc_type = 'scene'");
    for (const row of rows) {
      await attachMaterializationListener(row.scene_id, row.doc_key);
    }
    console.log(`[init] attached scene CRDT materialization listeners for ${rows.length} scene doc(s)`);
  } catch (err) {
    console.error('[init] failed to attach scene CRDT materialization listeners:', err);
  }
}
