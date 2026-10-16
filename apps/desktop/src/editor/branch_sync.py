"""Branch / id sync between `.story`, `.screenplay`, `.comic` files and Crowdly.

Pure text transformations (no Qt, no network) used by the main window's web
sync, so they can be unit-tested. The backend contract is described in
``Documentation/branching-api.md`` and the file syntax in
``Documentation/Crowdly_file_formats_story_screenplay_comic.md#branching``:

* After a content sync the server's ids are written back into the file as
  ``id=`` attributes (scenes, elements, issues, pages), keeping every other
  attribute (alignment, styling) as it was.
* Branches (story paragraph branches, screenplay element branches, comic page
  alternatives) are reconciled with ``POST /…/branches/sync``: entries carry
  their id when they have one, branches whose id disappeared from the file
  since the last sync are sent as deleted, and branches that exist on the
  server but not in the file (someone else's) are inserted after what they
  belong to.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from .format import dsl
from .format.dsl import Block

SCREENPLAY_ELEMENTS = {"action", "character", "dialogue", "parenthetical", "transition", "shot", "general"}
_STORY_STRUCTURE = {"story_title", "chapter_title", "branch"}


@dataclass
class BranchSyncOutcome:
    text: str
    known_ids: list[str] = field(default_factory=list)
    results: list[dict] = field(default_factory=list)


def _with_id(block: Block, value: str | None) -> None:
    if value:
        block.attrs["id"] = str(value)


# ---------------------------------------------------------------------------
# .screenplay content
# ---------------------------------------------------------------------------


def _screenplay_walk(blocks: list[Block]):
    """Yield ``(kind, scene_no, block)`` in sync order: kind is "scene",
    "element" or "branch". Untagged text counts as action, like the parser."""

    scene_no = -1
    for b in blocks:
        if b.tag in ("scene_slugline", "scene_heading"):
            scene_no += 1
            yield "scene", scene_no, b
        elif b.tag == "screenplay_title":
            continue
        elif b.tag == "branch":
            yield "branch", max(scene_no, 0), b
        else:
            if scene_no < 0:
                scene_no = 0  # elements before the first slugline: an implicit first scene
            yield "element", scene_no, b


def screenplay_sync_payload(text: str) -> tuple[str, list[dict]]:
    """``(title, scenes)`` for ``POST /screenplays/:id/sync-desktop``, with the
    ids already in the file (rows are then updated in place on the server)."""

    blocks = dsl.parse_blocks(text or "")
    title = next((b.body.strip() for b in blocks if b.tag == "screenplay_title"), "")
    scenes: list[dict] = []
    for kind, scene_no, b in _screenplay_walk(blocks):
        while len(scenes) <= scene_no:
            scenes.append({"sceneIndex": len(scenes) + 1, "slugline": "", "blocks": []})
        scene = scenes[scene_no]
        if kind == "scene":
            scene["slugline"] = b.body.strip()
            if b.attrs.get("id"):
                scene["sceneId"] = b.attrs["id"]
        elif kind == "element" and b.body.strip():
            entry = {"text": b.body, "blockType": b.tag if b.tag in SCREENPLAY_ELEMENTS else "action"}
            if b.attrs.get("id"):
                entry["blockId"] = b.attrs["id"]
            scene["blocks"].append(entry)
    return title or "Untitled Screenplay", scenes


def apply_screenplay_ids(text: str, response_scenes: list[dict]) -> str:
    """Write the ids the sync returned onto sluglines and elements (in the
    same order the payload listed them). Untagged text becomes ``[action]``
    so it can hold its id."""

    blocks = dsl.parse_blocks(text or "")
    counters: dict[int, int] = {}
    for kind, scene_no, b in _screenplay_walk(blocks):
        if scene_no >= len(response_scenes):
            continue
        scene = response_scenes[scene_no] or {}
        if kind == "scene":
            _with_id(b, scene.get("sceneId"))
        elif kind == "element" and b.body.strip():
            n = counters.get(scene_no, 0)
            counters[scene_no] = n + 1
            rows = scene.get("blocks") or []
            if n < len(rows):
                if b.tag == "raw":
                    b.tag = "action"
                _with_id(b, rows[n].get("blockId"))
    return dsl.serialize(blocks)


# ---------------------------------------------------------------------------
# .comic content
# ---------------------------------------------------------------------------


def _layer_of(b: Block) -> dict:
    def pct(key: str) -> float:
        try:
            return min(100.0, max(0.0, float(b.attrs.get(key, 0))))
        except ValueError:
            return 0.0

    return {"text": b.body, "x": pct("x"), "y": pct("y"), "style": "box" if b.attrs.get("style") == "box" else "bubble"}


def comic_sync_payload(text: str, image_url: Callable[[str], str]) -> dict:
    """``POST /comics/:id/sync-desktop`` body. ``image_url(src)`` returns the
    Crowdly URL of a page image (uploading it first when needed)."""

    blocks = dsl.parse_blocks(text or "")
    title, direction = "", "ltr"
    issues: list[dict] = []
    page: dict | None = None
    in_alt = False
    for b in blocks:
        if b.tag == "comic_title":
            title = b.body.strip()
            direction = "rtl" if b.attrs.get("direction") == "rtl" else "ltr"
        elif b.tag == "issue":
            issue = {"title": b.body.strip(), "pages": []}
            if b.attrs.get("id"):
                issue["issueId"] = b.attrs["id"]
            issues.append(issue)
            page, in_alt = None, False
        elif b.tag == "page":
            if not issues:
                issues.append({"title": "Issue 1", "pages": []})
            page = {"imageUrl": image_url(dsl.image_source(b.body)), "alt": b.attrs.get("alt", ""), "overlays": []}
            if b.attrs.get("id"):
                page["pageId"] = b.attrs["id"]
            issues[-1]["pages"].append(page)
            in_alt = False
        elif b.tag == "alt":
            in_alt = True  # alternatives sync through the branch route
        elif b.tag == "layer" and page is not None and not in_alt:
            page["overlays"].append(_layer_of(b))
    return {"title": title or "Untitled comic", "direction": direction, "issues": issues}


def apply_comic_ids(text: str, response_issues: list[dict]) -> str:
    blocks = dsl.parse_blocks(text or "")
    issue_no, page_no = -1, -1
    for b in blocks:
        if b.tag == "issue":
            issue_no += 1
            page_no = -1
            if issue_no < len(response_issues):
                _with_id(b, response_issues[issue_no].get("issueId"))
        elif b.tag == "page":
            if issue_no < 0:
                issue_no = 0
            page_no += 1
            pages = response_issues[issue_no].get("pages") if issue_no < len(response_issues) else None
            if pages and page_no < len(pages):
                _with_id(b, pages[page_no].get("pageId"))
    return dsl.serialize(blocks)


# ---------------------------------------------------------------------------
# Branches
# ---------------------------------------------------------------------------


def _reconcile(
    blocks: list[Block],
    branch_refs: list[tuple[int, dict]],
    known_ids: list[str],
    send: Callable[[list[dict]], dict],
    insert_missing: Callable[[list[Block], dict], None],
) -> BranchSyncOutcome:
    """Send entries (+ deletions), give created branches their ids, insert the
    server's branches the file doesn't have. ``branch_refs`` pairs each branch
    block's index with its sync entry."""

    present = {entry["id"] for _, entry in branch_refs if entry.get("id")}
    deleted = [i for i in known_ids if i not in present]
    entries = [entry for _, entry in branch_refs] + [{"id": i, "deleted": True} for i in deleted]
    # Always sent: an empty list is a safe "pull" of the server's branches.
    response = send(entries) or {}
    results = response.get("results") or []
    for res in results:
        idx = res.get("index")
        if isinstance(idx, int) and idx < len(branch_refs) and res.get("status") == "created" and res.get("id"):
            blocks[branch_refs[idx][0]].attrs["id"] = str(res["id"])
    in_file = {b.attrs.get("id") for b in blocks if b.attrs.get("id")}
    for server_branch in response.get("branches") or []:
        if server_branch.get("id") and server_branch["id"] not in in_file:
            insert_missing(blocks, server_branch)
    known = sorted({b.attrs["id"] for b in blocks if b.tag in ("branch", "alt") and b.attrs.get("id")})
    return BranchSyncOutcome(text=dsl.serialize(blocks), known_ids=known, results=results)


