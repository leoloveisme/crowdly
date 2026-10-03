# Enhancement of the desktop app v5: "Change this story" in the reader's right-click menu

## Context

The user wants "I want to change this story" in the **right-click context menu** of the reader. They also couldn't find the button.

**Why the button wasn't visible.** The running app is the installed `/Applications/Crowdly.app`, started at 12:20, which is before v4 was implemented. In the current code the reader shows "✎ Change this story" next to "Shelves" (checked headlessly). So the user needs to rebuild the app, or run it from source.

**Bug found while checking.** `ui/discovery/tasks.py` raises `RuntimeError: Signal source has been deleted` when a widget closes while its background task is still running. The emit needs guarding.

## Changes

**1. Reader right-click menu** (`ui/discovery/reader_widget.py`)
- Give the reader's `QTextBrowser` a custom context menu. It keeps the standard actions (Copy, Select All), from `createStandardContextMenu()`, and adds:
  - **Highlight** with its colour submenu, and **Add note**, enabled when text is selected
  - **✎ Change this story**, only for Crowdly stories (the same visibility as the toolbar button), which emits `changeRequested`
- For PDFs (`QPdfView`), add the same menu with "Change this story" when it applies. Imported PDFs aren't Crowdly stories, so in practice it only shows for text.

**2. Make the toolbar button easier to see**
- Move "✎ Change this story" to the right end of the reader toolbar and style it as a coloured primary button (the same purple as the Discovery tab).
- Add the shortcut **Ctrl/Cmd+E** while a Crowdly story is open in the reader.

**3. Robustness** (`ui/discovery/tasks.py`)
- Ignore `RuntimeError` when emitting results to a receiver that has already been deleted.

**4. Translations**
- New strings ("Copy" and "Select All" come from Qt itself) go into all 12 `.ts` files, and the `.qm` files are recompiled.

**5. Tests** (`tests/test_change_story.py`)
- The reader's context menu contains "Change this story" for a Crowdly story, and doesn't for an imported book.
- Triggering it emits `changeRequested`.

## Verification
- Run `pytest`.
- Run the app from source (`python -m editor`) against the local backend:
  - open a Crowdly story, right-click the text, choose "✎ Change this story", and the dialog or editor opens
  - Ctrl/Cmd+E does the same
- Rebuild the macOS app with `./build-downloads.sh` so the installed copy matches.
