import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, Users, Clock, GitBranch, BookText } from "lucide-react";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import EditableText from "@/components/EditableText";
import ChapterEditor from "@/components/ChapterEditor";
import ChapterInteractions from "@/components/ChapterInteractions";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import ParagraphBranchPopover from "@/components/ParagraphBranchPopover";
import StoryContentTypeSelector from "@/components/StoryContentTypeSelector";
import StoryBranchList from "@/components/StoryBranchList";
import ContributionsModule, { ContributionRow } from "@/modules/contributions";

// Use same-origin API base in development; dev server proxies to backend.
// In production, VITE_API_BASE_URL can point at the deployed API.
const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

type Contributor = {
  id: string;
  email: string;
  role: string;
};

type Proposal = {
  id: string;
  story_title_id: string;
  target_type: "story_title" | "chapter" | "paragraph" | "branch";
  target_chapter_id: string | null;
  target_branch_id: number | null;
  target_path: string | null;
  proposed_text: string;
  author_user_id: string;
  status: "undecided" | "approved" | "declined";
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  author_email?: string;
};

// --- Modular components for each section ---
const ContributorsSection = ({
  contributors,
  loading,
}: {
  contributors: Contributor[];
  loading: boolean;
}) => (
  <div className="p-6">
    <h2 className="text-2xl font-semibold mb-4">Contributors</h2>
    <div className="bg-white border rounded p-6 shadow-sm">
      {loading ? (
        <div className="text-gray-500 text-sm">Loading contributors...</div>
      ) : contributors.length === 0 ? (
        <div className="text-gray-400 text-sm">No contributors recorded yet.</div>
      ) : (
        <ul className="space-y-1 text-sm">
          {contributors.map((c) => (
            <li key={c.id} className="flex items-center justify-between">
              <span>{c.email}</span>
              <span className="text-xs text-gray-500">
                {c.role === 'creator' ? 'Creator' : 'Contributor'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
);
const RevisionsSection = ({
  storyTitleRevisions,
  chapterRevisions,
  chapterRevisionsLoading,
}: {
  storyTitleRevisions: any[];
  chapterRevisions: any[];
  chapterRevisionsLoading: boolean;
}) => (
  <div className="p-6 space-y-6">
    <div>
      <h2 className="text-2xl font-semibold mb-4">Story Title Revisions</h2>
      <div className="bg-white border rounded p-6 shadow-sm space-y-2">
        {storyTitleRevisions.length === 0 ? (
          <div className="text-gray-400 text-sm">No title revisions recorded yet.</div>
        ) : (
          <ul className="space-y-1 text-sm">
            {storyTitleRevisions.map((rev) => (
              <li key={rev.id ?? `${rev.story_title_id}-${rev.revision_number}`}>
                <span className="font-medium">{rev.new_title}</span>{" "}
                <span className="text-xs text-gray-500">
                  (rev {rev.revision_number} at {new Date(rev.created_at).toLocaleString()})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>

    <div>
      <h2 className="text-2xl font-semibold mb-4">Chapter Revisions</h2>
      <div className="bg-white border rounded p-6 shadow-sm space-y-2">
        {chapterRevisionsLoading ? (
          <div className="text-gray-500 text-sm">Loading chapter revisions...</div>
        ) : chapterRevisions.length === 0 ? (
          <div className="text-gray-400 text-sm">No chapter revisions recorded yet.</div>
        ) : (
          <ul className="space-y-1 text-sm">
            {chapterRevisions.map((rev) => (
              <li
                key={rev.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
              >
                <div>
                  <span className="font-medium">{rev.chapter_title}</span>{" "}
                  <span className="text-xs text-gray-500">
                    (rev {rev.revision_number} at {new Date(rev.created_at).toLocaleString()})
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {rev.revision_reason || 'Chapter updated'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  </div>
);
const BranchesSection = ({ storyId }: { storyId: string }) => (
  <div className="p-6">
    <h2 className="text-2xl font-semibold mb-4">Story Branches</h2>
    <StoryBranchList storyId={storyId} />
  </div>
);

// --- MAIN COMPONENT ---
const Story = () => {
  const { story_id, chapter_id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, roles, hasRole } = useAuth();
  const [story, setStory] = useState<{
    story_title_id: string;
    title: string;
    creator_id?: string;
    visibility?: string;
    published?: boolean;
  } | null>(null);

  // Helper: count "words" in a paragraph in a way that ignores
  // punctuation and collapses multiple whitespace. This is used for the
  // Contributions tab word counts so that they are consistent and
  // independent of how the database may tokenize text.
  const countWords = (text: string | null | undefined): number => {
    if (!text) return 0;
    // Replace any sequence of non-letter/number characters with a single
    // space, then split on whitespace.
    const cleaned = String(text)
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    if (!cleaned) return 0;
    return cleaned.split(/\s+/).length;
  };
  const [chapters, setChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [storyError, setStoryError] = useState<{ status: number; message: string } | null>(null);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [contributorsLoading, setContributorsLoading] = useState(false);
  const [chapterRevisions, setChapterRevisions] = useState<any[]>([]);
  const [chapterRevisionsLoading, setChapterRevisionsLoading] = useState(false);
  // Active chapter for the "experiencing the story" view
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  // Story contributions (paragraph-level) for Contributions tab
  const [contributions, setContributions] = useState<ContributionRow[]>([]);
  const [contributionsLoading, setContributionsLoading] = useState(false);
  const [contributionFilter, setContributionFilter] = useState<"total" | "approved" | "denied" | "undecided">("total");
  // CRDT-style proposals (initial lightweight implementation)
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  // UI tab state
  const [activeTab, setActiveTab] = useState<"story" | "contributions" | "contributors" | "revisions" | "branches">("story");
  // Experience vs contribute modes for the story page
  const [mode, setMode] = useState<"experience" | "contribute">("experience");
  // Inline chapter title editing in contribute mode
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editingChapterTitle, setEditingChapterTitle] = useState("");
  // When adding a chapter, optionally remember the chapter after which
  // the new one should appear. If null, the new chapter is appended at
  // the end (existing behavior).
  const [insertAfterChapterId, setInsertAfterChapterId] = useState<string | null>(null);
  // Inline paragraph editing state (contribute mode)
  const [editingParagraph, setEditingParagraph] = useState<{
    chapterId: string;
    index: number;
  } | null>(null);
  const [editingParagraphText, setEditingParagraphText] = useState("");

  // Inline branch paragraphs created via quick "Create Branch" action.
  // Each entry represents a branch positioned under a specific base
  // paragraph. Only the active branch is rendered as a textarea; all
  // others are shown as inline text, like regular paragraphs.
  const [inlineBranches, setInlineBranches] = useState<{
    id: number;
    chapterId: string;
    parentParagraphIndex: number;
    text: string;
  }[]>([]);
  const [editingBranchId, setEditingBranchId] = useState<number | null>(null);

  // Minimal inline "add chapter" UI in contribute mode
  const [addChapterMode, setAddChapterMode] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [newChapterBody, setNewChapterBody] = useState("");
  const addChapterContainerRef = useRef<HTMLDivElement | null>(null);

  // --- Add missing state hooks for title editing ---
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);

  // Fetch story and chapters from backend
  const fetchStoryAndChapters = async () => {
    if (!story_id) return;
    setLoading(true);
    setStoryError(null);
    try {
      // Story title (with optional userId for access-controlled stories)
      const titleParams = new URLSearchParams();
      if (user?.id) {
        titleParams.set('userId', user.id);
      }
      const titleUrl = titleParams.toString()
        ? `${API_BASE}/story-titles/${story_id}?${titleParams.toString()}`
        : `${API_BASE}/story-titles/${story_id}`;

      const res = await fetch(titleUrl);
      if (!res.ok) {
        let body: any = {};
        try {
          body = await res.json();
        } catch {
          body = {};
        }

        if (res.status === 403) {
          setStory(null);
          setChapters([]);
          setStoryError({ status: 403, message: body.error || 'This story is private.' });
        } else if (res.status === 404) {
          setStory(null);
          setChapters([]);
          setStoryError({ status: 404, message: body.error || 'Story not found' });
        } else {
          console.error('Failed to fetch story', { status: res.status, body });
          setStory(null);
          setChapters([]);
          setStoryError({ status: res.status, message: body.error || 'Failed to load story' });
        }
        setLoading(false);
        return;
      }
      const titleRow = await res.json();
      setStory(titleRow);
      setStoryError(null);

      // Chapters
      const params = new URLSearchParams({ storyTitleId: story_id });
      const chaptersRes = await fetch(`${API_BASE}/chapters?${params.toString()}`);
      let chaptersData: any[] = [];
      if (chaptersRes.ok) {
        chaptersData = await chaptersRes.json();
        setChapters(Array.isArray(chaptersData) ? chaptersData : []);
      } else {
        setChapters([]);
      }

      // Chapter revisions (best-effort, aggregated across all chapters)
      if (Array.isArray(chaptersData) && chaptersData.length > 0) {
        try {
          setChapterRevisionsLoading(true);
          const revResults = await Promise.all(
            chaptersData.map(async (ch: any) => {
              try {
                const resp = await fetch(`${API_BASE}/chapter-revisions/${ch.chapter_id}`);
                if (!resp.ok) return [] as any[];
                const data = await resp.json();
                if (!Array.isArray(data)) return [] as any[];
                return data.map((rev: any) => ({
                  ...rev,
                  chapter_title: ch.chapter_title,
                }));
              } catch (err) {
                console.error('Failed to fetch chapter revisions for', ch.chapter_id, err);
                return [] as any[];
              }
            }),
          );
          const combined = revResults.flat().sort((a, b) => {
            const da = new Date(a.created_at ?? 0).getTime();
            const db = new Date(b.created_at ?? 0).getTime();
            return da - db;
          });
          setChapterRevisions(combined);
        } catch (err) {
          console.error('Failed to aggregate chapter revisions', err);
          setChapterRevisions([]);
        } finally {
          setChapterRevisionsLoading(false);
        }
      } else {
        setChapterRevisions([]);
      }

      // Contributors (best-effort)
      try {
        setContributorsLoading(true);
        const contribRes = await fetch(`${API_BASE}/stories/${story_id}/contributors`);
        if (!contribRes.ok) {
          const body = await contribRes.json().catch(() => ({}));
          console.error('Failed to fetch contributors', { status: contribRes.status, body });
          setContributors([]);
        } else {
          const data = await contribRes.json();
          setContributors(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Failed to fetch contributors', err);
        setContributors([]);
      } finally {
        setContributorsLoading(false);
      }
    } catch (err) {
      console.error("Failed to fetch story and chapters", err);
      setStory(null);
      setChapters([]);
      setStoryError({ status: 0, message: 'Failed to load story' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (story_id) {
      fetchStoryAndChapters();
    }
    // eslint-disable-next-line
  }, [story_id, user?.id]);

  // Keep currentChapterId in sync with loaded chapters and optional chapter_id param
  useEffect(() => {
    if (!Array.isArray(chapters) || chapters.length === 0) {
      setCurrentChapterId(null);
      return;
    }

    // If URL specifies a chapter_id and it exists, prefer that
    if (chapter_id) {
      const found = chapters.find((ch) => ch.chapter_id === chapter_id);
      if (found) {
        setCurrentChapterId(chapter_id);
        return;
      }
    }

    // Fallback: ensure currentChapterId always points at a real chapter
    const hasCurrent = currentChapterId && chapters.some((ch) => ch.chapter_id === currentChapterId);
    if (!hasCurrent) {
      setCurrentChapterId(chapters[0].chapter_id);
    }
  }, [chapters, chapter_id, currentChapterId]);

  // If a chapter_id is in the URL, default to contribute mode so the chapter area is visible
  useEffect(() => {
    if (chapter_id) {
      setMode("contribute");
    }
  }, [chapter_id]);

  // When a specific chapter_id is present in the URL, scroll to and briefly highlight it
  useEffect(() => {
    if (!chapter_id) return;
    if (!chapters || chapters.length === 0) return;
    const el = document.getElementById("chapter-" + chapter_id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("ring-2", "ring-blue-300", "ring-offset-2");
    const timeout = window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-blue-300", "ring-offset-2");
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [chapter_id, chapters]);

  // Permission checks
  const isOwner = user && story && story.creator_id === user.id;
  const canDeleteStory =
    user &&
    story &&
    (
      isOwner ||
      hasRole("platform_admin") ||
      hasRole("editor")
    );

  // DELETE Story handler
  const handleDeleteStory = async () => {
    if (!story) return;
    if (!canDeleteStory) {
      return toast({ title: "Unauthorized", description: "You are not allowed to delete this story.", variant: "destructive" });
    }
    if (!window.confirm("Are you sure you want to permanently delete this story? This cannot be undone.")) return;

    try {
      const res = await fetch(`${API_BASE}/story-titles/${story.story_title_id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Error", description: body.error || "Could not delete story", variant: "destructive" });
        return;
      }
      toast({ title: "Story deleted", description: "The story has been removed." });
      navigate("/");
    } catch (err) {
      console.error("Failed to delete story", err);
      toast({ title: "Error", description: "Could not delete story", variant: "destructive" });
    }
  };

  // Title Editing Handlers
  const handleStartEditTitle = () => {
    setTitleInput(story?.title || "");
    setIsEditingTitle(true);
  };

  const handleCancelEditTitle = () => {
    setIsEditingTitle(false);
    setTitleInput(story?.title || "");
  };

  const handleChangeTitle = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitleInput(e.target.value);
  };

  const handleSaveTitle = async () => {
    if (savingTitle) return;
    if (!titleInput.trim() || !story_id) {
      setIsEditingTitle(false);
      setTitleInput(story?.title || "");
      return;
    }

    setSavingTitle(true);
    const newTitle = titleInput.trim();

    try {
      const res = await fetch(`${API_BASE}/story-titles/${story_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, userId: user?.id }),
      });

      setSavingTitle(false);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Error", description: body.error || "Could not update title", variant: "destructive" });
        return;
      }

      const updatedRow = await res.json();
      setStory(updatedRow);
      setIsEditingTitle(false);
      toast({ title: "Story Title updated", description: "The title has been changed." });
      // Refresh revisions
      fetchStoryTitleRevisions();
    } catch (err) {
      console.error("Failed to update title", err);
      setSavingTitle(false);
      toast({ title: "Error", description: "Could not update title", variant: "destructive" });
    }
  };

  const handleTitleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveTitle();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelEditTitle();
    }
  };

  // Chapter title inline-edit handlers (contribute mode)
  const startEditChapterTitle = (chapter: any) => {
    setEditingChapterId(chapter.chapter_id);
    setEditingChapterTitle(chapter.chapter_title || "");
  };

  const cancelEditChapterTitle = () => {
    setEditingChapterId(null);
    setEditingChapterTitle("");
  };

  const handleChapterTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingChapterTitle(e.target.value);
  };

  const saveChapterTitle = async (chapter: any) => {
    const newTitle = editingChapterTitle.trim();
    setEditingChapterId(null);
    if (!newTitle || newTitle === chapter.chapter_title) {
      setEditingChapterTitle("");
      return;
    }
    setEditingChapterTitle("");
    await handleUpdateChapter(chapter.chapter_id, { chapter_title: newTitle });
  };

  const handleChapterTitleKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>,
    chapter: any,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await saveChapterTitle(chapter);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditChapterTitle();
    }
  };

  // Inline paragraph editing handlers
  const startEditParagraph = (chapter: any, index: number, text: string) => {
    setEditingParagraph({ chapterId: chapter.chapter_id, index });
    setEditingParagraphText(text);
  };

  const cancelEditParagraph = () => {
    setEditingParagraph(null);
    setEditingParagraphText("");
  };

  const saveParagraph = async (chapter: any, index: number) => {
    const raw = editingParagraphText;
    setEditingParagraph(null);
    // If nothing changed, bail out
    if (!Array.isArray(chapter.paragraphs)) {
      setEditingParagraphText("");
      return;
    }

    const trimmed = raw.trim();

    // Story initiator edits go directly into canonical chapter text;
    // contributors submit proposals instead so they can be approved or
    // declined later.
    if (isOwner) {
      if (!trimmed) {
        // Empty -> delete this paragraph
        const newParagraphs = [...chapter.paragraphs];
        newParagraphs.splice(index, 1);
        setEditingParagraphText("");
        await handleUpdateChapter(chapter.chapter_id, { paragraphs: newParagraphs });
        return;
      }

      // Split on newlines so each line becomes its own paragraph
      const lines = raw
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean);

      const newParagraphs = [...chapter.paragraphs];
      // Replace the edited paragraph with one or more new ones
      newParagraphs.splice(index, 1, ...lines);

      setEditingParagraphText("");
      await handleUpdateChapter(chapter.chapter_id, { paragraphs: newParagraphs });
      return;
    }

    // Non-owner: create a proposal instead of modifying canonical text.
    try {
      const proposedText = trimmed ? raw : ""; // empty string means delete
      await createProposal({
        targetType: "paragraph",
        targetChapterId: chapter.chapter_id,
        targetPath: String(index),
        proposedText,
      });
      toast({
        title: "Change proposed",
        description: "Your paragraph changes are pending review.",
      });
    } catch (err) {
      console.error("Failed to submit paragraph proposal", err);
      toast({
        title: "Error",
        description: "Failed to submit paragraph proposal.",
        variant: "destructive",
      });
    } finally {
      setEditingParagraphText("");
    }
  };

  const handleParagraphKeyDown = async (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    chapter: any,
    index: number,
  ) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      // allow newline with plain Enter, save on Ctrl+Enter / Cmd+Enter
      e.preventDefault();
      await saveParagraph(chapter, index);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditParagraph();
    }
  };

  // Inline "add chapter" handlers (contribute mode)
  const resetNewChapterForm = () => {
    setNewChapterTitle("");
    setNewChapterBody("");
    setAddChapterMode(false);
    setInsertAfterChapterId(null);
  };

  const handleSaveNewChapter = async () => {
    const title = newChapterTitle.trim();
    const body = newChapterBody.trim();
    if (!title && !body) {
      resetNewChapterForm();
      return;
    }

    const paragraphs = body
      ? body
          .split(/\n+/)
          .map((p) => p.trim())
          .filter(Boolean)
      : [""];

    await handleCreateChapter({
      chapter_title: title || "New chapter",
      paragraphs,
    });
    resetNewChapterForm();
  };

  // Close or save the inline add-chapter container when clicking outside of it
  useEffect(() => {
    if (!addChapterMode) return;

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (!addChapterContainerRef.current) return;
      if (addChapterContainerRef.current.contains(event.target as Node)) {
        // Click happened inside the container; ignore.
        return;
      }

      const title = newChapterTitle.trim();
      const body = newChapterBody.trim();

      if (!title && !body) {
        // Nothing entered: just close the block.
        resetNewChapterForm();
      } else {
        // Content entered: save the new chapter.
        handleSaveNewChapter();
      }
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
    };
  }, [addChapterMode, newChapterTitle, newChapterBody]);

  // CRUD Handlers for chapters (via backend)
  // CREATE
  const handleCreateChapter = async ({ chapter_title, paragraphs }: { chapter_title: string; paragraphs: string[] }) => {
    if (!story_id) return;
    try {
      const res = await fetch(`${API_BASE}/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyTitleId: story_id,
          chapterTitle: chapter_title,
          paragraphs,
          userId: user?.id,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Error", description: body.error || "Failed to add chapter", variant: "destructive" });
        return;
      }

      const created = await res.json();
      toast({ title: "Chapter Created", description: `Added chapter \"${chapter_title}\".` });

      // Compute the new chapter order in the UI so that, when requested,
      // the new chapter appears directly below the chapter whose menu
      // was used. Otherwise, append it at the end.
      const current = Array.isArray(chapters) ? chapters : [];
      let newChapters: any[];
      const withoutCreated = current.filter((ch) => ch.chapter_id !== created.chapter_id);

      if (!insertAfterChapterId) {
        newChapters = [...withoutCreated, created];
      } else {
        const idx = withoutCreated.findIndex((ch) => ch.chapter_id === insertAfterChapterId);
        if (idx === -1) {
          newChapters = [...withoutCreated, created];
        } else {
          const before = withoutCreated.slice(0, idx + 1);
          const after = withoutCreated.slice(idx + 1);
          newChapters = [...before, created, ...after];
        }
      }

      setChapters(newChapters);

      // Persist the ordering in the backend so that future loads show
      // the same chapter order.
      try {
        await fetch(`${API_BASE}/stories/${story_id}/chapters/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chapterIds: newChapters.map((ch) => ch.chapter_id),
          }),
        });
      } catch (orderErr) {
        console.error("Failed to persist chapter reorder", orderErr);
      }
    } catch (err) {
      console.error("Failed to create chapter", err);
      toast({ title: "Error", description: "Failed to add chapter", variant: "destructive" });
    }
  };
  // UPDATE
  const handleUpdateChapter = async (
    chapter_id: string,
    patch: { chapter_title?: string; paragraphs?: string[] }
  ) => {
    try {
      const res = await fetch(`${API_BASE}/chapters/${chapter_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterTitle: patch.chapter_title,
          paragraphs: patch.paragraphs,
          userId: user?.id,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Error", description: body.error || "Failed to update chapter", variant: "destructive" });
        return;
      }
      toast({ title: "Chapter Updated", description: "Saved changes." });
      fetchStoryAndChapters();
    } catch (err) {
      console.error("Failed to update chapter", err);
      toast({ title: "Error", description: "Failed to update chapter", variant: "destructive" });
    }
  };
  // DELETE
  const handleDeleteChapter = async (chapter_id: string) => {
    try {
      const res = await fetch(`${API_BASE}/chapters/${chapter_id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Error", description: body.error || "Could not delete chapter", variant: "destructive" });
        return;
      }
      toast({ title: "Deleted", description: "Chapter removed" });
      fetchStoryAndChapters();
    } catch (err) {
      console.error("Failed to delete chapter", err);
      toast({ title: "Error", description: "Could not delete chapter", variant: "destructive" });
    }
  };

  // Legacy branch creation logic used by the configuration popover.
  // This now updates an existing branch instead of creating a new one.
  const handleConfigureExistingBranch = async (
    branchId: number,
    {
      branchName,
      paragraphs,
    }: {
      branchName: string;
      paragraphs: string[];
      language: string;
      metadata: any;
    },
  ) => {
    // Compose branch_text as joined array
    const branch_text = paragraphs.join("\n\n");

    if (!user) {
      toast({
        title: "Login required",
        description: "You must be logged in to edit a branch.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (isOwner) {
        const res = await fetch(`${API_BASE}/paragraph-branches/${branchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branchText: branch_text,
            parentParagraphText: branchName || undefined,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          toast({
            title: "Error",
            description: body.error || "Failed to update branch.",
            variant: "destructive",
          });
          return;
        }

        // Update local inline branch cache so the textarea reflects changes
        const updated = await res.json();
        setInlineBranches((prev) =>
          prev.map((b) => (b.id === branchId ? { ...b, text: updated.branch_text ?? branch_text } : b)),
        );

        toast({
          title: "Branch updated",
          description: "Your branch has been updated.",
        });
      } else {
        await createProposal({
          targetType: "branch",
          targetBranchId: branchId,
          proposedText: branch_text,
          targetPath: null,
        });
        // Keep local inline state so the contributor still sees their text
        setInlineBranches((prev) =>
          prev.map((b) => (b.id === branchId ? { ...b, text: branch_text } : b)),
        );
        toast({
          title: "Branch proposal submitted",
          description: "Your branch changes are pending review.",
        });
      }
    } catch (e) {
      console.error("Failed to update branch", e);
      toast({
        title: "Error",
        description: "Something went wrong updating the branch.",
        variant: "destructive",
      });
    }
  };

  // Quick inline branch creation: create an empty branch row and show a
  // new editable paragraph directly under the source paragraph.
  const handleQuickCreateBranch = async (
    chapter: any,
    paragraphIndex: number,
    paragraphText: string,
  ) => {
    if (!user) {
      toast({
        title: "Login Required",
        description: "You must be logged in to create a branch.",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/paragraph-branches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId: chapter.chapter_id,
          parentParagraphIndex: paragraphIndex,
          parentParagraphText: paragraphText || "",
          branchText: "", // start empty; user will type into inline editor
          userId: user.id,
          language: "en",
          metadata: null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({
          title: "Error",
          description: body.error || "Failed to create branch.",
          variant: "destructive",
        });
        return;
      }

      const created = await res.json();
      setInlineBranches((prev) => [
        ...prev,
        {
          id: created.id,
          chapterId: created.chapter_id,
          parentParagraphIndex: paragraphIndex,
          text: "",
        },
      ]);
      // Immediately focus this new branch for inline editing
      setEditingBranchId(created.id);
    } catch (e) {
      console.error("Failed to create branch", e);
      toast({
        title: "Error",
        description: "Something went wrong creating the branch.",
        variant: "destructive",
      });
    }
  };

  const handleInlineBranchTextChange = (branchId: number, text: string) => {
    setInlineBranches((prev) => prev.map((b) => (b.id === branchId ? { ...b, text } : b)));
  };

  const handleInlineBranchBlur = async (branchId: number) => {
    const branch = inlineBranches.find((b) => b.id === branchId);
    if (!branch) return;

    if (!user) {
      toast({
        title: "Login required",
        description: "You must be logged in to edit a branch.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (isOwner) {
        // Story initiator: write directly to canonical branch text
        const res = await fetch(`${API_BASE}/paragraph-branches/${branchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branchText: branch.text ?? "" }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("Failed to save inline branch", { status: res.status, body });
          toast({
            title: "Error",
            description: body.error || "Failed to save branch text.",
            variant: "destructive",
          });
          return;
        }
      } else {
        // Contributors: send a proposal instead of modifying canonical text
        const proposedText = branch.text ?? "";
        await createProposal({
          targetType: "branch",
          targetBranchId: branch.id,
          proposedText,
          targetPath: null,
        });
        toast({
          title: "Branch proposal submitted",
          description: "Your branch changes are pending review.",
        });
      }
    } catch (err) {
      console.error("Failed to save inline branch", err);
      toast({
        title: "Error",
        description: "Failed to save branch text.",
        variant: "destructive",
      });
      return;
    }

    // After saving or proposing, return this branch to read-only inline text mode
    setEditingBranchId((current) => (current === branchId ? null : current));
  };

  // Only allow chapter/paragraph CRUD for logged-in users:
  // For chapter editor: if no user, render as read-only/disabled
  const canCRUDChapters = !!user;

  // --- Story title revisions (fetched from backend) ---
  const [storyTitleRevisions, setStoryTitleRevisions] = useState<any[]>([]);

  // Reactions and comments state
  const [reactions, setReactions] = useState<{ reaction_type: string; count: number }[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");

  const fetchStoryTitleRevisions = async () => {
    if (!story_id) return;
    try {
      const res = await fetch(`${API_BASE}/story-title-revisions/${story_id}`);
      if (!res.ok) {
        setStoryTitleRevisions([]);
        return;
      }
      const data = await res.json();
      setStoryTitleRevisions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch story title revisions", err);
      setStoryTitleRevisions([]);
    }
  };

  type ProposalTargetType = "story_title" | "chapter" | "paragraph" | "branch";

  async function createProposal(args: {
    targetType: ProposalTargetType;
    targetChapterId?: string;
    targetBranchId?: number;
    targetPath?: string | null;
    proposedText: string;
  }) {
    if (!story_id) return;
    if (!user) {
      toast({
        title: "Login required",
        description: "You must be logged in to submit a proposal.",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/stories/${story_id}/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: args.targetType,
          targetChapterId: args.targetChapterId,
          targetBranchId: args.targetBranchId,
          targetPath: args.targetPath ?? null,
          proposedText: args.proposedText,
          authorUserId: user.id,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("Failed to create proposal", { status: res.status, body });
        toast({
          title: "Error",
          description: body.error || "Failed to submit proposal.",
          variant: "destructive",
        });
        return;
      }

      // Refresh proposals so the Contributions tab and experience view reflect the new entry
      await fetchProposals();
    } catch (err) {
      console.error("Failed to create proposal", err);
      toast({
        title: "Error",
        description: "Failed to submit proposal.",
        variant: "destructive",
      });
    }
  }

  // Helper to load proposals for this story (currently only undecided proposals)
  const fetchProposals = async () => {
    if (!story_id) return;
    try {
      setProposalsLoading(true);
      const res = await fetch(`${API_BASE}/stories/${story_id}/proposals?status=undecided`);
      if (!res.ok) {
        setProposals([]);
        return;
      }
      const data = await res.json();
      setProposals(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch proposals", err);
      setProposals([]);
    } finally {
      setProposalsLoading(false);
    }
  };

  // Load story title revisions, reactions, comments, contributions, and proposals when story_id changes
  useEffect(() => {
    const load = async () => {
      if (!story_id) return;
      await fetchStoryTitleRevisions();
      try {
        const reactionsRes = await fetch(`${API_BASE}/reactions?storyTitleId=${story_id}`);
        if (reactionsRes.ok) {
          const data = await reactionsRes.json();
          setReactions(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Failed to fetch reactions', err);
      }
      try {
        const commentsRes = await fetch(`${API_BASE}/comments?storyTitleId=${story_id}`);
        if (commentsRes.ok) {
          const data = await commentsRes.json();
          setComments(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Failed to fetch comments', err);
      }
      // Contributions for this story
      try {
        setContributionsLoading(true);
        const contribRes = await fetch(`${API_BASE}/stories/${story_id}/contributions`);
        if (contribRes.ok) {
          const raw = await contribRes.json();
          const rows = Array.isArray(raw) ? raw : [];
          const mapped: ContributionRow[] = rows.map((row: any, index: number) => ({
            id: row.id ?? `${row.chapter_id ?? 'ch'}-${row.paragraph_index ?? index}-${row.revision_number ?? ''}`,
            story_title: row.story_title ?? '',
            chapter_title: row.chapter_title ?? '',
            paragraph: row.new_paragraph ?? '',
            user: row.user_email ?? 'Unknown',
            date: row.created_at ? new Date(row.created_at).toLocaleString() : '',
            // Always compute word count on the frontend using the same
            // logic so results are stable and not tied to DB
            // tokenization details.
            words: countWords(row.new_paragraph),
            likes: typeof row.likes === 'number' ? row.likes : 0,
            dislikes: typeof row.dislikes === 'number' ? row.dislikes : 0,
            comments: typeof row.comments === 'number' ? row.comments : 0,
            status: (row.status as ContributionRow['status']) || 'approved',
          }));
          setContributions(mapped);
        } else {
          setContributions([]);
        }
      } catch (err) {
        console.error('Failed to fetch story contributions', err);
        setContributions([]);
      } finally {
        setContributionsLoading(false);
      }

      // Proposals (undecided) for this story
      await fetchProposals();
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story_id]);

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <CrowdlyHeader />
        <div className="flex-grow flex justify-center items-center">
          <Loader2 className="animate-spin h-8 w-8" />
        </div>
        <CrowdlyFooter />
      </div>
    );
  }

  if (!story && storyError) {
    const isForbidden = storyError.status === 403;
    return (
      <div className="flex flex-col min-h-screen">
        <CrowdlyHeader />
        <div className="flex-grow flex flex-col justify-center items-center text-center px-4">
          <h1 className="text-4xl font-bold mb-4">{isForbidden ? 'Private story' : '404'}</h1>
          <p className="text-xl text-gray-600 mb-4">
            {storyError.message}
          </p>
          <a href="/" className="text-blue-500 hover:text-blue-700 underline mb-2">
            Return to Home
          </a>
          {isForbidden && !user && (
            <p className="text-sm text-gray-500 max-w-md">
              You may need to log in with an account that has access or ask the story owner to share it with you.
            </p>
          )}
        </div>
        <CrowdlyFooter />
      </div>
    );
  }

  const handleReact = async (reactionType: string) => {
    if (!user) {
      toast({
        title: "Login required",
        description: "You must be logged in to react.",
        variant: "destructive",
      });
      return;
    }
    if (!story) return;
    try {
      const res = await fetch(`${API_BASE}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          storyTitleId: story.story_title_id,
          reactionType,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Error", description: body.error || "Failed to react", variant: "destructive" });
        return;
      }
      // Reload reactions
      const reactionsRes = await fetch(`${API_BASE}/reactions?storyTitleId=${story.story_title_id}`);
      if (reactionsRes.ok) {
        const data = await reactionsRes.json();
        setReactions(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to send reaction', err);
      toast({ title: "Error", description: "Failed to react", variant: "destructive" });
    }
  };

  const handlePostComment = async () => {
    if (!user) {
      toast({
        title: "Login required",
        description: "You must be logged in to comment.",
        variant: "destructive",
      });
      return;
    }
    if (!story || !newComment.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          storyTitleId: story.story_title_id,
          body: newComment.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Error", description: body.error || "Failed to post comment", variant: "destructive" });
        return;
      }
      setNewComment("");
      // Append or reload comments
      setComments((prev) => [...prev, body]);
    } catch (err) {
      console.error('Failed to post comment', err);
      toast({ title: "Error", description: "Failed to post comment", variant: "destructive" });
    }
  };

  const handleCloneStory = async () => {
    if (!story) return;
    if (!user) {
      toast({
        title: "Login required",
        description: "You must be logged in to clone a story.",
        variant: "destructive",
      });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/stories/${story.story_title_id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Error", description: body.error || "Failed to clone story", variant: "destructive" });
        return;
      }
      const newId = body.storyTitleId;
      toast({ title: "Story cloned", description: "Opening cloned story." });
      if (newId) {
        navigate(`/story/${newId}`);
      }
    } catch (err) {
      console.error('Failed to clone story', err);
      toast({ title: "Error", description: "Failed to clone story", variant: "destructive" });
    }
  };

  const toggleVisibility = async () => {
    if (!story) return;
    const nextVisibility = story.visibility === 'private' ? 'public' : 'private';
    try {
      const res = await fetch(`${API_BASE}/story-titles/${story.story_title_id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: nextVisibility }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Error", description: body.error || "Failed to update visibility", variant: "destructive" });
        return;
      }
      setStory(body);
      toast({ title: "Visibility updated", description: `Story is now ${nextVisibility}.` });
    } catch (err) {
      console.error('Failed to toggle visibility', err);
      toast({ title: "Error", description: "Failed to update visibility", variant: "destructive" });
    }
  };

  const togglePublished = async () => {
    if (!story) return;
    const nextPublished = !(story.published ?? true);
    try {
      const res = await fetch(`${API_BASE}/story-titles/${story.story_title_id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: nextPublished }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Error", description: body.error || "Failed to update publish state", variant: "destructive" });
        return;
      }
      setStory(body);
      toast({
        title: nextPublished ? "Story published" : "Story unpublished",
        description: nextPublished
          ? "The story is now visible in public listings."
          : "The story is now hidden from public listings.",
      });
    } catch (err) {
      console.error('Failed to toggle published state', err);
      toast({ title: "Error", description: "Failed to update publish state", variant: "destructive" });
    }
  };

  const handleApproveProposal = async (proposalId: string) => {
    try {
      const res = await fetch(`${API_BASE}/proposals/${proposalId}/approve`, {
        method: "POST",
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        toast({
          title: "Error",
          description: body.error || "Failed to approve proposal",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Proposal approved", description: "Changes have been merged into the story." });
      // Refresh story/chapters and proposals so UI reflects the merge
      await fetchStoryAndChapters();
      await fetchProposals();
    } catch (err) {
      console.error("Failed to approve proposal", err);
      toast({ title: "Error", description: "Failed to approve proposal", variant: "destructive" });
    }
  };

  const handleDeclineProposal = async (proposalId: string) => {
    try {
      const res = await fetch(`${API_BASE}/proposals/${proposalId}/decline`, {
        method: "POST",
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        toast({
          title: "Error",
          description: body.error || "Failed to decline proposal",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Proposal declined", description: "This proposal will no longer appear in the story view." });
      await fetchProposals();
    } catch (err) {
      console.error("Failed to decline proposal", err);
      toast({ title: "Error", description: "Failed to decline proposal", variant: "destructive" });
    }
  };

  if (!story) {
    return (
      <div className="flex flex-col min-h-screen">
        <CrowdlyHeader />
        <div className="flex-grow flex flex-col justify-center items-center text-center">
          <h1 className="text-4xl font-bold mb-4">404</h1>
          <p className="text-xl text-gray-600 mb-4">Story not found</p>
          <a href="/" className="text-blue-500 hover:text-blue-700 underline">
            Return to Home
          </a>
        </div>
        <CrowdlyFooter />
      </div>
    );
  }


  // Derive helpers for the active chapter in experience mode
  const currentChapterIndex =
    currentChapterId && Array.isArray(chapters)
      ? chapters.findIndex((ch) => ch.chapter_id === currentChapterId)
      : chapters.length > 0
      ? 0
      : -1;
  const currentChapter =
    currentChapterIndex >= 0 && currentChapterIndex < chapters.length
      ? chapters[currentChapterIndex]
      : null;

  const goToChapterIndex = (index: number) => {
    if (!Array.isArray(chapters) || chapters.length === 0) return;
    const clamped = Math.max(0, Math.min(index, chapters.length - 1));
    const target = chapters[clamped];
    if (!target) return;
    setCurrentChapterId(target.chapter_id);
    const el = document.getElementById("experience-top");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handlePreviousChapter = () => {
    if (currentChapterIndex > 0) {
      goToChapterIndex(currentChapterIndex - 1);
    }
  };

  const handleNextChapter = () => {
    if (currentChapterIndex >= 0 && currentChapterIndex < chapters.length - 1) {
      goToChapterIndex(currentChapterIndex + 1);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <CrowdlyHeader />

      {/* --- STORY CONTENT TYPE SELECTOR --- */}
      <main className="flex-grow container mx-auto px-4 py-8 max-w-3xl">
        <StoryContentTypeSelector
          chapters={chapters}
          currentChapterIndex={currentChapterIndex}
          onSelectChapter={goToChapterIndex}
        />
        {/* --- TABS & NAVIGATION HEADER --- */}
        <nav className="container mx-auto max-w-3xl px-4 pt-8">
          <div className="flex flex-row items-center gap-2 border rounded-lg bg-gray-50 overflow-x-auto">
            <button
              aria-label="Story"
              onClick={() => setActiveTab("story")}
              className={`flex items-center px-3 py-2 rounded transition font-medium text-sm gap-2 ${
                activeTab === "story"
                  ? "bg-white border border-blue-300 text-blue-600 shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <BookText size={18} /> Story
            </button>
            <button
              aria-label="Contributions"
              onClick={() => setActiveTab("contributions")}
              className={`flex items-center px-3 py-2 rounded transition font-medium text-sm gap-2 ${
                activeTab === "contributions"
                  ? "bg-white border border-blue-300 text-blue-600 shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <BookText size={18} /> Contributions
            </button>
            <button
              aria-label="Contributors"
              onClick={() => setActiveTab("contributors")}
              className={`flex items-center px-3 py-2 rounded transition font-medium text-sm gap-2 ${
                activeTab === "contributors"
                  ? "bg-white border border-blue-300 text-blue-600 shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Users size={18} /> Contributors
            </button>
            <button
              aria-label="Revisions"
              onClick={() => setActiveTab("revisions")}
              className={`flex items-center px-3 py-2 rounded transition font-medium text-sm gap-2 ${
                activeTab === "revisions"
                  ? "bg-white border border-blue-300 text-blue-600 shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Clock size={18} /> Revisions
            </button>
            <button
              aria-label="Branches"
              onClick={() => setActiveTab("branches")}
              className={`flex items-center px-3 py-2 rounded transition font-medium text-sm gap-2 ${
                activeTab === "branches"
                  ? "bg-white border border-blue-300 text-blue-600 shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <GitBranch size={18} /> Branches
            </button>
          </div>
        </nav>

        {/* Only render the tab section the user chose */}
        {activeTab === "story" && (
          <div className="space-y-10">
            {/* EXPERIENCE SECTION */}
            <section>
              <div className="mb-2 flex items-center flex-wrap gap-2">
                {/* Read-only story title for experience mode */}
                <h1 className="text-3xl font-bold" style={{ wordBreak: "break-word" }}>
                  {story.title}
                </h1>
                {story.visibility && (
                  <span
                    className={`px-2 py-1 rounded-full text-xs ${
                      story.visibility === 'private'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {story.visibility === 'private' ? 'Private' : 'Public'}
                  </span>
                )}
                {story.published === false && (
                  <span className="px-2 py-1 rounded-full text-xs bg-gray-200 text-gray-700">
                    Unpublished
                  </span>
                )}
              </div>

              {/* Reactions and comments */}
              <div className="mb-6 flex items-center gap-4 text-sm">
                <button
                  type="button"
                  onClick={() => handleReact('like')}
                  className="px-3 py-1 rounded border bg-white hover:bg-gray-50"
                >
                  👍 Like ({reactions.find(r => r.reaction_type === 'like')?.count ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => handleReact('dislike')}
                  className="px-3 py-1 rounded border bg-white hover:bg-gray-50"
                >
                  👎 Dislike ({reactions.find(r => r.reaction_type === 'dislike')?.count ?? 0})
                </button>
              </div>

              <div className="mb-8">
                <h3 className="text-sm font-semibold mb-2">Comments</h3>
                <div className="space-y-2 mb-3">
                  {comments.length === 0 ? (
                    <div className="text-xs text-gray-500">No comments yet.</div>
                  ) : (
                    comments.map((c) => (
                      <div key={c.id} className="text-xs border-b py-1">
                        <div className="text-gray-800">{c.body}</div>
                        <div className="text-[10px] text-gray-400">{new Date(c.created_at).toLocaleString()}</div>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2 items-start">
                  <textarea
                    className="flex-1 border rounded px-2 py-1 text-xs resize-none overflow-hidden"
                    rows={1}
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => {
                      setNewComment(e.target.value);
                      e.currentTarget.style.height = 'auto';
                      e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
                    }}
                  />
                  <button
                    type="button"
                    onClick={handlePostComment}
                    className="px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600"
                  >
                    Post
                  </button>
                </div>
              </div>

              {/* Read-only story text (experience mode content) */}
              <div id="experience-top" className="space-y-6">
                {currentChapter && (
                  <div key={currentChapter.chapter_id} className="mb-8">
                    <div className="mb-4">
                      <h2 className="text-xl font-semibold">{currentChapter.chapter_title}</h2>
                    </div>

                    {Array.isArray(currentChapter.paragraphs)
                      ? currentChapter.paragraphs.map((paragraph: string, idx: number) => {
                          // Support legacy data where a single string may contain newlines
                          const lines = paragraph
                            .split(/\n+/)
                            .filter((line) => line.trim().length > 0);

                          const paragraphProposals = proposals.filter(
                            (p) =>
                              p.target_type === "paragraph" &&
                              p.target_chapter_id === currentChapter.chapter_id &&
                              (p.target_path ?? "") === String(idx),
                          );

                          return (
                            <div key={idx} className="mb-3">
                              {lines.map((line, lineIdx) => (
                                <p key={`${idx}-${lineIdx}`} className="mb-1">
                                  {line}
                                </p>
                              ))}

                              {paragraphProposals.length > 0 && (
                                <div className="mt-1 space-y-1">
                                  {paragraphProposals.map((p) => (
                                    <div
                                      key={p.id}
                                      className="text-xs text-purple-900 bg-purple-50 border border-dashed border-purple-200 rounded px-2 py-1"
                                    >
                                      <div className="whitespace-pre-wrap">
                                        {p.proposed_text || (
                                          <span className="italic text-purple-500">
                                            (Proposed deletion of this paragraph)
                                          </span>
                                        )}
                                      </div>
                                      <div className="mt-0.5 text-[10px] text-purple-500">
                                        Proposed by {p.author_email || "Unknown user"} ·{" "}
                                        {new Date(p.created_at).toLocaleString()}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      : null}
                  </div>
                )}
                {chapters.length === 0 && (
                  <p className="text-sm text-gray-500">No chapters have been added yet.</p>
                )}

                {/* Chapter list and navigation live in StoryContentTypeSelector above */}
              </div>
            </section>

            {/* CONTRIBUTION SECTION */}
            <section className="border-t pt-6">
              <div className="flex justify-center mb-4">
                {mode === "experience" ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!user) {
                        toast({
                          title: "Login required",
                          description: "You must be logged in to contribute to the story.",
                          variant: "destructive",
                        });
                      }
                      setMode("contribute");
                    }}
                    className="px-4 py-2 text-xs md:text-sm rounded-full border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 shadow-sm"
                  >
                    I want to contribute to the story
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMode("experience")}
                    className="px-4 py-2 text-xs md:text-sm rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shadow-sm"
                  >
                    Back to experiencing the story
                  </button>
                )}
              </div>

              {mode === "contribute" && (
                <div className="space-y-6">
                  {/* TITLE CRUD & story-level controls */}
                  <div className="flex items-center mb-2 gap-1 flex-wrap group">
                    {/* Title area */}
                    <div className="flex items-center gap-1">
                      {isEditingTitle ? (
                        <div className="flex gap-2 items-center w-full max-w-xl">
                          <input
                            type="text"
                            value={titleInput}
                            className="border-b border-dashed border-blue-400 px-1 py-0.5 text-2xl font-bold flex-1 focus:outline-none"
                            onChange={handleChangeTitle}
                            onKeyDown={handleTitleInputKeyDown}
                            onBlur={handleSaveTitle}
                            disabled={savingTitle}
                          />
                        </div>
                      ) : (
                        <>
                           <button
                             type="button"
                             onClick={handleStartEditTitle}
                             className="text-2xl font-bold border-b border-dashed border-blue-300 cursor-text px-1 py-0.5 hover:bg-blue-50"
                           >
                             {story.title}
                           </button>
                         </>
                       )}
                    </div>

                    {/* Story-level controls (appear on hover over title row) */}
                    {(user || isOwner || canDeleteStory) && (
                      <div className="flex items-center gap-1 text-xs text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        {user && (
                          <button
                            onClick={handleCloneStory}
                            className="px-2 py-1 rounded border hover:bg-gray-50 border-gray-300"
                          >
                            Clone
                          </button>
                        )}
                        {isOwner && (
                          <>
                            <button
                              onClick={toggleVisibility}
                              className="px-2 py-1 rounded border hover:bg-gray-50 border-gray-300"
                            >
                              {story.visibility === 'private' ? 'Make public' : 'Make private'}
                            </button>
                            <button
                              onClick={togglePublished}
                              className="px-2 py-1 rounded border hover:bg-gray-50 border-gray-300"
                            >
                              {story.published === false ? 'Publish' : 'Unpublish'}
                            </button>
                          </>
                        )}
                        {canDeleteStory && (
                          <button
                            onClick={handleDeleteStory}
                            className="px-2 py-1 rounded bg-red-500 text-white font-semibold hover:bg-red-700 transition"
                          >
                            Delete Story
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* CHAPTERS CRUD & branching (web-editor style) */}
                  {canCRUDChapters ? (
                    <>
                      {chapters.map((chapter) => (
                        <div
                          key={chapter.chapter_id}
                          id={"chapter-" + chapter.chapter_id}
                          className="mb-10"
                        >
                          <div className="flex items-center gap-2 mb-2 group/chapter">
                            {editingChapterId === chapter.chapter_id ? (
                              <input
                                type="text"
                                value={editingChapterTitle}
                                onChange={handleChapterTitleChange}
                                onKeyDown={(e) => handleChapterTitleKeyDown(e, chapter)}
                                onBlur={() => saveChapterTitle(chapter)}
                                className="border-b border-dashed border-blue-400 px-1 py-0.5 text-lg font-semibold flex-1 focus:outline-none"
                                autoFocus
                              />
                            ) : (
                              <button
                                type="button"
                                className="text-left text-lg font-semibold cursor-text flex-1 border-b border-dashed border-transparent hover:border-blue-300 px-1 py-0.5"
                                onClick={() => startEditChapterTitle(chapter)}
                                onDoubleClick={() =>
                                  navigate("/story/" + story.story_title_id + "/chapter/" + chapter.chapter_id)
                                }
                              >
                                {chapter.chapter_title}
                              </button>
                            )}
                            {/* Hover menu for chapter actions */}
                            <div className="opacity-0 group-hover/chapter:opacity-100 transition-opacity flex items-center gap-1 text-xs text-gray-500">
                              <button
                                type="button"
                                className="px-1 py-0.5 rounded hover:bg-gray-100"
                                onClick={() => startEditChapterTitle(chapter)}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                className="px-1 py-0.5 rounded hover:bg-gray-100"
                                onClick={() => {
                                  // Open the inline add-chapter editor and
                                  // remember that the new chapter should be
                                  // inserted directly after this one.
                                  setInsertAfterChapterId(chapter.chapter_id);
                                  setAddChapterMode(true);
                                }}
                              >
                                Add another chapter
                              </button>
                              <button
                                type="button"
                                className="px-1 py-0.5 rounded hover:bg-red-50 text-red-600"
                                onClick={() => {
                                  if (window.confirm("Delete this chapter? This cannot be undone.")) {
                                    handleDeleteChapter(chapter.chapter_id);
                                  }
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                          {Array.isArray(chapter.paragraphs) && chapter.paragraphs.length > 0 ? (
                            chapter.paragraphs.map((paragraph, idx) => (
                              <div key={idx} className="mb-4">
                                <div className="relative group/paragraph mb-2">
                                  <div className="flex items-start gap-2">
                                    {editingParagraph &&
                                    editingParagraph.chapterId === chapter.chapter_id &&
                                    editingParagraph.index === idx ? (
                                      <textarea
                                        className="flex-1 border-b border-dashed border-blue-400 px-1 py-0.5 text-sm leading-relaxed focus:outline-none resize-none bg-blue-50/40 rounded"
                                        value={editingParagraphText}
                                        onChange={(e) => setEditingParagraphText(e.target.value)}
                                        onBlur={() => saveParagraph(chapter, idx)}
                                        onKeyDown={(e) => handleParagraphKeyDown(e, chapter, idx)}
                                        rows={40}
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        className="flex-1 text-left cursor-text border-b border-dashed border-transparent hover:border-blue-300 px-1 py-0.5 rounded"
                                        onClick={() => startEditParagraph(chapter, idx, paragraph)}
                                      >
                                        {paragraph}
                                      </button>
                                    )}
                                    <button
                                      className="opacity-0 group-hover/paragraph:opacity-100 transition-opacity border rounded px-2 py-1 text-xs font-medium flex items-center gap-1 bg-white hover:bg-gray-100 shadow hover:shadow-md"
                                      type="button"
                                      onClick={() => handleQuickCreateBranch(chapter, idx, paragraph)}
                                    >
                                      <svg width="16" height="16" stroke="currentColor" fill="none" viewBox="0 0 24 24"><path strokeWidth="2" d="M6 3v6a6 6 0 006 6h6"></path><path strokeWidth="2" d="M18 21v-6a6 6 0 00-6-6H6"></path></svg>
                                      Create Branch
                                    </button>
                                  </div>
                                </div>

                                {/* Inline branches created under this base paragraph */}
                                {inlineBranches
                                  .filter(
                                    (b) =>
                                      b.chapterId === chapter.chapter_id &&
                                      b.parentParagraphIndex === idx,
                                  )
                                  .map((b) => (
                                    <div
                                      key={b.id}
                                      className="relative group/paragraph ml-4 border-l border-dashed border-blue-200 pl-2 mb-2"
                                    >
                                      <div className="flex items-start gap-2">
                                        {editingBranchId === b.id ? (
                                          <textarea
                                            className="flex-1 border-b border-dashed border-blue-400 px-1 py-0.5 text-sm leading-relaxed focus:outline-none resize-none bg-blue-50/40 rounded"
                                            placeholder="This is new branch you can immediately type your text here"
                                            value={b.text}
                                            onChange={(e) =>
                                              handleInlineBranchTextChange(b.id, e.target.value)
                                            }
                                            onBlur={() => handleInlineBranchBlur(b.id)}
                                            rows={40}
                                          />
                                        ) : (
                                          <button
                                            type="button"
                                            className="flex-1 text-left cursor-text border-b border-dashed border-transparent hover:border-blue-300 px-1 py-0.5 rounded text-sm leading-relaxed bg-blue-50/40"
                                            onClick={() => setEditingBranchId(b.id)}
                                          >
                                            {b.text || (
                                              <span className="text-gray-400 italic">
                                                This is new branch you can immediately type your text here
                                              </span>
                                            )}
                                          </button>
                                        )}
                                        <div className="flex flex-col gap-1 text-xs opacity-0 group-hover/paragraph:opacity-100 transition-opacity">
                                          <button
                                            type="button"
                                            className="px-2 py-1 rounded border hover:bg-gray-50 border-gray-300"
                                            onClick={() =>
                                              handleQuickCreateBranch(
                                                chapter,
                                                idx,
                                                b.text || paragraph,
                                              )
                                            }
                                          >
                                            Create Branch
                                          </button>
                                          <ParagraphBranchPopover
                                            trigger={
                                              <button
                                                type="button"
                                                className="px-2 py-1 rounded border hover:bg-gray-50 border-gray-300"
                                              >
                                                Configure branch
                                              </button>
                                            }
                                            onCreateBranch={({ branchName, paragraphs }) =>
                                              handleConfigureExistingBranch(b.id, {
                                                branchName,
                                                paragraphs,
                                                language: "en",
                                                metadata: null,
                                              })
                                            }
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            ))
                          ) : (
                            // No paragraphs yet: show a single placeholder line so user sees where to type
                            <div className="mb-4">
                              <div className="relative group/paragraph mb-2">
                                <div className="flex items-start gap-2">
                                  {editingParagraph &&
                                  editingParagraph.chapterId === chapter.chapter_id &&
                                  editingParagraph.index === 0 ? (
                                    <textarea
                                      className="flex-1 border-b border-dashed border-blue-400 px-1 py-0.5 text-sm leading-relaxed focus:outline-none resize-none bg-blue-50/40 rounded"
                                      value={editingParagraphText}
                                      onChange={(e) => setEditingParagraphText(e.target.value)}
                                      onBlur={() => saveParagraph({ ...chapter, paragraphs: [""] }, 0)}
                                      onKeyDown={(e) =>
                                        handleParagraphKeyDown(e, { ...chapter, paragraphs: [""] }, 0)
                                      }
                                      rows={40}
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      className="flex-1 text-left cursor-text border-b border-dashed border-transparent hover:border-blue-300 px-1 py-0.5 rounded text-sm text-gray-400"
                                      onClick={() =>
                                        startEditParagraph({ ...chapter, paragraphs: [""] }, 0, "")
                                      }
                                    >
                                      Start writing this chapter...
                                    </button>
                                  )}
                                  <button
                                    className="opacity-0 group-hover/paragraph:opacity-100 transition-opacity border rounded px-2 py-1 text-xs font-medium flex items-center gap-1 bg-white hover:bg-gray-100 shadow hover:shadow-md"
                                    type="button"
                                    onClick={() => handleQuickCreateBranch(chapter, 0, "")}
                                  >
                                    <svg width="16" height="16" stroke="currentColor" fill="none" viewBox="0 0 24 24"><path strokeWidth="2" d="M6 3v6a6 6 0 006 6h6"></path><path strokeWidth="2" d="M18 21v-6a6 6 0 00-6-6H6"></path></svg>
                                    Create Branch
                                  </button>
                                </div>
                              </div>

                              {/* Inline branches under empty chapter placeholder */}
                              {inlineBranches
                                .filter(
                                  (b) =>
                                    b.chapterId === chapter.chapter_id &&
                                    b.parentParagraphIndex === 0,
                                )
                                .map((b) => (
                                  <div
                                    key={b.id}
                                    className="relative group/paragraph ml-4 border-l border-dashed border-blue-200 pl-2 mb-2"
                                  >
                                    <div className="flex items-start gap-2">
                                      {editingBranchId === b.id ? (
                                        <textarea
                                          className="flex-1 border-b border-dashed border-blue-400 px-1 py-0.5 text-sm leading-relaxed focus:outline-none resize-none bg-blue-50/40 rounded"
                                          placeholder="This is new branch you can immediately type your text here. Later you can also configure it, should you want that"
                                          value={b.text}
                                          onChange={(e) =>
                                            handleInlineBranchTextChange(b.id, e.target.value)
                                          }
                                          onBlur={() => handleInlineBranchBlur(b.id)}
                                          rows={40}
                                        />
                                      ) : (
                                        <button
                                          type="button"
                                          className="flex-1 text-left cursor-text border-b border-dashed border-transparent hover:border-blue-300 px-1 py-0.5 rounded text-sm leading-relaxed bg-blue-50/40"
                                          onClick={() => setEditingBranchId(b.id)}
                                        >
                                          {b.text || (
                                            <span className="text-gray-400 italic">
                                              This is new branch you can immediately type your text here. Later you can also configure it, should you want that
                                            </span>
                                          )}
                                        </button>
                                      )}
                                      <div className="flex flex-col gap-1 text-xs opacity-0 group-hover/paragraph:opacity-100 transition-opacity">
                                        <button
                                          type="button"
                                          className="px-2 py-1 rounded border hover:bg-gray-50 border-gray-300"
                                          onClick={() =>
                                            handleQuickCreateBranch(
                                              chapter,
                                              0,
                                              b.text || "",
                                            )
                                          }
                                        >
                                          Create Branch
                                        </button>
                                        <ParagraphBranchPopover
                                          trigger={
                                            <button
                                              type="button"
                                              className="px-2 py-1 rounded border hover:bg-gray-50 border-gray-300"
                                            >
                                              Configure branch
                                            </button>
                                          }
                                          onCreateBranch={({ branchName, paragraphs }) =>
                                            handleConfigureExistingBranch(b.id, {
                                              branchName,
                                              paragraphs,
                                              language: "en",
                                              metadata: null,
                                            })
                                          }
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Minimal inline add-chapter control */}
                      <div className="mt-6">
                        {addChapterMode ? (
                          <div
                            className="border rounded p-3 bg-gray-50 space-y-2 max-w-xl"
                            ref={addChapterContainerRef}
                            tabIndex={-1}
                          >
                            <input
                              type="text"
                              className="w-full border rounded px-2 py-1 text-sm"
                              placeholder="New chapter title"
                              value={newChapterTitle}
                              onChange={(e) => setNewChapterTitle(e.target.value)}
                            />
                            <textarea
                              className="w-full border rounded px-2 py-1 text-sm resize-vertical min-h-[4rem]"
                              placeholder="Chapter text (use blank lines to separate paragraphs)"
                              value={newChapterBody}
                              onChange={(e) => setNewChapterBody(e.target.value)}
                              rows={40}
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="px-4 py-2 text-xs rounded-full border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50"
                            onClick={() => {
                              setInsertAfterChapterId(null);
                              setAddChapterMode(true);
                            }}
                          >
                            + Add chapter
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="my-6 p-4 rounded bg-gray-50 text-center text-gray-500">
                      Please log in to add or edit chapters.
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
        {activeTab === "contributions" && (
          <div className="mt-6 space-y-8">
            {contributionsLoading ? (
              <div className="text-sm text-gray-500">Loading contributions...</div>
            ) : (
              <ContributionsModule
                contributions={contributions}
                currentFilter={contributionFilter}
                onFilterChange={setContributionFilter}
              />
            )}

            {(isOwner || hasRole("platform_admin") || hasRole("editor")) && (
              <section>
                <h2 className="text-xl font-semibold mb-3">Proposed changes (approval required)</h2>
                <div className="bg-white border rounded p-4 shadow-sm text-sm space-y-3">
                  {proposalsLoading ? (
                    <div className="text-gray-500">Loading proposals...</div>
                  ) : proposals.length === 0 ? (
                    <div className="text-gray-400">No pending proposals.</div>
                  ) : (
                    <ul className="space-y-3">
                      {proposals.map((p) => {
                        const chapterTitle =
                          p.target_chapter_id && Array.isArray(chapters)
                            ? chapters.find((ch) => ch.chapter_id === p.target_chapter_id)?.chapter_title ?? ""
                            : "";
                        const targetLabel =
                          p.target_type === "story_title"
                            ? "Story title"
                            : p.target_type === "chapter"
                            ? `Chapter: ${chapterTitle || p.target_chapter_id || "(unknown)"}`
                            : p.target_type === "paragraph"
                            ? `Paragraph in ${chapterTitle || "chapter"}${
                                p.target_path ? ` #${p.target_path}` : ""
                              }`
                            : "Branch";
                        return (
                          <li key={p.id} className="border-b last:border-b-0 pb-3 last:pb-0">
                            <div className="flex flex-col gap-1">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <div className="font-medium">{targetLabel}</div>
                                <div className="text-xs text-gray-500">
                                  {p.author_email || "Unknown user"} · {" "}
                                  {new Date(p.created_at).toLocaleString()}
                                </div>
                              </div>
                              <div className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded px-2 py-1 max-h-40 overflow-auto">
                                {p.proposed_text}
                              </div>
                              <div className="flex gap-2 mt-2">
                                <button
                                  type="button"
                                  onClick={() => handleApproveProposal(p.id)}
                                  className="px-3 py-1 text-xs rounded bg-green-500 text-white hover:bg-green-600"
                                >
                                  OK &amp; merge
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeclineProposal(p.id)}
                                  className="px-3 py-1 text-xs rounded bg-red-500 text-white hover:bg-red-600"
                                >
                                  Deny
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
        {activeTab === "contributors" && (
          <ContributorsSection contributors={contributors} loading={contributorsLoading} />
        )}
        {activeTab === "revisions" && (
          <RevisionsSection
            storyTitleRevisions={storyTitleRevisions}
            chapterRevisions={chapterRevisions}
            chapterRevisionsLoading={chapterRevisionsLoading}
          />
        )}
        {activeTab === "branches" && <BranchesSection storyId={story.story_title_id} />}
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default Story;
