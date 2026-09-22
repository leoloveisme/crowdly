// Bring-your-own-AI routes.
//
//   /users/me/ai-connections[...]      — manage your own provider keys
//   /chapters/:id/ai/translate         — AI draft of one translated chapter
//   /stories/:id/ai/translate          — AI drafts of all (empty) chapters of a translation
//   /chapters/:id/ai/narrate           — AI narration (TTS) of a chapter
//   /stories/:id/ai-jobs               — job status for the story page
//   /stories/ai-jobs/:jobId/cancel     — cancel a queued job
//
// Paths use existing /users, /stories and /chapters prefixes so nginx and the
// Vite dev proxy need no changes. API keys never leave the server after
// they're saved: responses only carry a masked hint.

import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../sessions.js';
import { encryptSecret, decryptSecret, secretHint, isSecretStoreConfigured } from '../secrets.js';
import { loadStory, isStoryTeam, canViewStory, canUsePolicy } from '../storyAccess.js';
import { createAutoSnapshotEdition } from '../editions.js';
import { PROVIDERS, ProviderError, testConnection } from './providers.js';
import { enqueueJob, openJobCount, MAX_OPEN_JOBS_PER_USER } from './jobs.js';

const router = express.Router();

const publicConnection = (row) => ({
  id: row.id,
  provider: row.provider,
  provider_label: PROVIDERS[row.provider]?.label ?? row.provider,
  label: row.label,
  key_hint: row.key_hint,
  base_url: row.base_url,
  capabilities: row.capabilities ?? [],
  settings: row.settings ?? {},
  last_used_at: row.last_used_at,
  last_error: row.last_error,
  created_at: row.created_at,
});

function cleanCapabilities(provider, requested) {
  const allowed = PROVIDERS[provider]?.capabilities ?? [];
  const list = Array.isArray(requested) ? requested.filter((c) => allowed.includes(c)) : allowed;
  return list.length > 0 ? list : allowed;
}

function cleanSettings(provider, settings) {
  const out = {};
  for (const capability of PROVIDERS[provider]?.capabilities ?? []) {
    const s = settings?.[capability];
    if (!s || typeof s !== 'object') continue;
    out[capability] = {};
    for (const key of ['model', 'voice']) {
      if (typeof s[key] === 'string' && s[key].trim()) out[capability][key] = s[key].trim().slice(0, 200);
    }
  }
  return out;
}

function cleanBaseUrl(provider, raw) {
  if (!PROVIDERS[provider]?.needsBaseUrl) return null;
  try {
    const url = new URL(String(raw ?? '').trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return undefined;
  }
}

function sendProviderError(res, err, fallback) {
  if (err instanceof ProviderError) return res.status(400).json({ error: err.message });
  if (err?.code === 'AI_KEY_ENCRYPTION_KEY_MISSING') return res.status(503).json({ error: err.message });
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

/** The caller's own connection, checked for a capability. */
async function usableConnection(userId, connectionId, capability) {
  const { rows } = await pool.query('SELECT * FROM user_ai_connections WHERE id = $1 AND user_id = $2', [
    connectionId,
    userId,
  ]);
  const conn = rows[0];
  if (!conn) throw new ProviderError('Choose one of your AI connections');
  if (!(conn.capabilities ?? []).includes(capability)) {
    throw new ProviderError(
      capability === 'tts' ? 'This connection is not set up for narration' : 'This connection is not set up for translation',
    );
  }
  return conn;
}

async function checkJobQuota(userId, adding) {
  if ((await openJobCount(pool, userId)) + adding > MAX_OPEN_JOBS_PER_USER) {
    throw new ProviderError(`You already have many AI jobs waiting — try again when they finish`);
  }
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

router.get('/users/me/ai-connections', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM user_ai_connections WHERE user_id = $1 ORDER BY created_at',
      [req.user.id],
    );
    res.json({
      configured: isSecretStoreConfigured(),
      providers: Object.entries(PROVIDERS).map(([id, p]) => ({
        id,
        label: p.label,
        capabilities: p.capabilities,
        defaults: p.defaults,
        needs_base_url: Boolean(p.needsBaseUrl),
      })),
      connections: rows.map(publicConnection),
    });
  } catch (err) {
    sendProviderError(res, err, 'Failed to load AI connections');
  }
});

