import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Eye, Heart, Pencil, Settings } from "lucide-react";
import EditableText from "@/components/EditableText";
import AddToShelfButton from "@/modules/AddToShelfButton";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/apiBase";
import { shelfMembership } from "@/lib/shelvesApi";
import { cloneWork, deleteWork, setWorkStatus, workPagePath, type WorkKind } from "@/lib/workApi";

export type PageMode = "view" | "edit";

interface WorkHeaderProps {
  kind: WorkKind;
  workId: string;
  title: string;
  visibility?: string | null;
  published?: boolean | null;
  completionStatus?: string | null;
  /** Team member (owner or explicit collaborator): gets Viewing/Editing. */
  isTeam: boolean;
  /** Readers suggesting changes also get the switch (defaults to isTeam). */
  showModeToggle?: boolean;
  /** Who may edit the title in Editing mode (owner; suggesters propose). */
  canEditTitle?: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  canClone: boolean;
  canExport: boolean;
  pageMode: PageMode;
  onPageModeChange: (mode: PageMode) => void;
  /** Owner renames inline in Editing mode; others propose (when supported). */
  onSaveTitle?: (title: string) => Promise<void> | void;
  onOpenSettings: () => void;
  onExport: () => void;
  /** Badges after the standard ones (format, reading direction, language…). */
  extraBadges?: React.ReactNode;
  children?: React.ReactNode;
}

/** Viewing ↔ Editing switch, same look as the story page's. */
export const PageModeToggle: React.FC<{ kind: WorkKind; mode: PageMode; onChange: (mode: PageMode) => void }> = ({
  kind,
  mode,
  onChange,
}) => (
  <div className="inline-flex rounded-lg border bg-gray-50 p-0.5 text-sm" role="group">
    {(["view", "edit"] as const).map((m) => (
      <button
        key={m}
        type="button"
        aria-pressed={mode === m}
        onClick={() => onChange(m)}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1 rounded-md transition",
          mode === m ? "bg-white shadow-sm text-blue-700 font-medium" : "text-gray-600 hover:text-gray-900",
        )}
      >
        {m === "view" ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        {m === "view" ? (
          <EditableText id={`${kind}-mode-viewing`}>Viewing</EditableText>
        ) : (
          <EditableText id={`${kind}-mode-editing`}>Editing</EditableText>
        )}
      </button>
    ))}
  </div>
);

/**
 * Title row of a screenplay or comic page: title (inline-editable for the
 * owner in Editing mode), favorite, shelves, visibility/published/completion
 * badges, the Viewing/Editing switch and Settings, then Mark as finished /
 * Clone / Export / Delete — the story page's header for other kinds.
 */
