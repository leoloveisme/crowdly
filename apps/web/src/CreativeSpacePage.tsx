import React, { useEffect, useState } from "react";
import Header, { InterfaceLanguage } from "./Header";

// Use the same API base convention as the rest of the web app so that
// it works both on localhost and on mobile devices over LAN.
const API_BASE =
  import.meta.env.VITE_API_BASE_URL ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : "http://localhost:4000");

type AuthUser = {
  id: string;
  email: string;
  roles?: string[];
};

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
  const [interfaceLanguage, setInterfaceLanguage] = useState<InterfaceLanguage>("english");
  const [greeting] = useState("Welcome");
  const [wish] = useState("Have a great day");

  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("crowdly_auth_user") : null;
      if (!raw) return null;
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  });

  const [spaceId] = useState<string | null>(() => {
    const match = typeof window !== "undefined" ? window.location.pathname.match(/^\/creative_space\/(.+)$/) : null;
    return match ? decodeURIComponent(match[1]) : null;
  });

  const [space, setSpace] = useState<CreativeSpace | null>(null);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [items, setItems] = useState<CreativeSpaceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [itemsLoading, setItemsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notAuthorized, setNotAuthorized] = useState<boolean>(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const isLoggedIn = !!authUser;
  const isOwner = Boolean(authUser?.id && space && space.user_id === authUser.id);
  const username = authUser?.email || "Guest";

  useEffect(() => {
    const loadSpace = async () => {
      if (!spaceId) {
        setError("No space id in URL.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (authUser?.id) {
          params.set("userId", authUser.id);
        }
        const url = params.toString()
          ? `${API_BASE}/creative-spaces/${encodeURIComponent(spaceId)}?${params.toString()}`
          : `${API_BASE}/creative-spaces/${encodeURIComponent(spaceId)}`;
        const res = await fetch(url);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error("[CreativeSpacePage:web] Failed to load space", { status: res.status, body });
          setError(body.error || "Failed to load creative space.");
          setLoading(false);
          return;
        }
        setSpace(body as CreativeSpace);
        if (authUser?.id && (body as CreativeSpace).user_id && (body as CreativeSpace).user_id !== authUser.id) {
          setNotAuthorized(true);
        }
      } catch (err) {
        console.error("[CreativeSpacePage:web] Error loading space", err);
        setError("Failed to load creative space.");
      } finally {
        setLoading(false);
      }
    };

    void loadSpace();
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
        ? `${API_BASE}/creative-spaces/${encodeURIComponent(spaceId)}/items?${params.toString()}`
        : `${API_BASE}/creative-spaces/${encodeURIComponent(spaceId)}/items`;
      const res = await fetch(url);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage:web] Failed to load items", { status: res.status, body });
        setError(body.error || "Failed to load items.");
        setItems([]);
        setItemsLoading(false);
        return;
      }
      setCurrentPath((body as any).path || "");
      setItems(Array.isArray((body as any).items) ? ((body as any).items as CreativeSpaceItem[]) : []);
    } catch (err) {
      console.error("[CreativeSpacePage:web] Error loading items", err);
      setError("Failed to load items.");
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  };

  useEffect(() => {
    if (spaceId && space && !notAuthorized) {
      void loadItems("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, space?.id, notAuthorized]);

  const handleEnterFolder = (item: CreativeSpaceItem) => {
    const rel = item.relative_path || "";
    setCurrentPath(rel);
    void loadItems(rel);
  };

  const handleBreadcrumbClick = (path: string) => {
    setCurrentPath(path);
    void loadItems(path);
  };

  const handleCreateFolder = async () => {
    if (!spaceId || !authUser?.id) return;
    const name = window.prompt("Name of the new folder", "");
    if (name === null) return;
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${encodeURIComponent(spaceId)}/items/folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentPath: currentPath, name, userId: authUser.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage:web] Failed to create folder", { status: res.status, body });
        setError(body.error || "Failed to create folder.");
        return;
      }
      setItems((prev) => [...prev, body as CreativeSpaceItem]);
    } catch (err) {
      console.error("[CreativeSpacePage:web] Error creating folder", err);
      setError("Failed to create folder.");
    }
  };

  const handleDeleteItem = async (item: CreativeSpaceItem) => {
    const ok = window.confirm(`Delete ${item.name}? This cannot be undone.`);
    if (!ok) return;
    try {
      const res = await fetch(`${API_BASE}/creative-space-items/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        console.error("[CreativeSpacePage:web] Failed to delete item", { status: res.status, body });
        setError(body.error || "Failed to delete item.");
        return;
      }
      setItems((prev) => prev.filter((it) => it.id !== item.id));
    } catch (err) {
      console.error("[CreativeSpacePage:web] Error deleting item", err);
      setError("Failed to delete item.");
    }
  };

  const handleRenameItem = async (item: CreativeSpaceItem) => {
    const name = window.prompt("Rename item", item.name || "");
    if (name === null || !spaceId || !authUser?.id) return;
    try {
      const res = await fetch(`${API_BASE}/creative-space-items/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName: name, userId: authUser.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage:web] Failed to rename item", { status: res.status, body });
        setError(body.error || "Failed to rename item.");
        return;
      }
      setItems((prev) => prev.map((it) => (it.id === item.id ? (body as CreativeSpaceItem) : it)));
    } catch (err) {
      console.error("[CreativeSpacePage:web] Error renaming item", err);
      setError("Failed to rename item.");
    }
  };

  const createStoryInSpace = (kind: "story" | "screenplay") => {
    if (!space) return;
    if (typeof window === "undefined") return;
    const base = `${window.location.protocol}//${window.location.hostname}:8080`;
    const url = `${base}/new-story-template?type=${encodeURIComponent(kind)}&spaceId=${encodeURIComponent(
      space.id,
    )}`;
    window.location.href = url;
  };

  const handleToggleVisibility = async () => {
    if (!spaceId || !authUser?.id || !space) return;
    const current = (space.visibility || "private").toLowerCase();
    const next = current === "public" ? "private" : "public";
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${encodeURIComponent(spaceId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authUser.id, visibility: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage:web] Failed to toggle visibility", { status: res.status, body });
        setError(body.error || "Failed to update visibility.");
        return;
      }
      setSpace(body as CreativeSpace);
    } catch (err) {
      console.error("[CreativeSpacePage:web] Error toggling visibility", err);
      setError("Failed to update visibility.");
    }
  };

  const handleTogglePublished = async () => {
    if (!spaceId || !authUser?.id || !space) return;
    const next = !Boolean(space.published);
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${encodeURIComponent(spaceId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authUser.id, published: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage:web] Failed to toggle published", { status: res.status, body });
        setError(body.error || "Failed to update publish state.");
        return;
      }
      setSpace(body as CreativeSpace);
    } catch (err) {
      console.error("[CreativeSpacePage:web] Error toggling published", err);
      setError("Failed to update publish state.");
    }
  };

  const handleLanguageChange = (lang: InterfaceLanguage) => {
    setInterfaceLanguage(lang);
  };

  const openLogin = () => {
    // Reuse existing auth popup on the landing page.
    window.location.href = "/";
  };

  const logout = () => {
    try {
      localStorage.removeItem("crowdly_auth_user");
    } catch {
      // ignore
    }
    setAuthUser(null);
    window.location.href = "/";
  };

  const profileUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:8080/profile`
      : "http://localhost:8080/profile";

  const newStoryUrl =
    typeof window !== "undefined" && space
      ? `${window.location.protocol}//${window.location.hostname}:8080/new-story-template?spaceId=${encodeURIComponent(
          space.id,
        )}`
      : undefined;

  const breadcrumbs = currentPath
    ? currentPath.split("/").map((seg, index, arr) => ({
        name: seg,
        path: arr.slice(0, index + 1).join("/"),
      }))
    : [];

  return (
    <div className="page">
      <Header
        language={interfaceLanguage}
        onLanguageChange={handleLanguageChange}
        greeting={greeting}
        username={username}
        wish={wish}
        isLoggedIn={isLoggedIn}
        onLoginClick={openLogin}
        onLogoutClick={logout}
        onRegisterClick={openLogin}
      />

      {/* Match the main Crowdly creative space layout: centered container with
          horizontal padding and vertical spacing. */}
      <main className="container mx-auto px-4 pt-8 pb-16">
        <div className="mb-4 text-xs text-gray-500">
          <a
            href={profileUrl}
            className="text-blue-700 hover:underline"
          >
            ← Back to profile page
          </a>
        </div>
        {loading && (
          <div className="border rounded-lg bg-white p-4 text-sm text-gray-500">Loading creative space...</div>
        )}

        {!loading && error && (
          <div className="border rounded-lg bg-white p-4 text-sm text-red-600 space-y-2 mt-4">
            <div>{error}</div>
            <button
              type="button"
              onClick={() => (window.location.href = "/")}
              className="px-3 py-1 text-xs rounded-full border border-gray-300 hover:bg-gray-50"
            >
              Back to main page
            </button>
          </div>
        )}

        {!loading && !error && !space && !notAuthorized && (
          <div className="border rounded-lg bg-white p-4 text-sm text-gray-500 mt-4">
            Creative space not found.
          </div>
        )}

        {!loading && notAuthorized && (
          <div className="border rounded-lg bg-white p-4 text-sm text-gray-500 mt-4">
            You do not have access to this creative space.
          </div>
        )}

        {!loading && !error && space && !notAuthorized && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold mb-1">{space.name}</h1>
                <p className="text-xs text-gray-500">
                  space_id: {space.id} · visibility: {space.visibility || "private"} ·{" "}
                  {space.published ? "published" : "unpublished"}
                </p>
                {space.path && (
                  <p className="text-xs text-gray-400 mt-1 truncate">local path: {space.path}</p>
                )}
              </div>
            <div className="flex items-center gap-2 relative">
              {isOwner && (
                <>
                  <button
                    type="button"
                    onClick={handleToggleVisibility}
                    className="px-3 py-1 rounded-full border text-xs hover:bg-gray-50"
                  >
                    {space.visibility === "public" ? "Make private" : "Make public"}
                  </button>
                  <button
                    type="button"
                    onClick={handleTogglePublished}
                    className="px-3 py-1 rounded-full border text-xs hover:bg-gray-50"
                  >
                    {space.published ? "Unpublish" : "Publish"}
                  </button>
                </>
              )}
              {space && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCreateDialog((open) => !open)}
                    className="text-xs text-blue-700 hover:underline"
                  >
                    New story in this Space
                  </button>
                  {showCreateDialog && (
                    <div className="absolute right-0 mt-1 w-56 rounded border bg-white shadow-lg text-xs z-20">
                      <div className="px-3 py-2 border-b font-semibold">What would you like to create?</div>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-gray-50"
                        onClick={() => {
                          setShowCreateDialog(false);
                          createStoryInSpace("story");
                        }}
                      >
                        Regular story (novel)
                      </button>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-gray-50"
                        onClick={() => {
                          setShowCreateDialog(false);
                          createStoryInSpace("screenplay");
                        }}
                      >
                        Screenplay story
                      </button>
                    </div>
                  )}
                </div>
              )}
                <button
                  type="button"
                  onClick={handleCreateFolder}
                  className="px-3 py-1 rounded-full border text-xs hover:bg-gray-50"
                >
                  New folder
                </button>
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
          </>
        )}
      </main>
    </div>
  );
};

export default CreativeSpacePage;
