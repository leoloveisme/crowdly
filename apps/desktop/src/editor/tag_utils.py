"""
Tag parser utility for #tag syntax.
Supports: #simple, #'multi word', #"multi word"
"""

import re

TAG_REGEX = re.compile(r"""#(?:"([^"]+)"|'([^']+)'|([^\s,#]+))""")


def parse_tags(text: str) -> list[str]:
    """Parse a string containing #tag tokens into a list of unique tag strings."""
    if not text:
        return []
    tags: list[str] = []
    for m in TAG_REGEX.finditer(text):
        tag = (m.group(1) or m.group(2) or m.group(3) or "").strip()
        if tag and tag not in tags:
            tags.append(tag)
    return tags


def format_tags(tags: list[str]) -> str:
    """Convert a tag list back to a #-prefixed display string."""
    parts: list[str] = []
    for t in tags:
        if " " in t:
            parts.append(f"#'{t}'")
        else:
            parts.append(f"#{t}")
    return " ".join(parts)
