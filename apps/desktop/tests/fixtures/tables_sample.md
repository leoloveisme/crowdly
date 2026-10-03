# BookOrbit potential benefits for Crowdly

Written 2026-09-30 from a study of the BookOrbit source (local copy at `/Users/leoforce/AI & IT/Product development/bookorbit`).

## Ground rules

- **No code is to be copied from BookOrbit.** The aim is to understand what it does and how, and to reimplement the useful ideas in Crowdly's own stack.
- BookOrbit is licensed AGPL-3.0-only with additional terms (`ADDITIONAL_TERMS.md`, not yet read). That is a second reason to work from understanding only.
- The stacks differ: BookOrbit is NestJS + Vue 3 + Drizzle; Crowdly is Express + React + plain SQL migrations, with a Python/PySide6 desktop app. Everything below would be a fresh implementation.

## How far the study went

- **Read in detail:** the data model and main services for reading progress, reading sessions, status, highlights, position conversion, TTS, read-along, smart scopes, achievements, recommendations, the scanner and metadata fetching.
- **Outlined only:** Kobo sync, KOReader sync and its Lua plugin, podcasts, book requests, login internals.
- **Crowdly side:** the "Crowdly today" column comes from table names, route names, page names and the project notes. The Crowdly code behind them was not read, so "none found" means no table, route or keyword was found, not that the feature was ruled out.

## What BookOrbit is

A self-hosted library and reading platform for ebooks, PDFs, comics, audiobooks and podcasts. It has web readers, native iPhone and Apple Watch apps, Kobo and KOReader sync, 14 metadata providers, statistics, achievements, multi-user accounts with single sign-on, and 25 interface languages. It is large: about 730,000 lines, 72 backend feature modules, 153 database tables.

## How BookOrbit works (the mechanisms worth knowing)

- **Shared catalog, private reading data.** A book has several files (ebook, audio, read-along EPUB). Status, progress, highlights, notes and ratings live in separate per-user tables.
- **One reading position, many vocabularies.** Progress is stored per file and user as a percentage, an exact text location, a page, audio seconds and a narration sentence, all at once. Each client reads the form it understands. Text and narration positions are tracked separately, so listening ahead never moves the place reached by eye.
- **Reading sessions measure active time.** The browser pauses the timer when the tab is hidden, ends the session after 5 minutes idle and drops anything under 10 seconds. Each session has a client-generated id, so a retry never counts twice. The server caps the reported time at the real elapsed time and rolls it into per-day totals in the reader's own timezone.
- **Status follows progress, but manual wins.** "Reading" and "finished" are set automatically after meaningful activity (5 minutes or 1% progress). A status set by hand is not overwritten. Rereads are separate "attempts", each with its own dates and outcome.
- **Highlights sync by version and acknowledgement.** Each highlight has a version number, and each device records the last version it confirmed. Deletions travel as tombstones until every device has confirmed them.
- **The highlighted text is the truth.** When a position is converted or the text around it changes, the text at the resolved position is compared with the stored text. If it drifted, a text search re-anchors it, and the position is marked exact, repaired, pending or failed.
- **TTS is block-aligned.** The server splits a chapter into blocks using the same rules the reader uses for highlighting, so audio block N always matches highlighted block N. Audio is generated per block, cached, fetched three blocks ahead and played gaplessly. Word-level timing is used when the voice provider offers it, with a silent fallback to block level.
- **Read-along uses narration built into the EPUB.** The reader highlights the sentence being spoken and resumes at that exact sentence.
- **One audio owner at a time.** TTS, read-along and audiobook playback ask for "audio focus", so two never play together. All share a sleep timer, speed control and lock-screen controls.
- **Smart scopes are saved rule trees.** About 30 fields with typed operators per field, evaluated live on the server, shareable, with a default sort, and usable as dashboard shelves.
- **Recommendations use no AI model.** Genres, tags, title, series, author and description are hashed into a weighted 256-number fingerprint. Nearest matches are then re-ranked by author, genre, series and rating similarity.
- **Achievements are event-driven.** Services announce events such as "session saved" or "highlight created", and evaluators per category decide awards. The catalogue has four-tier groups and rarity levels. A claim mechanism makes the celebration show on only one device, and a backfill awards past activity silently.
- **Sharing reading insights is opt-in and audited.** A user chooses private, summary or detailed. A viewer opens a 15-minute viewing session, every view is logged, and the user can see who looked.
- **Permissions are a flat list of about 30 named capabilities** per user, plus per-library access. Dependencies between capabilities are enforced when they are granted.
- **One test covers every route.** An end-to-end "authorization matrix" walks a generated list of all routes and asserts who may call each.
- **Audit entries are declared per route**, so sensitive actions are logged without hand-written logging in each handler.
- **Ingest is careful with files.** Moved files are recognised by inode and content hash, and vanished books are marked missing, not deleted. Uploads are resumable, and a drop folder moves files through staged states and imports them automatically once a metadata confidence threshold is met, undoing its moves on failure.
- **Completeness is scored.** Each book gets a weighted metadata score; the weights are adjustable and a zero weight removes a field from the score.
- **Notifications are grouped** by a key with a count and pushed live.
- **Localization has one writer per language.** English is the only catalog edited in code. Other languages are written only by the translation platform (Crowdin), and plural rules are checked automatically.
- **What's New** shows release highlights in-app, only for versions up to the one installed.

