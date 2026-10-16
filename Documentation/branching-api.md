# Branching on Crowdly: API contract for every client

Branching means alternative versions of one piece of a work. It works the same way on the platform (root `src/`), the web app (`apps/web`), the desktop app (`apps/desktop`) and the upcoming Android/iOS apps. Every client talks to the same backend routes listed here. The file syntax for branches lives in [Crowdly_file_formats_story_screenplay_comic.md](Crowdly_file_formats_story_screenplay_comic.md#branching).

| Work | What can branch | Branch holds | Table |
|---|---|---|---|
| Story | a paragraph of a chapter | text (+ name, language) | `paragraph_branches` |
| Screenplay | an element (action, dialogue…) | text (+ name, language) | `screenplay_block_branches` |
| Comic | a page | another image + its own text layers (+ name) | `comic_page_branches` |

Who may do what (the same for every kind):
- **Add a branch:** any signed-in reader who can see the work. On stories, this means anyone allowed to contribute (public story, or on the team).
- **Edit or delete a branch:** its author, the work's owner, or platform staff (`platform_admin`, `editor`). When anyone else edits it, the change is sent to the owner as a **proposal** (stories, screenplays). For comic alternatives it's refused; others add their own alternative instead.

All routes authenticate with the `crowdly_session` cookie (browsers) or `Authorization: Bearer <token>` (native apps; see `docs/mobile-crdt-spec.md` §5). All routes are bare paths, not under `/api`.

## Online clients (platform, web app)

| Action | Story | Screenplay | Comic |
|---|---|---|---|
| List | `GET /stories/:id/branches` | `GET /screenplays/:id/branches` | `GET /comics/:id/branches` |
| Create | `POST /paragraph-branches` `{chapterId, parentParagraphIndex, branchText, branchName?}` | `POST /screenplay-blocks/:blockId/branches` `{text, name?}` | `POST /comic-pages/:pageId/branches` (multipart `image`, `name?`) |
| Update | `PATCH /paragraph-branches/:id` | `PATCH /screenplay-block-branches/:id` `{text?, name?, language?, metadata?}` | `PATCH /comic-page-branches/:id` `{name?, overlays?}` |
| Delete | `DELETE /paragraph-branches/:id` | `DELETE /screenplay-block-branches/:id` | `DELETE /comic-page-branches/:id` |

**Text layers** (speech bubbles and captions on comic pages and alternatives) are `overlays: [{ text, x, y, style }]`. `x` and `y` are percentages of the image (0–100), and `style` is `"bubble"` or `"box"`. Team members set a page's layers with `PATCH /comic-pages/:id {overlays}`.

## Offline clients (desktop app now, mobile apps next)

### Branch sync: one request reconciles a client's branches with the server

```
POST /stories/:id/branches/sync      { branches: [{ id?, chapterId, paragraphIndex, text, name?, language?, deleted? }] }
POST /screenplays/:id/branches/sync  { branches: [{ id?, blockId, text, name?, language?, deleted? }] }
POST /comics/:id/branches/sync       { branches: [{ id?, pageId, imageUrl?, overlays?, name?, deleted? }] }
```

- **No `id`:** the branch is created, authored by the caller. For comics, `imageUrl` must come from `POST /comics/:id/page-images`.
- **With `id`:** the branch is updated if the caller may edit it. Otherwise the result is `proposed` (stories, screenplays) or `forbidden` (comics).
- **`deleted: true`:** removes a branch the caller may edit.
- **Branches the client doesn't mention are never touched.** An empty list is a safe "pull".
- **Response:** `{ results: [{ index, id, status }], branches: [...every branch of the work] }`, where `status` is one of `created | updated | unchanged | proposed | deleted | forbidden | not_found | invalid | skipped`.

Clients should store each branch's `id` (in the file, see the formats doc) and send it back next time.

### Content sync: whole-work push from the desktop

These routes update rows **in place**, matched by the ids each response returns. Branches, proposals, comments, reactions and media attached to scenes, elements, issues and pages survive a sync. Rows missing from the payload are deleted, along with what's attached to them.

```
POST /story-titles/:id/sync-desktop   (chapters, matched by position)
POST /screenplays/:id/sync-desktop    { title, formatType?, remoteUpdatedAt?,
                                        scenes: [{ sceneId?, sceneIndex?, slugline,
                                                   blocks: [{ blockId?, text, blockType? }] }] }
      → { scenes: [{ sceneId, blocks: [{ blockId, blockType, text }] }] }
      (older clients may send scenes[].paragraphs: [text] instead of blocks and no ids;
       they are matched by position)
POST /comics/:id/page-images          (multipart `image`) → { url }
POST /comics/:id/sync-desktop         { title, direction: "ltr"|"rtl",
                                        issues: [{ issueId?, title,
                                                   pages: [{ pageId?, imageUrl, alt?, overlays? }] }] }
      → { issues: [{ issueId, pages: [{ pageId, imageUrl }] }] }
```

Desktop sync is limited to the work's team: the creator, or someone with an access row. Everyone else suggests changes instead.

### How the desktop app uses this (`apps/desktop`)

Reference implementation for the mobile apps: `editor/branch_sync.py` holds the pure logic and has tests in `tests/test_branch_sync.py`; `editor/ui/web_branching.py` holds the window glue.

- **`.screenplay`:** content sync with ids, then element branches.
- **`.story`:** chapters from the `.story` parser, then paragraph branches against the story's chapter ids.
- **`.comic`:** the comic is created on first sync, images are uploaded once, then structure and layers sync in place, then alternatives.
- **Ids go back into the file:** returned ids are written into the file's blocks as `id=` attributes. Per-file xattrs remember:
  - `branch_ids`: ids seen at the last sync, so a removed branch is sent as `deleted`;
  - `comic_id`;
  - `comic_image_urls`.
- **Users outside the team:** when content sync is refused, the file is compared with the server by id, and the differences can be sent as suggestions (`screenplay`: `block`/`scene`; `comic`: `page_layer`).
- **Insert menu:** Branch, Text layer, and Page alternative… add the matching blocks after the caret's block.

## Suggestions (proposals)

| | Story | Screenplay | Comic |
|---|---|---|---|
| Create | `POST /stories/:id/proposals` `{targetType: paragraph \| chapter_title \| branch, targetChapterId?, targetPath?, targetBranchId?, proposedText}` | `POST /screenplays/:id/proposals` `{targetType: screenplay_title \| scene \| block \| block_branch, targetSceneId? \| targetBlockId? \| targetBranchId?, proposedText}` | `POST /comics/:id/proposals` `{targetType: comic_title \| issue \| page_layer, targetIssueId? \| targetPageId?, proposedText}` (`page_layer`: the overlays as a JSON string) |
| List | `GET /stories/:id/proposals?status=` | `GET /screenplays/:id/proposals?status=` | `GET /comics/:id/proposals?status=` |
| Decide (owner/staff) | `POST /proposals/:id/approve` and `POST /proposals/:id/decline` (all kinds) |

## Editions (choose a branch per paragraph / element / page and freeze it)

| | Story | Screenplay | Comic |
|---|---|---|---|
| List / create | `GET`/`POST /stories/:id/editions` | `GET`/`POST /screenplays/:id/editions` | `GET`/`POST /comics/:id/editions` |
| Read / edit / delete | `/stories/editions/:eid` | `/screenplay-editions/:eid` | `/comic-editions/:eid` |
| `selections` | `{chapterId: {paragraphIndex: branchId}}` | `{sceneId: {blockId: branchId}}` | `{issueId: {pageId: branchId}}` |

## Mobile apps (Android, iOS): next step

The mobile apps should follow this document as is:
- Read and write the same file syntax (formats doc, Branching section). Run the shared fixtures in `apps/desktop/tests/fixtures/formats/branching.*` against the mobile parsers.
- Sync offline edits with the content and branch sync routes above, the same way `editor/branch_sync.py` does.
- Use the online routes when connected.

**Sign-in:** native clients log in with `client: "android"` / `"ios"` and send the returned token as `Authorization: Bearer <token>` (see `docs/mobile-crdt-spec.md` §5). The Android app lives in `apps/android`.
