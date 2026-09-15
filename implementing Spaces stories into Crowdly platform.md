# Implementing Spaces Stories into the Crowdly Platform

## 1. Executive summary

Right now a Story that lives inside a Creative Space is only reachable if you
already have a direct link, and its visibility rules are completely disconnected
from its Space's rules. The goal is to make Space-hosted stories genuinely
discoverable on Crowdly — with a public "browse Spaces" surface — while making
sure **neither the Space owner's nor the story owner's controls get overridden**.

The core mental model we're adopting: **a Space behaves like a parent folder on
a Unix-like filesystem.** A story's own visibility/publish/clone/export settings
still apply exactly as they do today when the story has no Space. Once a story
is placed inside a Space, the Space becomes the *outer gate* — you have to pass
through the Space's own visibility before the story's own setting is even
consulted. A private Space hides everything inside it, full stop, regardless of
what any individual story inside it says. A public Space still lets each
story's own (potentially more restrictive) setting apply underneath.

## 2. Current state (as of this writing)

### Stories — a rich, story-scoped access model

`story_title` / `stories` (chapters) already have a mature control surface,
implemented in `backend/src/server.js` and surfaced in `src/pages/Story.tsx`:

- `visibility`: `public` / `unlisted` / `private`
- `published`: boolean draft/live flag, separate from visibility
- `clone_policy` / `export_policy`: `anyone` / `restricted` / `none`
- `story_access`: two-tier owner/contributor table, used as the private-story
  gate
- `story_access_rules`: per-user or per-group grants for `view` / `clone` /
  `export`, managed through the `UserGroupPicker` widget
  (`src/modules/user-group-picker.tsx`)
- `story_collaborators`: author/coauthor labels (attribution, not enforced
  permissions)

All of this is enforced in `GET /story-titles/:storyTitleId`
(`backend/src/server.js` ~3129-3297) and exposed via the owner control bar in
`src/pages/Story.tsx` (visibility cycle, publish toggle, clone/export cycle +
picker, transfer ownership, authors/co-authors).

### Creative Spaces — a much thinner model

`creative_spaces` / `creative_space_items` (`backend/src/server.js` ~628-714)
are single-owner only — there is no collaborator/ACL table for Spaces at all.
They do have:

- `visibility`: `private` / `public`
- `published`: boolean

