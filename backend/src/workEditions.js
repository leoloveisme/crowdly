// Editions and translations for screenplays and comics — the story page's
// EditionPicker / LanguageSwitcher back-ends for other kinds (see editions.js
// and translations.js for stories).
//
// Edition: a named, frozen version. Screenplays pick, per element, the base
// text or one of its branches; comics pick, per page, the page or one of its
// alternatives. Anyone who can read the work may build one; drafts are seen
// by their creator and the team.
//
// Translation: a new, unpublished work in another language, in the same
// translation group, with scenes/issues/pages pointing at what they translate.
// Who may translate is the original's translation_policy.

import express from 'express';
import { pool } from './db.js';
import { requireAuth } from './sessions.js';
import { ProviderError } from './ai/providers.js';
import { usableConnection, checkJobQuota } from './ai/router.js';
import { enqueueJob } from './ai/jobs.js';
import { canUsePolicy, canView, isTeam, isUuid, loadWork, optionalUserId, viewDeniedMessage } from './workAccess.js';

const router = express.Router();

const groupIdOf = (kind, work) => work.translation_group_id ?? work[kind === 'comic' ? 'comic_id' : 'screenplay_id'];

// ---------------------------------------------------------------------------
// Edition snapshots
// ---------------------------------------------------------------------------

const EDITIONS = {
  screenplay: {
    base: '/screenplays',
    single: '/screenplay-editions',
    table: 'screenplay_editions',
    parts: 'screenplay_edition_scenes',
    workId: 'screenplay_id',
    // { sceneId: { blockId: branchId } } -> rows to insert
    async resolve(db, workId, selections = {}) {
      const scenes = await db.query(
        'SELECT scene_id, slugline FROM screenplay_scene WHERE screenplay_id = $1 ORDER BY scene_index',
        [workId],
      );
      const blocks = await db.query(
        'SELECT block_id, scene_id, block_type, text FROM screenplay_block WHERE screenplay_id = $1 ORDER BY block_index',
        [workId],
      );
      const branches = await db.query('SELECT id, block_id, branch_text FROM screenplay_block_branches WHERE screenplay_id = $1', [
        workId,
      ]);
      const branchById = new Map(branches.rows.map((b) => [b.id, b]));
      return scenes.rows.map((scene) => {
        const chosen = {};
        const picks = selections[scene.scene_id] ?? {};
        const snapshot = blocks.rows
          .filter((b) => b.scene_id === scene.scene_id)
          .map((b) => {
            const branch = branchById.get(picks[b.block_id]);
            if (branch && branch.block_id === b.block_id) chosen[b.block_id] = branch.id;
            return { block_id: b.block_id, block_type: b.block_type, text: branch ? branch.branch_text : b.text };
          });
        return { partId: scene.scene_id, title: scene.slugline, selections: chosen, snapshot };
      });
    },
    insertPart: (db, editionId, position, part) =>
      db.query(
        `INSERT INTO screenplay_edition_scenes (edition_id, position, scene_id, slugline, selections, snapshot_blocks)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [editionId, position, part.partId, part.title, JSON.stringify(part.selections), JSON.stringify(part.snapshot)],
      ),
    partsSelect:
      'SELECT position, scene_id AS part_id, slugline AS title, selections, snapshot_blocks AS snapshot FROM screenplay_edition_scenes',
  },
  comic: {
    base: '/comics',
    single: '/comic-editions',
    table: 'comic_editions',
    parts: 'comic_edition_issues',
    workId: 'comic_id',
    // { issueId: { pageId: branchId } }
    async resolve(db, workId, selections = {}) {
      const issues = await db.query('SELECT issue_id, title FROM comic_issue WHERE comic_id = $1 ORDER BY issue_index', [workId]);
      const pages = await db.query(
        'SELECT page_id, issue_id, image_url, overlays, alt_text FROM comic_page WHERE comic_id = $1 ORDER BY page_index',
        [workId],
      );
      const branches = await db.query('SELECT id, page_id, image_url, overlays FROM comic_page_branches WHERE comic_id = $1', [
        workId,
      ]);
      const branchById = new Map(branches.rows.map((b) => [b.id, b]));
      return issues.rows.map((issue) => {
        const chosen = {};
        const picks = selections[issue.issue_id] ?? {};
        const snapshot = pages.rows
          .filter((p) => p.issue_id === issue.issue_id)
          .map((p) => {
            const branch = branchById.get(picks[p.page_id]);
            if (branch && branch.page_id === p.page_id) chosen[p.page_id] = branch.id;
            return {
              page_id: p.page_id,
              image_url: branch ? branch.image_url : p.image_url,
              overlays: branch ? branch.overlays : p.overlays,
              alt_text: p.alt_text,
            };
          });
        return { partId: issue.issue_id, title: issue.title, selections: chosen, snapshot };
      });
    },
    insertPart: (db, editionId, position, part) =>
      db.query(
        `INSERT INTO comic_edition_issues (edition_id, position, issue_id, title, selections, snapshot_pages)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [editionId, position, part.partId, part.title, JSON.stringify(part.selections), JSON.stringify(part.snapshot)],
      ),
    partsSelect:
      'SELECT position, issue_id AS part_id, title, selections, snapshot_pages AS snapshot FROM comic_edition_issues',
  },
};

