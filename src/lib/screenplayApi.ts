import { workRequest } from "./workApi";

// Screenplay content routes (backend/src/server.js): scenes and blocks.
// Writes need the session cookie and a place on the screenplay's team.

export interface ScreenplayTitle {
  screenplay_id: string;
  title: string;
  creator_id: string | null;
  visibility: string | null;
  published: boolean | null;
  genre: string | null;
  tags: string[] | null;
  format_type: string | null;
  description: string | null;
  completion_status: string | null;
  clone_policy: string | null;
  export_policy: string | null;
  translation_policy: string | null;
  narration_policy: string | null;
  language: string | null;
  cover_image_url: string | null;
  translation_group_id?: string | null;
  source_screenplay_id?: string | null;
  is_official_translation?: boolean;
  can_clone?: boolean;
  can_export?: boolean;
  can_translate?: boolean;
  can_narrate?: boolean;
}

export interface ScreenplayScene {
  scene_id: string;
  screenplay_id: string;
  scene_index: number;
  slugline: string;
  location: string | null;
  time_of_day: string | null;
  is_interior: boolean | null;
  synopsis: string | null;
  published?: boolean;
}

export interface ScreenplayBlock {
  block_id: string;
  screenplay_id: string;
  scene_id: string | null;
  block_index: number;
  block_type: string;
  text: string;
  metadata: Record<string, unknown> | null;
}

export const BLOCK_TYPES: { value: string; label: string }[] = [
  { value: "scene_heading", label: "Scene Heading" },
  { value: "action", label: "Action" },
  { value: "character", label: "Character" },
  { value: "dialogue", label: "Dialogue" },
  { value: "parenthetical", label: "Parenthetical" },
  { value: "transition", label: "Transition" },
  { value: "shot", label: "Shot" },
  { value: "general", label: "General" },
];

const sp = (id: string) => `/screenplays/${encodeURIComponent(id)}`;
const body = (method: string, data?: unknown): RequestInit => ({
  method,
  body: data === undefined ? undefined : JSON.stringify(data),
});

export const getScreenplay = (id: string) => workRequest<ScreenplayTitle>(sp(id));

export const getScreenplayStructure = (id: string) =>
  workRequest<{ scenes: ScreenplayScene[]; blocks: ScreenplayBlock[] }>(`${sp(id)}/scenes?includeBlocks=true`);

export const createScene = (
  screenplayId: string,
  data: { sceneIndex: number; slugline: string; synopsis?: string | null },
) => workRequest<ScreenplayScene>(`${sp(screenplayId)}/scenes`, body("POST", data));

export const updateScene = (
  sceneId: string,
  data: Partial<{ slugline: string; location: string | null; timeOfDay: string | null; isInterior: boolean | null; synopsis: string | null }>,
) => workRequest<ScreenplayScene>(`/screenplay-scenes/${sceneId}`, body("PATCH", data));

export const setScenePublished = (sceneId: string, published: boolean) =>
  workRequest<ScreenplayScene>(`/screenplay-scenes/${sceneId}/publish`, body("PATCH", { published }));

export const deleteScene = (sceneId: string) => workRequest<void>(`/screenplay-scenes/${sceneId}`, body("DELETE"));

export const reorderScenes = (screenplayId: string, sceneIds: string[]) =>
  workRequest<void>(`${sp(screenplayId)}/scenes/reorder`, body("PATCH", { sceneIds }));

export const createBlock = (
  screenplayId: string,
  data: {
    sceneId: string;
    blockIndex: number;
    blockType: string;
    text: string;
    metadata?: Record<string, unknown> | null;
    /** Insert right after this element (later ones shift down). */
    afterBlockId?: string | null;
  },
) => workRequest<ScreenplayBlock>(`${sp(screenplayId)}/blocks`, body("POST", data));

export const updateBlock = (
  blockId: string,
  data: Partial<{ blockType: string; text: string; blockIndex: number }>,
) => workRequest<ScreenplayBlock>(`/screenplay-blocks/${blockId}`, body("PATCH", data));

export const deleteBlock = (blockId: string) => workRequest<void>(`/screenplay-blocks/${blockId}`, body("DELETE"));

export const createScreenplayFromTemplate = (title: string, formatType: string) =>
  workRequest<{ screenplayId: string; title: string; formatType: string | null }>(
    "/screenplays/template",
    body("POST", { title, formatType }),
  );
