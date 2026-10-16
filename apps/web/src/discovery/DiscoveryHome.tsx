import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Library, Search as SearchIcon, Layers } from "lucide-react";
import { useWorkspace } from "@web/shell/workspace";
import { discoverHome, search } from "@web/lib/discovery";
import { ItemCard, ItemGrid } from "./ItemCard";

// Discovery start page (desktop: Browse Crowdly) — continue reading,
// favorites, newest, most popular, most active, living, lived — plus search.
const ROW_TITLES: Record<string, [string, string]> = {
  continue: ["webapp-disc-row-continue", "Continue reading"],
  favorites: ["webapp-disc-row-favorites", "Favorites"],
  newest: ["webapp-disc-row-newest", "Newest stories"],
  newest_screenplays: ["webapp-disc-row-newest-sp", "Newest screenplays"],
  most_popular: ["webapp-disc-row-popular", "Most popular"],
  most_popular_screenplays: ["webapp-disc-row-popular-sp", "Most popular screenplays"],
  most_active: ["webapp-disc-row-active", "Most active"],
  most_active_screenplays: ["webapp-disc-row-active-sp", "Most active screenplays"],
  living: ["webapp-disc-row-living", "Living (experiencing now)"],
  lived: ["webapp-disc-row-lived", "Lived (experienced)"],
};

const DiscoveryHome: React.FC = () => {
  const { user } = useAuth();
  const { setMode } = useWorkspace();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => setMode("discovery"), [setMode]);

  const home = useQuery({ queryKey: ["discover-home", user?.id], queryFn: discoverHome, enabled: !!user });
  const results = useQuery({ queryKey: ["search", query], queryFn: () => search(query), enabled: query.length > 1 });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-3 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <EditableText id="webapp-disc-title" as="h1" className="mr-auto text-2xl font-semibold">
          Discovery
        </EditableText>
        <Button variant="outline" size="sm" asChild className="gap-1">
          <Link to="/library">
            <Library className="h-4 w-4" />
            <EditableText id="webapp-disc-library">My library</EditableText>
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-1">
          <Link to="/shelves">
            <Layers className="h-4 w-4" />
            <EditableText id="webapp-disc-shelves">Shelves</EditableText>
          </Link>
        </Button>
      </div>

      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stories, screenplays and people" className="pl-9" />
      </form>

      {query && (
        <section>
          <EditableText id="webapp-disc-results" as="h2" className="mb-2 text-lg font-medium">
            Results
          </EditableText>
          {results.data?.results.length === 0 && (
            <EditableText id="webapp-disc-no-results" as="p" className="text-sm text-muted-foreground">
              Nothing found.
            </EditableText>
          )}
          <ul className="divide-y rounded border">
            {results.data?.results
              .filter((r) => r.type !== "user")
              .map((r) => {
                const id = r.id.split(":")[1];
                return (
                  <li key={r.id}>
                    <button className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => navigate(`/read/${r.type}/${id}`)}>
                      <span className="text-xs uppercase text-muted-foreground">{r.type}</span>
                      <span className="font-medium">{r.title}</span>
                      {r.subtitle && <span className="truncate text-muted-foreground">{r.subtitle}</span>}
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      )}

      {!user && (
        <EditableText id="webapp-disc-login" as="p" className="text-muted-foreground">
          Log in to see your favorites, what you're reading and the newest stories.
        </EditableText>
      )}

      {home.data?.rows
        .filter((r) => r.items.length > 0)
        .map((r) => {
          const [id, title] = ROW_TITLES[r.key] ?? [`webapp-disc-row-${r.key}`, r.key];
          return (
            <section key={r.key}>
              <EditableText id={id} as="h2" className="mb-2 text-lg font-medium">
                {title}
              </EditableText>
              <ItemGrid>
                {r.items.slice(0, 16).map((i) => (
                  <ItemCard key={`${i.type}:${i.id}`} item={i} />
                ))}
              </ItemGrid>
            </section>
          );
        })}
    </div>
  );
};

export default DiscoveryHome;
