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
from . import file_metadata


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


def hydrate_xattrs_from_sidecar(document_path: Path) -> bool:
    """Best-effort: if xattrs are missing but a sidecar exists, create xattrs.

    Returns True if xattrs were written, False otherwise.
    """

    try:
        if file_metadata.has_story_metadata(document_path):
            return False

        sidecar = metadata_sidecar_path(document_path)
        if not sidecar.is_file():
            return False

        raw = json.loads(sidecar.read_text(encoding="utf-8"))
        story_id = raw.get("story_id")
        source_url = raw.get("source_url")
        title = raw.get("title")
        body_format = raw.get("body_format")
        creator_id = raw.get("creator_id")
        remote_updated_at = raw.get("updated_at")

        if not isinstance(story_id, str) or not story_id.strip():
            return False
        if not isinstance(source_url, str) or not source_url.strip():
            return False

        now_human = file_metadata.now_human()

        file_metadata.write_story_metadata(
            document_path,
            file_metadata.StoryMetadata(
                author_id=creator_id if isinstance(creator_id, str) else None,
                initiator_id=creator_id if isinstance(creator_id, str) else None,
                story_id=story_id,
                story_title=title if isinstance(title, str) else None,
                creation_date=now_human,
                change_date=now_human,
                last_sync_date=None,
                source_url=source_url,
                body_format=body_format if isinstance(body_format, str) else None,
                remote_updated_at=remote_updated_at if isinstance(remote_updated_at, str) else None,
            ),
            remove_missing=False,
        )

        return True
    except Exception:
        return False


def persist_import_metadata(local_path: Path, story: CrowdlyStory) -> None:
    """Persist import metadata for a web story.

    We keep the JSON sidecar for backwards compatibility, but we also write the
    metadata into Linux xattrs so that the story association survives renames.
    """

    fetched_at_iso = datetime.now(timezone.utc).isoformat()

    # 1) Backwards-compatible JSON sidecar.
    data = {
        "story_id": story.id,
        "source_url": story.source_url,
        "title": story.title,
        "body_format": story.body_format,
        "updated_at": story.updated_at.isoformat() if story.updated_at else None,
        "fetched_at": fetched_at_iso,
        "creator_id": story.creator_id,
    }

    sidecar = metadata_sidecar_path(local_path)
    sidecar.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    # 2) Primary storage: xattrs.
    now_human = file_metadata.now_human()

    # For now we store creator_id into both author_id and initiator_id.
    # You will later map these via the dedicated backend tables.
    author_id = story.creator_id
    initiator_id = story.creator_id

    file_metadata.write_story_metadata(
        local_path,
        file_metadata.StoryMetadata(
            author_id=author_id,
            initiator_id=initiator_id,
            story_id=story.id,
            story_title=story.title,
            genre=None,
            tags=None,
            creation_date=now_human,
            change_date=now_human,
            last_sync_date=now_human,
            source_url=story.source_url,
            body_format=story.body_format,
            remote_updated_at=story.updated_at.isoformat() if story.updated_at else None,
        ),
        remove_missing=False,
    )
