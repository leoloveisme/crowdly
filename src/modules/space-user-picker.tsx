import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Search, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import EditableText from "@/components/EditableText";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

type UserResult = {
  id: string;
  email: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

/** The Space row returned by PATCH /creative-spaces/:spaceId. */
export type SavedSpace = { id: string; visibility?: string | null; [key: string]: unknown };

type Props = {
  spaceId: string;
  open: boolean;
  onClose: () => void;
  /** Called with the updated Space row after the list is saved and the
   *  Space's visibility has been switched to "selected". */
  onSaved: (space: SavedSpace) => void;
};

const displayName = (u: UserResult) =>
  [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || u.email;

/**
 * "Only for selected user(s)" picker for a creative Space. Loads and replaces
 * the Space's access list (creative_space_access) and then sets the Space's
 * visibility to "selected". Users-only counterpart of user-group-picker.tsx.
 */
export default function SpaceUserPicker({ spaceId, open, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selected, setSelected] = useState<UserResult[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load the current access list
  useEffect(() => {
    if (!open) return;
    setSearchQuery("");
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/access`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setSelected(Array.isArray(data.users) ? data.users : []);
        }
      } catch (err) {
        console.error("Failed to load Space access list:", err);
      }
      setLoading(false);
    })();
  }, [open, spaceId]);

  // Debounced user search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: searchQuery });
        if (user?.id) params.set("excludeUserId", user.id);
        const res = await fetch(`${API_BASE}/users/search?${params}`);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : Array.isArray(data.users) ? data.users : [];
          setSearchResults(list);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error("User search failed:", err);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, user?.id]);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addUser = (u: UserResult) => {
    if (selected.some((s) => s.id === u.id)) return;
    setSelected((prev) => [...prev, u]);
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
  };

  const removeUser = (id: string) => {
    setSelected((prev) => prev.filter((u) => u.id !== id));
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const accessRes = await fetch(`${API_BASE}/creative-spaces/${spaceId}/access`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selected.map((u) => u.id) }),
      });
      if (!accessRes.ok) {
        const errBody = await accessRes.json().catch(() => ({}));
        toast({ title: "Error", description: errBody.error || `Failed to save (${accessRes.status})`, variant: "destructive" });
        setSaving(false);
        return;
      }
      const spaceRes = await fetch(`${API_BASE}/creative-spaces/${spaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, visibility: "selected" }),
      });
      const body = await spaceRes.json().catch(() => ({}));
      if (!spaceRes.ok) {
        toast({ title: "Error", description: body.error || `Failed to update visibility (${spaceRes.status})`, variant: "destructive" });
        setSaving(false);
        return;
      }
      onSaved(body as SavedSpace);
      onClose();
    } catch (err) {
      console.error("Failed to save Space access list:", err);
      toast({ title: "Error", description: "Network error saving access list", variant: "destructive" });
    }
    setSaving(false);
  };

  const availableUsers = searchResults.filter((u) => !selected.some((s) => s.id === u.id));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            <EditableText id="space-picker-title">Only for selected user(s)</EditableText>
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-gray-500">
          <EditableText id="space-picker-hint">
            Only you and the users listed here will be able to view this Space.
          </EditableText>
        </p>

        {loading ? (
          <div className="text-sm text-gray-500 py-4"><EditableText id="space-picker-loading">Loading...</EditableText></div>
        ) : (
          <div className="space-y-4">
            {selected.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selected.map((u) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800"
                  >
                    <User className="h-3 w-3" />
                    {displayName(u)}
                    <button
                      type="button"
                      onClick={() => removeUser(u.id)}
                      className="ml-0.5 hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-400">
                <EditableText id="space-picker-empty">No users selected yet.</EditableText>
              </div>
            )}

            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search users by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  className="pl-8"
                />
              </div>

              {showDropdown && availableUsers.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {availableUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
                      onClick={() => addUser(u)}
                    >
                      <User className="h-3.5 w-3.5 text-gray-400" />
                      <span>{displayName(u)}</span>
                      {(u.first_name || u.username) && (
                        <span className="text-xs text-gray-400 ml-auto">{u.email}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <EditableText id="space-picker-cancel">Cancel</EditableText>
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? <EditableText id="space-picker-saving">Saving...</EditableText> : <EditableText id="space-picker-save">Save</EditableText>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
