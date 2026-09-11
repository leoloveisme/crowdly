# Mobile (Android/iOS) revisioning & real-time sync spec

This describes what a future Android or iOS Crowdly client needs to implement to participate in the same real-time collaborative revisioning system as the main web platform, the web editor (`apps/web`), and the desktop app. It targets the backend built in `backend/src/crdt/` and the `/crdt/docs/*` routes in `backend/src/server.js`. No mobile code exists in this repo — this is a specification for a from-scratch implementation, not a description of existing code.

## 1. Data model

Content that supports real-time collaboration is stored as [Automerge](https://automerge.org/) CRDT documents, one per entity:

| `doc_type` | Entity | Shape |
|---|---|---|
| `chapter` | a story chapter (`stories` row) | `{ chapterId, storyTitleId, title, paragraphs: string[], branches: { [paragraphIndex]: BranchEntry[] }, meta: { episodeNumber, partNumber, chapterIndex } }` |
| `scene` | a screenplay scene (`screenplay_scene` row) | `{ sceneId, screenplayId, sceneIndex, slugline, location, timeOfDay, isInterior, synopsis, blocks: BlockEntry[] }` |
| `story_title` | a story's title-level metadata | `{ storyTitleId, title, genre, tags: string[], description, completionStatus }` |
| `screenplay_title` | a screenplay's title-level metadata | `{ screenplayId, title, genre, tags: string[], formatType }` |

`BranchEntry = { id, userId, branchText, createdAt, language, metadata }`, `BlockEntry = { blockId, blockType, text, metadata }`.

**Every string field is CRDT text.** Automerge 3.x treats plain strings as character-level mergeable text by default — there is no separate "Text" wrapper type to construct. Concurrent edits to the same field (e.g. two people editing the same paragraph) merge automatically at the character level; you do not need to build conflict-resolution UI for this case.

Each doc's identity is an Automerge-repo `DocumentId` (a base58check string), issued by the backend — see §3. The catalog mapping `doc_type` + entity id → `DocumentId` lives server-side in the `crdt_documents` table; a mobile client never needs to read that table directly, only the REST/WS surface below.

## 2. Sync protocol

Two transports, both against the same backend:

### 2a. REST (works today, no CRDT library required)

- `POST /crdt/docs/ensure` — body `{ docType, chapterId? | sceneId? | storyTitleId? | screenplayId? }`. Looks up or creates (with access-control check) the doc for that entity. Returns `{ docKey }`.
- `GET /crdt/docs/:docKey/history` — returns `{ docKey, revisions: RevisionEntry[] }`, each entry `{ revisionNumber, heads: string[], createdAt, createdBy, createdByName, changeCount, snapshot }` — `snapshot` is the full doc value as of that point. `heads` is the Automerge heads identifying that point in history (needed for restore).
- `POST /crdt/docs/:docKey/restore` — body `{ toHeads: string[] }`. Restores live content to a historical value **as a new forward change** — this is non-destructive; the restored-from state and every change after it stay in history. A restore can itself be undone by restoring again.
- `POST /crdt/docs/:docKey/apply-content` — body `{ value: object, source?: string }`. Applies a whole new document value as one attributed change. This is the fallback path for a client with no native Automerge implementation (see §4) — prefer real operational sync (§2b) when available.

All four require the session cookie described in §5.

### 2b. Real-time WebSocket sync (requires an Automerge client library)

- Endpoint: `wss://<backend host>/crdt-sync` (same host/port as the REST API).
- Protocol: [automerge-repo](https://github.com/automerge/automerge-repo)'s standard sync-message framing over `cbor-x`-encoded WebSocket frames — the same protocol the main web platform, web editor, and (eventually) desktop speak. If a mobile-native Automerge/automerge-repo binding is available for the target platform at implementation time (check current availability — an official Swift binding and community Kotlin/JVM bindings have existed; verify freshness before committing to one), use it directly: `repo.find(docId)` / `repo.create()` give you a live, auto-syncing document handle, and local edits merge automatically with the server and any other connected peer.
- If no usable native binding exists for the target platform, fall back to §2a's REST endpoints, polling `GET .../history` for updates and using `apply-content` to push local edits — functionally equivalent to how the desktop app works today (see §4), at the cost of losing true keystroke-level concurrent merge.
- Presence/awareness: automerge-repo's ephemeral-message channel carries "who's viewing/editing" and cursor-position data. It is not persisted server-side. A mobile client that wants a presence UI (avatars, "X is editing") should broadcast its own ephemeral messages and listen for others'; this is optional and has no effect on document content or history.

## 3. Creating vs. opening a doc

A client never mints a `DocumentId` itself. To start editing a chapter/scene/title:

1. Call `POST /crdt/docs/ensure` with the entity id. The backend checks the caller has an access row (`story_access`/`screenplay_access`) for the owning story/screenplay, creates the doc on first use (seeded from the entity's current plain-column content), and returns `docKey`.
2. Use `docKey` as the Automerge-repo `DocumentId` for `repo.find()`/sync, or as the path parameter for the REST endpoints in §2a.

## 4. Offline & conflict behavior

- **Local storage**: an automerge-repo-based client needs a local persistent storage adapter (the equivalent of the browser's IndexedDB adapter used by the main platform and web editor). On mobile, back this with SQLite or the platform's equivalent embedded key-value store, implementing the same `load/save/remove/loadRange/removeRange` chunk-storage interface automerge-repo expects (see `backend/src/crdt/postgresStorageAdapter.js` for the server-side equivalent — same interface, different backing store).
- **Offline edits**: with a real Automerge client, edits made offline queue locally and sync automatically on reconnect, merging with anything that happened server-side or on other peers in the meantime — no special offline-conflict code needed for text fields.
- **No native Automerge available**: fall back to the "reconstruct-and-resend" pattern — keep a local buffer of full document state, and on reconnect call `POST /crdt/docs/:docKey/apply-content` with the current full value. This is coarser (a whole-document diff rather than the exact edit operations) but still produces a correct, mergeable, and fully-historied result; it is the same tradeoff the desktop app makes today (see `apps/desktop/src/editor/crowdly_client.py`'s `sync_revision_history_for_story`/`sync_revision_history_for_screenplay`).
- **Structural conflicts**: Automerge auto-merges text, but concurrent structural edits (e.g. two people deleting/reordering the same paragraph or block at the same time) still deserve a visible "this changed while you were away" cue in the UI — don't assume every conflict is silently and correctly resolved with no user-visible signal.

## 5. Authentication

The existing backend uses an httpOnly session cookie (`crowdly_session`, see `backend/src/sessions.js`), set by `POST /auth/login`, checked by `requireAuth` on every `/crdt/docs/*` route and by the WebSocket upgrade handler for `/crdt-sync`. This maps cleanly onto a browser client (`credentials: "include"` on every fetch — see `apps/web/src/Index.tsx`'s login call for the pattern) but **does not map cleanly onto a native mobile HTTP/WebSocket client**, which typically has no shared cookie jar with a browser and no reason to emulate one.

**This is a required backend addition, not a mobile-side workaround**: add a bearer-token auth path (e.g. `POST /auth/login` optionally returning a long-lived API token, checked via an `Authorization: Bearer <token>` header as an alternative to the session cookie in `requireAuth` and in the `/crdt-sync` upgrade handler) before a real mobile client can authenticate. Do not attempt to have a mobile client fake or manually manage the cookie-based flow.

## 6. Restore UX expectations

Match the model in §2a exactly: restore is presented as "go back to this revision," but implemented as, and communicated to the user as, a new change — not a rollback that discards later history. A mobile restore UI should look the same as the main platform's (see `src/components/RevisionComparison.tsx`'s restore button): pick a past revision from a list, confirm, and the current content updates immediately (live for any other connected viewer too) while every revision — including the one just superseded — remains visible in history afterward.

## 7. What to reuse vs. reimplement

- **Reuse the shared layout-preset data** described for the other two web apps (`src/lib/revision-layouts.ts` / `apps/web/src/lib/revision-layouts.ts` — 25 tiling presets total for viewing/comparing 2-4 revisions side by side, matching the desktop editor's `_LAYOUTS` table in `apps/desktop/src/editor/ui/compare_revisions.py`). Port the same preset geometries natively; there is no reason for mobile to invent a fourth, different set.
- **Do not reimplement diffing from scratch** if a platform-native text-diff library is available; the main platform uses `diff-match-patch`, the web editor uses a small from-scratch word-level LCS diff (`apps/web/src/lib/word-diff.ts`) precisely because it had no other dependency — pick whichever fits the mobile platform's ecosystem, the algorithm choice is not load-bearing.
