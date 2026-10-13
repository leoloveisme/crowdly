import { api, get, patch, post } from "./api";

export interface Screenplay {
  screenplay_id: string;
  title: string;
  creator_id: string | null;
  description?: string | null;
  tags?: string[] | null;
  genre?: string | null;
  visibility?: string;
  published?: boolean;
}
export interface Scene {
  scene_id: string;
  screenplay_id: string;
  scene_index: number;
  slugline: string;
  location?: string | null;
  time_of_day?: string | null;
  is_interior?: boolean | null;
  synopsis?: string | null;
  published?: boolean;
}
export interface Block {
  block_id: string;
  screenplay_id: string;
  scene_id: string | null;
  block_index: number;
  block_type: BlockType;
  text: string;
  metadata?: unknown;
}
export type BlockType = "scene_heading" | "action" | "character" | "dialogue" | "parenthetical" | "transition" | "shot" | "general";

export const BLOCK_TYPES: { value: BlockType; label: string }[] = [
  { value: "action", label: "Action" },
  { value: "character", label: "Character" },
  { value: "dialogue", label: "Dialogue" },
  { value: "parenthetical", label: "Parenthetical" },
  { value: "transition", label: "Transition" },
  { value: "shot", label: "Shot" },
  { value: "scene_heading", label: "Scene heading" },
  { value: "general", label: "General" },
];

/** What Enter at the end of a block creates next (screenwriting convention). */
export const NEXT_TYPE: Record<BlockType, BlockType> = {
  scene_heading: "action",
  action: "action",
  character: "dialogue",
  parenthetical: "dialogue",
  dialogue: "character",
  transition: "scene_heading",
  shot: "action",
  general: "general",
};

export const getScreenplay = (id: string) => get<Screenplay>(`/screenplays/${id}`);
export const getScenes = (id: string) => get<{ scenes: Scene[]; blocks: Block[] }>(`/screenplays/${id}/scenes?includeBlocks=true`);
export const getScreenplayAccess = (id: string) =>
  get<{ role: "owner" | "contributor" | null }>(`/screenplays/${id}/my-access`).catch(() => null);
export const updateScreenplay = (id: string, p: Partial<Screenplay>) => patch<Screenplay>(`/screenplays/${id}`, p);

export const createScene = (screenplayId: string, sceneIndex: number, slugline: string) =>
  post<Scene>(`/screenplays/${screenplayId}/scenes`, { sceneIndex, slugline });
export const updateScene = (sceneId: string, p: { slugline?: string; synopsis?: string; sceneIndex?: number }) => patch<Scene>(`/screenplay-scenes/${sceneId}`, p);
export const deleteScene = (sceneId: string) => api(`/screenplay-scenes/${sceneId}`, { method: "DELETE" });
export const reorderScenes = (screenplayId: string, sceneIds: string[]) => patch(`/screenplays/${screenplayId}/scenes/reorder`, { sceneIds });

export const createBlock = (screenplayId: string, b: { sceneId: string; blockType: BlockType; text: string; blockIndex?: number; afterBlockId?: string }) =>
  // The backend rejects empty text; a single space is the established "empty block".
  post<Block>(`/screenplays/${screenplayId}/blocks`, { ...b, text: b.text || " " });
export const updateBlock = (blockId: string, p: { text?: string; blockType?: BlockType; blockIndex?: number; sceneId?: string }) =>
  patch<Block>(`/screenplay-blocks/${blockId}`, p.text !== undefined ? { ...p, text: p.text || " " } : p);
export const deleteBlock = (blockId: string) => api(`/screenplay-blocks/${blockId}`, { method: "DELETE" });
