// Story lists shared by the platform routes (server.js) and the Discovery
// shelves (shelves.js): the public lists (newest / most active / most
// popular) and each user's favorites / living / lived.

import { pool } from './db.js';

const STATUS_FLAGS = new Set(['is_favorite', 'is_living', 'is_lived']);

/** Newest public stories, each with its latest chapter. */
export async function fetchNewestStories(limit) {
  const { rows } = await pool.query(
    `WITH latest_chapter AS (
       SELECT
         s.chapter_id,
         s.chapter_title,
         s.created_at,
         s.story_title_id,
         ROW_NUMBER() OVER (
           PARTITION BY s.story_title_id
           ORDER BY s.created_at DESC, s.chapter_index DESC
         ) AS rn
       FROM stories s
       JOIN story_title st ON st.story_title_id = s.story_title_id
       LEFT JOIN creative_spaces cs ON cs.id = st.creative_space_id
       WHERE st.visibility = 'public' AND st.published = true
         AND (st.creative_space_id IS NULL OR cs.visibility = 'public')
     )
     SELECT
       lc.chapter_id,
       lc.chapter_title,
       lc.created_at,
       lc.story_title_id,
       st.title AS story_title,
       st.language,
       st.cover_image_url
     FROM latest_chapter lc
     JOIN story_title st ON st.story_title_id = lc.story_title_id
     WHERE lc.rn = 1
     ORDER BY lc.created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

/** Public stories ordered by recent activity and content volume. */
export async function fetchMostActiveStories(limit) {
  const { rows } = await pool.query(
    `WITH story_stats AS (
       SELECT
         st.story_title_id,
         st.title,
         st.language,
         st.cover_image_url,
         GREATEST(
           MAX(s.created_at),
           MAX(s.updated_at),
           MAX(cr.created_at),
           MAX(pr.created_at),
           MAX(cc.created_at),
           MAX(cl.created_at),
           MAX(r.created_at)
         ) AS last_activity_at,
         COUNT(DISTINCT s.chapter_id) AS chapter_count,
         COALESCE(SUM(COALESCE(cardinality(s.paragraphs), 0)), 0) AS paragraph_count,
         COUNT(DISTINCT pb.id) AS branch_count
       FROM story_title st
       JOIN stories s ON s.story_title_id = st.story_title_id
       LEFT JOIN chapter_revisions cr ON cr.chapter_id = s.chapter_id
       LEFT JOIN paragraph_revisions pr ON pr.chapter_id = s.chapter_id
       LEFT JOIN chapter_comments cc ON cc.chapter_id = s.chapter_id
       LEFT JOIN chapter_likes cl ON cl.chapter_id = s.chapter_id
       LEFT JOIN reactions r ON r.chapter_id = s.chapter_id
       LEFT JOIN paragraph_branches pb ON pb.chapter_id = s.chapter_id
       LEFT JOIN creative_spaces cs ON cs.id = st.creative_space_id
       WHERE st.visibility = 'public' AND st.published = true
         AND (st.creative_space_id IS NULL OR cs.visibility = 'public')
       GROUP BY st.story_title_id, st.title, st.language, st.cover_image_url
     ),
     scored AS (
       SELECT
         story_title_id,
         title,
         language,
         cover_image_url,
         last_activity_at,
         chapter_count,
         paragraph_count,
         branch_count,
         (chapter_count + paragraph_count + branch_count) AS content_score
       FROM story_stats
     ),
     latest_chapter AS (
       SELECT
         s.story_title_id,
         s.chapter_id,
         s.chapter_title,
         s.created_at,
         ROW_NUMBER() OVER (
           PARTITION BY s.story_title_id
           ORDER BY s.created_at DESC, s.chapter_index DESC
         ) AS rn
       FROM stories s
     )
     SELECT
       sc.story_title_id,
       sc.title AS story_title,
       lc.chapter_id,
       lc.chapter_title,
       lc.created_at,
       sc.last_activity_at,
       sc.chapter_count,
       sc.paragraph_count,
       sc.branch_count,
       sc.content_score,
       sc.language,
       sc.cover_image_url
     FROM scored sc
     JOIN latest_chapter lc ON lc.story_title_id = sc.story_title_id AND lc.rn = 1
     WHERE sc.last_activity_at IS NOT NULL
     ORDER BY sc.last_activity_at DESC, sc.content_score DESC, sc.title ASC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

/** Public stories ranked by likes and favorites. */
export async function fetchMostPopularStories(limit) {
  const { rows } = await pool.query(
    `WITH reaction_counts AS (
       SELECT
         COALESCE(r.story_title_id, s.story_title_id) AS story_title_id,
         COUNT(*) FILTER (WHERE r.reaction_type = 'like') AS like_count
       FROM reactions r
       LEFT JOIN stories s ON s.chapter_id = r.chapter_id
       GROUP BY COALESCE(r.story_title_id, s.story_title_id)
     ),
     favorite_counts AS (
       SELECT
         us.story_title_id,
         COUNT(*) AS favorite_count
       FROM user_story_status us
       WHERE us.content_type = 'story'
         AND us.is_favorite = true
       GROUP BY us.story_title_id
     ),
     scores AS (
       SELECT
         st.story_title_id,
         st.title,
         st.language,
         st.cover_image_url,
         COALESCE(rc.like_count, 0) AS like_count,
         COALESCE(fc.favorite_count, 0) AS favorite_count,
         (COALESCE(rc.like_count, 0) * 2 + COALESCE(fc.favorite_count, 0)) AS popularity_score
       FROM story_title st
       LEFT JOIN reaction_counts rc ON rc.story_title_id = st.story_title_id
       LEFT JOIN favorite_counts fc ON fc.story_title_id = st.story_title_id
       LEFT JOIN creative_spaces cs ON cs.id = st.creative_space_id
       WHERE st.visibility = 'public' AND st.published = true
         AND (st.creative_space_id IS NULL OR cs.visibility = 'public')
     ),
     latest_chapter AS (
       SELECT
         s.story_title_id,
         s.chapter_id,
         s.chapter_title,
         s.created_at,
         ROW_NUMBER() OVER (
           PARTITION BY s.story_title_id
           ORDER BY s.created_at DESC, s.chapter_index DESC
         ) AS rn
       FROM stories s
     )
     SELECT
       sc.story_title_id,
       sc.title AS story_title,
       lc.chapter_id,
       lc.chapter_title,
       lc.created_at,
       sc.like_count,
       sc.favorite_count,
       sc.popularity_score,
       sc.language,
       sc.cover_image_url
     FROM scores sc
     JOIN latest_chapter lc ON lc.story_title_id = sc.story_title_id AND lc.rn = 1
     WHERE sc.popularity_score > 0
     ORDER BY sc.popularity_score DESC,
              sc.like_count DESC,
              sc.favorite_count DESC,
              sc.title ASC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

/** Newest public screenplays, with their first scene's slugline. */
export async function fetchNewestScreenplays(limit) {
  const { rows } = await pool.query(
    `SELECT
       st.screenplay_id,
       st.title,
       st.created_at,
       fs.slugline
     FROM screenplay_title st
     LEFT JOIN LATERAL (
       SELECT slugline
       FROM screenplay_scene ss
       WHERE ss.screenplay_id = st.screenplay_id
       ORDER BY ss.scene_index ASC, ss.created_at ASC
       LIMIT 1
     ) fs ON TRUE
     LEFT JOIN creative_spaces cs ON cs.id = st.creative_space_id
     WHERE st.visibility = 'public' AND st.published = true
       AND (st.creative_space_id IS NULL OR cs.visibility = 'public')
     ORDER BY st.created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

/** Public screenplays ordered by recent activity and content volume. */
export async function fetchMostActiveScreenplays(limit) {
  const { rows } = await pool.query(
    `WITH screenplay_stats AS (
       SELECT
         st.screenplay_id,
         st.title,
         GREATEST(
           MAX(st.created_at),
           MAX(st.updated_at),
           MAX(ss.created_at),
           MAX(ss.updated_at),
           MAX(sb.created_at),
           MAX(sb.updated_at)
         ) AS last_activity_at,
         COUNT(DISTINCT ss.scene_id) AS scene_count,
         COUNT(DISTINCT sb.block_id) AS block_count
       FROM screenplay_title st
       LEFT JOIN screenplay_scene ss ON ss.screenplay_id = st.screenplay_id
       LEFT JOIN screenplay_block sb ON sb.screenplay_id = st.screenplay_id
       LEFT JOIN creative_spaces cs ON cs.id = st.creative_space_id
       WHERE st.visibility = 'public' AND st.published = true
         AND (st.creative_space_id IS NULL OR cs.visibility = 'public')
       GROUP BY st.screenplay_id, st.title
     ),
     scored AS (
       SELECT
         screenplay_id,
         title,
         last_activity_at,
         scene_count,
         block_count,
         (scene_count + block_count) AS content_score
       FROM screenplay_stats
     ),
     first_scene AS (
       SELECT
         ss.screenplay_id,
         ss.slugline,
         ss.created_at,
         ROW_NUMBER() OVER (
           PARTITION BY ss.screenplay_id
           ORDER BY ss.scene_index ASC, ss.created_at ASC
         ) AS rn
       FROM screenplay_scene ss
     )
     SELECT
       sc.screenplay_id,
       sc.title,
       sc.last_activity_at,
       fs.slugline,
       st.created_at
     FROM scored sc
     JOIN screenplay_title st ON st.screenplay_id = sc.screenplay_id
     LEFT JOIN first_scene fs ON fs.screenplay_id = sc.screenplay_id AND fs.rn = 1
     WHERE sc.last_activity_at IS NOT NULL
     ORDER BY sc.last_activity_at DESC, sc.content_score DESC, sc.title ASC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

/** Public screenplays ranked by likes and favorites. */
export async function fetchMostPopularScreenplays(limit) {
  const { rows } = await pool.query(
    `WITH reaction_counts AS (
       SELECT
         COALESCE(r.screenplay_id, ss.screenplay_id) AS screenplay_id,
         COUNT(*) FILTER (WHERE r.reaction_type = 'like') AS like_count
       FROM reactions r
       LEFT JOIN screenplay_scene ss ON ss.scene_id = r.screenplay_scene_id
       GROUP BY COALESCE(r.screenplay_id, ss.screenplay_id)
     ),
     favorite_counts AS (
       SELECT
         us.screenplay_id,
         COUNT(*) AS favorite_count
       FROM user_story_status us
       WHERE us.content_type = 'screenplay'
         AND us.is_favorite = true
       GROUP BY us.screenplay_id
     ),
     scores AS (
       SELECT
         st.screenplay_id,
         st.title,
         st.created_at,
         COALESCE(rc.like_count, 0) AS like_count,
         COALESCE(fc.favorite_count, 0) AS favorite_count,
         (COALESCE(rc.like_count, 0) * 2 + COALESCE(fc.favorite_count, 0)) AS popularity_score
       FROM screenplay_title st
       LEFT JOIN reaction_counts rc ON rc.screenplay_id = st.screenplay_id
       LEFT JOIN favorite_counts fc ON fc.screenplay_id = st.screenplay_id
       LEFT JOIN creative_spaces cs ON cs.id = st.creative_space_id
       WHERE st.visibility = 'public' AND st.published = true
         AND (st.creative_space_id IS NULL OR cs.visibility = 'public')
     ),
     first_scene AS (
       SELECT
         ss.screenplay_id,
         ss.slugline,
         ss.created_at,
         ROW_NUMBER() OVER (
           PARTITION BY ss.screenplay_id
           ORDER BY ss.scene_index ASC, ss.created_at ASC
         ) AS rn
       FROM screenplay_scene ss
     )
     SELECT
       sc.screenplay_id,
       sc.title,
       sc.created_at,
       sc.like_count,
       sc.favorite_count,
       sc.popularity_score,
       fs.slugline
     FROM scores sc
     LEFT JOIN first_scene fs ON fs.screenplay_id = sc.screenplay_id AND fs.rn = 1
     WHERE sc.popularity_score > 0
     ORDER BY sc.popularity_score DESC,
              sc.like_count DESC,
              sc.favorite_count DESC,
              sc.title ASC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function fetchUserExperienceItems(userId, flagColumn) {
  if (!STATUS_FLAGS.has(flagColumn)) throw new Error(`Unknown status flag: ${flagColumn}`);
  // Stories
  const storyRowsPromise = pool.query(
    `SELECT
       us.id,
       us.content_type,
       us.story_title_id,
       st.title,
       st.created_at,
       us.is_favorite,
       us.is_living,
       us.is_lived
     FROM user_story_status us
     JOIN story_title st ON st.story_title_id = us.story_title_id
     LEFT JOIN creative_spaces cs ON cs.id = st.creative_space_id
     WHERE us.user_id = $1
       AND us.content_type = 'story'
       AND us.${flagColumn} = true
       AND st.visibility = 'public'
       AND st.published = true
       AND (st.creative_space_id IS NULL OR cs.visibility = 'public')`,
    [userId],
  );

  // Screenplays (include first scene slugline for context)
  const screenplayRowsPromise = pool.query(
    `SELECT
       us.id,
       us.content_type,
       us.screenplay_id,
       st.title,
       st.created_at,
       us.is_favorite,
       us.is_living,
       us.is_lived,
       fs.slugline
     FROM user_story_status us
     JOIN screenplay_title st ON st.screenplay_id = us.screenplay_id
     LEFT JOIN LATERAL (
       SELECT slugline
       FROM screenplay_scene ss
       WHERE ss.screenplay_id = st.screenplay_id
       ORDER BY ss.scene_index ASC, ss.created_at ASC
       LIMIT 1
     ) fs ON TRUE
     LEFT JOIN creative_spaces cs ON cs.id = st.creative_space_id
     WHERE us.user_id = $1
       AND us.content_type = 'screenplay'
       AND us.${flagColumn} = true
       AND st.visibility = 'public'
       AND st.published = true
       AND (st.creative_space_id IS NULL OR cs.visibility = 'public')`,
    [userId],
  );

  const [storyRowsResult, screenplayRowsResult] = await Promise.all([
    storyRowsPromise,
    screenplayRowsPromise,
  ]);

  // Build a flat list of items from stories + screenplays first.
  const rawItems = [];

  for (const row of storyRowsResult.rows) {
    rawItems.push({
      id: row.id,
      content_type: 'story',
      content_id: row.story_title_id,
      title: row.title,
      created_at: row.created_at,
      is_favorite: row.is_favorite,
      is_living: row.is_living,
      is_lived: row.is_lived,
      kind: 'novel',
    });
  }

  for (const row of screenplayRowsResult.rows) {
    rawItems.push({
      id: row.id,
      content_type: 'screenplay',
      content_id: row.screenplay_id,
      title: row.title,
      created_at: row.created_at,
      is_favorite: row.is_favorite,
      is_living: row.is_living,
      is_lived: row.is_lived,
      slugline: row.slugline,
      kind: 'screenplay',
    });
  }

  // Deduplicate by (content_type, content_id) so each story/screenplay
  // appears at most once per user and flag (favorites / living / lived).
  const uniqueMap = new Map();
  for (const item of rawItems) {
    const key = `${item.content_type}:${item.content_id}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, item);
    }
  }

  const items = Array.from(uniqueMap.values());

  // Sort newest first by created_at
  items.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return items;
}

/**
 * Set a user's favorite / living / lived flags for one story or screenplay.
 * Only the flags passed (not undefined/null) change; the others keep their
 * stored value. One row per user and item (see migration 0019).
 */
export async function setUserStoryStatus(db, userId, { contentType, storyTitleId, screenplayId, isFavorite, isLiving, isLived }) {
  const flag = (value) => (value === undefined || value === null ? null : Boolean(value));
  const target = contentType === 'story'
    ? '(user_id, story_title_id) WHERE content_type = \'story\''
    : '(user_id, screenplay_id) WHERE content_type = \'screenplay\'';
  const { rows } = await db.query(
    `INSERT INTO user_story_status (user_id, content_type, story_title_id, screenplay_id,
                                    is_favorite, is_living, is_lived)
     VALUES ($1, $2, $3, $4,
             COALESCE($5::boolean, false), COALESCE($6::boolean, false), COALESCE($7::boolean, false))
     ON CONFLICT ${target}
     DO UPDATE SET
       is_favorite = COALESCE($5::boolean, user_story_status.is_favorite),
       is_living   = COALESCE($6::boolean, user_story_status.is_living),
       is_lived    = COALESCE($7::boolean, user_story_status.is_lived),
       updated_at  = now()
     RETURNING *`,
    [
      userId,
      contentType,
      contentType === 'story' ? storyTitleId : null,
      contentType === 'screenplay' ? screenplayId : null,
      flag(isFavorite),
      flag(isLiving),
      flag(isLived),
    ],
  );
  return rows[0];
}
