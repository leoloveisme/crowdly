import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
  const navigate = useNavigate();

  const [space, setSpace] = useState<CreativeSpace | null>(null);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [items, setItems] = useState<CreativeSpaceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [itemsLoading, setItemsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notAuthorized, setNotAuthorized] = useState<boolean>(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const isOwner = Boolean(authUser?.id && space && space.user_id === authUser.id);

  useEffect(() => {
    const loadSpace = async () => {
      if (!spaceId) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (authUser?.id) {
          params.set("userId", authUser.id);
        }
        const url = params.toString()
          ? `${API_BASE}/creative-spaces/${spaceId}?${params.toString()}`
          : `${API_BASE}/creative-spaces/${spaceId}`;
        const res = await fetch(url);
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
      if (authUser?.id) {
        params.set("userId", authUser.id);
      }
      const url = params.toString()
        ? `${API_BASE}/creative-spaces/${spaceId}/items?${params.toString()}`
        : `${API_BASE}/creative-spaces/${spaceId}/items`;
      const res = await fetch(url);
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

  const handleToggleVisibility = async () => {
    if (!spaceId || !authUser?.id || !space) return;
    const current = (space.visibility || "private").toLowerCase();
    const next = current === "public" ? "private" : "public";
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authUser.id, visibility: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage] Failed to toggle visibility", { status: res.status, body });
        setError(body.error || "Failed to update visibility.");
        return;
      }
      setSpace(body as CreativeSpace);
    } catch (err) {
      console.error("[CreativeSpacePage] Error toggling visibility", err);
      setError("Failed to update visibility.");
    }
  };

  const handleTogglePublished = async () => {
    if (!spaceId || !authUser?.id || !space) return;
    const next = !Boolean(space.published);
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authUser.id, published: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage] Failed to toggle published", { status: res.status, body });
        setError(body.error || "Failed to update publish state.");
        return;
      }
      setSpace(body as CreativeSpace);
    } catch (err) {
      console.error("[CreativeSpacePage] Error toggling published", err);
      setError("Failed to update publish state.");
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
    <div className="min-h-screen flex flex-col bg-slate-50">
      <CrowdlyHeader />
      <div className="container mx-auto px-4 pt-8 pb-16 flex-grow max-w-5xl space-y-6">
        <div className="text-xs mb-2">
          <Link to="/profile" className="text-blue-700 hover:underline">
            ← Back to profile page
          </Link>
        </div>
        <section className="bg-white/90 backdrop-blur border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold text-slate-900 break-words">{space.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-medium">space_id:</span>
                <span className="break-all">{space.id}</span>
                <span className="text-slate-300">•</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] ${
                    space.visibility === "public"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {space.visibility === "public" ? "Public" : "Private"}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] ${
                    space.published ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {space.published ? "Published" : "Unpublished"}
                </span>
              </div>
              {space.path && (
                <p className="mt-2 text-xs text-slate-400 truncate">local path: {space.path}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              {isOwner && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleToggleVisibility}
                    className="rounded-full px-3 text-xs"
                  >
                    {space.visibility === "public" ? "Make private" : "Make public"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleTogglePublished}
                    className="rounded-full px-3 text-xs"
                  >
                    {space.published ? "Unpublish" : "Publish"}
                  </Button>
                </>
              )}
              {space && (
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="text-xs text-blue-700 hover:underline"
                    >
                      New story in this Space
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>What would you like to create in this Space?</DialogTitle>
                    </DialogHeader>
                    <div className="mt-4 flex flex-col gap-3 text-sm">
                      <button
                        type="button"
                        className="w-full px-4 py-2 rounded border bg-white hover:bg-slate-50 text-left"
                        onClick={() => {
                          setCreateDialogOpen(false);
                          navigate(`/new-story-template?type=story&spaceId=${space.id}`);
                        }}
                      >
                        Regular story (novel)
                      </button>
                      <button
                        type="button"
                        className="w-full px-4 py-2 rounded border bg-white hover:bg-slate-50 text-left"
                        onClick={() => {
                          setCreateDialogOpen(false);
                          navigate(`/new-story-template?type=screenplay&spaceId=${space.id}`);
                        }}
                      >
                        Screenplay story
                      </button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              <Button size="sm" onClick={handleCreateFolder} className="rounded-full px-3">
                New folder
              </Button>
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-4 md:p-6 shadow-sm">
          <div className="mb-4 text-xs text-slate-600 flex items-center gap-1 flex-wrap">
            <span className="font-semibold">Path:</span>
            <button
              type="button"
              className={`hover:underline ${currentPath === "" ? "font-semibold text-slate-900" : ""}`}
              onClick={() => handleBreadcrumbClick("")}
            >
              /{space.name}
            </button>
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.path}>
                <span className="text-slate-300">/</span>
                <button
                  type="button"
                  className={`hover:underline ${idx === breadcrumbs.length - 1 ? "font-semibold text-slate-900" : ""}`}
                  onClick={() => handleBreadcrumbClick(crumb.path)}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-50 text-xs font-semibold text-slate-600">
              <div className="flex-1">Name</div>
              <div className="w-24 text-right">Type</div>
              <div className="w-40 text-right">Updated</div>
              <div className="w-32 text-right">Actions</div>
            </div>
            {itemsLoading ? (
              <div className="px-4 py-4 text-sm text-slate-500">Loading items...</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-500">
                No items in this folder yet.
              </div>
            ) : (
              <ul className="divide-y text-sm">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center px-4 py-3 gap-2 hover:bg-slate-50 transition"
                  >
                    <div className="flex-1 min-w-0">
                      {item.kind === "folder" ? (
                        <button
                          type="button"
                          className="text-purple-700 hover:underline truncate font-medium"
                          onClick={() => handleEnterFolder(item)}
                        >
                          {item.name}
                        </button>
                      ) : (
                        <span className="truncate">{item.name}</span>
                      )}
                    </div>
                    <div className="w-24 text-right text-[11px] text-slate-500">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5">
                        {item.kind}
                      </span>
                    </div>
                    <div className="w-40 text-right text-xs text-slate-500">
                      {item.updated_at ? new Date(item.updated_at).toLocaleString() : ""}
                    </div>
                    <div className="w-32 text-right flex justify-end gap-3 text-xs">
                      <button
                        type="button"
                        className="text-slate-500 hover:text-slate-700"
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
        </section>
      </div>
      <CrowdlyFooter />
    </div>
  );
};

export default CreativeSpacePage;