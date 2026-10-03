# Enhancement of the desktop app v3 - Discovery layout

## Implementation status (2026-10-03)

Implemented. Not committed yet.

**Desktop** (`apps/desktop/src/editor/ui/discovery/`)
- New: `cards.py`, `browse_page.py`, `library_page.py`, `details_panel.py`.
- `discovery_view.py` is rewritten.
- `shelves_page.py` now only holds the "Add to shelf" menu and shared helpers.
- The reader has the Aa menu and a "Back" that returns to where you came from.

**Covers**
- Code: `library/covers.py`.
- Covers come from the EPUB cover or the PDF's first page; otherwise a generated placeholder is used.
- Covers sync through `PUT`/`GET /library/items/:id/cover`.

**Backend**
- `GET /discover/home` returns all Browse rows in one call.
- Story and screenplay items now include author, description, cover and chapter count.
- The screenplay list queries moved into `backend/src/storyLists.js`.
- Migration `0020_library_item_covers.sql` adds the `cover_key` column. Migration 0018 never created it, even though v2 planned it.

**Not done**
- Embedded artwork for audiobooks is not read yet; they get a placeholder.
- Story covers in "Crowdly stories" (local) show placeholders until the story is seen on an account shelf or in Browse.

## Context

Discovery's top bar currently has four equal grey buttons: Shelves | My library | Reading on Crowdly | Browse Crowdly. Every page is a plain text list.

This doesn't read like a reading app:
- Shelves and the library are split apart.
- "Reading on Crowdly" duplicates the Living shelf.
- Browse shows a bare "Newest stories" list where many titles look alike (eight "Story of my life").

**User's direction**
- Remove the "Shelves" tab; shelves move into "My Library".
- Remove "Reading on Crowdly".
- Search moves to the left, next to "Add books".
- "Browse Crowdly" mirrors the main page of the Crowdly platform.

The main page (`src/pages/Index.tsx`) shows these sections:
- Favorites
- Stories to live / experience
- Newest Stories, Newest Screenplays
- Most Popular Stories / Screenplays
- Most Active Stories / Screenplays
- Living, Lived

## Proposed layout

```
[ Browse Crowdly | My Library ]   [🔍 Search Crowdly and my library…] [+ Add books]   ⟳ Library synced
```

**Top bar**
- Two tabs only, shown as a segmented control: **Browse Crowdly** first, then **My Library**.
- One search field on the left, next to "+ Add books".
  - From Browse it searches Crowdly.
  - From My Library it filters the current shelf instantly, plus an "Also on Crowdly" results row.
- Sync becomes a small status icon with a tooltip. It is clickable to sync now, replacing the "Sync now" button.

### Browse Crowdly: the platform's main page, as rows of covers

Each section is a horizontal row of **cover cards**, with "See all ›" opening it as a full grid.

**Row order** (the same as the web home page):
1. **Continue reading**: new. Crowdly stories you have started in Discovery, with a progress bar.
2. Favorites
3. Newest stories
4. Newest screenplays
5. Most popular stories
6. Most popular screenplays
7. Most active stories
8. Most active screenplays

Living and Lived also appear as Browse rows, the same as on the web home page.

**Each card shows:**
- the cover, or a generated coloured cover with the title and initials
- the title
- a grey second line: author or latest chapter, plus language. This tells "Story of my life" stories apart.
- "Untitled" in grey italics

**Clicking a card** opens a details panel:
- cover, description, author, chapters, progress
- **Read**, **Add to shelf ▾**, and the ♥ / Living / Lived toggles
- Double-click reads straight away.

The rows reuse the existing endpoints: `/stories/newest`, `/stories/most-active`, `/stories/most-popular`, the `/screenplays/*` equivalents, and the system shelves in `/shelves/:key/items`. One new endpoint, `GET /discover/home`, returns all rows in one call, which keeps Browse fast.

**Screenplays:** they open in the browser for now. A Discovery screenplay reader is a later step.

### My Library: everything that's yours, with shelves in a sidebar

