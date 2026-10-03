"""Story metadata without OS xattrs (macOS, Windows): kept in the sidecar."""

from datetime import datetime

from editor import file_metadata
from editor.crowdly_client import CrowdlyStory
from editor.story_import import persist_import_metadata


def test_metadata_falls_back_to_sidecar(tmp_path, monkeypatch):
    monkeypatch.setattr(file_metadata, "_NATIVE_XATTRS", False)
    doc = tmp_path / "story.md"
    doc.write_text("# Story\n", encoding="utf-8")
    assert file_metadata.get_attr(doc, "story_id") is None
    assert not file_metadata.has_story_metadata(doc)

    story = CrowdlyStory(id="s-1", title="Story", body="# Story\n", body_format="markdown",
                         updated_at=datetime(2026, 10, 3), source_url="http://x/story/s-1", creator_id="u-1")
    persist_import_metadata(doc, story)
    assert file_metadata.has_story_metadata(doc)
    assert file_metadata.get_attr(doc, "story_id") == "s-1"

    assert file_metadata.set_attr(doc, "edit_mode", "suggest")
    assert file_metadata.get_attr(doc, "edit_mode") == "suggest"
    assert file_metadata.remove_attr(doc, "edit_mode")
    assert file_metadata.get_attr(doc, "edit_mode") is None
    assert file_metadata.get_attr(doc, "story_id") == "s-1"
