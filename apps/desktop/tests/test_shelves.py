"""Discovery: rule editor, My Library (shelves sidebar), Browse and covers."""

import zipfile

from PySide6.QtCore import QSize


UNREAD_RULES = {"match": "all", "rules": [{"field": "progress", "op": "is", "value": "unread"}]}


def _store(tmp_path, library):
    from editor.library.shelf_store import LocalShelfStore

    return LocalShelfStore(tmp_path / "shelves.json", library)


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
    library.ensure_story("s1", "A story")

    store = _store(tmp_path, library)
    summer = store.create_shelf("Summer")["id"]
    store.add_to_shelf(summer, "story", "s1", title="A story")
    store.create_shelf("Unread", kind="smart", rules=UNREAD_RULES, sort="title")
    store.set_story_status("story", "s1", title="A story", favorite=True)

    page = LibraryPage(library, _covers(tmp_path), store)
    page.refresh("local:books")
    texts = [page.sidebar.item(i).text() for i in range(page.sidebar.count())]
    assert "THIS COMPUTER" in texts and "MY SHELVES" in texts
    # All books = every library item (imported books and Crowdly stories).
    assert "All books  (2)" in texts and "Continue reading  (1)" in texts
    assert "Favorites  (1)" in texts and "Summer  (1)" in texts and "⚙ Unread  (1)" in texts
    assert sorted(i["title"] for i in page.view.items()) == ["A story", "Moby"]

    page.select(summer)
    assert [i["title"] for i in page.view.items()] == ["A story"]
    assert page.view.reorder_enabled
    assert page.current_shelf_is_manual()

    page.select("local:books")
    page.set_filter("nothing like this")
    assert page.view.items() == []
    page.set_filter("mob")
    assert [i["title"] for i in page.view.items()] == ["Moby"]


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


def test_add_to_shelf_menu_reflects_membership(qapp, tmp_path):
    from editor.library.store import LocalLibrary
    from editor.ui.discovery.shelves_page import AddToShelfMenu

    library = LocalLibrary(tmp_path / "lib")
    store = _store(tmp_path, library)
    summer = store.create_shelf("Summer")["id"]
    store.add_to_shelf(summer, "story", "s1")
    store.set_story_status("story", "s1", favorite=True)

    menu = AddToShelfMenu(store, "story", "s1")
    menu._load()
    actions = {a.text(): a for a in menu.actions() if a.text()}
    assert actions["Favorite"].isChecked()
    assert not actions["Living"].isChecked()
    assert actions["Summer"].isChecked()

    actions["Summer"].setChecked(False)
    actions["Living"].setChecked(True)
    assert store.membership("story", "s1")["shelves"][0]["contains"] is False
    assert store.membership("story", "s1")["status"]["living"] is True


def test_library_book_goes_on_a_shelf_without_sync(qapp, tmp_path):
    from editor.library.store import LocalLibrary
    from editor.ui.discovery.shelves_page import AddToShelfMenu

    library = LocalLibrary(tmp_path / "lib")
    book = tmp_path / "Book.md"
    book.write_text("# Moby\n", encoding="utf-8")
    item = library.add_file(book)  # never uploaded
    store = _store(tmp_path, library)
    store.create_shelf("Summer")

    menu = AddToShelfMenu(store, "library_item", item.id)
    menu._load()
    actions = {a.text(): a for a in menu.actions() if a.text()}
    actions["Summer"].setChecked(True)
    assert store.membership("library_item", item.id)["shelves"][0]["contains"] is True

    empty = AddToShelfMenu(store, "library_item", None)
    empty._load()
    assert [a.text() for a in empty.actions()] == ["This item can't be put on a shelf."]


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
