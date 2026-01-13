import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { Button } from "@/components/ui/button";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

interface CreativeSpace {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  path?: string | null;
  visibility?: string | null;
  published?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface CreativeSpaceItem {
  id: string;
  space_id: string;
  relative_path: string;
  name: string;
  kind: "folder" | "file" | string;
  mime_type?: string | null;
  size_bytes?: number | null;
  hash?: string | null;
  visibility?: string | null;
  published?: boolean | null;
  deleted?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

const CreativeSpacePage: React.FC = () => {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { user: authUser } = useAuth();

  const [space, setSpace] = useState<CreativeSpace | null>(null);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [items, setItems] = useState<CreativeSpaceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [itemsLoading, setItemsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notAuthorized, setNotAuthorized] = useState<boolean>(false);

  useEffect(() => {
    const loadSpace = async () => {
      if (!spaceId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error("[CreativeSpacePage] Failed to load space", { status: res.status, body });
          setError(body.error || "Failed to load creative space.");
          setLoading(false);
          return;
        }
        setSpace(body as CreativeSpace);
        if (authUser?.id && body.user_id && body.user_id !== authUser.id) {
          setNotAuthorized(true);
        }
      } catch (err) {
        console.error("[CreativeSpacePage] Error loading space", err);
        setError("Failed to load creative space.");
      } finally {
        setLoading(false);
      }
    };

    loadSpace();
  }, [spaceId, authUser]);

  const loadItems = async (path: string) => {
    if (!spaceId) return;
    setItemsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (path) params.set("path", path);
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/items?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage] Failed to load items", { status: res.status, body });
        setError(body.error || "Failed to load items.");
        setItems([]);
        setItemsLoading(false);
        return;
      }
      setCurrentPath(body.path || "");
      setItems(Array.isArray(body.items) ? (body.items as CreativeSpaceItem[]) : []);
    } catch (err) {
      console.error("[CreativeSpacePage] Error loading items", err);
      setError("Failed to load items.");
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  };

  useEffect(() => {
    // Load root items once space is known
    if (spaceId && space) {
      loadItems("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, space?.id]);

  const handleEnterFolder = (item: CreativeSpaceItem) => {
    const rel = item.relative_path || "";
    setCurrentPath(rel);
    loadItems(rel);
  };

  const handleBreadcrumbClick = (path: string) => {
    setCurrentPath(path);
    loadItems(path);
  };

  const handleCreateFolder = async () => {
    if (!spaceId || !authUser?.id) return;
    const name = window.prompt("Name of the new folder", "");
    if (name === null) return;
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/items/folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentPath: currentPath, name, userId: authUser.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage] Failed to create folder", { status: res.status, body });
        setError(body.error || "Failed to create folder.");
        return;
      }
      setItems((prev) => [...prev, body as CreativeSpaceItem]);
    } catch (err) {
      console.error("[CreativeSpacePage] Error creating folder", err);
      setError("Failed to create folder.");
    }
  };

  const handleDeleteItem = async (item: CreativeSpaceItem) => {
    const ok = window.confirm(`Delete ${item.name}? This cannot be undone.`);
    if (!ok) return;
    try {
      const res = await fetch(`${API_BASE}/creative-space-items/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        console.error("[CreativeSpacePage] Failed to delete item", { status: res.status, body });
        setError(body.error || "Failed to delete item.");
        return;
      }
      setItems((prev) => prev.filter((it) => it.id !== item.id));
    } catch (err) {
      console.error("[CreativeSpacePage] Error deleting item", err);
      setError("Failed to delete item.");
    }
  };

  const handleRenameItem = async (item: CreativeSpaceItem) => {
    const name = window.prompt("Rename item", item.name || "");
    if (name === null || !spaceId || !authUser?.id) return;
    try {
      const res = await fetch(`${API_BASE}/creative-space-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName: name, userId: authUser.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage] Failed to rename item", { status: res.status, body });
        setError(body.error || "Failed to rename item.");
        return;
      }
      setItems((prev) => prev.map((it) => (it.id === item.id ? (body as CreativeSpaceItem) : it)));
    } catch (err) {
      console.error("[CreativeSpacePage] Error renaming item", err);
      setError("Failed to rename item.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <CrowdlyHeader />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-gray-500">Loading creative space...</p>
        </div>
        <CrowdlyFooter />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <CrowdlyHeader />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
        <CrowdlyFooter />
      </div>
    );
  }

  if (!space) {
    return (
      <div className="min-h-screen flex flex-col">
        <CrowdlyHeader />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-gray-500">Creative space not found.</p>
        </div>
        <CrowdlyFooter />
      </div>
    );
  }

  if (notAuthorized) {
    return (
      <div className="min-h-screen flex flex-col">
        <CrowdlyHeader />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-gray-500 text-center max-w-md">
            You do not have access to this creative space.
          </p>
        </div>
        <CrowdlyFooter />
      </div>
    );
  }

  const breadcrumbs = currentPath
    ? currentPath.split("/").map((seg, index, arr) => ({
        name: seg,
        path: arr.slice(0, index + 1).join("/"),
      }))
    : [];

  return (
    <div className="min-h-screen flex flex-col">
      <CrowdlyHeader />
      <div className="container mx-auto px-4 pt-8 pb-16 flex-grow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">{space.name}</h1>
            <p className="text-xs text-gray-500">
              space_id: {space.id} · visibility: {space.visibility || "private"} ·
              {" "}
              {space.published ? "published" : "unpublished"}
            </p>
            {space.path && (
              <p className="text-xs text-gray-400 mt-1 truncate">local path: {space.path}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link to="/profile" className="text-xs text-purple-700 hover:underline">
              Back to profile
            </Link>
            {space && (
              <Link
                to={`/new-story-template?spaceId=${space.id}`}
                className="text-xs text-blue-700 hover:underline"
              >
                New story in this Space
              </Link>
            )}
            <Button size="sm" onClick={handleCreateFolder}>
              New folder
            </Button>
          </div>
        </div>

        <div className="mb-4 text-xs text-gray-600 flex items-center gap-1 flex-wrap">
          <span className="font-semibold">Path:</span>
          <button
            type="button"
            className={`hover:underline ${currentPath === "" ? "font-semibold" : ""}`}
            onClick={() => handleBreadcrumbClick("")}
          >
            /{space.name}
          </button>
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.path}>
              <span>/</span>
              <button
                type="button"
                className={`hover:underline ${idx === breadcrumbs.length - 1 ? "font-semibold" : ""}`}
                onClick={() => handleBreadcrumbClick(crumb.path)}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="border rounded-lg bg-white">
          <div className="flex items-center justify-between px-3 py-2 border-b text-xs font-semibold text-gray-600">
            <div className="flex-1">Name</div>
            <div className="w-24 text-right">Type</div>
            <div className="w-40 text-right">Updated</div>
            <div className="w-32 text-right">Actions</div>
          </div>
          {itemsLoading ? (
            <div className="px-3 py-4 text-sm text-gray-500">Loading items...</div>
          ) : items.length === 0 ? (
            <div className="px-3 py-4 text-sm text-gray-500">No items in this folder yet.</div>
          ) : (
            <ul className="divide-y text-sm">
              {items.map((item) => (
                <li key={item.id} className="flex items-center px-3 py-2 gap-2">
                  <div className="flex-1 truncate">
                    {item.kind === "folder" ? (
                      <button
                        type="button"
                        className="text-purple-700 hover:underline truncate"
                        onClick={() => handleEnterFolder(item)}
                      >
                        {item.name}
                      </button>
                    ) : (
                      <span className="truncate">{item.name}</span>
                    )}
                  </div>
                  <div className="w-24 text-right text-xs text-gray-500">{item.kind}</div>
                  <div className="w-40 text-right text-xs text-gray-500">
                    {item.updated_at ? new Date(item.updated_at).toLocaleString() : ""}
                  </div>
                  <div className="w-32 text-right flex justify-end gap-2 text-xs">
                    <button
                      type="button"
                      className="text-gray-500 hover:text-gray-700"
                      onClick={() => handleRenameItem(item)}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="text-red-600 hover:text-red-800"
                      onClick={() => handleDeleteItem(item)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <CrowdlyFooter />
    </div>
  );
};

export default CreativeSpacePage;