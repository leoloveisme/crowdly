"""Main-window glue for branching and comic sync with Crowdly.

The pure logic lives in :mod:`editor.branch_sync`; this module reads and
writes the open document, remembers per-file sync state in xattrs and talks to
:class:`~editor.crowdly_client.CrowdlyClient`. Contract:
``Documentation/branching-api.md``.

Per-file xattrs:
  ``branch_ids``        JSON list of branch / alternative ids seen at the last
                        sync (an id missing from the file later = deleted locally)
  ``comic_id``          the Crowdly comic a `.comic` file syncs with
  ``comic_image_urls``  JSON {local src: uploaded URL}, so images upload once
"""

from __future__ import annotations

import json
import mimetypes
import sys
import urllib.request
from pathlib import Path
from typing import TYPE_CHECKING, Callable

from PySide6.QtWidgets import QInputDialog, QMessageBox, QFileDialog

from .. import branch_sync, file_metadata

if TYPE_CHECKING:  # pragma: no cover
    from ..crowdly_client import CrowdlyClient


def _log(msg: str) -> None:
    print(f"[web-sync][branches] {msg}", file=sys.stderr)


def _json_attr(path: Path, field: str, default):
    try:
        raw = file_metadata.get_attr(path, field)
        return json.loads(raw) if raw else default
    except Exception:
        return default


def _set_json_attr(path: Path, field: str, value) -> None:
    try:
        file_metadata.set_attr(path, field, json.dumps(value))
    except Exception as exc:  # pragma: no cover - filesystem dependent
        _log(f"could not store {field}: {exc}")


def replace_document_text(window, new_text: str) -> None:
    """Put sync results (ids, pulled branches) into the open document and save
    it, keeping the caret. The save's own web sync is skipped once."""

    if new_text == window._document.content:
        return
    editor = window.editor
    try:
        state = editor.get_cursor_state()
    except Exception:
        state = None
    old = editor.blockSignals(True)
    try:
        editor.setPlainText(new_text)
    finally:
        editor.blockSignals(old)
    if state:
        try:
            editor.restore_cursor_state(state)
        except Exception:
            pass
    window._document.content = new_text
    window._document.is_dirty = True
    window._skip_next_web_sync = True
    try:
        window._perform_autosave()
    except Exception as exc:  # pragma: no cover
        _log(f"autosave after sync failed: {exc}")


def _status(window, text: str, ms: int = 5000) -> None:
    bar = window.statusBar()
    if bar is not None:
        bar.showMessage(text, ms)


# ---------------------------------------------------------------------------
# Stories and screenplays
# ---------------------------------------------------------------------------


def sync_story_branches(window, path: Path, story_id: str, client: "CrowdlyClient") -> None:
    """After a story sync: reconcile the file's paragraph branches."""

    if getattr(window._document, "storage_format", "") != "story_v1":
        return
    chapters = sorted(client.fetch_chapters(story_id), key=lambda r: r.get("chapter_index") or 0)
    chapter_ids = [str(r.get("chapter_id")) for r in chapters if r.get("chapter_id")]
    outcome = branch_sync.sync_story_branches(
        window._document.content,
        chapter_ids,
        _json_attr(path, "branch_ids", []),
        lambda entries: client.sync_branches("story", story_id, entries),
    )
    _set_json_attr(path, "branch_ids", outcome.known_ids)
    replace_document_text(window, outcome.text)
    _report_proposed(window, outcome.results)


