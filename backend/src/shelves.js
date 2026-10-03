// Shelves: the Discovery mode of the desktop app and the web /shelves page.
// Tables: backend/migrations/0019_shelves.sql. Desktop client:
// apps/desktop/src/editor/library/sync.py; web: src/pages/Shelves.tsx.
//
// System shelves are computed, never stored:
//   favorites / living / lived      the user's user_story_status flags
//   newest / most_active / most_popular   the platform's public lists
// Custom shelves are private to their owner:
//   manual  chosen items (library books, stories, screenplays) in an order
//   smart   rules evaluated on request against the user's own items
//
// Every route needs a session and only touches the caller's rows. Library
// books can only be shelved by their owner, so a shelf never exposes an
// imported book to anyone else.

import express from 'express';
import { pool } from './db.js';
import { requireAuth } from './sessions.js';
import { loadStory, canViewStory } from './storyAccess.js';
import {
  fetchNewestStories,
  fetchMostActiveStories,
  fetchMostPopularStories,
  fetchNewestScreenplays,
  fetchMostActiveScreenplays,
  fetchMostPopularScreenplays,
  fetchUserExperienceItems,
  setUserStoryStatus,
} from './storyLists.js';

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);
const clip = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const ITEM_TYPES = new Set(['library_item', 'story', 'screenplay']);
const SORTS = new Set(['manual', 'title', 'added', 'progress', 'last_read']);
const SYSTEM_STATUS_SHELVES = { favorites: 'is_favorite', living: 'is_living', lived: 'is_lived' };
const SYSTEM_LIST_SHELVES = {
  newest: fetchNewestStories,
  most_active: fetchMostActiveStories,
  most_popular: fetchMostPopularStories,
};
const SYSTEM_SHELF_KEYS = [...Object.keys(SYSTEM_STATUS_SHELVES), ...Object.keys(SYSTEM_LIST_SHELVES)];
const SYSTEM_LIST_LIMIT = 50;
const FINISHED_PERCENT = 98;
const MAX_RULES = 20;

// -- smart rules ----------------------------------------------------------------

// field -> { ops, values? (allowed enum), type }
export const RULE_FIELDS = {
  source: { ops: ['is'], values: ['library', 'crowdly'] },
  format: { ops: ['is'], values: ['epub', 'pdf', 'audio', 'text', 'story', 'screenplay'] },
  language: { ops: ['is'], type: 'text' },
  title: { ops: ['contains'], type: 'text' },
  author: { ops: ['contains'], type: 'text' },
  status: { ops: ['is'], values: ['favorite', 'living', 'lived'] },
  progress: { ops: ['is'], values: ['unread', 'reading', 'finished'] },
  added_within_days: { ops: ['lte'], type: 'days' },
  read_within_days: { ops: ['lte'], type: 'days' },
};

/** Validate and normalise a rule tree; throws an Error with a user-facing message. */
export function validateRules(input) {
  if (!input || typeof input !== 'object') throw new Error('Rules are required for a smart shelf');
  const match = input.match === 'any' ? 'any' : 'all';
  const list = Array.isArray(input.rules) ? input.rules : [];
  if (list.length === 0) throw new Error('A smart shelf needs at least one rule');
  if (list.length > MAX_RULES) throw new Error(`A smart shelf can have at most ${MAX_RULES} rules`);
  const rules = list.map((rule) => {
    const spec = RULE_FIELDS[rule?.field];
    if (!spec) throw new Error(`Unknown rule field: ${rule?.field}`);
    if (!spec.ops.includes(rule.op)) throw new Error(`Unknown operator for ${rule.field}: ${rule.op}`);
    let value = rule.value;
    if (spec.values) {
      if (!spec.values.includes(value)) throw new Error(`Unknown value for ${rule.field}: ${value}`);
    } else if (spec.type === 'days') {
      value = Math.floor(Number(value));
      if (!Number.isFinite(value) || value < 1 || value > 36500) throw new Error(`${rule.field} needs a number of days`);
    } else {
      value = clip(value, 200);
      if (!value) throw new Error(`${rule.field} needs a value`);
    }
    return { field: rule.field, op: rule.op, value };
  });
  return { match, rules };
}

