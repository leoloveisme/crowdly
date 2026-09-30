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
import SpaceUserPicker from "@/modules/space-user-picker";
import { linkContentToSpaceItem, unlinkContentFromSpaceItem } from "@/lib/chapterSpaceSyncApi";

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
  linked_scene_id?: string | null;
  linked_page_id?: string | null;
  content_sync_enabled?: boolean | null;
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

interface SpaceComicRow {
  comic_id: string;
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
  hasGoogleAccount?: boolean;
  googleEmail?: string | null;
  authUrl?: string | null;
  recentLog?: GoogleDriveSyncLogEntry[];
}

interface ChapterLinkEvent {
  event_type: string;
  detail: string | null;
  created_at: string;
  entity_type: "chapter" | "scene" | "page";
  title: string | null;
}

interface GoogleDriveSyncLogEntry {
  direction: string;
  level: string;
  message: string;
  relative_path?: string | null;
  created_at: string;
}

interface GoogleDriveFolderOption {
  id: string;
  name: string;
}

const DRIVE_ROOT: GoogleDriveFolderOption = { id: "root", name: "My Drive" };

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

  const [contentItems, setContentItems] = useState<{ stories: SpaceStoryRow[]; screenplays: SpaceScreenplayRow[]; comics: SpaceComicRow[] }>({
    stories: [],
    screenplays: [],
    comics: [],
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
  const [driveFolderTrail, setDriveFolderTrail] = useState<GoogleDriveFolderOption[]>([DRIVE_ROOT]);
  const [driveFolders, setDriveFolders] = useState<GoogleDriveFolderOption[]>([]);
  const [driveFoldersLoading, setDriveFoldersLoading] = useState(false);
  const [driveFoldersError, setDriveFoldersError] = useState<string | null>(null);
  const [newDriveFolderName, setNewDriveFolderName] = useState("");
  const [creatingDriveFolder, setCreatingDriveFolder] = useState(false);
  const [connectingDriveFolder, setConnectingDriveFolder] = useState(false);
  const [disconnectingDrive, setDisconnectingDrive] = useState(false);
  const [syncingDrive, setSyncingDrive] = useState(false);
  const [driveLogOpen, setDriveLogOpen] = useState(false);
  const [chapterLinkEventsOpen, setChapterLinkEventsOpen] = useState(false);
  const [chapterLinkEvents, setChapterLinkEvents] = useState<ChapterLinkEvent[]>([]);
  const [chapterLinkEventsLoading, setChapterLinkEventsLoading] = useState(false);

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
  const [wizardContentType, setWizardContentType] = useState<"story" | "screenplay" | "comic">("story");
  type WizardMode = "new_book" | "existing_book" | "new_screenplay" | "existing_screenplay" | "new_comic" | "existing_comic";
  const [wizardBookMode, setWizardBookMode] = useState<WizardMode>("new_book");
  const [wizardBookTitle, setWizardBookTitle] = useState("");
  const [wizardTargetId, setWizardTargetId] = useState("");
  const [wizardChapterTitle, setWizardChapterTitle] = useState("");
  const [wizardSubmitting, setWizardSubmitting] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);

  // Mode-string / existing-target-list pairs per content type — keeps the
  // dialog and submit handler from repeating this mapping inline.
  const WIZARD_NEW_MODE: Record<typeof wizardContentType, WizardMode> = {
    story: "new_book", screenplay: "new_screenplay", comic: "new_comic",
  };
  const WIZARD_EXISTING_MODE: Record<typeof wizardContentType, WizardMode> = {
    story: "existing_book", screenplay: "existing_screenplay", comic: "existing_comic",
  };
  const wizardIsNewMode = wizardBookMode === WIZARD_NEW_MODE[wizardContentType];
  const wizardExistingOptions: { id: string; title: string }[] =
    wizardContentType === "story"
      ? contentItems.stories.map((s) => ({ id: s.story_title_id, title: s.title }))
      : wizardContentType === "screenplay"
        ? contentItems.screenplays.map((s) => ({ id: s.screenplay_id, title: s.title }))
        : contentItems.comics.map((c) => ({ id: c.comic_id, title: c.title }));
  const wizardAllSelectedAreImages = Array.from(selectedItemIds).every((id) => {
    const item = items.find((it) => it.id === id);
    return item ? isImageItem(item) : false;
  });

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
    setWizardContentType("story");
    setWizardBookMode("new_book");
    setWizardBookTitle("");
    setWizardTargetId(contentItems.stories[0]?.story_title_id ?? "");
    const firstSelected = items.find((it) => selectedItemIds.has(it.id));
    setWizardChapterTitle(firstSelected ? firstSelected.name.replace(/\.[^./]+$/, "") : "");
    setWizardOpen(true);
  };

  // Switching content type resets mode/target to that type's defaults —
  // "new X" plus whichever existing item (if any) is first in its list.
  const handleWizardContentTypeChange = (nextType: "story" | "screenplay" | "comic") => {
    setWizardContentType(nextType);
    setWizardBookMode(WIZARD_NEW_MODE[nextType]);
    const options =
      nextType === "story"
        ? contentItems.stories.map((s) => s.story_title_id)
        : nextType === "screenplay"
          ? contentItems.screenplays.map((s) => s.screenplay_id)
          : contentItems.comics.map((c) => c.comic_id);
    setWizardTargetId(options[0] ?? "");
  };

  // One file = one chapter/scene/page (confirmed design — no multi-file
  // merge). When several files are selected, each becomes its own
  // chapter/scene, titled after its own filename (comic pages have no
  // per-item title at all); the manual title field only applies (and only
  // renders) for a single-file, non-comic selection. Everything lands in
  // the same book/screenplay/comic: the first file creates it if "new" is
  // the chosen mode, and every subsequent file — plus every file at all
  // when an "existing" mode is chosen — is added to that one target via
  // one structure-chapter call each, in selection order.
  const handleSubmitStructureWizard = async () => {
    if (!spaceId || selectedItemIds.size === 0) return;
    if (wizardIsNewMode && !wizardBookTitle.trim()) {
      setWizardError("A title is required.");
      return;
    }
    if (!wizardIsNewMode && !wizardTargetId) {
      setWizardError("Choose which existing item this content belongs to.");
      return;
    }
    const selectedItems = Array.from(selectedItemIds)
      .map((id) => items.find((it) => it.id === id))
      .filter((it): it is CreativeSpaceItem => Boolean(it));
    if (selectedItems.length === 0) return;
    if (wizardContentType !== "comic" && selectedItems.length === 1 && !wizardChapterTitle.trim()) return;

    setWizardSubmitting(true);
    setWizardError(null);
    try {
      let targetId = wizardIsNewMode ? "" : wizardTargetId;
      const errors: string[] = [];

      for (let i = 0; i < selectedItems.length; i++) {
        const item = selectedItems[i];
        const chapterTitle =
          wizardContentType === "comic"
            ? undefined
            : selectedItems.length === 1
              ? wizardChapterTitle.trim()
              : item.name.replace(/\.[^./]+$/, "");
        const useNewTarget = wizardIsNewMode && i === 0;
        const mode = useNewTarget ? WIZARD_NEW_MODE[wizardContentType] : WIZARD_EXISTING_MODE[wizardContentType];

        const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/import-wizard/structure-chapter`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemIds: [item.id],
            contentType: wizardContentType,
            mode,
            bookTitle: useNewTarget ? wizardBookTitle.trim() : undefined,
            storyTitleId: wizardContentType === "story" && !useNewTarget ? targetId : undefined,
            screenplayId: wizardContentType === "screenplay" && !useNewTarget ? targetId : undefined,
            comicId: wizardContentType === "comic" && !useNewTarget ? targetId : undefined,
            chapterTitle,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          errors.push(`"${item.name}": ${body.error || "failed to structure"}`);
          continue;
        }
        if (useNewTarget) {
          targetId =
            wizardContentType === "story" ? body.storyTitleId
              : wizardContentType === "screenplay" ? body.screenplayId
                : body.comicId;
        }
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
  const [userPickerOpen, setUserPickerOpen] = useState(false);

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
        // credentials: users granted access to a "selected" Space are
        // recognised by their session cookie.
        const res = await fetch(url, { credentials: "include" });
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
      const res = await fetch(url, { credentials: "include" });
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
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/content-items?${params.toString()}`, { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage] Failed to load stories/screenplays", { status: res.status, body });
        return;
      }
      setContentItems({
        stories: Array.isArray(body.stories) ? body.stories : [],
        screenplays: Array.isArray(body.screenplays) ? body.screenplays : [],
        comics: Array.isArray(body.comics) ? body.comics : [],
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

  const openChapterLinkEvents = async () => {
    setChapterLinkEventsOpen(true);
    if (!spaceId || !authUser?.id) return;
    setChapterLinkEventsLoading(true);
    try {
      const params = new URLSearchParams({ userId: authUser.id });
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/content-link-events?${params.toString()}`);
      const body = await res.json().catch(() => []);
      if (res.ok && Array.isArray(body)) setChapterLinkEvents(body as ChapterLinkEvent[]);
    } catch (err) {
      console.error("[CreativeSpacePage] Error loading chapter link activity", err);
    } finally {
      setChapterLinkEventsLoading(false);
    }
  };

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

  const loadDriveStatus = async () => {
    if (!spaceId || !authUser?.id || !isOwner) return;
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/drive-sync/status`, { credentials: "include" });
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

  useEffect(() => {
    if (!space) return;
    loadDriveStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, space?.id, authUser?.id, isOwner]);

  const loadDriveFolders = async (trail: GoogleDriveFolderOption[]) => {
    if (!spaceId) return;
    const current = trail[trail.length - 1];
    setDriveFolderTrail(trail);
    setDriveFoldersLoading(true);
    setDriveFoldersError(null);
    setDriveFolders([]);
    try {
      const params = new URLSearchParams({ parentId: current.id });
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/drive-sync/folders?${params.toString()}`, {
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CreativeSpacePage] Failed to list Google Drive folders", { status: res.status, body });
        setDriveFoldersError(body.error || "Failed to list Google Drive folders.");
        return;
      }
      setDriveFolders(Array.isArray(body.folders) ? (body.folders as GoogleDriveFolderOption[]) : []);
    } catch (err) {
      console.error("[CreativeSpacePage] Error listing Google Drive folders", err);
      setDriveFoldersError("Failed to list Google Drive folders.");
    } finally {
      setDriveFoldersLoading(false);
    }
  };

  const openDriveFolderPicker = () => {
    setDriveFolderDialogOpen(true);
    setNewDriveFolderName(space?.name || "");
    loadDriveFolders([DRIVE_ROOT]);
  };

  // Back from Google's consent screen (backend /api/google-drive/oauth/callback).
  useEffect(() => {
    if (!spaceId || !isOwner) return;
    const driveParam = searchParams.get("drive");
    if (driveParam !== "choose-folder" && driveParam !== "error" && driveParam !== "missing-scope") return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("drive");
        return next;
      },
      { replace: true },
    );
    if (driveParam === "missing-scope") {
      setError(
        "Google Drive access wasn't granted. Please connect again and tick the box \"See, edit, create, and delete all of your Google Drive files\" on Google's permission screen.",
      );
      return;
    }
    if (driveParam === "error") {
      setError("Connecting Google Drive didn't complete. Please try again.");
      return;
    }
    loadDriveStatus();
    openDriveFolderPicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, isOwner, searchParams]);

  const handleCreateDriveFolder = async () => {
    const name = newDriveFolderName.trim();
    if (!spaceId || !name) return;
    const parent = driveFolderTrail[driveFolderTrail.length - 1];
    setCreatingDriveFolder(true);
    setDriveFoldersError(null);
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/drive-sync/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ parentId: parent.id, name }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDriveFoldersError(body.error || "Failed to create the folder.");
        return;
      }
      await loadDriveFolders([...driveFolderTrail, body as GoogleDriveFolderOption]);
    } catch (err) {
      console.error("[CreativeSpacePage] Error creating Google Drive folder", err);
      setDriveFoldersError("Failed to create the folder.");
    } finally {
      setCreatingDriveFolder(false);
    }
  };

  const handleConnectDriveFolder = async () => {
    const folder = driveFolderTrail[driveFolderTrail.length - 1];
    if (!spaceId || folder.id === DRIVE_ROOT.id) return;
    setConnectingDriveFolder(true);
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/drive-sync/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ folderId: folder.id }),
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

  const handleDisconnectDrive = async () => {
    if (!spaceId) return;
    const ok = window.confirm("Disconnect this Space from Google Drive? File sync will stop until you connect again.");
    if (!ok) return;
    setDisconnectingDrive(true);
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/drive-sync/disconnect`, {
        method: "POST",
        credentials: "include",
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
    if (!spaceId) return;
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/drive-sync`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: checked }),
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

  const handleSyncDriveNow = async () => {
    if (!spaceId) return;
    setSyncingDrive(true);
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/drive-sync/run`, {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Google Drive sync failed.");
      }
      await Promise.all([loadDriveStatus(), loadItems(currentPath)]);
    } catch (err) {
      console.error("[CreativeSpacePage] Error running Google Drive sync", err);
      setError("Google Drive sync failed.");
    } finally {
      setSyncingDrive(false);
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

  // --- Link a file to a chapter/scene/page for continuous bidirectional sync ---
  const [linkItem, setLinkItem] = useState<CreativeSpaceItem | null>(null);
  const [linkContentType, setLinkContentType] = useState<"story" | "screenplay" | "comic">("story");
  const [linkTargetId, setLinkTargetId] = useState(""); // story_title_id / screenplay_id / comic_id
  const [linkEntityId, setLinkEntityId] = useState(""); // chapter_id / scene_id / page_id
  const [linkEntityOptions, setLinkEntityOptions] = useState<{ id: string; label: string }[]>([]);
  const [linkEntityOptionsLoading, setLinkEntityOptionsLoading] = useState(false);
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [unlinkingItemId, setUnlinkingItemId] = useState<string | null>(null);

  const linkTargetOptions: { id: string; title: string }[] =
    linkContentType === "story"
      ? contentItems.stories.map((s) => ({ id: s.story_title_id, title: s.title }))
      : linkContentType === "screenplay"
        ? contentItems.screenplays.map((s) => ({ id: s.screenplay_id, title: s.title }))
        : contentItems.comics.map((c) => ({ id: c.comic_id, title: c.title }));

  const openLinkDialog = (item: CreativeSpaceItem) => {
    setLinkItem(item);
    setLinkContentType("story");
    setLinkTargetId("");
    setLinkEntityId("");
    setLinkEntityOptions([]);
  };

  const handleLinkContentTypeChange = (nextType: "story" | "screenplay" | "comic") => {
    setLinkContentType(nextType);
    setLinkTargetId("");
    setLinkEntityId("");
    setLinkEntityOptions([]);
  };

  useEffect(() => {
    if (!linkTargetId) {
      setLinkEntityOptions([]);
      return;
    }
    setLinkEntityOptionsLoading(true);
    setLinkEntityId("");

    if (linkContentType === "story") {
      const params = new URLSearchParams({ storyTitleId: linkTargetId });
      if (authUser?.id) params.set("userId", authUser.id);
      fetch(`${API_BASE}/chapters?${params.toString()}`)
        .then((res) => res.json())
        .then((body) => setLinkEntityOptions(Array.isArray(body)
          ? body.map((c: { chapter_id: string; chapter_title: string }) => ({ id: c.chapter_id, label: c.chapter_title || "Untitled chapter" }))
          : []))
        .catch(() => setLinkEntityOptions([]))
        .finally(() => setLinkEntityOptionsLoading(false));
    } else if (linkContentType === "screenplay") {
      const params = new URLSearchParams();
      if (authUser?.id) params.set("userId", authUser.id);
      fetch(`${API_BASE}/screenplays/${linkTargetId}/scenes?${params.toString()}`)
        .then((res) => res.json())
        .then((body) => {
          // The route responds with { scenes: [...] }, not a bare array.
          const scenes = Array.isArray(body) ? body : Array.isArray(body?.scenes) ? body.scenes : [];
          setLinkEntityOptions(scenes.map((s: { scene_id: string; slugline: string }) => ({ id: s.scene_id, label: s.slugline || "Untitled scene" })));
        })
        .catch(() => setLinkEntityOptions([]))
        .finally(() => setLinkEntityOptionsLoading(false));
    } else {
      fetch(`${API_BASE}/comics/${linkTargetId}`)
        .then((res) => res.json())
        .then((body) => setLinkEntityOptions(Array.isArray(body?.pages)
          ? body.pages.map((p: { page_id: string; page_index: number }) => ({ id: p.page_id, label: `Page ${p.page_index + 1}` }))
          : []))
        .catch(() => setLinkEntityOptions([]))
        .finally(() => setLinkEntityOptionsLoading(false));
    }
  }, [linkContentType, linkTargetId, authUser?.id]);

  const handleConfirmLink = async () => {
    if (!linkItem || !linkEntityId || !spaceId) return;
    const entityType = linkContentType === "story" ? "chapter" : linkContentType === "screenplay" ? "scene" : "page";
    setLinkSubmitting(true);
    try {
      const updated = await linkContentToSpaceItem(spaceId, linkItem.id, entityType, linkEntityId);
      setItems((prev) => prev.map((it) => (it.id === linkItem.id ? { ...it, ...(updated as CreativeSpaceItem) } : it)));
      setLinkItem(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link content.");
    } finally {
      setLinkSubmitting(false);
    }
  };

  const handleUnlinkContent = async (item: CreativeSpaceItem) => {
    if (!spaceId) return;
    const ok = window.confirm(`Stop syncing "${item.name}"? The file's current content stays as-is.`);
    if (!ok) return;
    setUnlinkingItemId(item.id);
    try {
      const updated = await unlinkContentFromSpaceItem(spaceId, item.id);
      setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, ...(updated as CreativeSpaceItem) } : it)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlink content.");
    } finally {
      setUnlinkingItemId(null);
    }
  };

  const handleSetVisibility = async (next: "public" | "private") => {
    if (!spaceId || !authUser?.id || !space) return;
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
                      : space.visibility === "selected"
                        ? "bg-indigo-50 text-indigo-700"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {space.visibility === "public" ? (
                    <EditableText id="space-badge-public">Public</EditableText>
                  ) : space.visibility === "selected" ? (
                    <EditableText id="space-badge-selected">Selected users</EditableText>
                  ) : (
                    <EditableText id="space-badge-private">Private</EditableText>
                  )}
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
                  {space.visibility !== "public" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSetVisibility("public")}
                      className="rounded-full px-3 text-xs"
                    >
                      <EditableText id="space-make-public">Make public</EditableText>
                    </Button>
                  )}
                  {(space.visibility || "private") !== "private" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSetVisibility("private")}
                      className="rounded-full px-3 text-xs"
                    >
                      <EditableText id="space-make-private">Make private</EditableText>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setUserPickerOpen(true)}
                    disabled={space.visibility === "public"}
                    className="rounded-full px-3 text-xs"
                  >
                    {space.visibility === "selected" ? (
                      <EditableText id="space-manage-users">Manage selected users</EditableText>
                    ) : (
                      <EditableText id="space-make-selected">Only for selected user(s)</EditableText>
                    )}
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
                      {driveStatus.enabled && (
                        <button
                          type="button"
                          onClick={handleSyncDriveNow}
                          disabled={syncingDrive}
                          className="text-xs text-blue-700 hover:underline px-1 disabled:opacity-50"
                        >
                          {syncingDrive ? (
                            <EditableText id="space-drive-syncing">Syncing…</EditableText>
                          ) : (
                            <EditableText id="space-drive-sync-now">Sync now</EditableText>
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDriveLogOpen(true)}
                        className="text-xs text-slate-500 hover:underline px-1"
                      >
                        <EditableText id="space-drive-view-log">Sync log</EditableText>
                        {driveStatus.lastSyncedAt && (
                          <span className="text-slate-400"> ({new Date(driveStatus.lastSyncedAt).toLocaleString()})</span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={openDriveFolderPicker}
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
                  ) : driveStatus?.configured && driveStatus?.hasGoogleAccount ? (
                    <>
                      <button
                        type="button"
                        onClick={openDriveFolderPicker}
                        className="text-xs text-blue-700 hover:underline px-1"
                      >
                        <EditableText id="space-drive-use-existing">Use existing Google Drive connection</EditableText>
                        {driveStatus.googleEmail && <span className="text-slate-400"> ({driveStatus.googleEmail})</span>}
                      </button>
                      {driveStatus.authUrl && (
                        <a href={driveStatus.authUrl} className="text-xs text-slate-500 hover:underline px-1">
                          <EditableText id="space-drive-connect-different">Connect a different Google account</EditableText>
                        </a>
                      )}
                    </>
                  ) : driveStatus?.configured && driveStatus?.authUrl ? (
                    <a href={driveStatus.authUrl} className="text-xs text-blue-700 hover:underline px-1">
                      <EditableText id="space-drive-connect">Connect Google Drive</EditableText>
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={openChapterLinkEvents}
                    className="text-xs text-slate-500 hover:underline px-1"
                  >
                    <EditableText id="space-chapter-sync-activity">Auto-sync activity</EditableText>
                  </button>
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
                    <p className="text-xs text-slate-500">
                      <EditableText id="space-drive-picker-hint">
                        The folder you open here, including all its subfolders, will be synced with this Space.
                      </EditableText>
                    </p>
                    <nav className="flex flex-wrap items-center gap-1 text-sm">
                      {driveFolderTrail.map((folder, idx) => (
                        <React.Fragment key={`${folder.id}-${idx}`}>
                          {idx > 0 && <span className="text-slate-400">/</span>}
                          {idx === driveFolderTrail.length - 1 ? (
                            <span className="font-medium">
                              {folder.id === DRIVE_ROOT.id ? (
                                <EditableText id="space-drive-picker-my-drive">My Drive</EditableText>
                              ) : (
                                folder.name
                              )}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="text-blue-700 hover:underline"
                              onClick={() => loadDriveFolders(driveFolderTrail.slice(0, idx + 1))}
                            >
                              {folder.id === DRIVE_ROOT.id ? (
                                <EditableText id="space-drive-picker-my-drive">My Drive</EditableText>
                              ) : (
                                folder.name
                              )}
                            </button>
                          )}
                        </React.Fragment>
                      ))}
                    </nav>
                    <div className="max-h-64 overflow-y-auto rounded border border-slate-200">
                      {driveFoldersLoading ? (
                        <p className="p-3 text-sm text-slate-500">
                          <EditableText id="space-drive-picker-loading">Loading folders…</EditableText>
                        </p>
                      ) : driveFolders.length === 0 ? (
                        <p className="p-3 text-sm text-slate-500">
                          <EditableText id="space-drive-picker-no-subfolders">No subfolders here.</EditableText>
                        </p>
                      ) : (
                        <ul>
                          {driveFolders.map((folder) => (
                            <li key={folder.id}>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                                onClick={() => loadDriveFolders([...driveFolderTrail, folder])}
                              >
                                📁 {folder.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {driveFoldersError && <p className="text-sm text-red-600">{driveFoldersError}</p>}
                    <div className="flex items-center gap-2">
                      <Input
                        value={newDriveFolderName}
                        onChange={(e) => setNewDriveFolderName(e.target.value)}
                        className="h-8 text-sm"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCreateDriveFolder}
                        disabled={creatingDriveFolder || !newDriveFolderName.trim() || driveFoldersLoading}
                      >
                        <EditableText id="space-drive-picker-create-folder">Create folder here</EditableText>
                      </Button>
                    </div>
                    <Button
                      onClick={handleConnectDriveFolder}
                      disabled={
                        connectingDriveFolder ||
                        driveFoldersLoading ||
                        driveFolderTrail[driveFolderTrail.length - 1].id === DRIVE_ROOT.id
                      }
                      className="mt-2"
                    >
                      <EditableText id="space-drive-picker-connect-this">Connect this folder</EditableText>
                    </Button>
                  </DialogContent>
                </Dialog>
              )}
              {isOwner && (
                <Dialog open={driveLogOpen} onOpenChange={setDriveLogOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        <EditableText id="space-drive-log-title">Google Drive sync log</EditableText>
                      </DialogTitle>
                    </DialogHeader>
                    {!driveStatus?.recentLog || driveStatus.recentLog.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        <EditableText id="space-drive-log-empty">Nothing has been synced yet.</EditableText>
                      </p>
                    ) : (
                      <ul className="max-h-80 space-y-1 overflow-y-auto text-xs">
                        {driveStatus.recentLog.map((entry, idx) => (
                          <li
                            key={`${entry.created_at}-${idx}`}
                            className={
                              entry.level === "error"
                                ? "text-red-600"
                                : entry.level === "warn"
                                  ? "text-amber-700"
                                  : "text-slate-600"
                            }
                          >
                            <span className="text-slate-400">{new Date(entry.created_at).toLocaleString()}</span>{" "}
                            {entry.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </DialogContent>
                </Dialog>
              )}
              {isOwner && (
                <Dialog open={chapterLinkEventsOpen} onOpenChange={setChapterLinkEventsOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        <EditableText id="space-chapter-sync-activity-title">Auto-sync activity</EditableText>
                      </DialogTitle>
                    </DialogHeader>
                    <p className="text-xs text-slate-500 -mt-2">
                      <EditableText id="space-chapter-sync-activity-help">
                        Chapters linked to a file here stay in sync automatically — this is what that's done, including
                        re-linking a chapter's file after the connected repo/folder was reorganized.
                      </EditableText>
                    </p>
                    {chapterLinkEventsLoading ? (
                      <p className="text-sm text-slate-500">
                        <EditableText id="space-chapter-sync-activity-loading">Loading…</EditableText>
                      </p>
                    ) : chapterLinkEvents.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        <EditableText id="space-chapter-sync-activity-empty">Nothing to show yet.</EditableText>
                      </p>
                    ) : (
                      <ul className="max-h-80 space-y-1 overflow-y-auto text-xs">
                        {chapterLinkEvents.map((event, idx) => (
                          <li
                            key={`${event.created_at}-${idx}`}
                            className={event.event_type === "unmatched_orphan" ? "text-amber-700" : "text-slate-600"}
                          >
                            <span className="text-slate-400">{new Date(event.created_at).toLocaleString()}</span>{" "}
                            {event.title && <span className="font-medium">{event.title}: </span>}
                            {event.detail}
                          </li>
                        ))}
                      </ul>
                    )}
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
              <div className="w-56 text-right"><EditableText id="space-th-actions">Actions</EditableText></div>
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
                      {item.content_sync_enabled ? (
                        <span
                          className="text-[10px] rounded-full bg-blue-50 text-blue-700 px-1.5 py-0.5 whitespace-nowrap"
                          title="Continuously synced with a chapter, scene, or comic page"
                        >
                          ⇄ <EditableText id="space-badge-synced">Synced</EditableText>
                        </span>
                      ) : (item.linked_chapter_id || item.linked_scene_id || item.linked_page_id) ? (
                        <span
                          className="text-[10px] rounded-full bg-emerald-50 text-emerald-700 px-1.5 py-0.5 whitespace-nowrap"
                          title="Already structured into content"
                        >
                          ✓ <EditableText id="space-badge-linked">Linked</EditableText>
                        </span>
                      ) : null}
                    </div>
                    <div className="w-24 text-right text-[11px] text-slate-500">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5">
                        {item.kind}
                      </span>
                    </div>
                    <div className="w-40 text-right text-xs text-slate-500">
                      {item.updated_at ? new Date(item.updated_at).toLocaleString() : ""}
                    </div>
                    <div className="w-56 text-right flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs">
                      {isOwner && item.kind === "file" && (
                        item.content_sync_enabled ? (
                          <button
                            type="button"
                            disabled={unlinkingItemId === item.id}
                            className="text-slate-500 hover:text-slate-700 disabled:opacity-50"
                            onClick={() => handleUnlinkContent(item)}
                          >
                            <EditableText id="space-unlink-chapter">Unsync</EditableText>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-slate-500 hover:text-slate-700"
                            onClick={() => openLinkDialog(item)}
                          >
                            <EditableText id="space-link-content">Link to content</EditableText>
                          </button>
                        )
                      )}
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

      <Dialog open={!!linkItem} onOpenChange={(open) => { if (!open) setLinkItem(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              <EditableText id="space-link-chapter-title">Link to content</EditableText>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              <EditableText id="space-link-chapter-warning">
                Chapters and scenes: this overwrites the file's current content with the linked text, then keeps both in sync going forward. Comic pages: the file's content is not touched now, but future updates to it will replace the page's image.
              </EditableText>
            </p>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                <EditableText id="space-link-content-type-label">Content type</EditableText>
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={linkContentType === "story" ? "secondary" : "outline"}
                  disabled={contentItems.stories.length === 0}
                  onClick={() => handleLinkContentTypeChange("story")}
                >
                  <EditableText id="space-link-content-type-story">Story</EditableText>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={linkContentType === "screenplay" ? "secondary" : "outline"}
                  disabled={contentItems.screenplays.length === 0}
                  onClick={() => handleLinkContentTypeChange("screenplay")}
                >
                  <EditableText id="space-link-content-type-screenplay">Screenplay</EditableText>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={linkContentType === "comic" ? "secondary" : "outline"}
                  disabled={contentItems.comics.length === 0}
                  onClick={() => handleLinkContentTypeChange("comic")}
                >
                  <EditableText id="space-link-content-type-comic">Comic</EditableText>
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                {linkContentType === "story"
                  ? <EditableText id="space-link-chapter-story-label">Story</EditableText>
                  : linkContentType === "screenplay"
                    ? <EditableText id="space-link-target-label-screenplay">Screenplay</EditableText>
                    : <EditableText id="space-link-target-label-comic">Comic</EditableText>}
              </label>
              <Select value={linkTargetId} onValueChange={setLinkTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select one" />
                </SelectTrigger>
                <SelectContent>
                  {linkTargetOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                {linkContentType === "story"
                  ? <EditableText id="space-link-chapter-chapter-label">Chapter</EditableText>
                  : linkContentType === "screenplay"
                    ? <EditableText id="space-link-entity-label-scene">Scene</EditableText>
                    : <EditableText id="space-link-entity-label-page">Page</EditableText>}
              </label>
              <Select value={linkEntityId} onValueChange={setLinkEntityId} disabled={!linkTargetId || linkEntityOptionsLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={linkEntityOptionsLoading ? "Loading..." : "Select one"} />
                </SelectTrigger>
                <SelectContent>
                  {linkEntityOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setLinkItem(null)}>
                <EditableText id="space-link-chapter-cancel">Cancel</EditableText>
              </Button>
              <Button disabled={!linkEntityId || linkSubmitting} onClick={handleConfirmLink}>
                <EditableText id="space-link-chapter-confirm">Link &amp; sync</EditableText>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={wizardOpen} onOpenChange={(open) => { if (!open) setWizardOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedItemIds.size === 1
                ? `Structure into ${wizardContentType === "comic" ? "page" : wizardContentType === "screenplay" ? "scene" : "chapter"}`
                : `Structure ${selectedItemIds.size} files into ${wizardContentType === "comic" ? "pages" : wizardContentType === "screenplay" ? "scenes" : "chapters"}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                <EditableText id="space-wizard-content-type-label">Content type</EditableText>
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={wizardContentType === "story" ? "secondary" : "outline"}
                  onClick={() => handleWizardContentTypeChange("story")}
                >
                  <EditableText id="space-wizard-type-story">Regular story (novel)</EditableText>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={wizardContentType === "screenplay" ? "secondary" : "outline"}
                  onClick={() => handleWizardContentTypeChange("screenplay")}
                >
                  <EditableText id="space-wizard-type-screenplay">Screenplay story</EditableText>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={wizardContentType === "comic" ? "secondary" : "outline"}
                  disabled={!wizardAllSelectedAreImages}
                  title={wizardAllSelectedAreImages ? undefined : "Comics can only be structured from image files"}
                  onClick={() => handleWizardContentTypeChange("comic")}
                >
                  <EditableText id="space-wizard-type-comic">Comic / manga</EditableText>
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={wizardIsNewMode ? "secondary" : "outline"}
                onClick={() => setWizardBookMode(WIZARD_NEW_MODE[wizardContentType])}
              >
                <EditableText id="space-wizard-mode-new">New</EditableText>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!wizardIsNewMode ? "secondary" : "outline"}
                disabled={wizardExistingOptions.length === 0}
                onClick={() => setWizardBookMode(WIZARD_EXISTING_MODE[wizardContentType])}
              >
                <EditableText id="space-wizard-mode-existing">Existing</EditableText>
              </Button>
            </div>

            {wizardIsNewMode ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">
                  {wizardContentType === "comic"
                    ? <EditableText id="space-wizard-title-label-comic">Comic title</EditableText>
                    : wizardContentType === "screenplay"
                      ? <EditableText id="space-wizard-title-label-screenplay">Screenplay title</EditableText>
                      : <EditableText id="space-wizard-title-label-story">Book title</EditableText>}
                </label>
                <Input value={wizardBookTitle} onChange={(e) => setWizardBookTitle(e.target.value)} placeholder="e.g. Book I — Episode IV: New horizons" />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">
                  <EditableText id="space-wizard-existing-label">Existing item</EditableText>
                </label>
                <Select value={wizardTargetId} onValueChange={setWizardTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose one" />
                  </SelectTrigger>
                  <SelectContent>
                    {wizardExistingOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {wizardContentType === "comic" ? (
              <p className="text-xs text-slate-500">
                <EditableText id="space-wizard-comic-hint">
                  Each selected image becomes its own page, in selection order.
                </EditableText>
              </p>
            ) : selectedItemIds.size === 1 ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">
                  {wizardContentType === "screenplay"
                    ? <EditableText id="space-wizard-item-title-label-screenplay">Scene title</EditableText>
                    : <EditableText id="space-wizard-item-title-label-story">Chapter title</EditableText>}
                </label>
                <Input
                  value={wizardChapterTitle}
                  onChange={(e) => setWizardChapterTitle(e.target.value)}
                  placeholder={wizardContentType === "screenplay" ? "Scene title" : "Chapter title"}
                />
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Each of the {selectedItemIds.size} selected files will become its own {wizardContentType === "screenplay" ? "scene" : "chapter"}, titled after its file name (in
                selection order).
              </p>
            )}

            {wizardError && <p className="text-xs text-red-600">{wizardError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setWizardOpen(false)} disabled={wizardSubmitting}>
                <EditableText id="space-wizard-cancel">Cancel</EditableText>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSubmitStructureWizard}
                disabled={wizardSubmitting || (wizardContentType !== "comic" && selectedItemIds.size === 1 && !wizardChapterTitle.trim())}
              >
                {wizardSubmitting
                  ? "Structuring…"
                  : `Structure ${selectedItemIds.size} ${wizardContentType === "comic" ? "page" : wizardContentType === "screenplay" ? "scene" : "chapter"}${selectedItemIds.size === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isOwner && spaceId && (
        <SpaceUserPicker
          spaceId={spaceId}
          open={userPickerOpen}
          onClose={() => setUserPickerOpen(false)}
          onSaved={(updated) => setSpace((prev) => (prev ? { ...prev, visibility: updated.visibility } : prev))}
        />
      )}
      <CrowdlyFooter />
    </div>
  );
};

export default CreativeSpacePage;