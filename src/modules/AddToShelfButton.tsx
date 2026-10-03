import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Library, Loader2 } from "lucide-react";
import EditableText from "@/components/EditableText";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/apiBase";
import {
  addToShelf,
  createShelf,
  removeFromShelf,
  shelfMembership,
  type ShelfItemType,
} from "@/lib/shelvesApi";

interface Props {
  type: Extract<ShelfItemType, "story" | "screenplay">;
  id: string;
}

/**
 * "Add to shelf" dropdown: the user's manual shelves as checkboxes plus
 * "New shelf…" (same shelves as /shelves and Crowdly Discovery).
 */
const AddToShelfButton: React.FC<Props> = ({ type, id }) => {
  const [shelves, setShelves] = useState<{ id: string; name: string; contains: boolean }[] | null>(null);
  const [newName, setNewName] = useState("");

  const fail = (err: unknown) =>
    toast({ title: "Shelves", description: errorMessage(err) ?? "Request failed", variant: "destructive" });

  const load = async () => {
    try {
      const data = await shelfMembership(type, id);
      setShelves(data.shelves);
    } catch (err) {
      setShelves([]);
      fail(err);
    }
  };

  const toggle = async (shelfId: string, on: boolean) => {
    setShelves((current) => current?.map((s) => (s.id === shelfId ? { ...s, contains: on } : s)) ?? null);
    try {
      if (on) await addToShelf(shelfId, type, id);
      else await removeFromShelf(shelfId, id, type);
    } catch (err) {
      fail(err);
      load();
    }
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const { shelf } = await createShelf({ name });
      await addToShelf(shelf.id, type, id);
      setNewName("");
      await load();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <DropdownMenu onOpenChange={(open) => open && load()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1">
          <Library className="h-4 w-4" />
          <EditableText id="addshelf-button">Add to shelf</EditableText>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel>
          <EditableText id="addshelf-label">My shelves</EditableText>
        </DropdownMenuLabel>
        {shelves === null ? (
          <DropdownMenuItem disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
          </DropdownMenuItem>
        ) : shelves.length === 0 ? (
          <DropdownMenuItem disabled>
            <EditableText id="addshelf-none">No shelves yet</EditableText>
          </DropdownMenuItem>
        ) : (
          shelves.map((shelf) => (
            <DropdownMenuCheckboxItem
              key={shelf.id}
              checked={shelf.contains}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(on) => toggle(shelf.id, Boolean(on))}
            >
              {shelf.name}
            </DropdownMenuCheckboxItem>
          ))
        )}
        <DropdownMenuSeparator />
        <div className="flex gap-1 px-2 py-1" onKeyDown={(e) => e.stopPropagation()}>
          <input
            className="min-w-0 flex-grow rounded border px-2 py-1 text-sm"
            value={newName}
            maxLength={100}
            aria-label="New shelf name"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <Button size="sm" variant="outline" className="shrink-0" disabled={!newName.trim()} onClick={create}>
            <EditableText id="addshelf-new">New shelf</EditableText>
          </Button>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/shelves">
            <EditableText id="addshelf-open">Open my shelves</EditableText>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AddToShelfButton;