const WorkHeader: React.FC<WorkHeaderProps> = ({
  kind,
  workId,
  title,
  visibility,
  published,
  completionStatus,
  isTeam,
  isOwner,
  showModeToggle = isTeam,
  canEditTitle = isOwner,
  isAdmin,
  canClone,
  canExport,
  pageMode,
  onPageModeChange,
  onSaveTitle,
  onOpenSettings,
  onExport,
  extraBadges,
  children,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const p = kind;
  const noun = kind === "comic" ? "comic" : "screenplay";
  const [isFavorite, setIsFavorite] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(title);

  useEffect(() => setTitleInput(title), [title]);

  // Favorite state, and "living" (currently reading) once a signed-in user opens it.
  useEffect(() => {
    if (!user?.id) {
      setIsFavorite(false);
      return;
    }
    shelfMembership(kind, workId)
      .then((data) => setIsFavorite(!!data.status?.favorite))
      .catch(() => setIsFavorite(false));
    setWorkStatus(kind, workId, { isLiving: true }).catch(() => {});
  }, [user?.id, kind, workId]);

  const requireLogin = (what: string) => {
    toast({ title: "Login required", description: `You must be logged in to ${what}.`, variant: "destructive" });
  };

  const toggleFavorite = async () => {
    if (!user) return requireLogin(`favorite this ${noun}`);
    const next = !isFavorite;
    setIsFavorite(next);
    try {
      await setWorkStatus(kind, workId, { isFavorite: next });
    } catch (err) {
      setIsFavorite(!next);
      toast({ title: "Error", description: errorMessage(err) ?? "Failed to update favorite", variant: "destructive" });
    }
  };

  const markAsLived = async () => {
    try {
      await setWorkStatus(kind, workId, { isLived: true, isLiving: false });
      toast({ title: "Marked as finished", description: `This ${noun} is now in your 'Lived / Experienced' list.` });
    } catch (err) {
      toast({ title: "Error", description: errorMessage(err), variant: "destructive" });
    }
  };

  const handleClone = async () => {
    if (!user) return requireLogin(`clone this ${noun}`);
    try {
      const { id } = await cloneWork(kind, workId);
      toast({ title: "Cloned", description: `Your copy of this ${noun} is ready.` });
      navigate(workPagePath(kind, id));
    } catch (err) {
      toast({ title: "Error", description: errorMessage(err) ?? "Failed to clone", variant: "destructive" });
    }
  };

  const handleAdminDelete = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete this ${noun}? This cannot be undone.`)) return;
    try {
      await deleteWork(kind, workId);
      navigate("/");
    } catch (err) {
      toast({ title: "Error", description: errorMessage(err), variant: "destructive" });
    }
  };

  const commitTitle = async () => {
    setEditingTitle(false);
    const next = titleInput.trim();
    if (next && next !== title) await onSaveTitle?.(next);
    else setTitleInput(title);
  };

  const editingMode = showModeToggle && pageMode === "edit";
  const completed = (completionStatus ?? "draft") === "completed";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center flex-wrap gap-2 min-w-0">
          {editingMode && canEditTitle && onSaveTitle ? (
            editingTitle ? (
              <input
                type="text"
                value={titleInput}
                autoFocus
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                  if (e.key === "Escape") {
                    setTitleInput(title);
                    setEditingTitle(false);
                  }
                }}
                className="border border-blue-400 px-2 py-1 text-3xl font-bold rounded focus:outline-none min-w-0 w-full sm:w-[32rem]"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                title="Click to edit the title"
                className="text-3xl font-bold text-left border-b border-dashed border-gray-300 hover:border-blue-400 cursor-text px-1 rounded-t hover:bg-blue-50"
                style={{ wordBreak: "break-word" }}
              >
                {title}
              </button>
            )
          ) : (
            <h1 className="text-3xl font-bold" style={{ wordBreak: "break-word" }}>
              {title}
            </h1>
          )}
          <button
            type="button"
            onClick={toggleFavorite}
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
            className="inline-flex items-center justify-center p-1 rounded-full border border-transparent hover:bg-pink-50"
          >
            <Heart className={isFavorite ? "h-5 w-5 text-pink-500 fill-pink-500" : "h-5 w-5 text-gray-400"} />
          </button>
          {user?.id && <AddToShelfButton type={kind} id={workId} />}
          {visibility && (
            <span
              className={cn(
                "px-2 py-1 rounded-full text-xs",
                visibility === "private"
                  ? "bg-yellow-100 text-yellow-800"
                  : visibility === "unlisted"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-green-100 text-green-800",
              )}
            >
              {visibility === "private" ? (
                <EditableText id={`${p}-badge-private`}>Private</EditableText>
              ) : visibility === "unlisted" ? (
                <EditableText id={`${p}-badge-unlisted`}>Unlisted</EditableText>
              ) : (
                <EditableText id={`${p}-badge-public`}>Public</EditableText>
              )}
            </span>
          )}
          {published === false && (
            <span className="px-2 py-1 rounded-full text-xs bg-gray-200 text-gray-700">
              <EditableText id={`${p}-badge-unpublished`}>Unpublished</EditableText>
            </span>
          )}
          <span
            className={cn(
              "px-2 py-1 rounded-full text-xs",
              completed ? "bg-green-100 text-green-800" : "bg-orange-100 text-orange-800",
            )}
          >
            {completed ? (
              <EditableText id={`${p}-badge-completed`}>Completed</EditableText>
            ) : (
              <EditableText id={`${p}-badge-draft`}>Draft</EditableText>
            )}
          </span>
          {extraBadges}
        </div>

        {showModeToggle && (
          <div className="flex items-center gap-2 shrink-0">
            <PageModeToggle kind={kind} mode={pageMode} onChange={onPageModeChange} />
            {isOwner && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm text-gray-700 bg-white hover:bg-gray-50"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">
                  <EditableText id={`${p}-settings-btn`}>Settings</EditableText>
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {user && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={markAsLived}
            className="inline-flex items-center px-2 py-1 rounded-full border border-dashed border-teal-300 text-[11px] text-teal-700 hover:bg-teal-50"
          >
            <EditableText id={`${p}-mark-finished-btn`}>Mark as finished</EditableText>
          </button>
          {canClone && (
            <button
              type="button"
              onClick={handleClone}
              className="inline-flex items-center px-2 py-1 rounded-full border border-dashed border-gray-300 text-[11px] text-gray-700 hover:bg-gray-50"
            >
              <EditableText id={`${p}-clone-btn`}>Clone</EditableText>
            </button>
          )}
          {canExport && (
            <button
              type="button"
              onClick={onExport}
              className="inline-flex items-center px-2 py-1 rounded-full border border-dashed border-indigo-300 text-[11px] text-indigo-700 hover:bg-indigo-50"
            >
              <Download className="h-3 w-3 mr-1" />
              <EditableText id={`${p}-export-btn`}>Export</EditableText>
            </button>
          )}
          {/* Platform staff can remove works they don't own; owners delete from Settings. */}
          {!isOwner && isAdmin && (
            <button
              type="button"
              onClick={handleAdminDelete}
              className="inline-flex items-center px-2 py-1 rounded-full border border-dashed border-red-300 text-[11px] text-red-700 hover:bg-red-50"
            >
              <EditableText id={`${p}-delete-btn`}>{`Delete ${noun.charAt(0).toUpperCase()}${noun.slice(1)}`}</EditableText>
            </button>
          )}
        </div>
      )}
      {children}
    </section>
  );
};

export default WorkHeader;
