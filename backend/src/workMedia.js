// Audio and video for screenplay scenes and comic issues — the story page's
// Audio / Video formats for other kinds. Rows live in chapter_media (see
// migration 0026) with scene_id or comic_issue_id as their parent.
//
// Moderation mirrors chapter media: the work's team publishes directly;
// everyone else's uploads and AI generations start as 'pending' until a team
// member approves them. Narration (audio) by non-team users also needs the
// work's narration_policy.

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { pool } from './db.js';
import { requireAuth } from './sessions.js';
import { UPLOADS_ROOT } from './gallery.js';
import { adoptLocalFile, removeStoredFile } from './storage.js';
import { toEmbedUrl } from './chapterMedia.js';
import { ProviderError } from './ai/providers.js';
import { usableConnection, checkJobQuota } from './ai/router.js';
import { enqueueJob } from './ai/jobs.js';
import { canUsePolicy, canView, isTeam, isUuid, loadWork, optionalUserId, viewDeniedMessage } from './workAccess.js';

const router = express.Router();
const MEDIA_UPLOADS_DIR = path.join(UPLOADS_ROOT, 'work-media');

// Each kind of part: where its row lives and which chapter_media columns it fills.
const PARTS = {
  scene: {
    path: '/screenplay-scenes/:partId',
    kind: 'screenplay',
    lookup: 'SELECT scene_id AS part_id, screenplay_id AS work_id FROM screenplay_scene WHERE scene_id = $1',
    workColumn: 'screenplay_id',
    partColumn: 'scene_id',
    jobs: { tts: 'tts_scene', video: 'video_scene', translate: 'translate_scene' },
    job: (part) => ({ screenplayId: part.work_id, sceneId: part.part_id }),
  },
  issue: {
    path: '/comic-issues/:partId',
    kind: 'comic',
    lookup: 'SELECT issue_id AS part_id, comic_id AS work_id FROM comic_issue WHERE issue_id = $1',
    workColumn: 'comic_id',
    partColumn: 'comic_issue_id',
    jobs: { tts: 'tts_issue', video: 'video_issue', translate: 'translate_issue' },
    job: (part) => ({ comicId: part.work_id, issueId: part.part_id }),
  },
};

const AUDIO = /^audio\//;
const VIDEO = /^video\//;

function diskUpload(pattern, maxBytes) {
  return multer({
    storage: multer.diskStorage({
      destination(_req, _file, cb) {
        fs.mkdirSync(MEDIA_UPLOADS_DIR, { recursive: true });
        cb(null, MEDIA_UPLOADS_DIR);
      },
      filename(_req, file, cb) {
        cb(null, `${randomUUID()}${path.extname(file.originalname || '').slice(0, 10)}`);
      },
    }),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter(_req, file, cb) {
      if (!pattern.test(file.mimetype)) return cb(new Error('Unsupported file type'));
      cb(null, true);
    },
  }).single('file');
}

const runUpload = (middleware) => (req, res, next) =>
  middleware(req, res, (err) => (err ? res.status(400).json({ error: err.message || 'Upload failed' }) : next()));

function sendProviderError(res, err, fallback) {
  if (err instanceof ProviderError) return res.status(400).json({ error: err.message });
  if (err?.code === 'AI_KEY_ENCRYPTION_KEY_MISSING') return res.status(503).json({ error: err.message });
  console.error(`[workMedia] ${fallback}:`, err);
  return res.status(500).json({ error: fallback });
}

