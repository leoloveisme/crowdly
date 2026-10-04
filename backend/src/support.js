// Public /support page: "Ask for help" support requests and "Report a bug"
// reports (kind = 'request' | 'bug'), submitted from the web
// (src/modules/support/) or the desktop app's Help → Report a bug…, and
// triaged on the staff Support dashboard.
// Tables: backend/migrations/0022_support_requests.sql.
//
// Anyone may submit; anonymous submissions must pass the CAPTCHA, signed-in
// ones skip it. Reports are private: only support staff and the reporter can
// read them (and their screenshots, which live outside the public /uploads
// mount).

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { requireAuth, getSessionUser, SESSION_COOKIE_NAME } from './sessions.js';
import { createNotification } from './notifications.js';
import { verifyCaptcha } from './feedback.js';
import { isMailerConfigured, sendSupportRequestEmail, sendSupportStatusEmail } from './email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUPPORT_UPLOADS_DIR = path.join(__dirname, '..', 'private-uploads', 'support');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

const KINDS = ['request', 'bug'];
const CATEGORIES = ['account', 'stories', 'desktop_app', 'spaces_sync', 'other'];
const SOURCES = ['web', 'desktop'];
const STATUSES = [
  'new', 'triaged', 'confirmed', 'in_progress', 'fixed', 'released',
  'resolved', 'wont_fix', 'duplicate', 'closed',
];

const MAX_NAME = 200;
const MAX_SUBJECT = 200;
const MAX_MESSAGE = 5000;
const MAX_DETAILS_JSON = 20000;
const MAX_ATTACHMENTS = 3;

const ALLOWED_MIME_EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

// Files are held in memory until the row exists, then written under
// <SUPPORT_UPLOADS_DIR>/<request_id>/ — at most 3 × 10 MB per submission.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_ATTACHMENTS },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME_EXTENSIONS[file.mimetype]) {
      cb(new Error('Unsupported image type — only PNG, JPEG, WEBP, and GIF are allowed'));
      return;
    }
    cb(null, true);
  },
});

// Small in-memory limiter: 5 submissions per 10 minutes per user (or per
// client IP when anonymous). Good enough for a single backend process; the
// CAPTCHA is the real guard for anonymous traffic.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const submissionLog = new Map();

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
  return req.ip;
}

function isRateLimited(key) {
  const now = Date.now();
  const recent = (submissionLog.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    submissionLog.set(key, recent);
    return true;
  }
  recent.push(now);
  submissionLog.set(key, recent);
  return false;
}

async function optionalUser(req) {
  try {
    return await getSessionUser(req.cookies?.[SESSION_COOKIE_NAME]);
  } catch {
    return null;
  }
}

// Mirrors the frontend's hasRole("platform_supporter") || hasRole("platform_admin").
async function isSupportStaff(userId) {
  if (!userId) return false;
  try {
    const { rows } = await pool.query(
      "SELECT 1 FROM user_roles WHERE user_id = $1 AND role IN ('platform_supporter', 'platform_admin')",
      [userId],
    );
    return rows.length > 0;
  } catch (err) {
    console.error('[isSupportStaff] failed:', err);
    return false;
  }
}

async function requireSupportStaff(req, res, next) {
  if (!(await isSupportStaff(req.user.id))) {
    return res.status(403).json({ error: 'Support staff only' });
  }
  next();
}

// multipart/form-data sends `details` as a JSON string; JSON bodies send an object.
function parseDetails(raw) {
  if (raw === undefined || raw === null || raw === '') return {};
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  if (JSON.stringify(value).length > MAX_DETAILS_JSON) return null;
  return value;
}

const str = (value) => (typeof value === 'string' ? value.trim() : '');

const SELECT_WITH_ATTACHMENTS = `
  SELECT r.id, r.kind, r.user_id, r.name, r.email, r.category, r.subject, r.message,
         r.details, r.status, r.duplicate_of, r.source, r.handled_by, r.created_at, r.updated_at,
         COALESCE(
           (SELECT json_agg(json_build_object(
                     'id', a.id, 'original_name', a.original_name, 'mime', a.mime, 'size', a.size)
                   ORDER BY a.created_at)
              FROM support_request_attachments a
             WHERE a.request_id = r.id),
           '[]'::json
         ) AS attachments
    FROM support_requests r`;

