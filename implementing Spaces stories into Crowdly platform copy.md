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

## 8. Rollout considerations

Because `published` on Spaces has never been enforced, some existing Spaces
likely have `published` values that owners set without consequence (or never
touched, sitting at whatever the default is). Turning on enforcement changes
real behavior for those Spaces immediately. Recommend an audit/dry-run pass
before enabling the new gate in production — report which existing public
Spaces would newly show/hide content, so surprises are caught before owners
are, rather than after.

## 9. Explicitly open / deferred questions

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

## 10. Suggested phased roadmap

1. **Phase A** — Enforcement correctness: build the effective-access
   resolver, wire it into the story detail endpoint and discovery feeds,
   start enforcing `published` on Spaces.
2. **Phase B** — Story-page UX: the Space badge/link and the
   effective-visibility conflict banner.
3. **Phase C** — Discovery surface: `/spaces` route, homepage rows, the
   public-stories listing on a Space's page.
4. **Phase D** — Space-level `clone_policy` / `export_policy` parity.
5. **Phase E** — Auth hardening on the `userId`-trust endpoints (should land
   before or alongside Phase A in practice, given it undermines the new
   gating otherwise).
6. **Phase F** — Admin visibility into private Spaces, once the open
   question in Section 9 is resolved.