for (const [partName, cfg] of Object.entries(PARTS)) {
  // Loads req.part / req.work and checks the caller may read the work.
  const withPart = async (req, res, next) => {
    try {
      if (!isUuid(req.params.partId)) return res.status(404).json({ error: 'Not found' });
      const { rows } = await pool.query(cfg.lookup, [req.params.partId]);
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      const work = await loadWork(pool, cfg.kind, rows[0].work_id);
      const userId = req.user?.id ?? (await optionalUserId(req));
      if (!work || !(await canView(pool, cfg.kind, work, userId))) {
        return res.status(403).json({ error: work ? viewDeniedMessage(cfg.kind, work) : 'Not found' });
      }
      req.part = rows[0];
      req.work = work;
      req.viewerId = userId;
      req.viewerIsTeam = await isTeam(pool, cfg.kind, work, userId);
      next();
    } catch (err) {
      next(err);
    }
  };

  const insertMedia = async (req, fields) => {
    const { rows } = await pool.query(
      `INSERT INTO chapter_media (${cfg.workColumn}, ${cfg.partColumn}, kind, source, label, url, mime, size_bytes, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        req.part.work_id,
        req.part.part_id,
        fields.kind,
        fields.source,
        fields.label || null,
        fields.url,
        fields.mime ?? null,
        fields.size ?? null,
        req.viewerIsTeam ? 'approved' : 'pending',
        req.user.id,
      ],
    );
    return rows[0];
  };

  // Approved media, plus pending ones for the team and their uploader.
  router.get(`${cfg.path}/media`, withPart, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT m.*, COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), u.email) AS creator_name
           FROM chapter_media m
           LEFT JOIN local_users u ON u.id = m.created_by
           LEFT JOIN profiles p ON p.id = m.created_by
          WHERE m.${cfg.partColumn} = $1
            AND (m.status = 'approved' OR $3 OR (m.created_by IS NOT NULL AND m.created_by = $2))
          ORDER BY m.kind, m.is_primary DESC, m.created_at ASC`,
        [req.part.part_id, req.viewerId, req.viewerIsTeam],
      );
      res.json({
        items: rows.map((r) => ({ ...r, is_mine: Boolean(req.viewerId && r.created_by === req.viewerId) })),
        can_moderate: req.viewerIsTeam,
        can_narrate: await canUsePolicy(pool, cfg.kind, req.work, req.viewerId, 'narration_policy', 'narrate'),
      });
    } catch (err) {
      console.error(`[GET ${cfg.path}/media] failed:`, err);
      res.status(500).json({ error: 'Failed to load media' });
    }
  });

  router.post(`${cfg.path}/media/audio`, requireAuth, runUpload(diskUpload(AUDIO, 300 * 1024 * 1024)), withPart, async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'An audio file is required' });
    try {
      if (!(await canUsePolicy(pool, cfg.kind, req.work, req.user.id, 'narration_policy', 'narrate'))) {
        fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(403).json({ error: `The owner hasn't opened this ${cfg.kind} for narration` });
      }
      const url = await adoptLocalFile(req.file.path, req.file.mimetype);
      res.status(201).json(
        await insertMedia(req, { kind: 'audio', source: 'upload', label: req.body?.label, url, mime: req.file.mimetype, size: req.file.size }),
      );
    } catch (err) {
      console.error(`[POST ${cfg.path}/media/audio] failed:`, err);
      res.status(500).json({ error: 'Failed to upload audio' });
    }
  });

  router.post(`${cfg.path}/media/video-file`, requireAuth, runUpload(diskUpload(VIDEO, 1024 * 1024 * 1024)), withPart, async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'A video file is required' });
    try {
      const url = await adoptLocalFile(req.file.path, req.file.mimetype);
      res.status(201).json(
        await insertMedia(req, { kind: 'video', source: 'upload', label: req.body?.label, url, mime: req.file.mimetype, size: req.file.size }),
      );
    } catch (err) {
      console.error(`[POST ${cfg.path}/media/video-file] failed:`, err);
      res.status(500).json({ error: 'Failed to upload video' });
    }
  });

  // { url (YouTube/Vimeo), label? }
  router.post(`${cfg.path}/media/embed`, requireAuth, withPart, async (req, res) => {
    const embed = toEmbedUrl(req.body?.url ?? '');
    if (!embed) return res.status(400).json({ error: 'Paste a YouTube or Vimeo link' });
    try {
      res.status(201).json(await insertMedia(req, { kind: 'video', source: 'embed', label: req.body?.label, url: embed }));
    } catch (err) {
      console.error(`[POST ${cfg.path}/media/embed] failed:`, err);
      res.status(500).json({ error: 'Failed to add video' });
    }
  });

  // { connectionId, voice?, label? }
  router.post(`${cfg.path}/ai/narrate`, requireAuth, withPart, async (req, res) => {
    try {
      if (!(await canUsePolicy(pool, cfg.kind, req.work, req.user.id, 'narration_policy', 'narrate'))) {
        return res.status(403).json({ error: `The owner hasn't opened this ${cfg.kind} for narration` });
      }
      const conn = await usableConnection(req.user.id, req.body?.connectionId, 'tts');
      await checkJobQuota(req.user.id, 1);
      const job = await enqueueJob(pool, {
        userId: req.user.id,
        connectionId: conn.id,
        kind: cfg.jobs.tts,
        work: cfg.job(req.part),
        params: {
          voice: typeof req.body?.voice === 'string' ? req.body.voice.trim().slice(0, 100) : undefined,
          label: typeof req.body?.label === 'string' ? req.body.label.trim().slice(0, 200) : undefined,
        },
      });
      res.status(202).json(job);
    } catch (err) {
      sendProviderError(res, err, 'Failed to start narration');
    }
  });

  // { connectionId, prompt, seconds?, label? }
  router.post(`${cfg.path}/ai/video`, requireAuth, withPart, async (req, res) => {
    const body = req.body ?? {};
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (prompt.length < 10) return res.status(400).json({ error: 'Describe the scene for the video' });
    try {
      const conn = await usableConnection(req.user.id, body.connectionId, 'video');
      await checkJobQuota(req.user.id, 1);
      const job = await enqueueJob(pool, {
        userId: req.user.id,
        connectionId: conn.id,
        kind: cfg.jobs.video,
        work: cfg.job(req.part),
        params: {
          prompt: prompt.slice(0, 2000),
          seconds: [4, 8, 12].includes(Number(body.seconds)) ? Number(body.seconds) : 8,
          label: typeof body.label === 'string' ? body.label.trim().slice(0, 200) : '',
        },
      });
      res.status(202).json(job);
    } catch (err) {
      sendProviderError(res, err, 'Failed to start video generation');
    }
  });

  // { connectionId } — machine-translation draft of a translated scene/issue (its team only).
  router.post(`${cfg.path}/ai/translate`, requireAuth, withPart, async (req, res) => {
    try {
      if (!req.viewerIsTeam) return res.status(403).json({ error: 'Only the translation team can draft it' });
      const source = await pool.query(
        partName === 'scene'
          ? 'SELECT source_scene_id AS src FROM screenplay_scene WHERE scene_id = $1'
          : 'SELECT source_issue_id AS src FROM comic_issue WHERE issue_id = $1',
        [req.part.part_id],
      );
      if (!source.rows[0]?.src) return res.status(400).json({ error: `This ${partName} is not a translation` });
      const conn = await usableConnection(req.user.id, req.body?.connectionId, 'translate');
      await checkJobQuota(req.user.id, 1);
      res.status(202).json(
        await enqueueJob(pool, { userId: req.user.id, connectionId: conn.id, kind: cfg.jobs.translate, work: cfg.job(req.part) }),
      );
    } catch (err) {
      sendProviderError(res, err, 'Failed to start translation');
    }
  });
}

