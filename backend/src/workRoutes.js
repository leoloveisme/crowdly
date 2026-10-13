// Story-page controls for screenplays and comics: settings, people (team,
// authors/co-authors, ownership transfer), access rules, clone, delete and
// "ask to collaborate" requests. Each route exists once and is mounted per
// kind under that kind's existing URL prefix (/screenplays/:id/...,
// /comics/:id/...), mirroring the story routes in server.js.

import express from 'express';
import { pool } from './db.js';
import { requireAuth } from './sessions.js';
import { createNotification } from './notifications.js';
import { USER_SUMMARY_JOIN, USER_SUMMARY_SELECT, toUserSummary } from './userSummary.js';
import {
  KINDS,
  POLICIES,
  canUsePolicy,
  canView,
  isOwner,
  isPlatformAdminOrEditor,
  isTeam,
  isUuid,
  loadWork,
  optionalUserId,
  policyFlags,
  viewDeniedMessage,
  writeAccess,
} from './workAccess.js';

const BASE = { screenplay: '/screenplays', comic: '/comics' };
const PAGE = { screenplay: '/screenplay', comic: '/comic' };
const RULE_TYPES = new Set(['view', 'clone', 'export', 'translate', 'narrate']);

// Settings columns the owner may change, with their validators.
const COMMON_SETTINGS = {
  title: (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined),
  visibility: (v) => (['public', 'unlisted', 'private'].includes(v) ? v : undefined),
  published: (v) => Boolean(v),
  completion_status: (v) => (['draft', 'completed'].includes(v) ? v : undefined),
  clone_policy: (v) => (POLICIES.has(v) ? v : undefined),
  export_policy: (v) => (POLICIES.has(v) ? v : undefined),
  translation_policy: (v) => (POLICIES.has(v) ? v : undefined),
  narration_policy: (v) => (POLICIES.has(v) ? v : undefined),
  language: (v) => (typeof v === 'string' && v ? v : 'en'),
  cover_image_url: (v) => v || null,
  description: (v) => v || null,
  genre: (v) => v || null,
  tags: (v) => (Array.isArray(v) ? v.map(String) : null),
};
const KIND_SETTINGS = {
  screenplay: { format_type: (v) => v || null },
  comic: { reading_direction: (v) => (v === 'rtl' ? 'rtl' : 'ltr') },
};

async function userSummaries(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { rows } = await pool.query(
    `SELECT u.id, u.email, p.first_name, p.last_name, p.nickname
       FROM local_users u LEFT JOIN profiles p ON p.id = u.id
      WHERE u.id = ANY($1::uuid[])`,
    [unique],
  );
  return new Map(rows.map((r) => [r.id, r]));
}

// ---------------------------------------------------------------------------
// Clone: kind-specific copies of the work's content
// ---------------------------------------------------------------------------

async function cloneScreenplay(client, src, userId) {
  const { rows } = await client.query(
    `INSERT INTO screenplay_title
       (title, creator_id, visibility, published, genre, tags, format_type, description, language, cover_image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING screenplay_id`,
    [
      src.title,
      userId,
      src.visibility ?? 'public',
      src.published ?? true,
      src.genre,
      src.tags,
      src.format_type,
      src.description,
      src.language || 'en',
      src.cover_image_url,
    ],
  );
  const newId = rows[0].screenplay_id;
  await client.query(
    "INSERT INTO screenplay_access (screenplay_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING",
    [newId, userId],
  );
  const scenes = await client.query('SELECT * FROM screenplay_scene WHERE screenplay_id = $1 ORDER BY scene_index', [
    src.screenplay_id,
  ]);
  for (const scene of scenes.rows) {
    const inserted = await client.query(
      `INSERT INTO screenplay_scene
         (screenplay_id, scene_index, slugline, location, time_of_day, is_interior, synopsis, published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING scene_id`,
      [
        newId,
        scene.scene_index,
        scene.slugline,
        scene.location,
        scene.time_of_day,
        scene.is_interior,
        scene.synopsis,
        scene.published ?? true,
      ],
    );
    await client.query(
      `INSERT INTO screenplay_block (screenplay_id, scene_id, block_index, block_type, text, metadata)
       SELECT $1, $2, block_index, block_type, text, metadata
         FROM screenplay_block WHERE scene_id = $3`,
      [newId, inserted.rows[0].scene_id, scene.scene_id],
    );
  }
  return newId;
}

