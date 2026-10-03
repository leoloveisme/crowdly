"""Discovery mode: the user's library, Crowdly stories and the reader.

Pages:

- **My library** - books imported from this computer (EPUB, PDF, audio,
  text), private to the user. With "Synchronisation with web platform" on
  they are uploaded to the user's own Crowdly account and appear on their
  other devices, together with positions, reading time and highlights.
- **Reading on Crowdly** - the stories the user marked as "living" on the
  platform.
- **Browse Crowdly** - newest public stories and search.
- the reader (``ReaderWidget``).

While Crowdly is invite-only (alpha), Discovery needs a Crowdly login; flip
``DISCOVERY_REQUIRES_LOGIN`` at public launch to open browsing to everyone.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Callable

import markdown

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtWidgets import (
    QButtonGroup,
    QCheckBox,
    QDialog,
    QDialogButtonBox,
    QFileDialog,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMenu,
    QMessageBox,
    QPushButton,
    QStackedWidget,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from ...library.metadata import SUPPORTED_SUFFIXES
from ...library.store import (
    CONVERTIBLE_RIGHTS,
    KIND_CROWDLY,
    KIND_IMPORTED,
    RIGHTS_CC_LICENSED,
    RIGHTS_OWN_WORK,
    RIGHTS_PERSONAL_COPY,
    RIGHTS_PUBLIC_DOMAIN,
    RIGHTS_UNKNOWN,
    LibraryImportError,
    LibraryItem,
    LocalLibrary,
)
from ...library.sync import LibrarySyncClient, sync_library
from .reader_widget import ReaderWidget
from .tasks import run_in_background

# Crowdly is invite-only during the alpha, so Discovery needs a login.
# Set to False at public launch to let anyone browse and read public stories.
DISCOVERY_REQUIRES_LOGIN = True

PAGE_GATE = "gate"
PAGE_LIBRARY = "library"
PAGE_READING = "reading"
PAGE_BROWSE = "browse"
PAGE_READER = "reader"

AUTO_SYNC_INTERVAL_MS = 2 * 60 * 1000


def _http_get_json(url: str, timeout: float = 15.0):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "crowdly-desktop/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


class RightsConfirmationDialog(QDialog):
    """Shown once, before imported books first sync to the user's account."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle(self.tr("Before your books sync"))
        self.setMinimumWidth(520)
        layout = QVBoxLayout(self)
        text = QLabel(
            self.tr(
                "With synchronisation on, the books you import are uploaded to "
                "your own Crowdly account so they are available on your other "
                "devices.\n\n"
                "• They stay private: only you can open them. Crowdly never "
                "shares, lists or links them for anyone else.\n"
                "• Only upload books you have the right to keep a copy of - "
                "books you bought DRM-free, your own work, public-domain or "
                "openly licensed books.\n"
                "• DRM-protected files are never imported.\n"
                "• Rights holders can ask Crowdly to remove a file, and your "
                "files are deleted when you delete your account."
            ),
            self,
        )
        text.setWordWrap(True)
        layout.addWidget(text)
        self._confirm = QCheckBox(self.tr("I have the right to keep these books in my account"), self)
        layout.addWidget(self._confirm)
        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel, self
        )
        self._ok = buttons.button(QDialogButtonBox.StandardButton.Ok)
        self._ok.setText(self.tr("Sync my library"))
        self._ok.setEnabled(False)
        self._confirm.toggled.connect(self._ok.setEnabled)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)


