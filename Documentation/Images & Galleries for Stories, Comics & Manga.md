# Images & Galleries for Stories, Comics & Manga

## Context

Crowdly currently handles images in exactly one place: a single `cover_image_url` text column on `story_title`, hand-set with no upload pipeline (no multer/S3/Cloudinary anywhere in the repo — the only precedent is a stray Supabase call in `SuggestFeature.tsx` unrelated to the live backend). Story/screenplay listings (`src/modules/stories output.tsx`) render as a literal sortable HTML table with 40×40px thumbnails. There's no image support at all for comics/manga (no such content type exists), and no illustration support inside novel chapters.

The goal, discussed with the user, is to give stories, comics, and manga real visual identity across web (and eventually desktop/mobile), inspired by (but adapted from) a prior "Shameless" project's photo gallery — specifically its grid/lightbox layout, multi-photo-per-entity model, tagging/captions, and upload/moderation flow. Crowdly's twist: stories can be single-user (private or public) or multi-creator/crowd-created, so upload and moderation rules must account for both.

Storage decision: **local disk for now** (not S3/Cloudinary) — explicit user choice, revisit later if needed.

Also folding in a small documentation fix: exploration found the repo has three apps — root `src/` (main Crowdly platform), `apps/desktop/` (recently renamed on disk from `apps/desktop app/`, uncommitted), and `apps/web/` (a separate standalone browser-based "web-editor" for editing stories/creative spaces from any browser — distinct product, not a replacement for root `src/`). This trio isn't documented in `CLAUDE.md`. This plan targets **root `src/` + `backend/` + `apps/desktop/`** for the gallery/comics work; `apps/web/` is out of scope for this feature (it's an editor companion, not the story-browsing platform) but gets documented so its purpose isn't lost again.

Four phases, all planned here, all to be built in this pass:
1. Upload infrastructure + gallery data model (permissions-aware)
2. Listings redesign (poster grid)
3. Novel inline illustrations + fan gallery
4. Comics/manga content type + reader

---

## Phase 0 — Documentation fix

**File**: `CLAUDE.md`

Add a short "Applications" clarification under Project Overview listing the three apps and their purpose:
- Web platform (root `src/`) — the main Crowdly platform (this is already documented)
- Desktop app (`apps/desktop/`, previously `apps/desktop app/` — update the path in the existing Desktop App sections)
- Web editor (`apps/web/`) — standalone browser-based lightweight story/creative-space editor ("write/edit your stories even when you're not at your computer... all you need is a browser"), a browser companion to the desktop editor, not a replacement for the main platform. New dev commands section mirroring the desktop one (`npm run dev` via Vite, per `apps/web/package.json`).

Update every existing `apps/desktop app/` path reference in `CLAUDE.md` to `apps/desktop/`.

---

## Phase 1 — Upload infrastructure + gallery data model

### Reused patterns (confirmed via exploration)
- Schema changes: idempotent `ensureXTable()` functions in `backend/src/server.js`, invoked fire-and-forget at module load (e.g. `ensureStoryAccessTable()` at `:1269`) — **not** a migrations folder.
- Dedicated join-style tables for content association: `story_attachments` (`server.js:743-753`) is the closest precedent — FK to `story_title_id`, `kind`, `role` columns. Gallery images follow this shape rather than reusing `creative_space_items` (that table is oriented around desktop-sync file versioning, not moderation).
- Permission checks are currently inline SQL duplicated ~4x with no middleware (`server.js:3148,3209,3248,7715`) and role checks use plain async helper functions, not Express middleware (e.g. `isPlatformAdmin()` at `:7833`). Given galleries need the same check on ~5 routes, write **one new helper** and reuse it — first place in the codebase to do so.

### Database (`backend/src/server.js`)

New table, `ensureStoryGalleryImagesTable()`:
```sql
CREATE TABLE IF NOT EXISTS story_gallery_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_title_id uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES local_users(id),
  image_url text NOT NULL,
  chapter_id uuid,               -- set only for kind='inline_illustration' (Phase 3)
  anchor_index integer,          -- paragraph array index at insertion time (Phase 3)
  caption text,
  tags text[],
  kind text NOT NULL DEFAULT 'gallery'
    CHECK (kind IN ('cover_variant','inline_illustration','fan_art','gallery')),
  status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending','approved','rejected')),
  position integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS story_gallery_images_story_status_idx
  ON story_gallery_images (story_title_id, status);
```
Call alongside the other `ensure*()` invocations near `server.js:1290`.

### Permission helper (new, `server.js` near `isPlatformAdmin`)
- `getStoryGalleryRole(storyTitleId, userId)` → `'owner' | 'contributor' | null`, checking `story_title.creator_id` then `story_access` (reuses existing table, no new access table needed for stories).
- Rule baked into the upload route:
  - `story_title.visibility === 'private'` → only owner/contributor may upload at all (403 otherwise).
  - Public story, uploader is owner/contributor → `status='approved'` immediately, any `kind`.
  - Public story, uploader is any other authenticated user → forced `kind='fan_art'`, `status='pending'`.
