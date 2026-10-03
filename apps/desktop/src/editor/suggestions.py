"""Suggestion copies: change someone else's story by suggesting edits.

A reader who isn't the story's owner or an invited collaborator can still
choose "Suggest changes" (Discovery -> "I want to change this story"). The
story then opens in Creation as a *suggestion copy*:

- the local file keeps the story's id (so it is recognised as a Crowdly
  story), but is marked ``edit_mode = "suggest"`` and is never synced
  directly (the backend refuses that anyway);
- the sidecar ``<file>.crowdly.json`` keeps a snapshot of the original
  chapters (chapter id, title, paragraphs as on the server);
- "Send my suggestions" turns the differences into proposals
  (``POST /stories/:id/proposals``) that the owner approves on the web.

``build_proposals`` is pure (no Qt, no network) so it can be tested directly.
"""

from __future__ import annotations

import difflib
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import file_metadata
from .story_import import metadata_sidecar_path
from .story_sync import parse_story_from_content

FIELD_EDIT_MODE = "edit_mode"
EDIT_MODE_SUGGEST = "suggest"
# A private, local-only editable copy of someone else's imported book: never
# synced, uploaded or published (Discovery -> "Change this story").
EDIT_MODE_PRIVATE = "private"


@dataclass
class Proposal:
    target_type: str  # "paragraph" | "chapter_title"
    chapter_id: str
    text: str
    target_path: str | None = None  # paragraph index on the server
    chapter_title: str = ""

    def key(self) -> str:
        digest = hashlib.sha1(self.text.encode("utf-8")).hexdigest()[:16]
        return f"{self.target_type}:{self.chapter_id}:{self.target_path}:{digest}"


@dataclass
class SuggestionPlan:
    proposals: list[Proposal] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)  # changes proposals can't express


# -- marking files -------------------------------------------------------------


def _read_sidecar(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(metadata_sidecar_path(path).read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_sidecar(path: Path, data: dict[str, Any]) -> None:
    metadata_sidecar_path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def mark_suggestion_copy(path: Path, chapters: list[dict[str, Any]]) -> None:
    """Mark *path* as a suggestion copy and remember the original chapters."""

    data = _read_sidecar(path)
    data[FIELD_EDIT_MODE] = EDIT_MODE_SUGGEST
    data["snapshot"] = [
        {
            "chapter_id": c.get("chapter_id"),
            "title": c.get("chapter_title") or "",
            "paragraphs": [p if isinstance(p, str) else "" for p in (c.get("paragraphs") or [])],
        }
        for c in chapters
        if c.get("chapter_id")
    ]
    data.setdefault("sent", [])
    _write_sidecar(path, data)
    file_metadata.set_attr(path, FIELD_EDIT_MODE, EDIT_MODE_SUGGEST)


def edit_mode(path: Path | None) -> str | None:
    """"suggest", "private" or None for an ordinary document."""

    if path is None:
        return None
    try:
        mode = file_metadata.get_attr(path, FIELD_EDIT_MODE)
        if mode:
            return mode
    except Exception:
        pass
    return _read_sidecar(path).get(FIELD_EDIT_MODE)


def is_suggestion_copy(path: Path | None) -> bool:
    return edit_mode(path) == EDIT_MODE_SUGGEST


def mark_private_copy(path: Path, title: str) -> None:
    data = _read_sidecar(path)
    data[FIELD_EDIT_MODE] = EDIT_MODE_PRIVATE
    data["title"] = title
    _write_sidecar(path, data)
    file_metadata.set_attr(path, FIELD_EDIT_MODE, EDIT_MODE_PRIVATE)


def is_private_copy(path: Path | None) -> bool:
    return edit_mode(path) == EDIT_MODE_PRIVATE


def suggestion_state(path: Path) -> tuple[list[dict[str, Any]], set[str]]:
    """The original chapters and the keys of proposals already sent."""

    data = _read_sidecar(path)
    return list(data.get("snapshot") or []), set(data.get("sent") or [])


def record_sent(path: Path, proposals: list[Proposal]) -> None:
    data = _read_sidecar(path)
    sent = list(data.get("sent") or [])
    sent.extend(p.key() for p in proposals if p.key() not in sent)
    data["sent"] = sent
    _write_sidecar(path, data)


# -- diffing -------------------------------------------------------------------


def build_proposals(snapshot: list[dict[str, Any]], content: str, *, already_sent: set[str] | None = None) -> SuggestionPlan:
    """Turn the edited Markdown into proposals against the original chapters.

    Chapters are matched by position. Paragraph changes are aligned with
    difflib: a changed run of paragraphs becomes one proposal at the first
    original paragraph (the approve route splits multi-paragraph text on blank
    lines), the other paragraphs of the run get an empty proposal (= delete),
    and inserted paragraphs join the neighbouring paragraph's proposal.
    """

    plan = SuggestionPlan()
    edited = parse_story_from_content(content, body_format="markdown").chapters
    sent = already_sent or set()

    for index, original in enumerate(snapshot):
        if index >= len(edited):
            plan.skipped.append(f"Removing the chapter \"{original.get('title') or index + 1}\"")
            continue
        chapter_id = original.get("chapter_id")
        if not chapter_id:
            continue
        title = original.get("title") or ""
        new_title = edited[index].chapterTitle
        if new_title.strip() != title.strip() and not (not title.strip() and new_title == "Chapter"):
            plan.proposals.append(Proposal("chapter_title", chapter_id, new_title.strip(), None, title))

        # Server paragraph indexes of the non-empty paragraphs (the reader only
        # ever saw those; empty ones are kept out of the comparison).
        server = [(i, p.strip()) for i, p in enumerate(original.get("paragraphs") or []) if p.strip()]
        before = [text for _i, text in server]
        after = [p.strip() for p in edited[index].paragraphs if p.strip()]
        by_index: dict[int, list[str]] = {}

        def put(server_index: int, texts: list[str]) -> None:
            by_index.setdefault(server_index, []).extend(texts)

        matcher = difflib.SequenceMatcher(a=before, b=after, autojunk=False)
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == "equal":
                continue
            if tag in ("replace", "delete"):
                new_texts = after[j1:j2]
                put(server[i1][0], new_texts)
                for k in range(i1 + 1, i2):
                    by_index.setdefault(server[k][0], [])
            elif tag == "insert":
                inserted = after[j1:j2]
                if i1 > 0:
                    prev = server[i1 - 1][0]
                    if prev not in by_index:
                        by_index[prev] = [before[i1 - 1]]
                    by_index[prev].extend(inserted)
                elif server:
                    first = server[0][0]
                    existing = by_index.get(first)
                    by_index[first] = inserted + (existing if existing is not None else [before[0]])
                else:
                    put(0, inserted)

        for server_index in sorted(by_index):
            text = "\n\n".join(t for t in by_index[server_index] if t)
            plan.proposals.append(Proposal("paragraph", chapter_id, text, str(server_index), title))

    for extra in edited[len(snapshot):]:
        plan.skipped.append(f"Adding the chapter \"{extra.chapterTitle}\"")

    plan.proposals = [p for p in plan.proposals if p.key() not in sent]
    return plan
