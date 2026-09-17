import React, { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import EditableText from "@/components/EditableText";

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|svg)$/i;
const TEXT_EXTENSIONS = /\.(md|markdown|txt|json|jsonl|csv|html)$/i;

function isImageItem(item: { mime_type?: string | null; name: string }): boolean {
  if (item.mime_type) return item.mime_type.startsWith("image/");
  return IMAGE_EXTENSIONS.test(item.name);
}

function isTextItem(item: { mime_type?: string | null; name: string }): boolean {
  if (item.mime_type) {
    return (
      item.mime_type.startsWith("text/") ||
      item.mime_type === "application/json" ||
      item.mime_type === "application/x-ndjson"
    );
  }
  return TEXT_EXTENSIONS.test(item.name);
}

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
  storage_path?: string | null;
  visibility?: string | null;
  published?: boolean | null;
  deleted?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  linked_chapter_id?: string | null;
}

interface SpaceStoryRow {
  story_title_id: string;
  title: string;
  visibility?: string | null;
  published?: boolean | null;
}

interface SpaceScreenplayRow {
  screenplay_id: string;
  title: string;
  visibility?: string | null;
  published?: boolean | null;
}

interface GithubSyncStatus {
  configured: boolean;
  connected: boolean;
  enabled: boolean;
  repo?: string | null;
  branch?: string | null;
  lastSyncedAt?: string | null;
  installUrl?: string | null;
  installationId?: string | number | null;
  existingInstallationId?: string | number | null;
  existingInstallationAccount?: string | null;
}

interface GithubRepoOption {
  fullName: string;
  defaultBranch?: string | null;
  private?: boolean;
}

interface GoogleDriveSyncStatus {
  configured: boolean;
  connected: boolean;
  enabled: boolean;
  folderId?: string | null;
  folderName?: string | null;
  lastSyncedAt?: string | null;
  driveAccountId?: string | null;
  authUrl?: string | null;
}

interface GoogleDriveFolderOption {
  id: string;
  name: string;
}