```
┌──────────────────┬──────────────────────────────────────────────┐
│ Continue reading │  [grid | list]  Sort ▾      (shelf name)       │
│ All books        │  ┌────┐ ┌────┐ ┌────┐ ┌────┐                  │
│ Audiobooks       │  │cover│ │cover│ │cover│ │cover│  …            │
│ Crowdly stories  │  └────┘ └────┘ └────┘ └────┘                  │
│ ─ Crowdly ─      │  title / author / 42% ▓▓▓░░                     │
│ ♥ Favorites      │                                               │
│ Living / Lived   │                                               │
│ ─ My shelves ─   │                                               │
│ Summer reads     │                                               │
│ ⚙ Unread EPUB    │                                               │
│ + New shelf      │                                               │
└──────────────────┴──────────────────────────────────────────────┘
```

**Sidebar**
- **Built-in views** come first: Continue reading, All books (imported), Audiobooks, Crowdly stories (stories read in Discovery).
- Then the **Crowdly** shelves: Favorites, Living, Lived.
- Then **My shelves**, with manual shelves and ⚙ smart shelves.
- "+ New shelf" and "+ New smart shelf" sit at the bottom.
- This replaces both the old Shelves tab and "Reading on Crowdly".

**Content area**
- A **grid / list toggle**, remembered per user.
- Cover cards with a progress bar.
- Sort and filters (format, language, progress).

**Drag and drop**
- Drop files onto My Library to import them.
- Drag a card onto a shelf in the sidebar to add it.
- Within a manual shelf, drag to reorder.

**Context menu** (unchanged actions): Open, Add to shelf, Book rights…, Convert to Crowdly story, Remove.

**Empty states** explain the next step. For example, the empty library shows a big drop zone: "Drop EPUB, PDF or audio files here".

### Other improvements

1. **Covers for imported books.**
   - EPUB: the cover image, via ebooklib.
   - PDF: page 1 rendered with QtPdf.
   - Audio: the embedded artwork, if any.
   - Each cover is cached as a thumbnail next to the file.
   - Synced books carry their cover to the other devices: the existing `cover_key` column is already in `library_items`.
2. **Reader polish.**
   - "← Back" returns to where you came from: Browse or the shelf.
   - Typography settings: font size, serif or sans, and light/sepia/dark themes, remembered per user.
3. **Keyboard.**
   - Ctrl/Cmd+F focuses the search.
   - Enter opens the selected card; Space shows its details.
   - Ctrl/Cmd+1 and Ctrl/Cmd+2 switch between Browse and My Library.
4. **Session restore.** It remembers the tab, the selected shelf, the scroll position and the grid/list choice.

This plan covers the desktop app only. The web `/shelves` page stays as it is.

## Technical shape (implementation)

**New widgets** (Qt, in `ui/discovery/`):
- `cover_card.py`: a card with a cover, title, second line and progress bar, plus a generated placeholder cover.
- `card_row.py`: a horizontal scrolling row with "See all".
- `card_grid.py`: a `QListView` in IconMode with a model and a cover delegate, so large libraries stay fast.
- `details_panel.py`

**Rebuilt / reused**
- `browse_page.py` and `library_page.py` (the latter absorbs `shelves_page.py`'s logic) replace the three old pages.
- `discovery_view.py` keeps the gate, the reader, sync and the "Add to shelf" menu.

**Cover pipeline**: `library/covers.py`, with extraction, a thumbnail cache and download of remote cover URLs.

**Backend**
- `GET /discover/home`, which aggregates the rows.
- Optional: a cover upload for imported books (`PUT /library/items/:id/cover`, private, owner-only).

**Translations**: every new string goes into all 12 desktop `.ts` files.

## Decisions (taken 2026-10-03, the user said "go ahead" without picking, so the recommended options apply)

1. **Browse rows:** "Continue reading" first, then the main page's sections in its order.
2. **Click:** a single click shows details, a double-click reads.
3. **My Library:** grid by default, list as an option.
4. **Covers for imported books, with sync:** now.
5. **Reader typography settings:** now.

## Verification

- Run `pytest` with new tests for the card model and grid, the placeholder covers, EPUB/PDF cover extraction and the library sidebar views.
- Run the app against the local backend:
  - check the Browse rows, See all, the details panel and Add to shelf
  - drag a file in, and drag a card onto a shelf
  - check the grid/list toggle and search in both tabs
  - check the Russian UI