function progressState(percent) {
  if (!percent || percent <= 0) return 'unread';
  if (percent >= FINISHED_PERCENT) return 'finished';
  return 'reading';
}

const DAY_MS = 24 * 60 * 60 * 1000;

function ruleMatches(item, rule, now) {
  switch (rule.field) {
    case 'source':
      return (item.type === 'library_item' ? 'library' : 'crowdly') === rule.value;
    case 'format':
      return item.format === rule.value;
    case 'language':
      return (item.language || '').toLowerCase().startsWith(rule.value.toLowerCase());
    case 'title':
      return (item.title || '').toLowerCase().includes(rule.value.toLowerCase());
    case 'author':
      return (item.author || '').toLowerCase().includes(rule.value.toLowerCase());
    case 'status':
      return Boolean(item.status?.[rule.value]);
    case 'progress':
      return progressState(item.progress) === rule.value;
    case 'added_within_days':
      return item.added_at && now - new Date(item.added_at).getTime() <= rule.value * DAY_MS;
    case 'read_within_days':
      return item.last_read_at && now - new Date(item.last_read_at).getTime() <= rule.value * DAY_MS;
    default:
      return false;
  }
}

export function evaluateRules(items, rules) {
  const now = Date.now();
  return items.filter((item) =>
    rules.match === 'any'
      ? rules.rules.some((r) => ruleMatches(item, r, now))
      : rules.rules.every((r) => ruleMatches(item, r, now)),
  );
}

// -- items --------------------------------------------------------------------

const iso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);
const latest = (...values) =>
  values.filter(Boolean).map((v) => new Date(v)).sort((a, b) => b - a)[0]?.toISOString() ?? null;

/**
 * Everything a user's smart shelves can match, keyed "type:id": their
 * imported books and every story/screenplay they flagged or read in
 * Discovery, with status flags, progress and dates.
 */
async function loadCandidates(userId) {
  const [library, statuses, readStories] = await Promise.all([
    pool.query(
      `SELECT li.id, li.title, li.author, li.language, li.format, li.created_at,
              rp.percent, rp.updated_at AS position_at,
              (SELECT max(rs.ended_at) FROM reading_sessions rs WHERE rs.library_item_id = li.id) AS session_at
         FROM library_items li
         LEFT JOIN reading_positions rp ON rp.library_item_id = li.id AND rp.user_id = li.user_id
        WHERE li.user_id = $1 AND li.deleted_at IS NULL AND li.kind = 'imported_book'`,
      [userId],
    ),
    pool.query(
      `SELECT us.content_type, us.story_title_id, us.screenplay_id, us.created_at,
              us.is_favorite, us.is_living, us.is_lived,
              COALESCE(st.title, sp.title) AS title,
              st.language
         FROM user_story_status us
         LEFT JOIN story_title st ON st.story_title_id = us.story_title_id
         LEFT JOIN screenplay_title sp ON sp.screenplay_id = us.screenplay_id
        WHERE us.user_id = $1 AND COALESCE(st.title, sp.title) IS NOT NULL`,
      [userId],
    ),
    pool.query(
      `SELECT li.story_title_id, li.created_at, st.title, st.language,
              rp.percent, rp.updated_at AS position_at,
              (SELECT max(rs.ended_at) FROM reading_sessions rs WHERE rs.library_item_id = li.id) AS session_at
         FROM library_items li
         JOIN story_title st ON st.story_title_id = li.story_title_id
         LEFT JOIN reading_positions rp ON rp.library_item_id = li.id AND rp.user_id = li.user_id
        WHERE li.user_id = $1 AND li.deleted_at IS NULL AND li.kind = 'crowdly_story'`,
      [userId],
    ),
  ]);

  const items = new Map();
  for (const r of library.rows) {
    items.set(`library_item:${r.id}`, {
      type: 'library_item',
      id: r.id,
      title: r.title,
      subtitle: r.author || null,
      author: r.author || '',
      language: r.language || '',
      format: r.format,
      progress: r.percent === null ? 0 : Number(r.percent),
      added_at: iso(r.created_at),
      last_read_at: latest(r.position_at, r.session_at),
      status: {},
    });
  }
  for (const r of statuses.rows) {
    const type = r.content_type;
    const id = type === 'story' ? r.story_title_id : r.screenplay_id;
    items.set(`${type}:${id}`, {
      type,
      id,
      title: r.title,
      subtitle: null,
      author: '',
      language: r.language || '',
      format: type,
      progress: 0,
      added_at: iso(r.created_at),
      last_read_at: null,
      status: { favorite: r.is_favorite, living: r.is_living, lived: r.is_lived },
    });
  }
  for (const r of readStories.rows) {
    const key = `story:${r.story_title_id}`;
    const existing = items.get(key) ?? {
      type: 'story',
      id: r.story_title_id,
      title: r.title,
      subtitle: null,
      author: '',
      language: r.language || '',
      format: 'story',
      added_at: iso(r.created_at),
      status: {},
    };
    existing.progress = r.percent === null ? 0 : Number(r.percent);
    existing.last_read_at = latest(r.position_at, r.session_at);
    items.set(key, existing);
  }
  return items;
}

