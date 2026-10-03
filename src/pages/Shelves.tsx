import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import EditableText from "@/components/EditableText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { errorMessage } from "@/lib/apiBase";
import {
  RULE_FIELDS,
  Shelf,
  ShelfItem,
  ShelfRule,
  ShelfRules,
  ShelfSort,
  SystemShelfKey,
  createShelf,
  deleteShelf,
  listShelves,
  removeFromShelf,
  reorderShelfItems,
  reorderShelves,
  shelfItems,
  updateShelf,
} from "@/lib/shelvesApi";

// Labels of system shelves, rule fields, values and sorts. Each one is an
// EditableText so translators can change it per language.
const SYSTEM_LABELS: Record<SystemShelfKey, React.ReactNode> = {
  favorites: <EditableText id="shelves-system-favorites">Favorites</EditableText>,
  living: <EditableText id="shelves-system-living">Living</EditableText>,
  lived: <EditableText id="shelves-system-lived">Lived</EditableText>,
  newest: <EditableText id="shelves-system-newest">Newest stories</EditableText>,
  most_active: <EditableText id="shelves-system-most-active">Most active</EditableText>,
  most_popular: <EditableText id="shelves-system-most-popular">Most popular</EditableText>,
};

const FIELD_LABELS: Record<string, React.ReactNode> = {
  source: <EditableText id="shelves-field-source">Source</EditableText>,
  format: <EditableText id="shelves-field-format">Format</EditableText>,
  language: <EditableText id="shelves-field-language">Language</EditableText>,
  title: <EditableText id="shelves-field-title">Title</EditableText>,
  author: <EditableText id="shelves-field-author">Author</EditableText>,
  status: <EditableText id="shelves-field-status">Crowdly status</EditableText>,
  progress: <EditableText id="shelves-field-progress">Reading progress</EditableText>,
  added_within_days: <EditableText id="shelves-field-added">Added in the last</EditableText>,
  read_within_days: <EditableText id="shelves-field-read">Read in the last</EditableText>,
};

const OP_LABELS: Record<string, React.ReactNode> = {
  is: <EditableText id="shelves-op-is">is</EditableText>,
  contains: <EditableText id="shelves-op-contains">contains</EditableText>,
  lte: <EditableText id="shelves-op-days">days (at most)</EditableText>,
};

const VALUE_LABELS: Record<string, React.ReactNode> = {
  library: <EditableText id="shelves-value-library">My library</EditableText>,
  crowdly: <EditableText id="shelves-value-crowdly">Crowdly</EditableText>,
  epub: "EPUB",
  pdf: "PDF",
  audio: <EditableText id="shelves-value-audio">Audio</EditableText>,
  text: <EditableText id="shelves-value-text">Text</EditableText>,
  story: <EditableText id="shelves-value-story">Story</EditableText>,
  screenplay: <EditableText id="shelves-value-screenplay">Screenplay</EditableText>,
  favorite: <EditableText id="shelves-value-favorite">Favorite</EditableText>,
  living: <EditableText id="shelves-value-living">Living</EditableText>,
  lived: <EditableText id="shelves-value-lived">Lived</EditableText>,
  unread: <EditableText id="shelves-value-unread">Not started</EditableText>,
  reading: <EditableText id="shelves-value-reading">In progress</EditableText>,
  finished: <EditableText id="shelves-value-finished">Finished</EditableText>,
};

const SORT_LABELS: Record<ShelfSort, React.ReactNode> = {
  manual: <EditableText id="shelves-sort-manual">My order</EditableText>,
  title: <EditableText id="shelves-sort-title">Title</EditableText>,
  added: <EditableText id="shelves-sort-added">Recently added</EditableText>,
  progress: <EditableText id="shelves-sort-progress">Reading progress</EditableText>,
  last_read: <EditableText id="shelves-sort-last-read">Recently read</EditableText>,
};

const SYSTEM_ORDER: SystemShelfKey[] = ["favorites", "living", "lived", "newest", "most_active", "most_popular"];

function defaultRule(field = "progress"): ShelfRule {
  const [op, values] = RULE_FIELDS[field];
  return { field, op, value: Array.isArray(values) ? values[0] : values === "days" ? 30 : "" };
}

interface SmartDialogProps {
  open: boolean;
  initial: { name: string; rules: ShelfRules; sort: ShelfSort } | null;
  onClose: () => void;
  onSave: (data: { name: string; rules: ShelfRules; sort: ShelfSort }) => void;
}