But **`published` is stored and toggled in three separate UIs
(`src/pages/CreativeSpacePage.tsx`, the equivalent in `apps/web/`, and
`Header.tsx`'s Space popup) and never actually checked on any read path.**
Only `visibility` gates access today (`GET /creative-spaces/:spaceId` ~4417,
`GET /creative-spaces/:spaceId/items` ~4681), and the check is just "is owner
OR visibility === 'public'" — binary, with no per-user sharing.

`creative_space_items` is metadata-only: filename, size, mime type, hash — no
content column. Real file bytes live only in the desktop app's local
`.crowdly` project folder. Nothing about item *content* is ever stored
server-side.

### How Stories and Spaces connect today

A story optionally links to a Space via `story_title.creative_space_id`
(primary) and/or the `story_spaces` join table (secondary memberships, e.g.
via clone-to-space or copy-to-space). This is a loose, associative link — a
story is never "converted" from a Space or vice versa.

Crucially, **the two visibility systems don't talk to each other at all.**
None of the discovery feed queries (`GET /stories/newest`, `/most-active`,
`/most-popular`, all in `backend/src/server.js` ~3674-3891) join against
`creative_spaces`. They only check `story_title.visibility = 'public' AND
published = true`. So today, a public story sitting inside a **private**
Space is exactly as visible on the homepage and in `GET /story-titles/:id` as
a story with no Space at all — the Space's privacy is silently ignored.

### No discovery surface for Spaces exists

Searching `src/App.tsx`'s routes and every page under `src/pages/` turns up
no `/spaces`, `/explore`, or similar listing page, and no homepage row
references Spaces. The only way to reach someone else's Space is a direct
link to `/creative_space/:id`, and that only works if the Space happens to be
`public`.

### A pre-existing hardening gap worth flagging

Most story and Space sync/read endpoints (notably
`POST /story-titles/:storyTitleId/sync-desktop`,
`POST /screenplays/:id/sync-desktop`) trust a client-supplied `userId` in the
request body rather than checking a real session. This isn't something this
project introduces, but it matters here: any new "Space gates the story"
enforcement is meaningless if a client can just claim to be the owner in the
request payload. This should be treated as a prerequisite to trust the new
gating logic in production, not a nice-to-have.

## 3. Design principle: Space as parent folder

Effective visibility of a story that belongs to a Space is the **logical AND**
of the Space's gate and the story's own setting — most restrictive wins,
exactly like needing both directory execute permission and file read
permission on a Unix filesystem.

| Space state | Story's own setting | What a regular (non-owner, non-admin) user sees |
|---|---|---|
| Public + published | Public + published | Visible — shows up in the Space's story list and in normal discovery feeds |
| Public + published | Unlisted / Private | Hidden from the Space's public story list and from feeds; reachable only via a direct link if the story's own `story_access`/`story_access_rules` grant that specific user access |
| Private (or unpublished) | *anything, including Public* | Hidden entirely — the story does not appear in the Space's listing (there is no listing to a regular user) and is not independently reachable through the Space |
| No Space (unchanged) | Whatever the story says | Behaves exactly as it does today — no change |

A story owner cannot use their own "Public" setting to escape a Space's
privacy, and a Space being public cannot force a story that its owner marked
Private into visibility. Each owner's restriction is honored; neither owner
can override the other's restriction, only add to it.

### The non-technical-user complexity problem

This AND logic is intuitive to engineers, but a Space owner who isn't
thinking in terms of permission bits can easily set a story to "Public" and
be confused when nobody can see it because the Space is Private. We address
this with UI, not by hiding the model:

- On `src/pages/Story.tsx`'s owner control bar, when a story belongs to a
  Space, show an **effective-visibility indicator** next to the story's own
  visibility toggle — e.g. "Effective: Private (inherited from Space)" — so
  the owner never has to infer the interaction themselves.
- When the story's own setting is more permissive than its Space's effective
  gate, show a plain-language banner: *"This story is set to Public, but it
  lives in the Private Space 'X', so only you can see it right now. Make the
  Space public, or move this story out of it, to change that."* With direct
  links to both actions.
- On the Space's own settings page (`CreativeSpacePage.tsx`), add a short,
  permanent explainer near the visibility toggle: *"A Space works like a
  folder — making it Private hides every story inside it from other users,
  even ones you've individually marked Public."*

This keeps the underlying policy simple and predictable (AND / most
restrictive wins) while surfacing the consequence in the moment it matters,
rather than requiring owners to understand the interaction up front.

## 4. Discovery surface rules

Per the user's explicit direction, discovery is scoped tightly:

- **Only Spaces with `visibility = 'public' AND published = true` are listed
  or browsable at all.** This is the first time `published` will actually be
  enforced for Spaces.
- A public Space's page lists only the stories inside it that **independently
  pass their own visibility/published checks** for the viewer — a public
  Space can absolutely contain private stories, and those stay invisible in
  that Space's story list (and everywhere else) to regular users.
- **A private Space is invisible in full to regular users** — no metadata,
  no story list, nothing. The route should return the same "not found"-style
  response whether the Space doesn't exist or is simply private, so its
  existence isn't leaked by response-shape differences.
- `platform_admin` may be able to see that a private Space *exists* (e.g. for
  moderation tooling). **Whether an admin can actually open and read a
  private Space's content is explicitly left open** — see Section 9. Nothing
  in this design should assume admins get full read access; that's a
  separate decision.

## 5. Scope boundary: Stories, not raw files

This integration is about **Story entities** that belong to a Space, not
Space *items* (arbitrary files/folders). `creative_space_items` has no
server-side content storage — actual bytes only exist on the desktop app's
local filesystem, uploaded via the desktop sync flow. There is currently no
blob storage layer to hold arbitrary published file content server-side.
Publishing raw Space items to the platform would require that infrastructure
decision first, so it's out of scope here. If a Space owner wants a document
to be publicly readable on Crowdly, it needs to exist as a Story (which
*does* have server-stored, versioned content via `stories`/chapter
paragraphs), not as a raw item.

## 6. Backend design

- **A single effective-access resolver**, e.g.
  `getEffectiveStoryAccess(story, space, viewer)`, used everywhere a story is
  read for a non-owner viewer: `GET /story-titles/:storyTitleId` (currently
  ~3129-3297, story-only checks) and the discovery feed queries
  (`/stories/newest`, `/most-active`, `/most-popular`, ~3674-3891), which
  today ignore `creative_space_id` entirely and need to LEFT JOIN
  `creative_spaces` to apply the Space gate before the story's own visibility
  check.
- **Actually enforce `creative_spaces.published`** (today decorative)
  alongside `visibility` as part of the Space gate — this is a behavior
  change for any Space where an owner has already toggled `published` without
  it having had any effect before now (see Section 8, rollout).
- **New endpoints**:
  - `GET /creative-spaces/newest` and `GET /creative-spaces/most-popular` —
    public+published Spaces only, mirroring the existing story-feed query
    shape.
  - `GET /creative-spaces/:spaceId/public-stories` — the list of stories
    inside a Space that pass the AND rule for the requesting viewer.
- **Space-level `clone_policy` / `export_policy`**, new fields on
  `creative_spaces`, combined with a story's own clone/export policy using
  the same AND logic — so a Space owner can restrict cloning/exporting of
  everything inside their Space, without needing to change every individual
  story's own policy.
- **Auth hardening**: move story/Space read and sync-desktop endpoints off
  client-supplied `userId` trust and onto real session-based auth
  (`requireAuth`) wherever `userId` currently doubles as an authorization
  claim, not just an identity label. This is a prerequisite, not a follow-on
  — without it, the new gating logic can be trivially bypassed by a client
  claiming to be the Space or story owner.

## 7. Frontend design

- **New discovery route** (`/spaces` or similar) plus homepage rows
  ("Newest Spaces", "Most Popular Spaces"), following the same pattern as
  the existing story feed rows in `src/pages/Index.tsx` and
  `src/pages/NewestStoriesOutput.tsx`.
- **`src/pages/CreativeSpacePage.tsx`** gains a real public-viewing mode:
  when the viewer isn't the owner, it shows the filtered public-stories list
  (via the new endpoint) instead of the owner's file/folder management view,
  and a private Space renders the same not-found state as a nonexistent one.
- **`src/pages/Story.tsx`**: a "Part of Space: [name]" badge/link, shown only
  when the Space is itself publicly visible to the current viewer (never
  leak a private Space's name to someone who couldn't otherwise see it); plus
  the effective-visibility indicator and conflict banner described in
  Section 3.
- **`src/pages/CreativeSpacePage.tsx`** (owner view): the plain-language
  folder-analogy explainer near the visibility toggle, also described in
  Section 3.
- Note: `CreativeSpacePage.tsx` and `src/modules/creative spaces.tsx` are
  near-duplicated between `apps/web/` and the root `src/` app today — both
  copies will need equivalent updates if the sharing/gating UI changes;
  worth a future consolidation but not part of this document's scope.

## 8. Story creation defaults: making Space-linked stories private at the source

This addresses the concrete question of what happens when a story is
**created** inside a Space from desktop, the standalone web editor, or (in
future) mobile — not just what's shown once it exists.

### What actually happens today

Verified directly in the code: `POST /stories/template`
(`backend/src/server.js` ~3572) is the **single, shared story-creation
endpoint** — the desktop app's `create_desktop_story()`
(`apps/desktop/src/editor/crowdly_client.py` ~306-336) calls it, and it's the
same endpoint the main platform's `NewStoryTemplate` page calls (reached via
the standalone web editor's "New story in this Space" redirect). There is no
per-client creation logic to duplicate — a fix here covers desktop, the web
editor, and any future mobile client for free.

The endpoint does **not** set `visibility` or `published` explicitly on
insert — it relies on the column defaults:

- `story_title.visibility` → `DEFAULT 'public'`
- `story_title.published` → `DEFAULT true`

So **every new story, from every client, is created public and published
today**, whether or not it has a `creativeSpaceId`. There is currently no
privacy-first behavior anywhere in the creation path — this needs to change
for it to match the "a freshly synced Space and everything in it starts
private" model.

A second, separate gap: `create_desktop_story()` doesn't currently send
`creativeSpaceId` in its payload at all, even though the endpoint accepts
one. That means a story created from the desktop app today isn't actually
linked to its Space at creation time through this call path — the linkage
would have to happen some other way (e.g. adopted later on a
`sync-desktop` call that does pass `creativeSpaceId`/`spaceId`, per the
existing "adopt on first sync if not already set" logic). This should be
fixed as part of the same change: the desktop app needs to pass the active
project Space's id when it creates a story, not leave the link to be
adopted implicitly on a later sync.

### Decision: scope of the private-by-default rule

Scoped to Space-linked stories only, not a platform-wide default change:

- `POST /stories/template` will explicitly set `visibility='private',
  published=false` **only when a `creativeSpaceId` is present in the
  request**. Story creation with no `creativeSpaceId` (i.e. directly on the
  main platform, no Space involved) keeps today's public-by-default
  behavior — changing that would be a materially bigger, separate UX
  decision affecting the existing "publish immediately" flow that isn't
  part of this integration.
- `sync-desktop`'s existing "adopt `creativeSpaceId`/`spaceId` only if not
  already set" logic is unaffected — it already never touches
  `visibility`/`published`, so once creation is fixed to default private for
  Space-linked stories, later syncs stay consistent with that.
- Net effect: **sync itself never publishes anything.** Publishing is always
  a distinct, explicit, owner-initiated action taken afterward (via the
  wizard or batch UI in Section 9) — creation/sync only ever produces
  private, unpublished content when it's Space-linked.

## 9. Helping owners decide what to publish: wizard + batch UI

Once creation defaults to private, a Space that just did its first (or a
large) sync can end up with many stories the owner now has to individually
decide about. Two complementary mechanisms are recommended together, since
they serve different moments:

### A. Guided "Review & Publish" wizard — first encounter / onboarding

- Triggered contextually rather than always-on: when an owner opens a Space
  that has unreviewed private stories (freshly synced, never acted on), show
  a banner — *"This Space has N private stories from your last sync. Review
  them now?"*
- Step 0 asks about the Space itself first, since it's the outer gate:
  "Make the Space 'X' public?" — with the consequence stated plainly ("Making
  the Space public doesn't publish any of its stories automatically — you
  still choose per story next.").
- Then walks through the stories (as a short list or one-at-a-time), each
  with a simple Public/Private choice and a "decide later" skip. A one-click
  "Make everything public" / "Leave everything private for now" shortcut
  covers the common cases without forcing a decision per item.
- This is the mechanism aimed at non-technical owners — it teaches the
  Space-gate model experientially instead of requiring the owner to
  discover and understand it from a settings toggle.
- New stories that arrive on later syncs should re-trigger the same banner
  (scoped to just the new, still-unreviewed stories) rather than silently
  sitting private with no prompt back to the owner.

### B. Batch checkbox UI — ongoing management

- On the Space owner's management page (`src/pages/CreativeSpacePage.tsx`),
  the story list gains multi-select checkboxes and a bulk-actions toolbar:
  "Make Public" / "Make Private" / "Publish" / "Unpublish" applied to the
  current selection in one call.
- New backend endpoint, e.g. `PATCH /creative-spaces/:spaceId/stories/visibility`,
  taking `{ storyTitleIds: [...], visibility, published }`, owner-authenticated,
  and constrained to stories that actually belong to that Space (via
  `creative_space_id`/`story_spaces`) to prevent using it to touch unrelated
  stories.
- This is the fast path for a returning owner who just wants to publish a
  batch of 20 newly synced stories at once, without stepping through a
  wizard.

The wizard and the batch UI can share the same underlying batch-update
endpoint — the wizard is effectively a guided front-end over the same
action, not a separate mechanism underneath.

## 10. Rollout considerations

- Because `published` on Spaces has never been enforced, some existing
  Spaces likely have `published` values that owners set without consequence
  (or never touched, sitting at whatever the default is). Turning on
  enforcement changes real behavior for those Spaces immediately. Recommend
  an audit/dry-run pass before enabling the new gate in production — report
  which existing public Spaces would newly show/hide content, so surprises
  are caught before owners are, rather than after.
- Changing `POST /stories/template`'s defaults only affects **newly
  created** Space-linked stories going forward — it does not retroactively
  change the visibility of stories that were already created public inside
  a Space under the old behavior. Those existing stories should be called
  out in the same audit pass above (e.g. "N stories in your Spaces are
  currently public under the old default — review them"), surfaced through
  the same wizard/banner mechanism from Section 9 rather than silently
  flipped.

## 11. Explicitly open / deferred questions

These are called out deliberately rather than resolved here, per the user's
direction:

- **Admin read access to private Spaces**: can `platform_admin` actually open
  and read a private Space's content (for moderation), or only see that it
  exists? This has real privacy implications and should be its own decision.
- **Multi-user collaboration on Spaces**: Spaces are single-owner only today.
  Should they eventually get a collaborator/sharing model mirroring
  `story_collaborators` / `story_access_rules` (reusing the existing
  `UserGroupPicker` pattern)? Not requested as part of this integration, but
  a natural next step if Space co-ownership becomes a need.
- **Publishing raw Space items**: contingent on a future decision to add
  server-side blob storage for file content; out of scope until then.
- **Whether the private-by-default rule should ever extend platform-wide**
  (beyond Space-linked stories) — deliberately deferred; see Section 8.
- **Mobile platform priority and v1 scope** (Android first vs. iOS first;
  consumption-only vs. some creation features) — genuinely a business/
  resourcing decision, not a codebase question; see Section 16.
- **Whether to build mobile on the existing PySide6/Qt desktop codebase**
  (which already has Android/iOS deployment tooling installed) versus a
  fresh native or cross-platform build — a real technical trade-off that
  deserves a short spike before committing; see Section 16.

## 12. Suggested phased roadmap

1. **Phase A** — Enforcement correctness: build the effective-access
   resolver, wire it into the story detail endpoint and discovery feeds,
   start enforcing `published` on Spaces.
2. **Phase B** — Creation defaults: `POST /stories/template` defaults
   Space-linked stories to private+unpublished; fix the desktop client to
   actually pass `creativeSpaceId` on creation.
3. **Phase C** — Story-page UX: the Space badge/link and the
   effective-visibility conflict banner.
4. **Phase D** — Publish workflow: the Review & Publish wizard and the
   batch visibility endpoint/UI on the Space management page.
5. **Phase E** — Discovery surface: `/spaces` route, homepage rows, the
   public-stories listing on a Space's page.
6. **Phase F** — Space-level `clone_policy` / `export_policy` parity.
7. **Phase G** — Auth hardening on the `userId`-trust endpoints (see Section
   13 for the detailed approach; should land before or alongside Phase A in
   practice, given it undermines the new gating otherwise).
8. **Phase H** — Admin visibility into private Spaces, once the open
   question in Section 11 is resolved.
9. **Phase I** — Sync notifications: the `notifications` table/API extension
   and the debounced trigger described in Section 15 (depends on Phase B's
   creation-defaults change being in place first, since it's specifically
   about newly-*created* Space-linked stories).
10. **Phase J** — Mobile, staged per Section 16: consumption-first mobile
    app on the first-chosen platform, reusing Sections 4/6/13's read APIs
    and auth work as-is; creation features and push notifications follow in
    later mobile stages once the platform/scope decisions in Section 11 are
    made.

## 13. Auth hardening deep dive: the `userId`-trust endpoints

### 13.1 The good news: this infrastructure already exists

This isn't a build-from-scratch problem. `backend/src/sessions.js` already
implements a complete, server-verified session layer:

- A DB-backed `sessions` table (`token`, `user_id`, `created_at`,
  `last_used_at`, `expires_at`) with both an absolute TTL (30 days) and an
  idle TTL (7 days).
- `createSession(userId)` / `destroySession(token)`, called from
  `POST /auth/login` and `POST /auth/logout` respectively.
- An `httpOnly`, `sameSite: 'lax'` cookie (`SESSION_COOKIE_NAME =
  'crowdly_session'`), issued via `res.cookie(..., SESSION_COOKIE_OPTIONS)`
  on login.
- A `requireAuth` middleware that reads the cookie, validates the session
  server-side via `getSessionUser`, and attaches the real, verified identity
  as `req.user` — already wired onto `GET /auth/me` and (per the comment at
  the top of `sessions.js` itself) the friends/messages/notifications
  routes: *"every friends/messages/notifications route runs through it
  instead of trusting a body/query userId."*
- CORS is already configured for this: `backend/src/server.js` (~line 44-52)
  sets an explicit origin allowlist with `credentials: true` — the
  precondition for cookies to flow on cross-origin requests from the web
  apps to the API.

**The story/Space endpoints were simply never migrated onto this layer.**
The fix is extension, not invention.

### 13.2 The gap, concretely

Every endpoint this document's design depends on currently authorizes off a
client-supplied `userId` in the query string or JSON body, with no session
check at all:

- Reads with public/private mixed results: `GET /story-titles/:storyTitleId`,
  `GET /creative-spaces/:spaceId`, `GET /creative-spaces/:spaceId/items`.
- Sync/write endpoints: `POST /story-titles/:storyTitleId/sync-desktop`,
  `POST /screenplays/:id/sync-desktop`, `POST /creative-spaces/:spaceId/sync`.
- Ownership/collaboration mutations: `PATCH /story-titles/:storyTitleId/settings`,
  `POST/DELETE .../authors`, `.../coauthors`, `POST .../transfer-ownership`,
  `POST .../clone`, `GET/PUT .../access-rules`.
- Every new endpoint this document proposes: the batch visibility endpoint
  in Section 9, and the Space discovery endpoints in Section 6 — these must
  not repeat the same mistake on day one.

Concretely, today a client can pass `?userId=<anyone's-id>` on
`GET /story-titles/:storyTitleId` and be evaluated as that user for
visibility purposes — i.e. **impersonation for read access is currently
trivial**, and `sync-desktop` doesn't check `story_access` at all before
overwriting content, so it's impersonation for *write* access too.

### 13.3 Two middleware tiers, not one

`requireAuth` (already built) is a hard gate — 401 if there's no valid
session. That's correct for every mutation and ownership-sensitive action
above. But several of the read endpoints must keep working for **anonymous,
logged-out visitors** browsing public content — a hard `requireAuth` there
would break public browsing entirely. These need a second, currently
missing middleware:

- **`optionalAuth`** — same session-cookie lookup as `requireAuth`, but on a
  missing/invalid session it sets `req.user = null` and calls `next()`
  instead of rejecting. Route handlers then branch: anonymous → only public
  content; `req.user` present → apply the owner/contributor/access-rule
  checks using `req.user.id`, never a client-supplied `userId`.

This is a small addition to `sessions.js` (a few lines, reusing
`getSessionUser`) — not new infrastructure, just a softer variant of the
existing one.

### 13.4 What changes in each route

- **Mixed-visibility reads** (`GET /story-titles/:storyTitleId`,
  `GET /creative-spaces/:spaceId`, the new discovery/public-stories
  endpoints): add `optionalAuth`; replace every use of `req.query.userId` as
  an authorization signal with `req.user?.id`. The identity used for "is
  this the owner / a contributor / covered by an access rule" check becomes
  whatever the verified session says, or "anonymous" if there is none —
  never what the client claims in the URL.
- **Sync-desktop** (story and screenplay): add `requireAuth`; before doing
  the destructive replace/diff-merge, check that `req.user.id` actually has
  write access to the target (owner or contributor in `story_access` /
  `screenplay_access`) — a check that doesn't exist at all today. Continue
  to accept `userId` in the payload only as informational, never as the
  authorization identity.
- **Ownership/collaboration mutations** (`transfer-ownership`, `authors`,
  `coauthors`, `access-rules`, `settings`): add `requireAuth`; the "is the
  caller the owner" check switches from `requestingUserId === creator_id`
  (client-supplied) to `req.user.id === creator_id` (session-verified).
- **New endpoints from this document** (batch visibility, Space discovery,
  Space-level clone/export policy): designed with `requireAuth`/`optionalAuth`
  and `req.user.id` from the start — no `userId`-trust pattern introduced in
  new code.

### 13.5 Per-client migration — this is where the real work is

Checked each client's actual current behavior:

- **Root web platform (`src/`)**: mostly ready. `src/contexts/AuthContext.tsx`
  already calls `/auth/login`, `/auth/me`, `/auth/logout` with
  `credentials: "include"`, so the session cookie is already being set and
  sent correctly for this app. Remaining work is an audit of individual
  pages (`Story.tsx`, `CreativeSpacePage.tsx`, etc.) that still pass
  `?userId=` explicitly — those calls can keep sending it for now (harmless
  once the backend stops trusting it, see 13.6) but should stop being relied
  upon, and can be cleaned up opportunistically.
- **Standalone web editor (`apps/web/`)**: not ready today —
  its own fetch calls (e.g. `apps/web/src/CreativeSpacePage.tsx`) don't set
  `credentials: 'include'` anywhere in the app. The fix is mechanical (add
  the flag to its fetch calls), and notably **doesn't require a separate
  login flow in `apps/web` itself** — because the session cookie is scoped
  to the backend's origin (not the calling frontend's origin), a user who
  already logged in once via the main platform in the same browser will
  already have a valid cookie that `apps/web`'s fetches can pick up and send,
  once `credentials: 'include'` is added, as long as the backend's CORS
  allowlist includes `apps/web`'s origin (it already supports an explicit
  allowlist, so this is a config check, not new plumbing).
- **Desktop app (`apps/desktop/`)**: the real work is here.
  `crowdly_client.py`'s `login()` currently only reads `data["id"]` out of
  the `/auth/login` JSON body and remembers it as a plain string to embed as
  `?userId=` on later requests — it never captures the `Set-Cookie` header
  at all, and its request calls use raw `urllib.request`, which doesn't
  manage cookies automatically the way a browser does. This needs an actual
  code change: capture the session cookie from the login response (e.g. via
  `http.cookiejar.CookieJar` + `urllib.request.HTTPCookieProcessor`, or by
  parsing `Set-Cookie` manually and attaching a `Cookie` header on every
  subsequent request the client makes) and persist it for the session's
  lifetime, the same way a browser would.

### 13.6 Rollout: don't break clients while closing the hole

Migrate in two steps rather than flipping a switch:

1. Add `optionalAuth`/`requireAuth` to each route and switch the
   *authorization decision* to `req.user?.id`, while still accepting a
   `userId` param in the request for backward compatibility — just ignore it
   for anything security-relevant. Log (low-volume, server-side) any request
   where a supplied `userId` disagrees with the authenticated session's
   user — that's a strong signal of either a stale, not-yet-migrated client
   or an actual spoofing attempt, and gives visibility before removing the
   parameter outright.
2. Once all three clients are confirmed migrated (root app already is;
   `apps/web` and desktop per 13.5), drop the `userId` param from these
   routes entirely in a follow-up cleanup pass.

This closes the actual vulnerability at step 1 (the parameter stops being
trusted) without requiring every client to ship in lockstep before anything
ships at all.

## 14. Relationship to the lineage-graph / versioning vision

`vision for highly active story projects on Crowdly.md` sketches a
git-style lineage graph over Crowdly's existing CRDT/revision tables
(`crdt_documents`/`crdt_changes`, `chapter_revisions`, `paragraph_branches`)
with its own CRUD toolkit (copy/clone/merge/delete/update). Two direct
dependencies on this document worth keeping in view so the two efforts don't
diverge:

- That vision document scopes its graph **per-Space** as the top grouping
  level (its own open question: *"Should the graph be scoped per-story/
  screenplay, or per-Space?"*) and explicitly assumes per-Space. If that
  holds, a Space's lineage graph must respect exactly the same visibility
  rules as its story list here: a private Space's graph is just as invisible
  to non-owners as everything else in Section 4, and a public Space's graph
  should only render nodes belonging to stories that individually pass the
  AND rule in Section 3 — node-level filtering within an otherwise-visible
  graph, not just an all-or-nothing Space-level gate.
- The vision document's proposed `/lineage-graph/...` endpoints (clone,
  merge, delete, update — its Section 1.5) are mutation endpoints gated "per
  the viewer's role via `story_access`/`screenplay_access`" by its own
  design (its Section 2.3). That's precisely the shared
  `getEffectiveStoryAccess` resolver proposed in Section 6 of this document
  — extended with edit/merge/delete predicates rather than reimplemented —
  and those endpoints should be built on `requireAuth` + `req.user.id` from
  Section 13 from day one, exactly like the new endpoints this document
  proposes. One shared authorization module, not two parallel
  implementations maintained separately.
- Nothing here changes how content is versioned — the CRDT/revision tables
  and the graph's read model are untouched. This document only changes *who
  can see or act on* a piece of content and *where it's discoverable*; the
  Story-page UX changes in Section 7 (Space badge, effective-visibility
  banner) sit alongside the existing revisions/branches tabs the vision
  document builds on, not in place of them.

## 15. Notifying owners when new stories sync in

Section 9's wizard/banner only helps once the owner is already looking at
the Space. This section is about the other half: telling them a sync
happened at all, wherever they are on the platform.

### 15.1 Reuse the existing notifications system — don't build a new one

Crowdly already has a complete, generic notification pipeline, built for
the friends/messaging feature (`backend/src/notifications.js`):

- A `notifications` table (`recipient_id`, `type` — currently a CHECK-
  constrained enum of `'friend_request' | 'friend_accept' | 'follow'` —
  `payload jsonb`, `read_at`, `created_at`).
- A single write path, `createNotification(recipientId, type, payload)`,
  that persists the row **and** live-pushes it over Server-Sent Events via
  `pushEventToUser()` (`backend/src/events.js`) if the recipient is
  currently connected — the frontend's `LiveUpdatesContext.tsx` already
  holds an `EventSource` connection (`GET /api/events`, `withCredentials:
  true`) that receives these in real time.
- A small REST API — `GET /notifications` (paginated), `GET
  /notifications/unread-count`, `POST /notifications/:id/read`, `POST
  /notifications/read-all` — all already behind `requireAuth`.
- A working bell UI in `src/components/CrowdlyHeader.tsx`, which renders
  notification text per `type` (`notificationText(n)`) and can attach
  type-specific inline actions (it already does this for `friend_request`'s
  accept/decline buttons).

The correct design is to extend this exact system with one new `type`
rather than build anything parallel: widen the CHECK constraint (the same
migration pattern already used when `'follow'` was added — drop and
re-add the constraint, per `notifications.js` ~21-37) to add e.g.
`'space_stories_synced'`, and add one branch to `notificationText()` plus a
"Review now" action linking into the Space's Review & Publish wizard from
Section 9, the same way `friend_request` gets its own accept/decline
branch.

### 15.2 What triggers it, and the batching problem

The trigger point is the creation defaults change from Section 8: whenever
a **new** Space-linked story row is inserted via `POST /stories/template`
(not on ordinary content edits or re-syncs of existing stories — only on
first creation, otherwise every autosave would fire a notification).

The problem: a single desktop sync can create many new stories at once
(e.g. a first sync of a folder with a dozen documents). Firing one
notification per story would spam the owner with a dozen bell entries for
what is, to them, one event ("I just synced my folder"). This needs
coalescing into a single notification per burst, e.g. *"12 new stories
synced into 'My Novel Project' — all private for now. Review & publish."*

Two ways to get there:

- **Server-side debounce, keyed by Space** (simpler, no client changes):
  each new-story creation resets a short per-Space timer (e.g. 30-60
  seconds); when the timer elapses with no further creations for that
  Space, send one `createNotification()` call covering everything created
  since the last notification for that Space. Cheap to implement (in-memory
  timer per space id, since the backend is already a single Node process
  per the note in `events.js` about SSE not yet being scaled across
  instances — the same caveat applies here and should be revisited
  together if the backend ever goes multi-instance).
- **Explicit "sync batch complete" signal from the client** (cleaner,
  bigger lift): the desktop app already knows when its own sync loop
  finishes, so it could call a new endpoint (e.g. `POST
  /creative-spaces/:spaceId/sync-complete`) once at the end, which the
  server turns directly into a single notification. More precise, but
  requires every client (desktop now, web editor and mobile later) to
  remember to call it.

Recommend starting with the server-side debounce — it requires no client
coordination and degrades gracefully (worst case, a slow trickle of
individual creations still gets coalesced reasonably, just not perfectly),
and can be replaced or supplemented by the explicit signal later if it
proves too imprecise in practice.

### 15.3 A slightly unusual case, and why it's still worth doing

Since Spaces are single-owner today (Section 11), the person syncing is
always the Space owner — so this is technically "notify the owner that the
owner just synced." That's still valuable: desktop syncs can happen
unattended or between sessions, the owner may not immediately switch to a
browser to look, and the notification creates a durable, revisitable record
in their notification list even if they miss it in the moment. If Spaces
ever gain collaborators (the open question in Section 11), this same
mechanism extends naturally to notify every collaborator, not just the
person who happened to trigger the sync.

### 15.4 Delivery channels

- **In-app bell** (baseline): reuse-only, as above — ships with Phase I.
- **Mobile push**: once a mobile app exists (Section 16), the same
  `createNotification()` call site is the natural hook for also sending a
  push notification (APNs/FCM) — no new trigger logic, just an additional
  delivery leg fanning out from the same event.
- **Email digest**: plausible future addition for owners who are rarely
  online (e.g. a daily "N new stories synced across your Spaces" summary),
  but there's no existing email-sending infrastructure in this codebase to
  confirm or build on — flagged as a possible future channel, not assumed
  or scoped here.

## 16. Mobile apps (Android & iOS): staged rollout

Crowdly will also ship native Android and iOS apps, in addition to the four
apps already listed in `CLAUDE.md`. This section is about *how to stage
that* — what ships first and in what order — not a final decision, since
platform priority and initial scope are genuinely product/business calls.

### 16.1 Why this belongs in this document

Two direct dependencies on work already described here:

- **Creation/sync**: mobile will be a fifth client hitting the same shared
  `POST /stories/template` endpoint from Section 8 — no new backend
  creation logic needed, the private-by-default-for-Space-linked-stories
  behavior already covers it for free, the same way it already covers
  desktop and the web editor.
- **Auth**: mobile is a sixth reason (after root web, the web editor, and
  desktop from Section 13.5) to get the `requireAuth`/`optionalAuth`
  migration right — but native mobile apps are a slightly different shape
  of client than a browser. A native app doesn't have a browser's cookie
  jar or same-origin semantics; the more natural fit for a native client is
  sending the session token as an `Authorization: Bearer <token>` header
  rather than managing an `httpOnly` cookie. Recommend extending
  `requireAuth`/`optionalAuth` (Section 13.3) to accept **either** the
  existing cookie **or** a bearer header carrying the same `sessions.token`
  value — one underlying session mechanism, two transports, so mobile
  doesn't need its own parallel auth system.
- **Notifications**: Section 15.4 already names mobile push as the natural
  second delivery leg off the same `createNotification()` call site once a
  mobile app exists to receive it.

### 16.2 A relevant, easy-to-miss option already sitting in the repo

The desktop app is built on PySide6 (Qt for Python), and the installed
PySide6 distribution in this repo already ships Android and iOS deployment
tooling (`pyside6-android-deploy`, `deploy_lib/android`, and Qt's iOS-style
QML controls are present under `apps/desktop/.venv`). That makes "port the
existing Qt desktop editor to mobile via Qt's own deployment pipeline" a
real, concrete option sitting alongside the more obvious choices of a fresh
native build (Kotlin/Swift) or a cross-platform framework (React Native,
Flutter) — worth a short evaluation spike rather than defaulting to a
ground-up rewrite, though Qt-for-mobile is less battle-tested than either
native or React Native/Flutter for shipping polished, store-approved apps,
and packaging a Python runtime on mobile is a heavier footprint than either
alternative. No existing Swift/Kotlin/React Native/Flutter code exists in
this repo today, so none of the three options has a head start beyond this
one.

### 16.3 Recommended staging

Rather than one big "build the mobile app" effort, stage by capability,
since each stage reuses strictly more of what already exists:

1. **Stage 1 — consumption-first**: browse/discover Spaces and Stories
   (Section 6's discovery endpoints), read a story, in-app notifications
   (Section 15). No editing, no sync. This is the thinnest possible client
   — it needs nothing beyond what this document already specifies on the
   backend, and lines up with Crowdly's Audible/Netflix/YouTube-style
   consumer angle from `CLAUDE.md`, which benefits from mobile reach more
   than the authoring side does at first. Pick a single platform to launch
   first rather than both at once (see 16.4 for the trade-offs — this is
   the first open decision).
2. **Stage 2 — light interaction**: the Section 9 publish decisions
   (review/publish toggles), social actions (comments, follows — reusing
   the same notification system from Section 15), still no content
   creation. Still a thin client against existing APIs.
3. **Stage 3 — full editing parity with desktop**: authoring stories/
   screenplays and managing Space files from a phone/tablet. This is the
   heavy lift, and is where the build-vs-port decision from 16.2 actually
   matters — a thin client won't get you here, so this stage is where the
   platform choice (native, React Native/Flutter, or ported Qt) needs to be
   locked in.
4. **Parallel to any stage once an app exists**: wire up push notifications
   (Section 15.4) and, if useful, offline-first sync for content drafted
   without connectivity — the latter isn't scoped in this document and
   would need its own design pass, flagged here only so it isn't forgotten.

### 16.4 Android vs. iOS first — the trade-offs, not a decision

- **Android first**: faster iteration during development (sideloading,
  internal testing without App Store review gating), generally lower
  up-front account/process overhead to get a build in front of testers.
- **iOS first**: if Crowdly's target/paying audience skews iOS (common for
  some content/subscription platforms), starting there may matter more for
  revenue timing than development speed — this is a market question this
  document can't answer from the codebase.

Left as an open decision (Section 11) rather than resolved here, alongside
the native-vs-ported-Qt-vs-cross-platform choice from 16.2 — both deserve a
short, dedicated evaluation rather than being settled as a side effect of
this brainstorm.
