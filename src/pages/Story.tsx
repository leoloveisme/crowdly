import React, { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Loader2, Users, Clock, GitBranch, BookOpen, FileText, Heart, Download, Search, User, X, Eye, Pencil, Settings, ListOrdered } from "lucide-react";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import EditableText from "@/components/EditableText";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import StoryContentTypeSelector, {
  DEFAULT_STORY_CONTENT_TYPES,
  type StoryContentTypes,
} from "@/components/StoryContentTypeSelector";
import StoryBranchList from "@/components/StoryBranchList";
import ContributionsModule, { ContributionRow } from "@/modules/contributions";
import InteractionsWidget from "@/modules/InteractionsWidget";
import { ExportDialog } from "@/modules/import-export";
import UserGroupPicker from "@/modules/user-group-picker";
import CompareRevisionsContainer from "@/modules/compare revisions";
import CoverImageUpload from "@/components/CoverImageUpload";
import TagBadge from "@/components/TagBadge";
import ImageGallery from "@/components/ImageGallery";
import GalleryUpload from "@/components/GalleryUpload";
import { listGalleryImages, type GalleryImage } from "@/lib/galleryApi";
import { ToastAction } from "@/components/ui/toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ChapterSidebar, { type ChapterSidebarMode } from "@/components/story/ChapterSidebar";
import ChapterReader from "@/components/story/ChapterReader";
import ChapterEditor from "@/components/story/ChapterEditor";
import StorySettingsSheet, { type StoryPolicy, type StoryVisibility } from "@/components/story/StorySettingsSheet";

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

type StoryCollaborator = {
  user_id: string;
  role: "author" | "coauthor";
  email?: string;
  first_name?: string;
  last_name?: string;
  nickname?: string;
};

type UserSearchResult = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
};

interface Chapter {
  chapter_id: string;
  chapter_title: string;
  chapter_index?: number;
  paragraphs: string[];
  tags?: string[];
  paragraphTags?: Record<string, string[]>;
  published?: boolean;
}

interface StoryTitleRevision {
  id?: string | number;
  story_title_id?: string;
  revision_number?: number;
  new_title: string;
  created_at: string;
}

interface ChapterRevision {
  id?: string | number;
  chapter_id?: string;
  chapter_title?: string;
  revision_number?: number;
  revision_reason?: string;
  created_at: string;
}

interface RawContributionRow {
  id?: string | number;
  chapter_id?: string;
  paragraph_index?: number;
  revision_number?: number;
  story_title?: string;
  chapter_title?: string;
  new_paragraph?: string;
  user_email?: string;
  created_at?: string;
  likes?: number;
  dislikes?: number;
  comments?: number;
  status?: string;
}