router.post('/users/me/ai-connections', requireAuth, async (req, res) => {
  const { provider, label, apiKey, baseUrl, capabilities, settings } = req.body ?? {};
  if (!PROVIDERS[provider]) return res.status(400).json({ error: 'Unknown provider' });
  if (typeof apiKey !== 'string' || apiKey.trim().length < 8) {
    return res.status(400).json({ error: 'Paste your API key' });
  }
  const cleanUrl = cleanBaseUrl(provider, baseUrl);
  if (cleanUrl === undefined) return res.status(400).json({ error: 'Enter a valid server URL (https://…/v1)' });
  try {
    const draft = {
      provider,
      base_url: cleanUrl,
      settings: cleanSettings(provider, settings),
    };
    // Only keep keys that actually work.
    await testConnection(draft, apiKey.trim());
    const { rows } = await pool.query(
      `INSERT INTO user_ai_connections (user_id, provider, label, encrypted_api_key, key_hint, base_url, capabilities, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        req.user.id,
        provider,
        (label || '').trim().slice(0, 100) || null,
        encryptSecret(apiKey.trim()),
        secretHint(apiKey),
        cleanUrl,
        cleanCapabilities(provider, capabilities),
        JSON.stringify(draft.settings),
      ],
    );
    res.status(201).json(publicConnection(rows[0]));
  } catch (err) {
    sendProviderError(res, err, 'Failed to save AI connection');
  }
});

router.patch('/users/me/ai-connections/:id', requireAuth, async (req, res) => {
  const { label, apiKey, baseUrl, capabilities, settings } = req.body ?? {};
  try {
    const { rows } = await pool.query('SELECT * FROM user_ai_connections WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    const conn = rows[0];
    if (!conn) return res.status(404).json({ error: 'Connection not found' });

    const next = {
      label: label !== undefined ? (String(label).trim().slice(0, 100) || null) : conn.label,
      base_url: baseUrl !== undefined ? cleanBaseUrl(conn.provider, baseUrl) : conn.base_url,
      capabilities: capabilities !== undefined ? cleanCapabilities(conn.provider, capabilities) : conn.capabilities,
      settings: settings !== undefined ? cleanSettings(conn.provider, settings) : conn.settings,
    };
    if (next.base_url === undefined) return res.status(400).json({ error: 'Enter a valid server URL (https://…/v1)' });

    let encrypted = conn.encrypted_api_key;
    let hint = conn.key_hint;
    if (typeof apiKey === 'string' && apiKey.trim()) {
      await testConnection({ ...conn, ...next }, apiKey.trim());
      encrypted = encryptSecret(apiKey.trim());
      hint = secretHint(apiKey);
    }
    const updated = await pool.query(
      `UPDATE user_ai_connections
          SET label = $1, base_url = $2, capabilities = $3, settings = $4, encrypted_api_key = $5, key_hint = $6,
              last_error = NULL, updated_at = now()
        WHERE id = $7 RETURNING *`,
      [next.label, next.base_url, next.capabilities, JSON.stringify(next.settings), encrypted, hint, conn.id],
    );
    res.json(publicConnection(updated.rows[0]));
  } catch (err) {
    sendProviderError(res, err, 'Failed to update AI connection');
  }
});

router.delete('/users/me/ai-connections/:id', requireAuth, async (req, res) => {
  try {
    // Queued jobs using it can't run without the key.
    await pool.query(
      "UPDATE ai_jobs SET status = 'cancelled', error = 'The AI connection was removed', finished_at = now() WHERE connection_id = $1 AND status = 'queued'",
      [req.params.id],
    );
    const { rowCount } = await pool.query('DELETE FROM user_ai_connections WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Connection not found' });
    res.status(204).send();
  } catch (err) {
    sendProviderError(res, err, 'Failed to delete AI connection');
  }
});

router.post('/users/me/ai-connections/:id/test', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM user_ai_connections WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    const conn = rows[0];
    if (!conn) return res.status(404).json({ error: 'Connection not found' });
    try {
      await testConnection(conn, decryptSecret(conn.encrypted_api_key));
    } catch (err) {
      if (err instanceof ProviderError) {
        await pool.query('UPDATE user_ai_connections SET last_error = $2 WHERE id = $1', [conn.id, err.message]);
      }
      throw err;
    }
    await pool.query('UPDATE user_ai_connections SET last_error = NULL WHERE id = $1', [conn.id]);
    res.json({ ok: true });
  } catch (err) {
    sendProviderError(res, err, 'Connection test failed');
  }
});

// ---------------------------------------------------------------------------
// Translation drafts
// ---------------------------------------------------------------------------

/** Enqueue translate jobs for chapters of a translation story. Exported for translations.js ("AI draft" start). */
export async function enqueueTranslationJobs(db, { userId, connectionId, storyTitleId, chapterIds }) {
  const jobs = [];
  for (const chapterId of chapterIds) {
    jobs.push(
      await enqueueJob(db, { userId, connectionId, kind: 'translate_chapter', storyTitleId, chapterId }),
    );
  }
  return jobs;
}

export { usableConnection, checkJobQuota };

router.post('/chapters/:chapterId/ai/translate', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT chapter_id, story_title_id, source_chapter_id FROM stories WHERE chapter_id = $1',
      [req.params.chapterId],
    );
    const chapter = rows[0];
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' });
    if (!chapter.source_chapter_id) return res.status(400).json({ error: 'This chapter is not a translation' });
    const story = await loadStory(pool, chapter.story_title_id);
    if (!story || !(await isStoryTeam(pool, story, req.user.id))) {
      return res.status(403).json({ error: 'Only the translation team can draft its chapters' });
    }
    const conn = await usableConnection(req.user.id, req.body?.connectionId, 'translate');
    await checkJobQuota(req.user.id, 1);
    const [job] = await enqueueTranslationJobs(pool, {
      userId: req.user.id,
      connectionId: conn.id,
      storyTitleId: chapter.story_title_id,
      chapterIds: [chapter.chapter_id],
    });
    res.status(202).json(job);
  } catch (err) {
    sendProviderError(res, err, 'Failed to start translation');
  }
});

// { connectionId, overwrite? } — all chapters of a translation (empty ones unless overwrite)
router.post('/stories/:storyTitleId/ai/translate', requireAuth, async (req, res) => {
  try {
    const story = await loadStory(pool, req.params.storyTitleId);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    if (!story.source_story_title_id) return res.status(400).json({ error: 'This story is not a translation' });
    if (!(await isStoryTeam(pool, story, req.user.id))) {
      return res.status(403).json({ error: 'Only the translation team can draft its chapters' });
    }
    const conn = await usableConnection(req.user.id, req.body?.connectionId, 'translate');
    const { rows } = await pool.query(
      `SELECT chapter_id FROM stories
        WHERE story_title_id = $1 AND source_chapter_id IS NOT NULL
          AND ($2 OR NOT EXISTS (SELECT 1 FROM unnest(paragraphs) p WHERE btrim(p) <> ''))
          AND NOT EXISTS (SELECT 1 FROM ai_jobs j WHERE j.chapter_id = stories.chapter_id
                           AND j.kind = 'translate_chapter' AND j.status IN ('queued', 'running'))
        ORDER BY chapter_index`,
      [story.story_title_id, Boolean(req.body?.overwrite)],
    );
    await checkJobQuota(req.user.id, rows.length);
    const jobs = await enqueueTranslationJobs(pool, {
      userId: req.user.id,
      connectionId: conn.id,
      storyTitleId: story.story_title_id,
      chapterIds: rows.map((r) => r.chapter_id),
    });
    res.status(202).json({ queued: jobs.length });
  } catch (err) {
    sendProviderError(res, err, 'Failed to start translation');
  }
});

// ---------------------------------------------------------------------------
// Narration (TTS)
// ---------------------------------------------------------------------------

// { connectionId, editionId?, voice?, label? }
router.post('/chapters/:chapterId/ai/narrate', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT chapter_id, story_title_id FROM stories WHERE chapter_id = $1', [
      req.params.chapterId,
    ]);
    const chapter = rows[0];
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' });
    const story = await loadStory(client, chapter.story_title_id);
    if (
      !story ||
      !(await canViewStory(client, story, req.user.id)) ||
      !(await canUsePolicy(client, story, req.user.id, 'narration_policy', 'narrate'))
    ) {
      return res.status(403).json({ error: 'You do not have permission to narrate this story' });
    }
    const conn = await usableConnection(req.user.id, req.body?.connectionId, 'tts');
    await checkJobQuota(req.user.id, 1);

    await client.query('BEGIN');
    let editionId = req.body?.editionId || null;
    if (editionId) {
      const ed = await client.query('SELECT id FROM story_editions WHERE id = $1 AND story_title_id = $2', [
        editionId,
        story.story_title_id,
      ]);
      if (ed.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Edition does not belong to this story' });
      }
    } else {
      // Freeze the current text now, so the narration matches what was read.
      editionId = (await createAutoSnapshotEdition(client, story.story_title_id, req.user.id)).id;
    }
    const job = await enqueueJob(client, {
      userId: req.user.id,
      connectionId: conn.id,
      kind: 'tts_chapter',
      storyTitleId: story.story_title_id,
      chapterId: chapter.chapter_id,
      params: {
        editionId,
        voice: typeof req.body?.voice === 'string' ? req.body.voice.trim().slice(0, 100) : undefined,
        label: typeof req.body?.label === 'string' ? req.body.label.trim().slice(0, 200) : undefined,
      },
    });
    await client.query('COMMIT');
    res.status(202).json(job);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    sendProviderError(res, err, 'Failed to start narration');
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Job status
// ---------------------------------------------------------------------------

// Recent jobs on a story: your own, or all of them for the story team.
router.get('/stories/:storyTitleId/ai-jobs', requireAuth, async (req, res) => {
  try {
    const story = await loadStory(pool, req.params.storyTitleId);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    const isTeam = await isStoryTeam(pool, story, req.user.id);
    const { rows } = await pool.query(
      `SELECT j.id, j.kind, j.status, j.error, j.chapter_id, j.created_at, j.started_at, j.finished_at,
              j.user_id = $2 AS is_mine, s.chapter_title
         FROM ai_jobs j
         LEFT JOIN stories s ON s.chapter_id = j.chapter_id
        WHERE j.story_title_id = $1 AND ($3 OR j.user_id = $2)
          AND (j.status IN ('queued', 'running') OR j.created_at > now() - interval '1 day')
        ORDER BY j.created_at DESC
        LIMIT 100`,
      [story.story_title_id, req.user.id, isTeam],
    );
    res.json(rows);
  } catch (err) {
    sendProviderError(res, err, 'Failed to load AI jobs');
  }
});

router.post('/stories/ai-jobs/:jobId/cancel', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE ai_jobs SET status = 'cancelled', finished_at = now() WHERE id = $1 AND user_id = $2 AND status = 'queued'",
      [req.params.jobId, req.user.id],
    );
    if (!rowCount) return res.status(409).json({ error: 'Only your own queued jobs can be cancelled' });
    res.json({ ok: true });
  } catch (err) {
    sendProviderError(res, err, 'Failed to cancel job');
  }
});

export default router;