def sync_screenplay(window, path: Path, screenplay_id: str, client: "CrowdlyClient", remote_updated_at: str | None) -> bool:
    """Sync a `.screenplay` file: content (rows updated in place, ids written
    back), then element branches. Returns False when the content sync was
    refused because the user isn't on the screenplay's team — the caller then
    offers to send the edits as suggestions."""

    from ..crowdly_client import CrowdlyClientError

    title, scenes = branch_sync.screenplay_sync_payload(window._document.content)
    try:
        result = client.sync_desktop_screenplay(
            screenplay_id=screenplay_id, title=title, scenes=scenes, metadata=None, remote_updated_at=remote_updated_at
        )
    except CrowdlyClientError as exc:
        if getattr(exc, "kind", "") == "forbidden":
            return False
        raise
    text = window._document.content
    if isinstance(result, dict) and isinstance(result.get("scenes"), list):
        text = branch_sync.apply_screenplay_ids(text, result["scenes"])
    outcome = branch_sync.sync_screenplay_branches(
        text, _json_attr(path, "branch_ids", []), lambda entries: client.sync_branches("screenplay", screenplay_id, entries)
    )
    _set_json_attr(path, "branch_ids", outcome.known_ids)
    replace_document_text(window, outcome.text)
    _report_proposed(window, outcome.results)
    return True


def offer_screenplay_suggestions(window, screenplay_id: str, client: "CrowdlyClient") -> None:
    """The user can't change this screenplay directly: diff the file with the
    server (by id) and, if they agree, send the differences as suggestions."""

    scenes, blocks = client.get_screenplay_structure(screenplay_id)
    proposals = branch_sync.screenplay_suggestions(
        window._document.content,
        {b.block_id: b.text for b in blocks},
        {s.scene_id: s.slugline for s in scenes},
    )
    _send_suggestions(window, "screenplay", screenplay_id, client, proposals)


def _send_suggestions(window, kind: str, work_id: str, client: "CrowdlyClient", proposals: list[dict]) -> None:
    if not proposals:
        _status(window, window.tr("Only the team can change this work directly; you have no changes to suggest."), 7000)
        return
    answer = QMessageBox.question(
        window,
        window.tr("Suggest changes"),
        window.tr(
            "You're not on this work's team, so your edits can't be synced directly.\n\n"
            "Send your {count} change(s) to the owner as suggestions?"
        ).format(count=len(proposals)),
    )
    if answer != QMessageBox.StandardButton.Yes:
        return
    sent = 0
    for proposal in proposals:
        try:
            client.create_work_proposal(kind, work_id, proposal)
            sent += 1
        except Exception as exc:
            _log(f"proposal failed: {exc}")
    _status(window, window.tr("Sent {count} suggestion(s) to the owner.").format(count=sent), 7000)


def _report_proposed(window, results: list[dict]) -> None:
    proposed = sum(1 for r in results if r.get("status") == "proposed")
    if proposed:
        _status(window, window.tr("{count} branch edit(s) were sent to the owner as suggestions.").format(count=proposed), 7000)


# ---------------------------------------------------------------------------
# Comics
# ---------------------------------------------------------------------------


def _image_uploader(path: Path, comic_id: str, client: "CrowdlyClient") -> Callable[[str], str]:
    """Upload each page image once (local file next to the `.comic`, or a URL)."""

    cache: dict[str, str] = _json_attr(path, "comic_image_urls", {})

    def image_url(src: str) -> str:
        if src in cache:
            return cache[src]
        if src.startswith(("http://", "https://")):
            with urllib.request.urlopen(src, timeout=60) as resp:  # noqa: S310 - user's own page URLs
                content = resp.read()
                mime = resp.headers.get_content_type() or "image/png"
            name = src.rsplit("/", 1)[-1] or "page.png"
        else:
            local = (path.parent / src).resolve()
            content = local.read_bytes()
            mime = mimetypes.guess_type(local.name)[0] or "image/png"
            name = local.name
        url = client.upload_comic_image(comic_id, name, content, mime)
        cache[src] = url
        _set_json_attr(path, "comic_image_urls", cache)
        return url

    return image_url