function collabDisplayName(u: { email?: string; first_name?: string; last_name?: string; nickname?: string }) {
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
  return name || u.email || "";
}

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
  chapters,
}: {
  storyTitleRevisions: StoryTitleRevision[];
  chapterRevisions: ChapterRevision[];
  chapterRevisionsLoading: boolean;
  chapters: Chapter[];
}) => {
  const [compareChapterId, setCompareChapterId] = React.useState<string>("");

  return (
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

      {/* Compare Revisions */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Compare Chapter Revisions</h2>
        <div className="bg-white border rounded p-6 shadow-sm space-y-4">
          {chapters.length === 0 ? (
            <div className="text-gray-400 text-sm">No chapters available for comparison.</div>
          ) : (
            <>
              <div className="flex items-center flex-wrap gap-2">
                <label htmlFor="compare-chapter-select" className="text-sm font-medium">
                  Select chapter:
                </label>
                <select
                  id="compare-chapter-select"
                  value={compareChapterId}
                  onChange={(e) => setCompareChapterId(e.target.value)}
                  className="border rounded px-3 py-1.5 text-sm bg-white w-full sm:w-auto max-w-full"
                >
                  <option value="">-- Choose a chapter --</option>
                  {chapters.map((ch: Chapter) => (
                    <option key={ch.chapter_id} value={ch.chapter_id}>
                      {ch.chapter_title || `Chapter ${ch.chapter_index ?? ''}`}
                    </option>
                  ))}
                </select>
              </div>
              {compareChapterId && (
                <CompareRevisionsContainer
                  chapterId={compareChapterId}
                  contentType="story"
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
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
    completion_status?: string;
    clone_policy?: string;
    export_policy?: string;
    can_clone?: boolean;
    can_export?: boolean;
    language?: string;
    cover_image_url?: string | null;
    description?: string | null;
    tags?: string[] | null;
    genre?: string | null;
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
  const [chapters, setChapters] = useState<Chapter[]>([]);
  // Inline chapter illustrations (kind='inline_illustration'), keyed for lookup
  // by chapter + paragraph anchor when rendering.
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [illustrationTarget, setIllustrationTarget] = useState<{ chapterId: string; anchorIndex: number } | null>(null);
  // Prominent, always-visible cover editor (Goodreads-style), separate from
  // the buried CoverImageUpload further down in the owner settings row.
  const [coverEditorOpen, setCoverEditorOpen] = useState(false);
  const [galleryRefreshToken, setGalleryRefreshToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [storyError, setStoryError] = useState<{ status: number; message: string } | null>(null);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [contributorsLoading, setContributorsLoading] = useState(false);
  const [chapterRevisions, setChapterRevisions] = useState<ChapterRevision[]>([]);
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
  // Viewing vs Editing for the whole page, mirrored to ?mode=edit so a
  // refresh (or a shared link) keeps it. Only honoured for users who may
  // edit chapters — see `isEditing` below.
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const pageMode: "view" | "edit" = searchParams.get("mode") === "edit" ? "edit" : "view";
  const setPageMode = (next: "view" | "edit") => {
    const params = new URLSearchParams(searchParams);
    if (next === "edit") params.set("mode", "edit");
    else params.delete("mode");
    setSearchParams(params, { replace: true });
    setSidebarMode(next);
    // Cover editor is Editing-only; don't let it reopen on the next switch.
    setCoverEditorOpen(false);
  };
  const [sidebarMode, setSidebarMode] = useState<ChapterSidebarMode>(pageMode);
  const [contentTypes, setContentTypes] = useState<StoryContentTypes>(DEFAULT_STORY_CONTENT_TYPES);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileChaptersOpen, setMobileChaptersOpen] = useState(false);
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

  // Story-level favorite state (for Index favorites container)
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);

  // Export dialog state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // Access rules picker state
  const [accessPickerOpen, setAccessPickerOpen] = useState(false);
  const [accessPickerRuleType, setAccessPickerRuleType] = useState<"view" | "clone" | "export">("view");

  // Collaborators state
  const [collaborators, setCollaborators] = useState<StoryCollaborator[]>([]);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);

  // Transfer ownership state
  const [transferQuery, setTransferQuery] = useState("");
  const [transferResults, setTransferResults] = useState<UserSearchResult[]>([]);
  const [transferTarget, setTransferTarget] = useState<UserSearchResult | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [showTransferDropdown, setShowTransferDropdown] = useState(false);
  const transferDropdownRef = useRef<HTMLDivElement>(null);
  const transferDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Add author state
  const [authorQuery, setAuthorQuery] = useState("");
  const [authorResults, setAuthorResults] = useState<UserSearchResult[]>([]);
  const [showAuthorDropdown, setShowAuthorDropdown] = useState(false);
  const [addingAuthor, setAddingAuthor] = useState(false);
  const authorDropdownRef = useRef<HTMLDivElement>(null);
  const authorDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Add co-author state
  const [coauthorQuery, setCoauthorQuery] = useState("");
  const [coauthorResults, setCoauthorResults] = useState<UserSearchResult[]>([]);
  const [showCoauthorDropdown, setShowCoauthorDropdown] = useState(false);
  const [addingCoauthor, setAddingCoauthor] = useState(false);
  const coauthorDropdownRef = useRef<HTMLDivElement>(null);
  const coauthorDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Minimal contributor-grant control for unlisted stories (public stories
  // don't need this — anyone signed in can already contribute; private
  // stories don't allow outside contribution at all).
  const [contributorEmail, setContributorEmail] = useState("");
  const [grantingContributor, setGrantingContributor] = useState(false);

  const handleGrantContributor = async () => {
    if (!story?.story_title_id || !contributorEmail.trim()) return;
    setGrantingContributor(true);
    try {
      const res = await fetch(`${API_BASE}/story-titles/${story.story_title_id}/contributors`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: contributorEmail.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Error", description: body.error || "Failed to add contributor", variant: "destructive" });
        return;
      }
      toast({ title: "Contributor added", description: `${contributorEmail.trim()} can now contribute chapters.` });
      setContributorEmail("");
    } catch (err) {
      console.error("Failed to grant contributor access", err);
      toast({ title: "Error", description: "Failed to add contributor", variant: "destructive" });
    } finally {
      setGrantingContributor(false);
    }
  };

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
        let body: { error?: string } = {};
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
      if (user?.id) {
        params.set('userId', user.id);
      }
      const chaptersRes = await fetch(`${API_BASE}/chapters?${params.toString()}`);
      let chaptersData: Chapter[] = [];
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
            chaptersData.map(async (ch: Chapter) => {
              try {
                const resp = await fetch(`${API_BASE}/chapter-revisions/${ch.chapter_id}`);
                if (!resp.ok) return [] as ChapterRevision[];
                const data = await resp.json();
                if (!Array.isArray(data)) return [] as ChapterRevision[];
                return data.map((rev: ChapterRevision) => ({
                  ...rev,
                  chapter_title: ch.chapter_title,
                }));
              } catch (err) {
                console.error('Failed to fetch chapter revisions for', ch.chapter_id, err);
                return [] as ChapterRevision[];
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

      // Collaborators (authors & co-authors, best-effort)
      try {
        setCollaboratorsLoading(true);
        const collabRes = await fetch(`${API_BASE}/stories/${story_id}/collaborators`);
        if (collabRes.ok) {
          const data = await collabRes.json();
          setCollaborators(Array.isArray(data) ? data : []);
        } else {
          setCollaborators([]);
        }
      } catch (err) {
        console.error('Failed to fetch collaborators', err);
        setCollaborators([]);
      } finally {
        setCollaboratorsLoading(false);
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

  const reloadInlineIllustrations = useCallback(() => {
    if (!story_id) return;
    listGalleryImages(story_id)
      .then((rows) => setGalleryImages(rows.filter((r) => r.kind === "inline_illustration" && r.status === "approved")))
      .catch(() => setGalleryImages([]));
  }, [story_id]);

  useEffect(() => {
    reloadInlineIllustrations();
  }, [reloadInlineIllustrations]);

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

  // Debounced user search for transfer-ownership
  useEffect(() => {
    if (transferDebounceRef.current) clearTimeout(transferDebounceRef.current);
    if (!transferQuery.trim()) { setTransferResults([]); return; }
    transferDebounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: transferQuery });
        if (user?.id) params.set("excludeUserId", user.id);
        const res = await fetch(`${API_BASE}/users/search?${params}`);
        if (res.ok) {
          const data = await res.json();
          const list: UserSearchResult[] = Array.isArray(data) ? data : Array.isArray(data.users) ? data.users : [];
          setTransferResults(list);
          setShowTransferDropdown(true);
        }
      } catch { /* ignore */ }
    }, 300);
    return () => { if (transferDebounceRef.current) clearTimeout(transferDebounceRef.current); };
  }, [transferQuery, user?.id]);

  // Debounced user search for adding authors
  useEffect(() => {
    if (authorDebounceRef.current) clearTimeout(authorDebounceRef.current);
    if (!authorQuery.trim()) { setAuthorResults([]); return; }
    const existingIds = collaborators.filter(c => c.role === "author").map(c => c.user_id);
    authorDebounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: authorQuery });
        if (user?.id) params.set("excludeUserId", user.id);
        const res = await fetch(`${API_BASE}/users/search?${params}`);
        if (res.ok) {
          const data = await res.json();
          const list: UserSearchResult[] = Array.isArray(data) ? data : Array.isArray(data.users) ? data.users : [];
          setAuthorResults(list.filter(u => !existingIds.includes(u.id)));
          setShowAuthorDropdown(true);
        }
      } catch { /* ignore */ }
    }, 300);
    return () => { if (authorDebounceRef.current) clearTimeout(authorDebounceRef.current); };
  }, [authorQuery, user?.id, collaborators]);

  // Debounced user search for adding co-authors
  useEffect(() => {
    if (coauthorDebounceRef.current) clearTimeout(coauthorDebounceRef.current);
    if (!coauthorQuery.trim()) { setCoauthorResults([]); return; }
    const existingIds = collaborators.filter(c => c.role === "coauthor").map(c => c.user_id);
    coauthorDebounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: coauthorQuery });
        if (user?.id) params.set("excludeUserId", user.id);
        const res = await fetch(`${API_BASE}/users/search?${params}`);
        if (res.ok) {
          const data = await res.json();
          const list: UserSearchResult[] = Array.isArray(data) ? data : Array.isArray(data.users) ? data.users : [];
          setCoauthorResults(list.filter(u => !existingIds.includes(u.id)));
          setShowCoauthorDropdown(true);
        }
      } catch { /* ignore */ }
    }, 300);
    return () => { if (coauthorDebounceRef.current) clearTimeout(coauthorDebounceRef.current); };
  }, [coauthorQuery, user?.id, collaborators]);

  // Close collaborator dropdowns on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (transferDropdownRef.current && !transferDropdownRef.current.contains(e.target as Node)) setShowTransferDropdown(false);
      if (authorDropdownRef.current && !authorDropdownRef.current.contains(e.target as Node)) setShowAuthorDropdown(false);
      if (coauthorDropdownRef.current && !coauthorDropdownRef.current.contains(e.target as Node)) setShowCoauthorDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Permission checks
  const isOwner = user && story && story.creator_id === user.id;

  // Fetched from the backend (owner / contributor / null) so chapter CRUD
  // permissions match what the server actually enforces, instead of the old
  // "any logged-in user" client-side assumption.
  const [accessRole, setAccessRole] = useState<"owner" | "contributor" | null>(null);
  // True for the story's own team (owner or an explicit story_access row),
  // false for the implicit contributor role every signed-in user has on a
  // public story. The team gets the Viewing/Editing toggle; everyone else
  // keeps the "I want to contribute" entry point.
  const [accessExplicit, setAccessExplicit] = useState(false);
  useEffect(() => {
    if (!story_id || !user?.id) {
      setAccessRole(null);
      setAccessExplicit(false);
      return;
    }
    if (isOwner) {
      setAccessRole("owner");
      setAccessExplicit(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/story-titles/${story_id}/my-access`, {
          credentials: "include",
        });
        if (!res.ok) {
          if (!cancelled) {
            setAccessRole(null);
            setAccessExplicit(false);
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setAccessRole(data.role ?? null);
          setAccessExplicit(Boolean(data.explicit));
        }
      } catch {
        if (!cancelled) {
          setAccessRole(null);
          setAccessExplicit(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [story_id, user?.id, isOwner]);
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

    try {
      const res = await fetch(`${API_BASE}/story-titles/${story.story_title_id}`, {
        method: "DELETE",
        credentials: "include",
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

  // Transfer ownership handler
  const handleTransferOwnership = async () => {
    if (!story || !transferTarget || !user) return;
    if (!window.confirm(`Transfer ownership of this story to ${collabDisplayName(transferTarget) || transferTarget.email}? You will no longer be the owner.`)) return;
    setTransferring(true);
    try {
      const res = await fetch(`${API_BASE}/stories/${story.story_title_id}/transfer-ownership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newOwnerId: transferTarget.id, requestingUserId: user.id }),
      });
      if (res.ok) {
        const updated = await res.json();
        setStory(updated);
        setTransferTarget(null);
        setTransferQuery("");
        toast({ title: "Ownership transferred", description: `Story is now owned by ${collabDisplayName(transferTarget) || transferTarget.email}` });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Error", description: err.error || "Failed to transfer ownership", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    }
    setTransferring(false);
  };

  // Add author handler
  const handleAddAuthor = async (targetUser: UserSearchResult) => {
    if (!story || !user) return;
    setAddingAuthor(true);
    try {
      const res = await fetch(`${API_BASE}/stories/${story.story_title_id}/authors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUser.id, requestingUserId: user.id }),
      });
      if (res.ok) {
        const newCollab: StoryCollaborator = await res.json();
        setCollaborators(prev => [...prev.filter(c => c.user_id !== targetUser.id), newCollab]);
        setAuthorQuery("");
        setAuthorResults([]);
        setShowAuthorDropdown(false);
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Error", description: err.error || "Failed to add author", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    }
    setAddingAuthor(false);
  };

  // Remove author handler
  const handleRemoveAuthor = async (userId: string) => {
    if (!story || !user) return;
    try {
      const params = new URLSearchParams({ requestingUserId: user.id });
      const res = await fetch(`${API_BASE}/stories/${story.story_title_id}/authors/${userId}?${params}`, { method: "DELETE" });
      if (res.ok) {
        setCollaborators(prev => prev.filter(c => !(c.user_id === userId && c.role === "author")));
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Error", description: err.error || "Failed to remove author", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    }
  };

  // Add co-author handler
  const handleAddCoauthor = async (targetUser: UserSearchResult) => {
    if (!story || !user) return;
    setAddingCoauthor(true);
    try {
      const res = await fetch(`${API_BASE}/stories/${story.story_title_id}/coauthors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUser.id, requestingUserId: user.id }),
      });
      if (res.ok) {
        const newCollab: StoryCollaborator = await res.json();
        setCollaborators(prev => [...prev.filter(c => c.user_id !== targetUser.id), newCollab]);
        setCoauthorQuery("");
        setCoauthorResults([]);
        setShowCoauthorDropdown(false);
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Error", description: err.error || "Failed to add co-author", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    }
    setAddingCoauthor(false);
  };

  // Remove co-author handler
  const handleRemoveCoauthor = async (userId: string) => {
    if (!story || !user) return;
    try {
      const params = new URLSearchParams({ requestingUserId: user.id });
      const res = await fetch(`${API_BASE}/stories/${story.story_title_id}/coauthors/${userId}?${params}`, { method: "DELETE" });
      if (res.ok) {
        setCollaborators(prev => prev.filter(c => !(c.user_id === userId && c.role === "coauthor")));
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Error", description: err.error || "Failed to remove co-author", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
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

  // Chapter rename: the owner writes the title directly; contributors
  // propose the change for owner review, same as paragraph edits.
  const renameChapter = async (chapter: Chapter, newTitle: string) => {
    const title = newTitle.trim();
    if (!title || title === chapter.chapter_title) return;

    if (isOwner) {
      await handleUpdateChapter(chapter.chapter_id, { chapter_title: title });
      return;
    }

    try {
      await createProposal({
        targetType: "chapter_title",
        targetChapterId: chapter.chapter_id,
        proposedText: title,
      });
      toast({
        title: "Change proposed",
        description: "Your chapter title change is pending review.",
      });
    } catch (err) {
      console.error("Failed to propose chapter title change", err);
      toast({
        title: "Error",
        description: "Failed to submit proposal.",
        variant: "destructive",
      });
    }
  };

  // Inline paragraph editing handlers
  const startEditParagraph = (chapter: Chapter, index: number, text: string) => {
    setEditingParagraph({ chapterId: chapter.chapter_id, index });
    setEditingParagraphText(text);
  };

  const cancelEditParagraph = () => {
    setEditingParagraph(null);
    setEditingParagraphText("");
  };

  const saveParagraph = async (chapter: Chapter, index: number) => {
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
    chapter: Chapter,
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
      chapter_title: title || "Untitled chapter",
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

  // Selecting a chapter goes through the URL (/story/:id/chapter/:chapter_id)
  // so every chapter is deep-linkable; the effect that syncs currentChapterId
  // from the chapter_id param does the rest. Keeps ?mode=edit intact.
  const selectChapter = (chapterId: string, { scroll = true }: { scroll?: boolean } = {}) => {
    if (!story_id) return;
    setCurrentChapterId(chapterId);
    navigate(`/story/${story_id}/chapter/${chapterId}${location.search}`, { replace: true });
    setMobileChaptersOpen(false);
    if (scroll) {
      document.getElementById("chapter-top")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // CRUD Handlers for chapters (via backend)
  // CREATE
  const handleCreateChapter = async ({ chapter_title, paragraphs }: { chapter_title: string; paragraphs: string[] }) => {
    if (!story_id) return;
    try {
      const res = await fetch(`${API_BASE}/chapters`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyTitleId: story_id,
          chapterTitle: chapter_title,
          paragraphs,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Error", description: body.error || "Failed to add chapter", variant: "destructive" });
        return;
      }

      const created = await res.json();
      toast({ title: "Chapter Created", description: `Added chapter "${chapter_title}".` });

      // Compute the new chapter order in the UI so that, when requested,
      // the new chapter appears directly below the chapter whose menu
      // was used. Otherwise, append it at the end.
      const current = Array.isArray(chapters) ? chapters : [];
      let newChapters: Chapter[];
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
      selectChapter(created.chapter_id);

      // Persist the ordering in the backend so that future loads show
      // the same chapter order.
      try {
        await fetch(`${API_BASE}/stories/${story_id}/chapters/reorder`, {
          method: "PATCH",
          credentials: "include",
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

  // Manual chapter reordering (owner only — matches the backend's
  // owner-only check on this same endpoint). Saves immediately; returns
  // whether the server accepted the new order.
  const applyChapterOrder = async (newOrder: Chapter[]) => {
    setChapters(newOrder);
    try {
      const res = await fetch(`${API_BASE}/stories/${story_id}/chapters/reorder`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterIds: newOrder.map((ch) => ch.chapter_id) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Error", description: body.error || "Failed to reorder chapters", variant: "destructive" });
        fetchStoryAndChapters();
        return false;
      }
      return true;
    } catch (err) {
      console.error("Failed to reorder chapters", err);
      toast({ title: "Error", description: "Failed to reorder chapters", variant: "destructive" });
      fetchStoryAndChapters();
      return false;
    }
  };

  // Shared by the sidebar's drag handle, ⋯ move actions and Alt+↑/↓.
  // Each move saves instantly and offers a one-click Undo.
  const moveChapter = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= chapters.length || toIndex >= chapters.length) return;
    const previous = chapters;
    const next = [...chapters];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    const ok = await applyChapterOrder(next);
    if (!ok) return;
    toast({
      title: "Chapter moved",
      description: `“${moved.chapter_title || "Untitled chapter"}” is now chapter ${toIndex + 1}.`,
      action: (
        <ToastAction altText="Undo chapter move" onClick={() => applyChapterOrder(previous)}>
          Undo
        </ToastAction>
      ),
    });
  };

  // UPDATE
  const handleUpdateChapter = async (
    chapter_id: string,
    patch: { chapter_title?: string; paragraphs?: string[]; tags?: string[]; paragraphTags?: Record<string, string[]> }
  ) => {
    try {
      const res = await fetch(`${API_BASE}/chapters/${chapter_id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterTitle: patch.chapter_title,
          paragraphs: patch.paragraphs,
          tags: patch.tags,
          paragraphTags: patch.paragraphTags,
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
        credentials: "include",
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
  // PUBLISH (owner only — distinct from the whole-book publish toggle)
  const handleToggleChapterPublish = async (chapter: Chapter) => {
    const next = !chapter.published;
    try {
      const res = await fetch(`${API_BASE}/chapters/${chapter.chapter_id}/publish`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Error", description: body.error || "Failed to update chapter publish state", variant: "destructive" });
        return;
      }
      setChapters((prev) =>
        prev.map((c) => (c.chapter_id === chapter.chapter_id ? { ...c, published: next } : c)),
      );
    } catch (err) {
      console.error("Failed to toggle chapter publish state", err);
      toast({ title: "Error", description: "Failed to update chapter publish state", variant: "destructive" });
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
      metadata: Record<string, unknown> | null;
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
    chapter: Chapter,
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

  // Chapter list + "add chapter"/rename affordances are shown to the
  // owner and to contributors (create directly, propose edits to existing
  // chapters); destructive/structural actions are further gated to the
  // owner alone at their specific call sites (see isOwner checks below).
  const canCRUDChapters = accessRole === "owner" || accessRole === "contributor";

  // --- Story title revisions (fetched from backend) ---
  const [storyTitleRevisions, setStoryTitleRevisions] = useState<StoryTitleRevision[]>([]);

  // Reactions and comments state
  const [reactions, setReactions] = useState<{ reaction_type: string; count: number }[]>([]);
  const [comments, setComments] = useState<unknown[]>([]);
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

  type ProposalTargetType = "story_title" | "chapter" | "chapter_title" | "paragraph" | "branch";

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
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: args.targetType,
          targetChapterId: args.targetChapterId,
          targetBranchId: args.targetBranchId,
          targetPath: args.targetPath ?? null,
          proposedText: args.proposedText,
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
          const mapped: ContributionRow[] = rows.map((row: RawContributionRow, index: number) => ({
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

  // Load favorite status for this story for the current user
  useEffect(() => {
    const loadFavorite = async () => {
      if (!story_id || !user?.id) {
        setIsFavorite(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/users/${user.id}/favorites`);
        if (!res.ok) {
          setIsFavorite(false);
          return;
        }
        const data = await res.json().catch(() => []);
        if (!Array.isArray(data)) {
          setIsFavorite(false);
          return;
        }
        const found = data.some(
          (item: { content_type?: string; content_id?: string }) => item.content_type === 'story' && item.content_id === story_id,
        );
        setIsFavorite(found);
      } catch (err) {
        console.error('[Story] Failed to load favorite state', err);
        setIsFavorite(false);
      }
    };
    loadFavorite();
  }, [story_id, user?.id]);

  // Automatically mark this story as "living" for the current user when it is opened.
  useEffect(() => {
    const markLiving = async () => {
      if (!user?.id || !story?.story_title_id) return;
      try {
        const res = await fetch(`${API_BASE}/users/${user.id}/story-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: "story",
            storyTitleId: story.story_title_id,
            isLiving: true,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error('[Story] Failed to auto-mark story as living', {
            status: res.status,
            body,
          });
        }
      } catch (err) {
        console.error('[Story] Failed to auto-mark story as living', err);
      }
    };
    markLiving();
  }, [user?.id, story?.story_title_id]);

  // --- Export helpers (must be above early returns to satisfy React hooks rules) ---
  const getStoryContentHtml = useCallback((): string => {
    if (!story || chapters.length === 0) return "";
    let html = `<h1>${story.title}</h1>\n`;
    for (const ch of chapters) {
      html += `<h2>${ch.chapter_title}</h2>\n`;
      if (Array.isArray(ch.paragraphs)) {
        for (const p of ch.paragraphs) {
          html += `<p>${p}</p>\n`;
        }
      }
    }
    return html;
  }, [story, chapters]);

  const getStoryContentMarkdown = useCallback((): string => {
    if (!story || chapters.length === 0) return "";
    let md = `# ${story.title}\n\n`;
    for (const ch of chapters) {
      md += `## ${ch.chapter_title}\n\n`;
      if (Array.isArray(ch.paragraphs)) {
        for (const p of ch.paragraphs) {
          md += `${p}\n\n`;
        }
      }
    }
    return md;
  }, [story, chapters]);

  const getStoryTitle = useCallback((): string => {
    return story?.title || "Untitled Story";
  }, [story]);

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

  const toggleFavorite = async () => {
    if (!user) {
      toast({
        title: "Login required",
        description: "You must be logged in to favorite this story.",
        variant: "destructive",
      });
      return;
    }
    if (!story) return;
    if (favoriteLoading) return;

    setFavoriteLoading(true);
    const next = !isFavorite;
    try {
      const res = await fetch(`${API_BASE}/users/${user.id}/story-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: "story",
          storyTitleId: story.story_title_id,
          isFavorite: next,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[Story] Failed to toggle favorite', { status: res.status, body });
        toast({
          title: "Error",
          description: body.error || "Failed to update favorite state.",
          variant: "destructive",
        });
        return;
      }
      setIsFavorite(next);
    } catch (err) {
      console.error('[Story] Failed to toggle favorite', err);
      toast({
        title: "Error",
        description: "Failed to update favorite state.",
        variant: "destructive",
      });
    } finally {
      setFavoriteLoading(false);
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

  const openAccessPicker = (rule: "view" | "clone" | "export") => {
    // The picker is its own modal — close the settings sheet so the two
    // dialogs don't fight over focus.
    setSettingsOpen(false);
    setAccessPickerRuleType(rule);
    setAccessPickerOpen(true);
  };

  const setVisibility = async (nextVisibility: StoryVisibility) => {
    if (!story || nextVisibility === (story.visibility ?? 'public')) return;
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
      // If set to unlisted, open user/group picker for view rules
      if (nextVisibility === 'unlisted') {
        openAccessPicker("view");
      }
    } catch (err) {
      console.error('Failed to toggle visibility', err);
      toast({ title: "Error", description: "Failed to update visibility", variant: "destructive" });
    }
  };

  const updateStorySetting = async (field: string, value: string | boolean | string[]) => {
    if (!story) return;
    try {
      const res = await fetch(`${API_BASE}/story-titles/${story.story_title_id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Error", description: body.error || `Failed to update ${field}`, variant: "destructive" });
        return;
      }
      setStory(body);
    } catch (err) {
      console.error(`Failed to update ${field}`, err);
      toast({ title: "Error", description: `Failed to update ${field}`, variant: "destructive" });
    }
  };

  const setCompletionStatus = (next: "draft" | "completed") => {
    if (!story) return;
    updateStorySetting('completion_status', next);
    toast({ title: next === 'completed' ? "Marked as completed" : "Marked as draft" });
  };

  const setClonePolicy = (next: StoryPolicy) => {
    if (!story) return;
    updateStorySetting('clone_policy', next);
    if (next === 'restricted') openAccessPicker("clone");
  };

  const setExportPolicy = (next: StoryPolicy) => {
    if (!story) return;
    updateStorySetting('export_policy', next);
    if (next === 'restricted') openAccessPicker("export");
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

  const markAsLived = async () => {
    if (!user) {
      toast({
        title: "Login required",
        description: "You must be logged in to mark this story as finished.",
        variant: "destructive",
      });
      return;
    }
    if (!story) return;
    try {
      const res = await fetch(`${API_BASE}/users/${user.id}/story-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: "story",
          storyTitleId: story.story_title_id,
          isLiving: false,
          isLived: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[Story] Failed to mark story as lived', { status: res.status, body });
        toast({
          title: "Error",
          description: body.error || "Failed to mark story as lived.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Marked as finished",
        description: "This story will now appear in your 'Lived / Experienced' list.",
      });
    } catch (err) {
      console.error('[Story] Failed to mark story as lived', err);
      toast({
        title: "Error",
        description: "Failed to mark story as lived.",
        variant: "destructive",
      });
    }
  };

  const handleApproveProposal = async (proposalId: string) => {
    try {
      const res = await fetch(`${API_BASE}/proposals/${proposalId}/approve`, {
        method: "POST",
        credentials: "include",
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
        credentials: "include",
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


  // Derive helpers for the active chapter
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
    if (target) selectChapter(target.chapter_id);
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

  // The story's own team (owner / explicitly granted contributors) gets the
  // Viewing ↔ Editing toggle. Everyone else reads, and — where the backend
  // lets them contribute (e.g. any signed-in user on a public story) —
  // reaches the same editor through "I want to contribute".
  const isCreator = canCRUDChapters && accessExplicit;
  const isEditing = canCRUDChapters && pageMode === "edit";

  const handleWantToContribute = () => {
    if (!user) {
      toast({
        title: "Login required",
        description: "You must be logged in to contribute to the story.",
        variant: "destructive",
      });
      return;
    }
    if (!canCRUDChapters) {
      toast({
        title: "Contribution not open",
        description: "The story owner hasn't given you contributor access to this story.",
        variant: "destructive",
      });
      return;
    }
    setPageMode("edit");
    document.getElementById("chapter-top")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openAddChapterForm = (afterChapterId: string | null) => {
    setInsertAfterChapterId(afterChapterId);
    setAddChapterMode(true);
    setMobileChaptersOpen(false);
    window.setTimeout(() => {
      addChapterContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      addChapterContainerRef.current?.querySelector("input")?.focus();
    }, 50);
  };

  const deleteChapter = async (chapterId: string) => {
    if (chapterId === currentChapterId && story_id) {
      navigate(`/story/${story_id}${location.search}`, { replace: true });
    }
    await handleDeleteChapter(chapterId);
  };

  const chapterSidebar = (
    <ChapterSidebar
      chapters={chapters}
      currentChapterId={currentChapter?.chapter_id ?? null}
      onSelect={(id) => selectChapter(id)}
      canEdit={canCRUDChapters && (isCreator || isEditing)}
      isOwner={!!isOwner}
      mode={sidebarMode}
      onModeChange={setSidebarMode}
      onMove={moveChapter}
      onRename={renameChapter}
      onTogglePublish={handleToggleChapterPublish}
      onDelete={deleteChapter}
      onInsertAfter={openAddChapterForm}
    />
  );

  const mobileChaptersButton = chapters.length > 0 && (
    <button
      type="button"
      onClick={() => setMobileChaptersOpen(true)}
      className="lg:hidden inline-flex items-center gap-1 px-2 py-1 rounded border text-xs text-gray-600 bg-white hover:bg-gray-50 shrink-0"
    >
      <ListOrdered className="h-3.5 w-3.5" />
      <EditableText id="story-sidebar-heading">Chapters</EditableText>
      <span>({chapters.length})</span>
    </button>
  );

  const pageModeToggle = (
    <div className="inline-flex rounded-lg border bg-gray-50 p-0.5 text-sm" role="group">
      <button
        type="button"
        aria-pressed={pageMode === "view"}
        onClick={() => setPageMode("view")}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1 rounded-md transition",
          pageMode === "view" ? "bg-white shadow-sm text-blue-700 font-medium" : "text-gray-600 hover:text-gray-900",
        )}
      >
        <Eye className="h-4 w-4" />
        <EditableText id="story-mode-viewing">Viewing</EditableText>
      </button>
      <button
        type="button"
        aria-pressed={pageMode === "edit"}
        onClick={() => setPageMode("edit")}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1 rounded-md transition",
          pageMode === "edit" ? "bg-white shadow-sm text-blue-700 font-medium" : "text-gray-600 hover:text-gray-900",
        )}
      >
        <Pencil className="h-4 w-4" />
        <EditableText id="story-mode-editing">Editing</EditableText>
      </button>
    </div>
  );

  const backToExperiencingButton = (
    <button
      type="button"
      onClick={() => setPageMode("view")}
      className="px-4 py-2 text-xs md:text-sm rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shadow-sm"
    >
      <EditableText id="story-contribute-back-btn">Back to experiencing the story</EditableText>
    </button>
  );

  const peopleSection = (
    <div className="space-y-3">
                      {/* Transfer Ownership */}
                      <div className="border rounded-md p-3 bg-gray-50 space-y-2">
                        <div className="text-xs font-semibold text-gray-600">
                          <EditableText id="story-transfer-ownership-label">Transfer ownership to</EditableText>
                        </div>
                        {transferTarget ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800">
                              <User className="h-3 w-3" />
                              {collabDisplayName(transferTarget) || transferTarget.email}
                              <button type="button" onClick={() => setTransferTarget(null)} className="ml-0.5 hover:text-red-600">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                            <button
                              type="button"
                              disabled={transferring}
                              onClick={handleTransferOwnership}
                              className="px-3 py-1 text-xs rounded bg-orange-500 text-white font-semibold hover:bg-orange-700 disabled:opacity-50 transition"
                            >
                              {transferring ? <EditableText id="story-transfer-btn-ing">Transferring…</EditableText> : <EditableText id="story-transfer-btn">Transfer</EditableText>}
                            </button>
                          </div>
                        ) : (
                          <div className="relative" ref={transferDropdownRef}>
                            <div className="relative">
                              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-gray-400" />
                              <input
                                type="text"
                                placeholder="Search users…"
                                value={transferQuery}
                                onChange={(e) => setTransferQuery(e.target.value)}
                                onFocus={() => transferResults.length > 0 && setShowTransferDropdown(true)}
                                className="w-full pl-7 pr-2 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white"
                              />
                            </div>
                            {showTransferDropdown && transferResults.length > 0 && (
                              <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                                {transferResults.map((u) => (
                                  <button
                                    key={u.id}
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-orange-50 flex items-center gap-2"
                                    onClick={() => { setTransferTarget(u); setTransferQuery(""); setShowTransferDropdown(false); }}
                                  >
                                    <User className="h-3 w-3 text-gray-400 shrink-0" />
                                    <span>{collabDisplayName(u) || u.email}</span>
                                    {u.first_name && <span className="text-gray-400 ml-auto text-xs">{u.email}</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Authors */}
                      <div className="border rounded-md p-3 bg-gray-50 space-y-2">
                        <div className="text-xs font-semibold text-gray-600">
                          <EditableText id="story-authors-label">Authors</EditableText>
                        </div>
                        {collaborators.filter(c => c.role === "author").length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {collaborators.filter(c => c.role === "author").map((c) => (
                              <span key={c.user_id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                                <User className="h-3 w-3" />
                                {collabDisplayName(c) || c.user_id}
                                <button type="button" onClick={() => handleRemoveAuthor(c.user_id)} className="ml-0.5 hover:text-red-600">
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="relative" ref={authorDropdownRef}>
                          <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-gray-400" />
                            <input
                              type="text"
                              placeholder="Add author…"
                              value={authorQuery}
                              onChange={(e) => setAuthorQuery(e.target.value)}
                              onFocus={() => authorResults.length > 0 && setShowAuthorDropdown(true)}
                              className="w-full pl-7 pr-2 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                            />
                          </div>
                          {showAuthorDropdown && authorResults.length > 0 && (
                            <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                              {authorResults.map((u) => (
                                <button
                                  key={u.id}
                                  type="button"
                                  disabled={addingAuthor}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center gap-2 disabled:opacity-50"
                                  onClick={() => handleAddAuthor(u)}
                                >
                                  <User className="h-3 w-3 text-gray-400 shrink-0" />
                                  <span>{collabDisplayName(u) || u.email}</span>
                                  {u.first_name && <span className="text-gray-400 ml-auto text-xs">{u.email}</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Co-authors */}
                      <div className="border rounded-md p-3 bg-gray-50 space-y-2">
                        <div className="text-xs font-semibold text-gray-600">
                          <EditableText id="story-coauthors-label">Co-authors</EditableText>
                        </div>
                        {collaborators.filter(c => c.role === "coauthor").length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {collaborators.filter(c => c.role === "coauthor").map((c) => (
                              <span key={c.user_id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                                <User className="h-3 w-3" />
                                {collabDisplayName(c) || c.user_id}
                                <button type="button" onClick={() => handleRemoveCoauthor(c.user_id)} className="ml-0.5 hover:text-red-600">
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="relative" ref={coauthorDropdownRef}>
                          <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-gray-400" />
                            <input
                              type="text"
                              placeholder="Add co-author…"
                              value={coauthorQuery}
                              onChange={(e) => setCoauthorQuery(e.target.value)}
                              onFocus={() => coauthorResults.length > 0 && setShowCoauthorDropdown(true)}
                              className="w-full pl-7 pr-2 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-purple-300 bg-white"
                            />
                          </div>
                          {showCoauthorDropdown && coauthorResults.length > 0 && (
                            <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                              {coauthorResults.map((u) => (
                                <button
                                  key={u.id}
                                  type="button"
                                  disabled={addingCoauthor}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-purple-50 flex items-center gap-2 disabled:opacity-50"
                                  onClick={() => handleAddCoauthor(u)}
                                >
                                  <User className="h-3 w-3 text-gray-400 shrink-0" />
                                  <span>{collabDisplayName(u) || u.email}</span>
                                  {u.first_name && <span className="text-gray-400 ml-auto text-xs">{u.email}</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Contributors (unlisted stories only — public stories
                          already allow any signed-in user to contribute) */}
                      {story.visibility === "unlisted" && (
                        <div className="border rounded-md p-3 bg-gray-50 space-y-2">
                          <div className="text-xs font-semibold text-gray-600">
                            <EditableText id="story-contributors-label">Contributors</EditableText>
                          </div>
                          <div className="flex gap-1.5">
                            <input
                              type="email"
                              placeholder="Add contributor by email…"
                              value={contributorEmail}
                              onChange={(e) => setContributorEmail(e.target.value)}
                              className="flex-1 text-xs border rounded px-2 py-1.5"
                            />
                            <button
                              type="button"
                              disabled={grantingContributor || !contributorEmail.trim()}
                              onClick={handleGrantContributor}
                              className="px-2 py-1 rounded border text-xs hover:bg-gray-100 disabled:opacity-50"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      )}
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen">
      <CrowdlyHeader />

      <main className="flex-grow container mx-auto px-4 py-8 max-w-6xl">
        {/* --- TABS --- */}
        <nav className="mb-6">
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
              <BookOpen size={18} /> <span className="hidden sm:inline">Story</span>
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
              <FileText size={18} /> <span className="hidden sm:inline">Contributions</span>
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
              <Users size={18} /> <span className="hidden sm:inline">Contributors</span>
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
              <Clock size={18} /> <span className="hidden sm:inline">Revisions</span>
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
              <GitBranch size={18} /> <span className="hidden sm:inline">Branches</span>
            </button>
          </div>
        </nav>

        {/* Only render the tab section the user chose */}
        {activeTab === "story" && (
          <div className="space-y-6">
            {/* STORY HEADER */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center flex-wrap gap-2 min-w-0">
                  {isEditing ? (
                    isEditingTitle ? (
                      <input
                        type="text"
                        value={titleInput}
                        autoFocus
                        className="border border-blue-400 px-2 py-1 text-3xl font-bold rounded focus:outline-none min-w-0 w-full sm:w-[32rem]"
                        placeholder="How shall the story be named? Write the story title here"
                        onChange={handleChangeTitle}
                        onKeyDown={handleTitleInputKeyDown}
                        onBlur={handleSaveTitle}
                        disabled={savingTitle}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={handleStartEditTitle}
                        title="Click to edit the title"
                        className={cn(
                          "text-3xl text-left border-b border-dashed border-gray-300 hover:border-blue-400 cursor-text px-1 rounded-t hover:bg-blue-50",
                          story.title ? "font-bold" : "italic text-gray-400 font-medium",
                        )}
                        style={{ wordBreak: "break-word" }}
                      >
                        {story.title || (
                          <EditableText id="story-title-empty-hint">
                            How shall the story be named? Write the story title here
                          </EditableText>
                        )}
                      </button>
                    )
                  ) : (
                    <h1 className="text-3xl font-bold" style={{ wordBreak: "break-word" }}>
                      {story.title}
                    </h1>
                  )}
                  <button
                    type="button"
                    onClick={toggleFavorite}
                    disabled={favoriteLoading}
                    title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                    className="inline-flex items-center justify-center p-1 rounded-full border border-transparent hover:bg-pink-50 disabled:opacity-60"
                  >
                    <Heart
                      className={isFavorite ? "h-5 w-5 text-pink-500 fill-pink-500" : "h-5 w-5 text-gray-400"}
                    />
                  </button>
                  {story.visibility && (
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        story.visibility === 'private'
                          ? 'bg-yellow-100 text-yellow-800'
                          : story.visibility === 'unlisted'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {story.visibility === 'private' ? (
                        <EditableText id="story-badge-private">Private</EditableText>
                      ) : story.visibility === 'unlisted' ? (
                        <EditableText id="story-badge-unlisted">Unlisted</EditableText>
                      ) : (
                        <EditableText id="story-badge-public">Public</EditableText>
                      )}
                    </span>
                  )}
                  {story.published === false && (
                    <span className="px-2 py-1 rounded-full text-xs bg-gray-200 text-gray-700">
                      <EditableText id="story-badge-unpublished">Unpublished</EditableText>
                    </span>
                  )}
                  <span
                    className={`px-2 py-1 rounded-full text-xs ${
                      (story.completion_status ?? 'draft') === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-orange-100 text-orange-800'
                    }`}
                  >
                    {(story.completion_status ?? 'draft') === 'completed' ? (
                      <EditableText id="story-badge-completed">Completed</EditableText>
                    ) : (
                      <EditableText id="story-badge-draft">Draft</EditableText>
                    )}
                  </span>
                  {story.language && (
                    <span className="px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                      {story.language.toUpperCase()}
                    </span>
                  )}
                </div>

                {isCreator ? (
                  <div className="flex items-center gap-2 shrink-0">
                    {pageModeToggle}
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => setSettingsOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <Settings className="h-4 w-4" />
                        <span className="hidden sm:inline">
                          <EditableText id="story-settings-btn">Settings</EditableText>
                        </span>
                      </button>
                    )}
                  </div>
                ) : (
                  isEditing && <div className="shrink-0">{backToExperiencingButton}</div>
                )}
              </div>

              {user && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={markAsLived}
                    className="inline-flex items-center px-2 py-1 rounded-full border border-dashed border-teal-300 text-[11px] text-teal-700 hover:bg-teal-50"
                  >
                    <EditableText id="story-mark-finished-btn">Mark as finished</EditableText>
                  </button>
                  {story.can_clone !== false && (
                    <button
                      type="button"
                      onClick={handleCloneStory}
                      title="Clone this story"
                      className="inline-flex items-center px-2 py-1 rounded-full border border-dashed border-gray-300 text-[11px] text-gray-700 hover:bg-gray-50"
                    >
                      <EditableText id="story-clone-btn">Clone</EditableText>
                    </button>
                  )}
                  {story.can_export !== false && (
                    <button
                      type="button"
                      onClick={() => setExportDialogOpen(true)}
                      title="Export this story"
                      className="inline-flex items-center px-2 py-1 rounded-full border border-dashed border-indigo-300 text-[11px] text-indigo-700 hover:bg-indigo-50"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      <EditableText id="story-export-btn">Export</EditableText>
                    </button>
                  )}
                  {/* Platform admins/editors can moderate stories they don't
                      own; the owner deletes from the settings sheet instead. */}
                  {!isOwner && canDeleteStory && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Are you sure you want to permanently delete this story? This cannot be undone.")) {
                          handleDeleteStory();
                        }
                      }}
                      className="inline-flex items-center px-2 py-1 rounded-full border border-dashed border-red-300 text-[11px] text-red-700 hover:bg-red-50"
                    >
                      <EditableText id="story-delete-btn">Delete Story</EditableText>
                    </button>
                  )}
                </div>
              )}
            </section>

            <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
              {/* CHAPTERS SIDEBAR (desktop) — mobile uses the sheet below */}
              <aside className="hidden lg:block">
                <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1 pb-4">
                  {chapterSidebar}
                </div>
              </aside>

              <div className="min-w-0 max-w-3xl">
              {/* Cover art — always visible (placeholder when absent), with a
                  direct click-to-change affordance for the owner. This is the
                  primary, discoverable way to set/replace a story's cover;
                  the CoverImageUpload further down in the settings row still
                  works too. */}
              <div className="mt-3 mb-3 flex items-start gap-3">
                <div className="relative w-28 h-40 shrink-0 rounded-md overflow-hidden bg-gradient-to-br from-blue-200 via-sky-200 to-purple-200 dark:from-slate-700 dark:via-slate-800 dark:to-slate-900 group/cover">
                  {story.cover_image_url ? (
                    <img
                      src={story.cover_image_url}
                      alt="Story cover"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen className="h-8 w-8 text-white/80" />
                    </div>
                  )}
                  {isOwner && isEditing && (
                    <button
                      type="button"
                      onClick={() => setCoverEditorOpen((v) => !v)}
                      className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/cover:bg-black/50 opacity-0 group-hover/cover:opacity-100 transition-all text-white text-xs font-medium"
                    >
                      {story.cover_image_url ? (
                        <EditableText id="story-cover-change-btn">Change cover</EditableText>
                      ) : (
                        <EditableText id="story-cover-add-btn">Add cover</EditableText>
                      )}
                    </button>
                  )}
                </div>
                {isOwner && isEditing && coverEditorOpen && (
                  <div className="max-w-xs">
                    <CoverImageUpload
                      value={story.cover_image_url || null}
                      onChange={(url) => {
                        updateStorySetting("cover_image_url", url || "");
                        setCoverEditorOpen(false);
                      }}
                    />
                  </div>
                )}
              </div>

              {story.description && (
                <p className="text-sm text-gray-600 whitespace-pre-wrap mt-2 mb-2">
                  {story.description}
                </p>
              )}
              {story.tags && story.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 mb-2">
                  {story.tags.map((tag) => (
                    <TagBadge key={tag} tag={tag} />
                  ))}
                </div>
              )}

              {/* Gallery — cover variants, chapter illustrations submitted as
                  fan art, and community photos. Open to every visitor (not
                  just the owner), matching the backend's moderation rules:
                  the owner/contributors publish directly, everyone else's
                  uploads go to a pending queue for review. */}
              <div className="mt-4 mb-4 border rounded-lg p-4 bg-white dark:bg-gray-900">
                <h2 className="text-sm font-semibold mb-2">
                  <EditableText id="story-gallery-heading">Gallery</EditableText>
                </h2>
                <ImageGallery
                  storyTitleId={story.story_title_id}
                  kindFilter={["fan_art", "gallery"]}
                  currentUserId={user?.id ?? null}
                  canModerate={!!isOwner}
                  idPrefix="story-page-gallery"
                  refreshToken={galleryRefreshToken}
                />
                {/* Owners/co-authors upload from Editing mode; readers who
                    can't enter Editing submit fan art from Viewing. */}
                {user && (isEditing || !canCRUDChapters) && (
                  <div className="mt-3 pt-3 border-t max-w-sm">
                    <h3 className="text-xs font-semibold mb-1">
                      {isOwner ? (
                        <EditableText id="story-gallery-upload-label-owner">Add to gallery</EditableText>
                      ) : (
                        <EditableText id="story-gallery-upload-label-fan">
                          Submit fan art (reviewed by the story owner)
                        </EditableText>
                      )}
                    </h3>
                    <GalleryUpload
                      storyTitleId={story.story_title_id}
                      kind={isOwner ? "gallery" : "fan_art"}
                      idPrefix="story-page-gallery-upload"
                      onUploaded={() => setGalleryRefreshToken((t) => t + 1)}
                    />
                  </div>
                )}
              </div>

              {/* Unified reactions + comments for this story — reader-facing,
                  so hidden in Editing mode */}
              {!isEditing && <InteractionsWidget kind="story" storyTitleId={story.story_title_id} />}

                {/* CHAPTER — reader for everyone in Viewing mode, editor in Editing mode */}
                <div id="chapter-top" className="scroll-mt-4 mt-8 pt-6 border-t">
                  {!isEditing && <StoryContentTypeSelector value={contentTypes} onChange={setContentTypes} />}

                  {currentChapter ? (
                    isEditing ? (
                      <ChapterEditor
                        key={currentChapter.chapter_id}
                        storyTitleId={story.story_title_id}
                        chapter={currentChapter}
                        index={currentChapterIndex}
                        total={chapters.length}
                        onPrevious={handlePreviousChapter}
                        onNext={handleNextChapter}
                        headerExtra={mobileChaptersButton}
                        isOwner={!!isOwner}
                        onRename={renameChapter}
                        onUpdateTags={(chapterId, tags) => handleUpdateChapter(chapterId, { tags })}
                        editingParagraph={editingParagraph}
                        editingParagraphText={editingParagraphText}
                        onStartEditParagraph={startEditParagraph}
                        onParagraphTextChange={setEditingParagraphText}
                        onSaveParagraph={saveParagraph}
                        onParagraphKeyDown={handleParagraphKeyDown}
                        inlineBranches={inlineBranches}
                        editingBranchId={editingBranchId}
                        onBranchFocus={setEditingBranchId}
                        onBranchTextChange={handleInlineBranchTextChange}
                        onBranchBlur={handleInlineBranchBlur}
                        onQuickCreateBranch={handleQuickCreateBranch}
                        onConfigureBranch={handleConfigureExistingBranch}
                        illustrations={galleryImages}
                        illustrationTarget={illustrationTarget}
                        onToggleIllustrationTarget={(chapterId, anchorIndex) =>
                          setIllustrationTarget((prev) =>
                            prev && prev.chapterId === chapterId && prev.anchorIndex === anchorIndex
                              ? null
                              : { chapterId, anchorIndex },
                          )
                        }
                        onIllustrationUploaded={() => {
                          setIllustrationTarget(null);
                          reloadInlineIllustrations();
                        }}
                      />
                    ) : (
                      <ChapterReader
                        chapter={currentChapter}
                        index={currentChapterIndex}
                        total={chapters.length}
                        onPrevious={handlePreviousChapter}
                        onNext={handleNextChapter}
                        contentTypes={contentTypes}
                        proposals={proposals}
                        illustrations={galleryImages}
                        headerExtra={mobileChaptersButton}
                      />
                    )
                  ) : (
                    <p className="text-sm text-gray-500 mb-6">
                      <EditableText id="story-no-chapters">No chapters have been added yet.</EditableText>
                    </p>
                  )}

                  {/* Inline add-chapter form, opened from the sidebar's
                      "+ Add chapter" / "Insert chapter after" actions. Saves
                      on click-outside (see the addChapterMode effect). */}
                  {canCRUDChapters && (isEditing || addChapterMode) && (
                    <div className="mt-6">
                      {addChapterMode ? (
                        <div
                          className="border rounded p-3 bg-gray-50 space-y-2"
                          ref={addChapterContainerRef}
                          tabIndex={-1}
                        >
                          <div className="text-xs font-semibold text-gray-600">
                            {insertAfterChapterId ? (
                              <EditableText id="story-add-chapter-after-heading">New chapter (inserted after the selected one)</EditableText>
                            ) : (
                              <EditableText id="story-add-chapter-heading">New chapter</EditableText>
                            )}
                          </div>
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
                            rows={6}
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={resetNewChapterForm}
                              className="px-3 py-1 text-xs rounded border bg-white hover:bg-gray-100"
                            >
                              <EditableText id="story-dialog-cancel">Cancel</EditableText>
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveNewChapter}
                              className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                            >
                              <EditableText id="story-add-chapter-save">Add chapter</EditableText>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="px-4 py-2 text-xs rounded-full border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50"
                          onClick={() => openAddChapterForm(null)}
                        >
                          <EditableText id="story-chapter-add-btn">+ Add chapter</EditableText>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Consumers keep the "I want to contribute" entry point */}
                  {!isCreator && (
                    <div className="flex justify-center mt-10 pt-6 border-t">
                      {isEditing ? (
                        backToExperiencingButton
                      ) : (
                        <button
                          type="button"
                          onClick={handleWantToContribute}
                          className="px-4 py-2 text-xs md:text-sm rounded-full border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 shadow-sm"
                        >
                          <EditableText id="story-contribute-btn">I want to contribute to the story</EditableText>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile chapters drawer */}
            <Sheet open={mobileChaptersOpen} onOpenChange={setMobileChaptersOpen}>
              <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto">
                <SheetHeader className="sr-only">
                  <SheetTitle>Chapters</SheetTitle>
                </SheetHeader>
                <div className="pt-6">{chapterSidebar}</div>
              </SheetContent>
            </Sheet>

            {isOwner && (
              <StorySettingsSheet
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                story={story}
                onSetVisibility={setVisibility}
                onTogglePublished={togglePublished}
                onSetCompletion={setCompletionStatus}
                onSetClonePolicy={setClonePolicy}
                onSetExportPolicy={setExportPolicy}
                onOpenAccessPicker={openAccessPicker}
                onUpdateSetting={updateStorySetting}
                onOpenDetails={() => navigate(`/story/${story.story_title_id}/details`)}
                peopleSection={peopleSection}
                canDelete={!!canDeleteStory}
                onDelete={handleDeleteStory}
              />
            )}
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
            chapters={chapters}
          />
        )}
        {activeTab === "branches" && <BranchesSection storyId={story.story_title_id} />}
      </main>
      <CrowdlyFooter />

      {/* Export Dialog */}
      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        getContentHtml={getStoryContentHtml}
        getContentMarkdown={getStoryContentMarkdown}
        getTitle={getStoryTitle}
        contentType="story"
        contentId={story.story_title_id}
      />

      {/* User/Group Access Picker */}
      <UserGroupPicker
        storyTitleId={story.story_title_id}
        ruleType={accessPickerRuleType}
        open={accessPickerOpen}
        onClose={() => setAccessPickerOpen(false)}
      />
    </div>
  );
};

export default Story;