class DiscoveryView(QWidget):
    """The Discovery page shown in a MainWindow when the window is in Discovery mode."""

    titleChanged = Signal(str)
    statusMessage = Signal(str)
    convertRequested = Signal(str)  # library item id

    def __init__(
        self,
        settings,
        library: LocalLibrary,
        *,
        api_base: Callable[[], str],
        credentials: Callable[[bool], tuple[str, str] | None],
        sync_enabled: Callable[[], bool],
        on_rights_confirmed: Callable[[], None],
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self._settings = settings
        self._library = library
        self._api_base = api_base
        self._credentials = credentials
        self._sync_enabled = sync_enabled
        self._on_rights_confirmed = on_rights_confirmed
        self._sync_running = False
        self._user_id: str | None = None
        self._page = PAGE_LIBRARY
        self._pending_reader_state: dict | None = None

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # Navigation ---------------------------------------------------------
        self._nav = QWidget(self)
        nav = QHBoxLayout(self._nav)
        nav.setContentsMargins(6, 4, 6, 4)
        self._nav_group = QButtonGroup(self)
        self._nav_group.setExclusive(True)
        self._nav_buttons: dict[str, QToolButton] = {}
        for page in (PAGE_LIBRARY, PAGE_READING, PAGE_BROWSE):
            btn = QToolButton(self._nav)
            btn.setCheckable(True)
            btn.clicked.connect(lambda _=False, p=page: self.show_page(p))
            self._nav_group.addButton(btn)
            nav.addWidget(btn)
            self._nav_buttons[page] = btn
        nav.addStretch(1)
        self._status = QLabel(self._nav)
        nav.addWidget(self._status)
        self._btn_add = QPushButton(self._nav)
        self._btn_add.clicked.connect(self.add_books)
        nav.addWidget(self._btn_add)
        self._btn_sync = QPushButton(self._nav)
        self._btn_sync.clicked.connect(lambda: self.sync_now(interactive=True))
        nav.addWidget(self._btn_sync)
        root.addWidget(self._nav)

        self._stack = QStackedWidget(self)
        root.addWidget(self._stack, 1)

        # Login gate ---------------------------------------------------------
        self._gate = QWidget(self._stack)
        gate_layout = QVBoxLayout(self._gate)
        gate_layout.addStretch(1)
        self._gate_label = QLabel(self._gate)
        self._gate_label.setWordWrap(True)
        self._gate_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        gate_layout.addWidget(self._gate_label)
        self._btn_login = QPushButton(self._gate)
        self._btn_login.clicked.connect(self._login_from_gate)
        gate_layout.addWidget(self._btn_login, 0, Qt.AlignmentFlag.AlignCenter)
        gate_layout.addStretch(2)
        self._stack.addWidget(self._gate)

        # My library ---------------------------------------------------------
        self._library_page = QWidget(self._stack)
        lib_layout = QVBoxLayout(self._library_page)
        self._library_empty = QLabel(self._library_page)
        self._library_empty.setWordWrap(True)
        lib_layout.addWidget(self._library_empty)
        self._library_list = QListWidget(self._library_page)
        self._library_list.itemActivated.connect(self._open_library_item)
        self._library_list.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self._library_list.customContextMenuRequested.connect(self._library_context_menu)
        lib_layout.addWidget(self._library_list, 1)
        self._stack.addWidget(self._library_page)

        # Reading on Crowdly -------------------------------------------------
        self._reading_page = QWidget(self._stack)
        reading_layout = QVBoxLayout(self._reading_page)
        self._reading_hint = QLabel(self._reading_page)
        self._reading_hint.setWordWrap(True)
        reading_layout.addWidget(self._reading_hint)
        self._reading_list = QListWidget(self._reading_page)
        self._reading_list.itemActivated.connect(self._open_story_item)
        reading_layout.addWidget(self._reading_list, 1)
        self._stack.addWidget(self._reading_page)

        # Browse Crowdly -----------------------------------------------------
        self._browse_page = QWidget(self._stack)
        browse_layout = QVBoxLayout(self._browse_page)
        search_row = QHBoxLayout()
        self._search = QLineEdit(self._browse_page)
        self._search.returnPressed.connect(self._run_search)
        search_row.addWidget(self._search, 1)
        self._btn_search = QPushButton(self._browse_page)
        self._btn_search.clicked.connect(self._run_search)
        search_row.addWidget(self._btn_search)
        browse_layout.addLayout(search_row)
        self._browse_hint = QLabel(self._browse_page)
        browse_layout.addWidget(self._browse_hint)
        self._browse_list = QListWidget(self._browse_page)
        self._browse_list.itemActivated.connect(self._open_story_item)
        browse_layout.addWidget(self._browse_list, 1)
        self._stack.addWidget(self._browse_page)

        # Reader -------------------------------------------------------------
        self._reader = ReaderWidget(self._stack)
        self._reader.backRequested.connect(self._reader_closed)
        self._reader.positionChanged.connect(self._on_position)
        self._reader.sessionFinished.connect(self._on_session)
        self._reader.highlightAdded.connect(self._on_highlight_added)
        self._reader.highlightChanged.connect(self._on_highlight_changed)
        self._reader.highlightDeleted.connect(self._on_highlight_deleted)
        self._stack.addWidget(self._reader)

        self._auto_sync_timer = QTimer(self)
        self._auto_sync_timer.setInterval(AUTO_SYNC_INTERVAL_MS)
        self._auto_sync_timer.timeout.connect(lambda: self.sync_now(interactive=False))

        self.retranslate()
        self.show_page(PAGE_LIBRARY)

    # -- public API ----------------------------------------------------------

    def retranslate(self) -> None:
        self._nav_buttons[PAGE_LIBRARY].setText(self.tr("My library"))
        self._nav_buttons[PAGE_READING].setText(self.tr("Reading on Crowdly"))
        self._nav_buttons[PAGE_BROWSE].setText(self.tr("Browse Crowdly"))
        self._btn_add.setText(self.tr("Add books…"))
        self._btn_sync.setText(self.tr("Sync now"))
        self._gate_label.setText(
            self.tr(
                "Crowdly is invite-only while it is in alpha.\n"
                "Log in with your Crowdly account to use Discovery."
            )
        )
        self._btn_login.setText(self.tr("Log in to Crowdly"))
        self._library_empty.setText(
            self.tr(
                "Your library is empty. Use \"Add books…\" to import EPUB, PDF, "
                "audio or text files. Your books stay private to you."
            )
        )
        self._reading_hint.setText(self.tr("Stories you are living on Crowdly."))
        self._search.setPlaceholderText(self.tr("Search Crowdly stories"))
        self._btn_search.setText(self.tr("Search"))
        self._browse_hint.setText(self.tr("Newest stories"))
        self._reader.retranslate()
        self._update_sync_button()
        self._refresh_library_list()

    def has_access(self) -> bool:
        return not DISCOVERY_REQUIRES_LOGIN or self._credentials(False) is not None

    def activate(self) -> None:
        """Called when the window switches to Discovery mode."""

        self.refresh_access()
        if self._sync_enabled():
            self._auto_sync_timer.start()
            QTimer.singleShot(500, lambda: self.sync_now(interactive=False))

    def deactivate(self) -> None:
        """Called when the window leaves Discovery mode."""

        self._auto_sync_timer.stop()
        self._reader.close_item()
        if self._page == PAGE_READER:
            self._page = PAGE_LIBRARY

    def refresh_access(self) -> None:
        if not self.has_access():
            self._nav.setVisible(False)
            self._stack.setCurrentWidget(self._gate)
            return
        self._nav.setVisible(True)
        if self._stack.currentWidget() is self._gate:
            self.show_page(self._page if self._page != PAGE_READER else PAGE_LIBRARY)
        self._update_sync_button()

    def show_page(self, page: str) -> None:
        if not self.has_access():
            self.refresh_access()
            return
        if page != PAGE_READER and self._stack.currentWidget() is self._reader:
            self._reader.close_item()
        self._page = page
        if page in self._nav_buttons:
            self._nav_buttons[page].setChecked(True)
        if page == PAGE_LIBRARY:
            self._refresh_library_list()
            self._stack.setCurrentWidget(self._library_page)
        elif page == PAGE_READING:
            self._stack.setCurrentWidget(self._reading_page)
            self._load_reading()
        elif page == PAGE_BROWSE:
            self._stack.setCurrentWidget(self._browse_page)
            if self._browse_list.count() == 0:
                self._load_newest()
        elif page == PAGE_READER:
            self._stack.setCurrentWidget(self._reader)
        self.titleChanged.emit(self.current_title())

    def current_title(self) -> str:
        if self._page == PAGE_READER:
            return self._reader.title()
        return ""

    def capture_state(self) -> dict:
        state = {"view": self._page}
        if self._page == PAGE_READER:
            reader = self._reader.capture_state()
            state.update(reader)
            item = self._library.get(reader.get("item_id") or "")
            if item is not None and item.kind == KIND_CROWDLY:
                state["story_title_id"] = item.story_title_id
        return state

    def restore_state(self, state: dict | None) -> None:
        if not isinstance(state, dict):
            return
        view = state.get("view")
        if view == PAGE_READER and state.get("item_id"):
            item = self._library.get(state["item_id"])
            if item is not None:
                if state.get("locator"):
                    self._library.update_position(item.id, float(state.get("percent") or 0), state["locator"])
                self.open_item(item)
                return
        if view in (PAGE_LIBRARY, PAGE_READING, PAGE_BROWSE):
            self.show_page(view)

    # -- library -------------------------------------------------------------

    def _refresh_library_list(self) -> None:
        self._library_list.clear()
        items = self._library.items(KIND_IMPORTED)
        self._library_empty.setVisible(not items)
        formats = {"epub": "EPUB", "pdf": "PDF", "audio": self.tr("Audio"), "text": self.tr("Text")}
        for item in items:
            percent = int(round(float((item.position or {}).get("percent") or 0)))
            details = [item.author] if item.author else []
            details.append(formats.get(item.format, item.format))
            if percent:
                details.append(self.tr("{percent}% read").format(percent=percent))
            if item.uploaded:
                details.append(self.tr("synced"))
            list_item = QListWidgetItem(f"{item.title}\n{' · '.join(details)}", self._library_list)
            list_item.setData(Qt.ItemDataRole.UserRole, item.id)

    def add_books(self) -> None:
        patterns = " ".join(f"*{s}" for s in sorted(SUPPORTED_SUFFIXES))
        paths, _ = QFileDialog.getOpenFileNames(
            self,
            self.tr("Add books to your library"),
            "",
            self.tr("Books and audiobooks ({patterns})").format(patterns=patterns)
            + ";;"
            + self.tr("All files (*)"),
        )
        if not paths:
            return
        added, refused = 0, []
        for raw in paths:
            try:
                self._library.add_file(Path(raw))
                added += 1
            except LibraryImportError as exc:
                refused.append(f"{Path(raw).name}: {exc}")
            except OSError as exc:
                refused.append(f"{Path(raw).name}: {exc}")
        self.show_page(PAGE_LIBRARY)
        if refused:
            QMessageBox.warning(
                self,
                self.tr("Some files were not added"),
                "\n".join(refused),
            )
        if added:
            self.statusMessage.emit(self.tr("Books added to your library: {count}").format(count=added))
            self.sync_now(interactive=False)

    def _selected_library_item(self, list_item: QListWidgetItem | None) -> LibraryItem | None:
        if list_item is None:
            return None
        return self._library.get(list_item.data(Qt.ItemDataRole.UserRole))

    def _open_library_item(self, list_item: QListWidgetItem) -> None:
        item = self._selected_library_item(list_item)
        if item is not None:
            self.open_item(item)

    def open_item(self, item: LibraryItem) -> None:
        if item.kind == KIND_CROWDLY and item.story_title_id:
            self._open_story(item.story_title_id, item.title)
            return
        path = self._library.file_path(item)
        if path is None:
            QMessageBox.warning(
                self,
                self.tr("Book not available"),
                self.tr("The file for this book is missing. Sync again or re-import it."),
            )
            return
        self._library.mark_opened(item.id)
        if item.format == "pdf":
            self._reader.open_pdf(item.id, item.title, path, item.position)
        elif item.format == "audio":
            self._reader.open_audio(item.id, item.title, path, item.position)
        else:
            html = self._html_for_file(item, path)
            self._reader.open_text(item.id, item.title, html, item.position, self._library.visible_highlights(item.id))
        self.show_page(PAGE_READER)

    def _html_for_file(self, item: LibraryItem, path: Path) -> str:
        if item.format == "epub":
            try:
                from ...importing.epub_importer import EpubImporter

                return EpubImporter().import_file(path).html
            except Exception as exc:
                return f"<p>{self.tr('Could not read this EPUB:')} {exc}</p>"
        text = path.read_text(encoding="utf-8", errors="replace")
        if path.suffix.lower() in (".md", ".markdown"):
            return markdown.markdown(text, extensions=["extra", "sane_lists"])
        escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        paragraphs = "".join(f"<p>{p}</p>" for p in escaped.split("\n\n"))
        return paragraphs.replace("\n", "<br>")

    def _library_context_menu(self, pos) -> None:
        item = self._selected_library_item(self._library_list.itemAt(pos))
        if item is None:
            return
        menu = QMenu(self)
        act_open = menu.addAction(self.tr("Open"))
        act_rights = menu.addAction(self.tr("Book rights…"))
        act_convert = menu.addAction(self.tr("Convert to Crowdly story"))
        act_convert.setEnabled(item.rights_status in CONVERTIBLE_RIGHTS and item.format in ("epub", "text", "pdf"))
        menu.addSeparator()
        act_remove = menu.addAction(self.tr("Remove from library"))
        chosen = menu.exec(self._library_list.mapToGlobal(pos))
        if chosen is act_open:
            self.open_item(item)
        elif chosen is act_rights:
            self._edit_rights(item)
        elif chosen is act_convert:
            self.convertRequested.emit(item.id)
        elif chosen is act_remove:
            answer = QMessageBox.question(
                self,
                self.tr("Remove from library"),
                self.tr("Remove \"{title}\" from your library on all your devices?").format(title=item.title),
            )
            if answer == QMessageBox.StandardButton.Yes:
                self._library.remove(item.id)
                self._refresh_library_list()
                self.sync_now(interactive=False)

    def rights_labels(self) -> dict[str, str]:
        return {
            RIGHTS_UNKNOWN: self.tr("Not specified"),
            RIGHTS_PERSONAL_COPY: self.tr("My personal copy (private only)"),
            RIGHTS_OWN_WORK: self.tr("My own work"),
            RIGHTS_PUBLIC_DOMAIN: self.tr("Public domain"),
            RIGHTS_CC_LICENSED: self.tr("Creative Commons licence that allows changes"),
        }

    def _edit_rights(self, item: LibraryItem) -> None:
        labels = self.rights_labels()
        keys = list(labels)
        current = keys.index(item.rights_status) if item.rights_status in keys else 0
        choice, ok = QInputDialog.getItem(
            self,
            self.tr("Book rights"),
            self.tr(
                "Who holds the rights to \"{title}\"?\n"
                "Only your own work, public-domain or Creative Commons (without "
                "\"no derivatives\") books can become Crowdly stories others can "
                "read and co-create."
            ).format(title=item.title),
            [labels[k] for k in keys],
            current,
            False,
        )
        if not ok:
            return
        status = keys[[labels[k] for k in keys].index(choice)]
        self._library.set_rights(item.id, status)
        self._refresh_library_list()
        self.sync_now(interactive=False)

    # -- Crowdly stories -----------------------------------------------------

    def _ensure_user_id(self) -> str | None:
        if self._user_id:
            return self._user_id
        creds = self._credentials(False)
        if creds is None:
            return None
        client = LibrarySyncClient(self._api_base(), creds)
        self._user_id = client.login()
        return self._user_id

    def _load_reading(self) -> None:
        self._reading_list.clear()
        base = self._api_base()

        def work():
            user_id = self._ensure_user_id()
            if not user_id:
                return []
            return _http_get_json(f"{base}/users/{urllib.parse.quote(user_id)}/experiencing")

        def done(rows) -> None:
            self._reading_list.clear()
            for row in rows or []:
                if not isinstance(row, dict) or row.get("content_type") != "story":
                    continue
                item = QListWidgetItem(row.get("title") or self.tr("Untitled"), self._reading_list)
                item.setData(Qt.ItemDataRole.UserRole, (row.get("story_title_id"), row.get("title") or ""))
            if self._reading_list.count() == 0:
                QListWidgetItem(self.tr("(No stories yet - mark a story as \"living\" on Crowdly.)"), self._reading_list)

        run_in_background(work, done, self._network_error)

    def _load_newest(self) -> None:
        base = self._api_base()
        self._browse_hint.setText(self.tr("Newest stories"))

        def done(rows) -> None:
            self._browse_list.clear()
            for row in rows or []:
                if not isinstance(row, dict):
                    continue
                item = QListWidgetItem(row.get("story_title") or self.tr("Untitled"), self._browse_list)
                item.setData(Qt.ItemDataRole.UserRole, (row.get("story_title_id"), row.get("story_title") or ""))

        run_in_background(lambda: _http_get_json(f"{base}/stories/newest?limit=30"), done, self._network_error)

    def _run_search(self) -> None:
        query = self._search.text().strip()
        if not query:
            self._load_newest()
            return
        base = self._api_base()
        self._browse_hint.setText(self.tr("Search results"))

        def done(data) -> None:
            self._browse_list.clear()
            seen: set[str] = set()
            for row in (data or {}).get("results", []):
                if not isinstance(row, dict) or row.get("type") != "story":
                    continue
                url = row.get("url") or ""
                story_id = url.rsplit("/", 1)[-1] if "/story/" in url else None
                if not story_id or story_id in seen:
                    continue
                seen.add(story_id)
                label = row.get("title") or self.tr("Untitled")
                if row.get("subtitle"):
                    label += f"\n{row['subtitle']}"
                item = QListWidgetItem(label, self._browse_list)
                item.setData(Qt.ItemDataRole.UserRole, (story_id, row.get("title") or ""))
            if self._browse_list.count() == 0:
                QListWidgetItem(self.tr("No stories found."), self._browse_list)

        url = f"{base}/search?" + urllib.parse.urlencode({"q": query, "limit": 40})
        run_in_background(lambda: _http_get_json(url), done, self._network_error)

    def _open_story_item(self, list_item: QListWidgetItem) -> None:
        data = list_item.data(Qt.ItemDataRole.UserRole)
        if not data or not data[0]:
            return
        self._open_story(data[0], data[1])

    def _open_story(self, story_title_id: str, title: str) -> None:
        from ...crowdly_client import CrowdlyClient

        base = self._api_base()
        creds = self._credentials(False)

        def work():
            client = CrowdlyClient(base, credentials=creds)
            return client.fetch_story(story_title_id)

        def done(story) -> None:
            item = self._library.ensure_story(story_title_id, story.title or title)
            self._library.mark_opened(item.id)
            html = markdown.markdown(story.body, extensions=["extra", "sane_lists"])
            self._reader.open_text(item.id, item.title, html, item.position, self._library.visible_highlights(item.id))
            self.show_page(PAGE_READER)

        self.statusMessage.emit(self.tr("Opening \"{title}\"…").format(title=title))
        run_in_background(work, done, self._network_error)

    def _network_error(self, message: str) -> None:
        self.statusMessage.emit(self.tr("Crowdly could not be reached: {error}").format(error=message))

    # -- reader callbacks ------------------------------------------------------

    def _reader_closed(self) -> None:
        item = self._library.get(self._reader.current_item_id() or "")
        target = PAGE_READING if item is not None and item.kind == KIND_CROWDLY else PAGE_LIBRARY
        self.show_page(target)
        self.sync_now(interactive=False)

    def _on_position(self, item_id: str, percent: float, locator: dict) -> None:
        if locator.get("seconds") is not None:
            self._library.update_position(item_id, percent, locator, narration={"seconds": locator["seconds"]})
        else:
            self._library.update_position(item_id, percent, locator)

    def _on_session(self, item_id: str, started_at: str, ended_at: str, seconds: int) -> None:
        self._library.record_session(item_id, started_at, ended_at, seconds)

    def _on_highlight_added(self, item_id: str, start: int, end: int, quote: str, color: str, note: str) -> None:
        self._library.add_highlight(item_id, start=start, end=end, quote=quote, color=color, note=note)
        self._reader.set_highlights(self._library.visible_highlights(item_id))

    def _on_highlight_changed(self, item_id: str, highlight_id: str, changes: dict) -> None:
        self._library.update_highlight(item_id, highlight_id, **changes)

    def _on_highlight_deleted(self, item_id: str, highlight_id: str) -> None:
        self._library.delete_highlight(item_id, highlight_id)
        self._reader.set_highlights(self._library.visible_highlights(item_id))

    # -- sync ------------------------------------------------------------------

    def _update_sync_button(self) -> None:
        enabled = self._sync_enabled()
        self._btn_sync.setEnabled(enabled and not self._sync_running)
        self._btn_sync.setToolTip(
            ""
            if enabled
            else self.tr("Turn on Settings → Synchronisation with → web platform to sync your library.")
        )

    def sync_now(self, *, interactive: bool) -> None:
        if self._sync_running or not self._sync_enabled():
            self._update_sync_button()
            return
        creds = self._credentials(interactive)
        if creds is None:
            return
        if not getattr(self._settings, "library_rights_confirmed", False):
            if not interactive and not self.isVisible():
                return
            dialog = RightsConfirmationDialog(self)
            if dialog.exec() != QDialog.DialogCode.Accepted:
                return
            self._on_rights_confirmed()

        self._sync_running = True
        self._update_sync_button()
        self._status.setText(self.tr("Syncing…"))
        base = self._api_base()
        device_id = getattr(self._settings, "device_id", None) or "desktop"
        library = self._library

        def work():
            client = LibrarySyncClient(base, creds)
            return sync_library(library, client, device_id)

        def done(report) -> None:
            self._sync_running = False
            self._update_sync_button()
            if report.errors:
                self._status.setText(self.tr("Synced with problems"))
                self._status.setToolTip("\n".join(report.errors[:20]))
            else:
                self._status.setText(self.tr("Library synced"))
                self._status.setToolTip("")
            if self._page == PAGE_LIBRARY:
                self._refresh_library_list()
            if self._page == PAGE_READER and self._reader.current_item_id():
                self._reader.set_highlights(self._library.visible_highlights(self._reader.current_item_id()))

        def failed(message: str) -> None:
            self._sync_running = False
            self._update_sync_button()
            self._status.setText(self.tr("Sync failed"))
            self._status.setToolTip(message)

        run_in_background(work, done, failed)

    # -- login gate ------------------------------------------------------------

    def _login_from_gate(self) -> None:
        if self._credentials(True) is not None:
            self.refresh_access()
