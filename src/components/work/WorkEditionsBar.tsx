import React, { useCallback, useEffect, useState } from "react";
import { BookCopy, Pencil, Trash2 } from "lucide-react";
import EditableText from "@/components/EditableText";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/apiBase";
import {
  createWorkEdition,
  deleteWorkEdition,
  getWorkEdition,
  listWorkEditions,
  updateWorkEdition,
  type WorkEditionSummary,
  type WorkKind,
} from "@/lib/workApi";

/** Something that has alternatives: a screenplay element or a comic page. */
export interface EditionChoiceItem {
  id: string;
  label: string;
  branches: { id: string; label: string }[];
}

export interface EditionChoicePart {
  id: string;
  title: string;
  items: EditionChoiceItem[];
}

interface Props {
  kind: WorkKind;
  workId: string;
  /** Parts with the items that have branches (others always use the base). */
  parts: EditionChoicePart[];
  selectedEditionId: string | null;
  onSelect: (editionId: string | null) => void;
}

type Selections = Record<string, Record<string, string>>;

/**
 * "Current version / an edition" picker for screenplays and comics, with a
 * builder that picks, for every element or page that has branches, the base
 * version or one branch — the story page's EditionPicker for other kinds.
 */
const WorkEditionsBar: React.FC<Props> = ({ kind, workId, parts, selectedEditionId, onSelect }) => {
  const { user } = useAuth();
  const [editions, setEditions] = useState<WorkEditionSummary[]>([]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<WorkEditionSummary | null>(null);
  const [name, setName] = useState("");
  const [published, setPublished] = useState(true);
  const [selections, setSelections] = useState<Selections>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    listWorkEditions(kind, workId)
      .then(setEditions)
      .catch(() => setEditions([]));
  }, [kind, workId]);

  useEffect(() => {
    load();
  }, [load]);

  const choiceParts = parts.filter((p) => p.items.some((i) => i.branches.length > 0));

  const openBuilder = async (edition: WorkEditionSummary | null) => {
    setEditing(edition);
    setName(edition?.name ?? "");
    setPublished(edition ? edition.status === "published" : true);
    setSelections({});
    if (edition) {
      try {
        const full = await getWorkEdition(kind, edition.id);
        setSelections(Object.fromEntries(full.parts.filter((p) => p.part_id).map((p) => [p.part_id as string, p.selections])));
      } catch {
        /* start empty */
      }
    }
    setBuilderOpen(true);
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const data = { name: name.trim(), status: published ? ("published" as const) : ("draft" as const), selections };
      const saved = editing ? await updateWorkEdition(kind, editing.id, data) : await createWorkEdition(kind, workId, data);
      setBuilderOpen(false);
      load();
      onSelect(saved.id);
    } catch (err) {
      toast({ title: "Edition", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (edition: WorkEditionSummary) => {
    try {
      await deleteWorkEdition(kind, edition.id);
      if (selectedEditionId === edition.id) onSelect(null);
      load();
    } catch (err) {
      toast({ title: "Edition", description: errorMessage(err), variant: "destructive" });
    }
  };

  if (editions.length === 0 && (!user || choiceParts.length === 0)) return null;
  const selected = editions.find((e) => e.id === selectedEditionId) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <BookCopy className="h-3.5 w-3.5 text-gray-500" />
      <select
        value={selectedEditionId ?? ""}
        onChange={(e) => onSelect(e.target.value || null)}
        className="border rounded px-2 py-1 bg-white"
        aria-label="Edition"
      >
        <option value="">Current version</option>
        {editions.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
            {e.status === "draft" ? " (draft)" : ""}
          </option>
        ))}
      </select>
      {selected?.is_mine && (
        <>
          <button type="button" onClick={() => openBuilder(selected)} className="p-1 text-gray-500 hover:text-gray-800" aria-label="Edit edition">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => remove(selected)} className="p-1 text-gray-500 hover:text-red-600" aria-label="Delete edition">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
      {user && choiceParts.length > 0 && (
        <button type="button" onClick={() => openBuilder(null)} className="text-blue-700 hover:underline">
          <EditableText id={`${kind}-edition-new`}>New edition</EditableText>
        </button>
      )}

      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <EditableText id={`${kind}-edition-builder-title`}>Build an edition</EditableText>
            </DialogTitle>
            <DialogDescription>
              <EditableText id={`${kind}-edition-builder-desc`}>
                Pick the original or one of its branches wherever alternatives exist. The edition is frozen when you save.
              </EditableText>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Edition name"
              className="w-full border rounded px-2 py-1.5"
            />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
              <EditableText id={`${kind}-edition-visible`}>Visible to readers</EditableText>
            </label>
            {choiceParts.map((part) => (
              <section key={part.id} className="space-y-2">
                <h4 className="font-semibold text-xs uppercase tracking-wide text-gray-600">{part.title}</h4>
                {part.items
                  .filter((i) => i.branches.length > 0)
                  .map((item) => {
                    const current = selections[part.id]?.[item.id] ?? "";
                    const pick = (branchId: string) =>
                      setSelections((prev) => {
                        const forPart = { ...(prev[part.id] ?? {}) };
                        if (branchId) forPart[item.id] = branchId;
                        else delete forPart[item.id];
                        return { ...prev, [part.id]: forPart };
                      });
                    return (
                      <div key={item.id} className="rounded border p-2 space-y-1">
                        <label className="flex items-start gap-2">
                          <input type="radio" checked={!current} onChange={() => pick("")} className="mt-1" />
                          <span className="text-gray-700 whitespace-pre-wrap">{item.label}</span>
                        </label>
                        {item.branches.map((b) => (
                          <label key={b.id} className="flex items-start gap-2">
                            <input type="radio" checked={current === b.id} onChange={() => pick(b.id)} className="mt-1" />
                            <span className="text-emerald-800 whitespace-pre-wrap">{b.label}</span>
                          </label>
                        ))}
                      </div>
                    );
                  })}
              </section>
            ))}
            <Button onClick={save} disabled={saving || !name.trim()} className="w-full">
              <EditableText id={`${kind}-edition-save`}>Save edition</EditableText>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WorkEditionsBar;
