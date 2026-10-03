"""The "Change this story" dialog offers what the story's policies allow."""

from editor.ui.change_story_dialog import (
    CHOICE_CLONE,
    CHOICE_COLLABORATE,
    CHOICE_SUGGEST,
    CHOICE_TRANSLATE,
    ChangeStoryDialog,
)

LOCALES = [
    {"code": "en", "english_name": "English", "native_name": "English"},
    {"code": "de", "english_name": "German", "native_name": "Deutsch"},
]


def test_everything_allowed(qapp):
    dialog = ChangeStoryDialog(
        {"title": "T", "language": "en", "can_clone": True, "can_translate": True, "request": None}, LOCALES
    )
    assert all(b.isEnabled() for b in dialog.buttons.values())
    # The story's own language is not offered as a translation target.
    assert [dialog._language.itemData(i) for i in range(dialog._language.count())] == ["de"]


def test_policies_and_pending_request_disable_options(qapp):
    dialog = ChangeStoryDialog(
        {"title": "T", "language": "en", "can_clone": False, "can_translate": False, "request": {"status": "pending"}},
        LOCALES,
    )
    assert dialog.buttons[CHOICE_SUGGEST].isEnabled()
    assert not dialog.buttons[CHOICE_CLONE].isEnabled()
    assert not dialog.buttons[CHOICE_TRANSLATE].isEnabled()
    assert not dialog.buttons[CHOICE_COLLABORATE].isEnabled()
    assert "doesn't allow copies" in dialog.buttons[CHOICE_CLONE].description()


def test_translate_choice_collects_language(qapp):
    dialog = ChangeStoryDialog(
        {"title": "T", "language": "en", "can_clone": True, "can_translate": True, "request": None}, LOCALES
    )
    dialog._choose(CHOICE_TRANSLATE)
    dialog._start_blank.setChecked(True)
    dialog._confirm()
    assert (dialog.choice, dialog.language, dialog.start) == (CHOICE_TRANSLATE, "de", "blank")


def test_suggestion_copy_opens_with_bar_and_is_not_synced(qapp, tmp_path, monkeypatch):
    from datetime import datetime
    from pathlib import Path

    monkeypatch.setenv("PYTHON_KEYRING_BACKEND", "keyring.backends.null.Keyring")
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    from editor import settings as settings_module
    from editor.crowdly_client import CrowdlyStory
    from editor.ui.main_window import MainWindow

    settings = settings_module.load_settings()
    space = tmp_path / "space"
    space.mkdir()
    settings.project_space = space
    win = MainWindow(settings, mode="discovery")
    story = CrowdlyStory(id="s-1", title="Their story", body="# Their story\n\n## One\n\nHello.\n",
                         body_format="markdown", updated_at=datetime(2026, 10, 3),
                         source_url="http://localhost:4000/story/s-1", creator_id="u-1")
    path = win._import_story_locally(story, [{"chapter_id": "c1", "chapter_title": "One", "paragraphs": ["Hello."]}])
    win.set_mode("creation")
    win._open_paths_from_cli([str(path)])
    assert win._suggestion_bar.isVisibleTo(win)
    assert "Their story" in win._suggestion_label.text()

    synced = []
    monkeypatch.setattr(win, "_ensure_crowdly_web_credentials", lambda: synced.append(1))
    win._maybe_sync_story_to_web()
    assert synced == []  # suggestion copies never reach the direct sync

    win.set_mode("discovery")
    assert not win._suggestion_bar.isVisibleTo(win)
    win.close()


