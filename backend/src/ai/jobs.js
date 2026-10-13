// Background AI jobs (translation drafts, TTS narration, comics, video), run
// by a small in-process worker — no Redis/queue service. Jobs are rows in ai_jobs;
// the worker claims one at a time with FOR UPDATE SKIP LOCKED, so a second
// backend process would simply share the queue.

import { pool } from '../db.js';
import { storeBuffer, newKey, removeStoredFile } from '../storage.js';
import { decryptSecret } from '../secrets.js';
import { loadStory, isStoryTeam } from '../storyAccess.js';
import { loadWork, isTeam as isWorkTeam } from '../workAccess.js';
import {
  ProviderError,
  translateChapter,
  synthesizeSpeech,
  effectiveSettings,
  PROVIDERS,
  storyboardComic,
  generateImage,
  startVideo,
  checkVideo,
  downloadVideo,
} from './providers.js';

const POLL_MS = 3000;
const MAX_ATTEMPTS = 3;
export const MAX_OPEN_JOBS_PER_USER = 200;

/**
 * Queue a job. Returns the new row. Story jobs pass storyTitleId/chapterId;
 * screenplay and comic jobs pass work: { screenplayId, sceneId } or
 * { comicId, issueId }.
 */
export async function enqueueJob(db, { userId, connectionId, kind, storyTitleId = null, chapterId = null, work = {}, params = {} }) {
  const { rows } = await db.query(
    `INSERT INTO ai_jobs (user_id, connection_id, kind, story_title_id, chapter_id, screenplay_id, scene_id, comic_id, comic_issue_id, params)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [
      userId,
      connectionId,
      kind,
      storyTitleId,
      chapterId,
      work.screenplayId ?? null,
      work.sceneId ?? null,
      work.comicId ?? null,
      work.issueId ?? null,
      JSON.stringify(params),
    ],
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

async function loadConnection(job, connectionId = job.connection_id) {
  const { rows } = await pool.query('SELECT * FROM user_ai_connections WHERE id = $1 AND user_id = $2', [
    connectionId,
    job.user_id,
  ]);
  if (rows.length === 0) throw new ProviderError('The AI connection used for this job was removed');
  return { connection: rows[0], apiKey: decryptSecret(rows[0].encrypted_api_key) };
}

/** Persist progress into the job's params so a retry resumes instead of starting over. */
async function saveParams(job, patch) {
  job.params = { ...(job.params ?? {}), ...patch };
  await pool.query('UPDATE ai_jobs SET params = $2 WHERE id = $1', [job.id, JSON.stringify(job.params)]);
}

/** Store a generated file (object storage when configured, local disk otherwise). */
async function saveMediaFile(storyTitleId, buffer, ext, contentType) {
  const url = await storeBuffer(newKey('media', storyTitleId, ext), buffer, contentType);
  return { url, remove: () => removeStoredFile(url).catch(() => {}) };
}

async function submitterIsTeam(job, storyTitleId) {
  const story = await loadStory(pool, storyTitleId);
  return story ? isStoryTeam(pool, story, job.user_id) : false;
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

  const saved = await saveMediaFile(chapter.story_title_id, audio.buffer, audio.ext, audio.mime);

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
        saved.url,
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
    saved.remove();
    throw err;
  }
}

// Comic: storyboard the paragraph range with the text AI, then draw each
// frame with the image AI. Progress (storyboard, media row, finished frames)
// is saved as it goes, so a retry never pays for the same work twice. The
// presentation stays 'pending' (hidden from readers) until every frame is in.
async function runComicFrames(job) {
  const params = job.params ?? {};
  const { rows } = await pool.query('SELECT chapter_id, story_title_id, paragraphs FROM stories WHERE chapter_id = $1', [
    job.chapter_id,
  ]);
  if (rows.length === 0) throw new ProviderError('Chapter not found');
  const chapter = rows[0];
  const all = chapter.paragraphs ?? [];
  const start = Math.max(0, Number(params.anchorStart) || 0);
  const end = Math.min(all.length - 1, Number.isInteger(params.anchorEnd) ? params.anchorEnd : all.length - 1);
  const passage = all
    .map((text, index) => ({ index, text }))
    .filter((p) => p.index >= start && p.index <= end && p.text.trim());
  if (passage.length === 0) throw new ProviderError('The selected paragraphs have no text');

  if (!params.storyboard) {
    const text = await loadConnection(job, params.textConnectionId);
    const story = await loadStory(pool, chapter.story_title_id);
    const storyboard = await storyboardComic(text.connection, text.apiKey, {
      paragraphs: passage,
      frameCount: Math.min(8, Math.max(1, Number(params.frameCount) || 4)),
      style: params.style || '',
      language: await languageName(story?.language),
    });
    await saveParams(job, { storyboard });
  }

  const image = await loadConnection(job);
  if (!job.params.mediaId) {
    const inserted = await pool.query(
      `INSERT INTO chapter_media (story_title_id, chapter_id, kind, source, label, status, created_by, ai_provider, ai_model)
       VALUES ($1, $2, 'visual', 'ai', $3, 'pending', $4, $5, $6) RETURNING id`,
      [
        chapter.story_title_id,
        chapter.chapter_id,
        params.label || 'AI comic',
        job.user_id,
        image.connection.provider,
        effectiveSettings(image.connection, 'image').model,
      ],
    );
    await saveParams(job, { mediaId: inserted.rows[0].id });
  }
  const mediaId = job.params.mediaId;
  const { storyboard } = job.params;

  const done = await pool.query('SELECT count(*)::int AS n FROM chapter_media_frames WHERE media_id = $1', [mediaId]);
  for (let i = done.rows[0].n; i < storyboard.frames.length; i++) {
    const frame = storyboard.frames[i];
    const prompt = [
      storyboard.style_guide,
      `Comic frame ${i + 1} of ${storyboard.frames.length}: ${frame.image_prompt}`,
      'Draw the scene only: no text, letters, captions, signs or speech bubbles anywhere in the image.',
    ]
      .filter(Boolean)
      .join('\n\n');
    const img = await generateImage(image.connection, image.apiKey, prompt);
    const saved = await saveMediaFile(chapter.story_title_id, img.buffer, img.ext, img.mime);
    try {
      await pool.query(
        `INSERT INTO chapter_media_frames (media_id, frame_index, image_url, caption, overlays, anchor_start, anchor_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [mediaId, i, saved.url, frame.caption || null, JSON.stringify(frame.bubbles), frame.anchor_start, frame.anchor_end],
      );
    } catch (err) {
      saved.remove();
      throw err;
    }
  }

  const isTeam = await submitterIsTeam(job, chapter.story_title_id);
  await pool.query("UPDATE chapter_media SET status = $2, updated_at = now() WHERE id = $1", [
    mediaId,
    isTeam ? 'approved' : 'pending',
  ]);
  return { mediaId, frames: storyboard.frames.length };
}