def sync_story_branches(
    text: str, chapter_ids: list[str], known_ids: list[str], send: Callable[[list[dict]], dict]
) -> BranchSyncOutcome:
    """Paragraph branches of a `.story` file. ``chapter_ids`` are the story's
    chapter ids in order (the story sync matches chapters by position)."""

    blocks = dsl.parse_blocks(text or "")
    refs: list[tuple[int, dict]] = []
    # Where each (chapter, paragraph) ends, to insert pulled branches after it.
    anchors: dict[tuple[int, int], int] = {}
    chapter, paragraph = -1, -1
    for i, b in enumerate(blocks):
        if b.tag == "story_title":
            continue
        if b.tag == "chapter_title":
            chapter, paragraph = chapter + 1, -1
            continue
        if chapter < 0:
            chapter = 0
        if b.tag == "branch":
            if paragraph < 0:
                paragraph = 0
            anchors[(chapter, paragraph)] = i
            if chapter < len(chapter_ids):
                entry = {"chapterId": chapter_ids[chapter], "paragraphIndex": paragraph, "text": b.body, "name": b.attrs.get("name", "")}
                if b.attrs.get("id"):
                    entry["id"] = b.attrs["id"]
                refs.append((i, entry))
        else:
            paragraph += 1
            anchors[(chapter, paragraph)] = i

    def insert(blks: list[Block], br: dict) -> None:
        try:
            ch = chapter_ids.index(br.get("chapterId"))
        except ValueError:
            return
        at = anchors.get((ch, int(br.get("paragraphIndex") or 0)))
        if at is None:
            return
        new = Block("branch", {"name": br.get("name") or "", "id": str(br["id"])}, br.get("text") or "")
        anchor = original[at]
        pos = next(k for k, x in enumerate(blks) if x is anchor) + 1
        while pos < len(blks) and blks[pos].tag == "branch":
            pos += 1
        blks.insert(pos, new)

    original = list(blocks)
    return _reconcile(blocks, refs, known_ids, send, insert)


