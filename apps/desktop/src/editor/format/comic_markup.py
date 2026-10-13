"""Helpers for the `.comic` format (comics and manga).

A `.comic` file lists a comic's issues and their pages in reading order::

    [comic_title center direction=rtl]Moon Courier[/comic_title]
    [issue]Issue 1[/issue]
    [page alt="Cover"](pages/001.png)[/page]

``direction`` is ``ltr`` (default) or ``rtl`` (manga). Page sources are
paths relative to the file (e.g. a sibling ``pages/`` folder in a Space) or
URLs. Pages before the first ``[issue]`` belong to an implicit "Issue 1".

Branching (2026-10): after a page,

    [layer x=20 y=15 style=bubble]Who's there?[/layer]   text layer (speech
                                                         bubble / caption box)
    [alt name="Night version"](pages/001b.png)[/alt]     an alternative page

A ``[layer]`` belongs to the page or alternative just before it; an
``[alt]`` belongs to the page just before it. ``id=`` attributes carry the
Crowdly ids of synced issues, pages and alternatives.
Same block syntax as `.story`/`.screenplay` (see :mod:`.dsl`) and mirrored in
the web app; see ``Documentation/Crowdly_file_formats_story_screenplay_comic.md``.
"""

from __future__ import annotations

from html import escape

from . import dsl


def _layer(b) -> dict:
    def pct(key: str) -> float | int:
        try:
            v = float(b.attrs.get(key, 0))
        except ValueError:
            v = 0.0
        v = min(100.0, max(0.0, v))
        return int(v) if v.is_integer() else v

    return {"text": b.body, "x": pct("x"), "y": pct("y"), "style": "box" if b.attrs.get("style") == "box" else "bubble"}


def _layer_block(layer: dict) -> str:
    return dsl.block(
        "layer",
        layer.get("text", ""),
        {"x": str(layer.get("x", 0)), "y": str(layer.get("y", 0)), "style": layer.get("style") or "bubble"},
    )


def parse_dsl(text: str) -> dict:
    """``{"title", "direction", "issues": [{"title", "id"?, "pages": [{"src", "alt", "id"?,
    "layers"?: [{"text", "x", "y", "style"}], "alternatives"?: [{"src", "name", "id"?, "layers"?}]}]}]}``"""

    title = ""
    direction = "ltr"
    issues: list[dict] = []

    def current() -> dict:
        if not issues:
            issues.append({"title": "Issue 1", "pages": []})
        return issues[-1]

    # What a following [layer] attaches to: the last page or alternative.
    layer_target: dict | None = None

    for b in dsl.parse_blocks(text or ""):
        if b.tag == "comic_title":
            title = b.body.strip()
            direction = "rtl" if b.attrs.get("direction") == "rtl" else "ltr"
        elif b.tag == "issue":
            issue = {"title": b.body.strip(), "pages": []}
            if b.attrs.get("id"):
                issue["id"] = b.attrs["id"]
            issues.append(issue)
            layer_target = None
        elif b.tag == "page":
            page = {"src": dsl.image_source(b.body), "alt": b.attrs.get("alt", "")}
            if b.attrs.get("id"):
                page["id"] = b.attrs["id"]
            current()["pages"].append(page)
            layer_target = page
        elif b.tag == "alt":
            pages = current()["pages"]
            if not pages:
                continue
            alt = {"src": dsl.image_source(b.body), "name": b.attrs.get("name", "")}
            if b.attrs.get("id"):
                alt["id"] = b.attrs["id"]
            pages[-1].setdefault("alternatives", []).append(alt)
            layer_target = alt
        elif b.tag == "layer" and layer_target is not None:
            layer_target.setdefault("layers", []).append(_layer(b))
        # raw text and unknown tags carry no comic structure; ignored.
    return {"title": title, "direction": direction, "issues": issues}


def dict_to_dsl(doc: dict) -> str:
    attrs = {"align": "center", "direction": doc.get("direction") or "ltr"}
    lines: list[str] = [dsl.block("comic_title", doc.get("title") or "Untitled comic", attrs), ""]
    for issue in doc.get("issues", []):
        lines += [dsl.block("issue", issue.get("title") or "", {"id": issue.get("id", "")}), ""]
        for page in issue.get("pages") or []:
            lines += [dsl.block("page", f"({page.get('src', '')})", {"alt": page.get("alt", ""), "id": page.get("id", "")}), ""]
            for layer in page.get("layers") or []:
                lines += [_layer_block(layer), ""]
            for alt in page.get("alternatives") or []:
                lines += [dsl.block("alt", f"({alt.get('src', '')})", {"name": alt.get("name", ""), "id": alt.get("id", "")}), ""]
                for layer in alt.get("layers") or []:
                    lines += [_layer_block(layer), ""]
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
            out.append(f'<figure><img src="{escape(page["src"])}" alt="{alt}" /><figcaption>{i}</figcaption>')
            out += _layers_html(page.get("layers"))
            for other in page.get("alternatives") or []:
                label = escape(other.get("name") or "Alternative")
                out.append(f'<aside class="alternative"><img src="{escape(other["src"])}" alt="{label}" /><em>{label}</em>')
                out += _layers_html(other.get("layers"))
                out.append("</aside>")
            out.append("</figure>")
        out.append("</div>")
    return "\n".join(out) + "\n"


def _layers_html(layers) -> list[str]:
    if not layers:
        return []
    items = "".join(f'<li class="{escape(l["style"])}">{escape(l["text"])}</li>' for l in layers)
    return [f'<ul class="layers">{items}</ul>']


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