def test_reader_context_menu_offers_change_for_crowdly_stories(qapp):
    from PySide6.QtCore import QPoint

    from editor.ui.discovery.reader_widget import ReaderWidget

    reader = ReaderWidget()
    emitted = []
    reader.changeRequested.connect(lambda: emitted.append(1))

    reader.set_change_enabled(True)
    reader.open_text("item", "A story", "<p>Once upon a time.</p>", None, [])
    menu = reader.build_text_context_menu(QPoint(5, 5))
    change = [a for a in menu.actions() if a.text() == "✎ Change this story"]
    assert change, [a.text() for a in menu.actions()]
    change[0].trigger()
    assert emitted == [1]

    reader._change_from_shortcut()  # Ctrl/Cmd+E
    assert emitted == [1, 1]

    reader.set_change_enabled(False)  # an imported book
    menu = reader.build_text_context_menu(QPoint(5, 5))
    assert not [a for a in menu.actions() if a.text() == "✎ Change this story"]
    reader._change_from_shortcut()
    assert emitted == [1, 1]
    reader.close_item()


def _discovery(tmp_path, monkeypatch):
    from pathlib import Path

    monkeypatch.setenv("PYTHON_KEYRING_BACKEND", "keyring.backends.null.Keyring")
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    from editor import settings as settings_module
    from editor.ui.main_window import MainWindow

    settings = settings_module.load_settings()
    win = MainWindow(settings, mode="discovery")
    return win, win.discovery_view()


def test_imported_book_can_be_changed_but_audio_cannot(qapp, tmp_path, monkeypatch):
    win, view = _discovery(tmp_path, monkeypatch)
    book = tmp_path / "Mine.md"
    book.write_text("# Mine\n\nHello.\n", encoding="utf-8")
    item = view._library.add_file(book)
    asked = []
    view.changeBookRequested.disconnect()  # keep the window's dialog out of this test
    view.changeBookRequested.connect(asked.append)

    view.open_item(item)
    assert view._reader.change_enabled()
    view._reader._change_from_shortcut()
    assert asked == [item.id]
    assert view._change_callback({"key": f"local:{item.id}", "local_id": item.id, "type": "library_item"})

    audio = tmp_path / "Talk.mp3"
    audio.write_bytes(b"ID3")
    audio_item = view._library.add_file(audio)
    view.open_item(audio_item)
    assert not view._reader.change_enabled()
    assert view._change_callback({"local_id": audio_item.id, "type": "library_item"}) is None
    win.close()


def test_someone_elses_book_opens_as_private_copy(qapp, tmp_path, monkeypatch):
    from editor import suggestions
    from editor.library.store import RIGHTS_PERSONAL_COPY

    win, view = _discovery(tmp_path, monkeypatch)
    book = tmp_path / "Theirs.md"
    book.write_text("# Theirs\n\nTheir words.\n", encoding="utf-8")
    item = view._library.add_file(book)
    view._library.set_rights(item.id, RIGHTS_PERSONAL_COPY)

    win._change_book_from_discovery(item.id)
    path = win._document.path
    assert win.mode() == "creation"
    assert suggestions.is_private_copy(path)
    assert "private-edits" in str(path)
    assert win._suggestion_bar.isVisibleTo(win)
    assert not win._btn_send_suggestions.isVisibleTo(win)
    assert "Their words." in path.read_text(encoding="utf-8")

    synced = []
    monkeypatch.setattr(win, "_ensure_crowdly_web_credentials", lambda: synced.append(1))
    monkeypatch.setattr(win, "_ensure_story_metadata_for_path", lambda p: synced.append(2))
    win._maybe_sync_story_to_web()
    assert synced == []

    # Opening it again reuses the same private copy.
    win._change_book_from_discovery(item.id)
    assert win._document.path == path
    win.close()


def test_own_work_goes_through_convert(qapp, tmp_path, monkeypatch):
    from editor.library.store import RIGHTS_OWN_WORK

    win, view = _discovery(tmp_path, monkeypatch)
    book = tmp_path / "Mine.md"
    book.write_text("# Mine\n\nHello.\n", encoding="utf-8")
    item = view._library.add_file(book)
    view._library.set_rights(item.id, RIGHTS_OWN_WORK)
    converted = []
    monkeypatch.setattr(win, "_convert_library_item_to_story", converted.append)
    win._change_book_from_discovery(item.id)
    assert converted == [item.id]
    win.close()