- Moderation (approve/reject/delete someone else's item) allowed for owner/contributor or `platform_admin`.

### Local disk storage
- Add `multer` to `backend/package.json`.
- New `backend/src/uploads.js`: multer `diskStorage` to `backend/uploads/gallery/<story_title_id>/<uuid>.<ext>`, `fileFilter` restricted to `image/png|jpeg|webp|gif`, size limit (~10MB), max 10 files/request.
- `server.js`: `app.use('/uploads', express.static(path.join(__dirname, '../uploads')))`.
- Add `backend/uploads/` to `.gitignore` (runtime-generated, local-only storage).

### Routes (new `backend/src/gallery.js`, mounted from `server.js`, same modularization style as `friends.js`/`messaging.js`)
- `POST /stories/:storyTitleId/gallery` — `multer.array('images', 10)`, auth required, applies the rule above per file, inserts rows, returns them.
- `GET /stories/:storyTitleId/gallery` — public callers get `status='approved'` only; owner/contributor/`platform_admin` get all statuses.
- `PATCH /gallery-images/:id` — caption/tags/position editable by uploader or moderator; `status` changes (approve/reject) moderator-only.
- `DELETE /gallery-images/:id` — uploader (own pending/rejected item) or moderator; best-effort `fs.unlink` of the file.

---

## Phase 2 — Listings redesign (poster grid)

### Reused pattern
`src/modules/favorite stories.tsx:104-143` (and its near-duplicates `living-experiencing stories.tsx`, `lived-experienced stories.tsx`) already implement a responsive `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4` tile layout with `hover-scale` cards — a much better base than the `<table>` in `stories output.tsx`. None of the three render cover art today; that part is new.

### Change
Replace the `<table>` render inside `StoriesOutput` (`src/modules/stories output.tsx`) with a poster-grid: large `coverImageUrl` art (fixed aspect-ratio box, `object-cover`, gradient/icon placeholder when missing), title + author overlay, `TagBadge` row, language badge, hover-scale. Keep the existing sort/page-size controls above the grid — `StoriesOutputItem` type and props stay the same, so every consumer of `<StoriesOutput>` (`NewestStoriesOutput.tsx`, `NewestScreenplaysOutput.tsx`, `LivingStoriesOutput.tsx`, `LivedStoriesOutput.tsx`, `FavoritesOutput.tsx`) gets the redesign for free.

Add one forward-looking optional prop, `filmstripUrls?: string[]`, unused until Phase 4 (comics hover-preview of first pages).

Per `CLAUDE.md`'s EditableText checklist: keep existing `stories-output-*` ids where text is unchanged, add new ids (same `stories-output-` prefix — ids are scoped per route path, confirmed via `EditableContentContext.tsx`, so reusing the module across pages is safe) for any new static strings.

### Reusable gallery-viewing primitives (built here, used again in Phase 3/4)
No lightbox exists in the codebase. Compose one from existing primitives:
- `src/components/ImageGallery.tsx` — grid of thumbnails; click opens `Dialog`/`DialogContent` (`src/components/ui/dialog.tsx`) sized full-screen, containing the existing Embla `Carousel`/`CarouselItem`/`CarouselPrevious`/`CarouselNext` (`src/components/ui/carousel.tsx`) for paging between images, with caption/tag display.
- `src/components/GalleryUpload.tsx` — multi-file extension of the existing single-image `CoverImageUpload.tsx` drag-and-drop pattern, `POST`s to `/stories/:id/gallery`.

---

## Phase 3 — Novel inline illustrations + fan gallery

### Design risk (flagged, addressed pragmatically)
`src/pages/Story.tsx` has **no stable paragraph IDs** — paragraphs are plain strings in an array, addressed only by array index (`key={idx}` at `:2240`/`:2731`), and no CRDT linkage was found in this file despite CLAUDE.md describing CRDT versioning elsewhere. Anchoring an illustration to `anchor_index` is therefore fragile under paragraph insert/delete. Building stable paragraph IDs is a deeper content-model change (would touch the chapter/paragraph schema broadly) and is **out of scope here** — v1 anchors by `anchor_index` with best-effort clamping (if a chapter has fewer paragraphs than `anchor_index` on render, show the illustration at chapter end rather than erroring). Revisit stable anchoring as separate future work if illustrations turn out to drift often in practice.

### Backend
Reuses Phase 1's `story_gallery_images` table: `kind='inline_illustration'` rows carry `chapter_id` + `anchor_index` (columns already included in the Phase 1 schema above).

### Frontend (`src/pages/Story.tsx`)
- Read/experience mode (`:2218-2272`) and contribute/edit mode (`:2729-2761`): render an illustration card wherever `anchor_index === idx` for the current chapter.
- Edit mode: add an "Insert illustration here" action alongside the existing per-paragraph actions (`startEditParagraph`, `handleQuickCreateBranch`, `:2749-2757`), opening `GalleryUpload` scoped to `kind=inline_illustration` + current `chapter_id`/`idx`.
- `StoryDetails.tsx`: new "Gallery" section using `ImageGallery`, showing `kind IN ('fan_art','gallery')`. Upload button open to any authenticated user (goes to moderation per Phase 1 rules); moderation approve/reject controls visible to owner/contributor/`platform_admin`.

### Desktop (`apps/desktop/`)
The `.story` markup format already supports `[image left width=40% height=20%](path)[/image]` (`apps/desktop/src/editor/format/story_markup.py:250-327`) — reuse as-is, no new DSL. If an "Insert Image" menu action doesn't already exist in `main_window.py`, adding one triggers the **mandatory** CLAUDE.md checklist: update `_retranslate_ui()` and all 8 `.ts` files under `src/editor/i18n/`.

---

## Phase 4 — Comics/manga content type + reader

### Reused pattern
Screenplay is the established precedent for a content type fully separate from `story_title`: `screenplay_title` / `screenplay_scene` / `screenplay_block` (`server.js:982-1053`), integer `scene_index`/`block_index` ordering, and — for bulk reordering — the "delete all rows for this parent, reinsert in order inside one transaction" approach used by `POST /screenplays/:id/sync-desktop` (`server.js:2880-3023`), since no row-by-row reorder endpoint exists anywhere in the codebase. Comics follow the same shape rather than being bolted onto `story_title`.

### Database (`backend/src/server.js`)
- `comic_title`: `comic_id uuid PK`, `title`, `creator_id`, `visibility`, `published`, `genre`, `tags text[]`, `cover_image_url`, `reading_direction text NOT NULL DEFAULT 'ltr' CHECK (reading_direction IN ('ltr','rtl'))`, timestamps.
- `comic_page`: `page_id uuid PK`, `comic_id` FK CASCADE, `page_index integer NOT NULL`, `image_url text NOT NULL`, `alt_text text`, `width integer`, `height integer` (for reader aspect-ratio sizing before load), `created_at`. Index `(comic_id, page_index)`.
- `comic_access`: mirrors `screenplay_access` exactly — `(comic_id, user_id, role, created_at)`.

### Routes (new `backend/src/comics.js`, mirrors screenplay route module)
- `GET/POST /comics`, `GET /comics/newest` (mirrors `GET /stories/newest`, feeds Phase 2's grid).
- `POST /comics/:comicId/pages` — reuses Phase 1's multer setup, appends at `max(page_index)+1`. Gated by `comic_access` role only (owner/contributor) — not the fan-moderation flow from Phase 1/3, since pages are canonical content, not community gallery submissions.
- `PUT /comics/:comicId/pages/reorder` — accepts an ordered array of `page_id`s, reassigns `page_index` sequentially inside one transaction (same pattern as `sync-desktop`).

### Frontend
- `src/pages/Comic.tsx` (thin wrapper, mirrors `Screenplay.tsx`) + `src/modules/comic reader.tsx` (mirrors `screenplay template.tsx`): page-turn/scroll reader, direction-aware controls (RTL flips prev/next and swipe direction for manga), thumbnail filmstrip using `carousel.tsx`.
- `src/pages/ComicDetails.tsx` (mirrors `StoryDetails.tsx`): page upload (`GalleryUpload`-style, posts to `/comics/:id/pages`) and reordering. **v1 reorder UI is up/down buttons per page**, not drag-and-drop — no DnD library exists in the repo yet, and adding one (e.g. `@dnd-kit`) is a separate dependency decision better made once the buttons-based v1 is in use.
- `src/pages/NewestComicsOutput.tsx` (mirrors `NewestStoriesOutput.tsx`), feeding Phase 2's grid with `filmstripUrls` populated from each comic's first 3-4 `image_url`s.
- Full EditableText compliance (new pages/module — mandatory per CLAUDE.md), fresh `comic-*` id prefix.

### Desktop (`apps/desktop/`) — intentionally light scope
No native Qt comic editor. `main_window.py:7494-7506` already classifies uploaded creative-space files by `kind` (including `"image"`) for sync — that's sufficient for a creator to get page images into a synced Space; actual page sequencing/publishing into `comic_page` order happens in `ComicDetails.tsx` on the web. Avoids building a redundant native image-sequencing UI for a first version.

---

## Verification

- **Backend**: `npm run dev` in `backend/`; confirm `ensure*Table()` logs succeed with no errors on boot. `curl -F images=@test.jpg ...` against each new upload route; confirm DB row + file written to `backend/uploads/...`. Confirm moderation logic: upload as a non-contributor on a public story → `status='pending'`; as owner → `status='approved'`; upload attempt on a private story as a stranger → 403.
- **Frontend**: `npm run dev` at root; visually check the poster grid on `/stories/newest`, gallery tab + lightbox open/close + upload on a story details page, moderation approve/reject as owner vs. as a different logged-in consumer, inline illustration insert+render in `Story.tsx`, and the comic reader's page-turn behavior including one RTL (manga) test title. `npm run lint`.
- **Desktop**: only if an Insert-Image menu action is added — `python -m editor`, switch language at runtime, confirm the new menu item is translated (mandatory checklist verification) and that `[image]` renders correctly in preview.
