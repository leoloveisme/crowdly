# Google Drive OAuth + folder sync — web (per platform Space) and desktop (per local Space)

## Context
Testing "Connect → Google Drive" in the desktop app showed "not configured or already connected". The real causes:
- The desktop app only asks the **backend** for a consent URL, and only for a local Space already linked to a platform Space. `websync.get_drive_auth_url` returns `None` when the Space isn't linked, so the app shows the wrong message.
- `backend/.env` has no `GOOGLE_OAUTH_*` keys.

The backend already has a full Google OAuth + Drive sync (`backend/src/googleDriveApp.js`, `googleDriveSync.js`, routes at `server.js` ~6295–6580), and the web page has a Connect UI (`src/pages/CreativeSpacePage.tsx`). But:
- Sync only covers the connected folder's top level.
- The routes have serious authorization holes:
  - Every route trusts a `userId` sent by the client.
  - The OAuth `state` is an unsigned `spaceId:userId`, so a forged state can overwrite someone else's Google link.
  - Anyone can pass another user's `driveAccountId` to list or connect their folders.

**Decisions (from you):**
- **Web:** connecting happens only from an existing platform Space.
- **Desktop:** a local Space is enough. No Crowdly login is needed. The desktop app runs its own Google OAuth and its own sync.
- **Accounts and folders:** each user connects their own Google account. One Drive folder, **including its subfolders**, maps to each Space. Different Spaces can use different folders.
- **Overlap:** web and desktop may point at the same Drive folder, and Drive is the shared copy. When both sides changed a file, text files get a **diff-based three-way merge** against the last synced base. Only merges that genuinely overlap, or binary files, fall back to a "conflict copy".

**Scope decision (mine):** use the full `drive` scope. Picking an existing folder and its subfolders needs it. Run in Google "Testing" mode (up to 100 test users) for now. A public launch will need Google's restricted-scope verification; that is a note, not part of this work.

## Phase 0 — Backend security fixes (before anything else)
All in `backend/src/server.js` Drive routes and `googleDriveApp.js`:
- **Real session auth.** Switch every `/creative-spaces/:id/drive-sync/*` route to the existing `requireAuth` middleware and use `req.user.id`, not the `userId` in the body or query. Keep the ownership check against `space.user_id`. Update the web calls in `CreativeSpacePage.tsx` to match (send credentials, drop `userId`).
- **Signed OAuth state.** `state = base64url(JSON{spaceId, userId, nonce, exp}) + "." + HMAC-SHA256`. The HMAC key comes from `GOOGLE_TOKEN_ENCRYPTION_KEY`, reusing the key already in `googleDriveApp.js`. `exp` is 10 minutes after the link is created. The callback verifies the signature and expiry, and re-checks that the space belongs to that userId. Add `signState`/`verifyState` to `googleDriveApp.js`.
- **Account ownership checks.** In `folders` and `connect`, require that `google_drive_accounts.user_id = req.user.id` for the given `driveAccountId`. Stop returning `driveAccountId` in status responses to non-owners.
- **Callback errors.** On failure, redirect with `?drive=error` and show a toast on the page.
- **Webhook token.** Set `token` on `changes/watch` (an HMAC of the channel id) and verify `X-Goog-Channel-Token` in `/api/google-drive/webhook`.

## Phase 1 — Web / backend: subfolders, better picker, merge
**Schema:** add a new migration, `backend/migrations/0010_google_drive_tree_sync.sql`. It must be idempotent and must not add any `ensure*()` DDL.
- `creative_space_items.google_drive_base_content bytea NULL`: the last synced content for text files, used as the merge base. Stored only for files of 2 MB or less.
- `creative_space_items.google_drive_parent_id text NULL`: tracks moves.
- `creative_spaces.google_drive_folder_ids jsonb`: a cached map of Drive folder id to relative path, used by the webhook.

**`googleDriveApp.js`:**
- Add `listFolderTree({token, rootId})`, a paged breadth-first walk that returns folders and files with their relative paths.
- Add `listChildFolders({token, parentId})` for the picker, plus `createFolder`.
- Page through all results in `listChangesSince` (it currently reads only the first page).

