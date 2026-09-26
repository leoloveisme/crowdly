// Builds the initial Automerge document value for each doc type from the
// existing plain-column tables. Shared by the live POST /crdt/docs/ensure
// route (server.js) and scripts/backfill-crdt-docs.js so both paths always
// agree on doc shape.
//
// Automerge 3.x treats every plain JS string as CRDT text by default (no
// more explicit `Text` wrapper class) — see crdt/repo.js's restore helpers
// for the corresponding read/write-back side of that.

export async function seedChapterDoc(client, chapterId) {
  const { rows } = await client.query('SELECT * FROM stories WHERE chapter_id = $1', [chapterId]);
  if (rows.length === 0) return null;
  const chapter = rows[0];
  const { rows: branchRows } = await client.query(
    'SELECT * FROM paragraph_branches WHERE chapter_id = $1 ORDER BY parent_paragraph_index, id',
    [chapterId],
  );
  const branches = {};
  for (const b of branchRows) {
    const key = String(b.parent_paragraph_index);
    if (!branches[key]) branches[key] = [];
    branches[key].push({
      id: String(b.id),
      userId: b.user_id,
      branchText: b.branch_text || '',
      createdAt: b.created_at ? b.created_at.toISOString() : null,
      language: b.language,
      metadata: b.metadata || null,
    });
  }
  return {
    entity: { storyTitleId: chapter.story_title_id, chapterId: chapter.chapter_id },
    value: {
      chapterId: chapter.chapter_id,
      storyTitleId: chapter.story_title_id,
      title: chapter.chapter_title || '',
      paragraphs: (chapter.paragraphs || []).map((p) => p || ''),
      branches,
      meta: {
        episodeNumber: chapter.episode_number ?? null,
        partNumber: chapter.part_number ?? null,
        chapterIndex: chapter.chapter_index ?? null,
      },
    },
  };
}

export async function seedSceneDoc(client, sceneId) {
  const { rows } = await client.query('SELECT * FROM screenplay_scene WHERE scene_id = $1', [sceneId]);
  if (rows.length === 0) return null;
  const scene = rows[0];
  const { rows: blockRows } = await client.query(
    'SELECT * FROM screenplay_block WHERE scene_id = $1 ORDER BY block_index',
    [sceneId],
  );
  return {
    entity: { screenplayId: scene.screenplay_id, sceneId: scene.scene_id },
    value: {
      sceneId: scene.scene_id,
      screenplayId: scene.screenplay_id,
      sceneIndex: scene.scene_index,
      slugline: scene.slugline || '',
      location: scene.location,
      timeOfDay: scene.time_of_day,
      isInterior: scene.is_interior,
      synopsis: scene.synopsis || '',
      blocks: blockRows.map((b) => ({
        blockId: b.block_id,
        blockType: b.block_type,
        text: b.text || '',
        metadata: b.metadata || null,
      })),
    },
  };
}

export async function seedStoryTitleDoc(client, storyTitleId) {
  const { rows } = await client.query('SELECT * FROM story_title WHERE story_title_id = $1', [storyTitleId]);
  if (rows.length === 0) return null;
  const s = rows[0];
  return {
    entity: { storyTitleId: s.story_title_id },
    value: {
      storyTitleId: s.story_title_id,
      title: s.title || '',
      genre: s.genre || null,
      tags: s.tags || [],
      description: s.description || '',
      completionStatus: s.completion_status,
    },
  };
}

export async function seedScreenplayTitleDoc(client, screenplayId) {
  const { rows } = await client.query('SELECT * FROM screenplay_title WHERE screenplay_id = $1', [screenplayId]);
  if (rows.length === 0) return null;
  const s = rows[0];
  return {
    entity: { screenplayId: s.screenplay_id },
    value: {
      screenplayId: s.screenplay_id,
      title: s.title || '',
      genre: s.genre || null,
      tags: s.tags || [],
      formatType: s.format_type || null,
    },
  };
}

export const CRDT_DOC_TYPE_COLUMN = {
  chapter: 'chapter_id',
  scene: 'scene_id',
  story_title: 'story_title_id',
  screenplay_title: 'screenplay_id',
};

export const CRDT_DOC_TYPE_SEEDERS = {
  chapter: seedChapterDoc,
  scene: seedSceneDoc,
  story_title: seedStoryTitleDoc,
  screenplay_title: seedScreenplayTitleDoc,
};

/** True if `user` has any access role on the story/screenplay a doc-type+entity belongs to. */
export async function userCanAccessCrdtEntity(client, user, docType, entity) {
  if (docType === 'chapter' || docType === 'story_title') {
    const { rows } = await client.query(
      'SELECT 1 FROM story_access WHERE story_title_id = $1 AND user_id = $2 LIMIT 1',
      [entity.storyTitleId, user.id],
    );
    return rows.length > 0;
  }
  if (docType === 'scene' || docType === 'screenplay_title') {
    const { rows } = await client.query(
      'SELECT 1 FROM screenplay_access WHERE screenplay_id = $1 AND user_id = $2 LIMIT 1',
      [entity.screenplayId, user.id],
    );
    return rows.length > 0;
  }
  return false;
}
