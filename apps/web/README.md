# Crowdly web app

The Crowdly desktop editor in the browser: Creation (writing stories, screenplays and comics, Spaces, revisions, live co-editing) and Discovery (browse, library, shelves, reader). It also works offline and can be installed as an app.

- **Code:** `src/` holds the web app's own code (`@web/…`). Platform code from the repo root's `src/` is reused through `@/…`. There is no separate `node_modules`; run `npm ci` at the repo root.
- **Hosting:** a stand-alone app at the root of its own domain (`<app domain>`), with its API at `api.<app domain>`. It is never served under crowdly.cloud.
- **Dev:** `npm run dev` serves http://localhost:5173/ and proxies the backend on :4000.
- **Build and deploy:** see `Documentation/Web_app_deploy.md`.
- **UI text:** every static string is an `EditableText` with a `webapp-…` id. Page keys are `/webapp/...` (`src/lib/pageKey.ts`).