**`googleDriveSync.js`:**
- **Pull.** Walk the tree and match items by `relative_path`, not name. Remove the `NOT LIKE '%/%'` filters (L143, L228). Create missing folder and file items for new Drive content, reusing `storeItemContent` and the item insert path used by `POST /creative-spaces/:id/sync`. Treat trashed Drive files as a soft delete (`deleted=true`).
- **Push.** Find or create the Drive subfolders along `relative_path`, caching folder ids in the `google_drive_folder_ids` map.
- **Merge.** Before the existing check "Drive md5 ≠ stored md5 → skip the push":
  - For text files, three-way merge (base = `google_drive_base_content`, ours = Crowdly, theirs = Drive) using the npm package **`node-diff3`**.
  - A clean merge writes the result to both sides.
  - Overlapping changes, or a binary file, keep Crowdly's copy and upload Drive's version next to it as `name (conflict from Drive YYYY-MM-DD).ext`. This is logged to `google_drive_sync_log`.
  - Pull applies the same logic.
- **Webhook.** Map changes to a space through *any* ancestor folder using the cached map. Refresh the map on every full pull.

**`CreativeSpacePage.tsx`** (every new string wrapped in `EditableText`, with ids prefixed `creative-space-drive-...`, and entries added to `backend/scripts/data/interface-translations.seed.json` for en/ru/de):
- A folder picker you can browse level by level (breadcrumbs plus a child-folder list), with a "Create new folder here" option. It replaces the flat dropdown.
- "Use existing Google connection" when the user already has a `google_drive_accounts` row, mirroring GitHub's option at ~L1118.
- A "Sync now" button that calls `drive-sync/run`, plus display of `lastSyncedAt` and the recent sync log.

## Phase 2 — Desktop: native OAuth + local sync engine (no Crowdly login)
**Google client:** a second OAuth client in the same Google Cloud project, of type **Desktop app**. Its id and secret are read from `apps/desktop/src/editor/google_oauth_client.json`, which is gitignored and bundled via the spec's `datas`. `CROWDLY_GOOGLE_CLIENT_ID` / `_SECRET` environment variables override it. Google treats desktop client secrets as non-confidential, which is fine.