## Comparison: where Crowdly could benefit

| Area | How BookOrbit does it | Crowdly today | What Crowdly would gain | Where |
| --- | --- | --- | --- | --- |
| Reading position | Per user and file, stored as percentage plus exact location; text and narration positions kept apart | `user_story_status` (living / lived / favourites); no position table | "Continue where you left off" per chapter, across web, desktop and web editor | Platform + apps |
| Reading sessions | Active time only, idempotent, capped by the server, rolled into daily totals | None found | Real reading time per story and chapter; a base for stats and for showing creators how their work is read | Platform |
| Automatic status | "Reading" and "finished" derived from progress; manual choice wins; rereads are separate attempts | Living / lived set by the user | Living and lived lists that maintain themselves, plus reread history | Platform |
| Highlights and notes | Versioned highlights with colour, style and note; one searchable hub; export to Markdown, CSV, JSON | Comments and reactions; no private highlights | Private highlights for readers, and a direct path from a highlight to a paragraph branch or proposal | Platform + apps |
| Re-anchoring text | The highlighted text is the truth; a drifted position is repaired by text search | Branches stored by paragraph index plus parent text | Comments, branches and highlights that survive chapter edits and reordering | Platform |
| Device sync by acknowledgement | Each device records the last version it confirmed; deletions travel as tombstones | Desktop sync via CRDT and `sync-desktop` | A simpler pattern for syncing non-CRDT data (status, highlights, bookmarks) to the desktop app | Apps |
| TTS playback | Audio per block, aligned to the reader's highlight blocks, cached, fetched ahead, gapless; word timings when available | Bring-your-own-key TTS; read-along with estimated timings | Exact paragraph highlighting without estimating, less waiting, and word-level highlighting | Platform |
| Audio controls | Sleep timer, speed, lock-screen controls, one audio owner at a time, resume prompt | Audio and audiobook uploads per edition | A finished listening experience for editions and audiobooks | Platform |
| Per-story voice settings | User default voice and speed, with per-book override | Per-user AI connections | A narrator voice remembered per story | Platform |
| Smart lists | Saved rule trees over about 30 fields, evaluated live, shareable | Newest / favourites / living / lived lists; search | User-built shelves such as "unfinished stories in German I contribute to" | Platform |
| Dashboard | Configurable shelves and widgets, loaded in batches | Fixed home page sections | A personal home: continue reading, up next in a Space, my open proposals | Platform |
| Recommendations | Weighted feature hashing plus nearest-neighbour search; no AI model or key needed | None found | "Similar stories" without any paid AI | Platform |
| Achievements | Event-driven, tiered, with rarity; celebration shown once | None found | Recognition for contributors (chapters, accepted proposals, translations, narrations) and for readers | Platform |
| Statistics | Heatmap, streaks, pace, goals, peak hours | One statistics reference found | Reader stats and creator stats (reads, completion rate per chapter) | Platform |
| Sharing insights | Opt-in levels, time-limited viewing, every view logged and visible to the owner | Public profiles, friends, follows | A privacy-respecting way to show reading and writing activity on profiles | Platform |
| Permissions | About 30 named capabilities; dependencies enforced when granted | 8 roles plus per-story and per-space access | Finer control than roles alone, without role explosion | Platform |
| Route authorisation test | One test walks every route and asserts who may call it | Unauthenticated write bugs found twice (chapters, paragraph branches) | That class of bug caught automatically | Platform |
| Audit log | Declarative per-route audit entries, viewable by admins | None found | A record of ownership transfers, approvals, deletions and admin actions | Platform |
| Notifications | Grouped with a count, pushed live | Notifications and messaging exist | Less noise ("12 new proposals on Happy Beings") | Platform |
| Import pipeline | Resumable uploads, drop folder, staged states, rollback on failure, missing-not-deleted | Space import wizard; GitHub and Google Drive sync; pending uploads | Sturdier large imports (the 566-file Veronika case) and safer handling when source files vanish | Platform + apps |
| Completeness score | Weighted score per book, weights adjustable | None found | A "story readiness" score before publishing (cover, description, language, chapters published) | Platform |
| Series order | "Up next in series" computed per reader | Space plays the series role | "Next book in this Space" for readers of multi-book Spaces | Platform |
| E-reader delivery | OPDS catalog, Kobo and KOReader sync, send-to-Kindle | EPUB import/export in the desktop app | Published stories readable on e-readers and reading apps | Platform |
| Localization workflow | English edited in code; other languages written only by Crowdin; plural rules checked automatically | Seed JSON for RU/DE; 8 desktop languages by hand | Community translation at scale and fewer broken plurals | Platform + apps |
| What's New | Release highlights shown in-app, only up to the installed version | None found | Users see what changed after each deploy; useful for the desktop app too | Platform + apps |