const router = express.Router();

router.post(
  '/support-requests',
  (req, res, next) => {
    if (!req.is('multipart/form-data')) return next();
    upload.array('attachments', MAX_ATTACHMENTS)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
      next();
    });
  },
  async (req, res) => {
    const body = req.body || {};
    const files = req.files ?? [];
    const user = await optionalUser(req);

    const kind = KINDS.includes(body.kind) ? body.kind : 'request';
    const category = CATEGORIES.includes(body.category) ? body.category : 'other';
    const source = SOURCES.includes(body.source) ? body.source : 'web';
    const name = str(body.name).slice(0, MAX_NAME);
    const email = str(body.email) || user?.email || '';
    const subject = str(body.subject);
    const message = str(body.message);
    const details = parseDetails(body.details);

    if (subject.length === 0 || subject.length > MAX_SUBJECT) {
      return res.status(400).json({ error: `A subject of up to ${MAX_SUBJECT} characters is required` });
    }
    if (message.length === 0 || message.length > MAX_MESSAGE) {
      return res.status(400).json({ error: `A message of up to ${MAX_MESSAGE} characters is required` });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (details === null) {
      return res.status(400).json({ error: 'Invalid details' });
    }
    if (kind === 'request' && files.length > 0) {
      return res.status(400).json({ error: 'Attachments are only accepted on bug reports' });
    }

    if (!user) {
      const { captchaId, captchaAnswer } = body;
      if (typeof captchaId !== 'string' || captchaId.length === 0 || typeof captchaAnswer !== 'string' || captchaAnswer.length === 0) {
        return res.status(400).json({ error: 'CAPTCHA answer is required' });
      }
      let captchaValid;
      try {
        captchaValid = await verifyCaptcha(captchaId, captchaAnswer);
      } catch (err) {
        console.error('[POST /support-requests] captcha verification failed:', err);
        return res.status(502).json({ error: 'CAPTCHA is temporarily unavailable' });
      }
      if (!captchaValid) {
        return res.status(400).json({ error: 'Incorrect CAPTCHA answer' });
      }
    }

    if (isRateLimited(user ? `u:${user.id}` : `ip:${clientIp(req)}`)) {
      return res.status(429).json({ error: 'Too many submissions. Please try again in a few minutes.' });
    }

    const client = await pool.connect();
    const writtenDir = { path: null };
    let row;
    try {
      await client.query('BEGIN');
      ({ rows: [row] } = await client.query(
        `INSERT INTO support_requests (kind, user_id, name, email, category, subject, message, details, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, kind, subject, created_at`,
        [kind, user?.id ?? null, name, email, category, subject, message, details, source],
      ));

      if (files.length > 0) {
        const dir = path.join(SUPPORT_UPLOADS_DIR, row.id);
        fs.mkdirSync(dir, { recursive: true });
        writtenDir.path = dir;
        for (const file of files) {
          const filename = `${randomUUID()}${ALLOWED_MIME_EXTENSIONS[file.mimetype]}`;
          fs.writeFileSync(path.join(dir, filename), file.buffer);
          await client.query(
            `INSERT INTO support_request_attachments (request_id, filename, original_name, mime, size)
             VALUES ($1, $2, $3, $4, $5)`,
            [row.id, filename, String(file.originalname || '').slice(0, 255), file.mimetype, file.size],
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (writtenDir.path) fs.rmSync(writtenDir.path, { recursive: true, force: true });
      console.error('[POST /support-requests] failed:', err);
      return res.status(500).json({ error: 'Could not submit right now. Please try again.' });
    } finally {
      client.release();
    }

    if (isMailerConfigured()) {
      sendSupportRequestEmail({ id: row.id, kind, name, email, category, subject, message, details, source })
        .catch((err) => console.error('[POST /support-requests] notification email failed:', err));
    }

    res.status(201).json({ ok: true, id: row.id });
  },
);

router.get('/support-requests/mine', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `${SELECT_WITH_ATTACHMENTS} WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 100`,
      [req.user.id],
    );
    res.json({ requests: rows });
  } catch (err) {
    console.error('[GET /support-requests/mine] failed:', err);
    res.status(500).json({ error: 'Failed to load your requests' });
  }
});