const SmartShelfDialog: React.FC<SmartDialogProps> = ({ open, initial, onClose, onSave }) => {
  const [name, setName] = useState("");
  const [match, setMatch] = useState<"all" | "any">("all");
  const [sort, setSort] = useState<ShelfSort>("title");
  const [rules, setRules] = useState<ShelfRule[]>([defaultRule()]);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setMatch(initial?.rules.match ?? "all");
    setSort(initial?.sort ?? "title");
    setRules(initial?.rules.rules?.length ? initial.rules.rules : [defaultRule()]);
  }, [open, initial]);

  const updateRule = (index: number, rule: ShelfRule) =>
    setRules((current) => current.map((r, i) => (i === index ? rule : r)));

  const valid = name.trim() && rules.every((r) => String(r.value).trim() !== "");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <EditableText id="shelves-smart-title">Smart shelf</EditableText>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">
            <EditableText id="shelves-smart-name">Name</EditableText>
            <Input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <EditableText id="shelves-smart-match">Show items that match</EditableText>
            <Select value={match} onValueChange={(v) => setMatch(v as "all" | "any")}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all"><EditableText id="shelves-smart-all">all of these rules</EditableText></SelectItem>
                <SelectItem value="any"><EditableText id="shelves-smart-any">any of these rules</EditableText></SelectItem>
              </SelectContent>
            </Select>
            <EditableText id="shelves-sort-by">Sort by</EditableText>
            <Select value={sort} onValueChange={(v) => setSort(v as ShelfSort)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["title", "added", "progress", "last_read"] as ShelfSort[]).map((s) => (
                  <SelectItem key={s} value={s}>{SORT_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {rules.map((rule, index) => {
            const [op, values] = RULE_FIELDS[rule.field];
            return (
              <div key={index} className="flex items-center gap-2">
                <Select value={rule.field} onValueChange={(field) => updateRule(index, defaultRule(field))}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(RULE_FIELDS).map((f) => (
                      <SelectItem key={f} value={f}>{FIELD_LABELS[f]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-gray-600 w-28">{OP_LABELS[op]}</span>
                {Array.isArray(values) ? (
                  <Select value={String(rule.value)} onValueChange={(value) => updateRule(index, { ...rule, value })}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {values.map((v) => (
                        <SelectItem key={v} value={v}>{VALUE_LABELS[v] ?? v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="w-48"
                    type={values === "days" ? "number" : "text"}
                    min={values === "days" ? 1 : undefined}
                    value={String(rule.value)}
                    onChange={(e) =>
                      updateRule(index, {
                        ...rule,
                        value: values === "days" ? Math.max(1, Number(e.target.value) || 1) : e.target.value,
                      })
                    }
                  />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={rules.length <= 1}
                  onClick={() => setRules((current) => current.filter((_, i) => i !== index))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            disabled={rules.length >= 20}
            onClick={() => setRules((current) => [...current, defaultRule()])}
          >
            <Plus className="h-4 w-4 mr-1" />
            <EditableText id="shelves-smart-add-rule">Add rule</EditableText>
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <EditableText id="shelves-smart-cancel">Cancel</EditableText>
          </Button>
          <Button disabled={!valid} onClick={() => onSave({ name: name.trim(), rules: { match, rules }, sort })}>
            <EditableText id="shelves-smart-save">Save</EditableText>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Shelves: React.FC = () => {
  const { user } = useAuth();
  const [system, setSystem] = useState<{ key: SystemShelfKey; count: number | null }[]>([]);
  const [custom, setCustom] = useState<Shelf[]>([]);
  const [current, setCurrent] = useState<string>("favorites");
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [smartOpen, setSmartOpen] = useState(false);
  const [smartEditing, setSmartEditing] = useState<Shelf | null>(null);
  const [renaming, setRenaming] = useState<Shelf | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<Shelf | null>(null);

  const currentShelf = useMemo(() => custom.find((s) => s.id === current) ?? null, [custom, current]);
  const fail = (err: unknown) =>
    toast({ title: "Shelves", description: errorMessage(err) ?? "Request failed", variant: "destructive" });

  const loadShelves = useCallback(async () => {
    try {
      const data = await listShelves();
      setSystem(data.system);
      setCustom(data.custom);
    } catch (err) {
      fail(err);
    }
  }, []);

  const loadItems = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const data = await shelfItems(key);
      setItems(data.items);
    } catch (err) {
      setItems([]);
      fail(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadShelves();
  }, [user, loadShelves]);

  useEffect(() => {
    if (user) loadItems(current);
  }, [user, current, loadItems]);

  const refresh = async (select?: string) => {
    await loadShelves();
    if (select && select !== current) setCurrent(select);
    else await loadItems(select ?? current);
  };

  const addShelf = async () => {
    if (!newName.trim()) return;
    try {
      const { shelf } = await createShelf({ name: newName.trim() });
      setNewName("");
      await refresh(shelf.id);
    } catch (err) {
      fail(err);
    }
  };

  const moveShelf = async (index: number, delta: number) => {
    const next = [...custom];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setCustom(next);
    try {
      await reorderShelves(next.map((s) => s.id));
    } catch (err) {
      fail(err);
    }
  };

  const moveItem = async (index: number, delta: number) => {
    if (!currentShelf) return;
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    try {
      await reorderShelfItems(currentShelf.id, next.map((i) => i.entry_id!).filter(Boolean));
    } catch (err) {
      fail(err);
    }
  };

  const changeSort = async (sort: ShelfSort) => {
    if (!currentShelf) return;
    try {
      await updateShelf(currentShelf.id, { sort });
      await refresh(currentShelf.id);
    } catch (err) {
      fail(err);
    }
  };

  const saveSmart = async (data: { name: string; rules: ShelfRules; sort: ShelfSort }) => {
    try {
      if (smartEditing) {
        await updateShelf(smartEditing.id, data);
        setSmartOpen(false);
        await refresh(smartEditing.id);
      } else {
        const { shelf } = await createShelf({ ...data, kind: "smart" });
        setSmartOpen(false);
        await refresh(shelf.id);
      }
    } catch (err) {
      fail(err);
    }
  };

  const itemLink = (item: ShelfItem) =>
    item.type === "story" ? `/story/${item.id}` : item.type === "screenplay" ? `/screenplay/${item.id}` : null;

  const manualOrder = currentShelf?.kind === "manual" && currentShelf.sort === "manual";

  return (
    <div className="min-h-screen flex flex-col">
      <CrowdlyHeader />
      <main className="flex-grow container mx-auto px-4 py-8">
        <EditableText id="shelves-title" as="h1" className="text-3xl font-bold text-indigo-900 mb-2">
          My shelves
        </EditableText>
        <EditableText id="shelves-intro" as="p" className="text-gray-600 mb-6">
          The same shelves as in Crowdly Discovery, the desktop app: Crowdly's lists, your own shelves and smart shelves that fill themselves.
        </EditableText>

        {!user ? (
          <p>
            <Link to="/login" className="text-blue-600 underline">
              <EditableText id="shelves-login">Log in to see your shelves.</EditableText>
            </Link>
          </p>
        ) : (
          <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
            <aside className="space-y-6">
              <section>
                <EditableText id="shelves-group-crowdly" as="h2" className="font-semibold text-gray-700 mb-2">
                  Crowdly
                </EditableText>
                <ul className="space-y-1">
                  {SYSTEM_ORDER.map((key) => {
                    const count = system.find((s) => s.key === key)?.count;
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => setCurrent(key)}
                          className={`w-full text-left px-3 py-1.5 rounded ${current === key ? "bg-indigo-100 text-indigo-900" : "hover:bg-gray-100"}`}
                        >
                          {SYSTEM_LABELS[key]}
                          {count != null && <span className="text-gray-500"> ({count})</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section>
                <EditableText id="shelves-group-mine" as="h2" className="font-semibold text-gray-700 mb-2">
                  My shelves
                </EditableText>
                <ul className="space-y-1">
                  {custom.map((shelf, index) => (
                    <li key={shelf.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setCurrent(shelf.id)}
                        className={`flex-grow text-left px-3 py-1.5 rounded truncate ${current === shelf.id ? "bg-indigo-100 text-indigo-900" : "hover:bg-gray-100"}`}
                      >
                        {shelf.kind === "smart" && <Settings2 className="inline h-3.5 w-3.5 mr-1 text-gray-500" />}
                        {shelf.name}
                        {shelf.count != null && <span className="text-gray-500"> ({shelf.count})</span>}
                      </button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => moveShelf(index, -1)}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === custom.length - 1} onClick={() => moveShelf(index, 1)}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2 mt-3">
                  <Input
                    value={newName}
                    maxLength={100}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addShelf()}
                    aria-label="New shelf name"
                  />
                  <Button onClick={addShelf} disabled={!newName.trim()}>
                    <EditableText id="shelves-new">New shelf</EditableText>
                  </Button>
                </div>
                <Button
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => {
                    setSmartEditing(null);
                    setSmartOpen(true);
                  }}
                >
                  <Settings2 className="h-4 w-4 mr-1" />
                  <EditableText id="shelves-new-smart">New smart shelf</EditableText>
                </Button>
              </section>
            </aside>

            <section>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <h2 className="text-2xl font-semibold flex-grow">
                  {currentShelf ? currentShelf.name : SYSTEM_LABELS[current as SystemShelfKey]}
                </h2>
                {currentShelf && (
                  <>
                    <Select value={currentShelf.sort} onValueChange={(v) => changeSort(v as ShelfSort)}>
                      <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(currentShelf.kind === "smart"
                          ? (["title", "added", "progress", "last_read"] as ShelfSort[])
                          : (["manual", "title", "added", "progress", "last_read"] as ShelfSort[])
                        ).map((s) => (
                          <SelectItem key={s} value={s}>{SORT_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {currentShelf.kind === "smart" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSmartEditing(currentShelf);
                          setSmartOpen(true);
                        }}
                      >
                        <Settings2 className="h-4 w-4 mr-1" />
                        <EditableText id="shelves-edit-rules">Edit rules</EditableText>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRenaming(currentShelf);
                        setRenameValue(currentShelf.name);
                      }}
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      <EditableText id="shelves-rename">Rename</EditableText>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleting(currentShelf)}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      <EditableText id="shelves-delete">Delete shelf</EditableText>
                    </Button>
                  </>
                )}
              </div>

              {currentShelf?.kind === "smart" && (
                <EditableText id="shelves-smart-hint" as="p" className="text-sm text-gray-600 mb-3">
                  This smart shelf fills itself from its rules.
                </EditableText>
              )}

              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
              ) : items.length === 0 ? (
                <EditableText id="shelves-empty" as="p" className="text-gray-600">
                  Nothing here yet. Use "Add to shelf" on a story, or on a book in Crowdly Discovery.
                </EditableText>
              ) : (
                <ul className="divide-y rounded-lg border bg-white">
                  {items.map((item, index) => {
                    const link = itemLink(item);
                    return (
                      <li key={`${item.type}:${item.id}`} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-grow min-w-0">
                          {link ? (
                            <Link to={link} className="font-medium text-indigo-800 hover:underline">
                              {item.title}
                            </Link>
                          ) : (
                            <span className="font-medium">{item.title}</span>
                          )}
                          <div className="text-sm text-gray-500 truncate">
                            {[item.subtitle, item.format?.toUpperCase()].filter(Boolean).join(" · ")}
                            {item.progress > 0 && <> · {Math.round(item.progress)}%</>}
                          </div>
                          {item.type === "library_item" && (
                            <EditableText id="shelves-library-note" as="div" className="text-xs text-gray-500">
                              In your private library - open it in Crowdly Discovery.
                            </EditableText>
                          )}
                        </div>
                        {manualOrder && (
                          <>
                            <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => moveItem(index, -1)}>
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" disabled={index === items.length - 1} onClick={() => moveItem(index, 1)}>
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {currentShelf?.kind === "manual" && item.entry_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                await removeFromShelf(currentShelf.id, item.entry_id!);
                                await refresh(currentShelf.id);
                              } catch (err) {
                                fail(err);
                              }
                            }}
                          >
                            <EditableText id="shelves-remove-item">Remove</EditableText>
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>

      <SmartShelfDialog
        open={smartOpen}
        initial={
          smartEditing && smartEditing.rules
            ? { name: smartEditing.name, rules: smartEditing.rules, sort: smartEditing.sort }
            : null
        }
        onClose={() => setSmartOpen(false)}
        onSave={saveSmart}
      />

      <Dialog open={renaming !== null} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <EditableText id="shelves-rename-title">Rename shelf</EditableText>
            </DialogTitle>
          </DialogHeader>
          <Input value={renameValue} maxLength={100} onChange={(e) => setRenameValue(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              <EditableText id="shelves-rename-cancel">Cancel</EditableText>
            </Button>
            <Button
              disabled={!renameValue.trim()}
              onClick={async () => {
                if (!renaming) return;
                try {
                  await updateShelf(renaming.id, { name: renameValue.trim() });
                  const id = renaming.id;
                  setRenaming(null);
                  await refresh(id);
                } catch (err) {
                  fail(err);
                }
              }}
            >
              <EditableText id="shelves-rename-save">Save</EditableText>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <EditableText id="shelves-delete-title">Delete this shelf?</EditableText>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <EditableText id="shelves-delete-desc">The books and stories on it are not deleted.</EditableText>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <EditableText id="shelves-delete-cancel">Cancel</EditableText>
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleting) return;
                try {
                  await deleteShelf(deleting.id);
                  setDeleting(null);
                  await refresh("favorites");
                } catch (err) {
                  fail(err);
                }
              }}
            >
              <EditableText id="shelves-delete-confirm">Delete</EditableText>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CrowdlyFooter />
    </div>
  );
};

export default Shelves;
