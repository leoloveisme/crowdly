# Enhancement of the desktop app v4: from reading to editing ("I want to change this story")

## Implementation status (2026-10-03)

Implemented. Not committed yet.

**Backend**
- Desktop sync is restricted to the owner and invited collaborators; everyone else gets 403, and syncing no longer grants collaborator access.
- New: migration `0021_collaboration_requests.sql` and `backend/src/collaboration.js`.

**Desktop**
- New: `ui/change_story_dialog.py` and `suggestions.py`. "✎ Change this story" appears in the reader, the details panel and the card menu.
- In Creation, a suggestion copy shows a bar with "Send my suggestions".
- A 403 during sync offers to turn the file into a suggestion copy.

**Web**
- The owner sees a "Requests to collaborate" panel on the story page.
- The bell shows the two new notification types.

**Also fixed (found while testing)**
- On macOS, Python has no xattr functions, so every story-metadata read failed. That affected linking, syncing and the story id on the Mac.
- `file_metadata.py` now keeps the attributes in the `.crowdly.json` sidecar there.

**Follow-up**
- Some web screenplay-editing routes (`server.js`, around lines 2815, 2980, 3054 and 3124) still add the editor as a screenplay collaborator. They need the same tightening as desktop sync.
- Reading screenplays in Discovery is not supported yet, so "Change this story" covers stories only.

## Context

Discovery lets you read Crowdly stories, but there is no way to go from reading a story to changing it. The user wants a reader to be able to say "I want to change this story" and land in Creation mode with the story.

Who may change what on Crowdly today:

