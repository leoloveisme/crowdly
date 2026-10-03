# Enhancement of the desktop app v2.0

## Context

The desktop app (`apps/desktop/`, PySide6) is only an editor today, which we now call **Creation mode**. We want a second mode, **Discovery**, for reading and listening. It brings in the ideas from `BookOrbit potential benefits for Crowdly.md`: reading position, reading sessions, highlights and notes, recommendations without paid AI, and TTS.

There is **one app** (one codebase, one set of features) with two modes:

- **Crowdly Discovery** (Discovery mode)
- **Crowdly Creation** (Creation mode)

The user can switch between them at any time.

Out of the box, the app starts in the mode of the version that was downloaded:

- Downloading Crowdly Discovery starts it in Discovery mode.
- Downloading Crowdly Creation starts it in Creation mode.

On desktop this works through **two download buttons** on the website. Both downloads are the same app and differ only in their name, icon and bundled first-start mode. The stores work the same way.

Startup choices are two independent settings in the menu:

- **Start in:** Discovery or Creation. The default is the version that was downloaded.
- **On launch:** "Start where I left off" or "Start with default settings".

"Start where I left off" restores the last state exactly and overrides "Start in". That state is every window with its size and position, every tab with its cursor(s) and scroll, the MD/WYSIWYG toggles, and each window's mode and current book page.

### Decisions so far (from the Q&A)

- **Discovery content.** Discovery shows Crowdly stories plus a local library of books the user imports (EPUB, PDF, audio). When sync is on, imported books go to the user's Crowdly account.
- **Visibility of imported books.** An imported book is private by default. If the user declares they are the author or rights holder, they may convert it into a normal Crowdly story.
- **What sync uploads.** Sync uploads the full file, not only metadata. This needs the legal safeguards in the "Copyright & legal" section below.
- **Login.** We are in invite-only alpha, so Discovery requires login. One flag, `DISCOVERY_REQUIRES_LOGIN`, opens public browsing at public launch.

### What exists today (findings)

**Session control**
- The closest thing to the two startup modes is Settings → **Session control** (`main_window.py:463`, dialog `_show_session_control_dialog` ~6658).
- Its two options are `close_all` = "Start with default settings" and `keep_session` = "Start where I left off".
- It saves only the tab paths, titles and active tab of the window that closed last (`closeEvent` ~2350). It does not save cursor, scroll, geometry, extra windows or toggles.
- It restores in `app.py:132-160`.

**Settings, menu and windows**
- Settings are a JSON dataclass in `src/editor/settings.py` (`~/.config/crowdly_editor/settings.json`). Secrets are kept in the keychain (`crowdly_session.py`).
- The menu is a single burger `QToolButton` built in `_setup_central_widgets` (`main_window.py:271-510`). `_retranslate_ui()` is at ~2503.
- New windows come from `_new_window` (~3450). They share one `Settings` object and are tracked in `app._extra_windows`.

**Existing code to reuse**
- Importers: `importing/epub_importer.py` and `importing/pdf_importer.py`.
- Backend client: `crowdly_client.py` (`CrowdlyClient`, `_http_get_json` / `_http_post_json`).
- Web sync: `websync.py` (`_build_api_base`).
- Login: `ui/crowdly_login_dialog.py` and `_ensure_crowdly_web_credentials`.

**Packaging**
- The build specs are `crowdly-editor-mac.spec` (`Crowdly.app`, `cloud.crowdly.editor`) and `crowdly-editor.spec` (Linux).
- There is no variant mechanism yet. Phase 1 adds a build flag for the two desktop downloads.

**Discovery and i18n**
- No discovery, browse or recommendation code exists in the desktop app.
- There are 12 `.ts` files in `src/editor/i18n/`: ar, de, en, es, fr, hi, ja, kr, pt, ru, zh-Hans, zh-Hant. All of them must be updated, which is more than the 8 that CLAUDE.md lists.

---

## Phase 0 — Fix: the WYSIWYG editor damages Markdown files on save (bug found while reviewing this plan)

**What happened.** Editing this plan in the Crowdly desktop editor changed one sentence, but the save rewrote the whole file:
- Lines were re-wrapped at 80 columns.
- Most bullet lists were folded into paragraphs with escaped `\-` characters.
- Code spans and **bold** text were split across lines, so they no longer render.
- The fenced code block was lost.
- Nested lists were flattened.
- `&`, `<` and `+` were escaped.

