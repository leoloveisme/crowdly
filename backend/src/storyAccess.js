// Shared story permission helpers for routers that live outside server.js
// (translations, editions, chapter media). Semantics match the checks in
// server.js (GET /story-titles/:id visibility, clone/export policies).

import { pool } from './db.js';
import { getSessionUser, SESSION_COOKIE_NAME } from './sessions.js';

export async function optionalUserId(req) {
  try {
    const user = await getSessionUser(req.cookies?.[SESSION_COOKIE_NAME]);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function loadStory(db, storyTitleId) {
  const { rows } = await db.query('SELECT * FROM story_title WHERE story_title_id = $1', [storyTitleId]);
  return rows[0] ?? null;
}

export const groupIdOf = (story) => story.translation_group_id ?? story.story_title_id;

// Owner or anyone with an explicit story_access row.
export async function isStoryTeam(db, story, userId) {
  if (!userId) return false;
  if (story.creator_id === userId) return true;
  const { rows } = await db.query(
    'SELECT 1 FROM story_access WHERE story_title_id = $1 AND user_id = $2 LIMIT 1',
    [story.story_title_id, userId],
  );
  return rows.length > 0;
}

export async function hasAccessRule(db, storyTitleId, userId, ruleType) {
  if (!userId) return false;
  const { rows } = await db.query(
    `SELECT 1 FROM story_access_rules WHERE story_title_id = $1 AND rule_type = $3
     AND (grantee_user_id = $2 OR grantee_group_id IN (SELECT group_id FROM user_group_members WHERE user_id = $2))
     LIMIT 1`,
    [storyTitleId, userId, ruleType],
  );
  return rows.length > 0;
}

// Same visibility semantics as GET /story-titles/:storyTitleId.
export async function canViewStory(db, story, userId) {
  const visibility = story.visibility ?? 'public';
  if (visibility === 'public') return true;
  if (await isStoryTeam(db, story, userId)) return true;
  if (visibility === 'unlisted') return hasAccessRule(db, story.story_title_id, userId, 'view');
  return false;
}

// Generic "anyone / restricted / none" policy check (translate, narrate, ...):
// the story team is always allowed; 'restricted' consults story_access_rules
// with rule_type = ruleType.
export async function canUsePolicy(db, story, userId, policyColumn, ruleType) {
  if (!userId) return false;
  if (await isStoryTeam(db, story, userId)) return true;
  const policy = story[policyColumn] ?? 'anyone';
  if (policy === 'none') return false;
  if (policy === 'restricted') return hasAccessRule(db, story.story_title_id, userId, ruleType);
  return true;
}

// The role getStoryAccessRole() in server.js resolves, for modules that can't
// import server.js: 'owner' | 'contributor' (explicit row, or any signed-in
// user on a public story) | null.
export async function storyWriteRole(db, story, userId) {
  if (!userId) return null;
  if (story.creator_id === userId) return 'owner';
  const { rows } = await db.query(
    'SELECT role FROM story_access WHERE story_title_id = $1 AND user_id = $2',
    [story.story_title_id, userId],
  );
  if (rows.length > 0) return rows[0].role === 'owner' ? 'owner' : 'contributor';
  if ((story.visibility ?? 'public') === 'public') return 'contributor';
  return null;
}