const CreativeSpacePage: React.FC = () => {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { user: authUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [space, setSpace] = useState<CreativeSpace | null>(null);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [items, setItems] = useState<CreativeSpaceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [itemsLoading, setItemsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notAuthorized, setNotAuthorized] = useState<boolean>(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const [contentItems, setContentItems] = useState<{ stories: SpaceStoryRow[]; screenplays: SpaceScreenplayRow[] }>({
    stories: [],
    screenplays: [],
  });

  const [githubStatus, setGithubStatus] = useState<GithubSyncStatus | null>(null);
  const [githubRepoDialogOpen, setGithubRepoDialogOpen] = useState(false);
  const [githubRepoDialogInstallationId, setGithubRepoDialogInstallationId] = useState<string | null>(null);
  const [installationRepos, setInstallationRepos] = useState<GithubRepoOption[]>([]);
  const [installationReposLoading, setInstallationReposLoading] = useState(false);
  const [installationReposError, setInstallationReposError] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [connectingRepo, setConnectingRepo] = useState(false);
  const [disconnectingGithub, setDisconnectingGithub] = useState(false);

  const [driveStatus, setDriveStatus] = useState<GoogleDriveSyncStatus | null>(null);
  const [driveFolderDialogOpen, setDriveFolderDialogOpen] = useState(false);
  const [driveFolderDialogAccountId, setDriveFolderDialogAccountId] = useState<string | null>(null);
  const [driveFolders, setDriveFolders] = useState<GoogleDriveFolderOption[]>([]);
  const [driveFoldersLoading, setDriveFoldersLoading] = useState(false);
  const [driveFoldersError, setDriveFoldersError] = useState<string | null>(null);
  const [selectedDriveFolder, setSelectedDriveFolder] = useState<string>("");
  const [connectingDriveFolder, setConnectingDriveFolder] = useState(false);
  const [disconnectingDrive, setDisconnectingDrive] = useState(false);

  const [previewItem, setPreviewItem] = useState<CreativeSpaceItem | null>(null);
  const [previewText, setPreviewText] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewEditing, setPreviewEditing] = useState(false);
  const [previewSaving, setPreviewSaving] = useState(false);

  const newFileInputRef = useRef<HTMLInputElement | null>(null);
  const previewFileInputRef = useRef<HTMLInputElement | null>(null);

  // Import wizard: select raw files, then structure them into a chapter of
  // a new or existing book (story_title) in this Space.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardBookMode, setWizardBookMode] = useState<"new_book" | "existing_book">("new_book");
  const [wizardBookTitle, setWizardBookTitle] = useState("");
  const [wizardStoryTitleId, setWizardStoryTitleId] = useState("");
  const [wizardChapterTitle, setWizardChapterTitle] = useState("");
  const [wizardSubmitting, setWizardSubmitting] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);

  const toggleItemSelected = (itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const selectableItemIds = items.filter((it) => it.kind === "file").map((it) => it.id);
  const allSelected = selectableItemIds.length > 0 && selectableItemIds.every((id) => selectedItemIds.has(id));
  const toggleSelectAll = () => {
    setSelectedItemIds((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        selectableItemIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...selectableItemIds]);
    });
  };

  const openStructureWizard = () => {
    setWizardError(null);
    setWizardBookMode("new_book");
    setWizardBookTitle("");
    setWizardStoryTitleId(contentItems.stories[0]?.story_title_id ?? "");
    const firstSelected = items.find((it) => selectedItemIds.has(it.id));
    setWizardChapterTitle(firstSelected ? firstSelected.name.replace(/\.[^./]+$/, "") : "");
    setWizardOpen(true);
  };

  // One file = one chapter (confirmed design — no multi-file merge). When
  // several files are selected, each becomes its own chapter, titled after
  // its own filename; the manual "Chapter title" field only applies (and
  // only renders) for a single-file selection. All chapters land in the
  // same book: the first file creates it (mode: "new_book") if that's the
  // chosen mode, and every subsequent file — plus every file at all when
  // mode is "existing_book" — is added to that one book via one
  // structure-chapter call each, in selection order.
  const handleSubmitStructureWizard = async () => {
    if (!spaceId || selectedItemIds.size === 0) return;
    if (wizardBookMode === "new_book" && !wizardBookTitle.trim()) {
      setWizardError("A book title is required.");
      return;
    }
    if (wizardBookMode === "existing_book" && !wizardStoryTitleId) {
      setWizardError("Choose which book this chapter belongs to.");
      return;
    }
    const selectedItems = Array.from(selectedItemIds)
      .map((id) => items.find((it) => it.id === id))
      .filter((it): it is CreativeSpaceItem => Boolean(it));
    if (selectedItems.length === 0) return;
    if (selectedItems.length === 1 && !wizardChapterTitle.trim()) return;

    setWizardSubmitting(true);
    setWizardError(null);
    try {
      let targetStoryTitleId = wizardBookMode === "existing_book" ? wizardStoryTitleId : "";
      const errors: string[] = [];

      for (let i = 0; i < selectedItems.length; i++) {
        const item = selectedItems[i];
        const chapterTitle =
          selectedItems.length === 1 ? wizardChapterTitle.trim() : item.name.replace(/\.[^./]+$/, "");
        const useNewBook = wizardBookMode === "new_book" && i === 0;

        const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/import-wizard/structure-chapter`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemIds: [item.id],
            mode: useNewBook ? "new_book" : "existing_book",
            bookTitle: useNewBook ? wizardBookTitle.trim() : undefined,
            storyTitleId: useNewBook ? undefined : targetStoryTitleId,
            chapterTitle,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          errors.push(`"${item.name}": ${body.error || "failed to structure"}`);
          continue;
        }
        if (useNewBook) targetStoryTitleId = body.storyTitleId;
      }

      if (errors.length > 0) {
        setWizardError(errors.join("; "));
        if (errors.length === selectedItems.length) return; // nothing succeeded — leave the dialog open
      }

      setWizardOpen(false);
      setSelectedItemIds(new Set());
      setSelectMode(false);
      await Promise.all([loadItems(currentPath), loadContentItems()]);
    } catch (err) {
      console.error("[CreativeSpacePage] Failed to structure chapter(s)", err);
      setWizardError("Failed to structure chapter(s).");
    } finally {
      setWizardSubmitting(false);
    }
  };

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

  const loadContentItems = async () => {
    if (!spaceId || !space) return;
    try {
      const params = new URLSearchParams();
      if (authUser?.id) params.set("userId", authUser.id);
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/content-items?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage] Failed to load stories/screenplays", { status: res.status, body });
        return;
      }
      setContentItems({
        stories: Array.isArray(body.stories) ? body.stories : [],
        screenplays: Array.isArray(body.screenplays) ? body.screenplays : [],
      });
    } catch (err) {
      console.error("[CreativeSpacePage] Error loading stories/screenplays", err);
    }
  };

  useEffect(() => {
    loadContentItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, space?.id, authUser?.id]);

  // "Publish book into Space": a book's own visibility/published fields
  // already gate whether it surfaces anywhere (see PATCH
  // /story-titles/:storyTitleId/settings) — this checkbox is just a
  // same-page affordance for that existing setting.
  const handleToggleStoryPublishedInSpace = async (story: SpaceStoryRow) => {
    const next = !(story.visibility === "public" && story.published);
    try {
      const res = await fetch(`${API_BASE}/story-titles/${story.story_title_id}/settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next ? "public" : "private", published: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[CreativeSpacePage] Failed to update story publish state", body);
        return;
      }
      setContentItems((prev) => ({
        ...prev,
        stories: prev.stories.map((s) =>
          s.story_title_id === story.story_title_id
            ? { ...s, visibility: next ? "public" : "private", published: next }
            : s,
        ),
      }));
    } catch (err) {
      console.error("[CreativeSpacePage] Error updating story publish state", err);
    }
  };

  useEffect(() => {
    const loadGithubStatus = async () => {
      if (!spaceId || !space || !authUser?.id || !isOwner) return;
      try {
        const params = new URLSearchParams({ userId: authUser.id });
        const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/github-sync/status?${params.toString()}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error("[CreativeSpacePage] Failed to load GitHub sync status", { status: res.status, body });
          return;
        }
        setGithubStatus(body as GithubSyncStatus);
      } catch (err) {
        console.error("[CreativeSpacePage] Error loading GitHub sync status", err);
      }
    };
    loadGithubStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, space?.id, authUser?.id, isOwner]);

  const openInstallationRepoPicker = async (installationId: string) => {
    if (!spaceId || !authUser?.id) return;
    setGithubRepoDialogInstallationId(installationId);
    setGithubRepoDialogOpen(true);
    setInstallationReposLoading(true);
    setInstallationReposError(null);
    setInstallationRepos([]);
    setSelectedRepo("");
    try {
      const params = new URLSearchParams({ installationId, userId: authUser.id });
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/github-sync/installation-repos?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage] Failed to list installation repos", { status: res.status, body });
        setInstallationReposError(body.error || "Failed to list repositories for this GitHub installation.");
        return;
      }
      const repos = Array.isArray(body.repositories) ? (body.repositories as GithubRepoOption[]) : [];
      setInstallationRepos(repos);
      if (repos.length > 0) setSelectedRepo(repos[0].fullName);
    } catch (err) {
      console.error("[CreativeSpacePage] Error listing installation repos", err);
      setInstallationReposError("Failed to list repositories for this GitHub installation.");
    } finally {
      setInstallationReposLoading(false);
    }
  };

  useEffect(() => {
    if (!spaceId || !isOwner) return;
    if (searchParams.get("github") !== "choose-repo") return;
    const installationId = searchParams.get("installation_id");
    if (!installationId) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("github");
        next.delete("installation_id");
        return next;
      },
      { replace: true },
    );
    openInstallationRepoPicker(installationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, isOwner, searchParams]);

  const handleConnectRepo = async () => {
    if (!spaceId || !authUser?.id || !githubRepoDialogInstallationId || !selectedRepo) return;
    setConnectingRepo(true);
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/github-sync/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: authUser.id,
          installationId: githubRepoDialogInstallationId,
          repo: selectedRepo,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage] Failed to connect GitHub repo", { status: res.status, body });
        setInstallationReposError(body.error || "Failed to connect this repository.");
        return;
      }
      setGithubStatus(body as GithubSyncStatus);
      setGithubRepoDialogOpen(false);
    } catch (err) {
      console.error("[CreativeSpacePage] Error connecting GitHub repo", err);
      setInstallationReposError("Failed to connect this repository.");
    } finally {
      setConnectingRepo(false);
    }
  };

  const handleOpenChangeRepo = () => {
    if (!githubStatus?.installationId) return;
    openInstallationRepoPicker(String(githubStatus.installationId));
  };

  const handleDisconnectGithub = async () => {
    if (!spaceId || !authUser?.id) return;
    const ok = window.confirm("Disconnect this Space from GitHub? File sync will stop until you connect again.");
    if (!ok) return;
    setDisconnectingGithub(true);
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/github-sync/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authUser.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage] Failed to disconnect GitHub", { status: res.status, body });
        setError(body.error || "Failed to disconnect GitHub.");
        return;
      }
      setGithubStatus(body as GithubSyncStatus);
    } catch (err) {
      console.error("[CreativeSpacePage] Error disconnecting GitHub", err);
      setError("Failed to disconnect GitHub.");
    } finally {
      setDisconnectingGithub(false);
    }
  };

  useEffect(() => {
    const loadDriveStatus = async () => {
      if (!spaceId || !space || !authUser?.id || !isOwner) return;
      try {
        const params = new URLSearchParams({ userId: authUser.id });
        const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/drive-sync/status?${params.toString()}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error("[CreativeSpacePage] Failed to load Google Drive sync status", { status: res.status, body });
          return;
        }
        setDriveStatus(body as GoogleDriveSyncStatus);
      } catch (err) {
        console.error("[CreativeSpacePage] Error loading Google Drive sync status", err);
      }
    };
    loadDriveStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, space?.id, authUser?.id, isOwner]);

  const openDriveFolderPicker = async (driveAccountId: string) => {
    if (!spaceId || !authUser?.id) return;
    setDriveFolderDialogAccountId(driveAccountId);
    setDriveFolderDialogOpen(true);
    setDriveFoldersLoading(true);
    setDriveFoldersError(null);
    setDriveFolders([]);
    setSelectedDriveFolder("");
    try {
      const params = new URLSearchParams({ driveAccountId, userId: authUser.id });
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/drive-sync/folders?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage] Failed to list Google Drive folders", { status: res.status, body });
        setDriveFoldersError(body.error || "Failed to list folders for this Google Drive account.");
        return;
      }
      const folders = Array.isArray(body.folders) ? (body.folders as GoogleDriveFolderOption[]) : [];
      setDriveFolders(folders);
      if (folders.length > 0) setSelectedDriveFolder(folders[0].id);
    } catch (err) {
      console.error("[CreativeSpacePage] Error listing Google Drive folders", err);
      setDriveFoldersError("Failed to list folders for this Google Drive account.");
    } finally {
      setDriveFoldersLoading(false);
    }
  };

  useEffect(() => {
    if (!spaceId || !isOwner) return;
    if (searchParams.get("drive") !== "choose-folder") return;
    const driveAccountId = searchParams.get("driveAccountId");
    if (!driveAccountId) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("drive");
        next.delete("driveAccountId");
        return next;
      },
      { replace: true },
    );
    openDriveFolderPicker(driveAccountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, isOwner, searchParams]);

  const handleConnectDriveFolder = async () => {
    if (!spaceId || !authUser?.id || !driveFolderDialogAccountId || !selectedDriveFolder) return;
    setConnectingDriveFolder(true);
    try {
      const folder = driveFolders.find((f) => f.id === selectedDriveFolder);
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/drive-sync/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: authUser.id,
          driveAccountId: driveFolderDialogAccountId,
          folderId: selectedDriveFolder,
          folderName: folder?.name,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage] Failed to connect Google Drive folder", { status: res.status, body });
        setDriveFoldersError(body.error || "Failed to connect this folder.");
        return;
      }
      setDriveStatus(body as GoogleDriveSyncStatus);
      setDriveFolderDialogOpen(false);
    } catch (err) {
      console.error("[CreativeSpacePage] Error connecting Google Drive folder", err);
      setDriveFoldersError("Failed to connect this folder.");
    } finally {
      setConnectingDriveFolder(false);
    }
  };

  const handleOpenChangeDriveFolder = () => {
    if (!driveStatus?.driveAccountId) return;
    openDriveFolderPicker(driveStatus.driveAccountId);
  };

  const handleDisconnectDrive = async () => {
    if (!spaceId || !authUser?.id) return;
    const ok = window.confirm("Disconnect this Space from Google Drive? File sync will stop until you connect again.");
    if (!ok) return;
    setDisconnectingDrive(true);
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/drive-sync/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authUser.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage] Failed to disconnect Google Drive", { status: res.status, body });
        setError(body.error || "Failed to disconnect Google Drive.");
        return;
      }
      setDriveStatus(body as GoogleDriveSyncStatus);
    } catch (err) {
      console.error("[CreativeSpacePage] Error disconnecting Google Drive", err);
      setError("Failed to disconnect Google Drive.");
    } finally {
      setDisconnectingDrive(false);
    }
  };

  const handleToggleDriveSync = async (checked: boolean) => {
    if (!spaceId || !authUser?.id) return;
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/drive-sync`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authUser.id, enabled: checked }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage] Failed to toggle Google Drive sync", { status: res.status, body });
        setError(body.error || "Failed to update Google Drive sync.");
        return;
      }
      setDriveStatus(body as GoogleDriveSyncStatus);
    } catch (err) {
      console.error("[CreativeSpacePage] Error toggling Google Drive sync", err);
      setError("Failed to update Google Drive sync.");
    }
  };

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
    const next = !space.published;
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

  const handleToggleGithubSync = async (checked: boolean) => {
    if (!spaceId || !authUser?.id) return;
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/github-sync`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authUser.id, enabled: checked }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage] Failed to toggle GitHub sync", { status: res.status, body });
        setError(body.error || "Failed to update GitHub sync.");
        return;
      }
      setGithubStatus(body as GithubSyncStatus);
    } catch (err) {
      console.error("[CreativeSpacePage] Error toggling GitHub sync", err);
      setError("Failed to update GitHub sync.");
    }
  };

  const contentUrl = (item: CreativeSpaceItem) => {
    const params = new URLSearchParams();
    if (authUser?.id) params.set("userId", authUser.id);
    // Cache-bust on content changes (hash changes whenever the stored bytes
    // do) so a replaced image doesn't keep showing a stale cached fetch.
    if (item.hash) params.set("v", item.hash);
    return `${API_BASE}/creative-spaces/${spaceId}/items/${item.id}/content?${params.toString()}`;
  };

  const handleOpenPreview = async (item: CreativeSpaceItem) => {
    setPreviewItem(item);
    setPreviewError(null);
    setPreviewEditing(false);
    setPreviewText("");

    if (isImageItem(item)) return; // the <img> renders straight from contentUrl(); no fetch needed here.
    if (!isTextItem(item)) return; // unsupported preview type (e.g. PDF) — offer upload/replace only.
    if (!item.storage_path) {
      setPreviewError("No content available yet.");
      return;
    }

    setPreviewLoading(true);
    try {
      const res = await fetch(contentUrl(item));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setPreviewError(body.error === "no_content" ? "No content available yet." : body.error || "Failed to load content.");
        return;
      }
      setPreviewText(await res.text());
    } catch (err) {
      console.error("[CreativeSpacePage] Failed to load preview content", err);
      setPreviewError("Failed to load content.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSavePreviewText = async () => {
    if (!previewItem || !spaceId || !authUser?.id) return;
    setPreviewSaving(true);
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/items/${previewItem.id}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authUser.id, content: previewText }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPreviewError(body.error || "Failed to save content.");
        return;
      }
      setItems((prev) => prev.map((it) => (it.id === previewItem.id ? { ...it, ...body } : it)));
      setPreviewItem((prev) => (prev ? { ...prev, ...body } : prev));
      setPreviewEditing(false);
    } catch (err) {
      console.error("[CreativeSpacePage] Failed to save preview content", err);
      setPreviewError("Failed to save content.");
    } finally {
      setPreviewSaving(false);
    }
  };

  const uploadContentForItem = async (itemId: string, file: File) => {
    if (!spaceId || !authUser?.id) return null;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("userId", authUser.id);
    const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/items/${itemId}/content`, {
      method: "POST",
      body: formData,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Failed to upload file content.");
    return body as CreativeSpaceItem;
  };

  const handlePreviewFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !previewItem) return;
    setPreviewSaving(true);
    try {
      const updated = await uploadContentForItem(previewItem.id, file);
      if (!updated) return;
      setItems((prev) => prev.map((it) => (it.id === previewItem.id ? { ...it, ...updated } : it)));
      setPreviewItem(updated);
      setPreviewError(null);
      if (isTextItem(updated)) {
        setPreviewText(await file.text());
      }
    } catch (err) {
      console.error("[CreativeSpacePage] Failed to upload content for item", err);
      setPreviewError(err instanceof Error ? err.message : "Failed to upload file content.");
    } finally {
      setPreviewSaving(false);
    }
  };

  const handleNewFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !spaceId || !authUser?.id) return;
    try {
      const createRes = await fetch(`${API_BASE}/creative-spaces/${spaceId}/items/file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentPath: currentPath,
          name: file.name,
          mimeType: file.type || undefined,
          sizeBytes: file.size,
          userId: authUser.id,
        }),
      });
      const createBody = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        setError(createBody.error || "Failed to create file item.");
        return;
      }
      const newItem = createBody as CreativeSpaceItem;
      try {
        const updated = await uploadContentForItem(newItem.id, file);
        setItems((prev) => [...prev, updated || newItem]);
      } catch (contentErr) {
        console.error("[CreativeSpacePage] File item created but content upload failed", contentErr);
        setItems((prev) => [...prev, newItem]);
        setError(contentErr instanceof Error ? contentErr.message : "File created but content upload failed.");
      }
    } catch (err) {
      console.error("[CreativeSpacePage] Failed to upload new file", err);
      setError("Failed to upload file.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <CrowdlyHeader />
        <div className="flex flex-1 items-center justify-center">
          <EditableText id="space-loading" as="p" className="text-gray-500">Loading creative space...</EditableText>
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
          <EditableText id="space-not-found" as="p" className="text-gray-500">Creative space not found.</EditableText>
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
          <EditableText id="space-no-access" as="p" className="text-gray-500 text-center max-w-md">
            You do not have access to this creative space.
          </EditableText>
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
          <Link to="/admin" className="text-blue-700 hover:underline">
            <EditableText id="space-back-profile">← Back to My Content</EditableText>
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
                  {githubStatus?.connected ? (
                    <>
                      <label className="flex items-center gap-2 text-xs text-slate-600 px-1">
                        <Checkbox
                          checked={Boolean(githubStatus.enabled)}
                          onCheckedChange={(val) => handleToggleGithubSync(Boolean(val))}
                        />
                        <EditableText id="space-github-sync-label">Sync with GitHub</EditableText>
                        {githubStatus.repo && <span className="text-slate-400">({githubStatus.repo})</span>}
                      </label>
                      <button
                        type="button"
                        onClick={handleOpenChangeRepo}
                        className="text-xs text-blue-700 hover:underline px-1"
                      >
                        <EditableText id="space-github-change-repo">Change repository</EditableText>
                      </button>
                      <button
                        type="button"
                        onClick={handleDisconnectGithub}
                        disabled={disconnectingGithub}
                        className="text-xs text-red-700 hover:underline px-1 disabled:opacity-50"
                      >
                        <EditableText id="space-github-disconnect">Disconnect</EditableText>
                      </button>
                    </>
                  ) : githubStatus?.configured && githubStatus?.existingInstallationId ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openInstallationRepoPicker(String(githubStatus.existingInstallationId))}
                        className="text-xs text-blue-700 hover:underline px-1"
                      >
                        <EditableText id="space-github-use-existing">Use existing GitHub connection</EditableText>
                        {githubStatus.existingInstallationAccount && (
                          <span className="text-slate-400"> ({githubStatus.existingInstallationAccount})</span>
                        )}
                      </button>
                      {githubStatus.installUrl && (
                        <a href={githubStatus.installUrl} className="text-xs text-slate-500 hover:underline px-1">
                          <EditableText id="space-github-connect-different">Connect a different GitHub account</EditableText>
                        </a>
                      )}
                    </>
                  ) : githubStatus?.configured && githubStatus?.installUrl ? (
                    <a href={githubStatus.installUrl} className="text-xs text-blue-700 hover:underline px-1">
                      <EditableText id="space-github-connect">Connect GitHub</EditableText>
                    </a>
                  ) : null}
                  {driveStatus?.connected ? (
                    <>
                      <label className="flex items-center gap-2 text-xs text-slate-600 px-1">
                        <Checkbox
                          checked={Boolean(driveStatus.enabled)}
                          onCheckedChange={(val) => handleToggleDriveSync(Boolean(val))}
                        />
                        <EditableText id="space-drive-sync-label">Sync with Google Drive</EditableText>
                        {driveStatus.folderName && <span className="text-slate-400">({driveStatus.folderName})</span>}
                      </label>
                      <button
                        type="button"
                        onClick={handleOpenChangeDriveFolder}
                        className="text-xs text-blue-700 hover:underline px-1"
                      >
                        <EditableText id="space-drive-change-folder">Change folder</EditableText>
                      </button>
                      <button
                        type="button"
                        onClick={handleDisconnectDrive}
                        disabled={disconnectingDrive}
                        className="text-xs text-red-700 hover:underline px-1 disabled:opacity-50"
                      >
                        <EditableText id="space-drive-disconnect">Disconnect</EditableText>
                      </button>
                    </>
                  ) : driveStatus?.configured && driveStatus?.authUrl ? (
                    <a href={driveStatus.authUrl} className="text-xs text-blue-700 hover:underline px-1">
                      <EditableText id="space-drive-connect">Connect Google Drive</EditableText>
                    </a>
                  ) : null}
                </>
              )}
              {isOwner && (
                <Dialog open={githubRepoDialogOpen} onOpenChange={setGithubRepoDialogOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        <EditableText id="space-github-picker-title">Choose a GitHub repository</EditableText>
                      </DialogTitle>
                    </DialogHeader>
                    {installationReposLoading ? (
                      <p className="text-sm text-slate-500">
                        <EditableText id="space-github-picker-loading">Loading repositories…</EditableText>
                      </p>
                    ) : installationReposError ? (
                      <p className="text-sm text-red-600">{installationReposError}</p>
                    ) : installationRepos.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        <EditableText id="space-github-picker-empty">
                          No repositories are accessible to this GitHub installation.
                        </EditableText>
                      </p>
                    ) : (
                      <Select value={selectedRepo} onValueChange={setSelectedRepo}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a repository" />
                        </SelectTrigger>
                        <SelectContent>
                          {installationRepos.map((repo) => (
                            <SelectItem key={repo.fullName} value={repo.fullName}>
                              {repo.fullName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        onClick={handleConnectRepo}
                        disabled={connectingRepo || !selectedRepo || installationReposLoading}
                      >
                        <EditableText id="space-github-picker-connect">Connect</EditableText>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          githubRepoDialogInstallationId &&
                          openInstallationRepoPicker(githubRepoDialogInstallationId)
                        }
                        disabled={installationReposLoading || !githubRepoDialogInstallationId}
                      >
                        <EditableText id="space-github-picker-refresh">Refresh</EditableText>
                      </Button>
                    </div>
                    {githubRepoDialogInstallationId && (
                      <a
                        href={`https://github.com/settings/installations/${githubRepoDialogInstallationId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 text-xs text-slate-500 hover:underline"
                      >
                        <EditableText id="space-github-manage-access">
                          Don't see your repository? Manage access on GitHub
                        </EditableText>
                      </a>
                    )}
                  </DialogContent>
                </Dialog>
              )}
              {isOwner && (
                <Dialog open={driveFolderDialogOpen} onOpenChange={setDriveFolderDialogOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        <EditableText id="space-drive-picker-title">Choose a Google Drive folder</EditableText>
                      </DialogTitle>
                    </DialogHeader>
                    {driveFoldersLoading ? (
                      <p className="text-sm text-slate-500">
                        <EditableText id="space-drive-picker-loading">Loading folders…</EditableText>
                      </p>
                    ) : driveFoldersError ? (
                      <p className="text-sm text-red-600">{driveFoldersError}</p>
                    ) : driveFolders.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        <EditableText id="space-drive-picker-empty">
                          No folders were found in this Google Drive account.
                        </EditableText>
                      </p>
                    ) : (
                      <Select value={selectedDriveFolder} onValueChange={setSelectedDriveFolder}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a folder" />
                        </SelectTrigger>
                        <SelectContent>
                          {driveFolders.map((folder) => (
                            <SelectItem key={folder.id} value={folder.id}>
                              {folder.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      onClick={handleConnectDriveFolder}
                      disabled={connectingDriveFolder || !selectedDriveFolder || driveFoldersLoading}
                      className="mt-2"
                    >
                      <EditableText id="space-drive-picker-connect">Connect</EditableText>
                    </Button>
                  </DialogContent>
                </Dialog>
              )}
              {space && (
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="text-xs text-blue-700 hover:underline"
                    >
                      <EditableText id="space-new-story">New story in this Space</EditableText>
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle><EditableText id="space-create-dialog-title">What would you like to create in this Space?</EditableText></DialogTitle>
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
                        <EditableText id="space-regular-story">Regular story (novel)</EditableText>
                      </button>
                      <button
                        type="button"
                        className="w-full px-4 py-2 rounded border bg-white hover:bg-slate-50 text-left"
                        onClick={() => {
                          setCreateDialogOpen(false);
                          navigate(`/new-story-template?type=screenplay&spaceId=${space.id}`);
                        }}
                      >
                        <EditableText id="space-screenplay-story">Screenplay story</EditableText>
                      </button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              <Button size="sm" onClick={handleCreateFolder} className="rounded-full px-3">
                <EditableText id="space-new-folder">New folder</EditableText>
              </Button>
              {isOwner && (
                <>
                  <input
                    ref={newFileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleNewFileSelected}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full px-3"
                    onClick={() => newFileInputRef.current?.click()}
                  >
                    <EditableText id="space-upload-file">Upload file</EditableText>
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>

        {(contentItems.stories.length > 0 || contentItems.screenplays.length > 0) && (
          <section className="bg-white border border-slate-200 rounded-2xl p-4 md:p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              <EditableText id="space-content-items-heading">Stories &amp; Screenplays in this Space</EditableText>
            </h2>
            <ul className="divide-y text-sm">
              {contentItems.stories.map((story) => (
                <li key={story.story_title_id} className="flex items-center justify-between py-2 gap-2">
                  <Link to={`/story/${story.story_title_id}`} className="text-blue-700 hover:underline truncate">
                    {story.title}
                  </Link>
                  <span className="text-[11px] text-slate-500 whitespace-nowrap flex items-center gap-1.5">
                    Story · {story.visibility === "public" ? "Public" : story.visibility === "unlisted" ? "Unlisted" : "Private"}
                    {story.published === false ? " · Unpublished" : ""}
                    {isOwner && (
                      <label className="ml-1.5 inline-flex items-center gap-1 cursor-pointer">
                        <Checkbox
                          checked={story.visibility === "public" && !!story.published}
                          onCheckedChange={() => handleToggleStoryPublishedInSpace(story)}
                        />
                        <span title={`Publish "${story.title}" into "${space?.name ?? "this Space"}"`}>Publish into Space</span>
                      </label>
                    )}
                  </span>
                </li>
              ))}
              {contentItems.screenplays.map((screenplay) => (
                <li key={screenplay.screenplay_id} className="flex items-center justify-between py-2 gap-2">
                  <Link to={`/screenplay/${screenplay.screenplay_id}`} className="text-blue-700 hover:underline truncate">
                    {screenplay.title}
                  </Link>
                  <span className="text-[11px] text-slate-500 whitespace-nowrap">
                    Screenplay · {screenplay.visibility === "public" ? "Public" : screenplay.visibility === "unlisted" ? "Unlisted" : "Private"}
                    {screenplay.published === false ? " · Unpublished" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

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

          {isOwner && (
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant={selectMode ? "secondary" : "outline"}
                onClick={() => {
                  setSelectMode((prev) => !prev);
                  setSelectedItemIds(new Set());
                }}
              >
                {selectMode ? "Cancel selection" : "Select files to structure"}
              </Button>
              {selectMode && selectedItemIds.size > 0 && (
                <Button size="sm" onClick={openStructureWizard}>
                  Structure {selectedItemIds.size} file{selectedItemIds.size === 1 ? "" : "s"} into chapter…
                </Button>
              )}
            </div>
          )}

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-50 text-xs font-semibold text-slate-600">
              {selectMode && (
                <label className="w-24 flex-shrink-0 flex items-center gap-1.5 font-normal normal-case cursor-pointer">
                  <Checkbox
                    checked={allSelected}
                    disabled={selectableItemIds.length === 0}
                    onCheckedChange={toggleSelectAll}
                  />
                  <EditableText id="space-select-all">Select all</EditableText>
                </label>
              )}
              <div className="flex-1"><EditableText id="space-th-name">Name</EditableText></div>
              <div className="w-24 text-right"><EditableText id="space-th-type">Type</EditableText></div>
              <div className="w-40 text-right"><EditableText id="space-th-updated">Updated</EditableText></div>
              <div className="w-32 text-right"><EditableText id="space-th-actions">Actions</EditableText></div>
            </div>
            {itemsLoading ? (
              <div className="px-4 py-4 text-sm text-slate-500"><EditableText id="space-loading-items">Loading items...</EditableText></div>
            ) : items.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-500">
                <EditableText id="space-no-items">No items in this folder yet.</EditableText>
              </div>
            ) : (
              <ul className="divide-y text-sm">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center px-4 py-3 gap-2 hover:bg-slate-50 transition"
                  >
                    {selectMode && (
                      <div className="w-6 flex-shrink-0">
                        {item.kind === "file" && (
                          <Checkbox
                            checked={selectedItemIds.has(item.id)}
                            onCheckedChange={() => toggleItemSelected(item.id)}
                          />
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      {item.kind === "folder" ? (
                        <button
                          type="button"
                          className="text-purple-700 hover:underline truncate font-medium"
                          onClick={() => handleEnterFolder(item)}
                        >
                          {item.name}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-blue-700 hover:underline truncate text-left"
                          onClick={() => handleOpenPreview(item)}
                        >
                          {item.name}
                        </button>
                      )}
                      {item.linked_chapter_id && (
                        <span
                          className="text-[10px] rounded-full bg-emerald-50 text-emerald-700 px-1.5 py-0.5 whitespace-nowrap"
                          title="Already structured into a chapter"
                        >
                          ✓ Chapter
                        </span>
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
                        <EditableText id="space-rename">Rename</EditableText>
                      </button>
                      <button
                        type="button"
                        className="text-red-600 hover:text-red-800"
                        onClick={() => handleDeleteItem(item)}
                      >
                        <EditableText id="space-delete">Delete</EditableText>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <Dialog open={!!previewItem} onOpenChange={(open) => { if (!open) setPreviewItem(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="break-all">{previewItem?.name}</DialogTitle>
          </DialogHeader>

          {previewItem && (
            <div className="mt-2 space-y-3">
              {isImageItem(previewItem) ? (
                previewItem.storage_path ? (
                  <img
                    src={contentUrl(previewItem)}
                    alt={previewItem.name}
                    className="max-w-full max-h-[60vh] object-contain mx-auto"
                  />
                ) : (
                  <p className="text-sm text-slate-500">
                    <EditableText id="space-preview-no-content">No content available yet.</EditableText>
                  </p>
                )
              ) : previewLoading ? (
                <p className="text-sm text-slate-500">
                  <EditableText id="space-preview-loading">Loading...</EditableText>
                </p>
              ) : previewError ? (
                <p className="text-sm text-slate-500">{previewError}</p>
              ) : isTextItem(previewItem) ? (
                previewEditing ? (
                  <Textarea
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    className="min-h-[300px] font-mono text-xs"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap text-xs bg-slate-50 rounded-lg p-3 max-h-[50vh] overflow-y-auto">
                    {previewText}
                  </pre>
                )
              ) : (
                <p className="text-sm text-slate-500">
                  <EditableText id="space-preview-unsupported">
                    This file type can't be previewed here yet.
                  </EditableText>
                </p>
              )}

              {isOwner && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                  {isTextItem(previewItem) && previewItem.storage_path && !previewLoading && !previewError && (
                    previewEditing ? (
                      <>
                        <Button size="sm" disabled={previewSaving} onClick={handleSavePreviewText}>
                          {previewSaving ? "Saving..." : "Save"}
                        </Button>
                        <Button size="sm" variant="outline" disabled={previewSaving} onClick={() => setPreviewEditing(false)}>
                          <EditableText id="space-preview-cancel">Cancel</EditableText>
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setPreviewEditing(true)}>
                        <EditableText id="space-preview-edit">Edit</EditableText>
                      </Button>
                    )
                  )}
                  <input
                    ref={previewFileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handlePreviewFileSelected}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={previewSaving}
                    onClick={() => previewFileInputRef.current?.click()}
                  >
                    <EditableText id="space-preview-replace">
                      {previewItem.storage_path ? "Replace file" : "Upload content"}
                    </EditableText>
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={wizardOpen} onOpenChange={(open) => { if (!open) setWizardOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedItemIds.size === 1 ? "Structure into chapter" : `Structure ${selectedItemIds.size} files into chapters`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={wizardBookMode === "new_book" ? "secondary" : "outline"}
                onClick={() => setWizardBookMode("new_book")}
              >
                New book
              </Button>
              <Button
                type="button"
                size="sm"
                variant={wizardBookMode === "existing_book" ? "secondary" : "outline"}
                disabled={contentItems.stories.length === 0}
                onClick={() => setWizardBookMode("existing_book")}
              >
                Existing book
              </Button>
            </div>

            {wizardBookMode === "new_book" ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Book title</label>
                <Input value={wizardBookTitle} onChange={(e) => setWizardBookTitle(e.target.value)} placeholder="e.g. Book I — Episode IV: New horizons" />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Book</label>
                <Select value={wizardStoryTitleId} onValueChange={setWizardStoryTitleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a book" />
                  </SelectTrigger>
                  <SelectContent>
                    {contentItems.stories.map((s) => (
                      <SelectItem key={s.story_title_id} value={s.story_title_id}>{s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedItemIds.size === 1 ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Chapter title</label>
                <Input value={wizardChapterTitle} onChange={(e) => setWizardChapterTitle(e.target.value)} placeholder="Chapter title" />
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Each of the {selectedItemIds.size} selected files will become its own chapter, titled after its file name (in
                selection order).
              </p>
            )}

            {wizardError && <p className="text-xs text-red-600">{wizardError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setWizardOpen(false)} disabled={wizardSubmitting}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSubmitStructureWizard}
                disabled={wizardSubmitting || (selectedItemIds.size === 1 && !wizardChapterTitle.trim())}
              >
                {wizardSubmitting
                  ? "Structuring…"
                  : selectedItemIds.size === 1
                    ? "Structure chapter"
                    : `Structure ${selectedItemIds.size} chapters`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CrowdlyFooter />
    </div>
  );
};

export default CreativeSpacePage;