function sortItems(items, sort) {
  const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '');
  const byDate = (field) => (a, b) => String(b[field] || '').localeCompare(String(a[field] || ''));
  switch (sort) {
    case 'title':
      return [...items].sort(byTitle);
    case 'added':
      return [...items].sort(byDate('added_at'));
    case 'progress':
      return [...items].sort((a, b) => (b.progress || 0) - (a.progress || 0) || byTitle(a, b));
    case 'last_read':
      return [...items].sort(byDate('last_read_at'));
    default:
      return items;
  }
}

async function loadOwnShelf(userId, shelfId) {
  if (!isUuid(shelfId)) return null;
  const { rows } = await pool.query('SELECT * FROM shelves WHERE id = $1 AND user_id = $2', [shelfId, userId]);
  return rows[0] ?? null;
}

/** Items of a manual shelf, enriched from the candidate map where possible. */
async function manualShelfItems(shelf, candidates) {
  const { rows } = await pool.query(
    `SELECT si.id AS entry_id, si.item_type, si.library_item_id, si.story_title_id, si.screenplay_id,
            si.position, si.added_at,
            li.title AS library_title, li.author, li.language AS library_language, li.format, li.deleted_at,
            st.title AS story_title, st.language AS story_language,
            sp.title AS screenplay_title
       FROM shelf_items si
       LEFT JOIN library_items li ON li.id = si.library_item_id
       LEFT JOIN story_title st ON st.story_title_id = si.story_title_id
       LEFT JOIN screenplay_title sp ON sp.screenplay_id = si.screenplay_id
      WHERE si.shelf_id = $1
      ORDER BY si.position ASC, si.added_at ASC`,
    [shelf.id],
  );
  const items = [];
  for (const r of rows) {
    if (r.item_type === 'library_item' && r.deleted_at) continue;
    const id = r.library_item_id || r.story_title_id || r.screenplay_id;
    const known = candidates.get(`${r.item_type}:${id}`);
    const base = known ?? {
      type: r.item_type,
      id,
      title: r.library_title || r.story_title || r.screenplay_title || '',
      subtitle: r.author || null,
      author: r.author || '',
      language: r.library_language || r.story_language || '',
      format: r.item_type === 'library_item' ? r.format : r.item_type,
      progress: 0,
      last_read_at: null,
      status: {},
    };
    items.push({ ...base, entry_id: r.entry_id, added_at: iso(r.added_at) });
  }
  return sortItems(items, shelf.sort);
}

