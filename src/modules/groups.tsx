import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Trash2, Plus, ChevronDown, ChevronUp, X, Search, User } from "lucide-react";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

type Group = {
  id: string;
  name: string;
  owner_id: string;
  is_platform_group: boolean;
  member_count: number;
  created_at: string;
};

type Member = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  added_at: string;
};

type UserResult = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
};

type Props = {
  userId: string;
  showPlatformGroups?: boolean;
};

export default function GroupsManager({ userId, showPlatformGroups }: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGroupName, setNewGroupName] = useState("");
  const [isPlatformGroup, setIsPlatformGroup] = useState(false);
  const [creating, setCreating] = useState(false);

  // Expanded group state
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Add member search
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<UserResult[]>([]);
  const [memberSearchDebounce, setMemberSearchDebounce] = useState<ReturnType<typeof setTimeout>>();

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/groups?userId=${userId}`);
      if (res.ok) setGroups(await res.json());
    } catch (err) {
      console.error("Failed to fetch groups:", err);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          name: newGroupName.trim(),
          isPlatformGroup: showPlatformGroups ? isPlatformGroup : false,
        }),
      });
      if (res.ok) {
        setNewGroupName("");
        setIsPlatformGroup(false);
        fetchGroups();
      }
    } catch (err) {
      console.error("Failed to create group:", err);
    }
    setCreating(false);
  };

  const deleteGroup = async (groupId: string) => {
    if (!window.confirm("Delete this group? This cannot be undone.")) return;
    try {
      const res = await fetch(`${API_BASE}/groups/${groupId}?userId=${userId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (expandedGroupId === groupId) setExpandedGroupId(null);
        fetchGroups();
      }
    } catch (err) {
      console.error("Failed to delete group:", err);
    }
  };

  const toggleExpand = async (groupId: string) => {
    if (expandedGroupId === groupId) {
      setExpandedGroupId(null);
      return;
    }
    setExpandedGroupId(groupId);
    setMembersLoading(true);
    setMemberSearch("");
    setMemberSearchResults([]);
    try {
      const res = await fetch(`${API_BASE}/groups/${groupId}/members`);
      if (res.ok) setMembers(await res.json());
    } catch (err) {
      console.error("Failed to fetch members:", err);
    }
    setMembersLoading(false);
  };

  const addMember = async (memberId: string) => {
    if (!expandedGroupId) return;
    try {
      const res = await fetch(`${API_BASE}/groups/${expandedGroupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      if (res.ok) {
        // Reload members
        const mRes = await fetch(`${API_BASE}/groups/${expandedGroupId}/members`);
        if (mRes.ok) setMembers(await mRes.json());
        setMemberSearch("");
        setMemberSearchResults([]);
        fetchGroups(); // refresh count
      }
    } catch (err) {
      console.error("Failed to add member:", err);
    }
  };

  const removeMember = async (memberId: string) => {
    if (!expandedGroupId) return;
    try {
      const res = await fetch(`${API_BASE}/groups/${expandedGroupId}/members/${memberId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
        fetchGroups(); // refresh count
      }
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  };

  // Debounced member search
  useEffect(() => {
    if (memberSearchDebounce) clearTimeout(memberSearchDebounce);
    if (!memberSearch.trim()) {
      setMemberSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: memberSearch, excludeUserId: userId });
        const res = await fetch(`${API_BASE}/users/search?${params}`);
        if (res.ok) setMemberSearchResults(await res.json());
      } catch (err) {
        console.error("Member search failed:", err);
      }
    }, 300);
    setMemberSearchDebounce(timer);
    return () => clearTimeout(timer);
  }, [memberSearch, userId]);

  return (
    <div className="space-y-4">
      {/* Create group form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-4 w-4" /> Create New Group
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Group name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createGroup()}
              className="flex-1"
            />
            {showPlatformGroups && (
              <label className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={isPlatformGroup}
                  onChange={(e) => setIsPlatformGroup(e.target.checked)}
                />
                Platform group
              </label>
            )}
            <Button onClick={createGroup} disabled={creating || !newGroupName.trim()} size="sm">
              {creating ? "Creating..." : "Create"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Groups list */}
      {loading ? (
        <div className="text-sm text-gray-500">Loading groups...</div>
      ) : groups.length === 0 ? (
        <div className="text-sm text-gray-400">No groups yet.</div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <Card key={group.id}>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-left flex-1"
                    onClick={() => toggleExpand(group.id)}
                  >
                    <Users className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">{group.name}</span>
                    <span className="text-xs text-gray-400">
                      ({group.member_count} member{group.member_count !== 1 ? "s" : ""})
                    </span>
                    {group.is_platform_group && (
                      <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                        Platform
                      </span>
                    )}
                    {expandedGroupId === group.id ? (
                      <ChevronUp className="h-4 w-4 text-gray-400 ml-auto" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400 ml-auto" />
                    )}
                  </button>
                  {(group.owner_id === userId || showPlatformGroups) && (
                    <button
                      type="button"
                      onClick={() => deleteGroup(group.id)}
                      className="ml-2 p-1 text-gray-400 hover:text-red-500"
                      title="Delete group"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Expanded: members */}
                {expandedGroupId === group.id && (
                  <div className="mt-3 border-t pt-3 space-y-3">
                    {membersLoading ? (
                      <div className="text-xs text-gray-500">Loading members...</div>
                    ) : (
                      <>
                        {members.length === 0 ? (
                          <div className="text-xs text-gray-400">No members yet.</div>
                        ) : (
                          <div className="space-y-1">
                            {members.map((m) => (
                              <div
                                key={m.id}
                                className="flex items-center justify-between text-sm py-1"
                              >
                                <div className="flex items-center gap-2">
                                  <User className="h-3.5 w-3.5 text-gray-400" />
                                  <span>
                                    {[m.first_name, m.last_name].filter(Boolean).join(" ") || m.email}
                                  </span>
                                  {m.first_name && (
                                    <span className="text-xs text-gray-400">{m.email}</span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeMember(m.id)}
                                  className="p-0.5 text-gray-400 hover:text-red-500"
                                  title="Remove member"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add member search */}
                        <div className="relative">
                          <div className="relative">
                            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-gray-400" />
                            <Input
                              placeholder="Add member by name or email..."
                              value={memberSearch}
                              onChange={(e) => setMemberSearch(e.target.value)}
                              className="pl-7 h-8 text-sm"
                            />
                          </div>
                          {memberSearchResults.length > 0 && (
                            <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-40 overflow-y-auto">
                              {memberSearchResults
                                .filter((u) => !members.some((m) => m.id === u.id))
                                .map((u) => (
                                  <button
                                    key={u.id}
                                    type="button"
                                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 flex items-center gap-2"
                                    onClick={() => addMember(u.id)}
                                  >
                                    <User className="h-3 w-3 text-gray-400" />
                                    {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}
                                    {u.first_name && (
                                      <span className="text-xs text-gray-400 ml-auto">{u.email}</span>
                                    )}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
