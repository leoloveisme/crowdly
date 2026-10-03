"""Desktop v2.0: Discovery/Creation modes, session restore and the library."""

import zipfile
from pathlib import Path

import pytest


@pytest.fixture
def home(tmp_path, monkeypatch):
    """Isolate settings/library under a temporary HOME and a null keyring."""

    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("PYTHON_KEYRING_BACKEND", "keyring.backends.null.Keyring")
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    return tmp_path


def _settings():
    from editor import settings

    return settings.load_settings()


# -- modes -----------------------------------------------------------------------


def test_first_start_mode_defaults_to_creation(home):
    from editor import app_modes

    assert app_modes.first_start_mode() in app_modes.MODES


def test_first_start_mode_reads_bundled_file(home, monkeypatch, tmp_path):
    from editor import app_modes

    bundled = tmp_path / "first_start_mode.txt"
    bundled.write_text("discovery\n", encoding="utf-8")
    monkeypatch.setattr(app_modes, "_candidate_paths", lambda: [bundled])
    assert app_modes.first_start_mode() == "discovery"
    bundled.write_text("nonsense", encoding="utf-8")
    assert app_modes.first_start_mode() == "creation"


def test_window_switches_modes(qapp, home):
    from editor.ui.main_window import MainWindow

    settings = _settings()
    win = MainWindow(settings, mode="creation")
    assert win.mode() == "creation"
    assert "Crowdly Creation" in win.windowTitle()
    assert win._export_menu.menuAction().isVisible()

    win.set_mode("discovery")
    assert win.mode() == "discovery"
    assert "Crowdly Discovery" in win.windowTitle()
    assert not win._export_menu.menuAction().isVisible()
    assert win._action_add_books.isVisible()
    view = win.discovery_view()
    # Alpha: no Crowdly login means the Discovery login gate is shown.
    assert not view.has_access()
    assert view._stack.currentWidget() is view._gate

    win.set_mode("creation")
    assert win._mode_stack.currentWidget() is win._creation_page
    win.close()


def test_window_uses_startup_mode(qapp, home):
    from editor.ui.main_window import MainWindow

    settings = _settings()
    settings.startup_mode = "discovery"
    win = MainWindow(settings)
    assert win.mode() == "discovery"
    win.close()


# -- session ---------------------------------------------------------------------


def test_session_round_trip(qapp, home, tmp_path):
    from PySide6.QtCore import QCoreApplication, QEventLoop, QTimer
    from PySide6.QtGui import QTextCursor

    from editor import session_store
    from editor.ui.main_window import MainWindow

    settings = _settings()
    a = tmp_path / "a.md"
    b = tmp_path / "b.md"
    a.write_text("# A\n\n" + "alpha line\n" * 50, encoding="utf-8")
    b.write_text("# B\n\nbeta text here\n", encoding="utf-8")

    win = MainWindow(settings, mode="creation")
    win._open_paths_from_cli([str(a), str(b)])
    win._tab_widget.setCurrentIndex(0)
    cursor = win.editor.textCursor()
    cursor.setPosition(42)
    win.editor.setTextCursor(cursor)
    win._tab_widget.setTabText(1, "Renamed")
    win._tab_user_renamed.add(1)

    snapshot = session_store.capture_session([win])
    win.close()

    state = snapshot["windows"][0]
    assert [Path(t["path"]).name for t in state["tabs"]] == ["a.md", "b.md"]
    assert state["active_tab"] == 0
    assert state["tabs"][0]["md"]["position"] == 42
    assert state["tabs"][1]["title"] == "Renamed"
    assert state["mode"] == "creation"

    b.unlink()  # a file that vanished between sessions is skipped
    restored = MainWindow(settings, mode="creation")
    missing = session_store.restore_window(restored, state)
    loop = QEventLoop()
    QTimer.singleShot(300, loop.quit)
    loop.exec()
    QCoreApplication.processEvents()

    assert missing == [str(b)]
    assert restored._tab_widget.count() == 1
    assert restored.editor.textCursor().position() == 42
    restored.close()


def test_session_restores_mode(qapp, home):
    from editor import session_store
    from editor.ui.main_window import MainWindow

    settings = _settings()
    win = MainWindow(settings, mode="creation")
    session_store.restore_window(win, {"mode": "discovery", "tabs": []})
    assert win.mode() == "discovery"
    win.close()


