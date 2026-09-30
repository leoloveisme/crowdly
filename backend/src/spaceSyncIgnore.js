// Which Space paths every sync engine (GitHub, Google Drive, desktop
// manifest sync) must skip, in both directions:
//   - any dot-file/dot-folder (.git/, .gitignore, .DS_Store, .crowdly/ —
//     the desktop app's local per-device revision queue, which must never
//     be shared across machines), and
//   - anything the Space's own .gitignore files list (nested .gitignore
//     files apply under their own folder, like git).
// Matching rows get creative_space_items.sync_ignored = true — never
// `deleted`, which would make Drive sync trash the real Drive file.
import ignore from 'ignore';
import { pool } from './db.js';

export function isDotPath(relativePath) {
  return String(relativePath || '').split('/').some((segment) => segment.startsWith('.'));
}

/** `rules`: [{ dir, content }] — one entry per .gitignore file, `dir` being its folder ('' for the root). */
export function buildMatcher(rules) {
  const compiled = (Array.isArray(rules) ? rules : [])
    .filter((r) => r && typeof r.content === 'string')
    .map((r) => ({ dir: String(r.dir || '').replace(/^\/+|\/+$/g, ''), ig: ignore().add(r.content) }));

  return (relativePath, kind) => {
    const path = String(relativePath || '').replace(/^\/+|\/+$/g, '');
    for (const { dir, ig } of compiled) {
      if (dir && !(path === dir || path.startsWith(`${dir}/`))) continue;
      const rel = dir ? path.slice(dir.length + 1) : path;
      if (!rel) continue;
      if (ig.ignores(kind === 'folder' ? `${rel}/` : rel)) return true;
      // A file inside an ignored folder is ignored too (e.g. "drafts/" -> "drafts/x.md").
      const segments = rel.split('/');
      for (let i = 1; i < segments.length; i++) {
        if (ig.ignores(`${segments.slice(0, i).join('/')}/`)) return true;
      }
    }
    return false;
  };
}

/** A path matcher that also applies the always-ignored dot-path rule. */
export function buildIgnoreCheck(rules) {
  const matcher = buildMatcher(rules);
  return (relativePath, kind) => isDotPath(relativePath) || matcher(relativePath, kind);
}

/** `.gitignore` files among a list of `{ path }` entries (a GitHub tree or a Drive listing), as `{ dir, entry }`. */
export function gitignoreEntries(entries) {
  return (entries || [])
    .filter((e) => e && (e.path === '.gitignore' || String(e.path).endsWith('/.gitignore')))
    .map((e) => ({ dir: e.path.includes('/') ? e.path.slice(0, e.path.lastIndexOf('/')) : '', entry: e }));
}

// creative_spaces.sync_ignore_rules is keyed by where the .gitignore files
// were read from ({ "github": [...], "drive": [...] }) so a Space connected
// to both doesn't flip-flop between two rule sets; all of them apply.
function allRules(stored) {
  if (!stored || typeof stored !== 'object') return [];
  if (Array.isArray(stored)) return stored;
  return Object.values(stored).flatMap((list) => (Array.isArray(list) ? list : []));
}

export async function loadSpaceIgnoreCheck(spaceId) {
  const { rows } = await pool.query('SELECT sync_ignore_rules FROM creative_spaces WHERE id = $1', [spaceId]);
  return buildIgnoreCheck(allRules(rows[0]?.sync_ignore_rules));
}

/** Stores `rules` for one `source` ('github' | 'drive' | 'desktop') and returns the combined check for the Space. */
export async function saveSpaceIgnoreRules(spaceId, source, rules) {
  const { rows } = await pool.query(
    `UPDATE creative_spaces
     SET sync_ignore_rules = jsonb_set(
       CASE WHEN jsonb_typeof(sync_ignore_rules) = 'object' THEN sync_ignore_rules ELSE '{}'::jsonb END,
       ARRAY[$2::text], $3::jsonb, true)
     WHERE id = $1
     RETURNING sync_ignore_rules`,
    [spaceId, source, JSON.stringify(rules || [])],
  );
  return buildIgnoreCheck(allRules(rows[0]?.sync_ignore_rules));
}

/**
 * Recomputes sync_ignored for every live row in the Space from `isIgnored`,
 * so it stays a derived state: removing a line from .gitignore brings those
 * files back on the next sync. Flag-only — never deletes anything.
 */
export async function applyIgnoreFlags(spaceId, isIgnored) {
  const { rows } = await pool.query(
    'SELECT id, relative_path, kind, sync_ignored FROM creative_space_items WHERE space_id = $1 AND deleted = false',
    [spaceId],
  );
  const toIgnore = [];
  const toRestore = [];
  for (const row of rows) {
    const ignored = isIgnored(row.relative_path, row.kind);
    if (ignored && !row.sync_ignored) toIgnore.push(row.id);
    if (!ignored && row.sync_ignored) toRestore.push(row.id);
  }
  if (toIgnore.length) {
    await pool.query('UPDATE creative_space_items SET sync_ignored = true WHERE id = ANY($1::uuid[])', [toIgnore]);
  }
  if (toRestore.length) {
    await pool.query('UPDATE creative_space_items SET sync_ignored = false WHERE id = ANY($1::uuid[])', [toRestore]);
  }
  return { ignored: toIgnore.length, restored: toRestore.length };
}