// Video (experimental): submit once, then re-check every VIDEO_POLL_SECONDS
// without holding the worker (the job re-queues itself with run_after).
const VIDEO_POLL_SECONDS = 20;
const VIDEO_TIMEOUT_MINUTES = 45;

async function runVideoChapter(job) {
  const params = job.params ?? {};
  const { connection, apiKey } = await loadConnection(job);
  const { rows } = await pool.query('SELECT chapter_id, story_title_id FROM stories WHERE chapter_id = $1', [
    job.chapter_id,
  ]);
  if (rows.length === 0) throw new ProviderError('Chapter not found');
  const chapter = rows[0];

  if (!params.providerJobId) {
    const started = await startVideo(connection, apiKey, { prompt: params.prompt, seconds: params.seconds || 8 });
    await saveParams(job, { providerJobId: started.providerJobId, model: started.model, submittedAt: new Date().toISOString() });
    return { defer: VIDEO_POLL_SECONDS, progress: 0 };
  }

  const status = await checkVideo(connection, apiKey, params.providerJobId);
  if (status.state === 'failed') throw new ProviderError(status.error);
  if (status.state === 'pending') {
    if (Date.now() - new Date(params.submittedAt).getTime() > VIDEO_TIMEOUT_MINUTES * 60_000) {
      throw new ProviderError('The video took too long to generate');
    }
    return { defer: VIDEO_POLL_SECONDS, progress: status.progress };
  }

  const video = await downloadVideo(connection, apiKey, params.providerJobId);
  const saved = await saveMediaFile(chapter.story_title_id, video.buffer, video.ext, video.mime);
  const isTeam = await submitterIsTeam(job, chapter.story_title_id);
  try {
    const inserted = await pool.query(
      `INSERT INTO chapter_media
         (story_title_id, chapter_id, kind, source, label, url, mime, size_bytes, duration_seconds, status, created_by, ai_provider, ai_model)
       VALUES ($1, $2, 'video', 'ai', $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        chapter.story_title_id,
        chapter.chapter_id,
        params.label || 'AI video',
        saved.url,
        video.mime,
        video.buffer.length,
        Number(params.seconds) || null,
        isTeam ? 'approved' : 'pending',
        job.user_id,
        connection.provider,
        params.model ?? null,
      ],
    );
    return { mediaId: inserted.rows[0].id, bytes: video.buffer.length };
  } catch (err) {
    saved.remove();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Screenplay scenes and comic issues
// ---------------------------------------------------------------------------

async function workLanguages(kind, targetId, sourceId) {
  const [target, source] = await Promise.all([loadWork(pool, kind, targetId), loadWork(pool, kind, sourceId)]);
  return Promise.all([languageName(source?.language), languageName(target?.language)]);
}

// Translation draft of one scene: the source scene's heading and elements,
// written into the translated scene's elements in the same order.
async function runTranslateScene(job) {
  const { connection, apiKey } = await loadConnection(job);
  const { rows } = await pool.query(
    `SELECT s.scene_id, s.screenplay_id, s.slugline, src.scene_id AS src_id, src.slugline AS src_slugline,
            src.screenplay_id AS src_screenplay_id
       FROM screenplay_scene s JOIN screenplay_scene src ON src.scene_id = s.source_scene_id
      WHERE s.scene_id = $1`,
    [job.scene_id],
  );
  if (rows.length === 0) throw new ProviderError('This scene is not a translation of another scene');
  const scene = rows[0];
  const [srcBlocks, blocks] = await Promise.all([
    pool.query('SELECT text FROM screenplay_block WHERE scene_id = $1 ORDER BY block_index', [scene.src_id]),
    pool.query('SELECT block_id, text FROM screenplay_block WHERE scene_id = $1 ORDER BY block_index', [scene.scene_id]),
  ]);
  // Only non-empty elements are sent; results map back by position.
  const filled = srcBlocks.rows.map((b, i) => ({ i, text: b.text })).filter((b) => b.text.trim());
  const [from, to] = await workLanguages('screenplay', scene.screenplay_id, scene.src_screenplay_id);
  const result = await translateChapter(connection, apiKey, { title: scene.src_slugline ?? '', paragraphs: filled.map((b) => b.text) }, from, to);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE screenplay_scene SET slugline = $1, source_synced_at = now(), updated_at = now() WHERE scene_id = $2', [
      result.title || scene.src_slugline || scene.slugline,
      scene.scene_id,
    ]);
    for (let n = 0; n < filled.length; n += 1) {
      const target = blocks.rows[filled[n].i];
      if (target && typeof result.paragraphs[n] === 'string') {
        await client.query('UPDATE screenplay_block SET text = $1, updated_at = now() WHERE block_id = $2', [
          result.paragraphs[n],
          target.block_id,
        ]);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return { provider: connection.provider, elements: filled.length };
}

// Translation draft of one issue: its title and every text layer of its
// pages, written back into the translated pages' layers (same positions).
async function runTranslateIssue(job) {
  const { connection, apiKey } = await loadConnection(job);
  const { rows } = await pool.query(
    `SELECT i.issue_id, i.comic_id, i.title, src.issue_id AS src_id, src.title AS src_title, src.comic_id AS src_comic_id
       FROM comic_issue i JOIN comic_issue src ON src.issue_id = i.source_issue_id
      WHERE i.issue_id = $1`,
    [job.comic_issue_id],
  );
  if (rows.length === 0) throw new ProviderError('This issue is not a translation of another issue');
  const issue = rows[0];
  const pages = await pool.query(
    `SELECT p.page_id, src.overlays AS src_overlays
       FROM comic_page p JOIN comic_page src ON src.page_id = p.source_page_id
      WHERE p.issue_id = $1 ORDER BY p.page_index`,
    [issue.issue_id],
  );
  const texts = [];
  for (const page of pages.rows) {
    (page.src_overlays ?? []).forEach((o, k) => {
      if (String(o.text ?? '').trim()) texts.push({ pageId: page.page_id, k, text: o.text });
    });
  }
  const [from, to] = await workLanguages('comic', issue.comic_id, issue.src_comic_id);
  const result = await translateChapter(connection, apiKey, { title: issue.src_title ?? '', paragraphs: texts.map((t) => t.text) }, from, to);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE comic_issue SET title = $1, updated_at = now() WHERE issue_id = $2', [
      result.title || issue.src_title || issue.title,
      issue.issue_id,
    ]);
    for (const page of pages.rows) {
      const overlays = (page.src_overlays ?? []).map((o, k) => {
        const n = texts.findIndex((t) => t.pageId === page.page_id && t.k === k);
        return { ...o, text: n === -1 ? o.text : result.paragraphs[n] ?? '' };
      });
      await client.query('UPDATE comic_page SET overlays = $1 WHERE page_id = $2', [JSON.stringify(overlays), page.page_id]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return { provider: connection.provider, texts: texts.length };
}

// What a scene or issue reads aloud: a scene's elements (character names
// announce their dialogue), or an issue's text layers in page order.
async function narrationText(job) {
  if (job.scene_id) {
    const { rows } = await pool.query(
      'SELECT block_type, text FROM screenplay_block WHERE scene_id = $1 ORDER BY block_index',
      [job.scene_id],
    );
    const paragraphs = [];
    for (const b of rows) {
      const text = b.text.trim();
      if (!text || b.block_type === 'transition') continue;
      if (b.block_type === 'character') paragraphs.push(`${text}:`);
      else if (b.block_type === 'parenthetical') continue;
      else paragraphs.push(text);
    }
    return paragraphs;
  }
  const { rows } = await pool.query('SELECT overlays FROM comic_page WHERE issue_id = $1 ORDER BY page_index', [job.comic_issue_id]);
  return rows.flatMap((r) => (r.overlays ?? []).map((o) => String(o.text ?? '').trim()).filter(Boolean));
}

const workParent = (job) =>
  job.scene_id
    ? { kind: 'screenplay', workId: job.screenplay_id, columns: 'screenplay_id, scene_id', values: [job.screenplay_id, job.scene_id] }
    : { kind: 'comic', workId: job.comic_id, columns: 'comic_id, comic_issue_id', values: [job.comic_id, job.comic_issue_id] };

async function insertWorkMedia(job, { kind, label, saved, mime, bytes, seconds, provider, model }) {
  const parent = workParent(job);
  const work = await loadWork(pool, parent.kind, parent.workId);
  const team = work ? await isWorkTeam(pool, parent.kind, work, job.user_id) : false;
  try {
    const { rows } = await pool.query(
      `INSERT INTO chapter_media
         (${parent.columns}, kind, source, label, url, mime, size_bytes, duration_seconds, status, created_by, ai_provider, ai_model)
       VALUES ($1, $2, $3, 'ai', $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [...parent.values, kind, label, saved.url, mime, bytes, seconds ?? null, team ? 'approved' : 'pending', job.user_id, provider, model ?? null],
    );
    return rows[0].id;
  } catch (err) {
    saved.remove();
    throw err;
  }
}

async function runTtsWork(job) {
  const { connection, apiKey } = await loadConnection(job);
  const params = job.params ?? {};
  const paragraphs = await narrationText(job);
  if (paragraphs.length === 0) throw new ProviderError('There is no text to narrate yet');
  const audio = await synthesizeSpeech(connection, apiKey, paragraphs, { voice: params.voice, model: params.model });
  const saved = await saveMediaFile(workParent(job).workId, audio.buffer, audio.ext, audio.mime);
  const mediaId = await insertWorkMedia(job, {
    kind: 'audio',
    label: params.label || `AI narration (${PROVIDERS[connection.provider].label} · ${audio.voice})`,
    saved,
    mime: audio.mime,
    bytes: audio.buffer.length,
    provider: connection.provider,
    model: audio.model,
  });
  return { mediaId, bytes: audio.buffer.length };
}

async function runVideoWork(job) {
  const params = job.params ?? {};
  const { connection, apiKey } = await loadConnection(job);
  if (!params.providerJobId) {
    const started = await startVideo(connection, apiKey, { prompt: params.prompt, seconds: params.seconds || 8 });
    await saveParams(job, { providerJobId: started.providerJobId, model: started.model, submittedAt: new Date().toISOString() });
    return { defer: VIDEO_POLL_SECONDS, progress: 0 };
  }
  const status = await checkVideo(connection, apiKey, params.providerJobId);
  if (status.state === 'failed') throw new ProviderError(status.error);
  if (status.state === 'pending') {
    if (Date.now() - new Date(params.submittedAt).getTime() > VIDEO_TIMEOUT_MINUTES * 60_000) {
      throw new ProviderError('The video took too long to generate');
    }
    return { defer: VIDEO_POLL_SECONDS, progress: status.progress };
  }
  const video = await downloadVideo(connection, apiKey, params.providerJobId);
  const saved = await saveMediaFile(workParent(job).workId, video.buffer, video.ext, video.mime);
  const mediaId = await insertWorkMedia(job, {
    kind: 'video',
    label: params.label || 'AI video',
    saved,
    mime: video.mime,
    bytes: video.buffer.length,
    seconds: Number(params.seconds) || null,
    provider: connection.provider,
    model: params.model,
  });
  return { mediaId, bytes: video.buffer.length };
}

const HANDLERS = {
  translate_chapter: runTranslateChapter,
  tts_chapter: runTtsChapter,
  comic_frames: runComicFrames,
  video_chapter: runVideoChapter,
  translate_scene: runTranslateScene,
  translate_issue: runTranslateIssue,
  tts_scene: runTtsWork,
  tts_issue: runTtsWork,
  video_scene: runVideoWork,
  video_issue: runVideoWork,
};

// ---------------------------------------------------------------------------
// Worker loop
// ---------------------------------------------------------------------------

let busy = false;

async function claimNextJob() {
  const { rows } = await pool.query(
    `UPDATE ai_jobs SET status = 'running', started_at = now(), attempts = attempts + 1
      WHERE id = (
        SELECT id FROM ai_jobs
         WHERE status = 'queued' AND (run_after IS NULL OR run_after <= now())
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
        if (result?.defer) {
          // Waiting on the provider (e.g. video still rendering): re-queue for
          // later without counting it as an attempt.
          await pool.query(
            `UPDATE ai_jobs SET status = 'queued', started_at = NULL, attempts = GREATEST(attempts - 1, 0),
                    run_after = now() + make_interval(secs => $2), result = $3
              WHERE id = $1`,
            [job.id, result.defer, JSON.stringify({ progress: result.progress ?? null })],
          );
          continue;
        }
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
          `UPDATE ai_jobs SET status = $2, error = $3,
                  finished_at = CASE WHEN $2 = 'queued' THEN NULL ELSE now() END,
                  run_after = CASE WHEN $2 = 'queued' THEN now() + make_interval(secs => $4) ELSE run_after END
            WHERE id = $1`,
          [job.id, retry ? 'queued' : 'failed', userMessage, 10 * job.attempts],
        );
        if (job.connection_id) {
          await pool
            .query('UPDATE user_ai_connections SET last_error = $2 WHERE id = $1', [job.connection_id, userMessage])
            .catch(() => {});
        }
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
