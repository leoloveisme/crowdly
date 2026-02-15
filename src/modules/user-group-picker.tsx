import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Search, User, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

type Grant = {
  userId?: string;
  groupId?: string;
  label: string;
  type: "user" | "group";
};

type AccessRule = {
  id: string;
  story_title_id: string;
  rule_type: string;
  grantee_user_id: string | null;
  grantee_group_id: string | null;
  user_email?: string;
  user_first_name?: string;
  user_last_name?: string;
  group_name?: string;
};

type UserResult = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
};

type GroupResult = {
  id: string;
  name: string;
  member_count: number;
  is_platform_group: boolean;
};

type Props = {
  storyTitleId: string;
  ruleType: "view" | "clone" | "export";
  open: boolean;
  onClose: () => void;
};

const ruleTypeLabels: Record<string, string> = {
  view: "Who can view this story",
  clone: "Who can clone this story",
  export: "Who can export this story",
};

export default function UserGroupPicker({ storyTitleId, ruleType, open, onClose }: Props) {
  const { user } = useAuth();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [groups, setGroups] = useState<GroupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load current access rules
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/stories/${storyTitleId}/access-rules`);
        if (res.ok) {
          const rules: AccessRule[] = await res.json();
          const filtered = rules.filter((r) => r.rule_type === ruleType);
          setGrants(
            filtered.map((r) => {
              if (r.grantee_user_id) {
                const name = [r.user_first_name, r.user_last_name].filter(Boolean).join(" ");
                return {
                  userId: r.grantee_user_id,
                  label: name || r.user_email || r.grantee_user_id,
                  type: "user" as const,
                };
              }
              return {
                groupId: r.grantee_group_id!,
                label: r.group_name || r.grantee_group_id!,
                type: "group" as const,
              };
            }),
          );
        }
      } catch (err) {
        console.error("Failed to load access rules:", err);
      }
      setLoading(false);
    })();
  }, [open, storyTitleId, ruleType]);

  // Load groups
  useEffect(() => {
    if (!open || !user?.id) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/groups?userId=${user.id}`);
        if (res.ok) setGroups(await res.json());
      } catch (err) {
        console.error("Failed to load groups:", err);
      }
    })();
  }, [open, user?.id]);

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
          setSearchResults(await res.json());
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

  const addUserGrant = (u: UserResult) => {
    if (grants.some((g) => g.userId === u.id)) return;
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
    setGrants((prev) => [...prev, { userId: u.id, label: name || u.email, type: "user" }]);
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
  };

  const addGroupGrant = (g: GroupResult) => {
    if (grants.some((gr) => gr.groupId === g.id)) return;
    setGrants((prev) => [...prev, { groupId: g.id, label: g.name, type: "group" }]);
    setShowDropdown(false);
  };

  const removeGrant = (index: number) => {
    setGrants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        ruleType,
        grants: grants.map((g) =>
          g.type === "user" ? { userId: g.userId } : { groupId: g.groupId },
        ),
      };
      const res = await fetch(`${API_BASE}/stories/${storyTitleId}/access-rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onClose();
      }
    } catch (err) {
      console.error("Failed to save access rules:", err);
    }
    setSaving(false);
  };

  // Filtered groups not yet added
  const availableGroups = groups.filter((g) => !grants.some((gr) => gr.groupId === g.id));
  // Filtered user results not yet added
  const availableUsers = searchResults.filter((u) => !grants.some((g) => g.userId === u.id));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ruleTypeLabels[ruleType] || "Access Rules"}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-gray-500 py-4">Loading...</div>
        ) : (
          <div className="space-y-4">
            {/* Current grants as chips */}
            {grants.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {grants.map((g, i) => (
                  <span
                    key={`${g.type}-${g.userId || g.groupId}`}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                      g.type === "user"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-purple-100 text-purple-800"
                    }`}
                  >
                    {g.type === "user" ? (
                      <User className="h-3 w-3" />
                    ) : (
                      <Users className="h-3 w-3" />
                    )}
                    {g.label}
                    <button
                      type="button"
                      onClick={() => removeGrant(i)}
                      className="ml-0.5 hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search input */}
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

              {/* Dropdown */}
              {showDropdown && (availableUsers.length > 0 || availableGroups.length > 0) && (
                <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {availableUsers.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50">
                        Users
                      </div>
                      {availableUsers.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
                          onClick={() => addUserGrant(u)}
                        >
                          <User className="h-3.5 w-3.5 text-gray-400" />
                          <span>
                            {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}
                          </span>
                          {u.first_name && (
                            <span className="text-xs text-gray-400 ml-auto">{u.email}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {availableGroups.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50">
                        Groups
                      </div>
                      {availableGroups.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 flex items-center gap-2"
                          onClick={() => addGroupGrant(g)}
                        >
                          <Users className="h-3.5 w-3.5 text-gray-400" />
                          <span>{g.name}</span>
                          <span className="text-xs text-gray-400 ml-auto">
                            {g.member_count} member{g.member_count !== 1 ? "s" : ""}
                            {g.is_platform_group ? " (platform)" : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
