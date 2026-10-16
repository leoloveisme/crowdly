// Proposals ("suggest changes") for screenplays and comics, and screenplay
// block branches — the story page's contribution flow for other kinds.
//
// Readers who aren't on a work's team can't change its content directly;
// their edits are stored as crdt_proposals rows and applied when the owner
// approves them (POST /proposals/:id/approve in server.js delegates here).
// Branches are alternatives, not replacements, so any signed-in reader may
// add one, like paragraph branches on stories.

import express from 'express';
import { pool } from './db.js';
import { requireAuth } from './sessions.js';
import {
  canView,
  isOwner,
  isPlatformAdminOrEditor,
  isUuid,
  loadWork,
  optionalUserId,
  viewDeniedMessage,
  writeAccess,
} from './workAccess.js';

const router = express.Router();

// targetType -> the column holding its target id (null: the work itself).
const TARGETS = {
  screenplay: {
    screenplay_title: null,
    scene: 'target_scene_id',
    block: 'target_block_id',
    block_branch: 'target_branch_id',
  },
  comic: {
    comic_title: null,
    issue: 'target_issue_id',
    page_layer: 'target_page_id',
  },
};

const BODY_FIELD = {
  target_scene_id: 'targetSceneId',
  target_block_id: 'targetBlockId',
  target_branch_id: 'targetBranchId',
  target_issue_id: 'targetIssueId',
  target_page_id: 'targetPageId',
};

// Does the target row belong to this work?
async function targetBelongs(kind, workId, column, targetId) {
  const sql = {
    target_scene_id: 'SELECT 1 FROM screenplay_scene WHERE scene_id = $1 AND screenplay_id = $2',
    target_block_id: 'SELECT 1 FROM screenplay_block WHERE block_id = $1 AND screenplay_id = $2',
    target_branch_id: 'SELECT 1 FROM screenplay_block_branches WHERE id = $1 AND screenplay_id = $2',
    target_issue_id: 'SELECT 1 FROM comic_issue WHERE issue_id = $1 AND comic_id = $2',
    target_page_id: 'SELECT 1 FROM comic_page WHERE page_id = $1 AND comic_id = $2',
  }[column];
  const { rows } = await pool.query(sql, [targetId, workId]);
  return rows.length > 0;
}

// Words in a proposal, for the Contributions tab (layers: their texts).
function proposalWords(targetType, text) {
  let plain = text;
  if (targetType === 'page_layer') {
    try {
      plain = JSON.parse(text).map((o) => o.text ?? '').join(' ');
    } catch {
      plain = '';
    }
  }
  return String(plain).trim().split(/\s+/).filter(Boolean).length;
}

