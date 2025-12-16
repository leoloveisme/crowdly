"""Mapping a fetched web story into a local-first document.

The editor is local-first: when a story is opened from the web we immediately
save a local copy in the configured project space.

We also write a small sidecar metadata JSON file next to the document to enable
future features like refresh-from-web.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json

from .crowdly_client import CrowdlyStory
from .document import Document


def suggest_local_path(project_space: Path, story: CrowdlyStory, *, now: datetime | None = None) -> Path:
    """Return the required naming convention path inside *project_space*.

    Naming convention (per spec):
    {story_id}-YYYYMMDD-HHMMSS.md
    """

    now_dt = now or datetime.now()
    timestamp = now_dt.strftime("%Y%m%d-%H%M%S")
    filename = f"{story.id}-{timestamp}.md"
    return project_space / filename


def map_story_to_document(story: CrowdlyStory) -> Document:
    """Create a Document from a CrowdlyStory."""

    # Store body as-is. For Markdown it stays markdown; for HTML it stays HTML.
    return Document(path=None, content=story.body, is_dirty=True)


def metadata_sidecar_path(document_path: Path) -> Path:
    """Return the sidecar metadata filename for a document path."""

    return Path(str(document_path) + ".crowdly.json")


def persist_import_metadata(local_path: Path, story: CrowdlyStory) -> None:
    """Write a .crowdly.json sidecar next to *local_path*."""

    data = {
        "story_id": story.id,
        "source_url": story.source_url,
        "title": story.title,
        "body_format": story.body_format,
        "updated_at": story.updated_at.isoformat() if story.updated_at else None,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }

    sidecar = metadata_sidecar_path(local_path)
    sidecar.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
