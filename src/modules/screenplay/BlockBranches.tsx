import React, { useEffect, useState } from "react";
import { GitBranch, Trash2 } from "lucide-react";
import EditableText from "@/components/EditableText";
import type { BlockBranch, ScreenplayBlock } from "@/lib/screenplayApi";

interface BlockBranchesProps {
  block: ScreenplayBlock;
  branches: BlockBranch[];
  /** Reader: a collapsed "n alternatives" list. Editor: create and edit. */
  editable: boolean;
  /** Signed in and allowed to read: may add a branch. */
  canCreate: boolean;
  /** Owner, platform staff or the branch's author edit directly; others suggest. */
  canEditBranch: (branch: BlockBranch) => boolean;
  onCreate: (text: string) => void;
  onSave: (branch: BlockBranch, text: string) => void;
  onDelete: (branch: BlockBranch) => void;
}

const BranchText: React.FC<{
  branch: BlockBranch;
  direct: boolean;
  onSave: (text: string) => void;
}> = ({ branch, direct, onSave }) => {
  const [text, setText] = useState(branch.text);
  useEffect(() => setText(branch.text), [branch.text]);
  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text.trim() && text !== branch.text) onSave(text);
      }}
      rows={Math.max(1, Math.min(6, text.split(/\n/).length))}
      title={direct ? undefined : "Your edit is sent to the owner as a suggestion"}
      className="w-full resize-y rounded border border-transparent hover:border-gray-200 focus:border-blue-300 bg-transparent px-1 font-mono text-[13px] focus:outline-none"
    />
  );
};

/** Alternative versions of one screenplay element (branches). */
const BlockBranches: React.FC<BlockBranchesProps> = ({
  block,
  branches,
  editable,
  canCreate,
  canEditBranch,
  onCreate,
  onSave,
  onDelete,
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  if (!editable) {
    if (branches.length === 0) return null;
    return (
      <div className="mt-1 text-xs">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
        >
          <GitBranch className="h-3 w-3" />
          {branches.length} <EditableText id="screenplay-branches-count">alternatives</EditableText>
        </button>
        {open && (
          <ul className="mt-1 space-y-1 border-l-2 border-emerald-200 pl-3">
            {branches.map((b) => (
              <li key={b.id} className="whitespace-pre-wrap font-mono text-[13px] text-gray-700">
                {b.name && <span className="mr-1 text-[11px] font-sans text-emerald-700">{b.name}:</span>}
                {b.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {branches.map((b) => (
        <div key={b.id} className="flex items-start gap-1 border-l-2 border-emerald-300 pl-2">
          <GitBranch className="h-3 w-3 mt-1.5 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            {b.name && <div className="text-[11px] text-emerald-700">{b.name}</div>}
            <BranchText branch={b} direct={canEditBranch(b)} onSave={(text) => onSave(b, text)} />
          </div>
          {canEditBranch(b) && (
            <button
              type="button"
              onClick={() => onDelete(b)}
              className="p-1 text-gray-400 hover:text-red-600"
              aria-label="Delete branch"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
      {draft !== null ? (
        <div className="flex items-start gap-1 border-l-2 border-dashed border-emerald-300 pl-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder={block.text}
            className="flex-1 rounded border px-1 font-mono text-[13px]"
          />
          <div className="flex flex-col gap-1 text-[11px]">
            <button
              type="button"
              disabled={!draft.trim()}
              onClick={() => {
                onCreate(draft.trim());
                setDraft(null);
              }}
              className="rounded bg-emerald-600 px-2 py-0.5 text-white disabled:opacity-50"
            >
              <EditableText id="screenplay-branch-add">Add</EditableText>
            </button>
            <button type="button" onClick={() => setDraft(null)} className="text-gray-500 hover:underline">
              <EditableText id="screenplay-branch-cancel">Cancel</EditableText>
            </button>
          </div>
        </div>
      ) : (
        canCreate && (
          <button
            type="button"
            onClick={() => setDraft(block.text)}
            className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:underline"
          >
            <GitBranch className="h-3 w-3" />
            <EditableText id="screenplay-branch-create">Create branch</EditableText>
          </button>
        )
      )}
    </div>
  );
};

export default BlockBranches;