| Who | Can do |
| --- | --- |
| The **owner**, or an explicitly invited **collaborator** | Edit the text directly |
| **Everyone else** | Suggest changes (proposals the owner approves), branch, make their own copy (if the story's clone policy allows), or translate (if its translation policy allows) |

**Found while exploring (a security bug).** `POST /story-titles/:id/sync-desktop` (`backend/src/server.js:9059`) and `POST /screenplays/:id/sync-desktop` (`server.js:3189`):
- have no session check
- trust `userId` from the request body
- overwrite the chapters of any story
- then add the caller as a collaborator

So any signed-in user who opens a public story in the desktop app and saves it overwrites the owner's text, and gains collaborator rights by doing so. The user chose to fix this as part of this work.

**Decisions (from the Q&A):** for non-owners, offer all four options: **Suggest changes**, **Make my own version**, **Translate** and **Ask to collaborate**. Fix the sync endpoints now.

## The flow

```
Discovery (reader toolbar, details panel, card context menu)
   [✎ I want to change this story]
        │  GET /story-titles/:id/my-access + story row (can_clone) + translations (can_translate)
        ├─ owner / invited collaborator ─► Creation: open the story for direct editing (as today)
        └─ everyone else ─► "How would you like to change it?" dialog
              ├─ Suggest changes      ─► Creation: a suggestion copy + "Send my suggestions"
              ├─ Make my own version  ─► clone ─► Creation: the new story, which they own
              ├─ Translate…           ─► new translation story ─► Creation, which they own
              └─ Ask to collaborate   ─► request sent to the owner (approval in the web app)
```

Options the story's policies don't allow are shown disabled, each with its reason, for example "The author doesn't allow copies of this story". Screenplays can't be read in Discovery yet, so this applies to stories only.

## 1. Backend

**Fix the desktop sync endpoints** (`server.js`, both `sync-desktop` routes)
- Add `requireAuth`, and use `req.user.id` instead of the body `userId`. A mismatched body `userId` gets a 403.
- Allow only the creator, or a user with an explicit `story_access` row (for screenplays, `screenplay_access`). Everyone else gets **403** with "You can't change this story directly. Suggest changes instead."
- Remove the self-grant: the `story_access` contributor insert at about 9324, and `ensureScreenplayAccessRow(..., 'contributor')` at about 3354.
- The desktop client already sends the session cookie: `CrowdlyClient` has a cookie jar and logs in before syncing.

**Collaboration requests** (new; migration `0021_collaboration_requests.sql`, idempotent)
- New table `story_collaboration_requests`:
  - columns: `id`, `story_title_id`, `requester_id`, `message`, `status` (`pending` / `approved` / `declined`), `created_at`, `decided_at`
  - a unique pending request per story and requester
- New routes in `backend/src/collaboration.js`, all behind `requireAuth`, registered under both `/` and `/api`:
  - `POST /stories/:id/collaboration-requests` with `{message}`. Rejected if you're already the owner or a collaborator. Notifies the owner with `createNotification(owner, 'collaboration_request', …)` from `notifications.js:50`.
  - `GET /stories/:id/collaboration-requests`, owner only.
  - `GET /stories/:id/collaboration-requests/mine`, which returns the caller's latest status.
  - `POST /collaboration-requests/:id/approve` and `/decline`, owner only.
    - Approving inserts a `story_access` row with role `contributor`, which makes it explicit.
    - Both notify the requester.

**Tests**
- Extend `backend/tests/discovery-auth.test.js` with the new routes and the two sync routes.
- An end-to-end script checks:
  - a non-owner sync gets 403 and the text is unchanged
  - the owner's sync still works
  - after a request is approved, the collaborator's sync works

## 2. Desktop

**Discovery** (`ui/discovery/`)
- `ReaderWidget` gets an "✎ Change this story" toolbar button. `DiscoveryView` sets it when a Crowdly story is open, the same way as the shelf menu (`set_shelf_menu`).
- The details panel and the card context menu get the same action for story cards.
- `DiscoveryView` emits `changeStoryRequested(story_title_id, title)`.

**New `ui/change_story_dialog.py` (`ChangeStoryDialog`)**
- Four large choices, each with one line of explanation, enabled according to:
  - `GET /story-titles/:id`: `can_clone`
  - `GET /stories/:id/translations`: `can_translate`
  - `GET …/collaboration-requests/mine`: pending/declined state, shown as "Request sent on …"
- **Translate** picks a language from `/locales` and a start: "copy the text" or "start blank".
- **Ask to collaborate** has a short message field.

**MainWindow handling** (`ui/main_window.py`, connected like `convertRequested`)
- Reuses the existing fetch/import pipeline: `_start_crowdly_fetch` → `_on_crowdly_story_fetched` → `persist_import_metadata`.
- The project-space gate and login via `_discovery_credentials` work as today.
- What each route does:
  - **Direct edit:** fetch the story, then `set_mode(MODE_CREATION)`, open it, and sync as now.
  - **Make my own version:** `POST /stories/:id/clone` with the logged-in user's id, then open the new story the same way.
  - **Translate:** `POST /stories/:id/translations`, then open the new story the same way.
  - **Ask to collaborate:** POST the request. The reader stays in Discovery with a status message.
  - **Suggest changes:** below.

**Suggest changes**

*Opening a suggestion copy*
- The fetched story is saved as a **suggestion copy**. A new metadata field, `edit_mode="suggest"`, is stored in the xattrs and the `.crowdly.json` sidecar.
- A **snapshot of the original chapters** is stored in the sidecar: `chapter_id`, `title` and `paragraphs`, from `GET /chapters`. `CrowdlyClient` gets a `fetch_chapters()` method for this.
- `_maybe_sync_story_to_web` **never directly syncs** a suggestion copy.

*In Creation mode*
- A bar above the editor says: "Suggestion copy of '…' - your edits are sent to the author as suggestions", with a **Send my suggestions** button.

*Sending: new `editor/suggestions.py`, `build_proposals(snapshot, markdown)`*
1. Split the edited Markdown into chapters (`##` headings, the same parsing as `story_sync.parse_story_from_content`) and match them to the snapshot by position.
2. A changed chapter heading becomes a `chapter_title` proposal.
3. Paragraphs are aligned with `difflib`:
   - a replaced range becomes a `paragraph` proposal at the first index, with the new text (several paragraphs are joined by blank lines, which the approve route already splits)
   - deleted paragraphs become proposals with empty text
   - inserted paragraphs are merged into the neighbouring proposal
4. Added or removed chapters can't be expressed as proposals. They are listed and skipped, with a hint to use "Make my own version" instead.
5. Proposals are posted with `POST /stories/:id/proposals`. A confirmation shows how many changes were sent.
6. The sent state is stored, so sending again only sends new edits.

*Known limitation (shared with the web):* proposals point at paragraph positions. If the owner approves one that changes the paragraph count, later proposals in the same chapter can land on the wrong paragraph. The confirmation explains this, and the owner sees each proposal's text before approving.

**Clear "not permitted" errors**
- `crowdly_client._http_post_json` reports a 403 as a new kind, `forbidden`, instead of "Login failed".
- `_on_story_sync_failed` (`main_window.py:8157`) then shows: "You can't change this story directly", with a button that turns the open file into a suggestion copy.

**Translations:** every new string goes into all 12 desktop `.ts` files, and the 8 `.qm` files are recompiled.

## 3. Web: where the owner approves collaboration requests

- `src/pages/Story.tsx`: for the owner, a **Collaboration requests** panel next to the existing proposals/collaborators UI, with Approve and Decline.
- The notifications list renders the new types `collaboration_request` and `collaboration_request_decided`, with a link to the story.
- Desktop suggestions arrive as ordinary proposals, so the existing approve/decline UI on the story page handles them.
- All new text goes through `EditableText`, with en, ru and de added to the seed JSON.

## Critical files

**Backend**
- `backend/src/server.js`: the two sync routes and registering the router
- new: `backend/src/collaboration.js`, `backend/migrations/0021_collaboration_requests.sql`
- `backend/tests/discovery-auth.test.js`

**Desktop**
- `ui/discovery/{discovery_view,reader_widget,details_panel}.py`
- new: `ui/change_story_dialog.py`, `suggestions.py`
- `ui/main_window.py`, `crowdly_client.py`, `story_import.py`, `file_metadata.py`
- the i18n files
- new tests: `tests/test_suggestions.py` (diff to proposals) and `tests/test_change_story.py` (the dialog's options for each permission)

**Web**
- `src/pages/Story.tsx`
- the notifications component
- the seed JSON

## Verification

1. **Backend:** run the migration twice, then the auth matrix.
2. **End-to-end against local Postgres**, with temporary users that are deleted afterwards. The owner and a reader each check:
   - the reader's direct sync gets 403 and the text is unchanged
   - the reader's suggestions create proposals, and approving one changes the text
   - clone and translate each create a story the reader owns, and their sync works
   - after a collaboration request is approved, the reader's direct sync works
3. **Desktop:** pytest (diff cases: an edited paragraph, inserted, deleted, a changed title, an added chapter that gets skipped). Then run the app: Discovery → open a story → "✎ Change this story" → each route ends in Creation mode as expected.
4. **Web:** lint and build. In the browser, the owner sees the collaboration request and approves it.