def sync_screenplay_branches(text: str, known_ids: list[str], send: Callable[[list[dict]], dict]) -> BranchSyncOutcome:
    """Element branches of a `.screenplay` file whose elements already carry
    their Crowdly ids (see :func:`apply_screenplay_ids`)."""

    blocks = dsl.parse_blocks(text or "")
    refs: list[tuple[int, dict]] = []
    last_element: Block | None = None
    for i, b in enumerate(blocks):
        if b.tag in SCREENPLAY_ELEMENTS or b.tag == "raw":
            last_element = b
        elif b.tag in ("scene_slugline", "scene_heading"):
            last_element = None
        elif b.tag == "branch" and last_element is not None and last_element.attrs.get("id"):
            entry = {"blockId": last_element.attrs["id"], "text": b.body, "name": b.attrs.get("name", "")}
            if b.attrs.get("id"):
                entry["id"] = b.attrs["id"]
            refs.append((i, entry))

    def insert(blks: list[Block], br: dict) -> None:
        for pos, el in enumerate(blks):
            if el.tag in SCREENPLAY_ELEMENTS and el.attrs.get("id") == br.get("blockId"):
                pos += 1
                while pos < len(blks) and blks[pos].tag == "branch":
                    pos += 1
                blks.insert(pos, Block("branch", {"name": br.get("name") or "", "id": str(br["id"])}, br.get("text") or ""))
                return

    return _reconcile(blocks, refs, known_ids, send, insert)


