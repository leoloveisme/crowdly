# Enhancement of the desktop app v7: "All books" count and shelves without sync

## Context

Two problems in Discovery → My Library:

1. **"All books" shows the wrong count.** It counts only imported books, which is 1 on the user's computer. The user expects **every** book and story in My Library: the imported EPUB plus the 2 Crowdly stories read there, so 3.
2. **Shelves require sync.**
   - Today every shelf action goes straight to the account (`backend/src/shelves.js`).
   - Library books can't be shelved until they're uploaded: "Turn on Synchronisation with web platform to put library books on shelves".
   - The user wants to sort books onto shelves **with sync off**, with the changes sent once sync is turned on.

   **Decision:** shelves are **fully local** while sync is off. Creating, renaming and deleting shelves, putting books or stories on them, ordering, and Favorite/Living/Lived are stored on this computer and queued. Turning sync on sends all of it, uploading any books the shelves need first.

## Approach: local-first shelves

My Library keeps a **local mirror of the account's shelves**. The UI always reads and edits the mirror, so it's instant, works offline and needs no login. A sync step reconciles the mirror with the account whenever sync is on.

### 1. "All books" (`ui/discovery/library_page.py`)
- `local:books` becomes every library item: imported books, audiobooks and Crowdly stories read here.
- "Audiobooks" and "Crowdly stories" stay as narrower views.

### 2. Local shelf store: new `library/shelf_store.py` (`LocalShelfStore`, file `library/shelves.json`)

Shelves have:
- `id` (local), `remote_id`, `name`, `kind` (manual or smart), `rules`, `sort`, `position`
- `dirty`, and a `deleted` tombstone flag

Items on a manual shelf are `{entry_id, type, ref, position, remote_entry_id, added_at, removed}`, where:
- `type` is `library_item`, `story` or `screenplay`
- `ref` is the **local** library item id for books, and the story or screenplay id otherwise
- `removed` is a tombstone kept until synced

Status flags hold Favorite/Living/Lived per story, mirrored from the account, plus pending changes made offline.

Operations, all synchronous and saved at once, with the same shape as today's client calls so the UI changes little:
- `list_shelves()`, `shelf_items(key)`, `membership(type, ref)`
- `create_shelf`, `update_shelf`, `delete_shelf`, `reorder_shelves`
- `add_to_shelf`, `remove_from_shelf`, `reorder_shelf_items`
- `set_story_status`

Smart shelves are evaluated locally, over the library's items, positions and dates and the mirrored status flags. The rules are a Python port of `evaluateRules` in `shelves.js`, with the same fields as `smart_shelf_dialog.RULE_FIELDS`. The account's own result list is cached for items that aren't on this computer.

### 3. Shelf sync: new `library/shelf_sync.py` (`sync_shelves(store, client, library)`)
Runs after `sync_library` (so books already have `remote_id`s), whenever sync is on.

**Push, in order:**
1. Deleted shelves: `DELETE` and drop.
2. New shelves: `POST` and set `remote_id`.
3. Changed shelves: `PATCH`.
4. For each manual shelf:
   - add entries without a `remote_entry_id`; books are mapped local id → `remote_id`, and books not uploaded yet wait for the next run
   - remove tombstoned entries
   - `PUT` the order when it changed
5. Pending Favorite/Living/Lived changes: `PUT /me/story-status`.
6. Shelf order: `PUT /shelves/order`.

**Pull:**
- `GET /shelves` and the items of each shelf.
- Non-dirty shelves are replaced by the account's version: new shelves from the web or other devices appear, and shelves deleted elsewhere disappear.
- Account items for library books are mapped `remote_id` → local id. Books only in the account stay as account-only cards; opening one asks to sync.
- Favorite/Living/Lived flags come from the system shelves.

Shelves deleted on the account while edited locally are recreated. That case is rare, and keeping the user's offline work is the safer choice.

