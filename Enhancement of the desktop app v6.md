# Enhancement of the desktop app v6: "Change this story" for imported books too

## Context

The user still couldn't see "I want to change this story" in Discovery. The book they had open, "Book I Episode IV - New horizons", is an **imported EPUB** (added from the computer, rights "Not specified", not synced). It is not a Crowdly story, and v4/v5 only offer "✎ Change this story" for Crowdly stories. So the button, the right-click entry and Ctrl+E were all hidden on purpose.

**Decision (from the Q&A):** always offer it for readable imported books too.
1. If the book's rights aren't set, ask once.
2. **My own work, public domain, or Creative Commons that allows changes:** open it in Creation as a story. The existing "Convert to Crowdly story" path is used, so with web sync on it becomes a Crowdly story.
3. **Someone else's book (my personal copy):** open a **private, local-only editable copy**. It is never synced, uploaded or published, which keeps the copyright rules of v2.

Audiobooks are excluded; there is no text to edit.

## Changes

**1. Discovery** (`ui/discovery/discovery_view.py`, `reader_widget.py`)
- `open_item()` for an imported EPUB, PDF or text book calls `set_change_enabled(True)` and remembers `_reader_book = item.id` (audio stays disabled). The toolbar button, the right-click entry and Ctrl+E then all work.
- New signal `changeBookRequested(item_id)`. `_change_open_story()` emits it for books and `changeStoryRequested` for Crowdly stories.
- The details panel and the card right-click menu also get "✎ Change this story" for readable imported books.

**2. Main window** (`ui/main_window.py`): new `_change_book_from_discovery(item_id)`
1. If `rights_status` is `unknown`, ask with a small dialog: "Who wrote this book?"
   - My own work
   - Public domain
   - Creative Commons licence that allows changes
   - Someone else's book (my personal copy)

   The answer is saved with the existing `LocalLibrary.set_rights`, so it syncs like any rights change.
2. Own work, public domain or CC: reuse `_convert_library_item_to_story(item_id)`. It already imports the book to Markdown, saves it into the project Space, switches to Creation and records the conversion.
3. Personal copy: new `_open_private_copy(item)`.
   - `importing_controller.import_to_markdown(file)`, the same importer as "Import from file".
   - Saved **outside the project Space**, in `~/.config/crowdly_editor/library/private-edits/<title>.md`, so neither Space sync, Google Drive, GitHub nor web sync ever sees it.
   - Marked `edit_mode = "private"` in the sidecar, using a helper next to the suggestion helpers in `suggestions.py`.
   - Then: switch to Creation and open it.
   - The yellow bar is reused with the text "Private copy of '…' - only on this computer, never synced or published", and no send button.
4. `_maybe_sync_story_to_web` returns early for `edit_mode == "private"`, just as it does for suggestion copies. This also stops the automatic "create a Crowdly story for a new local file" step.

**3. Translations:** every new string goes into all 12 `.ts` files, and the 8 `.qm` files are recompiled.

**4. Tests**
- The reader offers "Change this story" for an imported EPUB, and not for an audiobook.
- A private copy is marked private, is saved outside the project Space, shows the bar, and is never synced.
- Choosing own work runs the convert path.

**5. Rebuild** `dist/app/Crowdly.app` so the user can install it.

## Verification
- Run `pytest`.
- Run the app from source and open the imported EPUB "Book I Episode IV - New horizons":
  - the purple "✎ Change this story" shows, and is also in the right-click menu and on Ctrl+E
  - choosing "My own work" opens it in Creation (a project Space is needed)
  - choosing "Someone else's book" opens the private copy with the bar
- Open a Crowdly story: the v4 flow is unchanged.
