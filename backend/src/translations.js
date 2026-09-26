// Story translations.
//
// Every language version of a story is its own story_title row. Versions are
// linked through story_title.translation_group_id (= the original story's id)
// and each translated chapter points at the chapter it translates through
// stories.source_chapter_id. See backend/migrations/0002_story_translations.sql.
//
// Who may create a translation is governed by the ORIGINAL story's
// translation_policy ('anyone' | 'restricted' | 'none'), mirroring
// clone_policy/export_policy, with story_access_rules.rule_type = 'translate'
// for the restricted list.

import express from 'express';
import { pool } from './db.js';
import { requireAuth } from './sessions.js';
import { ProviderError } from './ai/providers.js';
import { usableConnection, checkJobQuota, enqueueTranslationJobs } from './ai/router.js';
import { optionalUserId, loadStory, groupIdOf, isStoryTeam, hasAccessRule, canViewStory, canUsePolicy } from './storyAccess.js';

const router = express.Router();

// GET /stories/:storyTitleId/translations
// All language versions in this story's group that the viewer may see, with
// per-version progress. Unpublished versions are only listed for their team.
router.get('/stories/:storyTitleId/translations', async (req, res) => {
  const { storyTitleId } = req.params;
  try {
    const userId = await optionalUserId(req);
    const story = await loadStory(pool, storyTitleId);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    if (!(await canViewStory(pool, story, userId))) {
      return res.status(403).json({ error: 'Not allowed to view this story' });
    }

    const groupId = groupIdOf(story);
    const original = (await loadStory(pool, groupId)) ?? story;

    const { rows } = await pool.query(
      `SELECT st.story_title_id, st.title, st.language, st.visibility, st.published,
              st.is_official_translation, st.source_story_title_id, st.creator_id,
              st.created_at,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), u.email) AS creator_name,
              (SELECT count(*) FROM stories c WHERE c.story_title_id = st.story_title_id)::int AS chapter_count,
              (SELECT count(*) FROM stories c
                WHERE c.story_title_id = st.story_title_id
                  AND EXISTS (SELECT 1 FROM unnest(c.paragraphs) para WHERE btrim(para) <> ''))::int AS translated_count,
              (SELECT count(*) FROM stories c
                 JOIN stories src ON src.chapter_id = c.source_chapter_id
                WHERE c.story_title_id = st.story_title_id
                  AND src.content_updated_at > COALESCE(c.source_synced_at, c.created_at))::int AS stale_count
         FROM story_title st
         LEFT JOIN local_users u ON u.id = st.creator_id
         LEFT JOIN profiles p ON p.id = st.creator_id
        WHERE st.story_title_id = $1 OR st.translation_group_id = $1
        ORDER BY (st.story_title_id = $1) DESC, st.is_official_translation DESC, st.language, st.created_at`,
      [groupId],
    );

    const versions = [];
    for (const row of rows) {
      const isTeam = await isStoryTeam(pool, row, userId);
      if (!isTeam) {
        if (row.published === false) continue;
        if (!(await canViewStory(pool, row, userId))) continue;
      }
      versions.push({
        story_title_id: row.story_title_id,
        title: row.title,
        language: row.language,
        published: row.published,
        is_original: row.story_title_id === groupId,
        is_official: row.is_official_translation,
        source_story_title_id: row.source_story_title_id,
        creator_name: row.creator_name,
        chapter_count: row.chapter_count,
        translated_count: row.translated_count,
        stale_count: row.stale_count,
        is_mine: isTeam,
      });
    }

    res.json({
      group_id: groupId,
      can_translate: await canUsePolicy(pool, original, userId, 'translation_policy', 'translate'),
      can_mark_official: Boolean(userId && original.creator_id === userId),
      versions,
    });
  } catch (err) {
    console.error('[GET /stories/:storyTitleId/translations] failed:', err);
    res.status(500).json({ error: 'Failed to load translations' });
  }
});