### 4. UI changes
- **`library_page.py`**
  - Uses the store instead of `client_factory`: there are no network calls and the "Offline - showing …" state is gone.
  - Shelf creation, rules, renaming, deleting, dragging books onto shelves and reordering all work with sync off.
  - The shelf cache file `shelves-cache.json` is replaced by `shelves.json`, and the old cache is imported once as the starting mirror.
- **`shelves_page.AddToShelfMenu`** reads `store.membership` and writes to the store. Library books are passed by their **local** id, and the "Turn on Synchronisation…" hint is removed.
- **`discovery_view.py`**
  - Passes local ids for books.
  - `sync_now` runs `sync_shelves` after `sync_library`.
  - A debounced 1-second shelf sync after each change when sync is on, so the web sees changes quickly.
  - "Opening a Crowdly story marks it Living" goes through the store too, so it's queued offline.
- **Browse Crowdly**'s Favorites/Living/Lived rows keep coming from `/discover/home` while online. When they can't be fetched (offline or no login), they're shown from the store.

### 5. Translations and tests
- New strings (few) go into all 12 `.ts` files, then the `.qm` files are recompiled.
- Tests:
  - "All books" counts every item.
  - The store: create, add, remove, reorder and status offline, persisted across reloads.
  - Smart shelves evaluated locally.
  - `sync_shelves` against a fake client: pushes a new shelf with an uploaded book, maps ids, replays tombstones and status changes, and pull adds a web-created shelf.
- Plus an end-to-end run against the local backend with a temporary user, deleted afterwards:
  1. Sync off: make shelves and add a book and a story.
  2. Turn sync on and run a sync.
  3. Everything shows up in `GET /shelves`, including the uploaded book.

### 6. Rebuild `dist/app/Crowdly.app`.

## Critical files
- new: `apps/desktop/src/editor/library/shelf_store.py`, `library/shelf_sync.py`
- `ui/discovery/library_page.py`, `ui/discovery/shelves_page.py`, `ui/discovery/discovery_view.py`
- `library/sync.py` (unchanged client methods are reused)
- `tests/test_shelves.py` and new `tests/test_shelf_store.py`
- `i18n/*`
- No backend changes are needed.

## Verification
- Run `pytest`, then the end-to-end script above.
- Run the app from source with sync off:
  - create a shelf and drag the imported EPUB onto it
  - Favorite a story
  - quit and restart: everything is still there
  - turn on sync: the shelf, the book and the favorite appear on the web `/shelves`
- "All books" shows 3 on the user's library.

## Implementation status (2026-10-03)

Done (not yet committed):
- **"All books"** counts every library item; it shows 3 on the user's library.
- **`library/shelf_store.py`** (`LocalShelfStore`, `library/shelves.json`):
  - Holds the local shelves, smart-shelf evaluation, status flags and queued changes.
  - Seeds custom shelves **and** Favorites/Living/Lived from the old `shelves-cache.json`. This happens on first run, and for a `shelves.json` that has never been synced.
  - Notifies listeners on every change; all windows share one store.
- **`library/shelf_sync.py`** pushes local changes, then pulls the account's shelves.
  - Books wait until `sync_library` has uploaded them.
  - Tombstones, item order, shelf order and offline status changes are replayed.
- **UI**:
  - My Library, the Add-to-shelf menu and the reader all use the store, and library books are referenced by local id.
  - Opening a story queues "Living".
  - `sync_now` runs `sync_shelves` after `sync_library`, and a shelf change triggers a sync 1 s later when sync is on.
  - Browse falls back to the stored Favorites/Living/Lived when offline.
- **Translations**: the new "This item can't be put on a shelf." string is in all 12 `.ts` files, and the 8 `.qm` files are recompiled.
- **Tests**: `tests/test_shelves.py` is updated and `tests/test_shelf_store.py` is new; 52 tests pass.
- **End-to-end**: run against the local backend with a temporary user, which was deleted afterwards. Shelves made with sync off reached `GET /shelves` after syncing, including the uploaded EPUB-style book, the story, the smart shelf and the favorite.

Skipped at the user's request: step 6 (rebuild `dist/app/Crowdly.app`).