def test_legacy_session_keys_are_migrated(home):
    from editor import session_store

    settings = _settings()
    settings.session_open_tabs = ["/x/one.md", "/x/two.md"]
    settings.session_tab_titles = ["", "Two!"]
    settings.session_active_tab = 1
    state = session_store.session_from_settings(settings)
    window = state["windows"][0]
    assert window["active_tab"] == 1
    assert window["tabs"][1] == {"path": "/x/two.md", "title": "Two!"}


def test_closing_extra_window_does_not_overwrite_session(qapp, home):
    from editor.ui.main_window import MainWindow

    settings = _settings()
    settings.session_control = "keep_session"
    settings.session_state = {"version": 2, "windows": [{"mode": "discovery", "tabs": []}]}
    primary = MainWindow(settings, mode="creation")
    extra = MainWindow(settings, mode="creation")
    qapp._main_window = primary
    qapp._extra_windows = [extra]
    primary.show()
    extra.show()
    extra.close()
    assert settings.session_state["windows"][0]["mode"] == "discovery"
    primary.close()
    assert len(settings.session_state["windows"]) == 1
    assert settings.session_state["windows"][0]["mode"] == "creation"
    qapp._main_window = None
    qapp._extra_windows = []
    qapp._crowdly_session_captured = False


# -- library ---------------------------------------------------------------------


def test_library_import_dedupe_and_reading_data(home, tmp_path):
    from editor.library.store import LocalLibrary, LibraryImportError

    book = tmp_path / "My Book.md"
    book.write_text("# The Title\n\nOnce upon a time.\n", encoding="utf-8")
    library = LocalLibrary(tmp_path / "lib")
    item = library.add_file(book)
    assert item.title == "The Title"
    assert item.format == "text"
    assert library.file_path(item) is not None
    assert library.add_file(book).id == item.id  # same file, same item

    library.update_position(item.id, 42.0, {"text_pos": 10})
    library.record_session(item.id, "2026-10-03T10:00:00+00:00", "2026-10-03T10:00:05+00:00", 5)
    library.record_session(item.id, "2026-10-03T10:00:00+00:00", "2026-10-03T10:10:00+00:00", 600)
    h = library.add_highlight(item.id, start=0, end=4, quote="Once")
    library.delete_highlight(item.id, h["id"])

    reloaded = LocalLibrary(tmp_path / "lib").get(item.id)
    assert reloaded.position["percent"] == 42.0
    assert [s["seconds"] for s in reloaded.pending_sessions] == [600]  # <10 s dropped
    assert reloaded.highlights[0]["deleted"] is True  # tombstone until synced

    with pytest.raises(LibraryImportError):
        library.add_file(tmp_path / "missing.epub")


def test_drm_protected_epub_is_refused(home, tmp_path):
    from editor.library.drm import drm_reason
    from editor.library.store import LocalLibrary, LibraryImportError

    protected = tmp_path / "locked.epub"
    with zipfile.ZipFile(protected, "w") as zf:
        zf.writestr("mimetype", "application/epub+zip")
        zf.writestr("META-INF/rights.xml", "<rights/>")
    assert drm_reason(protected)

    fonts_only = tmp_path / "fonts.epub"
    with zipfile.ZipFile(fonts_only, "w") as zf:
        zf.writestr("mimetype", "application/epub+zip")
        zf.writestr(
            "META-INF/encryption.xml",
            '<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/></EncryptedData></encryption>',
        )
    assert drm_reason(fonts_only) is None

    with pytest.raises(LibraryImportError):
        LocalLibrary(tmp_path / "lib").add_file(protected)


def test_reader_reanchors_highlight_by_quote(qapp):
    from editor.ui.discovery.reader_widget import ReaderWidget

    reader = ReaderWidget()
    moved: list = []
    reader.highlightChanged.connect(lambda item, hid, changes: moved.append(changes))
    highlight = {"id": "h1", "start": 0, "end": 5, "quote": "magic", "color": "yellow"}
    reader.open_text("item", "Title", "<p>Some new text before the magic word.</p>", None, [highlight])
    assert moved and moved[0]["start"] > 0
    assert len(reader._text.extraSelections()) == 1
    reader.close_item()
