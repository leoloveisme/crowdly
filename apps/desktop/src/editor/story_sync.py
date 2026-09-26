"""Sync helpers for mapping local document content back to Crowdly backend.

This module is GUI-agnostic: it parses document content into a simple
representation compatible with the Crowdly backend desktop sync endpoint.

Assumptions
-----------
- Imported stories use the generated Markdown format:
  - First line: "# <Story title>"
  - Chapters: lines starting with "## <Chapter title>"
  - Paragraphs: blocks of non-empty lines separated by blank lines.

If the content does not match this structure, we fall back to a single
chapter with paragraphs split by blank lines.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import re


@dataclass(frozen=True)
class ChapterPayload:
    chapterTitle: str
    paragraphs: list[str]


@dataclass(frozen=True)
class StoryPayload:
    title: str
    chapters: list[ChapterPayload]


def _split_paragraphs(lines: list[str]) -> list[str]:
    paras: list[str] = []
    buf: list[str] = []

    def flush() -> None:
        nonlocal buf
        if not buf:
            return
        text = "\n".join(buf).strip()
        buf = []
        if text:
            paras.append(text)

    for line in lines:
        if line.strip() == "":
            flush()
            continue
        buf.append(line.rstrip("\n"))

    flush()
    return paras


def parse_story_from_content(content: str, *, body_format: str | None = None) -> StoryPayload:
    """Parse a story title + chapters/paragraphs from document content."""

    raw = content or ""

    # If it isn't markdown (HTML etc), fall back to very simple splitting.
    if (body_format or "").lower() != "markdown":
        paragraphs = _split_paragraphs(raw.splitlines())
        title = "Untitled"
        return StoryPayload(title=title, chapters=[ChapterPayload(chapterTitle="Chapter", paragraphs=paragraphs)])

    lines = raw.splitlines()

    title = None
    chapters: list[ChapterPayload] = []

    current_chapter_title = None
    current_lines: list[str] = []

    def flush_chapter() -> None:
        nonlocal current_lines, current_chapter_title
        if current_chapter_title is None:
            return
        paras = _split_paragraphs(current_lines)
        chapters.append(
            ChapterPayload(
                chapterTitle=current_chapter_title or "Chapter",
                paragraphs=paras,
            )
        )
        current_lines = []

    for line in lines:
        stripped = line.lstrip()

        # Title: accept both "# Title" and "#Title" (common user style).
        if title is None and stripped.startswith("#") and not stripped.startswith("##"):
            if stripped.startswith("# "):
                t = stripped[2:].strip()
            else:
                # e.g. "#Title" -> "Title"
                t = stripped[1:].strip()
            title = t if t else "Untitled"
            continue

        # Chapters: accept both "## Chapter" and "##Chapter", but only when
        # there are exactly two leading '#'.
        if stripped.startswith("##") and not stripped.startswith("###"):
            # Start a new chapter.
            if current_chapter_title is not None:
                flush_chapter()
            if stripped.startswith("## "):
                hdr = stripped[3:]
            else:
                hdr = stripped[2:]
            current_chapter_title = (hdr or "").strip() or "Chapter"
            continue

        # Body line
        if current_chapter_title is None:
            # Ignore leading whitespace-only lines before the first chapter.
            if not stripped:
                continue
            # We haven't seen a chapter heading; treat as implicit first chapter.
            current_chapter_title = "Chapter"
        current_lines.append(line)

    if current_chapter_title is not None:
        flush_chapter()

    if title is None:
        title = "Untitled"

    if not chapters:
        paragraphs = _split_paragraphs(lines)
        chapters = [ChapterPayload(chapterTitle="Chapter", paragraphs=paragraphs)]

    return StoryPayload(title=title, chapters=chapters)


def parse_screenplay_from_content(content: str) -> StoryPayload:
    """Parse a screenplay into a StoryPayload-like structure.

    This is similar to :func:`parse_story_from_content` but uses **lines** as
    atomic blocks inside scenes instead of multi-line paragraphs. Each
    non-empty line under a scene heading becomes one entry in ``paragraphs``.
    """

    raw = content or ""
    lines = raw.splitlines()

    title = None
    chapters: list[ChapterPayload] = []

    current_chapter_title = None
    current_lines: list[str] = []

    def flush_chapter_lines() -> None:
        nonlocal current_lines, current_chapter_title
        if current_chapter_title is None:
            return
        # Each non-empty line becomes its own "paragraph" entry.
        paras: list[str] = []
        for ln in current_lines:
            txt = ln.rstrip("\n")
            if txt.strip():
                paras.append(txt)
        chapters.append(
            ChapterPayload(
                chapterTitle=current_chapter_title or "Scene",
                paragraphs=paras,
            )
        )
        current_lines = []

    for line in lines:
        stripped = line.lstrip()

        # Title: accept "# Title" / "#Title".
        if title is None and stripped.startswith("#") and not stripped.startswith("##"):
            if stripped.startswith("# "):
                t = stripped[2:].strip()
            else:
                t = stripped[1:].strip()
            title = t if t else "Untitled Screenplay"
            continue

        # Scenes: "## ..." headings.
        if stripped.startswith("##") and not stripped.startswith("###"):
            if current_chapter_title is not None:
                flush_chapter_lines()
            if stripped.startswith("## "):
                hdr = stripped[3:]
            else:
                hdr = stripped[2:]
            hdr = (hdr or "").strip()
            if hdr:
                # Strip repeated "Scene <n>:" prefixes so that the stored
                # slugline is stable even after multiple sync/pull cycles.
                m = re.match(r"^(?:Scene\s+\d+\s*:\s*)*(.*\S.*)$", hdr)
                if m:
                    slug = m.group(1).strip()
                else:
                    slug = hdr
                current_chapter_title = slug or "Scene"
            else:
                current_chapter_title = "Scene"
            continue

        # Body line
        if current_chapter_title is None:
            if not stripped:
                continue
            current_chapter_title = "Scene"
        current_lines.append(line)

    if current_chapter_title is not None:
        flush_chapter_lines()

    if title is None:
        title = "Untitled Screenplay"

    if not chapters:
        # Fallback: treat all non-empty lines as a single scene.
        paras = [ln.rstrip("\n") for ln in lines if ln.strip()]
        chapters = [ChapterPayload(chapterTitle="Scene", paragraphs=paras)]

    return StoryPayload(title=title, chapters=chapters)


def to_json_payload(story: StoryPayload) -> dict[str, Any]:
    return {
        "title": story.title,
        "chapters": [
            {"chapterTitle": ch.chapterTitle, "paragraphs": ch.paragraphs}
            for ch in story.chapters
        ],
    }