**Cause** (the round trip in `ui/preview_widget.py`):
1. **Loading**, in `set_markdown` (~214): `markdown.markdown(..., extensions=["extra", "sane_lists"])`. Python-Markdown is not CommonMark:
   - A list needs a blank line before it, so `**Heading**\n- item` becomes one paragraph.
   - Nested items need a 4-space indent, so 2- or 3-space nesting is flattened.
   - A fenced block inside a list item is not recognised.
2. **Saving**, in `get_markdown` (~309): `QTextEdit.toMarkdown()`. Qt's Markdown writer:
   - hard-wraps at 80 columns, which breaks `` ` `` and `**` spans at the wrap point
   - escapes `-`, `+` and `&` wherever they could be misread
3. `_on_text_changed` (~932) emits the **whole regenerated document** on every keystroke, and `_on_preview_markdown_changed` (`main_window.py:1384`) treats it as the new source. So one edit rewrites every line.

**Fix**
1. **Parse like the writer.** Load Markdown with `QTextDocument.setMarkdown(text, MarkdownDialectGitHub)`, which is CommonMark/GFM (md4c), instead of Python-Markdown + `setHtml`.
   - Keep Python-Markdown only as a fallback for documents that contain raw HTML such as `<img>`, which `setMarkdown` drops.
   - Keep the existing comment extract and reinject.
2. **Change only what the user edited.** Map the source to blocks (top-level paragraphs, lists, headings, code blocks, tables) when loading.
   - On a WYSIWYG edit, re-serialise **only the changed blocks**, and splice them into the original source text.
   - Untouched blocks stay byte-for-byte identical.
   - This lives in a new `markdown_roundtrip.py` (`split_blocks`, `splice_changed_blocks`).
3. **Serialise without damage.** For changed blocks, use a small serializer of our own that walks the `QTextDocument`: no wrapping, minimal escaping, and nesting and code fences preserved. Do not use `toMarkdown()`.
4. **Safety net.** On load, check the round trip: load, then serialise the unedited text, and compare.
   - If the result would differ, show a quiet status-bar note: "Some formatting can only be edited in MD mode".
   - Never write the file until the user actually edits in WYSIWYG.
5. **Regression tests** in `apps/desktop/tests/test_markdown_roundtrip.py`. These are the desktop app's first tests: create `tests/` and add `pytest` as a dev extra in `pyproject.toml`. The tests use the `offscreen` Qt platform. The fixtures are this plan file, `BookOrbit potential benefits for Crowdly.md` (tables), and a nested-list / code-fence / bold-link sample.
   - Assert that load followed by an unchanged save is byte-identical.
   - Assert that a one-word WYSIWYG edit changes only that line.

`.story` and `.screenplay` documents go through their own DSL path (`build_story_dsl` / `build_screenplay_dsl`) and are out of scope. Only the plain-Markdown path changes.

## Phase 1 — Mode switch, startup menu

1. **`src/editor/app_modes.py`** (new)
   - Constants `MODE_DISCOVERY = "discovery"` and `MODE_CREATION = "creation"`.
   - Display names "Crowdly Discovery" and "Crowdly Creation", wrapped in `tr()`.

2. **`settings.py`**
   - Add `startup_mode: str | None = None`, validated in `load_settings()`.
   - On the **first start** (key unset), set it from the *first-start mode* and save it.
   - From then on, only the user changes it.
   - Keep `session_control` as the on-launch key (`keep_session` / `close_all`), so existing users keep their choice.
   - Add `session_state` (see Phase 2).

3. **First-start mode** (the hook for the future store listings)
   - `app_modes.first_start_mode()` reads an optional bundled `first_start_mode.txt` (`discovery` or `creation`).
   - It falls back to `"creation"`, for example in dev runs.
   - Every download ships the same app code and differs only in this one file or flag:
     - "Crowdly Discovery" → `discovery`
     - "Crowdly Creation" → `creation`
   - It only decides the mode at the first start. It never overrides a later user choice.

4. **Desktop packaging: two downloads of one app**
   - `crowdly-editor-mac.spec` and `crowdly-editor.spec` read `CROWDLY_FIRST_START_MODE` (`discovery` | `creation`).
   - The spec bundles `first_start_mode.txt` and sets:
     - the bundle name: `Crowdly Discovery.app` / `Crowdly Creation.app`
     - the icon
     - the bundle id: `cloud.crowdly.discovery` / `cloud.crowdly.creation`, so both can be installed side by side
   - On Linux, the `.desktop` file gets the matching name.
   - A build script produces both installers, and the website gets the two download buttons.
   - Both installs share `~/.config/crowdly_editor/settings.json`.
     - `startup_mode` is written once, by whichever version is started first.
     - If the user later also installs the other version, it follows the setting that already exists. One app, one preference.

5. **Menu, Settings → Startup** (replaces the "Session control" item; the dialog is removed)
   - "Start in" submenu: Discovery / Creation, an exclusive `QActionGroup`.
   - "On launch" submenu: "Start where I left off" / "Start with default settings", an exclusive `QActionGroup`.
   - New top-level burger entry: "Switch to Discovery" / "Switch to Creation", which acts on this window only. A matching segmented toggle goes on the top bar.

6. **`MainWindow` mode switch**
   - Wrap the existing central widget in a `QStackedWidget`: page 0 is Creation (the current editor), page 1 is `ui/discovery/DiscoveryView`.
   - Add `set_mode(mode)`, which also shows or hides menu groups that only make sense in Creation, such as Export, Save as and Insert.
   - Mode is per window.

7. **Mandatory checklist (CLAUDE.md)**
   - Add every new action to `_retranslate_ui()`.
   - Add `<message>` entries with real translations to **all 12** `.ts` files, then recompile the `.qm` files.

8. **Window title.** Show the current mode, for example "Crowdly Discovery — …" or "Crowdly Creation — …", so the user always knows which mode a window is in.

### Future: Google Play and Apple App Store listings (not part of this work)

Both stores will list two apps, "Crowdly Discovery" and "Crowdly Creation". They are the same code; only the mode at the first start differs.

**What each store requires**
- **Google Play** needs a separate `applicationId` per listing, for example `cloud.crowdly.discovery` and `cloud.crowdly.creation`. That means two Android *product flavors*.
- **Apple App Store and Mac App Store** need a separate bundle identifier per listing. That means two Xcode targets or schemes for iOS, and two macOS bundles from the same spec with a flag.

**How the two listings differ**
- Each variant differs only in its id, name, icon, store text and its first-start mode value.
- The installed apps behave the same, and both modes can be switched at any time.

**Apple review risk**
- Apple's guideline 4.3 ("spam") can reject apps that are near-duplicates.
- Mitigations:
  - Give each listing clearly distinct screenshots and descriptions focused on its own mode.
  - Explain in the review notes that they are two entry points into one platform.
  - If Apple still objects, fall back to one App Store listing that asks for the mode at the first start.

**Sharing data between the two apps**
- If a user installs both, settings and login are not shared between them automatically.
- Sync through the Crowdly account keeps their library and reading data the same in both.
- Sharing local data as well would need an App Group on iOS or a shared user ID on Android. This is optional and can be decided later.

## Phase 2 — "Start where I left off", done fully

1. **New `src/editor/session_store.py`**
   - Schema-versioned `session_state`:
     ```
     {version: 2, windows: [{geometry_b64, window_state_b64, mode,
       markdown_html: bool, wysiwyg: bool, active_tab,
       tabs: [{path | crowdly_story_id | library_item_id, title,
               cursors: [{anchor, position}], v_scroll, h_scroll}],
       discovery: {view, item_id, locator}}]}
     ```
   - `capture_window(win)` and `restore_window(win, state)`.
   - Multiple cursors come from the editor's `QTextCursor` / extra selections, if any are present.

2. **Saving**
   - Capture all windows at once in `QApplication.aboutToQuit` and in Quit.
   - When a window that is *not* the last one closes, it is dropped from the snapshot.
   - This fixes today's bug where the window that closes last overwrites the others.
   - With `close_all`, keep today's behaviour: clear the state and `project_space`.

3. **Restoring (`app.py`)**
   - Create one `MainWindow` per saved window, restore geometry with `restoreGeometry`, then open the tabs.
   - Apply the cursor and scroll *after* the document has loaded, using `QTimer.singleShot(0, …)`.
   - Clamp positions to the document length, because the file may have changed.
   - Skip missing files with a status-bar note.

4. **Migration.** On first run, convert the old `session_open_tabs` / `session_active_tab` / `session_tab_titles` into a single-window v2 state.

5. **Precedence.** CLI or macOS FileOpen paths win over the restored session. A restored session wins over "Start in".

## Phase 3 — Discovery MVP (desktop) + backend library

**Backend**

1. Migration `0018_discovery_library.sql` (idempotent, following the style of `0000_baseline.sql`). Tables:
   - `library_items`:
     - `id`, `user_id`, `kind` (`crowdly_story` | `imported_book`), `story_title_id` (nullable)
     - `title`, `author`, `language`, `format`, `file_sha256`, `file_size`, `storage_key`, `cover_key`
     - `rights_status` (`unknown` | `personal_copy` | `own_work` | `public_domain` | `cc_licensed`), `rights_declared_at`
     - `visibility`, which is always `private` for imported books unless they are converted
     - `created_at`, `deleted_at`
   - `reading_positions`: user and item, percentage plus an exact locator (chapter id / EPUB CFI / PDF page / audio seconds). Text and narration positions are stored separately.
   - `reading_sessions`: a client-generated `session_id` that is unique, so a retry never counts twice. Seconds are capped by the server.
   - `highlights`: versioned, with colour, note and the quoted text; deletes become tombstones.
   - `device_sync_acks`: last version confirmed per device.

2. Routes `/library` (list, import, upload, delete, convert-to-story) and `/reading` (position, session, highlights sync). All of them require auth; there is no public access in alpha.
   - Before writing the routes, check `0007_pending_uploads.sql` and its handlers, and reuse that upload mechanism.
   - Add each route to an authorisation test: the BookOrbit "route matrix" idea, item 1 in the suggested order of that doc.

**Desktop: `ui/discovery/`**

3. **Library view**: a grid or list of three sources: My library (imported), Crowdly stories I'm reading, and Browse Crowdly (search plus newest and favourites, using existing story routes).

4. **Import**
   - "Add books…" for EPUB, PDF and audio files.
   - Metadata comes from the existing `epub_importer.py` and `pdf_importer.py`.
   - Imported files are stored locally under `<config>/library/`.
   - **Refuse DRM-protected files**: detect `META-INF/encryption.xml` / `rights.xml` in an EPUB, and encrypted PDFs.

5. **Reader**
   - EPUB and text in a `QTextBrowser`, PDF via `QPdfView`, audio via `QMediaPlayer`.
   - Supports highlight and note, and records position and active time: it pauses when the window is inactive, ends a session after 5 minutes idle and drops sessions under 10 seconds.

6. **Sync**
   - Sync runs only when "Synchronisation with web platform" is on.
   - Upload the file once, deduplicated per user by sha256, then sync positions, sessions and highlights using version + ack.
   - On first enable, show a one-time **rights confirmation** dialog (see Legal).

7. **Convert to Crowdly story.** This is offered only when `rights_status ∈ {own_work, public_domain, cc_licensed}`. It reuses the existing import-to-story path (`/stories/template` + `sync_desktop_story`).

## Phase 4 — BookOrbit intelligence (follow-ups, each its own task)

These are listed in the order the BookOrbit doc suggests:

1. Reading stats: a time heatmap, streaks, and per-chapter completion for creators.
2. Automatic living / lived status: set from progress, with a manual choice always winning, and rereads kept as separate attempts.
3. Block-aligned TTS / read-along.
4. Text re-anchoring for highlights.
5. "Similar stories" using a feature-hash fingerprint with no AI model.
6. Smart shelves.
7. What's New panel.

---

## Copyright & legal: brainstorm and stance (needs a lawyer's review before public launch; this is not legal advice)

**Imported books by other authors (private library)**
- A user storing a copy they own for their own reading is a "personal locker". That is the lowest-risk case.
- Crowdly acts as a **host**. It keeps liability protection only if all of these are in place:
  - a notice-and-takedown process
  - a repeat-infringer policy
  - Terms in which the user warrants they have the right to upload
  - **in the US**: a DMCA §512 designated agent registered with the Copyright Office
  - **in the EU**: the DSA hosting rules (notice-and-action, a statement of reasons when content is removed)
- The risk grows sharply once files become reachable by others. Rules:
  - There are no share links for imported files.
  - Deduplication works **per user only**. Never serve one user's upload to another user, even when the hash matches, because that would be distribution.
  - Never index imported books in public search.
- **DRM.** Removing DRM is illegal on its own (US DMCA §1201, EU InfoSoc Art. 6), so DRM-protected files are refused at import.
- **Full-file upload risks** (the option chosen):
  - Crowdly stores copyrighted works on its own servers.
  - Rights holders can send takedowns.
  - Storage cost needs quotas, for example a per-user cap in alpha.
  - Files must be deleted when the account is deleted.
  - Reading data such as positions, sessions and highlights counts as personal data under the GDPR. It needs a privacy-policy section, plus export and deletion.

**Someone's work uploaded and then changed by others (co-creation)**
- Changing a work creates a **derivative work**. That is legal only if the uploader holds the rights or the work allows it:
  - **Own work**: the author licenses it to Crowdly and its co-creators through the Terms.
  - **Public domain**: free to remix.
  - **CC BY / CC BY-SA**: allowed with attribution, and with the same licence for BY-SA.
  - **CC ND or NC**: no derivatives (ND) or no commercial use (NC).
- Uploading another person's copyrighted book and letting others branch it infringes the author's copyright, and the uploader is the primary infringer. Crowdly could lose its host protection if it knew, or should have known: for example, if it ignores takedowns or actively promotes the work. In the EU, Art. 17 of the DSM Directive can make large platforms that give the public access to uploads directly liable. That is a risk once Crowdly is public.
- **Proposed stance:**
  1. Imported books stay private and cannot be converted unless the user declares a rights status of own work, public domain or CC (without ND).
  2. Store that declaration with a timestamp.
  3. The licence chosen at conversion is shown on the story and passes to every branch and contributor.
  4. The Terms state that contributors license their changes to the original author and to the platform.
  5. A "Report copyright" action on every public story feeds an admin takedown queue that logs every action.

---

## Critical files

**Desktop**
- `apps/desktop/src/editor/app.py`
- `apps/desktop/src/editor/settings.py`
- `apps/desktop/src/editor/ui/main_window.py`, which covers the menu, `_retranslate_ui`, `closeEvent`, `_new_window` and the session dialog
- `apps/desktop/src/editor/ui/preview_widget.py` (Phase 0)
- new: `markdown_roundtrip.py`, `tests/test_markdown_roundtrip.py` (Phase 0)
- `apps/desktop/crowdly-editor-mac.spec`, `crowdly-editor.spec`, `crowdly-app.desktop`, plus a build script for both downloads
- new: `app_modes.py`, `session_store.py`, `ui/discovery/*`, `library/*` (local store, DRM check, sync client)
- `apps/desktop/src/editor/crowdly_client.py` and `websync.py`
- `apps/desktop/src/editor/i18n/*.ts` (all 12)

**Backend**
- `backend/migrations/0018_discovery_library.sql`
- `backend/src/server.js` (or a new routes module)

## Verification

**Phase 0**
- Run `pytest apps/desktop/tests/test_markdown_roundtrip.py`.
- Manual check: open `Enhancement of the desktop app v2.0.md` in WYSIWYG, change one word and save. `git diff` should show exactly one changed line.

**Phase 1–2**
- On a fresh config, `python -m editor` should start in Creation (no `first_start_mode.txt`, for example in a dev run).
- Build both downloads. Each opens in its own mode on a fresh config, and both can be installed side by side.
- Fresh config with a `first_start_mode.txt` that says `discovery`: it should start in Discovery.
- Then change Start in → Creation and relaunch. The user's choice wins over the file.
- Set Start in → Discovery and relaunch. It should start in Discovery.
- Switch modes via the menu and the top bar.
- Change the interface language and check that every new item is retranslated.

**Session test**
- Open 2 windows with different sizes and positions.
- Put several tabs in each, with the cursor mid-document and scrolled, a WYSIWYG toggle on, and one window in Discovery.
- Quit and relaunch. Everything should come back identical.
- Switch to "Start with default settings", relaunch, and expect a clean start.
- Delete one of the files and relaunch. The file should be skipped gracefully.

**Phase 3**
- Run `npm run migrate --prefix backend` locally.
- Import an EPUB, a PDF and an audio file, and check that a DRM-protected EPUB is rejected.
- Enable sync and confirm the rights dialog appears.
- Check that the file uploads once, and that position and highlights appear on a second device or a fresh config.
- A second user must not be able to fetch the first user's file (403).
- Convert-to-story is offered only for own work, public domain or CC.
