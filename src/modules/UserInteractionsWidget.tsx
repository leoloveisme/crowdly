import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Users } from "lucide-react";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

export interface SimpleUser {
  id: string;
  email: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

interface UserInteractionsWidgetProps {
  ownerUserId: string;
  containerKey: "favorites" | "living" | "lived";
  selectedUserIds: string[];
  onChangeSelectedUserIds: (ids: string[]) => void;
}

const PAGE_SIZE = 10;

const UserInteractionsWidget: React.FC<UserInteractionsWidgetProps> = ({
  ownerUserId,
  containerKey,
  selectedUserIds,
  onChangeSelectedUserIds,
}) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Debounce search input slightly so we don't hammer the backend on every key
  // stroke.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    const fetchUsers = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (debouncedSearch) {
          params.set("q", debouncedSearch);
        }
        params.set("page", String(page));
        params.set("pageSize", String(PAGE_SIZE));

        const res = await fetch(`${API_BASE}/users/search?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("[UserInteractionsWidget] Failed to search users", {
            status: res.status,
            body,
          });
          if (!cancelled) {
            setUsers([]);
            setHasMore(false);
            setError("Failed to load users.");
          }
          return;
        }

        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        const list = Array.isArray(data.users) ? (data.users as SimpleUser[]) : [];
        setUsers(list);
        setHasMore(Boolean(data.hasMore));
      } catch (err) {
        if (!cancelled) {
          console.error("[UserInteractionsWidget] Error searching users", err);
          setUsers([]);
          setHasMore(false);
          setError("Failed to load users.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchUsers();

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, page]);

  const toggleUser = (userId: string) => {
    const exists = selectedUserIds.includes(userId);
    const next = exists
      ? selectedUserIds.filter((id) => id !== userId)
      : [...selectedUserIds, userId];
    onChangeSelectedUserIds(next);
  };

  const labelForUser = (u: SimpleUser) => {
    const baseName = u.username || [u.first_name, u.last_name].filter(Boolean).join(" ");
    if (baseName) return `${baseName} (${u.email})`;
    return u.email;
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2 mb-1">
        <Users className="h-4 w-4 text-purple-600" />
        <span className="font-medium">Selected users for this container</span>
      </div>
      <p className="text-xs text-gray-500">
        Choose which users are allowed to see this container when visibility is
        set to <span className="font-semibold">Selected users only</span>.
      </p>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by username, name, or email..."
        className="h-8 text-xs"
      />

      {error && <div className="text-xs text-red-500">{error}</div>}

      <div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-1 bg-white/80 dark:bg-slate-900/60">
        {loading && (
          <div className="text-xs text-gray-500">Loading users...</div>
        )}
        {!loading && users.length === 0 && (
          <div className="text-xs text-gray-400 italic">No users found.</div>
        )}
        {users.map((u) => (
          <label
            key={u.id}
            className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 rounded px-1 py-0.5"
          >
            <Checkbox
              checked={selectedUserIds.includes(u.id)}
              onCheckedChange={() => toggleUser(u.id)}
            />
            <span className="truncate" title={labelForUser(u)}>
              {labelForUser(u)}
            </span>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between mt-1">
        <span className="text-[11px] text-gray-500">
          Page {page}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={!hasMore || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UserInteractionsWidget;
