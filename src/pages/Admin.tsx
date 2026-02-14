import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Users, MessageSquare, GitBranch, HandHelping, Rocket, Film, ExternalLink } from "lucide-react";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

type StoryItem = {
  story_title_id: string;
  title: string;
  created_at: string;
  visibility: string;
  published: boolean;
  roles: string[];
};

type ScreenplayItem = {
  screenplay_id: string;
  title: string;
  created_at: string;
  visibility: string;
  published: boolean;
  roles: string[];
};

type CommentItem = {
  id: string;
  body: string;
  created_at: string;
  story_title_id: string | null;
  chapter_id: string | null;
  screenplay_id: string | null;
  story_title: string | null;
  chapter_title: string | null;
  screenplay_title: string | null;
  paragraph_index: number | null;
};

type BranchItem = {
  id: string;
  chapter_id: string;
  parent_paragraph_index: number;
  parent_paragraph_text: string | null;
  branch_text: string;
  language: string;
  created_at: string;
  story_title_id: string;
  chapter_title: string | null;
  story_title: string | null;
};

type ContributionItem = {
  id: string;
  story_title: string | null;
  chapter_title: string | null;
  paragraph_index: number | null;
  new_paragraph: string | null;
  created_at: string;
  words: number;
  status: string;
};

type SpaceItem = {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  published: boolean;
  created_at: string;
  updated_at: string;
};

// Merge stories + screenplays into a single list with a type tag
type ContentItem = (StoryItem & { type: "story" }) | (ScreenplayItem & { type: "screenplay" });

