import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2, Pencil } from "lucide-react";
import { useTabTitle } from "@web/shell/workspace";
import { askConfirm, askText } from "@web/shell/ask";
import {
  RULE_FIELDS,
  createShelf,
  deleteShelf,
  listShelves,
  removeFromShelf,
  reorderShelfItems,
  reorderShelves,
  shelfItems,
  updateShelf,
  type Shelf,
  type ShelfItem,
  type SmartRules,
} from "@web/lib/discovery";
import { ItemCard, ItemGrid, invalidateShelvesCache } from "./ItemCard";

// Shelves (desktop: Discovery shelves + smart_shelf_dialog.py): the system
// shelves, manual shelves you fill yourself, and smart shelves defined by
// rules. Create, rename, reorder and delete shelves; reorder and remove
// items on manual shelves.

const SYSTEM_TITLES: Record<string, [string, string]> = {
  favorites: ["webapp-shelf-favorites", "Favorites"],
  living: ["webapp-shelf-living", "Living"],
  lived: ["webapp-shelf-lived", "Lived"],
  newest: ["webapp-shelf-newest", "Newest"],
  most_active: ["webapp-shelf-active", "Most active"],
  most_popular: ["webapp-shelf-popular", "Most popular"],
};

const SmartShelfDialog: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; initial?: Shelf | null; onSaved: () => void }> = ({ open, onOpenChange, initial, onSaved }) => {
  const [name, setName] = useState("");
  const [rules, setRules] = useState<SmartRules>({ match: "all", rules: [{ field: "format", op: "is", value: "epub" }] });
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setRules(initial?.rules ?? { match: "all", rules: [{ field: "format", op: "is", value: "epub" }] });
  }, [open, initial]);

  const setRule = (i: number, patch: Partial<SmartRules["rules"][number]>) =>
    setRules((r) => ({ ...r, rules: r.rules.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  const save = async () => {
    try {
      if (initial) await updateShelf(initial.id, { name, rules });
      else await createShelf({ name, kind: "smart", rules });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Couldn't save the shelf", description: (err as Error).message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <EditableText id="webapp-smart-title">Smart shelf</EditableText>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Shelf name" />
          <div className="flex items-center gap-2 text-sm">
            <EditableText id="webapp-smart-match">Match</EditableText>
            <select value={rules.match} onChange={(e) => setRules({ ...rules, match: e.target.value as "all" | "any" })} className="h-8 rounded border bg-background px-2">
              <option value="all">all rules</option>
              <option value="any">any rule</option>
            </select>
          </div>
          {rules.rules.map((r, i) => {
            const spec = RULE_FIELDS[r.field];
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select
                  value={r.field}
                  onChange={(e) => {
                    const f = RULE_FIELDS[e.target.value];
                    setRule(i, { field: e.target.value, op: f.ops[0], value: f.values?.[0] ?? (f.type === "days" ? 30 : "") });
                  }}
                  className="h-8 rounded border bg-background px-2 text-sm"
                >
                  {Object.entries(RULE_FIELDS).map(([k, f]) => (
                    <option key={k} value={k}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-muted-foreground">{r.op === "contains" ? "contains" : r.op === "lte" ? "≤" : "is"}</span>
                {spec?.values ? (
                  <select value={String(r.value)} onChange={(e) => setRule(i, { value: e.target.value })} className="h-8 rounded border bg-background px-2 text-sm">
                    {spec.values.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={String(r.value)}
                    type={spec?.type === "days" ? "number" : "text"}
                    onChange={(e) => setRule(i, { value: spec?.type === "days" ? Number(e.target.value) : e.target.value })}
                    className="h-8 w-40"
                  />
                )}
                <button onClick={() => setRules({ ...rules, rules: rules.rules.filter((_, j) => j !== i) })} className="text-destructive" aria-label="Remove rule">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          <Button size="sm" variant="outline" onClick={() => setRules({ ...rules, rules: [...rules.rules, { field: "title", op: "contains", value: "" }] })}>
            <Plus className="mr-1 h-4 w-4" />
            <EditableText id="webapp-smart-add-rule">Add rule</EditableText>
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={!name.trim() || rules.rules.length === 0}>
            <EditableText id="webapp-smart-save">Save</EditableText>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ShelvesPage: React.FC = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState("favorites");
  const [smartOpen, setSmartOpen] = useState(false);
  const [editing, setEditing] = useState<Shelf | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  useTabTitle("/shelves", "Shelves");

  const shelves = useQuery({ queryKey: ["shelves", user?.id], queryFn: listShelves, enabled: !!user });
  const items = useQuery({ queryKey: ["shelf-items", selected], queryFn: () => shelfItems(selected), enabled: !!user });
  const refresh = () => {
    invalidateShelvesCache();
    qc.invalidateQueries({ queryKey: ["shelves"] });
    qc.invalidateQueries({ queryKey: ["shelf-items"] });
  };

  const custom = shelves.data?.custom ?? [];
  const current = custom.find((s) => s.id === selected) ?? null;
  const list: ShelfItem[] = items.data?.items ?? [];

  const newManual = async () => {
    const name = await askText("Name of the new shelf");
    if (!name?.trim()) return;
    try {
      const r = await createShelf({ name: name.trim(), kind: "manual" });
      refresh();
      setSelected(r.shelf.id);
    } catch (err) {
      toast({ title: "Couldn't create the shelf", description: (err as Error).message, variant: "destructive" });
    }
  };

  const moveShelf = async (i: number, j: number) => {
    if (j < 0 || j >= custom.length) return;
    const ids = custom.map((s) => s.id);
    const [x] = ids.splice(i, 1);
    ids.splice(j, 0, x);
    await reorderShelves(ids).catch(() => {});
    refresh();
  };

  const moveItem = async (from: number, to: number) => {
    if (!current || current.kind !== "manual") return;
    const order = list.slice();
    const [x] = order.splice(from, 1);
    order.splice(to, 0, x);
    await reorderShelfItems(current.id, order.map((i) => i.entry_id!).filter(Boolean)).catch(() => {});
    refresh();
  };

  if (!user)
    return (
      <EditableText id="webapp-shelves-login" as="p" className="p-6 text-muted-foreground">
        Log in to use shelves.
      </EditableText>
    );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-3 sm:p-6 md:flex-row">
      <aside className="shrink-0 space-y-3 md:w-60">
        <EditableText id="webapp-shelves-title" as="h1" className="text-2xl font-semibold">
          Shelves
        </EditableText>
        <ul className="space-y-0.5 text-sm">
          {(shelves.data?.system ?? []).map((s) => {
            const [id, title] = SYSTEM_TITLES[s.key] ?? [`webapp-shelf-${s.key}`, s.key];
            return (
              <li key={s.key}>
                <button onClick={() => setSelected(s.key)} className={`flex w-full justify-between rounded px-2 py-1.5 ${selected === s.key ? "bg-primary/10 font-medium" : "hover:bg-muted"}`}>
                  <EditableText id={id}>{title}</EditableText>
                  {s.count !== null && <span className="text-muted-foreground">{s.count}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-t pt-2">
          <ul className="space-y-0.5 text-sm">
            {custom.map((s, i) => (
              <li key={s.id} className="group flex items-center">
                <button onClick={() => setSelected(s.id)} className={`flex min-w-0 flex-1 items-center gap-1 rounded px-2 py-1.5 text-left ${selected === s.id ? "bg-primary/10 font-medium" : "hover:bg-muted"}`}>
                  {s.kind === "smart" && <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                  <span className="truncate">{s.name}</span>
                  <span className="ml-auto text-muted-foreground">{s.count ?? ""}</span>
                </button>
                <span className="flex opacity-0 group-hover:opacity-100 max-md:opacity-100">
                  <button onClick={() => moveShelf(i, i - 1)} className="p-0.5" aria-label="Move up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => moveShelf(i, i + 1)} className="p-0.5" aria-label="Move down">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-1">
            <Button size="sm" variant="outline" onClick={newManual} className="flex-1 gap-1">
              <Plus className="h-4 w-4" />
              <EditableText id="webapp-shelves-new">Shelf</EditableText>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(null);
                setSmartOpen(true);
              }}
              className="flex-1 gap-1"
            >
              <Sparkles className="h-4 w-4" />
              <EditableText id="webapp-shelves-new-smart">Smart</EditableText>
            </Button>
          </div>
        </div>
      </aside>

      <section className="min-w-0 flex-1 space-y-3">
        {current && (
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-xl font-medium">{current.name}</h2>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1"
              onClick={async () => {
                if (current.kind === "smart") {
                  setEditing(current);
                  setSmartOpen(true);
                  return;
                }
                const n = await askText("Rename shelf", current.name);
                if (n?.trim()) {
                  await updateShelf(current.id, { name: n.trim() }).catch((e) => toast({ title: (e as Error).message, variant: "destructive" }));
                  refresh();
                }
              }}
            >
              <Pencil className="h-4 w-4" />
              <EditableText id="webapp-shelves-edit">Edit</EditableText>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-destructive"
              onClick={async () => {
                if (!(await askConfirm(`Delete the shelf “${current.name}”? The books stay in your library.`))) return;
                await deleteShelf(current.id).catch((e) => toast({ title: (e as Error).message, variant: "destructive" }));
                setSelected("favorites");
                refresh();
              }}
            >
              <Trash2 className="h-4 w-4" />
              <EditableText id="webapp-shelves-delete">Delete</EditableText>
            </Button>
          </div>
        )}
        {list.length === 0 && !items.isLoading && (
          <EditableText id="webapp-shelves-empty" as="p" className="text-muted-foreground">
            This shelf is empty.
          </EditableText>
        )}
        <ItemGrid>
          {list.map((i, idx) => (
            <ItemCard
              key={`${i.type}:${i.id}`}
              item={i}
              draggable={current?.kind === "manual"}
              onDragStart={() => setDragFrom(idx)}
              onDrop={current?.kind === "manual" ? () => dragFrom !== null && moveItem(dragFrom, idx) : undefined}
              onRemove={
                current?.kind === "manual"
                  ? async () => {
                      await removeFromShelf(current.id, i.type, i.id).catch((e) => toast({ title: (e as Error).message, variant: "destructive" }));
                      refresh();
                    }
                  : undefined
              }
            />
          ))}
        </ItemGrid>
      </section>
      <SmartShelfDialog open={smartOpen} onOpenChange={setSmartOpen} initial={editing} onSaved={refresh} />
    </div>
  );
};

export default ShelvesPage;