async function cloneComic(client, src, userId) {
  const { rows } = await client.query(
    `INSERT INTO comic_title
       (title, creator_id, visibility, published, genre, tags, cover_image_url, reading_direction, description, language)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING comic_id`,
    [
      src.title,
      userId,
      src.visibility ?? 'public',
      src.published ?? true,
      src.genre,
      src.tags,
      src.cover_image_url,
      src.reading_direction ?? 'ltr',
      src.description,
      src.language || 'en',
    ],
  );
  const newId = rows[0].comic_id;
  const issues = await client.query('SELECT * FROM comic_issue WHERE comic_id = $1 ORDER BY issue_index', [
    src.comic_id,
  ]);
  // Pages share the original image files; deleting a page only removes the
  // file once no page references it any more (see comics.js).
  for (const issue of issues.rows) {
    const inserted = await client.query(
      'INSERT INTO comic_issue (comic_id, issue_index, title, published) VALUES ($1, $2, $3, $4) RETURNING issue_id',
      [newId, issue.issue_index, issue.title, issue.published],
    );
    await client.query(
      `INSERT INTO comic_page (comic_id, issue_id, page_index, image_url, alt_text, width, height)
       SELECT $1, $2, page_index, image_url, alt_text, width, height
         FROM comic_page WHERE issue_id = $3`,
      [newId, inserted.rows[0].issue_id, issue.issue_id],
    );
  }
  return newId;
}

