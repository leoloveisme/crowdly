import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookText, Clapperboard, Images, Headphones, FileText, BookOpen, MoreVertical, Heart } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import EditableText from "@/components/EditableText";
import { toast } from "@/hooks/use-toast";
import { addToShelf, libraryCoverUrl, listShelves, setStoryStatus, type Shelf, type ShelfItem } from "@web/lib/discovery";
import { mediaUrl } from "@web/lib/api";

export const readerPath = (i: Pick<ShelfItem, "type" | "id">) => `/read/${i.type === "library_item" ? "library" : i.type}/${i.id}`;

const ICONS: Record<string, React.ReactNode> = {
  story: <BookText className="h-8 w-8" />,
  screenplay: <Clapperboard className="h-8 w-8" />,
  comic: <Images className="h-8 w-8" />,
  audio: <Headphones className="h-8 w-8" />,
  pdf: <FileText className="h-8 w-8" />,
  epub: <BookOpen className="h-8 w-8" />,
  text: <FileText className="h-8 w-8" />,
};

let shelvesCache: Promise<Shelf[]> | null = null;
const manualShelves = () => (shelvesCache ??= listShelves().then((r) => r.custom.filter((s) => s.kind === "manual")).catch(() => []));
export const invalidateShelvesCache = () => {
  shelvesCache = null;
};

// One tile in a Discovery grid: cover (or a format icon), title, progress,
// and a menu to add it to a shelf or mark it as a favorite.
export const ItemCard: React.FC<{ item: ShelfItem; onRemove?: () => void; draggable?: boolean; onDragStart?: () => void; onDrop?: () => void }> = ({ item, onRemove, ...drag }) => {
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) manualShelves().then(setShelves);
  }, [open]);

  const cover = item.cover_url ? mediaUrl(item.cover_url) : item.type === "library_item" ? libraryCoverUrl(item.id) : null;
  const [coverOk, setCoverOk] = useState(true);
  const kind = item.type === "library_item" ? (item.format ?? "text") : item.type;

  return (
    <div className="group relative" draggable={drag.draggable} onDragStart={drag.onDragStart} onDragOver={(e) => drag.onDrop && e.preventDefault()} onDrop={drag.onDrop}>
      <Link to={readerPath(item)} className="block">
        <div className="relative flex aspect-[2/3] items-center justify-center overflow-hidden rounded-md border bg-gradient-to-br from-muted to-muted/40 text-muted-foreground">
          {cover && coverOk ? <img src={cover} alt="" className="h-full w-full object-cover" onError={() => setCoverOk(false)} loading="lazy" /> : ICONS[kind] ?? ICONS.story}
          {item.progress ? <span className="absolute bottom-0 left-0 h-1 bg-primary" style={{ width: `${Math.min(100, item.progress)}%` }} /> : null}
          {item.status?.favorite && <Heart className="absolute right-1.5 top-1.5 h-4 w-4 fill-rose-500 text-rose-500" />}
        </div>
        <p className="mt-1 line-clamp-2 text-sm font-medium leading-tight">{item.title || "Untitled"}</p>
        {(item.author || item.subtitle) && <p className="line-clamp-1 text-xs text-muted-foreground">{item.author || item.subtitle}</p>}
      </Link>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button className="absolute right-1 top-1 rounded bg-background/80 p-1 opacity-0 group-hover:opacity-100 max-md:opacity-100" aria-label="More">
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {item.type !== "library_item" && (
            <DropdownMenuItem
              onSelect={() =>
                setStoryStatus(item.type as "story" | "screenplay" | "comic", item.id, { isFavorite: !item.status?.favorite })
                  .then(() => toast({ title: item.status?.favorite ? "Removed from favorites" : "Added to favorites" }))
                  .catch((e) => toast({ title: (e as Error).message, variant: "destructive" }))
              }
            >
              {item.status?.favorite ? <EditableText id="webapp-item-unfavorite">Remove from favorites</EditableText> : <EditableText id="webapp-item-favorite">Add to favorites</EditableText>}
            </DropdownMenuItem>
          )}
          <DropdownMenuLabel>
            <EditableText id="webapp-item-add-to-shelf">Add to shelf</EditableText>
          </DropdownMenuLabel>
          {shelves.length === 0 && (
            <DropdownMenuItem disabled>
              <EditableText id="webapp-item-no-shelves">No shelves yet</EditableText>
            </DropdownMenuItem>
          )}
          {shelves.map((s) => (
            <DropdownMenuItem
              key={s.id}
              onSelect={() =>
                addToShelf(s.id, item.type, item.id)
                  .then(() => toast({ title: `Added to ${s.name}` }))
                  .catch((e) => toast({ title: (e as Error).message, variant: "destructive" }))
              }
            >
              {s.name}
            </DropdownMenuItem>
          ))}
          {onRemove && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onSelect={onRemove}>
                <EditableText id="webapp-item-remove">Remove</EditableText>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export const ItemGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">{children}</div>
);
