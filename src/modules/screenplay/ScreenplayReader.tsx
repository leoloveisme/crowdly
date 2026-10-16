import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import EditableText from "@/components/EditableText";
import { cn } from "@/lib/utils";
import type { ScreenplayBlock, ScreenplayScene } from "@/lib/screenplayApi";

interface ScreenplayReaderProps {
  scene: ScreenplayScene;
  sceneNumber: number;
  sceneCount: number;
  blocks: ScreenplayBlock[];
  onPrev: () => void;
  onNext: () => void;
  /** Rendered under a block (proposal badges, branches…), optional. */
  renderBlockExtras?: (block: ScreenplayBlock) => React.ReactNode;
  children?: React.ReactNode;
}

// Industry layout: action full width, character centred, parenthetical and
// dialogue indented, transitions right-aligned.
const BLOCK_STYLE: Record<string, string> = {
  scene_heading: "font-bold uppercase",
  action: "",
  character: "uppercase text-center mt-4",
  parenthetical: "italic mx-auto max-w-xs text-center",
  dialogue: "mx-auto max-w-md",
  transition: "uppercase text-right font-semibold mt-4",
  shot: "uppercase font-semibold",
  general: "",
};

export const ScreenplayBlockText: React.FC<{ block: ScreenplayBlock }> = ({ block }) => (
  <p className={cn("whitespace-pre-wrap leading-relaxed", BLOCK_STYLE[block.block_type] ?? "")}>{block.text}</p>
);

/** One scene, formatted like a printed screenplay, with prev/next scene. */
const ScreenplayReader: React.FC<ScreenplayReaderProps> = ({
  scene,
  sceneNumber,
  sceneCount,
  blocks,
  onPrev,
  onNext,
  renderBlockExtras,
  children,
}) => (
  <article className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
      <h2 className="font-mono font-bold uppercase tracking-wide">
        <span className="text-gray-400 mr-2">{sceneNumber}.</span>
        {scene.slugline || <EditableText id="screenplay-untitled-scene">Untitled scene</EditableText>}
      </h2>
      <div className="flex items-center gap-1 text-xs text-gray-600">
        <button
          type="button"
          onClick={onPrev}
          disabled={sceneNumber <= 1}
          className="inline-flex items-center gap-0.5 px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
          <EditableText id="screenplay-scene-prev">Previous</EditableText>
        </button>
        <span className="tabular-nums">
          <EditableText id="screenplay-scene-of-label">Scene</EditableText> {sceneNumber} / {sceneCount}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={sceneNumber >= sceneCount}
          className="inline-flex items-center gap-0.5 px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-30"
        >
          <EditableText id="screenplay-scene-next">Next</EditableText>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
    {scene.synopsis && <p className="text-sm italic text-gray-600">{scene.synopsis}</p>}
    <div className="font-mono text-[14px] space-y-2 bg-white rounded-lg border p-6">
      {blocks.length === 0 ? (
        <EditableText id="screenplay-scene-empty" as="p" className="text-sm text-gray-400 italic">
          This scene is empty.
        </EditableText>
      ) : (
        blocks.map((block) => (
          <div key={block.block_id}>
            <ScreenplayBlockText block={block} />
            {renderBlockExtras?.(block)}
          </div>
        ))
      )}
    </div>
    {children}
  </article>
);

export default ScreenplayReader;
