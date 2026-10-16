import React, { useEffect, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import EditableText from "@/components/EditableText";
import { BLOCK_TYPES, type ScreenplayBlock, type ScreenplayScene } from "@/lib/screenplayApi";

interface ScreenplayEditorProps {
  scene: ScreenplayScene;
  sceneNumber: number;
  blocks: ScreenplayBlock[];
  /**
   * Team members change the structure (add, delete, retype elements);
   * readers suggesting changes only edit text, which becomes a proposal.
   */
  canStructure: boolean;
  onSaveScene: (patch: { slugline?: string; synopsis?: string | null }) => void;
  onSaveBlock: (block: ScreenplayBlock, patch: { text?: string; blockType?: string }) => void;
  onAddBlock: (afterBlock: ScreenplayBlock | null, blockType: string) => void;
  onDeleteBlock: (block: ScreenplayBlock) => void;
  /** Copies the scene and its elements (team only). */
  onCloneScene?: () => void;
  /** Under each element: Create branch, branches, proposal hints (phase 2). */
  renderBlockExtras?: (block: ScreenplayBlock) => React.ReactNode;
  /** Shown above the scene (e.g. "your edits are sent as suggestions"). */
  banner?: React.ReactNode;
}

// The element type that usually follows another, so "add element" after a
// character line starts a dialogue line, and so on.
const NEXT_TYPE: Record<string, string> = {
  scene_heading: "action",
  character: "dialogue",
  parenthetical: "dialogue",
  dialogue: "character",
  transition: "scene_heading",
};

const BlockRow: React.FC<{
  block: ScreenplayBlock;
  canStructure: boolean;
  onSave: (patch: { text?: string; blockType?: string }) => void;
  onAddAfter: () => void;
  onDelete: () => void;
  extras?: React.ReactNode;
}> = ({ block, canStructure, onSave, onAddAfter, onDelete, extras }) => {
  const [text, setText] = useState(block.text);
  useEffect(() => setText(block.text), [block.text]);

  return (
    <div className="group flex flex-col gap-1 border-b border-dashed border-gray-200 pb-2">
      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <select
          className="border rounded px-1 py-0.5 text-[11px] bg-white disabled:opacity-70"
          disabled={!canStructure}
          value={block.block_type}
          onChange={(e) => onSave({ blockType: e.target.value })}
          aria-label="Element type"
        >
          {BLOCK_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        {canStructure && (
        <button
          type="button"
          onClick={onAddAfter}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-gray-100"
          title="Add an element after this one"
        >
          <Plus className="h-3 w-3" />
        </button>
        )}
        {canStructure && (
          <button
            type="button"
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 inline-flex items-center px-1.5 py-0.5 rounded text-red-600 hover:bg-red-50"
            title="Delete this element"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <textarea
        className="w-full resize-y border rounded border-transparent hover:border-gray-200 focus:border-blue-300 bg-transparent px-1 focus:outline-none leading-relaxed font-mono text-[13px]"
        rows={Math.max(1, Math.min(8, text.split(/\n/).length))}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text === block.text) return;
          onSave({ text });
          // A suggestion doesn't change the element: show the original again
          // (the suggestion appears in purple underneath).
          if (!canStructure) setText(block.text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
      />
      {extras}
    </div>
  );
};

/** Editing mode for one scene: slugline, synopsis and its elements. */
const ScreenplayEditor: React.FC<ScreenplayEditorProps> = ({
  scene,
  sceneNumber,
  blocks,
  canStructure,
  onSaveScene,
  onSaveBlock,
  onAddBlock,
  onDeleteBlock,
  onCloneScene,
  renderBlockExtras,
  banner,
}) => {
  const [slugline, setSlugline] = useState(scene.slugline);
  const [synopsis, setSynopsis] = useState(scene.synopsis ?? "");
  useEffect(() => setSlugline(scene.slugline), [scene.slugline]);
  useEffect(() => setSynopsis(scene.synopsis ?? ""), [scene.synopsis]);

  return (
    <article className="space-y-4">
      {banner}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="uppercase tracking-wide text-xs text-gray-500">
            <EditableText id="screenplay-scene-label">Scene</EditableText> {sceneNumber}
          </div>
          <input
            type="text"
            className="w-full font-mono font-bold uppercase bg-transparent border-b border-dashed border-gray-300 px-0.5 py-0.5 focus:outline-none focus:border-blue-400"
            value={slugline}
            onChange={(e) => setSlugline(e.target.value)}
            onBlur={() => {
              if (slugline.trim() && slugline !== scene.slugline) onSaveScene({ slugline: slugline.trim() });
              if (!canStructure) setSlugline(scene.slugline);
            }}
            placeholder="INT. LOCATION - TIME"
          />
        </div>
        {onCloneScene && (
          <button
            type="button"
            onClick={onCloneScene}
            className="inline-flex items-center gap-1 px-2 py-1 border border-dashed border-gray-300 rounded-full text-[11px] hover:bg-gray-50"
          >
            <Copy className="h-3 w-3" />
            <EditableText id="screenplay-clone-scene">Clone scene</EditableText>
          </button>
        )}
      </div>
      <textarea
        value={synopsis}
        disabled={!canStructure}
        onChange={(e) => setSynopsis(e.target.value)}
        onBlur={() => {
          if (synopsis !== (scene.synopsis ?? "")) onSaveScene({ synopsis: synopsis || null });
        }}
        rows={2}
        placeholder="Synopsis (optional)"
        className="w-full text-sm italic border rounded px-2 py-1 focus:outline-none focus:border-blue-300"
      />
      <div className="space-y-2 bg-white rounded-lg border p-4">
        {blocks.map((block) => (
          <BlockRow
            key={block.block_id}
            block={block}
            canStructure={canStructure}
            onSave={(patch) => onSaveBlock(block, patch)}
            onAddAfter={() => onAddBlock(block, NEXT_TYPE[block.block_type] ?? "action")}
            onDelete={() => onDeleteBlock(block)}
            extras={renderBlockExtras?.(block)}
          />
        ))}
        {canStructure && (
          <button
            type="button"
            onClick={() =>
              onAddBlock(blocks[blocks.length - 1] ?? null, NEXT_TYPE[blocks[blocks.length - 1]?.block_type] ?? "action")
            }
            className="mt-2 inline-flex items-center px-3 py-1 text-[11px] rounded-full border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            <EditableText id="screenplay-add-element">Add element</EditableText>
          </button>
        )}
      </div>
    </article>
  );
};

export default ScreenplayEditor;
