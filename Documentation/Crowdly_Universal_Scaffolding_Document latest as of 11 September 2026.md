# Crowdly Universal Scaffolding Document

## Purpose

Crowdly is delivered through four apps sharing one backend/domain model: the **main web platform** (root of this repo), the **web editor** (`apps/web/`), the **desktop editor** (`apps/desktop/`), and future **Android/iOS** apps that don't exist yet. This document is the single master behavioral contract for every domain feature the platform offers, independent of which app happens to implement it today. It exists so a future client — mobile, most urgently — can be built to behave consistently with the existing apps without reverse-engineering behavior from `server.js`.

Each section below covers one domain: what it does, what data model backs it, what backend endpoints implement it, how each current app uses it (or explicitly doesn't), and what a new client must replicate to stay consistent. This is a **snapshot of current, implemented behavior** — proposed/future work still genuinely unbuilt (e.g. the "Spaces as parent folder" visibility redesign, the live WebSocket half of CRDT collaboration described in §9, or the lineage-graph branching vision in §19) is referenced only where relevant, never presented as already built. Two appendices follow the domain sections: known gaps/inconsistencies worth knowing before you rely on this system, and a full endpoint inventory for quick reference.

All backend line references are to `backend/src/server.js` unless another file is named.

### Highlights from the research

A few things worth flagging up front, from the research that shaped this document:

- The client-supplied-`userId` trust model covers most of the platform (stories, screenplays, creative spaces, admin-adjacent routes) — only friends/follows/messaging/notifications/gallery/comics, and now the new CRDT revisioning endpoints, verify a real session. Worth prioritizing before building a mobile client against the rest. (See Appendix A, item 1.)
- Screenplay import/export backend routes are dead `501` stubs — three separate client-side implementations exist instead (main platform, web editor, desktop). (See §5, §14, and Appendix A, item 5.)
- This document treats current code as ground truth and only cross-references the two untracked planning docs (Spaces, messaging) where relevant, without presenting proposed-but-unbuilt work as shipped. (See Appendix A, item 11.)
- **Updated after a full re-scan**: the real-time CRDT/Automerge revisioning system, previously a dead scaffold with zero callers, is now a working (if mid-flight, uncommitted-as-of-this-scan) implementation with real callers from every frontend, plus a from-scratch mobile client spec (`docs/mobile-crdt-spec.md`). §9 was rewritten accordingly, with knock-on updates to §4, §11, §19, and Appendix A/B — this document reflects the working tree as of that re-scan, not just the original commit it was first written against.

---

## 1. Authentication & Sessions

**What it does**: account registration/login/logout, server-verified session persistence, password change, account deletion, and a closed-alpha invitation gate that sits in front of the whole platform.

**Data model**:
- `local_users(id, email, password_hash, created_at, is_banned)` — bcrypt (cost 10).
- `sessions(token uuid PK, user_id, created_at, last_used_at, expires_at)` — 30-day absolute TTL, 7-day idle TTL.
- `user_roles(id, user_id, role app_role)`.
- `alpha_invitations`, `alpha_applications` — the pre-signup gate.

**Endpoints**:
| Method/Path | Purpose |
|---|---|
| `POST /auth/register` | Create account + `consumer` role; auto-marks a matching pending alpha invitation as joined. |
| `POST /auth/login` | bcrypt-verify, creates a session row, sets `crowdly_session` httpOnly cookie. |
| `GET /auth/me` | Server-verified "who am I", session-gated. |
| `POST /auth/logout` | Deletes the session row server-side and clears the cookie. |
| `POST /auth/change-password` | Body-supplied `userId` + current-password re-verification (no session check). |
| `POST /auth/delete-account` | Body-supplied `userId` + password re-verification; cascades delete of roles/profile/user. |
| `POST /alpha/validate` | Invitation-code + email check, unlocks the app for this browser. |
| `POST /alpha/apply` | Waitlist application when no invitation code is held. |
| `GET /alpha/check-access` | Check current alpha-gate status. |

**Per-app usage**:
- **Main web platform**: `AuthContext` (cookie session, `credentials: "include"`, `localStorage` cache under `crowdly_auth_user` for instant paint, reconciled against `/auth/me`). `AlphaContext`/`AlphaGuard` wraps every route except `/alpha` and redirects unvalidated visitors. `Login.tsx`, `Register.tsx`, `AlphaGate.tsx`.
- **Web editor** (`apps/web/`): its own login/register modal on `Index.tsx` calling the same `/auth/login`/`/auth/register`. Shares the `crowdly_auth_user` `localStorage` key **by convention only** — it does not call `/auth/me` to verify the session server-side the way the main platform does.
- **Desktop**: has **two independent auth layers**. (1) A local gate against its own local Postgres `local_users` table (`apps/desktop/src/editor/auth.py`), used before the app even opens a document — this is *not* the backend's `local_users` table, just a same-named local one. (2) A real login to the Crowdly backend (`crowdly_client.py: login()` → `POST /auth/login`) used only when syncing a story/screenplay/space to the web.

**Consistency notes for future clients**: session verification is the exception, not the rule, across this backend (see Appendix A). A new client should call `/auth/me` on launch/resume the way the main platform does, not trust a cached user object indefinitely the way the web editor does. Password-change/delete-account do not check the session at all — only the password — so a new client must not assume "logged in" implies "authorized" for these two actions beyond what the password check itself provides.

---

## 2. User Roles & Permissions

**What it does**: defines the platform's permission vocabulary — but only a fraction of the defined roles are ever actually used. Real per-content permission (who can edit/own a specific story) is tracked separately, per-item, not via global roles.

**Data model**: Postgres enum `app_role` has **9** values: `platform_admin`, `platform_supporter`, `consumer`, `author`, `editor`, `chief_editor`, `producer`, `contributor`, `ui_translator`. `user_roles` is the many-to-many grant table.

**What's actually live**:
- `platform_admin` — bootstrap-only, never granted through any API; checked via `isAdmin()`.
- `platform_supporter`, `ui_translator` — the only two roles an admin can grant, via `PATCH /admin/users/:id`.
- `consumer` — auto-assigned to every new account on registration.
- `author`, `editor`, `chief_editor`, `producer`, `contributor` — **defined in the enum but never written to `user_roles` anywhere in the backend.** They're vestiges of an earlier Supabase-era permission model. Real per-story/per-screenplay authorship and contribution tracking instead lives in:
  - `story_access` / `screenplay_access` / `comic_access` — `role ∈ {owner, contributor}`, auto-granted whenever a user creates or edits an item.
  - `story_collaborators` — `role ∈ {author, coauthor}`, granted explicitly via `POST /stories/:id/authors` / `/coauthors`.

**Endpoints**: role changes only via `PATCH /admin/users/:id` (admin-granted roles) and `POST/DELETE /stories/:storyTitleId/authors[/:userId]` / `/coauthors[/:userId]` (per-story collaborator roles), plus `POST /stories/:storyTitleId/transfer-ownership`.

**Per-app usage**:
- **Main web platform**: `UserRole` enum in `AuthContext` mirrors all 9 values; `hasRole()` gates UI (e.g. `/platform-admin`, `/support`). Per-story roles are read from the story/screenplay payloads returned by their respective GET endpoints, not from `user_roles`.
- **Web editor / desktop**: no role-management UI; both simply act as whatever user is logged in, relying on the backend's per-item access checks (where they exist — see Appendix A on unchecked deletes).

**Consistency notes for future clients**: do not build role-gating logic around `editor`/`chief_editor`/`producer`/`contributor` — nothing in the current system ever assigns or checks them for real content permissions. Determine "can this user edit this story" from `story_access`/`story_collaborators` membership (as returned by the story's own endpoints), and "is this user a platform admin/supporter/translator" from `user_roles`.

---

## 3. Platform Administration

**What it does**: admin user management, the alpha invitation/waitlist system, user groups (used as access-rule targets, not general social groups), and a lightweight one-way admin-to-user messaging tool.

**Data model**: `alpha_invitations`, `alpha_applications`, `admin_messages`, `user_translator_languages(user_id, locale_code)`, `user_groups`/`user_group_members`.

**Endpoints** (all `isAdmin()`-gated except the two public `/alpha/*` write routes, already listed in §1):
- `POST/GET/DELETE /admin/invitations` — create/list/revoke alpha invites (fires an email).
- `GET /admin/applications`, `POST /admin/applications/:id/invite`, `DELETE /admin/applications/:id` — waitlist triage.
- `POST /admin/users` — admin-created accounts (roles + translator languages).
- `GET /admin/users` — paginated/searchable user list with derived flags (`is_owner`/`is_contributor`/`is_author`/`is_initiator`, computed live via subqueries, not stored).
- `PATCH /admin/users/:id`, `POST /admin/users/:id/ban`, `DELETE /admin/users/:id`, `POST /admin/users/:id/message`.
- `GET/POST /groups`, `DELETE /groups/:id`, `GET/POST /groups/:id/members`, `DELETE /groups/:id/members/:memberId`.

**Per-app usage**: main web platform only — `PlatformAdmin.tsx` (`/platform-admin`, hard-redirects non-admins), `InviteUsers.tsx`, `CreateUser` module, `GroupsManager` module, and `Support.tsx` (`platform_supporter` role, largely scaffolded UI for enquiries/feedback/feature suggestions/user lookup). No equivalent in the web editor or desktop app.

**Consistency notes**: groups here are an access-control primitive (a grantee type alongside individual users in `story_access_rules`), not a social feature — don't conflate with any future "communities" concept.

---

## 4. Stories

**What it does**: the platform's primary content type — prose stories composed of chapters and paragraphs, with a distinctive **paragraph-branching** system (alternate versions of a paragraph) and a lightweight proposal/review workflow for non-owner contributions.

**Data model**:
- `story_title` — metadata: `visibility ∈ {public, unlisted, private}`, `published`, `completion_status`, `clone_policy`/`export_policy ∈ {anyone, restricted, none}`, `genre`, `tags`, `language`, `cover_image_url`, `creative_space_id`, `initiator_id` vs `creator_id`.
- `stories` (= chapters) — `chapter_id`, `paragraphs text[]`, `episode_number`, `part_number`, `chapter_index`, `tags`, `paragraph_tags jsonb`.
- `story_access` (`owner`/`contributor`), `story_collaborators` (`author`/`coauthor`), `story_initiators`/`authors` (desktop-metadata mapping), `story_access_rules` (fine-grained clone/export/view grants to a user or group), `story_spaces`/`story_attachments` (Creative Space linkage), `paragraph_branches`.

**Endpoints** (selected; full list in Appendix B):
- Create: `POST /stories/template` (title + first chapter + initial revision in one transaction, auto-grants owner/author).
- Discover: `GET /story-titles?userId=`, `GET /stories/unbound`, `GET /stories/newest|most-active|most-popular`.
- Read: `GET /story-titles/:storyTitleId` — enforces `visibility` (public open; unlisted → creator, `story_access`, or a `view` access-rule; private → creator or `story_access` only); computes `can_clone`/`can_export`.
- Update: `PATCH /story-titles/:storyTitleId`, `PATCH .../settings`, `PATCH .../space`, `PATCH /stories/:id/chapters/reorder`.
- Delete: `DELETE /story-titles/:storyTitleId`, `DELETE /chapters/:chapterId` — **no ownership check on either** (see Appendix A).
- Chapters: `GET/POST /chapters`, `PATCH /chapters/:chapterId` — writers auto-insert `chapter_revisions`/`paragraph_revisions`.
- Attachments: `GET/POST/DELETE .../attachments[/:id]`.
- Collaborators/ownership: `GET .../collaborators`, `POST/DELETE .../authors[/:userId]`, `POST/DELETE .../coauthors[/:userId]`, `POST .../transfer-ownership`.
- Clone/copy: `POST .../clone` (deep copy, enforces `clone_policy`), `POST .../copy-to-space` (adds a secondary space link without cloning content).
- Access rules: `GET/PUT .../access-rules` (replace-all-by-type).
- Contributors/contributions: `GET .../contributors`, `GET .../contributions`, `GET /users/:userId/contributions` — the latter two **self-heal**: if the `contributions` table has no rows yet, they derive from `chapter_revisions`/legacy fields/`crdt_proposals` live, then best-effort backfill.
- Proposals (non-owner contribution flow): `POST/GET .../proposals`, `POST /proposals/:id/approve|decline` — approval splices `proposed_text` directly into `stories.paragraphs` or `paragraph_branches.branch_text`.
- Paragraph branches: `POST /paragraph-branches`, `GET /paragraph-branches` (platform-wide feed), `GET .../branches`, `PATCH/DELETE /paragraph-branches/:id`. See §19 for the full branching model, current UI, and the proposed lineage-graph vision built on top of it.
- Desktop sync: `POST /story-titles/:storyTitleId/sync-desktop` — full title+chapters snapshot with per-field revisioning and Space auto-association.
- User-scoped: `GET /users/:userId/stories|branches|story-status|favorites|experiencing|experienced`.

**Per-app usage**:
- **Main web platform**: the full experience lives in `Story.tsx` (chapters, branching, proposals, collaborators, revisions, reactions/comments, favorites/status, visibility/settings, gallery, clone/export, access rules), `NewStoryTemplate.tsx` (creation), `StoryDetails.tsx` (metadata/space linkage), `StoriesSpacesMigration.tsx` (bulk-assign legacy Spaceless stories), plus discovery pages (`Index`, `NewestStoriesOutput`, `LivingStoriesOutput`, `LivedStoriesOutput`, `FavoritesOutput`).
- **Web editor**: `story template.tsx` — backend-bound editor (title/chapter/paragraph CRUD, description/tags, auto-creates a story on first edit); `StoryViewer.tsx` for lighter read/edit. No proposal/review workflow, no branching UI, no access-rules UI.
- **Desktop**: `crowdly_client.py` (`create_desktop_story`, `sync_desktop_story` → `sync-desktop`), `story_sync.py` parses local Markdown (`# Title`/`## Chapter`) into the sync payload shape, background `_StorySyncThread`/`_StoryPullThread`. No branching, proposals, or reactions/comments UI — those are web-only concepts.

**Consistency notes for future clients**: visibility/clone/export policy enforcement happens server-side on read, not just in UI — replicate the same policy checks rather than trusting client state. The proposal/approve-decline flow is currently a direct text splice, not a CRDT merge — the CRDT revisioning system described in §9 is now partially implemented, but it does not yet touch this proposal/approve-decline flow — treat "approve" as "overwrite with proposed text," not as a three-way merge.

---

## 5. Screenplays

**What it does**: structured screenplay editing over scenes and typed blocks (action/character/dialogue/parenthetical/transition/shot/general), otherwise mirroring the story domain's shape.

**Data model**: `screenplay_title` (simpler than `story_title` — no access-rules or collaborator-role equivalent, no separate initiator concept), `screenplay_scene`, `screenplay_block`, `screenplay_access`, `screenplay_revisions` (`prev_content`/`new_content jsonb` scene snapshots), `story_screenplay_links` (adaptation relationship to a story).

**Endpoints**:
- `POST /screenplays/template` (title + 1 scene + 6 demo blocks).
- `GET /screenplays?userId=`, `/newest`, `/most-active`, `/most-popular`.
- `GET/PATCH/DELETE /screenplays/:id` — **no ownership check on PATCH or DELETE**.
- Scenes: `GET/POST .../scenes`, `PATCH/DELETE /screenplay-scenes/:id` (records a revision, auto-grants contributor access).
- Blocks: `POST .../blocks`, `PATCH/DELETE /screenplay-blocks/:id` (same revisioning pattern).
- Import/export: `POST /screenplays/import/{fdx,fountain,odt,docx,pdf}`, `GET /screenplays/:id/export.{fdx,fountain,odt,docx,pdf}` — **all 10 return `501 Not Implemented`**; pure reserved API surface, unused by any current app.
- Desktop sync: `POST /screenplays/:id/sync-desktop` — transactional full replace of scenes/blocks, with **optimistic-concurrency conflict detection** (`remoteUpdatedAt` vs `screenplay_title.updated_at`, returns `409` on stale write) and best-effort block-type inference from plain text.
- Revisions: `GET /screenplay-revisions/:screenplayTitleId/compare` — **no plain list endpoint** exists (opposite gap from chapters, which have both).
- `GET /users/:userId/screenplays`.

**Per-app usage**:
- **Main web platform**: `Screenplay.tsx` → `screenplay template.tsx` (also used for creation). `canEdit = !!user` client-side — looser than stories; real enforcement is server-side (and, per Appendix A, largely absent). Comments per-scene via the shared `InteractionsWidget`. Export via the shared `ExportDialog` (FDX/Fountain formats specifically target this domain).
- **Web editor**: `screenplay editor.tsx` — scenes/blocks CRUD, title/description/tags, inline editing.
- **Desktop**: `crowdly_client.py` (`create_desktop_screenplay`, `sync_desktop_screenplay`, `get_screenplay_structure`), `story_sync.py`'s screenplay parser (each line under a `##` heading → a block).

**Consistency notes**: since the backend's own import/export routes are dead stubs, every app that supports FDX/Fountain implements that conversion **client-side independently** (desktop's `importing/`/`exporting/` registries, the web editor's `import-formats.ts`/`export-formats.ts`, the main platform's `src/lib/import`/`export`). A new client must do the same rather than expect the backend to convert formats for it.

---

## 6. Comics

**What it does**: a third content type — image-page comics/manga with configurable reading direction. Notably less developed than stories/screenplays.

**Data model**: `comic_title` (`visibility`/`published`/`genre`/`tags`/`reading_direction ∈ {ltr, rtl}`), `comic_page` (ordered image pages), `comic_access` (owner/contributor, same pattern as story/screenplay access).

**Endpoints** (`comics.js`, session-authenticated): `GET /comics/newest` (4-image filmstrip preview), `GET /comics/:id` (with pages), `POST /comics`, `POST /comics/:id/pages` (multipart, 15MB/20 files), `PUT /comics/:id/pages/reorder`, `PATCH/DELETE /comic-pages/:id`.

**Per-app usage**: main web platform only — `Comic.tsx`/`comic reader.tsx` (page-by-page viewer, keyboard nav respects `ltr`/`rtl`), `NewComicTemplate.tsx`, `NewestComicsOutput.tsx`. No web editor or desktop support at all.

**Consistency notes**: comics deliberately lack `most-active`/`most-popular` ranking, a user-scoped `GET /users/:userId/comics`, comments/reactions integration, and any revisioning table — do not assume comics have parity with stories/screenplays elsewhere in this document unless stated here.

---

## 7. Creative Spaces

**What it does**: a Dropbox-like project workspace (folders/files) that the desktop app and web editor treat as their primary local↔remote sync unit; stories/screenplays optionally "live in" a Space.

**Data model**: `creative_spaces` (`user_id` stored as **text, not FK** — deliberately loosened to also hold Supabase/local ids; `visibility ∈ {public, private}`, `published`, `default_item_visibility`, `sync_state`), `creative_space_items` (folder/file **metadata** tree, `relative_path` unique per space — no file bytes stored server-side), `story_spaces` (a story can belong to a primary + secondary Spaces).

**Endpoints**: `GET /creative-spaces?userId=`, `GET /creative-spaces/:id`, `POST /creative-spaces/ensure-default` (lazy "No name creative space" creation for sync flows), `POST/PATCH/DELETE /creative-spaces/:id`, `POST /creative-spaces/:id/clone` (shallow, metadata-only — deep folder clone is unbuilt), items (`GET .../items?path=`, `POST .../items/folder`, `POST .../items/file`, `PATCH/DELETE /creative-space-items/:id`), sync (`GET .../sync?since=` delta pull, `POST .../sync` snapshot push).

**Per-app usage**:
- **Main web platform**: `CreativeSpacePage.tsx` (file browser), `creative spaces` module (list on `Profile.tsx`), `Admin.tsx` "My Spaces" tab, `StoryDetails.tsx` (link/unlink a story to/from a space).
- **Web editor**: `CreativeSpacePage.tsx` (same file-browser concept), `Header.tsx` "Space(s)" popup, `spaces.tsx` module — explicitly documented in code as "the web counterpart of the desktop editor's project-space concept."
- **Desktop**: `websync.py` (`build_space_snapshot`, `sync_space_to_web`, `pull_space_from_web`, `list_remote_spaces_for_user`) — the desktop app is the primary place actual file content lives; the "Spaces" menu (add/select/remove/clear) drives this.

**Consistency notes**: because the server stores metadata only, a new client cannot fetch file *content* from the backend for a Space item — it must either hold files locally (desktop model) or fetch them from wherever they're actually hosted (the item's `mime_type`/`hash` fields describe, but don't serve, the bytes).

---

## 8. Comments & Reactions

**What it does**: threaded comments and like/dislike reactions, shared across stories and screenplays via mutually-exclusive targeting.

**Data model**: `comments` (`story_title_id`/`chapter_id`/`paragraph_index` **or** `screenplay_id`/`screenplay_scene_id`, `parent_comment_id` for threading), `reactions` (same dual targeting, `reaction_type` free-text used as `like`/`dislike`).

**Endpoints**: `POST/GET /comments` (chapter-only comments auto-resolve `story_title_id`), `POST/GET /reactions` — `POST` implements **toggle semantics** transactionally: same reaction again removes it, a different reaction switches like↔dislike. `GET /users/:userId/comments` exists for profile activity views; there is no dedicated reaction-list-by-user endpoint.

**Per-app usage**: main web platform only — `InteractionsWidget` (parameterized by `kind: story|chapter|screenplay|scene`), `ChapterInteractions.tsx`. Not present in the web editor or desktop app.

**Consistency notes**: replicate the exact toggle semantics above — a naive "always insert a new reaction row" implementation will diverge from existing behavior and create duplicate/stale reactions.

---

## 9. Revisioning

**What it does**: **two parallel revision-tracking systems currently coexist per entity**, and both are written on every edit today. The "classic" system is per-field snapshot history (four tables, a side effect of normal edit routes) — this is what existed when this document was first written. Since then, a **real-time CRDT (Automerge) revisioning system** has gone from a dead, zero-caller scaffold to a working (if mid-flight) implementation with real callers from every frontend. It is **additive, not a replacement** — the classic tables keep being written independently, and nothing has been migrated away from them.

### Classic revision tables (four tables, asymmetric read support)

- `story_title_revisions` — written on template-create, title PATCH, clone, desktop sync. `GET /story-title-revisions/:storyTitleId` (plain list only, **no compare endpoint**).
- `chapter_revisions` — written on chapter create/PATCH/desktop-sync. `GET /chapter-revisions/:chapterId` (list) **and** `GET /chapter-revisions/:chapterId/compare?revisionNumbers=`.
- `paragraph_revisions` — written per-changed-paragraph inside chapter PATCH. **No GET endpoint exists at all** — write-only from the API surface.
- `screenplay_revisions` — written on scene/block PATCH. `GET /screenplay-revisions/:screenplayTitleId/compare` only — **no plain list endpoint** (the mirror-image gap from chapters).

### Real-time CRDT revisioning (automerge-repo) — now implemented, still mid-flight

**Status**: this was a dead, zero-caller scaffold when this document was first written (`crdt_documents`/`crdt_changes`, never interpreted, never called). It has since been actively built out — uncommitted, in-progress work as of the most recent re-scan of this document. Treat the description below as current.

**Data model**:
- `crdt_documents` — the catalog table (entity → automerge `DocumentId`), now extended with nullable `screenplay_id`/`scene_id` FKs (screenplay support is new) plus four unique partial indexes (one per `doc_type`) to prevent duplicate docs per entity.
- `crdt_doc_chunks` (new) — the actual binary automerge chunk storage, backing a full `StorageAdapterInterface` (`load`/`save`/`remove`/`loadRange`/`removeRange`) in `backend/src/crdt/postgresStorageAdapter.js`.
- `crdt_changes` — still created but **remains genuinely dead**: no code reads or writes it; explicitly commented in `server.js` as legacy/superseded by the chunk-storage model above.
- Four document shapes (`backend/src/crdt/seeders.js`): `chapter` (`chapterId, storyTitleId, title, paragraphs[], branches, meta`), `scene` (`sceneId, screenplayId, sceneIndex, slugline, location, timeOfDay, isInterior, synopsis, blocks[]`), `story_title` (`storyTitleId, title, genre, tags, description, completionStatus`), `screenplay_title` (`screenplayId, title, genre, tags, formatType`).

**Endpoints** (all `requireAuth`-gated — a notable exception to Appendix A item 1's client-trusted-`userId` pattern):
- `POST /crdt/docs/ensure` — looks up or lazily creates+seeds the automerge doc for an entity (access-checked via `story_access`/`screenplay_access`); returns `{ docKey }`.
- `GET /crdt/docs/:docKey/history` — returns human-grouped revisions via `buildRevisionHistory()` (same-actor changes within a 2-minute gap collapse into one entry): `{ revisionNumber, heads, createdAt, createdBy(Name), changeCount, snapshot }`.
- `POST /crdt/docs/:docKey/restore` — non-destructive: applies a historical value as a new forward change (`{ toHeads }`), never truncates history.
- `POST /crdt/docs/:docKey/apply-content` — whole-document-replace-as-one-change fallback for clients with no native Automerge binding (this is what the desktop app uses today, since no maintained Python Automerge binding exists).

**Live WebSocket sync**: `wss://<host>/crdt-sync` (`CRDT_WS_PATH`), wired onto the same `http.Server` as Express via automerge-repo's `NodeWSServerAdapter`. Authenticated by parsing the `crowdly_session` cookie off the raw upgrade request; `sharePolicy`/`authorizeDocAccess()` resolves the automerge peerId back to the authenticated socket so identity can't be spoofed, then checks `story_access`/`screenplay_access`. **Server-ready but has zero client implementation anywhere in this repo today** — no `@automerge/automerge*` package exists in any frontend's `package.json`, and no code opens a `wss://.../crdt-sync` connection. All three existing frontends only use the REST endpoints above.

**Relationship to the classic revision tables**: purely additive, not a migration. The old `story_title_revisions`/`chapter_revisions`/`paragraph_revisions`/`screenplay_revisions` INSERTs are untouched and still fire on every edit. `backend/scripts/backfill-crdt-docs.js` (dry-run by default) can optionally one-time-replay old revision rows into a doc's Automerge history (`--apply --history`) so they appear in the new restore UI, but this doesn't stop the old tables from being written afterward — so a given entity's history currently exists in both systems independently, and the frontend prefers the CRDT one when available (falls back to the classic endpoints otherwise).

**Maturity**: working but clearly mid-flight. `@automerge/automerge-repo` is pinned to an alpha prerelease (`^2.6.0-alpha.3`). No bearer-token auth path exists yet — only the cookie-based session — which `docs/mobile-crdt-spec.md` (see below) flags as a blocking gap for any native mobile client. No production backfill has necessarily been run; existing content only gets a CRDT doc lazily on first `ensure` call.

**Mobile spec**: `docs/mobile-crdt-spec.md` (new, spec-only — no mobile code exists) describes what a future Android/iOS client needs: the same 4 doc shapes; REST (works today) vs. WebSocket (needs a native Automerge binding, "verify freshness") sync transports; `ensure`-before-open semantics; an offline local chunk-storage adapter (SQLite) implementing the same storage interface as the Postgres adapter; the same non-destructive restore semantics; and it explicitly calls out the missing bearer-token auth path as required backend work before a native client can authenticate.

**Per-app usage**:
- **Main web platform**: `src/modules/compare revisions.tsx` now tries CRDT history first (`ensureCrdtDoc`/`fetchCrdtHistory`) and falls back to the legacy `/chapter-revisions`/`/screenplay-revisions` `/compare` endpoints only on failure. `RevisionComparison.tsx` gained a "Restore" column/button, shown only when a revision carries `docKey`+`heads` (i.e. only for CRDT-sourced revisions). `NewStoryTemplate.tsx` was refactored to delegate to the shared `CompareRevisionsContainer` instead of its own bespoke (non-CRDT) revision-fetch code.
- **Web editor**: previously had **no revision/history UI at all** — now has one, via the new `RevisionsPanel.tsx` (a collapsible revision list + up-to-4-way compare + word-diff + Restore), backed by `apps/web/src/lib/revisionsApi.ts`. Wired into `screenplay editor.tsx` at scene granularity (scenes have stable ids); `story template.tsx` only at the story-title level, not per-chapter — a code comment explicitly defers chapter-level revisioning because that editor's chapters are local DOM state without stable per-block ids, which would need a larger automerge-repo edit-loop rewrite.
- **Desktop**: has its own, separate, **entirely local** versioning system — an append-only JSONL update queue per document (`.crowdly/<filename>.updates.jsonl`, `versioning/local_queue.py`), with keyframe+diff entries and a dedicated "Compare revisions" workspace; this still does **not** sync to either backend revision system automatically for live editing. What's new: `crowdly_client.py` gained a cookie jar so it can authenticate against the session-gated CRDT endpoints, plus two best-effort methods (`sync_revision_history_for_story`, `sync_revision_history_for_screenplay`) that POST each chapter's/scene's current full content to `/crdt/docs/ensure` + `/apply-content` after a normal sync — so desktop-originated edits now show up in the same restore UI as web edits, without true keystroke-level sync (no Automerge binding exists for Python). `main_window.py` calls these silently after existing sync flows; no new menu items or UI were added.

**Consistency notes for future clients**: prefer the CRDT REST endpoints over the legacy revision endpoints when both exist for an entity (the web platform's own fallback order is the reference behavior) — but don't assume every entity has a CRDT doc yet; call `ensure` first. Don't build against `/crdt-sync` expecting an existing client-side reference implementation to copy — there isn't one; you'd be the first. `crdt_changes` remains genuinely dead regardless of everything else in this section. Don't expect symmetry between list and compare endpoints on the classic tables (see the gaps above) — check which one exists per table before building a generic "revision history" screen against them. Desktop's local JSONL revision history is still invisible to every other client.

---

## 10. Messaging

**What it does**: gated 1:1 direct messaging, unlockable only between accepted friends.

**Data model**: `conversations` (1:1 with an *accepted* `friend_requests` row, lazily created, `friend_request_id UNIQUE`), `messages` (`conversation_id, sender_id, body, deleted_at`), `conversation_reads` (`conversation_id, user_id, last_read_at`).

**Behavior**: friendship is re-verified at **send time**, not just conversation-open time — unfriending mid-thread blocks further sends immediately. New messages push live via SSE but are **deliberately not written to the `notifications` table** (to avoid chat traffic dominating that feed); unread state instead derives from `conversation_reads.last_read_at` vs. the latest message.

**Endpoints** (`messaging.js`, mounted at `/api`, session-authenticated): `GET /conversations/with/:friendUserId` (opens/creates), `GET /conversations` (paginated inbox, last-message preview + unread flag), `GET /conversations/unread-count`, `GET /conversations/:id/messages` (paginated), `POST /conversations/:id/messages` (rate-limited 30/min), `POST /conversations/:id/read`.

**Per-app usage**: main web platform only — `Communications.tsx` (`/communications?with=<friendId>`), `CommunicationsSection.tsx`, `messagesApi.ts`. Not present in the web editor or desktop app.

**Consistency notes**: build unread badges from `conversation_reads` comparisons, not from a `notifications` feed — messages intentionally don't appear there.

---

## 11. Social graph — Friends, Follows, Notifications, Live delivery

**Friends** (`friends.js`): a single status-tracked table rather than a swipe/match split (`pending`/`accepted`/`declined`), a deliberate simplification since requests aren't anonymous here. A partial unique index excludes `declined` rows so a fresh request can be re-sent; a 24h cooldown follows a decline. Sending a request while the other side already has one pending **auto-accepts**. Endpoints: `POST/GET /friends/requests`, `POST /friends/requests/:id/accept|decline`, `DELETE /friends/requests/:id` (cancel own outgoing), `DELETE /friends/:userId` (unfriend → soft `declined`), `GET /friends/status/:userId`, `GET /friends`. Rate-limited 30/hour.

**Follows** (`follows.js`): one-directional, no acceptance needed — `follows(follower_id, followee_id)` with `CHECK (follower_id != followee_id)`. `POST/DELETE /follows/:userId`, `GET /follows/status/:userId`. Rate-limited 60/hour.

**Notifications** (`notifications.js`): single table, `type ∈ {friend_request, friend_accept, follow}` — `message` is deliberately excluded (see §10). `GET /notifications` (paginated), `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`.

**Live delivery** (`events.js`): a single-process **in-memory** SSE hub (`clientsByUser: Map<userId, Set<res>>`) at `GET /api/events` — originally the only route in `server.js` using session-based `requireAuth`; the new `/crdt/docs/*` endpoints and `/crdt-sync` WebSocket (§9) now also do. Explicitly noted in code as needing to become Redis pub/sub if horizontally scaled.

**Per-app usage**: main web platform only. `Friends.tsx` (Friends/Requests/Find tabs — Find reuses the global search module), inline accept/decline in `CrowdlyHeader`'s notification bell, friend/follow actions on `PublicProfile.tsx`. `LiveUpdatesContext` holds the `EventSource` connection, updates unread counts, and posts ARIA live-region announcements; on any 401 from a refresh call it triggers `AuthContext.clearSession()`.

**Consistency notes for future clients**: a mobile client needs either native SSE support or a polling fallback against the same count/list endpoints — there is no push-notification (APNs/FCM) integration today. Because the SSE hub is in-memory and single-process, don't assume delivery is guaranteed across backend restarts or multiple backend instances.

---

## 12. Interface Translations / EditableContent (UI-chrome translation)

**What it does**: lets `platform_admin`/`ui_translator` users translate the platform's own UI copy (button labels, headings, etc.) in place, at runtime, per page-path. This is a **distinct system** from per-story/content language tagging (the `locales`-backed `language` field on stories/chapters) — don't conflate the two.

**Data model**: `interface_translations(page_path, element_id, language, content, original_content, updated_by)`, unique on `(page_path, element_id, language)`; `user_translator_languages` (restricts a non-admin translator to specific locales); `locales` (13 seeded languages + "other", `enabled`, `direction ltr|rtl`).

**Endpoints**: `GET /interface-translations?page_path=&language=` (public read), `PUT /interface-translations` (upsert, `isTranslator()`-gated; **hard-blocks writing `language='English'`** since English is the protected source language; non-admin translators further restricted to their assigned locales), `GET /locales` (public, `enabled=true` only).

**Per-app usage**:
- **Main web platform**: pervasive — `EditableText.tsx` wraps essentially every static UI string with a unique `id`; `EditableContentContext` fetches all translations for the current page-path + language in one call whenever route/language changes; `EditingModeToggle` (admin-only floating button) flips edit mode platform-wide. This is the system CLAUDE.md's "Web App — Mandatory Checklist" requires every new page/module to participate in.
- **Web editor**: has a language selector in `Header.tsx` (8 languages) but no observed `EditableText`-style in-place editing — it's a *consumer* of the language concept, not a participant in the admin-editable translation system.
- **Desktop**: uses a **completely separate, unrelated** translation mechanism — Qt Linguist `.ts`/`.qm` files (13 languages), compiled and loaded via `QTranslator` at app startup, edited by developers at build time, not by admins at runtime. Nothing connects the desktop's translation strings to the `interface_translations` table.

**Consistency notes**: a future client has to pick a model — runtime admin-editable (web pattern, requires implementing the fetch-per-page-path + edit-mode UX) or compile-time static (desktop pattern, simpler but requires a rebuild to add a translation). Do not assume the two systems share any data.

---

## 13. Search

**What it does**: platform-wide search across stories, screenplays, and users.

**Endpoints**: `GET /search?q=&limit=&includePrivate=` (fans out in parallel across `story_title`+`stories`, `screenplay_title`+`screenplay_scene`, and `local_users`+`profiles`; `includePrivate` — only passed when the caller `hasRole("platform_admin")` — drops the public/published filter), `GET /users/search` (lighter, paginated, for picker widgets).

**Per-app usage**: main web platform only — `search.tsx` module (`fetchSearchResults`, debounced header autocomplete via `SearchBox`), `Search.tsx` (`/search`, full results with type filter + client-side sort), also reused inside `Friends.tsx`'s "Find" tab. Not present in the web editor or desktop app.

**Consistency notes**: `includePrivate` is a real server-side visibility bypass gated purely on role — a future client must never pass it for a non-admin user.

---

## 14. Import / Export

**What it does**: converting stories/screenplays to and from external file formats.

**Formats**: Export → PDF, EPUB, DOCX, ODT, FDX, Fountain; "Save as" → Markdown/`.story`/`.screenplay`. Import → DOCX, PDF, EPUB, ODT, FDX, Fountain.

**Backend support**: the only backend routes for this (`/screenplays/import/*`, `/screenplays/:id/export.*`) are **all stubbed `501`** — dead API surface.

**Per-app usage**: because the backend doesn't do conversion, **every app implements it independently, client-side**:
- **Main web platform**: `src/lib/export/*` / `src/lib/import/*` (one module per format), `useExport`/`useImport` hooks, `ExportMenu`/`ExportModal`/`ImportModal`/`SaveAsMenu` components, `ExportDialog`/`ImportDialog` in the `import-export` module that also performs create-from-import (`POST /stories/template` + `/chapters`, or `/screenplays/template` + `/scenes` + `/blocks`), optionally attaching the raw file into a Creative Space.
- **Web editor**: `import-export.tsx` (1274 lines) + `import-formats.ts`/`export-formats.ts` — a self-contained pipeline supporting the same format set, posting to the same creation endpoints, also able to import directly into a Creative Space.
- **Desktop**: `importing/registry.py`/`exporting/registry.py` with per-format modules (`docx_importer.py`, `epub_importer.py`, `fdx_importer.py`, `fountain_importer.py`, `odt_importer.py`, `pdf_importer.py` and export equivalents).

**Consistency notes**: a future client (mobile) must implement its own format conversion — it cannot lean on the backend for this today. If the backend stubs are ever implemented, this triple duplication should collapse onto them; until then, treat the three existing client-side implementations as the reference for exact format handling (e.g. FDX/Fountain screenplay-block-type mapping).

---

## 15. Gallery (fan-art / illustration)

**What it does**: a per-story image gallery distinct from Creative Spaces, with a moderation workflow for non-owner-submitted art.

**Data model**: `story_gallery_images` (`kind ∈ {cover_variant, inline_illustration, fan_art, gallery}`, `status ∈ {pending, approved, rejected}`).

**Behavior**: uploads by the story owner/a contributor are auto-`approved`; everyone else's uploads are forced to `kind='fan_art'` + `status='pending'`, awaiting moderator action. This is, per the research pass, the single most access-control-rigorous endpoint set in the codebase — checks moderator-or-uploader on PATCH/DELETE, moderator-only on status changes.

**Endpoints**: `gallery.js` (multer-based upload), `PATCH /gallery-images/:id` for moderation.

**Per-app usage**: main web platform only — `ImageGallery`/`GalleryUpload` on `Story.tsx`. Not present elsewhere.

**Consistency notes**: replicate the auto-approve-for-owner vs. pending-for-everyone-else split exactly — this is a moderation/trust boundary, not just a UI convenience.

---

## 16. Profiles

**What it does**: a user's own editable profile, and a separately-computed public-facing view with per-section visibility controls.

**Data model**: `profiles` (bio, avatar/cover, interests, `profile_page_name` — globally unique, sanitized against `javascript:`/`data:`/HTML in social links), plus per-container visibility flags (`favorites`/`living`/`lived`/`stories`/`screenplays`, each independently `public|private|friends|selected`, with `*_selected_user_ids` allow-lists when `selected`).

**Endpoints**: `GET/POST/PATCH /profiles/:userId` (lazily creates a default profile row on first read), `GET /profiles/check-profile-page-name/:name`, `GET /public-profiles/:username` (matches `username` or `profile_page_name`, case-insensitive; returns only what the visibility flags permit).

**Per-app usage**: main web platform only. `Profile.tsx` (own profile — avatar/cover, bio, interests, Creative Spaces, "stories/screenplays I'm creating/co-creating" each with its own audience popover, plus the three Experience rails). `PublicProfile.tsx` (`/:username`, a catch-most route) — conditionally renders sections per the owner's visibility settings, and hosts friend-request/follow actions toward the viewed user.

**Consistency notes for future clients**: the per-container visibility model is genuinely deep — five independently-configurable containers, each with four possible visibility states and a potential allow-list. A future client rendering someone else's profile must honor every flag combination, not just a single blanket public/private toggle.

---

## 17. Desktop-specific systems

Capabilities that exist **only** in the desktop app, with no web/mobile equivalent today — flagged separately since they represent either desktop-only workflows or unfinished integration points.

- **Local file-first document model**: documents are plain files on disk (`.md`, `.story`, `.screenplay`); story/screenplay metadata (story_id, tags, genre, description, source_url, last_sync_date, etc.) is stored as **filesystem extended attributes** next to the file, not in any database. `.story`/`.screenplay` extensions map to dedicated DSL formats parsed/rendered via `format/story_markup.py`/`format/screenplay_markup.py`.
- **Local JSONL versioning queue** — see §9; entirely local, not synced to the backend's revision tables.
- **Qt Linguist i18n** — see §12; compile-time, 13 languages, unrelated to the backend's `interface_translations` system.
- **Master Document workspace** (`ui/master_document_window.py`) — a separate window for composing one document out of multiple included files (dockable file explorer, drag-and-drop include containers, reorder/collapse/expand). No web equivalent exists.
- **Online storage menu items** (Dropbox/Google Drive under Settings → Synchronisation) — menu actions exist (`_action_sync_dropbox`/`_action_connect_dropbox`/`_action_sync_gdrive`/`_action_connect_gdrive`) but appear to be **stub/placeholder** actions, not fully wired integrations — verify before assuming this works.
- **Format import/export** — the most complete implementation of any app (PDF/DOCX/EPUB/ODT/FDX/Fountain both directions), per §14.
- **macOS "Open With" file-association handling** via `QFileOpenEvent`.

**Consistency notes**: none of this is "functionality to replicate on mobile" in the literal sense — it's desktop-native tooling. What a future client *should* care about is the sync contract desktop uses to reach the shared backend (`sync-desktop` endpoints, §4/§5; Creative Spaces sync, §7), since that's the shared surface, not the local-only mechanics.

---

## 18. Static/marketing pages & Feature Suggestions (Supabase legacy)

**Static pages** (main web platform only, no backend calls, effectively design mockups or informational content): `AboutUs.tsx`, `CrowdlySoftware.tsx`, `Sitemap.tsx`, `Lounge.tsx` (community-hub mockup with hardcoded sample data), `StoryforConsumers.tsx` (a "story reader experience" concept page with hardcoded like/dislike counters — likely a design reference for a future consumer reading UI, not a shipped feature).

**Feature Suggestions** — the one place in the app that bypasses the Express backend entirely: `SuggestFeature.tsx` (`/suggest-feature`) and `FeatureSuggestions.tsx` (`/feature-suggestions`) talk directly to **Supabase** (`src/integrations/supabase/client.ts`) — a `feature_suggestions` table (insert with visibility public/private/anonymous, file attachments via Supabase storage, an email notification via a Supabase Edge Function). This is a second, parallel auth/data boundary from everything else in this document.

**Consistency notes**: don't assume the Supabase project is reachable/relevant to a new client unless specifically replicating Feature Suggestions — everything else in the platform goes through the Express backend described in the rest of this document.

---

## 19. Branching & the Lineage-Graph Vision

Two distinct things live under "branching" today: a small, shipped feature, and a much larger, unbuilt vision for visualizing it. Kept separate below so neither gets mistaken for the other.

### What exists today: paragraph branching

**What it does**: lets a contributor create an **alternate version of a single paragraph** — not a whole-document/whole-chapter branch — so a story can hold multiple parallel takes on one moment (e.g. "darker ending," "alt POV") without forking the entire work. This is already covered in its data-model/endpoint form in §4; this section is the canonical place to look for the full branching picture.

**Data model**: `paragraph_branches` (`parent_paragraph_index`/`branch_text`, plus per-branch language tagging).

**Endpoints**: `POST /paragraph-branches` (create), `GET /paragraph-branches` (platform-wide feed — every branch across every story, used for discovery), `GET /stories/:storyTitleId/branches` (scoped to one story), `PATCH/DELETE /paragraph-branches/:id`.

**Per-app usage**:
- **Main web platform**: `ParagraphBranchPopover` (create/view a branch inline while reading/editing a chapter), the `StoryBranchList` tab inside `Story.tsx` (all branches for one story), and a lazy-loaded platform-wide `BranchList` surfaced on the homepage (`Index.tsx`) as a discovery feed. Each branch can carry its own `language` via `StoryLanguageSelect`, independent of the parent story's language.
- **Web editor / desktop**: no branching UI at all — creating or viewing a paragraph branch is currently only possible on the main web platform.

**Consistency note**: this is the *only* "branching" a new client must actually implement to reach behavioral parity with existing apps today — everything below this point is proposed, not built.

### What's proposed but not built: the Lineage-Graph vision

A separate, tracked planning document — `vision for highly active story projects on Crowdly.md` (227 lines, committed to git, not yet surveyed when the rest of this scaffolding document was first written) — sketches a much bigger idea: a **git-style commit-graph (DAG) view** over a project's entire CRDT history, aimed at projects with dozens of contributors branching simultaneously across text, audio, video, images, and comic/manga panels.

Key points, summarized (see the source doc for full detail):
- **Core idea**: nodes = revisions/branch points, edges = "derived from" relationships; each node renders a **type-aware preview** appropriate to its medium (text excerpt, video frame, audio waveform sliver, image thumbnail, comic/manga panel thumbnail) rather than one universal diff view.
- **Proposed data shape**: a normalized `GraphNode` (`id`, `parent_ids`, `media_kind`, `content_ref`, `preview_ref`, `author_id`, `created_at`, `status`, `space_id`) and `GraphEdge` (`from_node_id`, `to_node_id`, `kind: branch|merge|revision`) — a read-model/API layer over existing tables, not a new source of truth.
- **Maps onto tables that already exist**: `story_title`/`stories`, `screenplay_title`/`screenplay_scene`/`screenplay_block`, `paragraph_branches` (already "exactly a fork edge"), `chapter_revisions`/`screenplay_revisions`, `story_access`/`screenplay_access` for permissions, `creative_spaces` as the top grouping level — and, notably, it explicitly proposes reviving `crdt_documents`/`crdt_changes` as the graph's raw edge list. **This proposal is now stale**: `crdt_documents` is no longer dead (§9) — it's live, but repurposed for a different thing (the real-time CRDT revisioning system's document catalog, extended with `screenplay_id`/`scene_id` and per-doc-type unique indexes), not a lineage-graph edge list. `crdt_changes` is still genuinely dead and available, but on its own it's a thinner foundation than this vision originally assumed. Reconciling the two would need real design work, not just implementation.
- **Proposed CRUD toolkit**: Copy (disconnected duplicate), Clone (fork that remembers lineage — i.e. "branch," naming still undecided), Merge (multiple parent_ids; for non-text media this means "keep both, mark one primary," not a real automated merge), Delete (soft-delete/tombstone, children keep working), Update (today's existing edit flow, just visualized differently).
- **Proposed facade API**: `GET /creative-spaces/:spaceId/lineage-graph`, `GET /lineage-graph/nodes/:nodeId`, `POST .../clone`, `POST .../copy`, `POST /lineage-graph/merge`, `PATCH`/`DELETE .../nodes/:nodeId` — designed to sit in front of the existing per-content-type endpoints, not replace them.
- **Scale handling ideas** (for "hundreds of branches" projects): cluster-collapsing stale branches, virtualized canvas rendering, lazy-loaded previews, and a filter bar (author/media type/date/status).
- **Explicitly open questions** the source doc leaves unresolved: is "Clone" the right word vs. "Branch"/"Fork"; is "keep both, mark primary" an acceptable stand-in for "merge" on non-text media; should the graph scope per-story/screenplay or per-Space; where's the line between what's shown in the graph vs. only in a bulk-action list view; what happens to a node's children when their parent is soft-deleted.

**Status**: discussion-stage only — nothing in this section is implemented. It also depends on media-attachment tables for audio/video/images that don't fully exist yet in the current schema (per CLAUDE.md, the platform's non-text media modeling is limited today).

**Consistency notes for future clients**: do not build against the `/lineage-graph/*` API surface above — it doesn't exist. Only the "What exists today" paragraph-branching endpoints are real. Treat this section as forward context for where branching *might* head, not a contract to implement.

---

## Appendix A — Known Gaps & Inconsistencies

Things a future client builder should know before assuming this backend's behavior is a safe or complete pattern to copy:

1. **Two coexisting auth models.** `friends.js`/`follows.js`/`notifications.js`/`messaging.js`/`gallery.js`/`comics.js` verify a server-side session (`requireAuth`, cookie `crowdly_session`) and set `req.user`. Everything else in `server.js` — **stories, screenplays, chapters, comments, reactions, proposals, creative spaces, access rules, collaborators, groups** — instead trusts a client-supplied `userId` in the request body/query with **no verification** that it matches the caller's actual session. This is explicitly documented in `sessions.js` as a known, accepted gap for now, but it means any client can currently act as any user by ID for most of the platform's core content operations. Do not replicate this pattern in a new client's own backend calls without first confirming the gap has been closed. The new CRDT revisioning endpoints (`/crdt/docs/*`, `/crdt-sync`, §9) are the one recently-added exception — they do use `requireAuth` — suggesting newer backend work has started moving away from this pattern, even though it's not been retrofitted onto the older routes.
2. **Several deletes have no ownership check at all** (not even the weak `userId`-trust check — they don't read a `userId` parameter): `DELETE /screenplays/:screenplayId`, `DELETE /screenplay-scenes/:sceneId`, `DELETE /screenplay-blocks/:blockId`, `DELETE /chapters/:chapterId`, `DELETE /story-titles/:storyTitleId`.
3. **9-value role enum, 4 ever used.** `author`/`editor`/`chief_editor`/`producer`/`contributor` are defined in `app_role` but never granted by any code path — see §2. Real authorship/contribution is tracked per-item in `story_access`/`story_collaborators`/`screenplay_access`/`comic_access`.
4. **CRDT status has changed since this document was first written.** It originally described `crdt_documents`/`crdt_changes` as a dead scaffold with zero callers. That's now only true of `crdt_changes` — `crdt_documents` is live, backing a working real-time CRDT (automerge-repo) revisioning system with real callers from every frontend (§9). Still true: `crdt_changes` remains genuinely dead/unused; the live WebSocket sync transport (`/crdt-sync`) has a working server but zero client implementation anywhere in the repo; and no bearer-token auth exists yet, which blocks a native mobile client per `docs/mobile-crdt-spec.md`. Separately, the lineage-graph branching vision (§19) proposed repurposing `crdt_documents`/`crdt_changes` as a graph edge list — that proposal now conflicts with `crdt_documents`'s new real purpose and would need reconciling, not just implementing, if pursued.
5. **Screenplay import/export routes are all `501` stubs** (§5/§14) — every app currently does this conversion client-side instead.
6. **Orphaned Supabase-era tables** with no backend code touching them at all: `editable_content` (predecessor of `interface_translations`), `feature_suggestions` is actually live but only via direct Supabase calls (§18) not the Express backend, `subscribers`, `story_attributes`, `branch_revisions`, `chapter_contributors`. Two more are **read-only remnants**: `chapter_comments`/`chapter_likes` are joined into the `/stories/most-active` ranking query purely for an activity timestamp signal, but nothing writes to them anymore (superseded by the unified `comments`/`reactions` tables) — they always contribute nulls.
7. **Asymmetric revision read endpoints** (§9): chapters have both list and compare; screenplays have compare only; story titles have list only; `paragraph_revisions` has no read endpoint at all.
8. **Revision-number-generation logic is duplicated** across ~3 near-identical implementations (module-level helpers plus transaction-scoped closures inside the two `sync-desktop` handlers) — a refactor opportunity, not a functional bug, but a trap if extending revisioning logic in only one place.
9. **`POST /creative-spaces` unconditionally logs the full request body via `console.error`** — looks like leftover debug instrumentation at the wrong log level, worth cleaning up before treating server logs as reliable error signal for this route.
10. **Two unrelated Creative-Space-adjacent things share the name "space"**: the backend/web `creative_spaces` concept (§7) and any future "Lounge" community-space concept (§18, currently just a UI mockup) are unrelated — don't conflate when scoping future work.
11. **The two untracked planning docs at repo root** (`implementing Spaces stories into Crowdly platform.md`, `implementing messaging on Crowdly platform.md`) describe different maturity levels: the Spaces doc is **pure proposal** — none of its core ideas (a `getEffectiveStoryAccess` resolver, a `/spaces` discovery route, Space-linked-story-defaults-private) exist in the code yet. The messaging doc, by contrast, describes what is **already substantially implemented** (§10/§11 above) — treat its schema/API description as documentation of shipped behavior, not a future plan.

## Appendix B — Full Endpoint Inventory (grouped)

Approximate counts by domain, `server.js` plus router-mounted modules (~175 total HTTP endpoints, including the 4 REST + 1 WebSocket CRDT endpoints added since this document was first written):

- Auth/session: 6 (`/auth/register|login|logout|me|change-password|delete-account`)
- Locales/Search: 3 (`/locales`, `/search`, `/users/search`)
- Profiles: 4 (`/public-profiles/:username`, `/profiles/:userId` GET/POST/PATCH, `/profiles/check-profile-page-name/:name`)
- Screenplays core: 23 (template, list, newest/most-active/most-popular, get/patch/delete, scenes CRUD, blocks CRUD, import×5 (501), export×5 (501), sync-desktop)
- Stories core: 23 (story-titles CRUD/settings/space, unbound, attachments CRUD, template, newest/most-active/most-popular, story-title-revisions, chapters CRUD/reorder, chapter-revisions + compare, copy-to-space, sync-desktop)
- Users-scoped: 9 (stories, screenplays, comments, branches, story-status, favorites, experiencing, experienced, contributions)
- Creative Spaces: 14 (list/get/ensure-default/CRUD/clone, items CRUD, sync get/post)
- Contributions/Contributors/Reactions: 4
- CRDT revisioning (§9, session-authenticated): 4 REST (`/crdt/docs/ensure|:docKey/history|:docKey/restore|:docKey/apply-content`) + 1 WebSocket (`/crdt-sync`, server-ready, no client implementation yet)
- Proposals: 4
- Comments: 2
- Paragraph branches: 5
- Groups & access rules: 7
- Collaborators/ownership: 7
- Admin: 10
- Alpha: 3
- Interface translations: 2
- Misc: 2 (`/health`, `/api/events`)
- Router-mounted modules: Friends 7, Follows 3, Notifications 4, Messaging 6, Gallery 4, Comics 8 (= 32)

For exact method/path/line-number detail per route, see the corresponding domain section above, or grep `backend/src/server.js` for `app.get(`/`app.post(`/`app.put(`/`app.patch(`/`app.delete(`.

## Appendix C — Route → Page Map (Main Web Platform)

| Route | Page | Gate |
|---|---|---|
| `/alpha` | AlphaGate | public |
| `/` | Index | AlphaGuard |
| `/suggest-feature` | SuggestFeature | AlphaGuard |
| `/feature-suggestions` | FeatureSuggestions | AlphaGuard |
| `/account-administration` | AccountAdministration | AlphaGuard + login |
| `/new-story-template` | NewStoryTemplate | AlphaGuard |
| `/new-comic-template` | NewComicTemplate | AlphaGuard + login |
| `/story-for-consumers` | StoryforConsumers | AlphaGuard |
| `/story-to-live` | StoryToLiveToExperience | AlphaGuard |
| `/profile` | Profile | AlphaGuard + login |
| `/sitemap` | Sitemap | AlphaGuard |
| `/software` | CrowdlySoftware | AlphaGuard |
| `/about-us` | AboutUs | AlphaGuard |
| `/lounge` | Lounge | AlphaGuard |
| `/login` | Login | AlphaGuard |
| `/register` | Register | AlphaGuard |
| `/stories/spaces-migration` | StoriesSpacesMigration | AlphaGuard + login |
| `/platform-admin` | PlatformAdmin | AlphaGuard + `platform_admin` |
| `/admin` | Admin ("My Content") | AlphaGuard + login |
| `/support` | Support | AlphaGuard + `platform_supporter` |
| `/admin/invite-users` | InviteUsers | AlphaGuard + `platform_admin` |
| `/friends` | Friends | AlphaGuard + login |
| `/communications` | Communications | AlphaGuard + login |
| `/search` | Search | AlphaGuard |
| `/story/:story_id`, `/story/:story_id/chapter/:chapter_id` | Story | AlphaGuard |
| `/story/:story_id/details` | StoryDetails | AlphaGuard |
| `/screenplay/:screenplay_id` | Screenplay | AlphaGuard |
| `/creative_space/:spaceId` | CreativeSpacePage | AlphaGuard |
| `/favorites`, `/newest_stories`, `/newest_screenplays`, `/newest_comics`, `/living_stories`, `/lived_stories` | *Output pages | AlphaGuard |
| `/comic/:comic_id` | Comic | AlphaGuard |
| `/:username` | PublicProfile | AlphaGuard (catch-most, above `*`) |
| `*` | NotFound | — |
