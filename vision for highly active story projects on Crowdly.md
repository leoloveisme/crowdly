# Vision for Highly Active Story Projects on Crowdly

## Why this document exists

Picture a novel, screenplay, comic, or manga on Crowdly that has taken off: dozens of contributors,
branching simultaneously from desktop, web, and mobile apps, across text, audio, video, images, and
panel-based art. Right now there is no single place to *see* the shape of that work — how many
branches exist, where they diverged, which ones merged, which are stale, and what to do about any
of it.

This document sketches a visual + structural answer: a **lineage graph** view of a project's CRDT
history, with type-aware previews for every kind of content Crowdly supports, and a CRUD toolkit
(copy, clone, merge, delete, update) that acts directly on that graph.

It's split into two parts — **Part 1** is the underlying concept and data model (grounded in the
tables Crowdly already has), **Part 2** is the visual/interaction design. It's a starting point for
discussion, not a finished spec — feedback and disagreement are the point.

---

## Part 1 — Concept & Data Model

### 1.1 The core idea

Use a **git-style commit graph (DAG)** as the organizing spine — nodes are revisions/branch points,
edges are "derived from" relationships — but instead of a single universal diff view (which doesn't
generalize across text/audio/video/images), each node renders a **type-aware preview** appropriate to
its medium:

- Text (story/screenplay paragraph) → a short excerpt
- Video → a representative frame + timestamp
- Audio → a waveform sliver
- Image → a thumbnail
- Comic/manga panel → the panel thumbnail

The graph gives contributors and admins the *shape* of the work at a glance; the previews let them
recognize *which* branch is which without opening every one.

### 1.2 Mapping onto Crowdly's existing schema

The good news: Crowdly already stores almost everything a lineage graph needs — this is a new way of
*looking at* existing data, not a new data model built from scratch.

| Existing table | Role in the lineage graph |
|---|---|
| `crdt_documents` / `crdt_changes` | The raw change stream — this is the graph's edge list. Each `crdt_changes` row is naturally a graph edge (parent change → this change). |
| `story_title` / `stories` | Node content for story chapters (paragraph arrays). |
| `screenplay_title` / `screenplay_scene` / `screenplay_block` | Node content for screenplay structure. |
| `paragraph_branches` | Existing paragraph-level branch points — already exactly a fork edge in the graph (`parent_paragraph_index` → `branch_text`). |
| `chapter_revisions` / `screenplay_revisions` / `branch_revisions` | Point-in-time snapshots — these become the graph's "revision nodes" directly. |
| `story_access` / `screenplay_access` | Determines which CRUD actions a given viewer is even allowed to see/attempt on a node. |
| `creative_spaces` / `creative_space_items` | The container/grouping level — one "project" in the graph view = one Space (or one story/screenplay within it). |

Media types beyond text (audio/video/images/comics/manga) aren't fully modeled in the current schema
per CLAUDE.md — they'd need their own attachment-style tables (something like `story_attachments`,
which already exists for some binary content) feeding into the same change stream so they can sit in
the same graph as text nodes.

### 1.3 A unified "Lineage Graph" abstraction

Rather than have the UI understand `story` vs `screenplay` vs `audio` schemas directly, introduce one
normalized shape the graph renders against — a thin read-model/API layer, not a new source of truth:

```
GraphNode {
  id                  // change/revision id
  parent_ids: [id]    // usually 1; >1 for merge nodes
  media_kind          // "text" | "video" | "audio" | "image" | "comic_panel" | "manga_panel"
  content_ref         // pointer into the real table (story_title_id + chapter_id, attachment_id, etc.)
  preview_ref         // thumbnail/excerpt/waveform-peaks — precomputed, not rendered live
  author_id
  created_at
  status              // "active" | "merged" | "stale" | "deleted"
  space_id            // which creative space / project this belongs to
}

GraphEdge {
  from_node_id
  to_node_id
  kind                // "branch" | "merge" | "revision"
}
```