router.get('/support-requests', requireAuth, requireSupportStaff, async (req, res) => {
  const where = [];
  const params = [];
  const add = (clause, value) => {
    params.push(value);
    where.push(clause.replace('?', `$${params.length}`));
  };
  if (KINDS.includes(req.query.kind)) add('r.kind = ?', req.query.kind);
  if (STATUSES.includes(req.query.status)) add('r.status = ?', req.query.status);
  if (CATEGORIES.includes(req.query.category)) add('r.category = ?', req.query.category);
  if (typeof req.query.severity === 'string' && req.query.severity) add("r.details->>'severity' = ?", req.query.severity);
  if (typeof req.query.area === 'string' && req.query.area) add("r.details->>'area' = ?", req.query.area);

  try {
    const { rows } = await pool.query(
      `${SELECT_WITH_ATTACHMENTS} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY r.created_at DESC LIMIT 200`,
      params,
    );
    res.json({ requests: rows });
  } catch (err) {
    console.error('[GET /support-requests] failed:', err);
    res.status(500).json({ error: 'Failed to load support requests' });
  }
});

router.patch('/support-requests/:id', requireAuth, requireSupportStaff, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const duplicateOf = req.body?.duplicate_of ?? null;

  if (!isUuid(id)) return res.status(404).json({ error: 'Not found' });
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (status === 'duplicate') {
    if (!isUuid(duplicateOf) || duplicateOf === id) {
      return res.status(400).json({ error: 'A duplicate needs the id of the original report' });
    }
    const { rows } = await pool.query('SELECT 1 FROM support_requests WHERE id = $1', [duplicateOf]);
    if (rows.length === 0) return res.status(400).json({ error: 'Original report not found' });
  }

  try {
    const { rows: [before] } = await pool.query(
      'SELECT id, kind, user_id, email, subject, status FROM support_requests WHERE id = $1',
      [id],
    );
    if (!before) return res.status(404).json({ error: 'Not found' });

    await pool.query(
      `UPDATE support_requests
          SET status = $1, duplicate_of = $2, handled_by = $3, updated_at = now()
        WHERE id = $4`,
      [status, status === 'duplicate' ? duplicateOf : null, req.user.id, id],
    );
    const { rows: [after] } = await pool.query(`${SELECT_WITH_ATTACHMENTS} WHERE r.id = $1`, [id]);

    if (before.status !== status) {
      if (before.user_id) {
        createNotification(before.user_id, 'support_request_status', {
          supportRequestId: id,
          kind: before.kind,
          subject: before.subject,
          status,
        }).catch((err) => console.error('[PATCH /support-requests] notify failed:', err));
      } else if (isMailerConfigured()) {
        sendSupportStatusEmail({ to: before.email, kind: before.kind, subject: before.subject, status })
          .catch((err) => console.error('[PATCH /support-requests] status email failed:', err));
      }
    }

    res.json({ request: after });
  } catch (err) {
    console.error('[PATCH /support-requests/:id] failed:', err);
    res.status(500).json({ error: 'Failed to update the request' });
  }
});

router.get('/support-requests/:id/attachments/:attachmentId', requireAuth, async (req, res) => {
  const { id, attachmentId } = req.params;
  if (!isUuid(id) || !isUuid(attachmentId)) return res.status(404).json({ error: 'Not found' });
  try {
    const { rows: [att] } = await pool.query(
      `SELECT a.filename, a.mime, r.user_id
         FROM support_request_attachments a
         JOIN support_requests r ON r.id = a.request_id
        WHERE a.id = $1 AND a.request_id = $2`,
      [attachmentId, id],
    );
    if (!att) return res.status(404).json({ error: 'Not found' });
    if (att.user_id !== req.user.id && !(await isSupportStaff(req.user.id))) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.setHeader('Content-Type', att.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(path.join(SUPPORT_UPLOADS_DIR, id, path.basename(att.filename)), (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Not found' });
    });
  } catch (err) {
    console.error('[GET /support-requests/:id/attachments/:attachmentId] failed:', err);
    res.status(500).json({ error: 'Failed to load the attachment' });
  }
});

export default router;