for (const [kind, base, idColumn] of [
  ['screenplay', '/screenplays', 'screenplay_id'],
  ['comic', '/comics', 'comic_id'],
]) {
  router.post(`${base}/:workId/proposals`, requireAuth, async (req, res) => {
    const { targetType, proposedText } = req.body ?? {};
    const userId = req.user.id;
    try {
      const work = await loadWork(pool, kind, req.params.workId);
      if (!work) return res.status(404).json({ error: 'Not found' });
      if (!(await canView(pool, kind, work, userId))) {
        return res.status(403).json({ error: viewDeniedMessage(kind, work) });
      }
      const { role } = await writeAccess(pool, kind, work, userId);
      if (!role) return res.status(403).json({ error: `This ${kind} is not open for suggestions` });
      if (!(targetType in TARGETS[kind])) return res.status(400).json({ error: 'Unknown targetType' });
      if (typeof proposedText !== 'string') return res.status(400).json({ error: 'proposedText is required' });
      if (targetType === 'page_layer') {
        try {
          if (!Array.isArray(JSON.parse(proposedText))) throw new Error();
        } catch {
          return res.status(400).json({ error: 'page_layer proposals carry a JSON array of overlays' });
        }
      }

      const column = TARGETS[kind][targetType];
      const targetId = column ? req.body[BODY_FIELD[column]] : null;
      if (column && (!isUuid(targetId) || !(await targetBelongs(kind, work[idColumn], column, targetId)))) {
        return res.status(400).json({ error: 'Invalid proposal target' });
      }

      const { rows } = await pool.query(
        `INSERT INTO crdt_proposals (${idColumn}, target_type, ${column ?? 'target_path'}, proposed_text, author_user_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [work[idColumn], targetType, column ? targetId : null, proposedText, userId],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(`[POST ${base}/:id/proposals] failed:`, err);
      res.status(500).json({ error: 'Failed to create proposal' });
    }
  });

  // Proposals with what they target, newest first (the Contributions tab).
  router.get(`${base}/:workId/proposals`, async (req, res) => {
    try {
      const work = await loadWork(pool, kind, req.params.workId);
      if (!work) return res.status(404).json({ error: 'Not found' });
      const userId = await optionalUserId(req);
      if (!(await canView(pool, kind, work, userId))) {
        return res.status(403).json({ error: viewDeniedMessage(kind, work) });
      }
      const status = ['undecided', 'approved', 'declined'].includes(req.query.status) ? req.query.status : null;
      const context =
        kind === 'screenplay'
          ? `COALESCE(sc.slugline, bsc.slugline, brsc.slugline) AS part_title,
             COALESCE(b.text, br.branch_text) AS current_text,
             COALESCE(sc.scene_id, b.scene_id, brb.scene_id) AS part_id
             FROM crdt_proposals p
             LEFT JOIN screenplay_scene sc ON sc.scene_id = p.target_scene_id
             LEFT JOIN screenplay_block b ON b.block_id = p.target_block_id
             LEFT JOIN screenplay_scene bsc ON bsc.scene_id = b.scene_id
             LEFT JOIN screenplay_block_branches br ON br.id = p.target_branch_id
             LEFT JOIN screenplay_block brb ON brb.block_id = br.block_id
             LEFT JOIN screenplay_scene brsc ON brsc.scene_id = brb.scene_id`
          : `COALESCE(i.title, pi.title) AS part_title,
             CASE WHEN pg.page_id IS NOT NULL THEN pg.overlays::text ELSE i.title END AS current_text,
             COALESCE(i.issue_id, pg.issue_id) AS part_id
             FROM crdt_proposals p
             LEFT JOIN comic_issue i ON i.issue_id = p.target_issue_id
             LEFT JOIN comic_page pg ON pg.page_id = p.target_page_id
             LEFT JOIN comic_issue pi ON pi.issue_id = pg.issue_id`;
      const { rows } = await pool.query(
        `SELECT p.*, u.email AS author_email, ${context}
           LEFT JOIN local_users u ON u.id = p.author_user_id
          WHERE p.${idColumn} = $1 ${status ? 'AND p.status = $2' : ''}
          ORDER BY p.created_at DESC`,
        status ? [work[idColumn], status] : [work[idColumn]],
      );
      res.json(rows.map((r) => ({ ...r, words: proposalWords(r.target_type, r.proposed_text) })));
    } catch (err) {
      console.error(`[GET ${base}/:id/proposals] failed:`, err);
      res.status(500).json({ error: 'Failed to fetch proposals' });
    }
  });
}

/**
 * Approves or declines a screenplay/comic proposal (owner or platform staff).
 * Called by POST /proposals/:id/approve|decline in server.js. `afterApply`
 * receives { sceneId } when a screenplay scene changed, so server.js can push
 * it to a linked Space file.
 */
export async function decideWorkProposal(req, res, proposalId, approve, afterApply) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM crdt_proposals WHERE id = $1 FOR UPDATE', [proposalId]);
    const proposal = rows[0];
    if (!proposal) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Proposal not found' });
    }
    const kind = proposal.screenplay_id ? 'screenplay' : 'comic';
    const work = await loadWork(client, kind, proposal.screenplay_id ?? proposal.comic_id);
    const allowed =
      work && ((await isOwner(client, kind, work, req.user.id)) || (await isPlatformAdminOrEditor(req.user.id)));
    if (!allowed) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: `Only the ${kind} owner may decide proposals` });
    }
    if (proposal.status !== 'undecided') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Proposal already ${proposal.status}` });
    }

    let sceneId = null;
    if (approve) {
      const text = proposal.proposed_text;
      switch (proposal.target_type) {
        case 'screenplay_title':
          await client.query('UPDATE screenplay_title SET title = $1, updated_at = now() WHERE screenplay_id = $2', [
            text,
            proposal.screenplay_id,
          ]);
          break;
        case 'scene': {
          const prev = await client.query('SELECT * FROM screenplay_scene WHERE scene_id = $1', [proposal.target_scene_id]);
          await client.query('UPDATE screenplay_scene SET slugline = $1, updated_at = now() WHERE scene_id = $2', [
            text,
            proposal.target_scene_id,
          ]);
          await logScreenplayRevision(client, proposal, proposal.target_scene_id, { slugline: prev.rows[0]?.slugline }, { slugline: text }, 'Suggested scene heading approved');
          sceneId = proposal.target_scene_id;
          break;
        }
        case 'block': {
          const prev = await client.query('SELECT * FROM screenplay_block WHERE block_id = $1', [proposal.target_block_id]);
          const block = prev.rows[0];
          if (block) {
            await client.query('UPDATE screenplay_block SET text = $1, updated_at = now() WHERE block_id = $2', [
              text,
              block.block_id,
            ]);
            await logScreenplayRevision(
              client,
              proposal,
              block.scene_id,
              { block_id: block.block_id, block_type: block.block_type, text: block.text, block_index: block.block_index },
              { block_id: block.block_id, block_type: block.block_type, text, block_index: block.block_index },
              'Suggested edit approved',
            );
            sceneId = block.scene_id;
          }
          break;
        }
        case 'block_branch':
          await client.query(
            'UPDATE screenplay_block_branches SET branch_text = $1, updated_at = now() WHERE id = $2',
            [text, proposal.target_branch_id],
          );
          break;
        case 'comic_title':
          await client.query('UPDATE comic_title SET title = $1, updated_at = now() WHERE comic_id = $2', [
            text,
            proposal.comic_id,
          ]);
          break;
        case 'issue':
          await client.query('UPDATE comic_issue SET title = $1, updated_at = now() WHERE issue_id = $2', [
            text,
            proposal.target_issue_id,
          ]);
          break;
        case 'page_layer':
          await client.query('UPDATE comic_page SET overlays = $1::jsonb WHERE page_id = $2', [
            text,
            proposal.target_page_id,
          ]);
          await client.query(
            `INSERT INTO comic_revisions (comic_id, page_id, event, detail, created_by)
             VALUES ($1, $2, 'layers_suggestion_approved', $3, $4)`,
            [proposal.comic_id, proposal.target_page_id, JSON.stringify({ proposalId }), proposal.author_user_id],
          );
          break;
        default:
          break;
      }
    }

    await client.query('UPDATE crdt_proposals SET status = $1, decided_at = now(), decided_by = $2 WHERE id = $3', [
      approve ? 'approved' : 'declined',
      req.user.id,
      proposalId,
    ]);
    await client.query('COMMIT');
    if (sceneId && afterApply) await afterApply({ sceneId, userId: proposal.author_user_id });
    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[decideWorkProposal] failed:', err);
    res.status(500).json({ error: 'Failed to decide proposal' });
  } finally {
    client.release();
  }
}

