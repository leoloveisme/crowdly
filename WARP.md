# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Commands

### Python = Python3 !!!! Use python3 instead just python

### Environment and setup (web app)
- Requires Node.js and npm (README recommends installing Node via nvm).
- All frontend commands below are run from the repository root.
- The backend for the web app is a **local Node/Express + PostgreSQL** service
  under `backend/`.
- We do **not** use Supabase as our primary database in this repo; some
  Supabase types are still referenced in the TypeScript layer (e.g. for
  auth/roles), but data is persisted to a local PostgreSQL instance.

#### Install dependencies
```sh
npm install
```

#### Run the development server
Vite dev server with hot reloading:
```sh
npm run dev
```

#### Build for production
Standard production build:
```sh
npm run build
```

Development-mode build (uses Vite's `--mode development`):
```sh
npm run build:dev
```

#### Preview a production build
Build and then serve the built app locally:
```sh
npm run build
npm run preview
```

#### Lint the frontend
Project-wide ESLint run:
```sh
npm run lint
```

### Backend (local PostgreSQL)
- The backend lives in `backend/` and talks to a local PostgreSQL database,
  not to Supabase.
- Typical dev workflow:
  ```sh
  cd backend
  npm install        # first time only
  node src/server.js # or your preferred dev runner
  ```
- The frontend assumes this backend is reachable at `http://localhost:4000`
  (or whatever `PORT` is configured via environment variables).

> Note: There is currently no configured test runner or `npm test` script in the frontend; add one explicitly in `package.json` if you introduce automated tests.

### Desktop client (Python editor)
The `desktop client/` subdirectory is a separate Python project for the distraction-free WYSIWYG editor.

Run these from within the `desktop client` directory:

#### Create a virtual environment and install in editable mode
```bash
cd "desktop client"
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

#### Run the editor application
After an editable install (or with `PYTHONPATH=src` set appropriately):
```bash
cd "desktop client"
source .venv/bin/activate  # if not already active
python -m editor.app
```

#### Tests (planned)
There is no test suite yet. The existing `desktop client/WARP.md` assumes future tests will live under `tests/` and be run with `pytest`, e.g.:
```bash
pytest tests/path/to/test_file.py::TestClass::test_case
```
Once tests exist, mirror whatever command you add there in this repository's documentation.

## Code architecture and structure

### Repository layout
- Root: Vite + React + TypeScript SPA for the Crowdly web platform.
- `src/`: Frontend application code (entrypoints, pages, shared components, contexts, hooks, integrations).
- `desktop client/`: Standalone Python/PySide6 desktop editor using a `src` layout and configured via `pyproject.toml`.

### Web app (Vite/React frontend)

#### Entry point and global providers
- `src/main.tsx` creates the React root and renders `<App />` into the `#root` DOM element.
- `src/App.tsx` is the composition root for global concerns:
  - Wraps the app in `QueryClientProvider` from `@tanstack/react-query`.
  - Wraps with `TooltipProvider` and two toaster systems: `@/components/ui/toaster` and `@/components/ui/sonner`.
  - Uses `BrowserRouter` from `react-router-dom` to manage routing.
  - Provides application-wide contexts: `AuthProvider` and `EditableContentProvider`.
  - Declares all route definitions via `<Routes>` / `<Route>` mapping to components in `src/pages`.

When adding cross-cutting concerns (e.g., new global providers), prefer to layer them in `App.tsx` rather than inside individual pages.

#### Routing and pages
- Route-level components live under `src/pages/` and are wired directly in `App.tsx`.
- Current routes include the landing/index page, feature suggestion flows, account administration, multiple story-related views, user profile, sitemap, lounge, about page, auth screens (login/register), and a catch-all `NotFound` page.
- There is a dynamic route `"/story/:story_id"` handled by `src/pages/Story.tsx`.
- The router comment in `App.tsx` explicitly notes that custom routes should be added **above** the catch-all `"*"` route.

When creating a new screen, add a component under `src/pages/` and register a corresponding `<Route>` in `App.tsx`, keeping the wildcard route last.

#### Contexts and Supabase integration
- `src/contexts/AuthContext.tsx`:
  - Integrates with Supabase via `@/integrations/supabase/client` to manage authentication and sessions.
  - Supabase is used **only** for auth/session management in this repo; all
    application data (stories, screenplays, etc.) is stored in the local
    PostgreSQL database behind the Node/Express backend.
  - Tracks `user`, `session`, `loading`, and `roles` (typed `UserRole` union including roles like `platform_admin`, `consumer`, `author`, etc.).
  - Exposes `hasRole(role)`, `signIn(email, password)`, and `signOut()` helpers.
  - Subscribes to Supabase auth state changes and separately fetches user roles from a `user_roles` table, attaching them to the `user` object.
  - Provides a `useAuth()` hook that enforces usage inside `AuthProvider`.

- `src/contexts/EditableContentContext.tsx`:
  - Depends on `useAuth()` and the router (`useLocation`) to provide per-page, per-language editable text sections.
  - Persists content through Supabase using an `editable_content` table keyed by `page_path`, `element_id`, and `language`.
  - Tracks an `isEditingEnabled` flag that is only togglable by admins (`hasRole('platform_admin')`).
  - Exposes operations to start editing, update content, save to Supabase (with upsert-like semantics), cancel editing, and switch the current language.
  - Drives the inline editing system used by display components and is toggled globally via `EditingModeToggle`.

New features that need authentication, authorization, or inline editable content should reuse these contexts (and their hooks) instead of duplicating Supabase access logic.

#### Components and UI primitives
- `src/components/` contains domain-specific React components, such as story editors (`ChapterEditor`, `StoryBranchList`, `StorySelector`, etc.), layout controls (`LayoutOptionButtons`, `ResponsiveTabsTrigger`), profile utilities (`EditableBio`, `ProfilePictureUpload`), and authentication forms (`LoginForm`, `RegisterForm`).
- `src/components/ui/` is a shadcn-ui style component library layer with reusable primitives (`button`, `card`, `dialog`, `tabs`, `toast`, `toaster`, `tooltip`, etc.). These are used both by `src/components` and `src/pages`.
- The codebase uses TypeScript path aliases (e.g., `@/components/ui/toaster`, `@/integrations/supabase/client`, `@/hooks/use-toast`) to reference these modules; keep new shared utilities within this structure so they can be imported via the existing aliases.

When implementing new UI, prefer to:
- Compose from `src/components/ui` primitives.
- Put page-specific orchestration in `src/pages/*`.
- Extract reusable, story- or account-related pieces into `src/components/*` rather than growing pages into large monoliths.

#### Hooks and integrations
- `src/hooks/` currently includes utilities like `use-toast` and `use-mobile`; these centralize cross-cutting behaviors and should be extended similarly for other global hooks.
- `src/integrations/supabase/` contains `client.ts` and `types.ts` for configuring the Supabase client and types. Any new Supabase tables or RPCs should be modelled here and then consumed from contexts/components.

### Desktop client (Python WYSIWYG editor)
The `desktop client/` directory is a separate Python package (`distraction-free-wysiwyg-editor`) using a `src` layout:
- `pyproject.toml` configures `setuptools.build_meta` and declares dependencies on `pyside6` and `markdown`.
- `src/editor/app.py` defines the canonical `main()` entrypoint, which:
  - Creates a `QApplication`.
  - Loads user/application settings via `editor.settings.load_settings()`.
  - Constructs and shows `editor.ui.main_window.MainWindow`.
- `src/editor/ui/main_window.py` implements the main window:
  - Top bar with a burger menu for actions (new document, open, settings, project space management, quit).
  - A toggleable preview pane implemented via `EditorWidget` and `PreviewWidget` in a `QSplitter`.
  - A status bar indicator for the current "project space" directory.
  - A `Document` model that tracks content, path, and dirty state, with a debounced autosave timer.
  - Logic to map documents outside the project space into copies inside it, and to generate timestamped filenames like `untitled-YYYYMMDD-HHMMSS.md`.

For changes within `desktop client/`, follow the more detailed guidance in `desktop client/WARP.md` and treat `editor.app.main()` as the integration point.

## How Warp agents should work in this repo
- Distinguish between the **web app** (root-level Vite/React project) and the **desktop editor** (`desktop client/` Python project); keep changes scoped to the correct subproject.
- For frontend work:
  - Wire new routes in `src/App.tsx` and implement route components under `src/pages/`.
  - Prefer adding shared logic to `src/contexts`, `src/hooks`, or `src/components` instead of duplicating code.
  - Reuse Supabase integration (`src/integrations/supabase`) via contexts and hooks; avoid scattering direct Supabase calls.
- For desktop client work:
  - Keep `editor.app.main()` thin and push UI behavior into `editor.ui.*` modules and persistence/logic into `editor.document`, `editor.storage`, and `editor.settings`.
  - Respect the existing autosave and project space abstractions when adding new file or library features.
  - In multi-pane editor layouts (Markdown vs WYSIWYG, search, etc.), treat the pane whose text cursor currently has focus as the *active* pane; save/export/format decisions should be based on this active pane.