const CLONERS = { screenplay: cloneScreenplay, comic: cloneComic };

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createWorkRouter(kind) {
  const k = KINDS[kind];
  const base = BASE[kind];
  const router = express.Router();

  // Loads the work into req.work, 404 when missing.
  const withWork = async (req, res, next) => {
    try {
      const work = await loadWork(pool, kind, req.params.workId);
      if (!work) return res.status(404).json({ error: `${k.noun[0].toUpperCase()}${k.noun.slice(1)} not found` });
      req.work = work;
      next();
    } catch (err) {
      next(err);
    }
  };

  const ownerOnly = async (req, res, next) => {
    if (await isOwner(pool, kind, req.work, req.user.id)) return next();
    return res.status(403).json({ error: `Only the ${k.noun} owner can do this` });
  };

  // What the caller may do with this work.
  router.get(`${base}/:workId/my-access`, withWork, async (req, res) => {
    try {
      const userId = await optionalUserId(req);
      const access = await writeAccess(pool, kind, req.work, userId);
      const flags = await policyFlags(pool, kind, req.work, userId);
      res.json({
        ...access,
        isOwner: access.role === 'owner',
        isAdmin: await isPlatformAdminOrEditor(userId),
        ...flags,
      });
    } catch (err) {
      console.error(`[GET ${base}/:id/my-access] failed:`, err);
      res.status(500).json({ error: 'Failed to resolve access role' });
    }
  });

  router.patch(`${base}/:workId/settings`, requireAuth, withWork, ownerOnly, async (req, res) => {
    const validators = { ...COMMON_SETTINGS, ...KIND_SETTINGS[kind] };
    const fields = [];
    const values = [];
    for (const [column, validate] of Object.entries(validators)) {
      if (req.body?.[column] === undefined) continue;
      const value = validate(req.body[column]);
      if (value === undefined) return res.status(400).json({ error: `Invalid value for ${column}` });
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No settings to update' });
    values.push(req.work[k.id]);
    try {
      const { rows } = await pool.query(
        `UPDATE ${k.table} SET ${fields.join(', ')}, updated_at = now() WHERE ${k.id} = $${values.length} RETURNING *`,
        values,
      );
      res.json(rows[0]);
    } catch (err) {
      console.error(`[PATCH ${base}/:id/settings] failed:`, err);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  router.delete(`${base}/:workId`, requireAuth, withWork, async (req, res) => {
    try {
      const allowed =
        (await isOwner(pool, kind, req.work, req.user.id)) || (await isPlatformAdminOrEditor(req.user.id));
      if (!allowed) return res.status(403).json({ error: `Only the ${k.noun} owner can delete it` });
      await pool.query(`DELETE FROM ${k.table} WHERE ${k.id} = $1`, [req.work[k.id]]);
      res.status(204).send();
    } catch (err) {
      console.error(`[DELETE ${base}/:id] failed:`, err);
      res.status(500).json({ error: `Failed to delete ${k.noun}` });
    }
  });

  // Everyone who worked on it: creator, team, authors/co-authors, editors.
  router.get(`${base}/:workId/contributors`, withWork, async (req, res) => {
    try {
      const userId = await optionalUserId(req);
      if (!(await canView(pool, kind, req.work, userId))) {
        return res.status(403).json({ error: viewDeniedMessage(kind, req.work) });
      }
      const id = req.work[k.id];
      const roles = new Map();
      const add = (uid, role) => {
        if (uid && !roles.has(uid)) roles.set(uid, role);
      };
      add(req.work.creator_id, 'creator');
      const access = await pool.query(`SELECT user_id, role FROM ${k.access} WHERE ${k.id} = $1`, [id]);
      for (const r of access.rows) add(r.user_id, r.role === 'owner' ? 'owner' : 'contributor');
      const credits = await pool.query(`SELECT user_id, role FROM work_collaborators WHERE ${k.id} = $1`, [id]);
      for (const r of credits.rows) add(r.user_id, r.role);
      if (kind === 'screenplay') {
        const editors = await pool.query(
          'SELECT DISTINCT created_by FROM screenplay_revisions WHERE screenplay_title_id = $1 AND created_by IS NOT NULL',
          [id],
        );
        for (const r of editors.rows) add(r.created_by, 'contributor');
      }
      const people = await userSummaries([...roles.keys()]);
      res.json(
        [...roles.entries()]
          .filter(([uid]) => people.has(uid))
          .map(([uid, role]) => ({ user_id: uid, role, ...people.get(uid) })),
      );
    } catch (err) {
      console.error(`[GET ${base}/:id/contributors] failed:`, err);
      res.status(500).json({ error: 'Failed to fetch contributors' });
    }
  });

  // Owner grants / revokes team (editing) access.
  router.post(`${base}/:workId/contributors`, requireAuth, withWork, ownerOnly, async (req, res) => {
    const { userId, email } = req.body ?? {};
    try {
      let grantUserId = isUuid(userId) ? userId : null;
      if (!grantUserId && email) {
        const found = await pool.query('SELECT id FROM local_users WHERE lower(email) = lower($1)', [email]);
        grantUserId = found.rows[0]?.id ?? null;
        if (!grantUserId) return res.status(404).json({ error: 'No user found with that email' });
      }
      if (!grantUserId) return res.status(400).json({ error: 'userId or email is required' });
      await pool.query(
        `INSERT INTO ${k.access} (${k.id}, user_id, role) VALUES ($1, $2, 'contributor')
         ON CONFLICT (${k.id}, user_id) DO NOTHING`,
        [req.work[k.id], grantUserId],
      );
      res.status(201).json({ userId: grantUserId, role: 'contributor' });
    } catch (err) {
      console.error(`[POST ${base}/:id/contributors] failed:`, err);
      res.status(500).json({ error: 'Failed to grant access' });
    }
  });

  router.delete(`${base}/:workId/contributors/:userId`, requireAuth, withWork, ownerOnly, async (req, res) => {
    try {
      await pool.query(`DELETE FROM ${k.access} WHERE ${k.id} = $1 AND user_id = $2 AND role <> 'owner'`, [
        req.work[k.id],
        isUuid(req.params.userId) ? req.params.userId : null,
      ]);
      res.status(204).send();
    } catch (err) {
      console.error(`[DELETE ${base}/:id/contributors/:userId] failed:`, err);
      res.status(500).json({ error: 'Failed to revoke access' });
    }
  });

  // Authors / co-authors (credits).
  router.get(`${base}/:workId/collaborators`, withWork, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT wc.user_id, wc.role, wc.created_at, u.email, p.first_name, p.last_name, p.nickname
           FROM work_collaborators wc
           JOIN local_users u ON u.id = wc.user_id
           LEFT JOIN profiles p ON p.id = wc.user_id
          WHERE wc.${k.id} = $1
          ORDER BY wc.role, wc.created_at`,
        [req.work[k.id]],
      );
      res.json(rows);
    } catch (err) {
      console.error(`[GET ${base}/:id/collaborators] failed:`, err);
      res.status(500).json({ error: 'Failed to fetch collaborators' });
    }
  });

  for (const [path, role] of [
    ['authors', 'author'],
    ['coauthors', 'coauthor'],
  ]) {
    router.post(`${base}/:workId/${path}`, requireAuth, withWork, ownerOnly, async (req, res) => {
      const { userId } = req.body ?? {};
      if (!isUuid(userId)) return res.status(400).json({ error: 'userId is required' });
      try {
        await pool.query(
          `INSERT INTO work_collaborators (${k.id}, user_id, role) VALUES ($1, $2, $3)
           ON CONFLICT (${k.id}, user_id) WHERE ${k.id} IS NOT NULL DO UPDATE SET role = EXCLUDED.role`,
          [req.work[k.id], userId, role],
        );
        const { rows } = await pool.query(
          `SELECT wc.user_id, wc.role, wc.created_at, u.email, p.first_name, p.last_name, p.nickname
             FROM work_collaborators wc
             JOIN local_users u ON u.id = wc.user_id
             LEFT JOIN profiles p ON p.id = wc.user_id
            WHERE wc.${k.id} = $1 AND wc.user_id = $2`,
          [req.work[k.id], userId],
        );
        res.json(rows[0]);
      } catch (err) {
        console.error(`[POST ${base}/:id/${path}] failed:`, err);
        res.status(500).json({ error: `Failed to add ${role}` });
      }
    });

    router.delete(`${base}/:workId/${path}/:userId`, requireAuth, withWork, ownerOnly, async (req, res) => {
      try {
        await pool.query(`DELETE FROM work_collaborators WHERE ${k.id} = $1 AND user_id = $2 AND role = $3`, [
          req.work[k.id],
          isUuid(req.params.userId) ? req.params.userId : null,
          role,
        ]);
        res.json({ success: true });
      } catch (err) {
        console.error(`[DELETE ${base}/:id/${path}/:userId] failed:`, err);
        res.status(500).json({ error: `Failed to remove ${role}` });
      }
    });
  }

  router.post(`${base}/:workId/transfer-ownership`, requireAuth, withWork, async (req, res) => {
    const { newOwnerId } = req.body ?? {};
    if (!isUuid(newOwnerId)) return res.status(400).json({ error: 'newOwnerId is required' });
    const id = req.work[k.id];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(`SELECT creator_id FROM ${k.table} WHERE ${k.id} = $1 FOR UPDATE`, [id]);
      const currentOwnerId = current.rows[0]?.creator_id;
      if (currentOwnerId !== req.user.id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Only the current owner can transfer ownership' });
      }
      if (newOwnerId === currentOwnerId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'New owner must be different from the current owner' });
      }
      const target = await client.query('SELECT 1 FROM local_users WHERE id = $1', [newOwnerId]);
      if (target.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Target user not found' });
      }
      await client.query(`UPDATE ${k.table} SET creator_id = $1, updated_at = now() WHERE ${k.id} = $2`, [
        newOwnerId,
        id,
      ]);
      // The previous owner stays on the team as a contributor.
      await client.query(
        `INSERT INTO ${k.access} (${k.id}, user_id, role) VALUES ($1, $2, 'contributor')
         ON CONFLICT (${k.id}, user_id) DO UPDATE SET role = 'contributor'`,
        [id, currentOwnerId],
      );
      await client.query(
        `INSERT INTO ${k.access} (${k.id}, user_id, role) VALUES ($1, $2, 'owner')
         ON CONFLICT (${k.id}, user_id) DO UPDATE SET role = 'owner'`,
        [id, newOwnerId],
      );
      await client.query('COMMIT');
      const { rows } = await pool.query(`SELECT * FROM ${k.table} WHERE ${k.id} = $1`, [id]);
      res.json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`[POST ${base}/:id/transfer-ownership] failed:`, err);
      res.status(500).json({ error: 'Failed to transfer ownership' });
    } finally {
      client.release();
    }
  });

  // Viewers / cloners / exporters / translators / narrators.
  const listRules = (db, id, ruleType) =>
    db.query(
      `SELECT r.*, u.email AS user_email, p.first_name AS user_first_name, p.last_name AS user_last_name,
              g.name AS group_name
         FROM ${k.rules} r
         LEFT JOIN local_users u ON u.id = r.grantee_user_id
         LEFT JOIN profiles p ON p.id = r.grantee_user_id
         LEFT JOIN user_groups g ON g.id = r.grantee_group_id
        WHERE r.${k.rulesId} = $1 ${ruleType ? 'AND r.rule_type = $2' : ''}
        ORDER BY r.rule_type, r.created_at`,
      ruleType ? [id, ruleType] : [id],
    );

  router.get(`${base}/:workId/access-rules`, requireAuth, withWork, async (req, res) => {
    try {
      if (!(await isTeam(pool, kind, req.work, req.user.id))) return res.status(403).json({ error: 'Not allowed' });
      const { rows } = await listRules(pool, req.work[k.id]);
      res.json(rows);
    } catch (err) {
      console.error(`[GET ${base}/:id/access-rules] failed:`, err);
      res.status(500).json({ error: 'Failed to fetch access rules' });
    }
  });

  router.put(`${base}/:workId/access-rules`, requireAuth, withWork, ownerOnly, async (req, res) => {
    const { ruleType, grants } = req.body ?? {};
    if (!RULE_TYPES.has(ruleType) || !Array.isArray(grants)) {
      return res.status(400).json({ error: 'ruleType and grants[] are required' });
    }
    const id = req.work[k.id];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM ${k.rules} WHERE ${k.rulesId} = $1 AND rule_type = $2`, [id, ruleType]);
      for (const g of grants) {
        if (isUuid(g?.userId)) {
          await client.query(
            `INSERT INTO ${k.rules} (${k.rulesId}, rule_type, grantee_user_id) VALUES ($1, $2, $3)`,
            [id, ruleType, g.userId],
          );
        } else if (isUuid(g?.groupId)) {
          await client.query(
            `INSERT INTO ${k.rules} (${k.rulesId}, rule_type, grantee_group_id) VALUES ($1, $2, $3)`,
            [id, ruleType, g.groupId],
          );
        }
      }
      await client.query('COMMIT');
      const { rows } = await listRules(pool, id, ruleType);
      res.json(rows);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`[PUT ${base}/:id/access-rules] failed:`, err);
      res.status(500).json({ error: 'Failed to update access rules' });
    } finally {
      client.release();
    }
  });

  router.post(`${base}/:workId/clone`, requireAuth, withWork, async (req, res) => {
    const userId = req.user.id;
    if (!(await canView(pool, kind, req.work, userId))) {
      return res.status(403).json({ error: viewDeniedMessage(kind, req.work) });
    }
    if (!(await canUsePolicy(pool, kind, req.work, userId, 'clone_policy', 'clone'))) {
      return res.status(403).json({ error: `You do not have permission to clone this ${k.noun}.` });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const newId = await CLONERS[kind](client, req.work, userId);
      await client.query('COMMIT');
      res.status(201).json({ id: newId });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`[POST ${base}/:id/clone] failed:`, err);
      res.status(500).json({ error: `Failed to clone ${k.noun}` });
    } finally {
      client.release();
    }
  });

  // --- "Ask to collaborate" (answered via /collaboration-requests/:id/...) ---
  const serializeRequest = (row) => ({
    id: row.id,
    [k.id]: row[k.id],
    message: row.message,
    status: row.status,
    created_at: row.created_at,
    decided_at: row.decided_at,
    requester: row.u_id
      ? toUserSummary({ id: row.u_id, email: row.email, username: row.username, profile_page_name: row.profile_page_name })
      : undefined,
  });

  router.post(`${base}/:workId/collaboration-requests`, requireAuth, withWork, async (req, res) => {
    const userId = req.user.id;
    const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';
    try {
      if (!(await canView(pool, kind, req.work, userId))) return res.status(404).json({ error: 'Not found' });
      if (await isTeam(pool, kind, req.work, userId)) {
        return res.status(409).json({ error: `You can already edit this ${k.noun}` });
      }
      const id = req.work[k.id];
      const existing = await pool.query(
        `SELECT * FROM story_collaboration_requests WHERE ${k.id} = $1 AND requester_id = $2 AND status = 'pending'`,
        [id, userId],
      );
      if (existing.rows[0]) return res.json({ request: serializeRequest(existing.rows[0]) });
      const { rows } = await pool.query(
        `INSERT INTO story_collaboration_requests (${k.id}, requester_id, message) VALUES ($1, $2, $3) RETURNING *`,
        [id, userId, message],
      );
      const who = await pool.query(
        `SELECT ${USER_SUMMARY_SELECT} FROM local_users u ${USER_SUMMARY_JOIN} WHERE u.id = $1`,
        [userId],
      );
      if (req.work.creator_id) {
        createNotification(req.work.creator_id, 'collaboration_request', {
          requesterName: who.rows[0] ? toUserSummary(who.rows[0]).displayName : '',
          requestId: rows[0].id,
          contentType: kind,
          workPath: `${PAGE[kind]}/${id}`,
          storyTitle: req.work.title,
          requesterId: userId,
          message,
        }).catch((err) => console.error('[collaboration-requests] notify failed:', err));
      }
      res.status(201).json({ request: serializeRequest(rows[0]) });
    } catch (err) {
      console.error(`[POST ${base}/:id/collaboration-requests] failed:`, err);
      res.status(500).json({ error: 'Failed to send the request' });
    }
  });

  router.get(`${base}/:workId/collaboration-requests/mine`, requireAuth, withWork, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM story_collaboration_requests WHERE ${k.id} = $1 AND requester_id = $2
          ORDER BY created_at DESC LIMIT 1`,
        [req.work[k.id], req.user.id],
      );
      res.json({ request: rows[0] ? serializeRequest(rows[0]) : null });
    } catch (err) {
      console.error(`[GET ${base}/:id/collaboration-requests/mine] failed:`, err);
      res.status(500).json({ error: 'Failed to load the request' });
    }
  });

  router.get(`${base}/:workId/collaboration-requests`, requireAuth, withWork, ownerOnly, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT r.*, ${USER_SUMMARY_SELECT.replace('u.id', 'u.id AS u_id')}
           FROM story_collaboration_requests r
           JOIN local_users u ON u.id = r.requester_id
           ${USER_SUMMARY_JOIN}
          WHERE r.${k.id} = $1 AND r.status = 'pending'
          ORDER BY r.created_at ASC`,
        [req.work[k.id]],
      );
      res.json({ requests: rows.map(serializeRequest) });
    } catch (err) {
      console.error(`[GET ${base}/:id/collaboration-requests] failed:`, err);
      res.status(500).json({ error: 'Failed to load requests' });
    }
  });

  return router;
}