const RoleBadge = ({ role }: { role: string }) => {
  const colors: Record<string, string> = {
    creator: "bg-blue-100 text-blue-700",
    owner: "bg-indigo-100 text-indigo-700",
    contributor: "bg-amber-100 text-amber-700",
    editor: "bg-purple-100 text-purple-700",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${colors[role] || "bg-gray-100 text-gray-600"}`}>
      {role}
    </span>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    undecided: "bg-yellow-100 text-yellow-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
};

const VisibilityBadge = ({ visibility, published }: { visibility: string; published: boolean }) => (
  <div className="flex gap-1">
    <span className={`text-xs px-1.5 py-0.5 rounded ${visibility === "public" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
      {visibility}
    </span>
    {!published && (
      <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">draft</span>
    )}
  </div>
);

const EmptyState = ({ icon: Icon, message, detail }: { icon: React.ElementType; message: string; detail: string }) => (
  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
    <Icon className="h-12 w-12 mb-4 opacity-30" />
    <p className="text-lg font-medium">{message}</p>
    <p className="text-sm mt-1">{detail}</p>
  </div>
);

const Admin = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stories, setStories] = useState<StoryItem[]>([]);
  const [screenplays, setScreenplays] = useState<ScreenplayItem[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [contributions, setContributions] = useState<ContributionItem[]>([]);
  const [spaces, setSpaces] = useState<SpaceItem[]>([]);
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("stories");

  useEffect(() => {
    if (!user) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  const fetchStories = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/users/${user.id}/stories`);
      if (res.ok) setStories(await res.json());
    } catch (err) { console.error("Failed to fetch stories:", err); }
  }, [user]);

  const fetchScreenplays = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/users/${user.id}/screenplays`);
      if (res.ok) setScreenplays(await res.json());
    } catch (err) { console.error("Failed to fetch screenplays:", err); }
  }, [user]);

  const fetchComments = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/users/${user.id}/comments`);
      if (res.ok) setComments(await res.json());
    } catch (err) { console.error("Failed to fetch comments:", err); }
  }, [user]);

  const fetchBranches = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/users/${user.id}/branches`);
      if (res.ok) setBranches(await res.json());
    } catch (err) { console.error("Failed to fetch branches:", err); }
  }, [user]);

  const fetchContributions = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/users/${user.id}/contributions`);
      if (res.ok) setContributions(await res.json());
    } catch (err) { console.error("Failed to fetch contributions:", err); }
  }, [user]);

  const fetchSpaces = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/creative-spaces?userId=${user.id}`);
      if (res.ok) setSpaces(await res.json());
    } catch (err) { console.error("Failed to fetch spaces:", err); }
  }, [user]);

  // Lazy-load data when a tab is first viewed
  useEffect(() => {
    if (!user || loadedTabs.has(activeTab)) return;

    setLoadedTabs((prev) => new Set(prev).add(activeTab));

    switch (activeTab) {
      case "stories":
        fetchStories();
        fetchScreenplays();
        break;
      case "collaborators":
        // Re-uses stories + screenplays data (shows collaborator roles)
        if (!loadedTabs.has("stories")) {
          fetchStories();
          fetchScreenplays();
        }
        break;
      case "comments":
        fetchComments();
        break;
      case "branches":
        fetchBranches();
        break;
      case "contributions":
        fetchContributions();
        break;
      case "spaces":
        fetchSpaces();
        break;
    }
  }, [activeTab, user, loadedTabs, fetchStories, fetchScreenplays, fetchComments, fetchBranches, fetchContributions, fetchSpaces]);

  if (!user) return null;

  // Merge stories + screenplays for the Story tab
  const allContent: ContentItem[] = [
    ...stories.map((s) => ({ ...s, type: "story" as const })),
    ...screenplays.map((s) => ({ ...s, type: "screenplay" as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // For Co-Authors tab: stories/screenplays where user is a collaborator (not sole creator)
  const collaboratorContent = allContent.filter(
    (item) => item.roles.length > 1 || !item.roles.includes("creator")
  );

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 via-sky-100 to-white dark:from-background dark:via-background/70 dark:to-background/90">
      <CrowdlyHeader />
      <main className="flex-grow container mx-auto max-w-6xl px-4 py-8">
        <h2 className="text-2xl font-bold mb-6">My Content</h2>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="stories" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Story
            </TabsTrigger>
            <TabsTrigger value="collaborators" className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Co-Authors & Contributors
            </TabsTrigger>
            <TabsTrigger value="comments" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> My Comments
            </TabsTrigger>
            <TabsTrigger value="branches" className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" /> My Branches
            </TabsTrigger>
            <TabsTrigger value="contributions" className="flex items-center gap-2">
              <HandHelping className="h-4 w-4" /> My Contributions
            </TabsTrigger>
            <TabsTrigger value="spaces" className="flex items-center gap-2">
              <Rocket className="h-4 w-4" /> My Spaces
            </TabsTrigger>
          </TabsList>

          {/* ── Story Tab ── */}
          <TabsContent value="stories">
            <Card>
              <CardHeader>
                <CardTitle>Story</CardTitle>
                <CardDescription>All your creative works — stories, screenplays, audio, cartoons, and video.</CardDescription>
              </CardHeader>
              <CardContent>
                {allContent.length === 0 ? (
                  <EmptyState icon={BookOpen} message="You don't have any stories yet" detail="Your stories, screenplays, audio, cartoons, and videos will appear here once you create them." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Type</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Title</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Roles</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Visibility</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Created</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {allContent.map((item) => {
                          const id = item.type === "story" ? (item as StoryItem).story_title_id : (item as ScreenplayItem).screenplay_id;
                          const url = item.type === "story" ? `/story/${id}` : `/screenplay/${id}`;
                          return (
                            <tr key={`${item.type}-${id}`} className="border-b hover:bg-muted/30">
                              <td className="p-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  item.type === "story"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}>
                                  {item.type === "story" ? <BookOpen className="h-3 w-3 inline mr-1" /> : <Film className="h-3 w-3 inline mr-1" />}
                                  {item.type}
                                </span>
                              </td>
                              <td className="p-2 font-medium">
                                <Link to={url} className="text-indigo-600 hover:underline">{item.title || "Untitled"}</Link>
                              </td>
                              <td className="p-2">
                                <div className="flex flex-wrap gap-1">
                                  {item.roles.map((r) => <RoleBadge key={r} role={r} />)}
                                </div>
                              </td>
                              <td className="p-2"><VisibilityBadge visibility={item.visibility} published={item.published} /></td>
                              <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(item.created_at).toLocaleDateString()}</td>
                              <td className="p-2">
                                <Link to={url} className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /></Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Co-Authors & Contributors Tab ── */}
          <TabsContent value="collaborators">
            <Card>
              <CardHeader>
                <CardTitle>Co-Authors & Contributors</CardTitle>
                <CardDescription>Works where you collaborate with others or others contribute to yours.</CardDescription>
              </CardHeader>
              <CardContent>
                {collaboratorContent.length === 0 ? (
                  <EmptyState icon={Users} message="No collaborations yet" detail="Works with co-authors or contributors will appear here." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Type</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Title</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Your Roles</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Visibility</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {collaboratorContent.map((item) => {
                          const id = item.type === "story" ? (item as StoryItem).story_title_id : (item as ScreenplayItem).screenplay_id;
                          const url = item.type === "story" ? `/story/${id}` : `/screenplay/${id}`;
                          return (
                            <tr key={`${item.type}-${id}`} className="border-b hover:bg-muted/30">
                              <td className="p-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.type === "story" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                                  {item.type}
                                </span>
                              </td>
                              <td className="p-2 font-medium">
                                <Link to={url} className="text-indigo-600 hover:underline">{item.title || "Untitled"}</Link>
                              </td>
                              <td className="p-2">
                                <div className="flex flex-wrap gap-1">
                                  {item.roles.map((r) => <RoleBadge key={r} role={r} />)}
                                </div>
                              </td>
                              <td className="p-2"><VisibilityBadge visibility={item.visibility} published={item.published} /></td>
                              <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(item.created_at).toLocaleDateString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── My Comments Tab ── */}
          <TabsContent value="comments">
            <Card>
              <CardHeader>
                <CardTitle>My Comments</CardTitle>
                <CardDescription>View and manage your comments on stories and screenplays.</CardDescription>
              </CardHeader>
              <CardContent>
                {comments.length === 0 ? (
                  <EmptyState icon={MessageSquare} message="You haven't made any comments yet" detail="Your comments on stories and screenplays will appear here." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">On</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Comment</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comments.map((c) => {
                          const target = c.story_title
                            ? { label: c.story_title, sub: c.chapter_title, url: `/story/${c.story_title_id}` }
                            : c.screenplay_title
                            ? { label: c.screenplay_title, sub: null, url: `/screenplay/${c.screenplay_id}` }
                            : { label: "Unknown", sub: null, url: "#" };
                          return (
                            <tr key={c.id} className="border-b hover:bg-muted/30">
                              <td className="p-2">
                                <Link to={target.url} className="text-indigo-600 hover:underline font-medium">{target.label}</Link>
                                {target.sub && <div className="text-xs text-muted-foreground">{target.sub}</div>}
                                {c.paragraph_index != null && <div className="text-xs text-muted-foreground">Paragraph {c.paragraph_index + 1}</div>}
                              </td>
                              <td className="p-2">
                                <p className="line-clamp-2 text-sm">{c.body}</p>
                              </td>
                              <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(c.created_at).toLocaleDateString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── My Branches Tab ── */}
          <TabsContent value="branches">
            <Card>
              <CardHeader>
                <CardTitle>My Branches</CardTitle>
                <CardDescription>Your alternative paragraph versions across stories.</CardDescription>
              </CardHeader>
              <CardContent>
                {branches.length === 0 ? (
                  <EmptyState icon={GitBranch} message="You don't have any branches yet" detail="Your paragraph branches and forks will appear here." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Story</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Chapter</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Original</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Branch</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {branches.map((b) => (
                          <tr key={b.id} className="border-b hover:bg-muted/30">
                            <td className="p-2">
                              <Link to={`/story/${b.story_title_id}`} className="text-indigo-600 hover:underline font-medium">
                                {b.story_title || "Untitled"}
                              </Link>
                            </td>
                            <td className="p-2 text-muted-foreground">{b.chapter_title || "—"}</td>
                            <td className="p-2">
                              <p className="line-clamp-2 text-xs text-muted-foreground italic">{b.parent_paragraph_text || "—"}</p>
                            </td>
                            <td className="p-2">
                              <p className="line-clamp-2 text-sm">{b.branch_text}</p>
                            </td>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(b.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── My Contributions Tab ── */}
          <TabsContent value="contributions">
            <Card>
              <CardHeader>
                <CardTitle>My Contributions</CardTitle>
                <CardDescription>Track your contributions to other creators' work.</CardDescription>
              </CardHeader>
              <CardContent>
                {contributions.length === 0 ? (
                  <EmptyState icon={HandHelping} message="You haven't made any contributions yet" detail="Your contributions to others' work will appear here." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Story</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Chapter</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Text</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Words</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Status</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contributions.map((c) => (
                          <tr key={c.id} className="border-b hover:bg-muted/30">
                            <td className="p-2 font-medium">{c.story_title || "Untitled"}</td>
                            <td className="p-2 text-muted-foreground">{c.chapter_title || "—"}</td>
                            <td className="p-2">
                              <p className="line-clamp-2 text-sm">{c.new_paragraph || "—"}</p>
                            </td>
                            <td className="p-2 text-center">{c.words}</td>
                            <td className="p-2"><StatusBadge status={c.status} /></td>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(c.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── My Spaces Tab ── */}
          <TabsContent value="spaces">
            <Card>
              <CardHeader>
                <CardTitle>My Spaces</CardTitle>
                <CardDescription>Manage your creative spaces and collections.</CardDescription>
              </CardHeader>
              <CardContent>
                {spaces.length === 0 ? (
                  <EmptyState icon={Rocket} message="You don't have any spaces yet" detail="Your creative spaces and collections will appear here." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Name</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Description</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Visibility</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Created</th>
                          <th className="text-left p-2 font-medium text-xs uppercase tracking-wide"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {spaces.map((s) => (
                          <tr key={s.id} className="border-b hover:bg-muted/30">
                            <td className="p-2 font-medium">
                              <Link to={`/creative_space/${s.id}`} className="text-indigo-600 hover:underline">{s.name}</Link>
                            </td>
                            <td className="p-2 text-muted-foreground">
                              <p className="line-clamp-1">{s.description || "—"}</p>
                            </td>
                            <td className="p-2"><VisibilityBadge visibility={s.visibility} published={s.published} /></td>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(s.created_at).toLocaleDateString()}</td>
                            <td className="p-2">
                              <Link to={`/creative_space/${s.id}`} className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /></Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default Admin;