// Media counts per scene / issue (which formats exist), for the format row.
for (const [kind, base, partColumn, workColumn] of [
  ['screenplay', '/screenplays', 'scene_id', 'screenplay_id'],
  ['comic', '/comics', 'comic_issue_id', 'comic_id'],
]) {
  router.get(`${base}/:workId/media-summary`, async (req, res) => {
    try {
      const work = await loadWork(pool, kind, req.params.workId);
      if (!work) return res.status(404).json({ error: 'Not found' });
      if (!(await canView(pool, kind, work, await optionalUserId(req)))) {
        return res.status(403).json({ error: viewDeniedMessage(kind, work) });
      }
      const { rows } = await pool.query(
        `SELECT ${partColumn} AS part_id, kind, count(*)::int AS n FROM chapter_media
          WHERE ${workColumn} = $1 AND status = 'approved' GROUP BY 1, 2`,
        [req.params.workId],
      );
      const summary = {};
      for (const r of rows) {
        summary[r.part_id] = { ...(summary[r.part_id] ?? { audio: 0, video: 0 }), [r.kind]: r.n };
      }
      res.json(summary);
    } catch (err) {
      console.error(`[GET ${base}/:id/media-summary] failed:`, err);
      res.status(500).json({ error: 'Failed to load media summary' });
    }
  });

  // Recent AI jobs: your own, or all of them for the team.
  router.get(`${base}/:workId/ai-jobs`, requireAuth, async (req, res) => {
    try {
      const work = await loadWork(pool, kind, req.params.workId);
      if (!work) return res.status(404).json({ error: 'Not found' });
      const team = await isTeam(pool, kind, work, req.user.id);
      const { rows } = await pool.query(
        `SELECT j.id, j.kind, j.status, j.error, j.${partColumn} AS part_id, j.created_at, j.started_at, j.finished_at,
                (j.result->>'progress')::numeric AS progress, j.user_id = $2 AS is_mine
           FROM ai_jobs j
          WHERE j.${workColumn} = $1 AND ($3 OR j.user_id = $2)
            AND (j.status IN ('queued', 'running') OR j.created_at > now() - interval '1 day')
          ORDER BY j.created_at DESC
          LIMIT 100`,
        [req.params.workId, req.user.id, team],
      );
      res.json(rows);
    } catch (err) {
      sendProviderError(res, err, 'Failed to load AI jobs');
    }
  });
}