async function logScreenplayRevision(client, proposal, sceneId, prev, next, reason) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(revision_number), 0) + 1 AS n FROM screenplay_revisions
      WHERE screenplay_title_id = $1 AND scene_id IS NOT DISTINCT FROM $2`,
    [proposal.screenplay_id, sceneId],
  );
  await client.query(
    `INSERT INTO screenplay_revisions
       (screenplay_title_id, scene_id, prev_content, new_content, created_by, revision_number, revision_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [proposal.screenplay_id, sceneId, JSON.stringify(prev), JSON.stringify(next), proposal.author_user_id, rows[0].n, reason],
  );
}

// ---------------------------------------------------------------------------
// Screenplay block branches
// ---------------------------------------------------------------------------

const branchRow = (r) => ({
  id: r.id,
  block_id: r.block_id,
  screenplay_id: r.screenplay_id,
  text: r.branch_text,
  block_type: r.block_type,
  name: r.name,
  language: r.language,
  metadata: r.metadata,
  user_id: r.user_id,
  author_email: r.author_email ?? null,
  scene_id: r.scene_id ?? null,
  created_at: r.created_at,
});

router.get('/screenplays/:workId/branches', async (req, res) => {
  try {
    const work = await loadWork(pool, 'screenplay', req.params.workId);
    if (!work) return res.status(404).json({ error: 'Screenplay not found' });
    if (!(await canView(pool, 'screenplay', work, await optionalUserId(req)))) {
      return res.status(403).json({ error: viewDeniedMessage('screenplay', work) });
    }
    const { rows } = await pool.query(
      `SELECT br.*, b.scene_id, u.email AS author_email
         FROM screenplay_block_branches br
         JOIN screenplay_block b ON b.block_id = br.block_id
         LEFT JOIN local_users u ON u.id = br.user_id
        WHERE br.screenplay_id = $1
        ORDER BY br.created_at ASC`,
      [work.screenplay_id],
    );
    res.json(rows.map(branchRow));
  } catch (err) {
    console.error('[GET /screenplays/:id/branches] failed:', err);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

router.post('/screenplay-blocks/:blockId/branches', requireAuth, async (req, res) => {
  const { text, name, language } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text is required' });
  try {
    const blockRes = await pool.query('SELECT * FROM screenplay_block WHERE block_id = $1', [
      isUuid(req.params.blockId) ? req.params.blockId : null,
    ]);
    const block = blockRes.rows[0];
    if (!block) return res.status(404).json({ error: 'Element not found' });
    const work = await loadWork(pool, 'screenplay', block.screenplay_id);
    if (!(await canView(pool, 'screenplay', work, req.user.id))) {
      return res.status(403).json({ error: viewDeniedMessage('screenplay', work) });
    }
    const { rows } = await pool.query(
      `INSERT INTO screenplay_block_branches (block_id, screenplay_id, branch_text, block_type, name, language, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [block.block_id, block.screenplay_id, text, block.block_type, name || null, language || work.language || 'en', req.user.id],
    );
    res.status(201).json(branchRow({ ...rows[0], scene_id: block.scene_id }));
  } catch (err) {
    console.error('[POST /screenplay-blocks/:id/branches] failed:', err);
    res.status(500).json({ error: 'Failed to create branch' });
  }
});

// Owner, the branch's author or platform staff may change/delete a branch;
// other readers suggest a new text (block_branch proposal) instead.
async function authorizeBranch(req, res) {
  const { rows } = await pool.query('SELECT * FROM screenplay_block_branches WHERE id = $1', [
    isUuid(req.params.branchId) ? req.params.branchId : null,
  ]);
  const branch = rows[0];
  if (!branch) {
    res.status(404).json({ error: 'Branch not found' });
    return null;
  }
  if (branch.user_id === req.user.id) return branch;
  const work = await loadWork(pool, 'screenplay', branch.screenplay_id);
  if ((await isOwner(pool, 'screenplay', work, req.user.id)) || (await isPlatformAdminOrEditor(req.user.id))) {
    return branch;
  }
  res.status(403).json({ error: 'Only the screenplay owner or the branch author can change this branch' });
  return null;
}

router.patch('/screenplay-block-branches/:branchId', requireAuth, async (req, res) => {
  const { text, name, language, metadata } = req.body ?? {};
  try {
    const branch = await authorizeBranch(req, res);
    if (!branch) return;
    const { rows } = await pool.query(
      `UPDATE screenplay_block_branches
          SET branch_text = COALESCE($1, branch_text),
              name = CASE WHEN $2::boolean THEN $3 ELSE name END,
              language = COALESCE($4, language),
              metadata = CASE WHEN $5::boolean THEN $6::jsonb ELSE metadata END,
              updated_at = now()
        WHERE id = $7 RETURNING *`,
      [
        typeof text === 'string' && text.trim() ? text : null,
        name !== undefined,
        name || null,
        language || null,
        metadata !== undefined,
        metadata === undefined ? null : JSON.stringify(metadata),
        branch.id,
      ],
    );
    res.json(branchRow(rows[0]));
  } catch (err) {
    console.error('[PATCH /screenplay-block-branches/:id] failed:', err);
    res.status(500).json({ error: 'Failed to update branch' });
  }
});

router.delete('/screenplay-block-branches/:branchId', requireAuth, async (req, res) => {
  try {
    const branch = await authorizeBranch(req, res);
    if (!branch) return;
    await pool.query('DELETE FROM screenplay_block_branches WHERE id = $1', [branch.id]);
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /screenplay-block-branches/:id] failed:', err);
    res.status(500).json({ error: 'Failed to delete branch' });
  }
});

export default router;
