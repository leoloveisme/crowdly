# Implementing opening stories from Crowdly web platform
## Problem statement
Add support for opening an existing story from the Crowdly web platform given a URL of the form `/story/{story_id}` (or a raw `story_id`), and loading it into the editor (Markdown/HTML editor + preview) in a way that:
- Does not block the UI thread.
- Handles authentication (if required by the web platform) cleanly.
- Keeps the editor “local-first” by saving a local copy in the configured project space.

This document describes a concrete implementation plan aligned with the current code layout under `src/editor/`.

## Current state (relevant)
- UI entry point is `src/editor/ui/main_window.py`.
- The burger menu has an `Open -> Story on the web` entry wired to `MainWindow._open_story_on_web()` (currently a placeholder).
- Local login is implemented via `src/editor/ui/auth_dialog.py` and `src/editor/auth.py` backed by local PostgreSQL. This currently authenticates a local user, but does not provide a Crowdly web-session token.
- `MainWindow._open_document()` already handles opening a local markdown document and populating editor + preview.

## Assumptions / decisions to confirm
1. Crowdly base URL
- Decide where the web platform lives, e.g. `https://crowdly.example`.
- Store it in settings (`src/editor/settings.py`) so it can be configured.

2. Story endpoint behavior
Confirm:
- Is `/story/{story_id}` a page (HTML) or an API endpoint returning JSON/Markdown?
- If it is an HTML page, define how to extract the canonical story body (and in what format).

3. Authentication model
Confirm whether `GET /story/{story_id}` requires auth.
- If public: no token needed.
- If private: we need a token/cookie-based session.

The rest of this plan supports both paths.

## Proposed architecture
### New modules
Add these modules under `src/editor/` to keep `ui/main_window.py` thin:
1. `src/editor/crowdly_client.py`
- Responsibility: HTTP interactions with the Crowdly web platform.
- Functions/classes:
  - `@dataclass class CrowdlyStory: id, title, body, body_format, updated_at, source_url`
  - `class CrowdlyClient:`
    - `fetch_story(story_id: str) -> CrowdlyStory`
    - optional: `parse_story_id(input: str) -> str` (accept raw id or full URL)

2. `src/editor/story_import.py`
- Responsibility: map a fetched `CrowdlyStory` into a local `Document` and decide where to save it.
- Functions:
  - `map_story_to_document(story: CrowdlyStory) -> Document`
  - `suggest_local_path(project_space: Path, story: CrowdlyStory) -> Path`
  - `persist_import_metadata(local_path: Path, story: CrowdlyStory) -> None` (sidecar metadata)

3. `src/editor/ui/open_story_dialog.py`
- Simple dialog to collect:
  - Story URL or story_id
  - (Optional) “Save as” filename override

### Settings additions
Extend `Settings` in `src/editor/settings.py` to include:
- `crowdly_base_url: str | None`
- optional `crowdly_auth_mode: Literal["none", "bearer", "cookie"]`

Persist via the existing settings save/load functions.

## Data handling and file format
### Preferred approach (API-first)
If the web platform can provide story data via an API endpoint (recommended):
- `GET {base_url}/api/story/{story_id}` -> JSON
- JSON should include either:
  - Markdown (`body_md`) or
  - HTML (`body_html`) + a declared format.

The editor can then:
- Store markdown (or HTML) as the canonical content.
- Load it into:
  - `self.editor.setPlainText(content)`
  - `self.preview.set_markdown(content)` (or equivalent conversion if needed)

### Fallback (HTML scraping)
If only `/story/{story_id}` HTML exists:
- Use a robust extraction strategy (ideally an API is added instead).
- If scraping is unavoidable, isolate parsing logic inside `crowdly_client.py` and treat it as best-effort.

## UI flow
### User action
1. User clicks `Open -> Story on the web`.
2. Show `OpenStoryDialog`:
   - Input: story URL or story_id
3. On submit:
   - Disable dialog inputs and show a busy indicator.
   - Start background fetch.

### Background fetch
Do not block the UI thread.
Implementation options:
- Use a `QThread` worker object.
- Or use `concurrent.futures.ThreadPoolExecutor` and marshal results back to the UI via Qt signals.

Worker steps:
1. Parse story_id from user input.
2. Call `CrowdlyClient.fetch_story(story_id)`.
3. Return `CrowdlyStory` or a structured error.

### On success
In `MainWindow`:
1. Map story -> `Document`.
2. Choose local save location:
   - If project space set: save inside it.
   - If not set: prompt user to set project space or choose a directory.
3. Save immediately (so the imported story becomes “local-first” right away).
4. Update UI:
   - Populate editor and preview.
   - Update title/status.

### On failure
Show a message box with a user-friendly error:
- network error
- invalid URL / invalid story_id
- 404 not found
- auth required

## Authentication plan
### Phase 1: support public stories (no auth)
- Implement unauthenticated fetch with clear error messaging.

### Phase 2: private stories (token/session)
Pick one:
1. Bearer token
- Add a “Crowdly API token” field in Settings.
- `CrowdlyClient` sets `Authorization: Bearer ...`.

2. Cookie/session-based
- Add a login flow against the web platform (separate from local Postgres login).
- Store session cookie securely (at minimum in-memory during runtime; optionally persisted with care).

Because the current login system is local-only, do not overload it; create a separate “Crowdly web login” settings path.

## Local metadata for round-tripping
Add a small metadata sidecar file next to the saved document, e.g.:
- `my-story.md`
- `my-story.md.crowdly.json`

Include:
- `story_id`
- `source_url`
- `fetched_at`
- `title`
- `body_format`
- optional `etag`/`last_modified` for future “refresh from web”

This enables future features:
- “Refresh from web”
- “Open in browser”
- “Sync back”

## Error handling and resilience
- All network calls wrapped in try/except and return a typed error.
- Enforce timeouts.
- Validate `story_id` format early.
- Never crash the app on parse errors or unexpected server responses.

## Security considerations
- Do not log tokens.
- If storing tokens locally, prefer OS keyring later; for now, keep tokens in settings only if acceptable for your threat model.

## Implementation steps (suggested order)
1. Add `crowdly_base_url` to `Settings` and expose it in the Settings menu (minimal UI can be a simple input dialog initially).
2. Implement `CrowdlyClient` with:
   - `parse_story_id()`
   - `fetch_story()` with timeouts and error mapping.
3. Add `OpenStoryDialog`.
4. Wire `MainWindow._open_story_on_web()` to:
   - show dialog
   - run background fetch
   - on success, save a local copy and load into editor
5. Add metadata sidecar writing.
6. Add manual QA scenarios:
   - Valid public story loads
   - Invalid id -> friendly error
   - Network down -> friendly error
   - Project space missing -> prompt
7. (Optional) Add “Refresh from web” action when a document has `.crowdly.json` metadata.

## Open questions
- What exact content format should be imported (Markdown vs HTML)?
- What is the canonical API endpoint (if any) for story retrieval?
- Does the endpoint require authentication? If yes, what auth mechanism is used by Crowdly web platform?
- Should imported stories be stored with a naming convention (slug/id/title)?

The naming for opened stories has to be 'story_id'-yearmonthday-hhmmss.md