function systemListItem(row) {
  return {
    type: 'story',
    id: row.story_title_id,
    title: row.story_title,
    subtitle: row.chapter_title || null,
    author: '',
    language: row.language || '',
    format: 'story',
    progress: 0,
    added_at: iso(row.created_at),
    last_read_at: null,
    status: {},
  };
}

// Display name of a creator from their profile (never their email).
const AUTHOR_SQL = `COALESCE(NULLIF(p.nickname, ''), NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username, '')`;

/**
 * Add author, description, cover, language and chapter/scene count to story
 * and screenplay items, so cards can tell same-titled stories apart.
 */
async function enrichItems(items) {
  const storyIds = [...new Set(items.filter((i) => i.type === 'story' && isUuid(i.id)).map((i) => i.id))];
  const screenplayIds = [...new Set(items.filter((i) => i.type === 'screenplay' && isUuid(i.id)).map((i) => i.id))];
  const [stories, screenplays] = await Promise.all([
    storyIds.length
      ? pool.query(
          `SELECT st.story_title_id AS id, st.description, st.language, st.cover_image_url, st.genre,
                  ${AUTHOR_SQL} AS author,
                  (SELECT count(*) FROM stories s WHERE s.story_title_id = st.story_title_id) AS parts
             FROM story_title st
             LEFT JOIN profiles p ON p.id = st.creator_id
            WHERE st.story_title_id = ANY($1::uuid[])`,
          [storyIds],
        )
      : { rows: [] },
    screenplayIds.length
      ? pool.query(
          `SELECT sp.screenplay_id AS id, sp.description, NULL AS language, NULL AS cover_image_url, sp.genre,
                  ${AUTHOR_SQL} AS author,
                  (SELECT count(*) FROM screenplay_scene ss WHERE ss.screenplay_id = sp.screenplay_id) AS parts
             FROM screenplay_title sp
             LEFT JOIN profiles p ON p.id = sp.creator_id
            WHERE sp.screenplay_id = ANY($1::uuid[])`,
          [screenplayIds],
        )
      : { rows: [] },
  ]);
  const meta = new Map();
  for (const r of stories.rows) meta.set(`story:${r.id}`, r);
  for (const r of screenplays.rows) meta.set(`screenplay:${r.id}`, r);
  return items.map((item) => {
    const m = meta.get(`${item.type}:${item.id}`);
    if (!m) return item;
    return {
      ...item,
      author: item.author || m.author || '',
      language: item.language || m.language || '',
      description: m.description || '',
      genre: m.genre || '',
      cover_url: m.cover_image_url || null,
      parts: Number(m.parts) || 0,
    };
  });
}

function experienceItem(r) {
  return {
    type: r.content_type,
    id: r.content_id,
    title: r.title,
    subtitle: r.slugline || null,
    author: '',
    language: '',
    format: r.content_type,
    progress: 0,
    added_at: iso(r.created_at),
    last_read_at: null,
    status: { favorite: r.is_favorite, living: r.is_living, lived: r.is_lived },
  };
}

function screenplayListItem(row) {
  return {
    type: 'screenplay',
    id: row.screenplay_id,
    title: row.title,
    subtitle: row.slugline || null,
    author: '',
    language: '',
    format: 'screenplay',
    progress: 0,
    added_at: iso(row.created_at),
    last_read_at: null,
    status: {},
  };
}

function serializeShelf(row, count) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    rules: row.rules,
    sort: row.sort,
    position: row.position,
    count,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

// -- routes -------------------------------------------------------------------