// Moderation: the team approves / rejects / sets the primary item.
async function loadMediaForWork(mediaId) {
  if (!isUuid(mediaId)) return null;
  const { rows } = await pool.query(
    'SELECT * FROM chapter_media WHERE id = $1 AND (scene_id IS NOT NULL OR comic_issue_id IS NOT NULL)',
    [mediaId],
  );
  const media = rows[0];
  if (!media) return null;
  const kind = media.scene_id ? 'screenplay' : 'comic';
  const work = await loadWork(pool, kind, media.screenplay_id ?? media.comic_id);
  return work ? { media, kind, work } : null;
}

router.patch('/work-media/:mediaId', requireAuth, async (req, res) => {
  const { status, isPrimary, label } = req.body ?? {};
  try {
    const found = await loadMediaForWork(req.params.mediaId);
    if (!found) return res.status(404).json({ error: 'Media not found' });
    if (!(await isTeam(pool, found.kind, found.work, req.user.id))) {
      return res.status(403).json({ error: 'Only the team can moderate media' });
    }
    if (status !== undefined && !['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const partColumn = found.media.scene_id ? 'scene_id' : 'comic_issue_id';
    if (isPrimary === true) {
      await pool.query(`UPDATE chapter_media SET is_primary = false WHERE ${partColumn} = $1 AND kind = $2`, [
        found.media[partColumn],
        found.media.kind,
      ]);
    }
    const { rows } = await pool.query(
      `UPDATE chapter_media
          SET status = COALESCE($1, status),
              is_primary = COALESCE($2, is_primary),
              label = CASE WHEN $3::boolean THEN $4 ELSE label END,
              updated_at = now()
        WHERE id = $5 RETURNING *`,
      [status ?? null, typeof isPrimary === 'boolean' ? isPrimary : null, label !== undefined, label || null, found.media.id],
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /work-media/:id] failed:', err);
    res.status(500).json({ error: 'Failed to update media' });
  }
});

router.delete('/work-media/:mediaId', requireAuth, async (req, res) => {
  try {
    const found = await loadMediaForWork(req.params.mediaId);
    if (!found) return res.status(404).json({ error: 'Media not found' });
    const allowed = found.media.created_by === req.user.id || (await isTeam(pool, found.kind, found.work, req.user.id));
    if (!allowed) return res.status(403).json({ error: 'Not allowed to delete this media' });
    await pool.query('DELETE FROM chapter_media WHERE id = $1', [found.media.id]);
    if (found.media.source !== 'embed') removeStoredFile(found.media.url).catch(() => {});
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /work-media/:id] failed:', err);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

export default router;