// POST /stories/:storyTitleId/translations  { language, start: 'blank' | 'copy' | 'ai', connectionId? }
// Creates a new, unpublished story in `language` owned by the requester, with
// one chapter per source chapter. `blank` leaves the text empty for the
// translator; `copy` pre-fills it with the source text to overwrite; `ai`
// starts blank and queues a machine-translation draft of every chapter using
// the requester's own AI connection.
router.post('/stories/:storyTitleId/translations', requireAuth, async (req, res) => {
  const { storyTitleId } = req.params;
  const { language, start = 'blank' } = req.body ?? {};
  const userId = req.user.id;

  if (!language || typeof language !== 'string') {
    return res.status(400).json({ error: 'language is required' });
  }
  if (!['blank', 'copy', 'ai'].includes(start)) {
    return res.status(400).json({ error: "start must be 'blank', 'copy' or 'ai'" });
  }
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
    const source = await loadStory(client, storyTitleId);
    if (!source) return res.status(404).json({ error: 'Story not found' });
    if (!(await canViewStory(client, source, userId))) {
      return res.status(403).json({ error: 'Not allowed to view this story' });
    }

    const groupId = groupIdOf(source);
    const original = (await loadStory(client, groupId)) ?? source;
    if (!(await canUsePolicy(client, original, userId, 'translation_policy', 'translate'))) {
      return res.status(403).json({ error: 'You do not have permission to translate this story.' });
    }

    const locale = await client.query('SELECT code FROM locales WHERE code = $1 AND enabled', [language]);
    if (locale.rows.length === 0) {
      return res.status(400).json({ error: 'Unsupported language' });
    }
    if ((source.language || 'en') === language) {
      return res.status(400).json({ error: 'The story is already in this language' });
    }

    await client.query('BEGIN');

    const insertTitle = await client.query(
      `INSERT INTO story_title
         (title, creator_id, initiator_id, visibility, published, language, cover_image_url, description, tags, genre,
          translation_group_id, source_story_title_id, clone_policy, export_policy, translation_policy)
       VALUES ($1, $2, $2, $3, false, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        source.title,
        userId,
        source.visibility ?? 'public',
        language,
        source.cover_image_url ?? null,
        source.description ?? null,
        source.tags ?? null,
        source.genre ?? null,
        groupId,
        source.story_title_id,
        source.clone_policy ?? 'anyone',
        source.export_policy ?? 'anyone',
        original.translation_policy ?? 'anyone',
      ],
    );
    const translation = insertTitle.rows[0];

    // The original becomes the anchor of its group the first time it is
    // translated, so group queries can match on translation_group_id alone.
    await client.query(
      'UPDATE story_title SET translation_group_id = $1 WHERE story_title_id = $1 AND translation_group_id IS NULL',
      [groupId],
    );

    await client.query(
      `INSERT INTO stories
         (story_title_id, episode_number, part_number, chapter_index, chapter_title, paragraphs,
          source_chapter_id, source_synced_at, published)
       SELECT $1, episode_number, part_number, chapter_index, chapter_title,
              CASE WHEN $3 = 'copy' THEN paragraphs ELSE ARRAY[]::text[] END,
              chapter_id, now(), false
         FROM stories
        WHERE story_title_id = $2
        ORDER BY chapter_index`,
      [translation.story_title_id, source.story_title_id, start],
    );

    await client.query(
      `INSERT INTO story_title_revisions (story_title_id, prev_title, new_title, created_by, revision_number, revision_reason, language)
       VALUES ($1, NULL, $2, $3, 1, $4, $5)`,
      [translation.story_title_id, translation.title, userId, `Translation of story ${source.story_title_id}`, language],
    );

    await client.query(
      `INSERT INTO story_access (story_title_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (story_title_id, user_id) DO NOTHING`,
      [translation.story_title_id, userId],
    );

    await client.query('COMMIT');

    if (aiConnection) {
      const { rows: created } = await pool.query(
        'SELECT chapter_id FROM stories WHERE story_title_id = $1 ORDER BY chapter_index',
        [translation.story_title_id],
      );
      try {
        await checkJobQuota(userId, created.length);
        await enqueueTranslationJobs(pool, {
          userId,
          connectionId: aiConnection.id,
          storyTitleId: translation.story_title_id,
          chapterIds: created.map((r) => r.chapter_id),
        });
      } catch (err) {
        // The (blank) translation exists either way; report why drafting didn't start.
        return res.status(201).json({ ...translation, ai_error: err instanceof ProviderError ? err.message : 'Could not start AI drafts' });
      }
    }
    res.status(201).json(translation);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[POST /stories/:storyTitleId/translations] failed:', err);
    res.status(500).json({ error: 'Failed to create translation' });
  } finally {
    client.release();
  }
});

// PATCH /stories/:storyTitleId/official  { official: boolean }
// Only the owner of the group's original story may mark a translation as the
// official one for its language (a partial unique index enforces "one per
// language"; marking a new one clears the previous one).
router.patch('/stories/:storyTitleId/official', requireAuth, async (req, res) => {
  const { storyTitleId } = req.params;
  const official = Boolean(req.body?.official);
  const client = await pool.connect();
  try {
    const translation = await loadStory(client, storyTitleId);
    if (!translation) return res.status(404).json({ error: 'Story not found' });
    if (!translation.source_story_title_id || !translation.translation_group_id) {
      return res.status(400).json({ error: 'This story is not a translation' });
    }
    const original = await loadStory(client, translation.translation_group_id);
    if (!original || original.creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the original story owner can mark official translations' });
    }

    await client.query('BEGIN');
    if (official) {
      await client.query(
        `UPDATE story_title SET is_official_translation = false
          WHERE translation_group_id = $1 AND language = $2 AND story_title_id <> $3`,
        [translation.translation_group_id, translation.language, storyTitleId],
      );
    }
    const { rows } = await client.query(
      'UPDATE story_title SET is_official_translation = $1 WHERE story_title_id = $2 RETURNING *',
      [official, storyTitleId],
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[PATCH /stories/:storyTitleId/official] failed:', err);
    res.status(500).json({ error: 'Failed to update official translation' });
  } finally {
    client.release();
  }
});

// GET /chapters/:chapterId/source
// The source chapter a translated chapter was made from, for the side-by-side
// editor, plus whether the translation is out of date.
router.get('/chapters/:chapterId/source', async (req, res) => {
  const { chapterId } = req.params;
  try {
    const userId = await optionalUserId(req);
    const { rows } = await pool.query(
      `SELECT c.chapter_id, c.source_synced_at, c.created_at,
              src.chapter_id AS source_chapter_id, src.chapter_title AS source_title,
              src.paragraphs AS source_paragraphs, src.content_updated_at AS source_updated_at,
              src.story_title_id AS source_story_title_id
         FROM stories c
         LEFT JOIN stories src ON src.chapter_id = c.source_chapter_id
        WHERE c.chapter_id = $1`,
      [chapterId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Chapter not found' });
    const row = rows[0];
    if (!row.source_chapter_id) return res.json({ source: null });

    const sourceStory = await loadStory(pool, row.source_story_title_id);
    if (!sourceStory || !(await canViewStory(pool, sourceStory, userId))) {
      return res.json({ source: null });
    }

    const syncedAt = row.source_synced_at ?? row.created_at;
    res.json({
      source: {
        chapter_id: row.source_chapter_id,
        story_title_id: row.source_story_title_id,
        language: sourceStory.language,
        chapter_title: row.source_title,
        paragraphs: row.source_paragraphs ?? [],
        updated_at: row.source_updated_at,
      },
      synced_at: syncedAt,
      stale: new Date(row.source_updated_at) > new Date(syncedAt),
    });
  } catch (err) {
    console.error('[GET /chapters/:chapterId/source] failed:', err);
    res.status(500).json({ error: 'Failed to load source chapter' });
  }
});

// PATCH /chapters/:chapterId/source-synced
// "Mark as up to date with the original" — story team of the translation only.
router.patch('/chapters/:chapterId/source-synced', requireAuth, async (req, res) => {
  const { chapterId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT c.chapter_id, c.story_title_id FROM stories c WHERE c.chapter_id = $1',
      [chapterId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Chapter not found' });
    const story = await loadStory(pool, rows[0].story_title_id);
    if (!story || !(await isStoryTeam(pool, story, req.user.id))) {
      return res.status(403).json({ error: 'Not allowed to update this chapter' });
    }
    const updated = await pool.query(
      'UPDATE stories SET source_synced_at = now() WHERE chapter_id = $1 RETURNING chapter_id, source_synced_at',
      [chapterId],
    );
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('[PATCH /chapters/:chapterId/source-synced] failed:', err);
    res.status(500).json({ error: 'Failed to mark chapter as synced' });
  }
});

export default router;