router.get('/shelves', requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    const [shelvesResult, countsResult, favorites, living, lived] = await Promise.all([
      pool.query('SELECT * FROM shelves WHERE user_id = $1 ORDER BY position ASC, created_at ASC', [userId]),
      pool.query(
        `SELECT si.shelf_id, count(*) AS n
           FROM shelf_items si
           JOIN shelves s ON s.id = si.shelf_id
           LEFT JOIN library_items li ON li.id = si.library_item_id
          WHERE s.user_id = $1 AND (si.item_type <> 'library_item' OR li.deleted_at IS NULL)
          GROUP BY si.shelf_id`,
        [userId],
      ),
      fetchUserExperienceItems(userId, 'is_favorite'),
      fetchUserExperienceItems(userId, 'is_living'),
      fetchUserExperienceItems(userId, 'is_lived'),
    ]);
    const counts = new Map(countsResult.rows.map((r) => [r.shelf_id, Number(r.n)]));
    const hasSmart = shelvesResult.rows.some((s) => s.kind === 'smart');
    const candidates = hasSmart ? [...(await loadCandidates(userId)).values()] : [];
    const custom = shelvesResult.rows.map((s) =>
      serializeShelf(s, s.kind === 'smart' ? evaluateRules(candidates, s.rules).length : counts.get(s.id) ?? 0),
    );
    const system = [
      { key: 'favorites', count: favorites.length },
      { key: 'living', count: living.length },
      { key: 'lived', count: lived.length },
      { key: 'newest', count: null },
      { key: 'most_active', count: null },
      { key: 'most_popular', count: null },
    ];
    res.json({ system, custom });
  } catch (err) {
    console.error('[GET /shelves] failed:', err);
    res.status(500).json({ error: 'Failed to load shelves' });
  }
});

router.post('/shelves', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const name = clip(body.name, 100);
  if (!name) return res.status(400).json({ error: 'A shelf needs a name' });
  const kind = body.kind === 'smart' ? 'smart' : 'manual';
  const sort = SORTS.has(body.sort) ? body.sort : kind === 'smart' ? 'title' : 'manual';
  let rules = null;
  if (kind === 'smart') {
    try {
      rules = validateRules(body.rules);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO shelves (user_id, name, description, kind, rules, sort, position)
       VALUES ($1, $2, $3, $4, $5, $6,
               (SELECT COALESCE(max(position), -1) + 1 FROM shelves WHERE user_id = $1))
       RETURNING *`,
      [req.user.id, name, clip(body.description, 1000), kind, rules ? JSON.stringify(rules) : null, sort],
    );
    res.status(201).json({ shelf: serializeShelf(rows[0], 0) });
  } catch (err) {
    console.error('[POST /shelves] failed:', err);
    res.status(500).json({ error: 'Failed to create shelf' });
  }
});

// Must come before /shelves/:id routes.
router.put('/shelves/order', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(isUuid).slice(0, 500) : [];
  try {
    await pool.query(
      `UPDATE shelves s SET position = o.ord - 1, updated_at = now()
         FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord)
        WHERE s.id = o.id AND s.user_id = $1`,
      [req.user.id, ids],
    );
    res.status(204).send();
  } catch (err) {
    console.error('[PUT /shelves/order] failed:', err);
    res.status(500).json({ error: 'Failed to reorder shelves' });
  }
});

router.get('/shelves/membership', requireAuth, async (req, res) => {
  const type = String(req.query.type || '');
  const id = String(req.query.id || '');
  if (!ITEM_TYPES.has(type) || !isUuid(id)) return res.status(400).json({ error: 'type and id are required' });
  const userId = req.user.id;
  const column = { library_item: 'library_item_id', story: 'story_title_id', screenplay: 'screenplay_id' }[type];
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, EXISTS (
                SELECT 1 FROM shelf_items si
                 WHERE si.shelf_id = s.id AND si.item_type = $2 AND si.${column} = $3
              ) AS contains
         FROM shelves s
        WHERE s.user_id = $1 AND s.kind = 'manual'
        ORDER BY s.position ASC, s.created_at ASC`,
      [userId, type, id],
    );
    let status = { favorite: false, living: false, lived: false };
    if (type !== 'library_item') {
      const statusRows = await pool.query(
        `SELECT is_favorite, is_living, is_lived FROM user_story_status
          WHERE user_id = $1 AND content_type = $2 AND ${type === 'story' ? 'story_title_id' : 'screenplay_id'} = $3`,
        [userId, type, id],
      );
      const s = statusRows.rows[0];
      if (s) status = { favorite: s.is_favorite, living: s.is_living, lived: s.is_lived };
    }
    res.json({ shelves: rows, status });
  } catch (err) {
    console.error('[GET /shelves/membership] failed:', err);
    res.status(500).json({ error: 'Failed to load shelf membership' });
  }
});

