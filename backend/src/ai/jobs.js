// Background AI jobs (machine-translation drafts, TTS narration), run by a
// small in-process worker — no Redis/queue service. Jobs are rows in ai_jobs;
// the worker claims one at a time with FOR UPDATE SKIP LOCKED, so a second
// backend process would simply share the queue.

import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { pool } from '../db.js';
import { UPLOADS_ROOT } from '../gallery.js';
import { decryptSecret } from '../secrets.js';
import { loadStory, isStoryTeam } from '../storyAccess.js';
import { ProviderError, translateChapter, synthesizeSpeech, effectiveSettings, PROVIDERS } from './providers.js';

const POLL_MS = 3000;
const MAX_ATTEMPTS = 3;
export const MAX_OPEN_JOBS_PER_USER = 200;

/** Queue a job. Returns the new row. */
export async function enqueueJob(db, { userId, connectionId, kind, storyTitleId, chapterId, params = {} }) {
  const { rows } = await db.query(
    `INSERT INTO ai_jobs (user_id, connection_id, kind, story_title_id, chapter_id, params)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, connectionId, kind, storyTitleId, chapterId, JSON.stringify(params)],
  );
  return rows[0];
}

export async function openJobCount(db, userId) {
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM ai_jobs WHERE user_id = $1 AND status IN ('queued', 'running')",
    [userId],
  );
  return rows[0].n;
}

async function languageName(code) {
  const { rows } = await pool.query('SELECT english_name FROM locales WHERE code = $1', [code || 'en']);
  return rows[0]?.english_name ?? code ?? 'English';
}

async function loadConnection(job) {
  const { rows } = await pool.query('SELECT * FROM user_ai_connections WHERE id = $1 AND user_id = $2', [
    job.connection_id,
    job.user_id,
  ]);
  if (rows.length === 0) throw new ProviderError('The AI connection used for this job was removed');
  return { connection: rows[0], apiKey: decryptSecret(rows[0].encrypted_api_key) };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function runTranslateChapter(job) {
  const { connection, apiKey } = await loadConnection(job);
  const { rows } = await pool.query(
    `SELECT c.chapter_id, c.story_title_id, c.chapter_title, c.paragraphs,
            src.chapter_id AS src_id, src.chapter_title AS src_title, src.paragraphs AS src_paragraphs,
            src.story_title_id AS src_story_id
       FROM stories c
       JOIN stories src ON src.chapter_id = c.source_chapter_id
      WHERE c.chapter_id = $1`,
    [job.chapter_id],
  );
  if (rows.length === 0) throw new ProviderError('This chapter is not a translation of another chapter');
  const row = rows[0];
  const [target, source] = await Promise.all([loadStory(pool, row.story_title_id), loadStory(pool, row.src_story_id)]);
  const [from, to] = await Promise.all([languageName(source?.language), languageName(target?.language)]);

  const result = await translateChapter(
    connection,
    apiKey,
    { title: row.src_title ?? '', paragraphs: row.src_paragraphs ?? [] },
    from,
    to,
  );

  const { model } = effectiveSettings(connection, 'translate');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE stories SET chapter_title = $1, paragraphs = $2, source_synced_at = now() WHERE chapter_id = $3`,
      [result.title || row.src_title || row.chapter_title, result.paragraphs, row.chapter_id],
    );
    // Separate statement: the content change above clears ai_draft (trigger);
    // this marks the new text as an AI draft until a human edits it.
    await client.query('UPDATE stories SET ai_draft = true WHERE chapter_id = $1', [row.chapter_id]);
    const rev = await client.query(
      'SELECT COALESCE(max(revision_number), 0) + 1 AS n FROM chapter_revisions WHERE chapter_id = $1',
      [row.chapter_id],
    );
    await client.query(
      `INSERT INTO chapter_revisions
         (chapter_id, prev_chapter_title, new_chapter_title, prev_paragraphs, new_paragraphs, created_by, revision_number, revision_reason, language)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        row.chapter_id,
        row.chapter_title,
        result.title || row.src_title || row.chapter_title,
        row.paragraphs,
        result.paragraphs,
        job.user_id,
        rev.rows[0].n,
        `AI translation draft (${PROVIDERS[connection.provider].label}${model ? ` · ${model}` : ''})`,
        target?.language ?? 'en',
      ],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return { provider: connection.provider, model, paragraphs: result.paragraphs.length };
}

async function runTtsChapter(job) {
  const { connection, apiKey } = await loadConnection(job);
  const params = job.params ?? {};
  const { rows } = await pool.query('SELECT chapter_id, story_title_id, paragraphs FROM stories WHERE chapter_id = $1', [
    job.chapter_id,
  ]);
  if (rows.length === 0) throw new ProviderError('Chapter not found');
  const chapter = rows[0];

  // Narrate the frozen text of the edition chosen at enqueue time, so the
  // narration matches exactly what readers see while following along.
  let paragraphs = chapter.paragraphs ?? [];
  if (params.editionId) {
    const ed = await pool.query(
      'SELECT snapshot_paragraphs FROM story_edition_chapters WHERE edition_id = $1 AND chapter_id = $2',
      [params.editionId, chapter.chapter_id],
    );
    if (ed.rows.length > 0) paragraphs = ed.rows[0].snapshot_paragraphs;
  }

  const audio = await synthesizeSpeech(connection, apiKey, paragraphs, { voice: params.voice, model: params.model });

  const dir = path.join(UPLOADS_ROOT, 'media', chapter.story_title_id);
  await fs.promises.mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}${audio.ext}`;
  await fs.promises.writeFile(path.join(dir, filename), audio.buffer);

  const story = await loadStory(pool, chapter.story_title_id);
  const isTeam = story ? await isStoryTeam(pool, story, job.user_id) : false;
  const label = params.label || `AI narration (${PROVIDERS[connection.provider].label} · ${audio.voice})`;
  try {
    const inserted = await pool.query(
      `INSERT INTO chapter_media
         (story_title_id, chapter_id, edition_id, kind, source, label, url, mime, size_bytes, status, created_by, ai_provider, ai_model)
       VALUES ($1, $2, $3, 'audio', 'ai', $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        chapter.story_title_id,
        chapter.chapter_id,
        params.editionId ?? null,
        label,
        `/uploads/media/${chapter.story_title_id}/${filename}`,
        audio.mime,
        audio.buffer.length,
        isTeam ? 'approved' : 'pending',
        job.user_id,
        connection.provider,
        audio.model,
      ],
    );
    return { mediaId: inserted.rows[0].id, bytes: audio.buffer.length };
  } catch (err) {
    fs.promises.unlink(path.join(dir, filename)).catch(() => {});
    throw err;
  }
}

const HANDLERS = {
  translate_chapter: runTranslateChapter,
  tts_chapter: runTtsChapter,
};

// ---------------------------------------------------------------------------
// Worker loop
// ---------------------------------------------------------------------------

let busy = false;

async function claimNextJob() {
  const { rows } = await pool.query(
    `UPDATE ai_jobs SET status = 'running', started_at = now(), attempts = attempts + 1
      WHERE id = (
        SELECT id FROM ai_jobs WHERE status = 'queued'
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      RETURNING *`,
  );
  return rows[0] ?? null;
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    for (let job = await claimNextJob(); job; job = await claimNextJob()) {
      try {
        const result = await HANDLERS[job.kind](job);
        await pool.query(
          "UPDATE ai_jobs SET status = 'succeeded', result = $2, error = NULL, finished_at = now() WHERE id = $1",
          [job.id, JSON.stringify(result ?? {})],
        );
        await pool.query('UPDATE user_ai_connections SET last_used_at = now(), last_error = NULL WHERE id = $1', [
          job.connection_id,
        ]);
      } catch (err) {
        const userMessage = err instanceof ProviderError ? err.message : 'Unexpected error while running the AI job';
        if (!(err instanceof ProviderError)) console.error(`[ai-jobs] job ${job.id} (${job.kind}) failed:`, err);
        const retry = err instanceof ProviderError && err.retryable && job.attempts < MAX_ATTEMPTS;
        await pool.query(
          `UPDATE ai_jobs SET status = $2, error = $3, finished_at = CASE WHEN $2 = 'queued' THEN NULL ELSE now() END
            WHERE id = $1`,
          [job.id, retry ? 'queued' : 'failed', userMessage],
        );
        if (job.connection_id) {
          await pool
            .query('UPDATE user_ai_connections SET last_error = $2 WHERE id = $1', [job.connection_id, userMessage])
            .catch(() => {});
        }
        if (retry) break; // give a rate-limited provider a moment before the next claim
      }
    }
  } catch (err) {
    console.error('[ai-jobs] worker tick failed:', err);
  } finally {
    busy = false;
  }
}

/** Start the worker. Jobs left 'running' by a previous process are re-queued. */
export async function startAiWorker() {
  try {
    const { rowCount } = await pool.query(
      "UPDATE ai_jobs SET status = 'queued', started_at = NULL WHERE status = 'running'",
    );
    if (rowCount) console.log(`[ai-jobs] re-queued ${rowCount} interrupted job(s)`);
  } catch (err) {
    // ai_jobs may not exist yet if migrations haven't run
    console.error('[ai-jobs] could not start worker:', err.message);
    return;
  }
  setInterval(tick, POLL_MS).unref();
  console.log('[ai-jobs] worker started');
}
