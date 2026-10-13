import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useTabTitle } from "@web/shell/workspace";
import { askConfirm } from "@web/shell/ask";
import { LIBRARY_ACCEPT, deleteLibraryItem, importToLibrary, listLibrary } from "@web/lib/discovery";
import { ItemCard, ItemGrid } from "./ItemCard";

// My library (desktop: Discovery → My Library): import EPUB, PDF, text /
// Markdown and audio books, refusing DRM-protected files. Files stay
// private to the account (backend/src/library.js).
const RIGHTS = [
  ["personal_copy", "webapp-lib-rights-personal", "A copy I own, for my own reading"],
  ["own_work", "webapp-lib-rights-own", "My own work"],
  ["public_domain", "webapp-lib-rights-pd", "Public domain"],
  ["cc_licensed", "webapp-lib-rights-cc", "Creative Commons"],
] as const;

const LibraryPage: React.FC = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [rights, setRights] = useState<string>("personal_copy");
  const [busy, setBusy] = useState(false);
  useTabTitle("/library", "My library");

  const { data: items = [], isLoading } = useQuery({ queryKey: ["library", user?.id], queryFn: listLibrary, enabled: !!user });

  const upload = async (files: FileList | File[]) => {
    setBusy(true);
    for (const f of Array.from(files)) {
      try {
        await importToLibrary(f, rights);
        toast({ title: `Added “${f.name}”` });
      } catch (err) {
        toast({ title: `Couldn't add ${f.name}`, description: (err as Error).message, variant: "destructive" });
      }
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["library"] });
  };

  if (!user)
    return (
      <EditableText id="webapp-lib-login" as="p" className="p-6 text-muted-foreground">
        Log in to use your library.
      </EditableText>
    );

  return (
    <div
      className="mx-auto max-w-7xl space-y-4 p-3 sm:p-6"
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <EditableText id="webapp-lib-title" as="h1" className="mr-auto text-2xl font-semibold">
          My library
        </EditableText>
        <select value={rights} onChange={(e) => setRights(e.target.value)} className="h-9 rounded border bg-background px-2 text-sm" aria-label="What is this book?">
          {RIGHTS.map(([v, , label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <input ref={input} type="file" multiple accept={LIBRARY_ACCEPT} className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
        <Button onClick={() => input.current?.click()} disabled={busy} className="gap-1">
          <Upload className="h-4 w-4" />
          <EditableText id="webapp-lib-add">Add books…</EditableText>
        </Button>
      </div>
      <EditableText id="webapp-lib-privacy" as="p" className="text-sm text-muted-foreground">
        Books you add stay private to your account. DRM-protected books can't be added.
      </EditableText>
      {!isLoading && items.length === 0 && (
        <EditableText id="webapp-lib-empty" as="p" className="text-muted-foreground">
          Your library is empty. Add EPUB, PDF, text or audio books, or drop them here.
        </EditableText>
      )}
      <ItemGrid>
        {items.map((i) => (
          <ItemCard
            key={i.id}
            item={{ type: i.kind === "crowdly_story" && i.story_title_id ? "story" : "library_item", id: i.kind === "crowdly_story" && i.story_title_id ? i.story_title_id : i.id, title: i.title, author: i.author ?? "", format: i.format }}
            onRemove={async () => {
              if (!(await askConfirm(`Remove “${i.title}” from your library?`))) return;
              await deleteLibraryItem(i.id).catch((e) => toast({ title: (e as Error).message, variant: "destructive" }));
              qc.invalidateQueries({ queryKey: ["library"] });
            }}
          />
        ))}
      </ItemGrid>
    </div>
  );
};

export default LibraryPage;
