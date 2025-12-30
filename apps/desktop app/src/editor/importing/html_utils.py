"""Helpers for working with HTML in the importing pipeline."""

from __future__ import annotations

from html import unescape
import re
from typing import Optional


def html_to_markdown(html: str) -> str:
    """Convert HTML to Markdown for use in the editor.

    The function prefers the third-party ``markdownify`` package when
    available for higher fidelity. If it is not installed, a small
    best-effort fallback implementation is used so that importing still
    works without additional dependencies.
    """

    html = html or ""

    # Preferred path: markdownify, if installed.
    try:  # pragma: no cover - depends on optional library
        from markdownify import markdownify as _markdownify

        return _markdownify(html, heading_style="ATX")
    except Exception:
        pass

    # Fallback: very small, heuristic HTML→Markdown converter.
    text = html

    # Normalise line breaks for some common block-level tags.
    replacements = [
        (r"<\s*br\s*/?>", "\n"),
        (r"<\s*/p\s*>", "\n\n"),
        (r"<\s*/div\s*>", "\n\n"),
        (r"<\s*li[^>]*>", "- "),
        (r"<\s*/li\s*>", "\n"),
    ]
    for pattern, repl in replacements:
        text = re.sub(pattern, repl, text, flags=re.IGNORECASE)

    # Headings: <h1>..<h6> → #, ##, ...
    def _h_repl(match: re.Match) -> str:
        tag = match.group(1)
        level = 1
        try:
            level = int(tag[1])
        except Exception:
            level = 1
        return "\n" + ("#" * max(1, min(level, 6))) + " "

    text = re.sub(r"<\s*(h[1-6])[^>]*>", _h_repl, text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*/h[1-6]\s*>", "\n\n", text, flags=re.IGNORECASE)

    # Links: <a href="url">text</a> → [text](url)
    def _link_repl(match: re.Match) -> str:
        href = match.group(1) or ""
        label = match.group(2) or href
        return f"[{label}]({href})" if href else label

    text = re.sub(
        r"<a[^>]*href=\"([^\"]*)\"[^>]*>(.*?)</a>",
        _link_repl,
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )

    # Strip any remaining tags.
    text = re.sub(r"<[^>]+>", "", text)

    # Unescape HTML entities and normalise whitespace.
    text = unescape(text)
    # Collapse excessive blank lines.
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()