router.patch('/shelves/:id', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  try {
    const shelf = await loadOwnShelf(req.user.id, req.params.id);
    if (!shelf) return res.status(404).json({ error: 'Shelf not found' });
    const name = body.name === undefined ? shelf.name : clip(body.name, 100);
    if (!name) return res.status(400).json({ error: 'A shelf needs a name' });
    const sort = body.sort === undefined ? shelf.sort : body.sort;
    if (!SORTS.has(sort)) return res.status(400).json({ error: 'Unknown sort' });
    let rules = shelf.rules;
    if (body.rules !== undefined) {
      if (shelf.kind !== 'smart') return res.status(400).json({ error: 'Only smart shelves have rules' });
      try {
        rules = validateRules(body.rules);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }
    const { rows } = await pool.query(
      `UPDATE shelves SET name = $1, description = $2, sort = $3, rules = $4, updated_at = now()
        WHERE id = $5 AND user_id = $6 RETURNING *`,
      [
        name,
        body.description === undefined ? shelf.description : clip(body.description, 1000),
        sort,
        rules ? JSON.stringify(rules) : null,
        shelf.id,
        req.user.id,
      ],
    );
    res.json({ shelf: serializeShelf(rows[0], null) });
  } catch (err) {
    console.error('[PATCH /shelves/:id] failed:', err);
    res.status(500).json({ error: 'Failed to update shelf' });
  }
});

router.delete('/shelves/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM shelves WHERE id = $1 AND user_id = $2', [
      isUuid(req.params.id) ? req.params.id : null,
      req.user.id,
    ]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Shelf not found' });
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /shelves/:id] failed:', err);
    res.status(500).json({ error: 'Failed to delete shelf' });
  }
});

router.get('/shelves/:key/items', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const key = req.params.key;
  try {
    if (SYSTEM_STATUS_SHELVES[key]) {
      const rows = await fetchUserExperienceItems(userId, SYSTEM_STATUS_SHELVES[key]);
      const candidates = await loadCandidates(userId);
      const items = rows.map((r) => {
        const known = candidates.get(`${r.content_type}:${r.content_id}`);
        return known ?? {
          type: r.content_type,
          id: r.content_id,
          title: r.title,
          subtitle: r.slugline || null,
          author: '',
          language: '',
          format: r.content_type,
          progress: 0,
          added_at: iso(r.created_at),
          last_read_at: null,
          status: { favorite: r.is_favorite, living: r.is_living, lived: r.is_lived },
        };
      });
      return res.json({ shelf: { key, kind: 'system' }, items: await enrichItems(items) });
    }
    if (SYSTEM_LIST_SHELVES[key]) {
      const rows = await SYSTEM_LIST_SHELVES[key](SYSTEM_LIST_LIMIT);
      return res.json({ shelf: { key, kind: 'system' }, items: await enrichItems(rows.map(systemListItem)) });
    }
    const shelf = await loadOwnShelf(userId, key);
    if (!shelf) return res.status(404).json({ error: 'Shelf not found' });
    const candidates = await loadCandidates(userId);
    const items =
      shelf.kind === 'smart'
        ? sortItems(evaluateRules([...candidates.values()], shelf.rules), shelf.sort)
        : await manualShelfItems(shelf, candidates);
    res.json({ shelf: serializeShelf(shelf, items.length), items: await enrichItems(items) });
  } catch (err) {
    console.error('[GET /shelves/:key/items] failed:', err);
    res.status(500).json({ error: 'Failed to load shelf' });
  }
});