def sync_comic(window, path: Path, client: "CrowdlyClient") -> None:
    """Sync a `.comic` file with Crowdly: create the comic on first sync,
    upload page images, sync issues / pages / text layers in place, then page
    alternatives. Users outside the team are offered to send text-layer
    changes as suggestions."""

    from ..crowdly_client import CrowdlyClientError

    text = window._document.content
    comic_id = file_metadata.get_attr(path, "comic_id")
    if not comic_id:
        from ..format import comic_markup

        doc = comic_markup.parse_dsl(text)
        comic_id = client.create_comic(doc.get("title") or path.stem, doc.get("direction") or "ltr")
        file_metadata.set_attr(path, "comic_id", comic_id)
    image_url = _image_uploader(path, comic_id, client)
    try:
        result = client.sync_desktop_comic(comic_id, branch_sync.comic_sync_payload(text, image_url))
    except CrowdlyClientError as exc:
        if getattr(exc, "kind", "") != "forbidden":
            raise
        server = client.get_comic(comic_id)
        proposals = branch_sync.comic_suggestions(
            text, {p["page_id"]: p.get("overlays") or [] for p in server.get("pages") or []}
        )
        _send_suggestions(window, "comic", comic_id, client, proposals)
        return
    text = branch_sync.apply_comic_ids(text, result.get("issues") or [])
    outcome = branch_sync.sync_comic_alternatives(
        text,
        _json_attr(path, "branch_ids", []),
        lambda entries: client.sync_branches("comic", comic_id, entries),
        image_url,
    )
    _set_json_attr(path, "branch_ids", outcome.known_ids)
    replace_document_text(window, outcome.text)
    _status(window, window.tr("Comic synced to the web."))


# ---------------------------------------------------------------------------
# Insert menu: branch / text layer / page alternative
# ---------------------------------------------------------------------------


def _insert_after_current_block(window, snippet: str) -> None:
    """Insert *snippet* on its own lines after the block the caret is in."""

    cursor = window.editor.textCursor()
    text = window.editor.toPlainText()
    pos = cursor.position()
    # End of the current block: the next blank line (or the end of the text).
    end = text.find("\n\n", pos)
    end = len(text) if end == -1 else end
    new_text = text[:end] + "\n\n" + snippet + text[end:]
    window.editor.setPlainText(new_text)
    cursor = window.editor.textCursor()
    cursor.setPosition(end + 2 + snippet.find("]") + 1)
    window.editor.setTextCursor(cursor)
    window.editor.setFocus()


def insert_branch(window) -> None:
    """Story paragraph / screenplay element branch after the caret's block."""

    if getattr(window._document, "storage_format", "") not in ("story_v1", "screenplay_v1"):
        QMessageBox.information(
            window, window.tr("Branch"), window.tr("Branches can be added to .story and .screenplay files.")
        )
        return
    name, ok = QInputDialog.getText(window, window.tr("Branch"), window.tr("Branch name (optional):"))
    if not ok:
        return
    attrs = f' name="{name.strip()}"' if name.strip() else ""
    _insert_after_current_block(window, f"[branch{attrs}]{window.tr('Alternative text')}[/branch]")


def insert_text_layer(window) -> None:
    if getattr(window._document, "storage_format", "") != "comic_v1":
        QMessageBox.information(window, window.tr("Text layer"), window.tr("Text layers can be added to .comic files."))
        return
    _insert_after_current_block(window, f"[layer x=50 y=10 style=bubble]{window.tr('Speech bubble text')}[/layer]")


def insert_page_alternative(window) -> None:
    if getattr(window._document, "storage_format", "") != "comic_v1":
        QMessageBox.information(
            window, window.tr("Page alternative"), window.tr("Page alternatives can be added to .comic files.")
        )
        return
    start = str(window._document.path.parent) if window._document.path else ""
    filename, _ = QFileDialog.getOpenFileName(
        window, window.tr("Page alternative"), start, window.tr("Images (*.png *.jpg *.jpeg *.gif *.webp)")
    )
    if not filename:
        return
    src = filename
    if window._document.path:
        try:
            src = str(Path(filename).relative_to(window._document.path.parent))
        except ValueError:
            pass
    name, ok = QInputDialog.getText(window, window.tr("Page alternative"), window.tr("Name (optional):"))
    attrs = f' name="{name.strip()}"' if ok and name.strip() else ""
    _insert_after_current_block(window, f"[alt{attrs}]({src})[/alt]")