**New module `src/editor/gdrive/`** (standard library + PySide6, following `websync.py`'s `urllib` style):
- `oauth.py`: sign-in via a loopback redirect with PKCE.
  1. Start `http.server` on `127.0.0.1:<random port>`.
  2. Open the consent URL with `webbrowser.open` (scope `drive` plus `openid email`).
  3. Receive the `code`, check `state`, exchange the code for tokens, and show a "You can close this tab" page.
  4. The wait runs in a `QThread`.
- `tokens.py`: stores the refresh token in the **macOS Keychain via `keyring`**, a new dependency added to `pyproject.toml`. There is one Google account per desktop user. Access tokens stay in memory only. Sign-out deletes the Keychain entry.
- `api.py`: the Drive REST calls, mirroring `googleDriveApp.js`: list children, walk the tree, download, upload (multipart create / media update), create folder, `changes.getStartPageToken` / `changes.list`.
- `merge.py`: line-based three-way merge using `merge3`, a new pure-Python dependency. On overlap it returns None.
- `engine.py`: per-local-Space two-way sync between the local folder tree and the Drive folder tree.
  - **Index.** The per-file index (relative path → Drive file id, md5, local mtime and hash) lives in `~/.config/crowdly_editor/gdrive/<sha1(root)>/index.json`. Base copies of text files (2 MB or less) go in `…/base/`.
  - **Rules.** A change on one side only is copied to the other. Changes on both sides of a text file are merged. An overlapping merge, or a binary file, becomes a conflict copy. A delete on one side with no edit on the other is propagated; a delete against an edit keeps the edited copy.
  - **Ignored files.** Skip `.DS_Store`, and skip `.crowdly/` or other hidden internal folders if present.
- **Settings** (`src/editor/settings.py`): a new field `gdrive_sync: dict[str, dict]` keyed by the resolved local root, holding `{folder_id, folder_name, enabled, start_page_token}`. It gets its own parsing in `load_settings` because the existing `space_sync_state` only allows string values.

**UI (`src/editor/ui/main_window.py`):**
- `_connect_to_google_drive` (~L4072) is rewritten:
  1. Require an active local Space.
  2. If there's no token, run the OAuth flow.
  3. Open the new **`GoogleDriveFolderDialog`** (`src/editor/ui/gdrive_folder_dialog.py`, modelled on `OpenStoryDialog`). It lets you browse folder by folder with breadcrumbs, plus "Create new folder…" (defaulting to the Space's folder name).
  4. Save the mapping, enable sync and run a first sync.
- The Crowdly-login requirement and the `websync.get_drive_auth_url` path are removed from the desktop app. The `websync.get_drive_*` / `set_drive_sync_enabled` helpers are deleted, since nothing will call them.
- `_toggle_sync_google_drive` (~L4307) now toggles `gdrive_sync[root].enabled` locally. Turning it on with no mapping starts the Connect flow.
- A new menu item, **"Disconnect Google Drive"**, under Settings → Connect. It removes this Space's mapping and asks whether to also sign the Google account out.
- **Timing.**
  - A `QTimer` runs a sync every 60 seconds while the app is open, on a `QThread` worker with an in-progress guard (same pattern as `_StoryPullThread`).
  - A debounced sync also runs about 3 seconds after each local save.
  - Sync runs for the active Space, plus a sweep of all `settings.spaces` that have sync enabled.
- **Status bar.** Add "Drive: synced HH:MM / syncing… / error" beside `_sync_status_label`. Conflicts appear in `statusBar().showMessage` and in a small "Drive sync log" dialog.
- **Mandatory checklist (CLAUDE.md).** Add `setText` calls for the new and changed actions in `_retranslate_ui` (~L2587–2603). Add the new strings (dialog, messages, "Disconnect Google Drive") to **all** `.ts` files in `src/editor/i18n/` with proper translations, then run `pyside6-lrelease`.
- **Packaging** (`crowdly-editor-mac.spec` and `crowdly-editor.spec`):
  - `hiddenimports += collect_submodules("keyring")`, and `copy_metadata("keyring")` in `datas`.
  - Bundle `google_oauth_client.json` if it exists.
  - Add `google_oauth_client.json` to `apps/desktop/.gitignore`.

## Setup steps for you (added as `Documentation/Google_Drive_OAuth_setup.md`)
1. In Google Cloud Console, create or choose a project and **enable the Google Drive API**.
2. **OAuth consent screen:**
   - User type External, publishing status **Testing**.
   - App name "Crowdly", with support email and developer contact.
   - Scopes: `.../auth/drive`, `openid`, `email`.
   - **Test users:** add your Google address and those of any testers.
3. **Credentials → Create OAuth client ID → Web application:**
   - Redirect URIs: `http://localhost:4000/api/google-drive/oauth/callback` and `https://<prod backend>/api/google-drive/oauth/callback`.
   - Put the id and secret into `backend/.env` and the VPS `.env` as `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.
4. Generate `GOOGLE_TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`) and set it locally and on the VPS. Also set `BACKEND_BASE_URL` and `FRONTEND_BASE_URL`.
5. **Credentials → Create OAuth client ID → Desktop app.** Save the id and secret into `apps/desktop/src/editor/google_oauth_client.json` (`{"client_id": "...", "client_secret": "..."}`).
6. Push notifications (webhook) need a public HTTPS `BACKEND_BASE_URL`. Locally they're skipped, and the 20-minute poll (plus "Sync now") covers it.
7. Later, for a public launch: submit the app for verification (the restricted `drive` scope needs a security assessment).

## Verification
- **Backend:**
  - Run `npm run migrate --prefix backend` on the local DB.
  - Unit-test `signState`/`verifyState` (tampered or expired → rejected) with a small node script.
  - Use curl to confirm the Drive routes return 401 without a session, and 403 when you pass another user's `driveAccountId`.
- **Web (dev server plus Chrome):**
  1. On an existing Space: Connect → Google consent (test user) → browse the folder tree into a subfolder → Connect → Sync now.
  2. Confirm that nested Drive files appear as items with the right paths.
  3. Edit a text file on the platform and check it on Drive.
  4. Edit different lines on both sides and check the merge.
  5. Edit the same line on both sides and check that a conflict copy is created.
- **Desktop (`python -m editor`, logged out of Crowdly):**
  1. Add a local Space → Connect → Google Drive → browser consent → pick or create a folder.
  2. Confirm that local subfolders and files upload with the same tree.
  3. Edit on Drive and confirm the change arrives locally within 60 seconds.
  4. Repeat the merge and conflict cases.
  5. Restart the app and confirm it's still connected (token in Keychain).
  6. Disconnect and sign out.
- **Overlap:** point a platform Space and the matching local Space at the same folder, edit different paragraphs on each side, and confirm both edits end up everywhere.
- **Translations:** switch the desktop language at runtime and check that the new menu and dialog strings are translated.
- **Build:** rebuild `Crowdly.app` with `pyinstaller --clean crowdly-editor-mac.spec`, then launch it and run Connect (checks that `keyring` is bundled).

## Suggested order and commits
Phase 0 → Phase 1 → Phase 2, each as its own commit on `dev`. Phase 0 is small and fixes live security holes, so it can ship first on its own.