router.post('/shelves/:id/items', requireAuth, async (req, res) => {
  const { type, id } = req.body ?? {};
  const userId = req.user.id;
  if (!ITEM_TYPES.has(type) || !isUuid(id)) return res.status(400).json({ error: 'type and id are required' });
  try {
    const shelf = await loadOwnShelf(userId, req.params.id);
    if (!shelf) return res.status(404).json({ error: 'Shelf not found' });
    if (shelf.kind !== 'manual') return res.status(400).json({ error: 'Smart shelves fill themselves' });

    if (type === 'library_item') {
      const own = await pool.query(
        'SELECT 1 FROM library_items WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
        [id, userId],
      );
      if (own.rows.length === 0) return res.status(404).json({ error: 'Library item not found' });
    } else if (type === 'story') {
      const story = await loadStory(pool, id);
      if (!story || !(await canViewStory(pool, story, userId))) {
        return res.status(404).json({ error: 'Story not found' });
      }
    } else {
      const sp = await pool.query('SELECT 1 FROM screenplay_title WHERE screenplay_id = $1', [id]);
      if (sp.rows.length === 0) return res.status(404).json({ error: 'Screenplay not found' });
    }

    const column = { library_item: 'library_item_id', story: 'story_title_id', screenplay: 'screenplay_id' }[type];
    const existing = await pool.query(
      `SELECT id FROM shelf_items WHERE shelf_id = $1 AND item_type = $2 AND ${column} = $3`,
      [shelf.id, type, id],
    );
    if (existing.rows[0]) return res.json({ entry_id: existing.rows[0].id });
    const { rows } = await pool.query(
      `INSERT INTO shelf_items (shelf_id, item_type, ${column}, position)
       VALUES ($1, $2, $3, (SELECT COALESCE(max(position), -1) + 1 FROM shelf_items WHERE shelf_id = $1))
       RETURNING id`,
      [shelf.id, type, id],
    );
    await pool.query('UPDATE shelves SET updated_at = now() WHERE id = $1', [shelf.id]);
    res.status(201).json({ entry_id: rows[0].id });
  } catch (err) {
    console.error('[POST /shelves/:id/items] failed:', err);
    res.status(500).json({ error: 'Failed to add to shelf' });
  }
});

// Removes by shelf entry id, or by item id (?type=story when the caller only
// knows the story / book, e.g. an "Add to shelf" checkbox being unticked).
router.delete('/shelves/:id/items/:itemId', requireAuth, async (req, res) => {
  const { itemId } = req.params;
  const type = String(req.query.type || '');
  try {
    const shelf = await loadOwnShelf(req.user.id, req.params.id);
    if (!shelf) return res.status(404).json({ error: 'Shelf not found' });
    if (!isUuid(itemId)) return res.status(404).json({ error: 'Shelf item not found' });
    let result;
    if (ITEM_TYPES.has(type)) {
      const column = { library_item: 'library_item_id', story: 'story_title_id', screenplay: 'screenplay_id' }[type];
      result = await pool.query(
        `DELETE FROM shelf_items WHERE shelf_id = $1 AND item_type = $2 AND ${column} = $3`,
        [shelf.id, type, itemId],
      );
    } else {
      result = await pool.query('DELETE FROM shelf_items WHERE shelf_id = $1 AND id = $2', [shelf.id, itemId]);
    }
    if (result.rowCount === 0) return res.status(404).json({ error: 'Shelf item not found' });
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /shelves/:id/items/:itemId] failed:', err);
    res.status(500).json({ error: 'Failed to remove from shelf' });
  }
});

router.put('/shelves/:id/items/order', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(isUuid).slice(0, 5000) : [];
  try {
    const shelf = await loadOwnShelf(req.user.id, req.params.id);
    if (!shelf) return res.status(404).json({ error: 'Shelf not found' });
    await pool.query(
      `UPDATE shelf_items si SET position = o.ord - 1
         FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord)
        WHERE si.id = o.id AND si.shelf_id = $1`,
      [shelf.id, ids],
    );
    res.status(204).send();
  } catch (err) {
    console.error('[PUT /shelves/:id/items/order] failed:', err);
    res.status(500).json({ error: 'Failed to reorder shelf' });
  }
});

