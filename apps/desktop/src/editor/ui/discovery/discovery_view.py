"""Discovery mode: Browse Crowdly, My Library and the reader.

Top bar: [Browse Crowdly | My Library]   [search] [+ Add books]   sync status

- **Browse Crowdly** (``browse_page.py``) - the platform's main page as rows
  of cover cards: Continue reading, Favorites, Newest, Most popular, Most
  active (stories and screenplays), Living, Lived. Search shows a grid.
- **My Library** (``library_page.py``) - books imported from this computer
  and Crowdly stories read here, plus every shelf (Favorites / Living /
  Lived, my shelves, smart shelves) in a sidebar. Imported books stay private;
  with "Synchronisation with web platform" on they sync to the user's own
  account with positions, reading time, highlights and covers.
- the reader (``reader_widget.py``) and a details panel for the selected card.

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

from PySide6.QtCore import QPoint, Qt, QTimer, Signal
from PySide6.QtGui import QKeySequence, QShortcut
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
    QMenu,
    QMessageBox,
    QPushButton,
    QSplitter,
    QStackedWidget,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from ...library.covers import RemoteCoverCache, ensure_cover
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
from .browse_page import BrowsePage
from .cards import CoverProvider
from .details_panel import DetailsPanel
from .library_page import FINISHED_PERCENT, LibraryPage, local_card
from .reader_widget import ReaderWidget
from .shelves_page import AddToShelfMenu
from .tasks import run_in_background

# Crowdly is invite-only during the alpha, so Discovery needs a login.
# Set to False at public launch to let anyone browse and read public stories.
DISCOVERY_REQUIRES_LOGIN = True

PAGE_GATE = "gate"
PAGE_BROWSE = "browse"
PAGE_LIBRARY = "library"
PAGE_READER = "reader"

AUTO_SYNC_INTERVAL_MS = 2 * 60 * 1000
SEARCH_DELAY_MS = 350


def _http_get_json(url: str, timeout: float = 15.0):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "crowdly-desktop/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def search_cards(data: dict) -> list[dict]:
    """Cards from a ``/search`` response (stories and screenplays only)."""

    cards: list[dict] = []
    seen: set[str] = set()
    for row in (data or {}).get("results", []):
        if not isinstance(row, dict) or row.get("type") not in ("story", "screenplay"):
            continue
        url = row.get("url") or ""
        content_id = url.rstrip("/").rsplit("/", 1)[-1] if url else ""
        key = f"{row['type']}:{content_id}"
        if not content_id or key in seen:
            continue
        seen.add(key)
        cards.append(
            {
                "type": row["type"],
                "id": content_id,
                "title": row.get("title") or "",
                "subtitle": row.get("subtitle"),
                "format": row["type"],
                "progress": 0,
            }
        )
    return cards


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
        from ...settings import get_config_dir

        self._settings = settings
        self._library = library
        self._api_base = api_base
        self._credentials = credentials
        self._sync_enabled = sync_enabled
        self._on_rights_confirmed = on_rights_confirmed
        self._sync_running = False
        self._shelf_client: LibrarySyncClient | None = None
        self._shelf_client_creds: tuple[str, str] | None = None
        self._page = PAGE_BROWSE
        self._return_page = PAGE_BROWSE
        self._home_loaded = False
        self._sync_state = ""

        library_dir = get_config_dir() / "library"
        self.covers = CoverProvider(
            RemoteCoverCache(library_dir / "remote-covers"), api_base, self._local_cover, self
        )

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # Top bar --------------------------------------------------------------
        self._nav = QWidget(self)
        nav = QHBoxLayout(self._nav)
        nav.setContentsMargins(8, 6, 8, 6)
        self._tabs = QButtonGroup(self)
        self._tabs.setExclusive(True)
        self._tab_buttons: dict[str, QToolButton] = {}
        segmented = QWidget(self._nav)
        seg_layout = QHBoxLayout(segmented)
        seg_layout.setContentsMargins(0, 0, 0, 0)
        seg_layout.setSpacing(0)
        for page in (PAGE_BROWSE, PAGE_LIBRARY):
            button = QToolButton(segmented)
            button.setCheckable(True)
            button.setMinimumWidth(130)
            button.clicked.connect(lambda _=False, p=page: self.show_page(p))
            self._tabs.addButton(button)
            seg_layout.addWidget(button)
            self._tab_buttons[page] = button
        segmented.setStyleSheet(
            "QToolButton { padding: 5px 14px; border: 1px solid #b8b8c8; background: palette(base); }"
            "QToolButton:checked { background: #4b3fa8; color: white; border-color: #4b3fa8; font-weight: bold; }"
        )
        nav.addWidget(segmented)
        nav.addSpacing(12)
        self._search = QLineEdit(self._nav)
        self._search.setClearButtonEnabled(True)
        self._search.setMinimumWidth(260)
        self._search.textChanged.connect(lambda _t: self._search_timer.start())
        self._search.returnPressed.connect(self._run_search)
        nav.addWidget(self._search)
        self._btn_add = QPushButton(self._nav)
        self._btn_add.clicked.connect(self.add_books)
        nav.addWidget(self._btn_add)
        nav.addStretch(1)
        self._btn_sync = QToolButton(self._nav)
        self._btn_sync.setAutoRaise(True)
        self._btn_sync.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonTextOnly)
        self._btn_sync.clicked.connect(lambda: self.sync_now(interactive=True))
        nav.addWidget(self._btn_sync)
        root.addWidget(self._nav)

        self._search_timer = QTimer(self)
        self._search_timer.setSingleShot(True)
        self._search_timer.setInterval(SEARCH_DELAY_MS)
        self._search_timer.timeout.connect(self._run_search)

        # Body: pages + details panel -------------------------------------------
        self._splitter = QSplitter(Qt.Orientation.Horizontal, self)
        self._stack = QStackedWidget(self._splitter)

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

        self.browse = BrowsePage(self.covers, self._stack)
        self.browse.retryRequested.connect(self._load_home)
        self._wire_cards(self.browse)
        self._stack.addWidget(self.browse)

        self.library_page = LibraryPage(
            library, self.covers, self._client_for_shelves, library_dir / "shelves-cache.json", self._stack
        )
        self._wire_cards(self.library_page)
        self.library_page.filesDropped.connect(self.import_paths)
        self.library_page.statusMessage.connect(self.statusMessage)
        self.library_page.viewModeChanged.connect(lambda mode: self._save_pref("library_view", mode))
        self.library_page.set_view_mode(self._prefs().get("library_view", "grid"))
        self._stack.addWidget(self.library_page)

        self._reader = ReaderWidget(self._stack)
        self._reader.backRequested.connect(self._reader_closed)
        self._reader.positionChanged.connect(self._on_position)
        self._reader.sessionFinished.connect(self._on_session)
        self._reader.highlightAdded.connect(self._on_highlight_added)
        self._reader.highlightChanged.connect(self._on_highlight_changed)
        self._reader.highlightDeleted.connect(self._on_highlight_deleted)
        self._reader.set_prefs(self._prefs())
        self._reader.prefsChanged.connect(self._reader_prefs_changed)
        self._stack.addWidget(self._reader)

        self._details = DetailsPanel(self.covers, self._splitter)
        self._details.closeRequested.connect(self._details.hide)
        self._details.hide()
        self.covers.coverReady.connect(self._details.refresh_cover)
        self._splitter.addWidget(self._stack)
        self._splitter.addWidget(self._details)
        self._splitter.setStretchFactor(0, 1)
        self._splitter.setStretchFactor(1, 0)
        root.addWidget(self._splitter, 1)

        # Keyboard ----------------------------------------------------------------
        for sequence, slot in (
            ("Ctrl+F", self._focus_search),
            ("Ctrl+1", lambda: self.show_page(PAGE_BROWSE)),
            ("Ctrl+2", lambda: self.show_page(PAGE_LIBRARY)),
        ):
            shortcut = QShortcut(QKeySequence(sequence), self)
            shortcut.setContext(Qt.ShortcutContext.WidgetWithChildrenShortcut)
            shortcut.activated.connect(slot)

        self._auto_sync_timer = QTimer(self)
        self._auto_sync_timer.setInterval(AUTO_SYNC_INTERVAL_MS)
        self._auto_sync_timer.timeout.connect(lambda: self.sync_now(interactive=False))

        self.retranslate()
        self.show_page(PAGE_BROWSE)

    # -- preferences ------------------------------------------------------------

    def _prefs(self) -> dict:
        prefs = getattr(self._settings, "discovery_prefs", None)
        return prefs if isinstance(prefs, dict) else {}

    def _store_prefs(self, prefs: dict) -> None:
        self._settings.discovery_prefs = prefs
        try:
            from ...settings import save_settings

            save_settings(self._settings)
        except Exception:
            pass

    def _save_pref(self, key: str, value) -> None:
        self._store_prefs({**self._prefs(), key: value})

    def _reader_prefs_changed(self, prefs: dict) -> None:
        self._store_prefs({**self._prefs(), **prefs})

    # -- public API ----------------------------------------------------------

    def retranslate(self) -> None:
        self._tab_buttons[PAGE_BROWSE].setText(self.tr("Browse Crowdly"))
        self._tab_buttons[PAGE_LIBRARY].setText(self.tr("My Library"))
        self._btn_add.setText(self.tr("+ Add books"))
        self._gate_label.setText(
            self.tr(
                "Crowdly is invite-only while it is in alpha.\n"
                "Log in with your Crowdly account to use Discovery."
            )
        )
        self._btn_login.setText(self.tr("Log in to Crowdly"))
        self._details.shelf_label = self.tr("Add to shelf")
        self.browse.retranslate()
        self.library_page.retranslate()
        self._reader.retranslate()
        self._update_search_placeholder()
        self._update_sync_button()

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
            self._page = self._return_page

    def refresh_access(self) -> None:
        if not self.has_access():
            self._nav.setVisible(False)
            self._details.hide()
            self._stack.setCurrentWidget(self._gate)
            return
        self._nav.setVisible(True)
        if self._stack.currentWidget() is self._gate:
            self.show_page(self._page if self._page != PAGE_READER else self._return_page)
        self._update_sync_button()

    def show_page(self, page: str) -> None:
        if not self.has_access():
            self.refresh_access()
            return
        if page != PAGE_READER and self._stack.currentWidget() is self._reader:
            self._reader.close_item()
        changed = page != self._page
        self._page = page
        if page in self._tab_buttons:
            self._tab_buttons[page].setChecked(True)
            self._return_page = page
        self._nav.setVisible(page != PAGE_READER)
        if page == PAGE_BROWSE:
            self._stack.setCurrentWidget(self.browse)
            if not self._home_loaded:
                self._load_home()
            else:
                self.browse.set_rows({"continue": self._continue_cards()})
        elif page == PAGE_LIBRARY:
            self._stack.setCurrentWidget(self.library_page)
            self.library_page.refresh()
            self._make_missing_covers()
        elif page == PAGE_READER:
            self._details.hide()
            self._stack.setCurrentWidget(self._reader)
        if changed and page != PAGE_READER:
            self._details.hide()
            self._update_search_placeholder()
            if self._search.text():
                self._run_search()
        self.titleChanged.emit(self.current_title())

    def current_title(self) -> str:
        if self._page == PAGE_READER:
            return self._reader.title()
        return ""

    def capture_state(self) -> dict:
        state: dict = {"view": self._page}
        if self._page == PAGE_LIBRARY:
            state["shelf"] = self.library_page.current_key()
            state["scroll"] = self.library_page.scroll_value()
        elif self._page == PAGE_BROWSE:
            state["scroll"] = self.browse.scroll_value()
        elif self._page == PAGE_READER:
            reader = self._reader.capture_state()
            state.update(reader)
            state["return"] = self._return_page
            item = self._library.get(reader.get("item_id") or "")
            if item is not None and item.kind == KIND_CROWDLY:
                state["story_title_id"] = item.story_title_id
        return state

    def restore_state(self, state: dict | None) -> None:
        if not isinstance(state, dict):
            return
        view = state.get("view")
        if view == PAGE_READER and state.get("item_id"):
            self._return_page = state.get("return") if state.get("return") in (PAGE_BROWSE, PAGE_LIBRARY) else PAGE_BROWSE
            item = self._library.get(state["item_id"])
            if item is not None:
                if state.get("locator"):
                    self._library.update_position(item.id, float(state.get("percent") or 0), state["locator"])
                self.open_item(item)
                return
        if view in ("shelves", "reading"):  # pages of earlier versions
            view = PAGE_LIBRARY
        if view == PAGE_LIBRARY:
            if state.get("shelf"):
                self.library_page._current = state["shelf"]
            self.show_page(PAGE_LIBRARY)
            QTimer.singleShot(300, lambda: self.library_page.set_scroll_value(state.get("scroll") or 0))
        elif view == PAGE_BROWSE:
            self.show_page(PAGE_BROWSE)
            QTimer.singleShot(600, lambda: self.browse.set_scroll_value(state.get("scroll") or 0))

    # -- cards -------------------------------------------------------------------

    def _wire_cards(self, page) -> None:
        page.cardClicked.connect(self.show_details)
        page.detailsRequested.connect(self.show_details)
        page.cardActivated.connect(self.open_card)
        page.cardContextMenu.connect(self._card_context_menu)

    def _local_cover(self, card: dict) -> Path | None:
        item = self._library.get(card.get("local_id") or "")
        return self._library.cover_path(item) if item is not None else None

    def _local_item(self, card: dict) -> LibraryItem | None:
        item = self._library.get(card.get("local_id") or "")
        if item is None and card.get("type") == "library_item" and card.get("id"):
            item = self._library.find_by_remote(card["id"])
        return item

    def _continue_cards(self) -> list[dict]:
        """Crowdly stories started in Discovery, most recent first."""

        started = [
            i for i in self._library.items(KIND_CROWDLY)
            if 0 < float((i.position or {}).get("percent") or 0) < FINISHED_PERCENT
        ]
        started.sort(key=lambda i: i.last_opened_at or "", reverse=True)
        return [local_card(i) for i in started]

    def card_meta(self, card: dict) -> str:
        parts = []
        if card.get("author"):
            parts.append(card["author"])
        if card.get("subtitle") and card.get("subtitle") != card.get("author"):
            parts.append(card["subtitle"])
        kinds = {
            "story": self.tr("Story"),
            "screenplay": self.tr("Screenplay"),
            "epub": "EPUB",
            "pdf": "PDF",
            "audio": self.tr("Audiobook"),
            "text": self.tr("Text"),
        }
        if card.get("format") in kinds:
            parts.append(kinds[card["format"]])
        if card.get("language"):
            parts.append(card["language"])
        n = int(card.get("parts") or 0)
        if n:
            parts.append(
                (self.tr("{count} scenes") if card.get("type") == "screenplay" else self.tr("{count} chapters")).format(count=n)
            )
        return " · ".join(parts)

    def show_details(self, card: dict) -> None:
        if not card:
            return
        local = self._local_item(card)
        primary_label = self.tr("Listen") if card.get("format") == "audio" else self.tr("Read")
        primary = None if card.get("type") == "screenplay" else (primary_label, lambda c=card: self.open_card(c))
        extra = []
        if local is not None and local.kind == KIND_IMPORTED:
            extra.append((self.tr("Book rights…"), lambda i=local: self._edit_rights(i)))
            if local.rights_status in CONVERTIBLE_RIGHTS and local.format in ("epub", "text", "pdf"):
                extra.append((self.tr("Convert to Crowdly story"), lambda i=local: self.convertRequested.emit(i.id)))
            extra.append((self.tr("Remove from library"), lambda i=local: self._remove_item(i)))
        if self._page == PAGE_LIBRARY and self.library_page.current_shelf_is_manual() and card.get("entry_id"):
            extra.append((self.tr("Remove from this shelf"), lambda c=card: self.library_page.remove_from_current_shelf(c)))
        description = card.get("description") or ""
        if card.get("type") == "screenplay":
            description = (description + "\n\n" if description else "") + self.tr(
                "Screenplays can't be read in Discovery yet - open them on the web platform."
            )
        self._details.show_card(
            card,
            meta=self.card_meta(card),
            primary=primary,
            shelf_menu=self._shelf_menu_for(card, self._details),
            extra=extra,
            description=description,
        )

    def _shelf_menu_for(self, card: dict, parent) -> AddToShelfMenu | None:
        if card.get("type") not in ("story", "screenplay", "library_item"):
            return None
        item_id = card.get("id")
        if card.get("type") == "library_item":
            local = self._local_item(card)
            item_id = local.remote_id if local is not None else item_id
        return self._shelf_menu(card["type"], item_id, parent)

    def _card_context_menu(self, card: dict, pos: QPoint) -> None:
        menu = QMenu(self)
        open_action = None
        if card.get("type") != "screenplay":
            open_action = menu.addAction(self.tr("Listen") if card.get("format") == "audio" else self.tr("Read"))
        details = menu.addAction(self.tr("Details"))
        shelf_menu = self._shelf_menu_for(card, menu)
        if shelf_menu is not None:
            menu.addMenu(shelf_menu)
        local = self._local_item(card)
        rights = convert = remove = remove_shelf = None
        if local is not None and local.kind == KIND_IMPORTED:
            menu.addSeparator()
            rights = menu.addAction(self.tr("Book rights…"))
            convert = menu.addAction(self.tr("Convert to Crowdly story"))
            convert.setEnabled(local.rights_status in CONVERTIBLE_RIGHTS and local.format in ("epub", "text", "pdf"))
            remove = menu.addAction(self.tr("Remove from library"))
        if self._page == PAGE_LIBRARY and self.library_page.current_shelf_is_manual() and card.get("entry_id"):
            remove_shelf = menu.addAction(self.tr("Remove from this shelf"))
        chosen = menu.exec(pos)
        if chosen is None:
            return
        if chosen is open_action:
            self.open_card(card)
        elif chosen is details:
            self.show_details(card)
        elif chosen is rights:
            self._edit_rights(local)
        elif chosen is convert:
            self.convertRequested.emit(local.id)
        elif chosen is remove:
            self._remove_item(local)
        elif chosen is remove_shelf:
            self.library_page.remove_from_current_shelf(card)

    def open_card(self, card: dict) -> None:
        kind = card.get("type")
        local = self._local_item(card)
        if kind == "library_item":
            if local is None:
                QMessageBox.information(
                    self,
                    self.tr("Book not on this computer"),
                    self.tr(
                        "\"{title}\" is in your Crowdly library but not on this computer yet. "
                        "Sync your library to download it."
                    ).format(title=card.get("title") or ""),
                )
                return
            self.open_item(local)
        elif kind == "story" and card.get("id"):
            self._open_story(card["id"], card.get("title") or "")
        elif kind == "screenplay":
            self.statusMessage.emit(self.tr("Screenplays can't be read in Discovery yet - open them on the web platform."))

    # -- browse ------------------------------------------------------------------

    def _load_home(self) -> None:
        self.browse.set_loading()
        self.browse.set_rows({"continue": self._continue_cards()})

        def work():
            client = self._client_for_shelves()
            if client is None:
                raise RuntimeError(self.tr("Log in to Crowdly to browse."))
            return client.discover_home()

        def done(rows: list) -> None:
            self._home_loaded = True
            data = {row.get("key"): row.get("items") or [] for row in rows if isinstance(row, dict)}
            data["continue"] = self._continue_cards()
            self.browse.set_rows(data)

        run_in_background(work, done, self.browse.set_error)

    # -- search ------------------------------------------------------------------

    def _update_search_placeholder(self) -> None:
        if self._page == PAGE_LIBRARY:
            self._search.setPlaceholderText(self.tr("Search my library and Crowdly…"))
        else:
            self._search.setPlaceholderText(self.tr("Search Crowdly…"))

    def _focus_search(self) -> None:
        if self._page == PAGE_READER:
            return
        self._search.setFocus()
        self._search.selectAll()

    def _run_search(self) -> None:
        self._search_timer.stop()
        query = self._search.text().strip()
        if self._page == PAGE_LIBRARY:
            self.library_page.set_filter(query)
            if not query:
                self.library_page.set_crowdly_results([])
                return
        elif self._page == PAGE_BROWSE and not query:
            self.browse.show_rows()
            return
        elif self._page != PAGE_BROWSE:
            return
        if not query:
            return
        base = self._api_base()
        url = f"{base}/search?" + urllib.parse.urlencode({"q": query, "limit": 40})
        page = self._page

        def done(data) -> None:
            if self._search.text().strip() != query:
                return
            cards = search_cards(data)
            if page == PAGE_LIBRARY:
                self.library_page.set_crowdly_results(cards)
            else:
                self.browse.show_grid(
                    self.tr("Search results for \"{query}\"").format(query=query),
                    cards,
                    "" if cards else self.tr("No stories found."),
                )

        run_in_background(lambda: _http_get_json(url), done, self._network_error)

    # -- library -------------------------------------------------------------

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
        if paths:
            self.import_paths(paths)

    def import_paths(self, paths: list) -> None:
        added, refused = [], []
        for raw in paths:
            try:
                added.append(self._library.add_file(Path(raw)))
            except LibraryImportError as exc:
                refused.append(f"{Path(raw).name}: {exc}")
            except OSError as exc:
                refused.append(f"{Path(raw).name}: {exc}")
        if added:
            audio_only = all(i.format == "audio" for i in added)
            self.library_page._current = "local:audio" if audio_only else "local:books"
            self.show_page(PAGE_LIBRARY)
            self._make_missing_covers()
            self.statusMessage.emit(self.tr("Books added to your library: {count}").format(count=len(added)))
            self.sync_now(interactive=False)
        if refused:
            QMessageBox.warning(self, self.tr("Some files were not added"), "\n".join(refused))

    def _make_missing_covers(self) -> None:
        """Extract covers of imported books that were never checked."""

        pending = [i for i in self._library.items(KIND_IMPORTED) if not i.cover_checked and not i.cover_file]
        if not pending:
            return
        library = self._library

        def work():
            return [i.id for i in pending if ensure_cover(library, i) is not None]

        def done(made: list) -> None:
            for item_id in made:
                self.covers.forget(f"local:{item_id}")
                self.library_page.view.model_.refresh_key(f"local:{item_id}")
            if made:
                self.library_page.view.viewport().update()

        run_in_background(work, done, None)

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
        self._reader.set_shelf_menu(self._shelf_menu("library_item", item.remote_id, self._reader))
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

    def _remove_item(self, item: LibraryItem) -> None:
        answer = QMessageBox.question(
            self,
            self.tr("Remove from library"),
            self.tr("Remove \"{title}\" from your library on all your devices?").format(title=item.title),
        )
        if answer == QMessageBox.StandardButton.Yes:
            self._library.remove(item.id)
            self._details.hide()
            self.library_page.reload_local()
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
        if self._details.isVisible() and (self._details.item() or {}).get("local_id") == item.id:
            self.show_details(self._details.item())
        self.sync_now(interactive=False)

    # -- Crowdly stories -----------------------------------------------------

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
            self._reader.set_shelf_menu(self._shelf_menu("story", story_title_id, self._reader))
            self._reader.open_text(item.id, item.title, html, item.position, self._library.visible_highlights(item.id))
            self.show_page(PAGE_READER)
            self._mark_living(story_title_id)

        self.statusMessage.emit(self.tr("Opening \"{title}\"…").format(title=title))
        run_in_background(work, done, self._network_error)

    # -- shelves ---------------------------------------------------------------

    def _client_for_shelves(self) -> LibrarySyncClient | None:
        """A logged-in client for account calls (runs on worker threads)."""

        creds = self._credentials(False)
        if creds is None:
            return None
        if self._shelf_client is None or self._shelf_client_creds != creds:
            client = LibrarySyncClient(self._api_base(), creds)
            client.login()
            self._shelf_client = client
            self._shelf_client_creds = creds
        return self._shelf_client

    def _shelf_menu(self, item_type: str, item_id: str | None, parent) -> AddToShelfMenu:
        menu = AddToShelfMenu(
            self._client_for_shelves, item_type, item_id, parent, status_message=self.statusMessage.emit
        )
        menu.changed.connect(lambda: self.library_page.refresh() if self._page == PAGE_LIBRARY else None)
        if item_type == "library_item" and not item_id:
            menu.aboutToShow.connect(
                lambda: self.statusMessage.emit(
                    self.tr("Turn on Synchronisation with web platform to put library books on shelves.")
                )
            )
        return menu

    def _mark_living(self, story_title_id: str) -> None:
        """Reading a story marks it "living", as on the web platform."""

        def work():
            client = self._client_for_shelves()
            if client is not None:
                client.set_story_status("story", story_title_id, living=True)

        run_in_background(work, None, None)

    def _network_error(self, message: str) -> None:
        self.statusMessage.emit(self.tr("Crowdly could not be reached: {error}").format(error=message))

    # -- reader callbacks ------------------------------------------------------

    def _reader_closed(self) -> None:
        self.show_page(self._return_page)
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
        if not enabled:
            self._btn_sync.setText("⟳ " + self.tr("Sync off"))
            self._btn_sync.setToolTip(
                self.tr("Turn on Settings → Synchronisation with → web platform to sync your library.")
            )
        elif self._sync_running:
            self._btn_sync.setText("⟳ " + self.tr("Syncing…"))
        else:
            self._btn_sync.setText("⟳ " + (self._sync_state or self.tr("Sync now")))

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
        base = self._api_base()
        device_id = getattr(self._settings, "device_id", None) or "desktop"
        library = self._library

        def work():
            client = LibrarySyncClient(base, creds)
            return sync_library(library, client, device_id)

        def done(report) -> None:
            self._sync_running = False
            if report.errors:
                self._sync_state = self.tr("Synced with problems")
                self._btn_sync.setToolTip("\n".join(report.errors[:20]))
            else:
                self._sync_state = self.tr("Library synced")
                self._btn_sync.setToolTip(self.tr("Click to sync now"))
            self._update_sync_button()
            if self._page == PAGE_LIBRARY:
                self.library_page.reload_local()
            if self._page == PAGE_READER and self._reader.current_item_id():
                self._reader.set_highlights(self._library.visible_highlights(self._reader.current_item_id()))

        def failed(message: str) -> None:
            self._sync_running = False
            self._sync_state = self.tr("Sync failed")
            self._btn_sync.setToolTip(message)
            self._update_sync_button()

        run_in_background(work, done, failed)

    # -- login gate ------------------------------------------------------------

    def _login_from_gate(self) -> None:
        if self._credentials(True) is not None:
            self.refresh_access()
