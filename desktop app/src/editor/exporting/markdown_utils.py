"""Helpers for rendering Markdown to HTML for export."""

from __future__ import annotations

import markdown
import re


def render_html_from_markdown(text: str) -> str:
    """Render *text* (Markdown) to HTML suitable for export.

    This mirrors the behaviour of :class:`PreviewWidget` by using the same
    ``markdown`` extensions and by stripping hard-coded font sizes that would
    interfere with consistent rendering (especially for PDF export).
    """

    text = text or ""

    html = markdown.markdown(text, extensions=["extra", "sane_lists"])

    # Strip explicit font-size declarations so that consumers can control
    # sizing (e.g. via zoom or page styles) uniformly.
    html = re.sub(
        r"font-size:\s*[^;\"']+;?",
        "",
        html,
        flags=re.IGNORECASE,
    )

    return html