// Browse Crowdly in the desktop app: the platform home page's sections in
// one call, in the same order as src/pages/Index.tsx.
const HOME_ROW_LIMIT = 20;

router.get('/discover/home', requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    const [favorites, newest, newestSp, popular, popularSp, activeSp, active, living, lived] = await Promise.all([
      fetchUserExperienceItems(userId, 'is_favorite'),
      fetchNewestStories(HOME_ROW_LIMIT),
      fetchNewestScreenplays(HOME_ROW_LIMIT),
      fetchMostPopularStories(HOME_ROW_LIMIT),
      fetchMostPopularScreenplays(HOME_ROW_LIMIT),
      fetchMostActiveScreenplays(HOME_ROW_LIMIT),
      fetchMostActiveStories(HOME_ROW_LIMIT),
      fetchUserExperienceItems(userId, 'is_living'),
      fetchUserExperienceItems(userId, 'is_lived'),
    ]);
    const rows = [
      { key: 'favorites', items: favorites.slice(0, HOME_ROW_LIMIT).map(experienceItem) },
      { key: 'newest', items: newest.map(systemListItem) },
      { key: 'newest_screenplays', items: newestSp.map(screenplayListItem) },
      { key: 'most_popular', items: popular.map(systemListItem) },
      { key: 'most_popular_screenplays', items: popularSp.map(screenplayListItem) },
      { key: 'most_active_screenplays', items: activeSp.map(screenplayListItem) },
      { key: 'most_active', items: active.map(systemListItem) },
      { key: 'living', items: living.slice(0, HOME_ROW_LIMIT).map(experienceItem) },
      { key: 'lived', items: lived.slice(0, HOME_ROW_LIMIT).map(experienceItem) },
    ];
    const enriched = await enrichItems(rows.flatMap((r) => r.items));
    const byKey = new Map(enriched.map((i) => [`${i.type}:${i.id}`, i]));
    res.json({
      rows: rows.map((r) => ({ key: r.key, items: r.items.map((i) => byKey.get(`${i.type}:${i.id}`) ?? i) })),
    });
  } catch (err) {
    console.error('[GET /discover/home] failed:', err);
    res.status(500).json({ error: 'Failed to load Crowdly' });
  }
});

// Favorite / living / lived for the signed-in user. Unlike the older
// POST /users/:userId/story-status this checks the session, and only the
// flags that are sent change.
router.put('/me/story-status', requireAuth, async (req, res) => {
  const { contentType, storyTitleId, screenplayId, isFavorite, isLiving, isLived } = req.body ?? {};
  if (contentType !== 'story' && contentType !== 'screenplay') {
    return res.status(400).json({ error: 'contentType must be "story" or "screenplay"' });
  }
  const id = contentType === 'story' ? storyTitleId : screenplayId;
  if (!isUuid(id)) return res.status(400).json({ error: 'A story or screenplay id is required' });
  try {
    if (contentType === 'story') {
      const story = await loadStory(pool, id);
      if (!story || !(await canViewStory(pool, story, req.user.id))) {
        return res.status(404).json({ error: 'Story not found' });
      }
    } else {
      const sp = await pool.query('SELECT 1 FROM screenplay_title WHERE screenplay_id = $1', [id]);
      if (sp.rows.length === 0) return res.status(404).json({ error: 'Screenplay not found' });
    }
    const row = await setUserStoryStatus(pool, req.user.id, {
      contentType,
      storyTitleId,
      screenplayId,
      isFavorite,
      isLiving,
      isLived,
    });
    res.json({ favorite: row.is_favorite, living: row.is_living, lived: row.is_lived });
  } catch (err) {
    console.error('[PUT /me/story-status] failed:', err);
    res.status(500).json({ error: 'Failed to update story status' });
  }
});

export { SYSTEM_SHELF_KEYS };
export default router;