## Suggested order

1. **Route authorisation test and audit log.** They address a problem Crowdly has already had twice.
2. **Reading position and sessions.** The dashboard, statistics, automatic status and achievements all depend on them.
3. **Block-aligned TTS and audio controls.** They build directly on the editions and read-along work finished on 2026-09-22.
4. **Text re-anchoring.** It protects branches and comments as chapters change, which matters more as co-creation grows.

The rest (smart lists, recommendations, achievements, e-reader delivery, completeness score) are additive and can follow in any order.

## Where to look in BookOrbit

For whoever picks up one of these, the places that explain each mechanism best:

| Mechanism | BookOrbit location |
| --- | --- |
| Per-user reading tables (progress, sessions, attempts, highlights, bookmarks) | `server/src/db/schema/reader.ts` |
| Session timing in the browser | `client/src/features/reader/shared/composables/useReadingSession.ts` |
| Session save, caps and events | `server/src/modules/reading-session/` |
| Status from progress, rereads | `server/src/modules/user-book-status/` |
| Highlight sync and versions | `server/src/modules/annotation/annotation-sync.service.ts` |
| Text-verified position conversion | `server/src/modules/position-converter/position-converter.core.ts` |
| TTS block splitting and caching | `server/src/modules/tts/` |
| TTS playback scheduling | `client/src/features/tts/composables/useTtsPlayer.ts` |
| Read-along | `server/src/modules/reader/epub/epub-media-overlay.ts`, `client/src/features/reader/media-overlay/` |
| Rule fields and operators for smart lists | `packages/types/src/query.ts`, `server/src/modules/smart-scope/` |
| Recommendations | `server/src/modules/embedding/`, `server/src/modules/recommendation/` |
| Achievements | `server/src/modules/achievement/` |
| Dashboard shelves and widget formulas | `packages/types/src/dashboard.ts`, `server/src/modules/dashboard/dashboard-widget.calculations.ts` |
| Shared insights and consent | `server/src/modules/shared-reading-insights/` |
| Permissions and guards | `packages/types/src/permissions.ts`, `server/src/common/guards/`, `server/src/common/decorators/` |
| Route authorisation test | `server/test/authorization-matrix.e2e-spec.ts` |
| Scanner, drop folder, uploads | `server/src/modules/scanner/`, `book-dock/`, `upload/` |
| Completeness score | `packages/types/src/metadata-score.ts` |
| Localization workflow | `docs/LOCALIZATION.md` |
