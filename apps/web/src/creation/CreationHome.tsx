import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookText, Clapperboard, Images, FolderOpen, Plus } from "lucide-react";
import { listMyComics, listMyScreenplays, listMyStories, listSpaces, listSharedSpaces } from "@web/lib/docs";
import { useWorkspace } from "@web/shell/workspace";
import { NewDocumentDialog, LoginDialog, type NewKind } from "@web/shell/dialogs";

// Creation start page: the user's stories, screenplays, comics and Spaces,
// plus the documents left open last time.
const Section: React.FC<{ icon: React.ReactNode; titleId: string; title: string; emptyId: string; empty: string; onNew?: () => void; children: React.ReactNode; count: number }> = ({
  icon,
  titleId,
  title,
  emptyId,
  empty,
  onNew,
  children,
  count,
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="flex items-center gap-2 text-base">
        {icon}
        <EditableText id={titleId}>{title}</EditableText>
      </CardTitle>
      {onNew && (
        <Button size="sm" variant="ghost" onClick={onNew} aria-label="New">
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </CardHeader>
    <CardContent>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">
          <EditableText id={emptyId}>{empty}</EditableText>
        </p>
      ) : (
        <ul className="max-h-72 space-y-0.5 overflow-auto">{children}</ul>
      )}
    </CardContent>
  </Card>
);

const Row: React.FC<{ to: string; title: string; meta?: string }> = ({ to, title, meta }) => (
  <li>
    <Link to={to} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
      <span className="truncate">{title || "Untitled"}</span>
      {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
    </Link>
  </li>
);

const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString() : undefined);

const CreationHome: React.FC = () => {
  const { user, loading } = useAuth();
  const { tabs, prefs } = useWorkspace();
  const navigate = useNavigate();
  const [newKind, setNewKind] = useState<NewKind | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const uid = user?.id;

  const stories = useQuery({ queryKey: ["my-stories", uid], queryFn: () => listMyStories(uid!), enabled: !!uid });
  const screenplays = useQuery({ queryKey: ["my-screenplays", uid], queryFn: () => listMyScreenplays(uid!), enabled: !!uid });
  const comics = useQuery({ queryKey: ["my-comics", uid], queryFn: () => listMyComics(uid!), enabled: !!uid });
  const spaces = useQuery({
    queryKey: ["spaces", uid],
    queryFn: async () => {
      const [mine, shared] = await Promise.all([listSpaces(uid!), listSharedSpaces()]);
      return [...mine, ...shared.filter((s) => !mine.some((m) => m.id === s.id))];
    },
    enabled: !!uid,
  });

  if (loading) return null;

  if (!user) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 p-8 text-center">
        <EditableText id="webapp-home-hero" as="h1" className="text-3xl font-bold">
          Crowdly web app
        </EditableText>
        <EditableText id="webapp-home-hero-sub" as="p" className="text-muted-foreground">
          Write stories, screenplays and comics in your browser — all you need is a browser. Everything syncs with Crowdly and the desktop app.
        </EditableText>
        <div className="flex gap-2">
          <Button onClick={() => setLoginOpen(true)}>
            <EditableText id="webapp-home-login">Log in to start writing</EditableText>
          </Button>
          <Button variant="outline" onClick={() => navigate("/discover")}>
            <EditableText id="webapp-home-browse">Browse stories</EditableText>
          </Button>
        </div>
        <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <EditableText id="webapp-home-title" as="h1" className="text-2xl font-semibold">
          Creation
        </EditableText>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setNewKind("story")}>
            <EditableText id="webapp-home-new-story">New story</EditableText>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setNewKind("screenplay")}>
            <EditableText id="webapp-home-new-screenplay">New screenplay</EditableText>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setNewKind("comic")}>
            <EditableText id="webapp-home-new-comic">New comic</EditableText>
          </Button>
        </div>
      </div>

      {tabs.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          <EditableText id="webapp-home-continue" className="text-muted-foreground">
            Continue with:
          </EditableText>
          {tabs.slice(-6).map((t) => (
            <Link key={t.path} to={t.path} className="rounded-full border px-3 py-0.5 hover:bg-muted">
              {t.title}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Section icon={<BookText className="h-4 w-4" />} titleId="webapp-home-stories" title="Stories" emptyId="webapp-home-stories-empty" empty="No stories yet." onNew={() => setNewKind("story")} count={stories.data?.length ?? 0}>
          {stories.data?.map((s) => <Row key={s.story_title_id} to={`/story/${s.story_title_id}`} title={s.title} meta={fmt(s.updated_at ?? s.created_at)} />)}
        </Section>
        <Section icon={<Clapperboard className="h-4 w-4" />} titleId="webapp-home-screenplays" title="Screenplays" emptyId="webapp-home-screenplays-empty" empty="No screenplays yet." onNew={() => setNewKind("screenplay")} count={screenplays.data?.length ?? 0}>
          {screenplays.data?.map((s) => <Row key={s.screenplay_id} to={`/screenplay/${s.screenplay_id}`} title={s.title} meta={fmt(s.created_at)} />)}
        </Section>
        <Section icon={<Images className="h-4 w-4" />} titleId="webapp-home-comics" title="Comics & manga" emptyId="webapp-home-comics-empty" empty="No comics yet." onNew={() => setNewKind("comic")} count={comics.data?.length ?? 0}>
          {comics.data?.map((c) => <Row key={c.comic_id} to={`/comic/${c.comic_id}`} title={c.title} meta={fmt(c.created_at)} />)}
        </Section>
        <Section icon={<FolderOpen className="h-4 w-4" />} titleId="webapp-home-spaces" title="Spaces" emptyId="webapp-home-spaces-empty" empty="No Spaces yet. Use Spaces → Add." count={spaces.data?.length ?? 0}>
          {spaces.data?.map((s) => <Row key={s.id} to={`/space/${s.id}`} title={s.name} meta={s.user_id === uid ? undefined : "shared"} />)}
        </Section>
      </div>

      <NewDocumentDialog open={!!newKind} initialKind={newKind ?? "story"} onOpenChange={(o) => !o && setNewKind(null)} spaceId={prefs.activeSpaceId} />
    </div>
  );
};

export default CreationHome;