for (const [kind, cfg] of Object.entries(EDITIONS)) {
  const writeParts = async (db, editionId, workId, selections) => {
    const parts = await cfg.resolve(db, workId, selections);
    await db.query(`DELETE FROM ${cfg.parts} WHERE edition_id = $1`, [editionId]);
    for (let i = 0; i < parts.length; i += 1) await cfg.insertPart(db, editionId, i, parts[i]);
  };
  const loadEdition = async (db, id) =>
    isUuid(id) ? (await db.query(`SELECT * FROM ${cfg.table} WHERE id = $1`, [id])).rows[0] ?? null : null;
  const canManage = (edition, work, userId) =>
    Boolean(userId && (edition.created_by === userId || work.creator_id === userId));

  router.get(`${cfg.base}/:workId/editions`, async (req, res) => {
    try {
      const userId = await optionalUserId(req);
      const work = await loadWork(pool, kind, req.params.workId);
      if (!work) return res.status(404).json({ error: 'Not found' });
      if (!(await canView(pool, kind, work, userId))) return res.status(403).json({ error: viewDeniedMessage(kind, work) });
      const team = await isTeam(pool, kind, work, userId);
      const { rows } = await pool.query(
        `SELECT e.id, e.name, e.description, e.status, e.created_by, e.snapshot_at, e.created_at,
                COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), u.email) AS creator_name,
                (SELECT count(*) FROM ${cfg.parts} c, jsonb_object_keys(c.selections) k WHERE c.edition_id = e.id)::int AS branch_count
           FROM ${cfg.table} e
           LEFT JOIN local_users u ON u.id = e.created_by
           LEFT JOIN profiles p ON p.id = e.created_by
          WHERE e.${cfg.workId} = $1 AND (e.status = 'published' OR e.created_by = $2 OR $3)
          ORDER BY e.created_at DESC`,
        [work[cfg.workId], userId, team],
      );
      res.json(rows.map((r) => ({ ...r, is_mine: Boolean(userId && r.created_by === userId) })));
    } catch (err) {
      console.error(`[GET ${cfg.base}/:id/editions] failed:`, err);
      res.status(500).json({ error: 'Failed to load editions' });
    }
  });

  router.get(`${cfg.single}/:editionId`, async (req, res) => {
    try {
      const userId = await optionalUserId(req);
      const edition = await loadEdition(pool, req.params.editionId);
      if (!edition) return res.status(404).json({ error: 'Edition not found' });
      const work = await loadWork(pool, kind, edition[cfg.workId]);
      const visible =
        work &&
        (await canView(pool, kind, work, userId)) &&
        (edition.status === 'published' || edition.created_by === userId || (await isTeam(pool, kind, work, userId)));
      if (!visible) return res.status(403).json({ error: 'Not allowed to view this edition' });
      const { rows } = await pool.query(`${cfg.partsSelect} WHERE edition_id = $1 ORDER BY position`, [edition.id]);
      res.json({ ...edition, can_manage: canManage(edition, work, userId), parts: rows });
    } catch (err) {
      console.error(`[GET ${cfg.single}/:id] failed:`, err);
      res.status(500).json({ error: 'Failed to load edition' });
    }
  });

  router.post(`${cfg.base}/:workId/editions`, requireAuth, async (req, res) => {
    const { name, description, status = 'draft', selections = {} } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (!['draft', 'published'].includes(status)) return res.status(400).json({ error: "status must be 'draft' or 'published'" });
    const client = await pool.connect();
    try {
      const work = await loadWork(client, kind, req.params.workId);
      if (!work) return res.status(404).json({ error: 'Not found' });
      if (!(await canView(client, kind, work, req.user.id))) return res.status(403).json({ error: viewDeniedMessage(kind, work) });
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO ${cfg.table} (${cfg.workId}, name, description, created_by, status) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [work[cfg.workId], name.trim(), description || null, req.user.id, status],
      );
      await writeParts(client, rows[0].id, work[cfg.workId], selections);
      await client.query('COMMIT');
      res.status(201).json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`[POST ${cfg.base}/:id/editions] failed:`, err);
      res.status(500).json({ error: 'Failed to create edition' });
    } finally {
      client.release();
    }
  });

  router.patch(`${cfg.single}/:editionId`, requireAuth, async (req, res) => {
    const { name, description, status, selections } = req.body ?? {};
    if (status !== undefined && !['draft', 'published'].includes(status)) {
      return res.status(400).json({ error: "status must be 'draft' or 'published'" });
    }
    const client = await pool.connect();
    try {
      const edition = await loadEdition(client, req.params.editionId);
      if (!edition) return res.status(404).json({ error: 'Edition not found' });
      const work = await loadWork(client, kind, edition[cfg.workId]);
      if (!work || !canManage(edition, work, req.user.id)) return res.status(403).json({ error: 'Not allowed to change this edition' });
      await client.query('BEGIN');
      const fields = ['updated_at = now()'];
      const values = [];
      if (typeof name === 'string' && name.trim()) {
        values.push(name.trim());
        fields.push(`name = $${values.length}`);
      }
      if (description !== undefined) {
        values.push(description || null);
        fields.push(`description = $${values.length}`);
      }
      if (status !== undefined) {
        values.push(status);
        fields.push(`status = $${values.length}`);
      }
      if (selections !== undefined) {
        await writeParts(client, edition.id, edition[cfg.workId], selections ?? {});
        fields.push('snapshot_at = now()');
      }
      values.push(edition.id);
      const { rows } = await client.query(
        `UPDATE ${cfg.table} SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
        values,
      );
      await client.query('COMMIT');
      res.json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`[PATCH ${cfg.single}/:id] failed:`, err);
      res.status(500).json({ error: 'Failed to update edition' });
    } finally {
      client.release();
    }
  });

  router.delete(`${cfg.single}/:editionId`, requireAuth, async (req, res) => {
    try {
      const edition = await loadEdition(pool, req.params.editionId);
      if (!edition) return res.status(404).json({ error: 'Edition not found' });
      const work = await loadWork(pool, kind, edition[cfg.workId]);
      if (!work || !canManage(edition, work, req.user.id)) return res.status(403).json({ error: 'Not allowed to delete this edition' });
      await pool.query(`DELETE FROM ${cfg.table} WHERE id = $1`, [edition.id]);
      res.status(204).send();
    } catch (err) {
      console.error(`[DELETE ${cfg.single}/:id] failed:`, err);
      res.status(500).json({ error: 'Failed to delete edition' });
    }
  });
}

// ---------------------------------------------------------------------------
// Translations
// ---------------------------------------------------------------------------

const TRANSLATIONS = {
  screenplay: {
    base: '/screenplays',
    table: 'screenplay_title',
    id: 'screenplay_id',
    source: 'source_screenplay_id',
    // Parts and how many already have text in the version's language.
    progressSql: `
      (SELECT count(*) FROM screenplay_scene s WHERE s.screenplay_id = t.screenplay_id)::int AS part_count,
      (SELECT count(*) FROM screenplay_scene s WHERE s.screenplay_id = t.screenplay_id
         AND EXISTS (SELECT 1 FROM screenplay_block b WHERE b.scene_id = s.scene_id AND btrim(b.text) <> ''))::int AS done_count`,
  },
  comic: {
    base: '/comics',
    table: 'comic_title',
    id: 'comic_id',
    source: 'source_comic_id',
    progressSql: `
      (SELECT count(*) FROM comic_page p WHERE p.comic_id = t.comic_id)::int AS part_count,
      (SELECT count(*) FROM comic_page p WHERE p.comic_id = t.comic_id
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p.overlays) o WHERE btrim(o->>'text') = ''))::int AS done_count`,
  },
};

async function copyScreenplayContent(client, source, translationId, start) {
  const scenes = await client.query('SELECT * FROM screenplay_scene WHERE screenplay_id = $1 ORDER BY scene_index', [
    source.screenplay_id,
  ]);
  for (const scene of scenes.rows) {
    const inserted = await client.query(
      `INSERT INTO screenplay_scene
         (screenplay_id, scene_index, slugline, location, time_of_day, is_interior, synopsis, published, source_scene_id, source_synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, now()) RETURNING scene_id`,
      [
        translationId,
        scene.scene_index,
        start === 'copy' ? scene.slugline : '',
        scene.location,
        scene.time_of_day,
        scene.is_interior,
        start === 'copy' ? scene.synopsis : null,
        scene.scene_id,
      ],
    );
    // Element types are kept so the translator fills in the same layout.
    await client.query(
      `INSERT INTO screenplay_block (screenplay_id, scene_id, block_index, block_type, text, metadata)
       SELECT $1, $2, block_index, block_type, CASE WHEN $4 = 'copy' THEN text ELSE '' END, metadata
         FROM screenplay_block WHERE scene_id = $3`,
      [translationId, inserted.rows[0].scene_id, scene.scene_id, start],
    );
  }
}

async function copyComicContent(client, source, translationId, start) {
  const issues = await client.query('SELECT * FROM comic_issue WHERE comic_id = $1 ORDER BY issue_index', [source.comic_id]);
  for (const issue of issues.rows) {
    const inserted = await client.query(
      `INSERT INTO comic_issue (comic_id, issue_index, title, published, source_issue_id)
       VALUES ($1, $2, $3, true, $4) RETURNING issue_id`,
      [translationId, issue.issue_index, start === 'copy' ? issue.title : '', issue.issue_id],
    );
    // Same artwork; the text layers keep their positions, and their text is
    // kept ('copy') or emptied for the translator ('blank' / 'ai').
    await client.query(
      `INSERT INTO comic_page (comic_id, issue_id, page_index, image_url, alt_text, width, height, source_page_id, overlays)
       SELECT $1, $2, page_index, image_url, alt_text, width, height, page_id,
              CASE WHEN $4 = 'copy' THEN overlays
                   ELSE COALESCE((SELECT jsonb_agg(o || '{"text": ""}'::jsonb) FROM jsonb_array_elements(overlays) o), '[]'::jsonb)
              END
         FROM comic_page WHERE issue_id = $3`,
      [translationId, inserted.rows[0].issue_id, issue.issue_id, start],
    );
  }
}

for (const [kind, cfg] of Object.entries(TRANSLATIONS)) {
  router.get(`${cfg.base}/:workId/translations`, async (req, res) => {
    try {
      const userId = await optionalUserId(req);
      const work = await loadWork(pool, kind, req.params.workId);
      if (!work) return res.status(404).json({ error: 'Not found' });
      if (!(await canView(pool, kind, work, userId))) return res.status(403).json({ error: viewDeniedMessage(kind, work) });
      const groupId = groupIdOf(kind, work);
      const original = (await loadWork(pool, kind, groupId)) ?? work;
      const { rows } = await pool.query(
        `SELECT t.*, ${cfg.progressSql},
                COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), u.email) AS creator_name
           FROM ${cfg.table} t
           LEFT JOIN local_users u ON u.id = t.creator_id
           LEFT JOIN profiles p ON p.id = t.creator_id
          WHERE t.${cfg.id} = $1 OR t.translation_group_id = $1
          ORDER BY (t.${cfg.id} = $1) DESC, t.is_official_translation DESC, t.language, t.created_at`,
        [groupId],
      );
      const versions = [];
      for (const row of rows) {
        const team = await isTeam(pool, kind, row, userId);
        if (!team && (row.published === false || !(await canView(pool, kind, row, userId)))) continue;
        versions.push({
          // Named like story versions so the shared LanguageSwitcher can list them.
          story_title_id: row[cfg.id],
          title: row.title,
          language: row.language,
          published: row.published,
          is_original: row[cfg.id] === groupId,
          is_official: row.is_official_translation,
          source_story_title_id: row[cfg.source],
          creator_name: row.creator_name,
          chapter_count: row.part_count,
          translated_count: row.done_count,
          stale_count: 0,
          is_mine: team,
        });
      }
      res.json({
        group_id: groupId,
        can_translate: await canUsePolicy(pool, kind, original, userId, 'translation_policy', 'translate'),
        can_mark_official: Boolean(userId && original.creator_id === userId),
        versions,
      });
    } catch (err) {
      console.error(`[GET ${cfg.base}/:id/translations] failed:`, err);
      res.status(500).json({ error: 'Failed to load translations' });
    }
  });

  // { language, start: 'blank' | 'copy' | 'ai', connectionId? }
  router.post(`${cfg.base}/:workId/translations`, requireAuth, async (req, res) => {
    const { language, start = 'blank' } = req.body ?? {};
    const userId = req.user.id;
    if (typeof language !== 'string' || !language) return res.status(400).json({ error: 'language is required' });
    if (!['blank', 'copy', 'ai'].includes(start)) return res.status(400).json({ error: "start must be 'blank', 'copy' or 'ai'" });
    let aiConnection = null;
    if (start === 'ai') {
      try {
        aiConnection = await usableConnection(userId, req.body?.connectionId, 'translate');
      } catch (err) {
        if (err instanceof ProviderError) return res.status(400).json({ error: err.message });
        throw err;
      }
    }
    const client = await pool.connect();
    try {
      const source = await loadWork(client, kind, req.params.workId);
      if (!source) return res.status(404).json({ error: 'Not found' });
      if (!(await canView(client, kind, source, userId))) return res.status(403).json({ error: viewDeniedMessage(kind, source) });
      const groupId = groupIdOf(kind, source);
      const original = (await loadWork(client, kind, groupId)) ?? source;
      if (!(await canUsePolicy(client, kind, original, userId, 'translation_policy', 'translate'))) {
        return res.status(403).json({ error: `You do not have permission to translate this ${kind}.` });
      }
      const locale = await client.query('SELECT code FROM locales WHERE code = $1 AND enabled', [language]);
      if (locale.rows.length === 0) return res.status(400).json({ error: 'Unsupported language' });
      if ((source.language || 'en') === language) return res.status(400).json({ error: `The ${kind} is already in this language` });

      await client.query('BEGIN');
      const common = [source.title, userId, source.visibility ?? 'public', language, source.cover_image_url, source.description, source.tags, source.genre, groupId, source[cfg.id], source.clone_policy ?? 'anyone', source.export_policy ?? 'anyone', original.translation_policy ?? 'anyone'];
      const { rows } =
        kind === 'screenplay'
          ? await client.query(
              `INSERT INTO screenplay_title
                 (title, creator_id, visibility, published, language, cover_image_url, description, tags, genre,
                  translation_group_id, source_screenplay_id, clone_policy, export_policy, translation_policy, format_type)
               VALUES ($1, $2, $3, false, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
              [...common, source.format_type],
            )
          : await client.query(
              `INSERT INTO comic_title
                 (title, creator_id, visibility, published, language, cover_image_url, description, tags, genre,
                  translation_group_id, source_comic_id, clone_policy, export_policy, translation_policy, reading_direction)
               VALUES ($1, $2, $3, false, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
              [...common, source.reading_direction ?? 'ltr'],
            );
      const translation = rows[0];
      const translationId = translation[cfg.id];
      await client.query(
        `UPDATE ${cfg.table} SET translation_group_id = $1 WHERE ${cfg.id} = $1 AND translation_group_id IS NULL`,
        [groupId],
      );
      if (kind === 'screenplay') {
        await copyScreenplayContent(client, source, translationId, start);
        await client.query(
          "INSERT INTO screenplay_access (screenplay_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING",
          [translationId, userId],
        );
      } else {
        await copyComicContent(client, source, translationId, start);
      }
      await client.query('COMMIT');

      if (aiConnection) {
        const parts =
          kind === 'screenplay'
            ? await pool.query('SELECT scene_id AS id FROM screenplay_scene WHERE screenplay_id = $1', [translationId])
            : await pool.query('SELECT issue_id AS id FROM comic_issue WHERE comic_id = $1', [translationId]);
        try {
          await checkJobQuota(userId, parts.rows.length);
          for (const part of parts.rows) {
            await enqueueJob(pool, {
              userId,
              connectionId: aiConnection.id,
              kind: kind === 'screenplay' ? 'translate_scene' : 'translate_issue',
              work: kind === 'screenplay' ? { screenplayId: translationId, sceneId: part.id } : { comicId: translationId, issueId: part.id },
            });
          }
        } catch (err) {
          return res.status(201).json({ ...translation, id: translationId, ai_error: err instanceof ProviderError ? err.message : 'Could not start AI drafts' });
        }
      }
      res.status(201).json({ ...translation, id: translationId });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`[POST ${cfg.base}/:id/translations] failed:`, err);
      res.status(500).json({ error: 'Failed to create translation' });
    } finally {
      client.release();
    }
  });

  // { official } — only the original's owner; one official translation per language.
  router.patch(`${cfg.base}/:workId/official`, requireAuth, async (req, res) => {
    const official = Boolean(req.body?.official);
    const client = await pool.connect();
    try {
      const translation = await loadWork(client, kind, req.params.workId);
      if (!translation) return res.status(404).json({ error: 'Not found' });
      if (!translation[cfg.source] || !translation.translation_group_id) {
        return res.status(400).json({ error: `This ${kind} is not a translation` });
      }
      const original = await loadWork(client, kind, translation.translation_group_id);
      if (!original || original.creator_id !== req.user.id) {
        return res.status(403).json({ error: 'Only the original owner can mark official translations' });
      }
      await client.query('BEGIN');
      if (official) {
        await client.query(
          `UPDATE ${cfg.table} SET is_official_translation = false
            WHERE translation_group_id = $1 AND language = $2 AND ${cfg.id} <> $3`,
          [translation.translation_group_id, translation.language, translation[cfg.id]],
        );
      }
      const { rows } = await client.query(
        `UPDATE ${cfg.table} SET is_official_translation = $1 WHERE ${cfg.id} = $2 RETURNING *`,
        [official, translation[cfg.id]],
      );
      await client.query('COMMIT');
      res.json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`[PATCH ${cfg.base}/:id/official] failed:`, err);
      res.status(500).json({ error: 'Failed to update official translation' });
    } finally {
      client.release();
    }
  });
}

export default router;
