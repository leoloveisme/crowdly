import { matchRoutes, type RouteObject } from "react-router-dom";

export const LAYOUT_PAGE_KEY = "/__layout__";

// Kept in sync manually with the <Routes> list in src/App.tsx (see comment
// there pointing back to this file). Only `path` strings are needed here —
// no elements — since this is only ever used for matching, never rendering.
const ROUTE_PATTERNS: string[] = [
  "/", "/suggest-feature", "/feedback", "/contact", "/feature-suggestions", "/account-administration",
  "/new-story-template", "/new-comic-template", "/story-for-consumers",
  "/story-to-live", "/profile", "/sitemap", "/software", "/about-us",
  "/lounge", "/login", "/register", "/stories/spaces-migration",
  "/platform-admin", "/admin", "/support", "/admin/invite-users",
  "/friends", "/communications", "/search",
  "/story/:story_id", "/story/:story_id/chapter/:chapter_id",
  "/story/:story_id/details", "/screenplay/:screenplay_id",
  "/creative_space/:spaceId", "/favorites", "/newest_stories",
  "/newest_screenplays", "/newest_comics", "/comic/:comic_id",
  "/living_stories", "/lived_stories", "/alpha",
  "/:username", // catch-all — kept last for readability; matchRoutes ranks by specificity regardless of order
  "*",          // NotFound
];

// Routes that render the *same* page component under a different pattern are
// collapsed onto one canonical key, so translators aren't asked to duplicate
// the same UI text under multiple page_path values.
const CANONICAL_ALIASES: Record<string, string> = {
  "/story/:story_id/chapter/:chapter_id": "/story/:story_id",
};

const ROUTE_OBJECTS: RouteObject[] = ROUTE_PATTERNS.map((path) => ({ path }));

/** Maps a literal URL pathname to a stable key for interface_translations.page_path. */
export function getPageKey(pathname: string): string {
  const matches = matchRoutes(ROUTE_OBJECTS, pathname);
  if (!matches || matches.length === 0) return pathname;
  const matched = matches[matches.length - 1].route.path as string;
  return CANONICAL_ALIASES[matched] ?? matched;
}
