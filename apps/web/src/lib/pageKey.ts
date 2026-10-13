import { matchRoutes, type RouteObject } from "react-router-dom";

// Page keys for EditableText translations in the web app. Pathnames arrive
// relative to the router basename (/editor or /), so we prefix "/editor" to
// keep the keys apart from the platform's own pages. Keep in sync with the
// <Routes> in App.tsx.
export const EDITOR_ROUTE_PATTERNS = [
  "/",
  "/discover",
  "/library",
  "/read/:kind/:id",
  "/shelves",
  "/settings",
  "/local",
  "/story/:id",
  "/screenplay/:id",
  "/comic/:id",
  "/space/:spaceId/*",
  "/file/:spaceId/:itemId",
  "/master/:spaceId/:itemId",
  "*",
];

const ROUTES: RouteObject[] = EDITOR_ROUTE_PATTERNS.map((path) => ({ path }));

export function getEditorPageKey(pathname: string): string {
  const m = matchRoutes(ROUTES, pathname);
  const pattern = m && m.length ? (m[m.length - 1].route.path as string) : pathname;
  return pattern === "/" ? "/editor" : `/editor${pattern}`;
}
