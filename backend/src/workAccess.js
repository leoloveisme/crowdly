// Permission helpers shared by the three kinds of creative work — stories,
// screenplays and comics. Same semantics as storyAccess.js (which now wraps
// these for stories): the creator is the owner, an explicit *_access row makes
// someone part of the team, and on a public work any signed-in user may
// contribute (their edits to existing content become proposals).

import { pool } from './db.js';
import { getSessionUser, SESSION_COOKIE_NAME } from './sessions.js';

export const KINDS = {
  story: {
    table: 'story_title',
    id: 'story_title_id',
    access: 'story_access',
    rules: 'story_access_rules',
    rulesId: 'story_title_id',
    noun: 'story',
  },
  screenplay: {
    table: 'screenplay_title',
    id: 'screenplay_id',
    access: 'screenplay_access',
    rules: 'screenplay_access_rules',
    rulesId: 'screenplay_id',
    noun: 'screenplay',
  },
  comic: {
    table: 'comic_title',
    id: 'comic_id',
    access: 'comic_access',
    rules: 'comic_access_rules',
    rulesId: 'comic_id',
    noun: 'comic',
  },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

export const POLICIES = new Set(['anyone', 'restricted', 'none']);

export async function optionalUserId(req) {
  try {
    const user = await getSessionUser(req.cookies?.[SESSION_COOKIE_NAME]);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function loadWork(db, kind, workId) {
  const k = KINDS[kind];
  if (!k || !isUuid(workId)) return null;
  const { rows } = await db.query(`SELECT * FROM ${k.table} WHERE ${k.id} = $1`, [workId]);
  return rows[0] ?? null;
}

export const workIdOf = (kind, work) => work[KINDS[kind].id];

async function accessRole(db, kind, work, userId) {
  const k = KINDS[kind];
  const { rows } = await db.query(`SELECT role FROM ${k.access} WHERE ${k.id} = $1 AND user_id = $2 LIMIT 1`, [
    workIdOf(kind, work),
    userId,
  ]);
  return rows[0]?.role ?? null;
}

export async function isOwner(db, kind, work, userId) {
  if (!userId) return false;
  if (work.creator_id === userId) return true;
  return (await accessRole(db, kind, work, userId)) === 'owner';
}

// Owner or anyone with an explicit access row.
export async function isTeam(db, kind, work, userId) {
  if (!userId) return false;
  if (work.creator_id === userId) return true;
  return (await accessRole(db, kind, work, userId)) !== null;
}

export async function isPlatformAdminOrEditor(userId) {
  if (!userId) return false;
  try {
    const { rows } = await pool.query(
      "SELECT 1 FROM user_roles WHERE user_id = $1 AND role IN ('platform_admin', 'editor') LIMIT 1",
      [userId],
    );
    return rows.length > 0;
  } catch (err) {
    console.error('[workAccess.isPlatformAdminOrEditor] failed:', err);
    return false;
  }
}

export async function hasAccessRule(db, kind, workId, userId, ruleType) {
  if (!userId) return false;
  const k = KINDS[kind];
  const { rows } = await db.query(
    `SELECT 1 FROM ${k.rules} WHERE ${k.rulesId} = $1 AND rule_type = $3
     AND (grantee_user_id = $2 OR grantee_group_id IN (SELECT group_id FROM user_group_members WHERE user_id = $2))
     LIMIT 1`,
    [workId, userId, ruleType],
  );
  return rows.length > 0;
}

// public: everyone; unlisted: team + 'view' access rules; private: team only.
export async function canView(db, kind, work, userId) {
  const visibility = work.visibility ?? 'public';
  if (visibility === 'public') return true;
  if (await isTeam(db, kind, work, userId)) return true;
  if (visibility === 'unlisted') return hasAccessRule(db, kind, workIdOf(kind, work), userId, 'view');
  return false;
}

export function viewDeniedMessage(kind, work) {
  const noun = KINDS[kind].noun;
  return (work.visibility ?? 'public') === 'unlisted'
    ? `This ${noun} is unlisted. You need an invitation from the owner to view it.`
    : `This ${noun} is private. Please log in or ask the owner for access.`;
}

// "anyone / restricted / none" policy (clone, export, translate, narrate):
// the team is always allowed; 'restricted' consults the access rules.
export async function canUsePolicy(db, kind, work, userId, policyColumn, ruleType) {
  if (!userId) return false;
  if (await isTeam(db, kind, work, userId)) return true;
  const policy = work[policyColumn] ?? 'anyone';
  if (policy === 'none') return false;
  if (policy === 'restricted') return hasAccessRule(db, kind, workIdOf(kind, work), userId, ruleType);
  return true;
}

// 'owner' | 'contributor' | null, plus whether the role comes from an
// explicit access row (the team) or only from the work being public.
export async function writeAccess(db, kind, work, userId) {
  if (!userId) return { role: null, explicit: false };
  if (work.creator_id === userId) return { role: 'owner', explicit: true };
  const role = await accessRole(db, kind, work, userId);
  if (role) return { role: role === 'owner' ? 'owner' : 'contributor', explicit: true };
  if ((work.visibility ?? 'public') === 'public') return { role: 'contributor', explicit: false };
  return { role: null, explicit: false };
}

// can_clone / can_export flags the pages use to show those buttons.
export async function policyFlags(db, kind, work, userId) {
  const [canClone, canExport, canTranslate, canNarrate] = await Promise.all([
    canUsePolicy(db, kind, work, userId, 'clone_policy', 'clone'),
    canUsePolicy(db, kind, work, userId, 'export_policy', 'export'),
    canUsePolicy(db, kind, work, userId, 'translation_policy', 'translate'),
    canUsePolicy(db, kind, work, userId, 'narration_policy', 'narrate'),
  ]);
  return {
    // Anonymous visitors see the buttons; clicking asks them to sign in.
    can_clone: userId ? canClone : (work.clone_policy ?? 'anyone') !== 'none',
    can_export: userId ? canExport : (work.export_policy ?? 'anyone') !== 'none',
    can_translate: canTranslate,
    can_narrate: canNarrate,
  };
}