def sync_comic_alternatives(
    text: str, known_ids: list[str], send: Callable[[list[dict]], dict], image_url: Callable[[str], str]
) -> BranchSyncOutcome:
    """Page alternatives of a `.comic` file whose pages carry their ids. New
    alternatives' images are uploaded through ``image_url(src)``; layers that
    follow an ``[alt]`` are its overlays."""

    blocks = dsl.parse_blocks(text or "")
    refs: list[tuple[int, dict]] = []
    page: Block | None = None
    current: dict | None = None
    for i, b in enumerate(blocks):
        if b.tag == "page":
            page, current = b, None
        elif b.tag == "issue":
            page, current = None, None
        elif b.tag == "alt" and page is not None and page.attrs.get("id"):
            current = {"pageId": page.attrs["id"], "name": b.attrs.get("name", ""), "overlays": []}
            if b.attrs.get("id"):
                current["id"] = b.attrs["id"]
            else:
                current["imageUrl"] = image_url(dsl.image_source(b.body))
            refs.append((i, current))
        elif b.tag == "layer" and current is not None:
            current["overlays"].append(_layer_of(b))

    def insert(blks: list[Block], br: dict) -> None:
        for pos, el in enumerate(blks):
            if el.tag == "page" and el.attrs.get("id") == br.get("pageId"):
                pos += 1
                while pos < len(blks) and blks[pos].tag in ("layer", "alt"):
                    pos += 1
                new = [Block("alt", {"name": br.get("name") or "", "id": str(br["id"])}, f"({br.get('imageUrl') or ''})")]
                for o in br.get("overlays") or []:
                    new.append(
                        Block(
                            "layer",
                            {"x": str(o.get("x", 0)), "y": str(o.get("y", 0)), "style": o.get("style") or "bubble"},
                            o.get("text") or "",
                        )
                    )
                blks[pos:pos] = new
                return

    return _reconcile(blocks, refs, known_ids, send, insert)


# ---------------------------------------------------------------------------
# Suggestions for works the user can't change directly
# ---------------------------------------------------------------------------


def screenplay_suggestions(text: str, server_blocks: dict[str, str], server_scenes: dict[str, str]) -> list[dict]:
    """Proposals (``POST /screenplays/:id/proposals``) for every element and
    slugline whose text differs from the server's, matched by id."""

    out: list[dict] = []
    for kind, _scene, b in _screenplay_walk(dsl.parse_blocks(text or "")):
        rid = b.attrs.get("id")
        if not rid:
            continue
        if kind == "scene" and rid in server_scenes and b.body.strip() != (server_scenes[rid] or "").strip():
            out.append({"targetType": "scene", "targetSceneId": rid, "proposedText": b.body.strip()})
        elif kind == "element" and rid in server_blocks and b.body.strip() != (server_blocks[rid] or "").strip():
            out.append({"targetType": "block", "targetBlockId": rid, "proposedText": b.body})
    return out


def comic_suggestions(text: str, server_overlays: dict[str, list[dict]]) -> list[dict]:
    """``page_layer`` proposals for pages whose text layers differ from the server's."""

    import json

    out: list[dict] = []
    page_id: str | None = None
    layers: dict[str, list[dict]] = {}
    in_alt = False
    for b in dsl.parse_blocks(text or ""):
        if b.tag == "page":
            page_id = b.attrs.get("id")
            in_alt = False
            if page_id:
                layers.setdefault(page_id, [])
        elif b.tag in ("alt", "issue"):
            in_alt = b.tag == "alt"
        elif b.tag == "layer" and page_id and not in_alt:
            layers[page_id].append(_layer_of(b))
    for pid, mine in layers.items():
        theirs = [
            {"text": o.get("text", ""), "x": float(o.get("x", 0)), "y": float(o.get("y", 0)), "style": o.get("style", "bubble")}
            for o in server_overlays.get(pid, [])
        ]
        if pid in server_overlays and mine != theirs:
            out.append({"targetType": "page_layer", "targetPageId": pid, "proposedText": json.dumps(mine)})
    return out