`media_kind` + `preview_ref` are the two fields that make heterogeneous content renderable in one
canvas without the graph itself needing to know how to diff a video against a paragraph.

### 1.4 CRUD operations and what they do underneath

| Action | User-facing meaning | Backend mechanics | Edge cases to watch |
|---|---|---|---|
| **Copy** | Duplicate a node's content as a fresh, disconnected item | New row in the content table + new `crdt_documents` root (no parent edge) | Should copying carry over media attachments, or just the text/structure? |
| **Clone** | Fork a node into a new branch that remembers its lineage | New `crdt_changes` row with `parent_id` pointing at the source; new `branch_revisions`/`paragraph_branches` entry | This is really "branch" — naming it "Clone" vs "Branch" vs "Fork" in the UI is worth settling early (see open questions). |
| **Merge** | Combine two or more branches into one | New `crdt_changes` row with multiple `parent_ids`; conflict resolution strategy needed per `media_kind` (text = three-way merge already exists in the desktop app's `_two_way_merge_text`; media types need their own strategy, likely "pick one + keep others as alternates" rather than true merge) | Video/audio/image can't be algorithmically merged like text — the UI needs to be honest about this and offer "keep both, mark one primary" instead of pretending to merge. |
| **Delete** | Remove a branch/revision | Soft-delete (`deleted = true`), matching the existing convention in `creative_space_items` — never a hard delete by default | What happens to child branches of a deleted node? Recommend: node becomes greyed-out "tombstone" in the graph, children keep working from their own copy of the content. |
| **Update** | Edit content in place | New `crdt_changes` row, same node id lineage as any other edit today | No new mechanics — this is just today's existing autosave/versioning, visualized in the graph rather than being a new action. |

### 1.5 Proposed API surface

Following the existing REST conventions in `backend/src/server.js`:

```
GET    /creative-spaces/:spaceId/lineage-graph        // returns nodes + edges for the whole project
GET    /lineage-graph/nodes/:nodeId                   // single node detail + preview_ref
POST   /lineage-graph/nodes/:nodeId/clone              // branch/fork
POST   /lineage-graph/nodes/:nodeId/copy               // disconnected duplicate
POST   /lineage-graph/merge   { node_ids: [...] }      // merge N nodes
PATCH  /lineage-graph/nodes/:nodeId                    // update (delegates to existing per-type update routes)
DELETE /lineage-graph/nodes/:nodeId                    // soft-delete
```

This layer would be a **facade** over the existing per-content-type endpoints (stories, screenplays,
attachments), not a replacement for them — the desktop/web/mobile apps that edit content directly
keep working exactly as they do today.

---

## Part 2 — Visual Design & Interaction

### 2.1 The graph canvas (primary view)

A horizontal or vertical commit-graph layout, time flowing left→right (or top→bottom), branch lines
diverging and converging like a git network graph:

```
 main ─●───●───●───────────●───────────●──▶ (active)
        \           \
         ●───●───●    ●───●──▶ (branch: "darker ending")
              \
               ●───●──▶ (branch: "alt POV — Mara")
                    ╲
                     ●  (merge back into main, pending review)
```

Each `●` is a `GraphNode`, rendered per §2.2. Stale branches (no activity in N days) render dimmed;
merged branches show a small merge-glyph at the join point.

### 2.2 Node anatomy — type-aware previews

Hovering/selecting a node expands it into a small card, whose *content area* depends on `media_kind`:

```
┌─ text ──────────────────┐   ┌─ video ─────────────────┐   ┌─ audio ─────────────────┐
│ "...the door creaked    │   │ ┌──────────────────┐    │   │  ▂▅▇█▆▃▂▁▃▅▇█▆▃▂▁▅▇     │
│  open, and Mara stepped │   │ │   [frame @1:32]   │    │   │   00:00 ───●─── 03:14   │
│  into the dark..."      │   │ └──────────────────┘    │   │                          │
│  — ch. 12, ¶4           │   │  scene_07.mp4  @1:32     │   │  narration_take3.wav     │
└──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘

┌─ image ─────────────────┐   ┌─ comic / manga panel ───┐
│    [thumbnail]          │   │   [panel thumbnail]      │
│  cover_v3.png            │   │  ch03_pg04_panel2.png    │
└──────────────────────────┘   └──────────────────────────┘
```

Every card shares the same footer regardless of type: author avatar, timestamp, and the status glyph
(active / merged / stale / deleted-tombstone).

### 2.3 The contextual action palette

Selecting one node (or multi-selecting several, for merge) surfaces a small floating toolbar rather
than a permanent one — keeps the canvas uncluttered when just browsing:

```
        ┌──────────────────────────────────────────┐
        │  📋 Copy   🌿 Clone   🔀 Merge   ✏️ Update  🗑️ Delete  │
        └──────────────────────────────────────────┘
                          ▲
                          │
                         ●  ← selected node
```

- Single selection: Copy / Clone / Update / Delete all enabled (per the viewer's role via
  `story_access`/`screenplay_access`).
- Multi-selection (2+ nodes): only **Merge** enables; the others grey out, since they don't make
  sense across multiple nodes at once.
- Merge on non-text media opens a lightweight picker ("keep both, mark primary: ○ A ○ B") rather than
  pretending to auto-merge, per §1.4.

### 2.4 The hybrid list view (for bulk operations / scale)

The graph is for *understanding shape*; a filterable table (reusing the pattern already in
`Admin.tsx`'s tabs) is for *bulk action* — e.g. "delete every branch untouched for 90+ days." Clicking
a row highlights the corresponding node in the graph above, and vice versa — the two views stay in
sync rather than being separate destinations.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Branch            Author      Type     Last activity   Status       │
├─────────────────────────────────────────────────────────────────────┤
│  darker ending      @jun_l      text     2 days ago      active   ☐  │
│  alt POV — Mara      @rho        text     91 days ago     stale    ☑  │
│  scene_07 recut     @dana        video    5 hours ago     active   ☐  │
│  ...                                                                  │
├─────────────────────────────────────────────────────────────────────┤
│  [ Merge selected ]   [ Delete selected ]   [ Export selected ]       │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.5 Handling scale: highly active projects with hundreds of branches

This is the scenario the question specifically named, so it deserves its own treatment rather than an
afterthought:

- **Cluster collapsing**: branches with no recent activity auto-collapse into a single "12 stale
  branches" node that expands on click, rather than rendering all 12 permanently.
- **Virtualized rendering**: only nodes within the current viewport + a buffer are actually drawn;
  this is a standard technique (same idea as virtualized lists) applied to a graph canvas.
- **Lazy-loaded previews**: `preview_ref` thumbnails/waveforms load on scroll-into-view, not upfront —
  critical once "hundreds of branches" includes video/audio, which are heavy to thumbnail.
- **Search/filter bar** above the graph: filter by author, media type, date range, or status, which
  re-renders the graph to only that subset — this is likely how most people navigate a truly large
  project day-to-day, with the full unfiltered graph reserved for occasional "big picture" review.

---

## Open questions for reviewers

- Is **"Clone"** the right word for what's really a *branch/fork*? "Branch" may be more intuitive to
  non-technical creators than git-flavored "Clone."
- For non-text media, is "keep both, mark one primary" an acceptable stand-in for "merge," or does it
  need a different name entirely so users don't expect a real merge?
- Should the graph be scoped per-story/screenplay, or per-Space (potentially spanning several
  works)? The data model above assumes per-Space is the top grouping level.
- Where's the line between what shows in the **graph** vs. what only shows in the **list**? (e.g. do
  we want every single autosave tick to be a visible node, or only meaningful checkpoints?)
- What should happen visually to a node's children when their parent is soft-deleted — greyed
  tombstone with children re-parented to "orphaned," or something else?
