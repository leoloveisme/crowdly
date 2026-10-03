"""Discovery: rule editor, My Library (shelves sidebar), Browse and covers."""

import time
import zipfile

from PySide6.QtCore import QCoreApplication, QSize


def wait_until(predicate, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        QCoreApplication.processEvents()
        if predicate():
            return True
        time.sleep(0.01)
    return predicate()


SUMMER = "11111111-1111-4111-8111-111111111111"
UNREAD = "22222222-2222-4222-8222-222222222222"


class StubClient:
    def __init__(self):
        self.calls = []

    def list_shelves(self):
        self.calls.append("list")
        return {
            "system": [{"key": k, "count": 1 if k == "favorites" else None} for k in (
                "favorites", "living", "lived", "newest", "most_active", "most_popular")],
            "custom": [
                {"id": SUMMER, "name": "Summer", "kind": "manual", "sort": "manual", "count": 1},
                {"id": UNREAD, "name": "Unread", "kind": "smart", "sort": "title", "count": 0,
                 "rules": {"match": "all", "rules": [{"field": "progress", "op": "is", "value": "unread"}]}},
            ],
        }

    def shelf_items(self, key):
        self.calls.append(("items", key))
        return {"items": [{"type": "story", "id": "s1", "title": "A story", "author": "Leo", "format": "story",
                           "progress": 40, "entry_id": "e1"}]}

    def membership(self, item_type, item_id):
        return {"shelves": [{"id": SUMMER, "name": "Summer", "contains": True}],
                "status": {"favorite": True, "living": False, "lived": False}}

    def add_to_shelf(self, shelf_id, item_type, item_id):
        self.calls.append(("add", shelf_id, item_type, item_id))

    def remove_from_shelf(self, shelf_id, item_id, item_type=None):
        self.calls.append(("remove", shelf_id, item_id, item_type))

    def set_story_status(self, content_type, content_id, **flags):
        self.calls.append(("status", content_type, content_id, flags))
        return {}


def _covers(tmp_path):
    from editor.library.covers import RemoteCoverCache
    from editor.ui.discovery.cards import CoverProvider

    return CoverProvider(RemoteCoverCache(tmp_path / "remote"), lambda: "http://localhost", lambda _c: None)


def test_smart_shelf_dialog_produces_valid_rules(qapp):
    from editor.ui.discovery.smart_shelf_dialog import RULE_FIELDS, SmartShelfDialog

    dialog = SmartShelfDialog(
        name="German, unfinished",
        rules={"match": "any", "rules": [
            {"field": "language", "op": "is", "value": "de"},
            {"field": "progress", "op": "is", "value": "reading"},
            {"field": "read_within_days", "op": "lte", "value": 14},
        ]},
        sort="progress",
    )
    data = dialog.result_data()
    assert data["name"] == "German, unfinished"
    assert data["sort"] == "progress"
    assert data["rules"]["match"] == "any"
    assert [r["field"] for r in data["rules"]["rules"]] == ["language", "progress", "read_within_days"]
    assert data["rules"]["rules"][2]["value"] == 14
    for rule in data["rules"]["rules"]:
        assert rule["op"] == RULE_FIELDS[rule["field"]][0]


def test_library_page_sidebar_and_shelves(qapp, tmp_path):
    from editor.library.store import LocalLibrary
    from editor.ui.discovery.library_page import LibraryPage

    library = LocalLibrary(tmp_path / "lib")
    book = tmp_path / "Book.md"
    book.write_text("# Moby\n\nCall me Ishmael.\n", encoding="utf-8")
    item = library.add_file(book)
    library.update_position(item.id, 30.0, {"text_pos": 3})

    client = StubClient()
    page = LibraryPage(library, _covers(tmp_path), lambda: client, tmp_path / "cache.json")
    page.refresh("local:books")
    assert wait_until(lambda: any(page.sidebar.item(i).text().startswith("Summer") for i in range(page.sidebar.count())))
    texts = [page.sidebar.item(i).text() for i in range(page.sidebar.count())]
    assert "THIS COMPUTER" in texts and "MY SHELVES" in texts
    assert "All books  (1)" in texts and "Continue reading  (1)" in texts
    assert "Favorites  (1)" in texts and "⚙ Unread  (0)" in texts
    assert [i["title"] for i in page.view.items()] == ["Moby"]

    page.select(SUMMER)
    assert wait_until(lambda: page.view.items() and page.view.items()[0]["title"] == "A story")
    assert page.view.reorder_enabled
    assert page.current_shelf_is_manual()

    page.select("local:books")
    page.set_filter("nothing like this")
    assert page.view.items() == []
    page.set_filter("mob")
    assert [i["title"] for i in page.view.items()] == ["Moby"]


def test_library_page_uses_cache_when_offline(qapp, tmp_path):
    from editor.library.store import LocalLibrary
    from editor.ui.discovery.library_page import LibraryPage

    library = LocalLibrary(tmp_path / "lib")
    online = LibraryPage(library, _covers(tmp_path), lambda: StubClient(), tmp_path / "cache.json")
    online.refresh(SUMMER)
    assert wait_until(lambda: len(online.view.items()) == 1 and online._custom)

    class Offline:
        def list_shelves(self):
            raise OSError("no network")

        def shelf_items(self, key):
            raise OSError("no network")

    offline = LibraryPage(library, _covers(tmp_path), lambda: Offline(), tmp_path / "cache.json")
    offline.refresh(SUMMER)
    assert wait_until(lambda: offline._offline)
    assert len(offline.view.items()) == 1
    assert not offline._btn_new.isEnabled()


def test_browse_page_rows_and_grid(qapp, tmp_path):
    from editor.ui.discovery.browse_page import BrowsePage

    page = BrowsePage(_covers(tmp_path))
    page.set_rows({
        "newest": [{"type": "story", "id": "a", "title": "Story of my life", "author": "Leo"},
                   {"type": "story", "id": "b", "title": "Story of my life", "author": "Ann"}],
        "living": [],
    })
    assert page._rows["newest"].isVisibleTo(page)
    assert not page._rows["living"].isVisibleTo(page)
    page.show_row_grid("newest")
    assert page.showing_grid()
    assert [i["author"] for i in page.grid.items()] == ["Leo", "Ann"]
    page.show_rows()
    assert not page.showing_grid()


def test_search_cards_maps_results():
    from editor.ui.discovery.discovery_view import search_cards

    cards = search_cards({"results": [
        {"type": "story", "title": "A", "subtitle": "Ch 1", "url": "/story/x1"},
        {"type": "story", "title": "A", "subtitle": "Ch 2", "url": "/story/x1"},
        {"type": "screenplay", "title": "S", "url": "/screenplay/y1"},
        {"type": "user", "title": "Someone", "url": "/someone"},
    ]})
    assert [(c["type"], c["id"]) for c in cards] == [("story", "x1"), ("screenplay", "y1")]


def test_add_to_shelf_menu_reflects_membership(qapp):
    from editor.ui.discovery.shelves_page import AddToShelfMenu

    client = StubClient()
    menu = AddToShelfMenu(lambda: client, "story", "s1")
    menu.populate(client.membership("story", "s1"))
    actions = {a.text(): a for a in menu.actions() if a.text()}
    assert actions["Favorite"].isChecked()
    assert not actions["Living"].isChecked()
    assert actions["Summer"].isChecked()

    actions["Summer"].setChecked(False)
    actions["Living"].setChecked(True)
    assert wait_until(lambda: len(client.calls) >= 2)
    assert ("remove", SUMMER, "s1", "story") in client.calls
    assert ("status", "story", "s1", {"living": True}) in client.calls


def test_unsynced_library_book_shows_sync_hint(qapp):
    from editor.ui.discovery.shelves_page import AddToShelfMenu

    menu = AddToShelfMenu(lambda: StubClient(), "library_item", None)
    menu._load()
    texts = [a.text() for a in menu.actions()]
    assert texts == ["Turn on Synchronisation with web platform to put library books on shelves"]


def test_covers_extraction_and_placeholder(qapp, tmp_path):
    from PySide6.QtGui import QColor, QImage, QPageSize, QPainter, QPdfWriter

    from editor.library.covers import ensure_cover, image_to_png, placeholder_cover
    from editor.library.store import LocalLibrary

    pixmap = placeholder_cover("Story of my life", "story:a", QSize(120, 180), label="Crowdly")
    assert pixmap.width() == 120 and not pixmap.isNull()
    other = placeholder_cover("Story of my life", "story:b", QSize(120, 180))
    assert pixmap.toImage() != other.toImage()  # same title, different look

    library = LocalLibrary(tmp_path / "lib")
    red = QImage(60, 90, QImage.Format.Format_RGB32)
    red.fill(QColor("red"))
    epub = tmp_path / "Book.epub"
    with zipfile.ZipFile(epub, "w") as zf:
        zf.writestr("mimetype", "application/epub+zip")
        zf.writestr("OEBPS/images/cover.png", image_to_png(red))
    item = library.add_file(epub)
    cover = ensure_cover(library, item)
    assert cover is not None and cover.is_file()
    assert QImage(str(cover)).pixelColor(5, 5) == QColor("red")

    pdf = tmp_path / "Doc.pdf"
    writer = QPdfWriter(str(pdf))
    writer.setPageSize(QPageSize(QPageSize.PageSizeId.A5))
    painter = QPainter(writer)
    painter.drawText(100, 100, "Page one")
    painter.end()
    pdf_item = library.add_file(pdf)
    assert ensure_cover(library, pdf_item) is not None

    audio = tmp_path / "Talk.mp3"
    audio.write_bytes(b"ID3")
    audio_item = library.add_file(audio)
    assert ensure_cover(library, audio_item) is None
    assert audio_item.cover_checked  # not tried again
