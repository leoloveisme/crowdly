"""Helpers for the `.comic` format (comics and manga).

A `.comic` file lists a comic's issues and their pages in reading order::

    [comic_title center direction=rtl]Moon Courier[/comic_title]
    [issue]Issue 1[/issue]
    [page alt="Cover"](pages/001.png)[/page]

``direction`` is ``ltr`` (default) or ``rtl`` (manga). Page sources are
paths relative to the file (e.g. a sibling ``pages/`` folder in a Space) or
URLs. Pages before the first ``[issue]`` belong to an implicit "Issue 1".
Same block syntax as `.story`/`.screenplay` (see :mod:`.dsl`) and mirrored in
the web app; see ``Documentation/Crowdly_file_formats_story_screenplay_comic.md``.
"""

from __future__ import annotations

from html import escape

from . import dsl


def parse_dsl(text: str) -> dict:
    """``{"title", "direction", "issues": [{"title", "pages": [{"src", "alt"}]}]}``"""

    title = ""
    direction = "ltr"
    issues: list[dict] = []

    def current() -> dict:
        if not issues:
            issues.append({"title": "Issue 1", "pages": []})
        return issues[-1]

    for b in dsl.parse_blocks(text or ""):
        if b.tag == "comic_title":
            title = b.body.strip()
            direction = "rtl" if b.attrs.get("direction") == "rtl" else "ltr"
        elif b.tag == "issue":
            issues.append({"title": b.body.strip(), "pages": []})
        elif b.tag == "page":
            current()["pages"].append({"src": dsl.image_source(b.body), "alt": b.attrs.get("alt", "")})
        # raw text and unknown tags carry no comic structure; ignored.
    return {"title": title, "direction": direction, "issues": issues}


def dict_to_dsl(doc: dict) -> str:
    attrs = {"align": "center", "direction": doc.get("direction") or "ltr"}
    lines: list[str] = [dsl.block("comic_title", doc.get("title") or "Untitled comic", attrs), ""]
    for issue in doc.get("issues", []):
        lines += [dsl.block("issue", issue.get("title") or ""), ""]
        for page in issue.get("pages") or []:
            lines += [dsl.block("page", f"({page.get('src', '')})", {"alt": page.get("alt", "")}), ""]
    return "\n".join(lines).rstrip() + "\n"


def dsl_to_html(text: str) -> str:
    doc = parse_dsl(text)
    rtl = ' dir="rtl"' if doc["direction"] == "rtl" else ""
    out = [f"<h1 style=\"text-align:center\">{escape(doc['title'])}</h1>"]
    for issue in doc["issues"]:
        out.append(f"<h2>{escape(issue['title'])}</h2>")
        out.append(f"<div class=\"comic-pages\"{rtl}>")
        for i, page in enumerate(issue["pages"], 1):
            alt = escape(page["alt"] or f"Page {i}")
            out.append(f'<figure><img src="{escape(page["src"])}" alt="{alt}" /><figcaption>{i}</figcaption></figure>')
        out.append("</div>")
    return "\n".join(out) + "\n"


def markdown_to_dsl(markdown: str) -> str:
    """Markdown → `.comic`: first heading is the title, ``## …`` headings
    start issues, and every image becomes a page."""

    import re

    title = ""
    issues: list[dict] = []
    for line in (markdown or "").splitlines():
        s = line.strip()
        if s.startswith("# ") and not title:
            title = s[2:].strip()
        elif s.startswith("## "):
            issues.append({"title": s[3:].strip(), "pages": []})
        for m in re.finditer(r"!\[([^\]]*)\]\(([^)\s]+)[^)]*\)", s):
            if not issues:
                issues.append({"title": "Issue 1", "pages": []})
            issues[-1]["pages"].append({"src": m.group(2), "alt": m.group(1)})
    return dict_to_dsl({"title": title or "Untitled comic", "direction": "ltr", "issues": issues})
