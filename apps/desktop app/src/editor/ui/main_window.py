"""Main application window for the distraction-free editor.

This window contains a split view with a text editor on the left and a
live Markdown preview on the right. File and document management will be
layered on top of this layout.
"""

from __future__ import annotations

from pathlib import Path
from datetime import datetime

from PySide6.QtWidgets import (
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMenu,
    QMessageBox,
    QSplitter,
    QStatusBar,
    QToolButton,
    QVBoxLayout,
    QWidget,
    QInputDialog,
    QDialog,
    QTabWidget,
    QTabBar,
    QLineEdit,
    QCheckBox,
    QPushButton,
)
from PySide6.QtCore import Qt, QTimer, QEvent, QCoreApplication, QObject, QThread, Signal, QUrl
from PySide6.QtGui import (
    QAction,
    QActionGroup,
    QDesktopServices,
    QTextCursor,
    QTextDocument,
    QKeySequence,
    QShortcut,
)

from ..document import Document
from ..settings import Settings, save_settings, load_spaces_status_log
from .. import file_metadata
from .. import story_sync
from .. import websync
from .. import auth as local_auth
from .. import websync
from ..versioning import local_queue
from ..format import types as format_types
from ..importing import controller as importing_controller
from ..importing.base import DocumentImportError
from ..exporting import controller as exporting_controller
from ..exporting.base import ExportError, ExportFormat, ExportRequest
from ..exporting.markdown_utils import render_html_from_markdown
from .. import storage
from ..format import story_markup, screenplay_markup
from .editor_widget import EditorWidget
from .preview_widget import PreviewWidget
from .compare_revisions import CompareRevisionsWindow
from .master_document_window import MasterDocumentWindow, master_sync_bus


class MainWindow(QMainWindow):
    """Top-level window for the editor application."""

    def __init__(
        self,
        settings: Settings,
        parent: object | None = None,
        *,
        translator: object | None = None,
    ) -> None:
        super().__init__(parent)

        self._settings = settings
        self._project_space_path: Path | None = settings.project_space

        # Known creative spaces (project-space roots) that the user can switch between.
        raw_spaces = getattr(settings, "spaces", []) or []
        self._spaces: list[Path] = []
        for value in raw_spaces:
            try:
                path = value if isinstance(value, Path) else Path(value)
            except TypeError:
                continue
            self._spaces.append(path)

        self._language_actions: dict[str, QAction] = {}
        self._translator = translator
        self._logged_in = False

        # Cached URL/id for the current story or screenplay so the status-bar
        # link can open it in the system browser.
        self._current_story_or_screenplay_id: str | None = None
        self._current_story_or_screenplay_url: str | None = None

        # Placeholder username for status bar; will be replaced by real
        # authentication wiring later.
        self._username = "username"

        # Simple in-memory flags for synchronisation preferences. These are
        # placeholders and are not yet persisted.
        self._sync_web_platform = False
        self._sync_dropbox = False
        self._sync_google_drive = False

        # Best-effort web sync debouncer.
        self._web_sync_timer = QTimer(self)
        self._web_sync_timer.setSingleShot(True)
        self._web_sync_timer.timeout.connect(self._maybe_sync_story_to_web)

        # Polling timer to pull updates from the web (bi-directional sync).
        self._web_pull_timer = QTimer(self)
        self._web_pull_timer.setInterval(8000)
        self._web_pull_timer.timeout.connect(self._poll_web_updates)

        # Cached Crowdly web credentials for the current app session.
        self._crowdly_web_credentials: tuple[str, str] | None = None
        # Local backend user id corresponding to the logged-in username, used
        # for Spaces synchronisation with the web platform.
        self._crowdly_user_id: str | None = None

        # Background thread used to initialise a new Crowdly story for a local
        # file and a simple flag guarding against concurrent inits.
        self._story_init_thread: QThread | None = None
        self._story_init_in_progress: bool = False

        # Track where the last content change originated from so that we can
        # decide whether re-rendering the preview from Markdown is safe.
        self._last_change_from_preview = False

        # Track which pane ("md" or "wysiwyg") is currently considered active
        # based on focus. This is used to decide which on-disk format (.md,
        # .story, .screenplay) should be used when saving.
        self._active_pane: str = "md"

        # Current in-memory document being edited. With multiple tabs, this
        # always refers to the document in the *active* tab.
        self._document = Document()

        # Per-tab state (documents and their associated editor/preview widgets).
        self._tab_documents: list[Document] = []
        self._tab_widgets: list[tuple[EditorWidget, PreviewWidget]] = []
        # Per-tab caret/scroll state for both panes; entries are dictionaries
        # with optional "md" and "wysiwyg" keys.
        self._tab_caret_states: list[dict[str, object]] = []
        self._current_tab_index: int = 0

        # Simple debounced autosave timer (milliseconds).
        self._autosave_interval_ms = 2000
        self._autosave_timer = QTimer(self)
        self._autosave_timer.setSingleShot(True)
        self._autosave_timer.timeout.connect(self._perform_autosave)

        # Track whether we've already shown the "no Space set" warning in this
        # window so that it appears at most once.
        self._no_space_warning_shown: bool = False

        # Inline search/replace state.
        self._search_text: str = ""
        self._replace_text: str = ""

        # Shared bus for synchronising chapter edits with MasterDocumentWindow
        # instances. This is best-effort only and treated as optional so that
        # older builds without master-document support continue to work.
        try:
            self._master_sync_bus = master_sync_bus
        except Exception:
            self._master_sync_bus = None
        else:
            # Listen for live edits performed inside editable include containers
            # so that the corresponding chapter stays in sync when it is also
            # open in this main window. Connections are best-effort only.
            try:
                self._master_sync_bus.includeContentUpdated.connect(
                    self._on_include_content_updated
                )
            except Exception:
                pass

        self._setup_central_widgets()
        self._retranslate_ui()
        self._update_project_space_status()

    # Internal helpers -----------------------------------------------------

    def _setup_central_widgets(self) -> None:
        """Set up the top burger button and the split editor/preview view."""

        # Root container for a simple top bar + main content area.
        container = QWidget(self)
        root_layout = QVBoxLayout(container)
        root_layout.setContentsMargins(0, 0, 0, 0)
        root_layout.setSpacing(0)

        # Top bar with burger button in the left corner.
        top_bar = QWidget(container)
        top_layout = QHBoxLayout(top_bar)
        top_layout.setContentsMargins(4, 4, 4, 4)
        top_layout.setSpacing(4)

        burger_button = QToolButton(top_bar)
        burger_button.setText("≡")
        burger_button.setToolTip(self.tr("Main menu"))
        burger_button.setPopupMode(QToolButton.ToolButtonPopupMode.InstantPopup)
        self._burger_button = burger_button

        menu = QMenu(burger_button)
        # These actions are placeholders for now and will be wired up in
        # later iterations (e.g. New, Open, Settings, Toggle distraction-free).
        new_menu = menu.addMenu(self.tr("New"))
        self._new_menu = new_menu
        self._action_new_document = new_menu.addAction(
            self.tr("New document"), self._new_document
        )
        self._action_new_directory = new_menu.addAction(
            self.tr("New directory"), self._new_directory
        )
        # New Crowdly-backed story creation helper (regular story vs screenplay).
        self._action_new_story = new_menu.addAction(
            self.tr("Story"), self._new_story_from_template
        )
        # Master Document workspace entry point.
        master_document_menu = new_menu.addMenu(self.tr("Master document"))
        self._master_document_menu = master_document_menu
        self._action_open_master_document = master_document_menu.addAction(
            self.tr("Open master document window"),
            self._open_master_document_window,
        )
        # Workspace creation helpers.
        self._action_new_tab = new_menu.addAction(
            self.tr("Tab"), self._new_tab
        )
        self._action_new_window = new_menu.addAction(
            self.tr("Window"), self._new_window
        )

        open_menu = menu.addMenu(self.tr("Open"))
        self._open_menu = open_menu

        self._action_open_story_web = open_menu.addAction(
            self.tr("Story on the web"),
            self._open_story_on_web,
        )

        # File-open submenu with options for current tab, new tab and new window.
        file_open_menu = open_menu.addMenu(self.tr("File"))
        self._file_open_menu = file_open_menu
        self._action_open_file_current_tab = file_open_menu.addAction(
            self.tr("in the current tab"),
            self._open_document_in_current_tab,
        )
        self._action_open_file_new_tab = file_open_menu.addAction(
            self.tr("in a new tab"),
            self._open_document_in_new_tab,
        )
        self._action_open_file_new_window = file_open_menu.addAction(
            self.tr("in a new window"),
            self._open_document_in_new_window,
        )

        # Master document open helpers.
        master_open_menu = open_menu.addMenu(self.tr("Master document"))
        self._master_open_menu = master_open_menu
        self._action_open_master_file = master_open_menu.addAction(
            self.tr("From file..."),
            self._open_master_document_from_file,
        )

        # Spaces menu: lets the user manage and switch between multiple creative spaces.
        spaces_menu = menu.addMenu(self.tr("Spaces"))
        self._spaces_menu = spaces_menu
        self._rebuild_spaces_menu()

        menu.addSeparator()

        import_menu = menu.addMenu(self.tr("Import"))
        self._import_menu = import_menu
        self._action_import = import_menu.addAction(
            self.tr("Import from file..."), self._import_from_file
        )

        export_menu = menu.addMenu(self.tr("Export"))
        self._export_menu = export_menu
        self._action_export_pdf = export_menu.addAction(
            self.tr("as PDF"), self._export_as_pdf
        )
        self._action_export_epub = export_menu.addAction(
            self.tr("as EPUB"), self._export_as_epub
        )
        self._action_export_docx = export_menu.addAction(
            self.tr("as docx"), self._export_as_docx
        )
        self._action_export_odt = export_menu.addAction(
            self.tr("as odt"), self._export_as_odt
        )
        self._action_export_fdx = export_menu.addAction(
            self.tr("as FDX"), self._export_as_fdx
        )
        self._action_export_fountain = export_menu.addAction(
            self.tr("as FOUNTAIN"), self._export_as_fountain
        )

        settings_menu = menu.addMenu(self.tr("Settings"))
        self._settings_menu = settings_menu
        self._action_choose_project_space = settings_menu.addAction(
            self.tr("Create or choose your project space"),
            self._choose_project_space,
        )
        self._action_clear_project_space = settings_menu.addAction(
            self.tr("Clear project space setting"),
            self._clear_project_space,
        )

        sync_menu = settings_menu.addMenu(self.tr("Synchronisation with"))
        self._sync_menu = sync_menu

        self._action_sync_web = sync_menu.addAction(
            self.tr("web platform"), self._toggle_sync_web_platform
        )
        self._action_sync_web.setCheckable(True)

        # One-off manual sync of the current project space to the web
        # platform. This is an alpha feature focused on pushing a snapshot
        # of local folders/files into the user's default creative space.
        self._action_sync_current_space = sync_menu.addAction(
            self.tr("Sync current Space now"), self._sync_current_space_to_web
        )

        # Manual pull of changes made on the Crowdly web platform back into
        # the current project-space directory. This operates on the folder /
        # file *structure* (creating missing folders/files locally) and is
        # intentionally conservative about overwriting or deleting existing
        # local files.
        self._action_pull_current_space = sync_menu.addAction(
            self.tr("Pull updates for current Space"), self._pull_current_space_from_web
        )

        online_storage_menu = sync_menu.addMenu(self.tr("online storage"))
        self._online_storage_menu = online_storage_menu

        self._action_sync_dropbox = online_storage_menu.addAction(
            self.tr("Dropbox"), self._toggle_sync_dropbox
        )
        self._action_sync_dropbox.setCheckable(True)

        self._action_sync_gdrive = online_storage_menu.addAction(
            self.tr("Google Drive"), self._toggle_sync_google_drive
        )
        self._action_sync_gdrive.setCheckable(True)

        connect_menu = settings_menu.addMenu(self.tr("Connect"))
        self._connect_menu = connect_menu
        self._action_connect_dropbox = connect_menu.addAction(
            self.tr("to Dropbox"), self._connect_to_dropbox
        )
        self._action_connect_gdrive = connect_menu.addAction(
            self.tr("to Google Drive"), self._connect_to_google_drive
        )

        # Submenu for changing the interface language.
        language_menu = settings_menu.addMenu(self.tr("Change interface language"))
        self._language_menu = language_menu

        # Language switcher entries. These currently record the user's
        # preferred language in settings; wiring up full translations is left
        # for a later iteration.
        languages = [
            (self.tr("English"), "en"),
            (self.tr("Russian"), "ru"),
            (self.tr("Portuguese"), "pt"),
            (self.tr("Korean"), "kr"),
            (self.tr("Arabic"), "ar"),
            (self.tr("Chinese (Simplified)"), "zh-Hans"),
            (self.tr("Chinese (Traditional)"), "zh-Hant"),
            (self.tr("Japanese"), "ja"),
        ]

        group = QActionGroup(self)
        group.setExclusive(True)

        for label, code in languages:
            action = language_menu.addAction(label)
            action.setCheckable(True)
            action.setData(code)
            group.addAction(action)
            action.triggered.connect(
                lambda checked, code=code: self._change_interface_language(code)
            )
            self._language_actions[code] = action

        self._update_language_actions()

        # "View" menu removed; pane visibility is now controlled via
        # checkboxes in the top bar.

        search_menu = menu.addMenu(self.tr("Search"))
        self._search_menu = search_menu
        self._action_search_find = search_menu.addAction(
            self.tr("Find"), self._show_find_dialog
        )
        self._action_search_replace = search_menu.addAction(
            self.tr("Replace"), self._show_replace_dialog
        )

        story_settings_menu = menu.addMenu(self.tr("Story settings"))
        self._story_settings_menu = story_settings_menu
        self._action_view_story_metadata = story_settings_menu.addAction(
            self.tr("View story metadata"),
            self._view_story_metadata,
        )
        self._action_set_story_genre = story_settings_menu.addAction(
            self.tr("Add genre"),
            self._set_or_clear_story_genre,
        )
        self._action_refresh_story_from_web = story_settings_menu.addAction(
            self.tr("Refresh from web"),
            self._refresh_story_from_web,
        )
        self._action_compare_revisions = story_settings_menu.addAction(
            self.tr("Compare revisions"),
            self._open_compare_revisions,
        )

        menu.addSeparator()
        self._action_login_logout = menu.addAction(
            self.tr("Login"), self._toggle_login_logout
        )
        self._action_quit = menu.addAction(self.tr("Quit"), self.close)
        burger_button.setMenu(menu)
        self._menu = menu

        top_layout.addWidget(burger_button)
        top_layout.addStretch(1)

        # Checkboxes in the top-right to control which panes are visible.
        self._chk_md_editor = QCheckBox(self.tr("Markdown (MD) / HTML"), top_bar)
        self._chk_md_editor.setChecked(True)
        self._chk_md_editor.toggled.connect(self._on_md_checkbox_toggled)
        top_layout.addWidget(self._chk_md_editor)

        self._chk_wysiwyg = QCheckBox(self.tr("WYSIWYG"), top_bar)
        self._chk_wysiwyg.setChecked(True)
        self._chk_wysiwyg.toggled.connect(self._on_wysiwyg_checkbox_toggled)
        top_layout.addWidget(self._chk_wysiwyg)

        # Inline search / replace bar (initially hidden).
        self._search_bar = QWidget(container)
        search_layout = QHBoxLayout(self._search_bar)
        search_layout.setContentsMargins(4, 0, 4, 0)
        search_layout.setSpacing(4)

        self._search_label = QLabel(self.tr("Find:"), self._search_bar)
        self._search_entry = QLineEdit(self._search_bar)
        search_layout.addWidget(self._search_label)
        search_layout.addWidget(self._search_entry)

        self._replace_label = QLabel(self.tr("Replace:"), self._search_bar)
        self._replace_entry = QLineEdit(self._search_bar)
        search_layout.addWidget(self._replace_label)
        search_layout.addWidget(self._replace_entry)

        self._chk_match_case = QCheckBox(self.tr("Match case"), self._search_bar)
        self._chk_whole_word = QCheckBox(self.tr("Match whole word"), self._search_bar)
        self._chk_wrap_around = QCheckBox(self.tr("Wrap around"), self._search_bar)
        self._chk_wrap_around.setChecked(True)
        search_layout.addWidget(self._chk_match_case)
        search_layout.addWidget(self._chk_whole_word)
        search_layout.addWidget(self._chk_wrap_around)

        self._btn_prev = QPushButton(self.tr("Previous"), self._search_bar)
        self._btn_next = QPushButton(self.tr("Next"), self._search_bar)
        self._btn_replace = QPushButton(self.tr("Replace"), self._search_bar)
        self._btn_replace_all = QPushButton(self.tr("Replace All"), self._search_bar)
        self._btn_close_search = QPushButton(self.tr("Close"), self._search_bar)

        search_layout.addWidget(self._btn_prev)
        search_layout.addWidget(self._btn_next)
        search_layout.addWidget(self._btn_replace)
        search_layout.addWidget(self._btn_replace_all)
        search_layout.addWidget(self._btn_close_search)

        # Wire search bar signals.
        self._btn_next.clicked.connect(self._search_find_next)
        self._btn_prev.clicked.connect(self._search_find_previous)
        self._btn_replace.clicked.connect(self._search_replace_one)
        self._btn_replace_all.clicked.connect(self._search_replace_all)
        self._btn_close_search.clicked.connect(self._hide_search_bar)
        self._search_entry.returnPressed.connect(self._search_find_next)
        self._replace_entry.returnPressed.connect(self._search_replace_one)

        self._search_bar.setVisible(False)

        # Main content: a QTabWidget, each tab containing an editor + preview
        # splitter so multiple documents can be open at once.
        self._tab_widget = QTabWidget(container)

        # Use a custom tab bar that supports inline renaming.
        rename_tab_bar = _RenamableTabBar(self._tab_widget)
        self._tab_widget.setTabBar(rename_tab_bar)

        self._tab_widget.setTabsClosable(True)
        self._tab_widget.currentChanged.connect(self._on_tab_changed)
        self._tab_widget.tabCloseRequested.connect(self._on_tab_close_requested)

        # Create the initial tab backed by the initial in-memory document.
        self._create_tab_for_document(self._document)

        # Assemble layout: top bar above the search bar and tab widget.
        root_layout.addWidget(top_bar)
        root_layout.addWidget(self._search_bar)
        root_layout.addWidget(self._tab_widget, 1)

        self.setCentralWidget(container)

        # Keyboard shortcuts for search / replace (similar to typical text editors).
        self._shortcut_find = QShortcut(QKeySequence("Ctrl+F"), self)
        self._shortcut_find.activated.connect(self._show_find_dialog)

        self._shortcut_find_next = QShortcut(QKeySequence("F3"), self)
        self._shortcut_find_next.activated.connect(self._search_find_next)

        self._shortcut_find_previous = QShortcut(QKeySequence("Shift+F3"), self)
        self._shortcut_find_previous.activated.connect(self._search_find_previous)

        self._shortcut_replace = QShortcut(QKeySequence("Ctrl+H"), self)
        self._shortcut_replace.activated.connect(self._show_replace_dialog)

        # After the first tab is created, keep the per-tab document mapping in
        # sync with the active document.
        if not self._tab_documents:
            self._tab_documents.append(self._document)

        # Ensure there is a status bar and a permanent label for current
        # project space so that it is always visible in the bottom-left.
        bar = self.statusBar()
        if bar is None:
            bar = QStatusBar(self)
            self.setStatusBar(bar)

        self._project_space_label = QLabel(self)
        bar.addPermanentWidget(self._project_space_label, 1)

        # Center-ish document statistics label.
        self._stats_label = QLabel(self)
        bar.addPermanentWidget(self._stats_label, 0)

        # Sync status label (between stats and user info).
        self._sync_status_label = QLabel(self)
        bar.addPermanentWidget(self._sync_status_label, 0)

        # Story / Screenplay ID link label. When a document is associated with
        # a Crowdly story or screenplay, this shows e.g. "Story ID: <uuid>" or
        # "Screenplay ID: <uuid>" as a clickable link.
        self._story_link_label = QLabel(self)
        self._story_link_label.setText("")
        self._story_link_label.setTextFormat(Qt.TextFormat.RichText)
        self._story_link_label.setOpenExternalLinks(False)
        self._story_link_label.linkActivated.connect(self._on_story_link_activated)
        bar.addPermanentWidget(self._story_link_label, 0)

        # Right-aligned user label.
        self._user_label = QLabel(self)
        bar.addPermanentWidget(self._user_label, 0)

        self._update_document_stats_label()
        self._update_sync_status_label()
        self._update_user_status_label()
        self._update_story_link_label()

    # Internal helpers ----------------------------------------------------

    def _update_window_title(self) -> None:
        """Update the OS window title with app name and current filename.

        Many window managers center the full title string, so we cannot control
        alignment of the app name vs. filename independently; instead we show
        both in a single title, e.g. "document.md — Distraction-Free Editor".
        """

        app_name = self.tr("Distraction-Free Editor")
        title = app_name

        path = getattr(self._document, "path", None)
        if isinstance(path, Path):
            try:
                name = path.name
            except Exception:
                try:
                    name = str(path)
                except Exception:
                    name = ""
            if name:
                title = f"{name} — {app_name}"

        try:
            self.setWindowTitle(title)
        except Exception:
            # Never let title updates affect core behaviour.
            pass

    def _update_filename_header_label(self) -> None:
        """Update any inline filename header label, if present.

        Current builds do not expose a dedicated filename header widget, but
        older experiments referenced this helper. To keep the code robust we
        implement it as a no-op unless a suitable label is attached.
        """

        label = getattr(self, "_filename_header_label", None)
        if label is None:
            return
        try:
            from PySide6.QtWidgets import QLabel  # local import; defensive

            if not isinstance(label, QLabel):
                return
        except Exception:
            return

        path = getattr(self._document, "path", None)
        text = ""
        try:
            if isinstance(path, Path):
                text = str(path)
        except Exception:
            text = ""

        try:
            label.setText(text)
        except Exception:
            pass

    def _update_project_space_status(self) -> None:
        """Update the status bar label with the current project space."""

        text: str
        if self._project_space_path:
            text = self.tr("Current project space: {path}").format(
                path=self._project_space_path
            )
        else:
            text = self.tr("Current project space: (not set)")

        # Prefer the dedicated label; fall back to showMessage if it is
        # missing for any reason.
        label = getattr(self, "_project_space_label", None)
        if isinstance(label, QLabel):
            label.setText(text)
        else:
            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(text)

    def _space_and_project_space_unset(self) -> bool:
        """Return True when there is no active project space configured.

        This reflects the "if none of the Space is set and the project space is
        also empty" condition: from the editor's perspective this simply means
        that there is no current project-space root (``self._project_space_path``).
        """

        return self._project_space_path is None

    def _maybe_warn_no_space_on_input(self, new_text: str) -> None:
        """Show a one-time warning when typing with no Space / project space.

        The dialog is modal, so the user cannot continue typing until it is
        closed, and it appears at most once per window.
        """

        if self._no_space_warning_shown:
            return
        if not self._space_and_project_space_unset():
            return
        if not new_text or not str(new_text).strip():
            return

        self._no_space_warning_shown = True

        QMessageBox.information(
            self,
            self.tr("Project space is not set"),
            self.tr("There is no Space set now. You need to set it now to keep your input."),
        )

    def _should_offer_save_for_document_without_space(self, document: Document | None) -> bool:
        """Return True if unsaved input should trigger a save/backup prompt.

        The prompt is only shown when there are no configured Spaces, no
        project space and the document is an in-memory draft without a
        filesystem path.
        """

        if not self._space_and_project_space_unset():
            return False
        if not isinstance(document, Document):
            return False

        content = getattr(document, "content", "") or ""
        if not content.strip():
            return False

        # Only treat documents without a concrete path as at-risk new drafts.
        if getattr(document, "path", None) is not None:
            return False

        return True

    def _broadcast_document_content_update(self) -> None:
        """Notify any master document windows that the current file changed.

        This is a best-effort helper; when no MasterDocumentWindow is
        interested in the current path the call is effectively a no-op.
        """

        bus = getattr(self, "_master_sync_bus", None)
        if bus is None:
            return

        # Only sync documents that have a concrete on-disk path; pure
        # in-memory drafts are not part of any master document.
        path = self._get_current_document_path()
        if path is None:
            return

        try:
            text = getattr(self._document, "content", "") or ""
        except Exception:
            text = ""

        try:
            bus.chapterContentUpdated.emit(path, text)
        except Exception:
            # Synchronisation must never interfere with core editing.
            pass

    def _on_include_content_updated(self, path_obj: object, new_content: str) -> None:
        """Refresh the active document when edited in a MasterDocumentWindow.

        This slot is invoked via :data:`master_sync_bus.includeContentUpdated`
        whenever an editable include container writes new text for a chapter
        file. When the current document path matches *path_obj*, we treat the
        update as if it were typed directly into the Markdown pane so that all
        existing autosave, preview and master-document broadcast logic apply.
        """

        try:
            incoming = Path(path_obj)
        except Exception:
            return

        path = self._get_current_document_path()
        if path is None:
            return

        try:
            same = path.resolve() == incoming.resolve()
        except Exception:
            same = path == incoming

        if not same:
            return

        try:
            # Delegate to the existing editor-change handler so that document
            # state, master-document broadcasts, autosave and preview renders
            # all stay consistent.
            self._on_editor_text_changed(new_content)
        except Exception:
            # Synchronisation must never interfere with core editing.
            pass

    def _broadcast_document_closed(self, document: Document | None) -> None:
        """Notify master document windows that *document* has been closed.

        Only documents with a concrete filesystem path are announced so that
        master documents referencing those chapters can immediately flush
        their own autosave timers.
        """

        bus = getattr(self, "_master_sync_bus", None)
        if bus is None:
            return
        if not isinstance(document, Document):
            return

        path = getattr(document, "path", None)
        if not isinstance(path, Path):
            return

        try:
            bus.chapterDocumentClosed.emit(path)
        except Exception:
            # Again, this must never prevent windows or tabs from closing.
            pass

    def _write_backup_to_home(self, document: Document) -> None:
        """Best-effort: write the document content to ``~/*.bupx``.

        This is used when the user chooses not to save explicitly but we still
        want to keep a safety copy of their input in the home directory.
        """

        try:
            home = Path.home()
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            backup_path = home / f"crowdly-backup-{timestamp}.bupx"
            storage.write_text(backup_path, getattr(document, "content", "") or "")
        except Exception:
            # Backups must never interfere with core behaviour.
            pass

    def _confirm_preserve_input_for_document(self, document: Document | None) -> bool:
        """Ask whether to save or discard unsaved input for *document*.

        Returns ``True`` when the caller may proceed with a potentially
        destructive action (new document, close tab, close window) and
        ``False`` when the action should be cancelled.
        """

        if not self._should_offer_save_for_document_without_space(document):
            return True

        # Inform the user that their current in-memory input would be lost.
        result = QMessageBox.question(
            self,
            self.tr("Unsaved input"),
            self.tr("Your input will be lost. Do you want to save it?"),
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.Yes,
        )

        if result == QMessageBox.StandardButton.Yes:
            # Let the user choose where to save the current document.
            default_name = datetime.now().strftime("untitled-%Y%m%d-%H%M%S.md")
            initial = str(Path.home() / default_name)

            path_str, _ = QFileDialog.getSaveFileName(
                self,
                self.tr("Save document"),
                initial,
                self.tr("Markdown files (*.md);;All files (*)"),
            )
            if not path_str:
                # User changed their mind; cancel the original action.
                return False

            target_path = Path(path_str)
            if target_path.suffix.lower() != ".md":
                target_path = target_path.with_suffix(".md")

            try:
                # Use the document model so metadata and dirty flags stay consistent.
                assert isinstance(document, Document)
                document.save(target_path)
            except Exception:
                # If the explicit save fails we do not proceed with destroying
                # the content.
                QMessageBox.warning(
                    self,
                    self.tr("Save failed"),
                    self.tr(
                        "The document could not be saved. The operation has been cancelled."
                    ),
                )
                return False

            return True

        # "No" branch: proceed with the requested operation but first write a
        # backup into the user's home directory.
        try:
            if isinstance(document, Document):
                self._write_backup_to_home(document)
        except Exception:
            pass

        return True

        # ------------------------------------------------------------------
        # Spaces (creative project-space roots)
        # ------------------------------------------------------------------

    def _ensure_space_registered(self, path: Path) -> None:
        """Add *path* to the known spaces list and settings if it is missing."""

        try:
            resolved_new = path.resolve()
        except Exception:
            resolved_new = path

        # Normalise in-memory list.
        if not isinstance(getattr(self, "_spaces", None), list):
            self._spaces = []

        for existing in self._spaces:
            try:
                existing_resolved = existing.resolve()
            except Exception:
                existing_resolved = existing
            if existing_resolved == resolved_new:
                break
        else:
            self._spaces.append(path)

        # Mirror into settings.spaces while preserving types.
        try:
            spaces_setting = getattr(self._settings, "spaces", None)
            if not isinstance(spaces_setting, list):
                spaces_setting = []
                setattr(self._settings, "spaces", spaces_setting)

            for existing in spaces_setting:
                try:
                    existing_path = existing if isinstance(existing, Path) else Path(existing)
                except TypeError:
                    continue
                try:
                    existing_resolved = existing_path.resolve()
                except Exception:
                    existing_resolved = existing_path
                if existing_resolved == resolved_new:
                    break
            else:
                spaces_setting.append(path)
        except Exception:
            # Best-effort bookkeeping; never interfere with core behaviour.
            pass

    def _rebuild_spaces_menu(self) -> None:
        """Recreate the Spaces menu based on the current list of spaces."""

        menu = getattr(self, "_spaces_menu", None)
        if not isinstance(menu, QMenu):  # pragma: no cover - defensive
            return

        menu.clear()

        # "Add" entry is always present.
        self._action_spaces_add = menu.addAction(self.tr("Add"), self._spaces_add)

        # Global "Remove" entry to clear the current project space setting.
        # This mirrors the behaviour of the "Clear project space setting"
        # action under the Settings menu so that the same operation is
        # reachable directly from the Spaces menu.
        self._action_spaces_clear = menu.addAction(
            self.tr("Remove"),
            self._clear_project_space,
        )

        spaces = getattr(self, "_spaces", None) or []
        if not spaces:
            return

        menu.addSeparator()

        # Track current project space for checked state.
        try:
            current = self._project_space_path.resolve() if self._project_space_path else None
        except Exception:
            current = self._project_space_path

        self._spaces_group = QActionGroup(self)
        self._spaces_group.setExclusive(True)

        for space in spaces:
            label = space.name or str(space)

            # Select action.
            select_action = menu.addAction(label)
            select_action.setData(str(space))
            select_action.setCheckable(True)
            self._spaces_group.addAction(select_action)

            try:
                space_resolved = space.resolve()
            except Exception:
                space_resolved = space
            if current is not None and space_resolved == current:
                select_action.setChecked(True)

            select_action.triggered.connect(self._on_space_selected)

            # Remove action with a small "x" marker.
            remove_label = self.tr("✕ Remove {name}").format(name=label)
            remove_action = menu.addAction(remove_label)
            remove_action.setData(str(space))
            remove_action.triggered.connect(self._on_space_removed)

    def _spaces_add(self) -> None:  # pragma: no cover - UI wiring
        """Add a new creative space and make it the active project space."""

        base_dir = str(self._project_space_path) if self._project_space_path else ""
        path_str = QFileDialog.getExistingDirectory(
            self,
            self.tr("Add creative space"),
            base_dir,
        )
        if not path_str:
            return

        new_space = Path(path_str)
        if not new_space.exists() or not new_space.is_dir():
            QMessageBox.warning(
                self,
                self.tr("Invalid directory"),
                self.tr("The selected path is not a directory."),
            )
            return

        self._ensure_space_registered(new_space)
        self._project_space_path = new_space
        self._settings.project_space = new_space
        save_settings(self._settings)

        self._update_project_space_status()
        self._rebuild_spaces_menu()

    def _on_space_selected(self) -> None:  # pragma: no cover - UI wiring
        """Switch the current project space to the chosen creative space."""

        action = self.sender()
        if not isinstance(action, QAction):
            return

        path_str = action.data()
        if not path_str:
            return

        try:
            space = Path(path_str)
        except TypeError:
            return

        self._ensure_space_registered(space)
        self._project_space_path = space
        self._settings.project_space = space
        save_settings(self._settings)

        self._update_project_space_status()
        self._rebuild_spaces_menu()

    def _on_space_removed(self) -> None:  # pragma: no cover - UI wiring
        """Remove a creative space from the menu and settings."""

        action = self.sender()
        if not isinstance(action, QAction):
            return

        path_str = action.data()
        if not path_str:
            return

        try:
            space = Path(path_str)
        except TypeError:
            return

        # Update in-memory list.
        new_spaces: list[Path] = []
        for existing in getattr(self, "_spaces", []):
            try:
                if existing.resolve() == space.resolve():
                    continue
            except Exception:
                if existing == space:
                    continue
            new_spaces.append(existing)
        self._spaces = new_spaces

        # Update settings.spaces.
        try:
            spaces_setting = getattr(self._settings, "spaces", None)
            if isinstance(spaces_setting, list):
                cleaned: list[Path] = []
                for existing in spaces_setting:
                    try:
                        existing_path = existing if isinstance(existing, Path) else Path(existing)
                    except TypeError:
                        continue
                    try:
                        if existing_path.resolve() == space.resolve():
                            continue
                    except Exception:
                        if existing_path == space:
                            continue
                    cleaned.append(existing_path)
                self._settings.spaces = cleaned
        except Exception:
            pass

        # If we just removed the active project space, clear it.
        try:
            if self._project_space_path is not None:
                try:
                    active_resolved = self._project_space_path.resolve()
                    removed_resolved = space.resolve()
                    matches = active_resolved == removed_resolved
                except Exception:
                    matches = self._project_space_path == space
                if matches:
                    self._project_space_path = None
                    self._settings.project_space = None
        except Exception:
            self._project_space_path = None
            self._settings.project_space = None

        save_settings(self._settings)
        self._update_project_space_status()
        self._rebuild_spaces_menu()

    def _on_editor_text_changed(self, text: str) -> None:  # pragma: no cover - UI wiring
        """Handle text changes from the editor.

        Updates the in-memory document, refreshes the preview, and schedules
        an autosave after a short delay. When the preview is updated
        programmatically, we preserve its caret/scroll state so that switching
        between panes does not jump the cursor back to the top.
        """

        # If there is no configured Space / project space yet, warn once so
        # the user knows they need to configure it to keep their input.
        self._maybe_warn_no_space_on_input(text)

        # Editing came from the Markdown pane; treat it as the active pane for
        # subsequent save/format decisions regardless of focus quirks.
        self._active_pane = "md"

        # For story/screenplay documents the Markdown pane edits the raw DSL
        # directly; for plain Markdown documents it edits Markdown as before.
        storage_format = getattr(self._document, "storage_format", "markdown") or "markdown"

        self._document.set_content(text)
        self._last_change_from_preview = False

        # Keep any master document window in sync while the user types.
        self._broadcast_document_content_update()

        preview_state = None
        if self.preview.isVisible():
            try:
                preview_state = self.preview.get_cursor_state()
            except Exception:
                preview_state = None

            if storage_format == "story_v1":
                # Render DSL → HTML.
                try:
                    html = story_markup.dsl_to_html(text)
                except Exception:
                    html = ""
                self.preview.set_html(html)
            elif storage_format == "screenplay_v1":
                try:
                    html = screenplay_markup.dsl_to_html(text)
                except Exception:
                    html = ""
                self.preview.set_html(html)
            else:
                # Plain Markdown path (existing behaviour).
                self.preview.set_markdown(text)

            # Restore caret/scroll position so the preview pane does not jump.
            if preview_state:
                try:
                    self.preview.restore_cursor_state(preview_state)
                except Exception:
                    pass

        # Restart autosave timer.
        if self._autosave_timer.isActive():
            self._autosave_timer.stop()
        self._autosave_timer.start(self._autosave_interval_ms)

        self._update_document_stats_label()

    def _on_preview_markdown_changed(self, text: str) -> None:  # pragma: no cover
        """Handle text changes from the WYSIWYG preview.

        *text* is the Markdown representation of the current document as edited
        in the preview.

        For plain Markdown documents we continue to treat this as canonical.
        For `.story` / `.screenplay` documents we convert the edited Markdown
        back into their DSL so that on-disk formats remain robust.
        """

        # Apply the same one-time "no Space set" warning when editing via the
        # WYSIWYG pane.
        self._maybe_warn_no_space_on_input(text)

        # Editing came from the WYSIWYG pane; treat it as the active pane for
        # subsequent save/format decisions regardless of focus quirks.
        self._active_pane = "wysiwyg"

        storage_format = getattr(self._document, "storage_format", "markdown") or "markdown"

        if storage_format == "story_v1":
            # For `.story` documents the WYSIWYG pane is canonical. Use the
            # current rich-text formatting (alignment, bold/italic/underline,
            # font color, font size, background highlight) to generate DSL
            # headers rather than relying on Markdown-only structure.
            try:
                build_story_dsl = getattr(self.preview, "build_story_dsl", None)
                if callable(build_story_dsl):
                    dsl = build_story_dsl()
                else:
                    # Fallback to the older Markdown → DSL path if needed.
                    dsl = story_markup.markdown_to_dsl(text)
            except Exception:
                dsl = text
            self._document.set_content(dsl)
            canonical_text = dsl
        elif storage_format == "screenplay_v1":
            # For `.screenplay` documents, mirror the `.story` behaviour and
            # treat the WYSIWYG pane as canonical when editing here.
            try:
                build_screenplay_dsl = getattr(self.preview, "build_screenplay_dsl", None)
                if callable(build_screenplay_dsl):
                    dsl = build_screenplay_dsl()
                else:
                    dsl = screenplay_markup.markdown_to_dsl(text)
            except Exception:
                dsl = text
            self._document.set_content(dsl)
            canonical_text = dsl
        else:
            # Plain Markdown: keep existing behaviour.
            self._document.set_content(text)
            canonical_text = text

        self._last_change_from_preview = True

        # Keep any master document window in sync while editing via WYSIWYG.
        self._broadcast_document_content_update()

        # Update the plain-text editor without triggering a feedback loop.
        editor_state = None
        try:
            editor_state = self.editor.get_cursor_state()
        except Exception:
            editor_state = None

        old_state = self.editor.blockSignals(True)
        try:
            self.editor.setPlainText(canonical_text)
        finally:
            self.editor.blockSignals(old_state)

        # Restore caret/scroll position in the Markdown pane so that switching
        # back from WYSIWYG does not reset the cursor to the top.
        if editor_state:
            try:
                self.editor.restore_cursor_state(editor_state)
            except Exception:
                pass

        # Restart autosave timer.
        if self._autosave_timer.isActive():
            self._autosave_timer.stop()
        self._autosave_timer.start(self._autosave_interval_ms)

        self._update_document_stats_label()

    def _create_tab_for_document(self, document: Document, title: str | None = None) -> int:
        """Create a new tab for *document* and return its index.

        The method initialises per-tab caret state so that cursor positions are
        preserved when switching between tabs.
        """

        # Each tab contains its own splitter with editor and preview widgets.
        splitter = QSplitter(Qt.Orientation.Horizontal, self._tab_widget)

        editor = EditorWidget(splitter)
        preview = PreviewWidget(splitter)

        splitter.addWidget(editor)
        splitter.addWidget(preview)
        splitter.setStretchFactor(0, 3)
        splitter.setStretchFactor(1, 2)

        # Keep document and preview in sync with editor content for this tab.
        editor.textChangedWithContent.connect(self._on_editor_text_changed)
        preview.markdownEdited.connect(self._on_preview_markdown_changed)

        # Track which pane currently has focus so save/autosave can select the
        # appropriate on-disk format.
        try:
            editor.paneFocused.connect(self._on_pane_focused)
        except Exception:
            pass
        try:
            preview.paneFocused.connect(self._on_pane_focused)
        except Exception:
            pass

        index = self._tab_widget.addTab(
            splitter,
            title or self.tr("Tab {index}").format(index=self._tab_widget.count() + 1),
        )

        # Ensure our parallel tab state lists stay aligned with the QTabWidget.
        self._tab_documents.insert(index, document)
        self._tab_widgets.insert(index, (editor, preview))
        # Initialise caret state for this tab.
        if len(self._tab_caret_states) <= index:
            self._tab_caret_states.append({})
        else:
            self._tab_caret_states.insert(index, {})

        # If this is the very first tab, make its widgets the active ones.
        if self._tab_widget.count() == 1:
            self.editor = editor
            self.preview = preview
            self._current_tab_index = 0

            # Ensure pane visibility matches the global checkboxes.
            if hasattr(self, "_chk_md_editor"):
                try:
                    self.editor.setVisible(self._chk_md_editor.isChecked())
                except Exception:
                    self.editor.setVisible(True)
            if hasattr(self, "_chk_wysiwyg"):
                try:
                    self._set_preview_visible(self._chk_wysiwyg.isChecked())
                except Exception:
                    self._set_preview_visible(True)

        return index

    def _on_tab_close_requested(self, index: int) -> None:  # pragma: no cover - UI wiring
        """Handle requests to close a tab via its 'x' button.

        When the last remaining tab is closed, we keep the tab in place but
        start a fresh blank document in it (equivalent to "New  New document"),
        so there is always at least one workspace available.
        """

        if index < 0 or index >= len(self._tab_widgets):
            return

        # Give the user a chance to preserve unsaved input when there is no
        # configured Space / project space and the tab holds an in-memory
        # draft.
        try:
            doc = self._tab_documents[index]
        except Exception:
            doc = None
        if not self._confirm_preserve_input_for_document(doc if isinstance(doc, Document) else None):
            return

        # If the tab being closed is the active one, flush any pending autosave
        # immediately so that the chapter file reflects the latest changes.
        if index == getattr(self, "_current_tab_index", -1):
            try:
                if self._autosave_timer.isActive():
                    self._autosave_timer.stop()
                self._perform_autosave()
            except Exception:
                pass

        # Let master document windows know that this chapter is no longer open
        # in this main window instance.
        try:
            self._broadcast_document_closed(doc if isinstance(doc, Document) else None)
        except Exception:
            pass

        # Special case: closing the only tab should behave like starting a new
        # document rather than removing the tab entirely.
        if self._tab_widget.count() <= 1:
            # Ensure the tab we're "closing" is treated as the active tab.
            if index != self._current_tab_index:
                self._tab_widget.setCurrentIndex(index)
                self._on_tab_changed(index)

            # Equivalent to using "New  New document" on the single tab, but we
            # skip an extra confirmation because we have already asked above.
            self._reset_current_tab_document()
            return

        # Remove the tab from the QTabWidget first; Qt will pick a new current
        # index automatically.
        self._tab_widget.removeTab(index)

        # Remove parallel state entries.
        try:
            self._tab_documents.pop(index)
            self._tab_widgets.pop(index)
            if 0 <= index < len(getattr(self, "_tab_caret_states", [])):
                self._tab_caret_states.pop(index)
        except Exception:
            pass

        # Determine the new current index and synchronise our state.
        new_index = self._tab_widget.currentIndex()
        if 0 <= new_index < len(self._tab_widgets):
            self._on_tab_changed(new_index)
        else:
            # Fallback: if indices get out of sync for any reason, reset to a
            # safe default when there is still at least one tab.
            if self._tab_widgets:
                self._on_tab_changed(0)

    def _on_tab_changed(self, index: int) -> None:  # pragma: no cover - UI wiring
        """Switch active editor/preview and document when the tab changes.

        In addition to updating the active document, this method preserves the
        caret/scroll position for each tab so that switching between tabs does
        not jump the cursor back to the top of the document.
        """

        if index < 0 or index >= len(self._tab_widgets):
            return

        # Persist caret state for the tab we are leaving, if any.
        prev_index = getattr(self, "_current_tab_index", -1)
        if 0 <= prev_index < len(self._tab_widgets) and 0 <= prev_index < len(self._tab_caret_states):
            prev_editor, prev_preview = self._tab_widgets[prev_index]
            state = self._tab_caret_states[prev_index]
            if not isinstance(state, dict):
                state = {}
                self._tab_caret_states[prev_index] = state
            try:
                state["md"] = prev_editor.get_cursor_state()
            except Exception:
                state["md"] = None
            try:
                state["wysiwyg"] = prev_preview.get_cursor_state()
            except Exception:
                state["wysiwyg"] = None

        self._current_tab_index = index

        # Update active widgets.
        self.editor, self.preview = self._tab_widgets[index]

        # Switch the in-memory document to the one associated with this tab.
        self._document = self._tab_documents[index]

        # Make sure the UI reflects the new document's content and statistics.
        # We avoid emitting extra change signals by blocking them while
        # updating the editor programmatically.
        old_block_state = self.editor.blockSignals(True)
        try:
            self.editor.setPlainText(self._document.content)
        finally:
            self.editor.blockSignals(old_block_state)

        # Refresh the WYSIWYG pane according to the document's storage format
        # so that `.story` / `.screenplay` tabs render via DSL  html instead
        # of showing raw tags as Markdown.
        self._refresh_preview_from_document(source="document")
        self._update_document_stats_label()
        self._update_story_link_label()
        self._update_window_title()

        # Restore caret state for the tab we just switched to, if available.
        if 0 <= index < len(self._tab_caret_states):
            state = self._tab_caret_states[index]
            if isinstance(state, dict):
                try:
                    self.editor.restore_cursor_state(state.get("md"))  # type: ignore[arg-type]
                except Exception:
                    pass
                try:
                    self.preview.restore_cursor_state(state.get("wysiwyg"))  # type: ignore[arg-type]
                except Exception:
                    pass

        # Keep the pane visibility in sync with the global checkboxes.
        if hasattr(self, "_chk_md_editor"):
            try:
                self.editor.setVisible(self._chk_md_editor.isChecked())
            except Exception:
                self.editor.setVisible(True)
        if hasattr(self, "_chk_wysiwyg"):
            try:
                self._set_preview_visible(self._chk_wysiwyg.isChecked())
            except Exception:
                self._set_preview_visible(True)

    def _on_pane_focused(self, pane: str) -> None:  # pragma: no cover - UI wiring
        """Remember which pane ("md" or "wysiwyg") is currently active.

        The value is driven by focus events from :class:`EditorWidget` and
        :class:`PreviewWidget`.
        """

        if pane in ("md", "wysiwyg"):
            self._active_pane = pane

    def _refresh_preview_from_document(self, *, source: str = "document") -> None:
        """Update the preview pane to match the current document.

        For `.story` / `.screenplay` documents the preview is always driven
        from the DSL so that switching tabs or toggling visibility never shows
        raw tags. For plain Markdown we preserve the existing behaviour of
        feeding the preview from either the document body or the editor text.
        """

        try:
            storage_format = getattr(self._document, "storage_format", "markdown") or "markdown"
        except Exception:
            storage_format = "markdown"

        if storage_format == "story_v1":
            try:
                text = getattr(self._document, "content", "") or ""
            except Exception:
                text = ""
            try:
                html = story_markup.dsl_to_html(text)
            except Exception:
                html = ""
            self.preview.set_html(html)
        elif storage_format == "screenplay_v1":
            try:
                text = getattr(self._document, "content", "") or ""
            except Exception:
                text = ""
            try:
                html = screenplay_markup.dsl_to_html(text)
            except Exception:
                html = ""
            self.preview.set_html(html)
        else:
            # Plain Markdown or unknown formats: keep the original behaviour.
            if source == "editor":
                try:
                    text = self.editor.get_text()
                except Exception:
                    text = getattr(self._document, "content", "") or ""
            else:
                text = getattr(self._document, "content", "") or ""
            self.preview.set_markdown(text)

    def _set_preview_visible(self, visible: bool) -> None:  # pragma: no cover - UI wiring
        """Show or hide the preview pane without affecting the editor.

        This is driven by the top-bar "WYSIWYG" checkbox. When hidden, the
        editor takes all horizontal space; when shown, the splitter layout is
        restored automatically by Qt. When the preview content is refreshed we
        preserve its caret/scroll state so that the cursor does not jump.
        """

        self.preview.setVisible(visible)

        # Keep the WYSIWYG checkbox in sync without triggering recursive
        # signal emission.
        if hasattr(self, "_chk_wysiwyg"):
            try:
                self._chk_wysiwyg.blockSignals(True)
                self._chk_wysiwyg.setChecked(visible)
                self._chk_wysiwyg.blockSignals(False)
            except Exception:
                pass

        # When re-showing the preview, ensure it has up-to-date content if
        # the last change came from the plain-text editor. If the last
        # change came from the WYSIWYG pane itself, preserve its rich
        # formatting (including alignment) and do not overwrite.
        if visible and not self._last_change_from_preview:
            prev_state = None
            try:
                prev_state = self.preview.get_cursor_state()
            except Exception:
                prev_state = None

            self._refresh_preview_from_document(source="editor")

            if prev_state:
                try:
                    self.preview.restore_cursor_state(prev_state)
                except Exception:
                    pass

    def _generate_default_document_path(self) -> Path:
        """Return a default path for new documents in the project space.

        The filename uses the pattern ``untitled-YYYYMMDD-HHMMSS<ext>`` where
        ``<ext>`` is chosen based on the current document kind and the active
        pane:

        * When the Markdown pane is active, ``.md`` is always used.
        * When the WYSIWYG pane is active, stories prefer ``.story`` and
          screenplays prefer ``.screenplay``; other documents fall back to
          ``.md``.
        """

        if not self._project_space_path:
            raise RuntimeError("Cannot generate document path without project space")

        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

        try:
            kind = getattr(self._document, "kind", "generic") or "generic"
        except Exception:
            kind = "generic"

        try:
            active = getattr(self, "_active_pane", "md") or "md"
        except Exception:
            active = "md"

        ext = format_types.default_extension_for(kind, active)
        return self._project_space_path / f"untitled-{timestamp}{ext}"

    def _map_external_path_to_project_space(self, external: Path) -> Path:
        """Map a file outside the project space into it as a new copy.

        The filename is preserved when possible. If a file with the same name
        already exists in the project space, a ``-copy-YYYYMMDD-HHMMSS``
        suffix is inserted before the extension to avoid overwriting.
        """

        if not self._project_space_path:
            raise RuntimeError("Cannot map external path without project space")

        candidate = self._project_space_path / external.name
        if not candidate.exists():
            return candidate

        stem = external.stem
        suffix = external.suffix
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        return self._project_space_path / f"{stem}-copy-{timestamp}{suffix}"

    def _perform_autosave(self) -> None:  # pragma: no cover - UI wiring
        """Persist the current document to disk if possible.

        Autosave is a no-op when there are no changes. If the document has a
        concrete path, it is saved there regardless of whether a project
        space is configured. Otherwise, we require a project space and create
        a new file inside it.
        """

        if not self._document.is_dirty:
            return

        if self._document.path is not None:
            # Start from the current path but, when editing via the WYSIWYG pane,
            # allow stories/screenplays to move to their dedicated extensions
            # (.story / .screenplay). We never delete the original file; we
            # simply start saving to the new path alongside it.
            target_path = self._document.path
            try:
                kind = getattr(self._document, "kind", "generic") or "generic"
                active = getattr(self, "_active_pane", "md") or "md"
                desired_ext = format_types.default_extension_for(kind, active)
                current_ext = target_path.suffix.lower()
                if active == "wysiwyg" and desired_ext and desired_ext.lower() != current_ext:
                    target_path = target_path.with_suffix(desired_ext)
            except Exception:
                # If anything goes wrong, fall back to the existing path.
                target_path = self._document.path
        elif self._project_space_path is not None:
            target_path = self._generate_default_document_path()
        else:
            # No file path and no project space to create one in.
            return

        # Update the document's storage_format based on the target extension so
        # that downstream components (metadata, exports, sync) can reason about
        # it. When we transition from plain Markdown to `.story`/`.screenplay`
        # we also perform a best-effort automatic migration of the current
        # Markdown content into the corresponding DSL.
        try:
            old_format = getattr(self._document, "storage_format", "markdown") or "markdown"
            suffix = target_path.suffix.lower()
            if suffix == ".story":
                new_format = "story_v1"
                if getattr(self._document, "kind", "generic") == "generic":
                    self._document.kind = "story"
            elif suffix == ".screenplay":
                new_format = "screenplay_v1"
                if getattr(self._document, "kind", "generic") == "generic":
                    self._document.kind = "screenplay"
            else:
                new_format = "markdown"

            # Automatic migration for existing Markdown documents the first
            # time they are saved as `.story` / `.screenplay`. We also repair
            # older `.story` / `.screenplay` files that do not yet use the DSL
            # tags by checking for the expected markers.
            raw_content = getattr(self._document, "content", "") or ""

            if new_format == "story_v1":
                active = getattr(self, "_active_pane", "md") or "md"

                # When saving from the WYSIWYG pane, treat its rich-text
                # formatting as canonical and build DSL directly from the
                # current document instead of guessing from Markdown.
                if active == "wysiwyg":
                    try:
                        build_story_dsl = getattr(self.preview, "build_story_dsl", None)
                        if callable(build_story_dsl):
                            self._document.content = build_story_dsl()
                            raw_content = self._document.content or ""
                    except Exception:
                        # If DSL building fails, fall through to the
                        # migration heuristics below using the existing text.
                        raw_content = getattr(self._document, "content", "") or ""

                # Only run Markdown → DSL migration when the content does not
                # already look like `.story` DSL (no [story_title header yet)
                # and the previous format was not already story_v1.
                is_already_dsl = "[story_title" in raw_content
                if old_format != "story_v1" and not is_already_dsl:
                    try:
                        self._document.content = story_markup.markdown_to_dsl(raw_content)
                    except Exception:
                        # If migration fails for any reason, fall back to
                        # storing the original text so no content is lost.
                        pass
            elif new_format == "screenplay_v1":
                active = getattr(self, "_active_pane", "md") or "md"

                if active == "wysiwyg":
                    try:
                        build_screenplay_dsl = getattr(self.preview, "build_screenplay_dsl", None)
                        if callable(build_screenplay_dsl):
                            self._document.content = build_screenplay_dsl()
                            raw_content = self._document.content or ""
                    except Exception:
                        raw_content = getattr(self._document, "content", "") or ""

                needs_migration = (
                    old_format != "screenplay_v1" and "[screenplay_title" not in raw_content
                )
                if needs_migration:
                    try:
                        self._document.content = screenplay_markup.markdown_to_dsl(raw_content)
                    except Exception:
                        pass

            self._document.storage_format = new_format
        except Exception:
            # Never let classification issues prevent a save.
            pass

        self._document.save(target_path)
        self._update_window_title()

        # Enqueue a local versioning snapshot under the `.crowdly` directory
        # so that all changes are captured for later revision/diff pipelines.
        try:
            device_id = getattr(self._settings, "device_id", None) or "desktop"
            body_md = self.preview.get_markdown()
            body_html = self.preview.get_html()
            local_queue.enqueue_full_snapshot_update(
                target_path,
                device_id=device_id,
                body_md=body_md,
                body_html=body_html,
            )
        except Exception:
            # Versioning must never interfere with core autosave.
            pass

        # After a successful save, optionally sync to the web backend.
        if self._sync_web_platform:
            self._schedule_web_sync()

    def _guess_document_title(self) -> str | None:
        """Return a best-effort title for the current document, if any."""

        text = getattr(self._document, "content", "") or ""
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            # Prefer first Markdown heading when available.
            if stripped.startswith("#"):
                candidate = stripped.lstrip("#").strip()
                if candidate:
                    return candidate
            # Fall back to first non-empty line.
            return stripped

        return None

    def _suggest_export_basename(self, title: str | None) -> str:
        """Return a filesystem-friendly base filename for exports."""

        base = (title or "untitled").strip() or "untitled"

        # Replace non-alphanumeric characters with spaces, then collapse.
        cleaned_chars: list[str] = []
        for ch in base:
            if ch.isalnum() or ch in ("-", "_"):
                cleaned_chars.append(ch)
            else:
                cleaned_chars.append(" ")

        cleaned = "".join(cleaned_chars)
        cleaned = " ".join(part for part in cleaned.split() if part)
        if not cleaned:
            return "untitled"

        # Spaces become underscores; keep filenames reasonably short.
        cleaned = cleaned.replace(" ", "_")
        if len(cleaned) > 80:
            cleaned = cleaned[:80].rstrip("_-")
        return cleaned or "untitled"

    def _build_export_request(self) -> ExportRequest:
        """Construct an :class:`ExportRequest` for the current document.

        The request always contains both a Markdown representation and an HTML
        representation so that exporters can choose the most appropriate
        starting point. For `.story` and `.screenplay` documents we derive
        HTML from their respective DSLs; for plain Markdown we prefer the
        WYSIWYG pane's rich-text HTML when it is the active pane so that
        inline formatting such as colours and text wrapping are preserved
        in PDF/EPUB exports.
        """

        raw_content = getattr(self._document, "content", "") or ""
        storage_format = getattr(self._document, "storage_format", "markdown") or "markdown"

        if storage_format == "story_v1":
            markdown = raw_content  # For now we expose the DSL text as-is.
            html = story_markup.dsl_to_html(raw_content)
        elif storage_format == "screenplay_v1":
            markdown = raw_content
            html = screenplay_markup.dsl_to_html(raw_content)
        else:
            markdown = raw_content

            # Base HTML rendered from the Markdown/DSL content.
            html_from_markdown = render_html_from_markdown(markdown)
            html = html_from_markdown

            # When the WYSIWYG pane is the active editing surface, prefer its
            # high-fidelity HTML representation so that inline formatting such
            # as colour, background highlights ("wrap"), and strikeout are
            # preserved in exports.
            try:
                active = getattr(self, "_active_pane", "md") or "md"
                last_from_preview = bool(getattr(self, "_last_change_from_preview", False))
                if active == "wysiwyg" or last_from_preview:
                    try:
                        wysiwyg_html = self.preview.get_html()
                    except Exception:
                        wysiwyg_html = ""
                    if (wysiwyg_html or "").strip():
                        html = wysiwyg_html
            except Exception:
                # If anything goes wrong, fall back to the Markdown-derived HTML
                # so that export continues to work.
                html = html_from_markdown

        title = self._guess_document_title()

        # Placeholder for richer metadata (author, language, etc.).
        metadata: dict[str, object] = {}

        return ExportRequest(markdown=markdown, html=html, title=title, metadata=metadata)

    def _export_document(self, fmt: ExportFormat, caption: str, filters: str) -> None:  # pragma: no cover - UI wiring
        """Common implementation for all export actions."""

        markdown = getattr(self._document, "content", "") or ""
        if not markdown.strip():
            QMessageBox.information(
                self,
                self.tr("Export"),
                self.tr("The current document is empty; there is nothing to export."),
            )
            return

        request = self._build_export_request()

        # Choose a sensible starting directory and filename.
        start_dir: Path | None = None
        if self._project_space_path is not None:
            start_dir = self._project_space_path
        else:
            path = getattr(self._document, "path", None)
            if isinstance(path, Path):
                start_dir = path.parent

        basename = self._suggest_export_basename(request.title)
        filename = f"{basename}{fmt.extension}"

        if start_dir is not None:
            initial = str(start_dir / filename)
        else:
            initial = filename

        path_str, _ = QFileDialog.getSaveFileName(
            self,
            caption,
            initial,
            filters,
        )
        if not path_str:
            return

        target_path = Path(path_str)
        if target_path.suffix.lower() != fmt.extension:
            target_path = target_path.with_suffix(fmt.extension)

        try:
            exporting_controller.export_to_path(fmt, request, target_path)
        except ExportError as exc:
            QMessageBox.warning(
                self,
                self.tr("Export failed"),
                str(exc),
            )
            return
        except Exception:
            import traceback

            traceback.print_exc()
            QMessageBox.critical(
                self,
                self.tr("Export failed"),
                self.tr("An unexpected error occurred while exporting the document."),
            )
            return

        bar = self.statusBar()
        if bar is not None:
            bar.showMessage(
                self.tr("Exported document to: {path}").format(path=target_path),
                5000,
            )

    def _change_interface_language(self, code: str) -> None:  # pragma: no cover - UI wiring
        """Update the preferred interface language in settings.

        Actual translation loading will be wired up in a later iteration; for
        now we simply persist the user's choice and reflect it in the menu.
        """

        self._settings.interface_language = code
        save_settings(self._settings)
        self._update_language_actions()
        self._update_user_status_label()

        app = QCoreApplication.instance()
        if app is not None:
            # Remove the previous translator, if any.
            if self._translator is not None:
                app.removeTranslator(self._translator)

            # Load and install a new translator for the selected language.
            from ..app import _load_translator_for  # local import to avoid cycle

            translator = _load_translator_for(code)
            if translator is not None:
                app.installTranslator(translator)
                self._translator = translator

        # Trigger a re-application of all translatable strings.
        self._retranslate_ui()

    def closeEvent(self, event) -> None:  # pragma: no cover - UI wiring
        """Ensure all extra top-level windows close with the main window."""

        # When there is unsaved in-memory input and no Space / project space is
        # configured, give the user a chance to save it or write a backup
        # before closing the window entirely.
        try:
            if not self._confirm_preserve_input_for_document(self._document):
                event.ignore()
                return
        except Exception:
            # Never prevent the window from closing due to prompt failures.
            pass

        # Flush any pending autosave so the current document is written before
        # the window and its tabs disappear.
        try:
            if self._autosave_timer.isActive():
                self._autosave_timer.stop()
            self._perform_autosave()
        except Exception:
            pass

        # Notify master document windows that any chapter files open in this
        # window are now closed.
        try:
            for doc in list(getattr(self, "_tab_documents", [])):
                self._broadcast_document_closed(doc if isinstance(doc, Document) else None)
        except Exception:
            pass

        try:
            app = QCoreApplication.instance()
            if app is not None:
                extra = getattr(app, "_extra_windows", None)
                if isinstance(extra, list):
                    # Create a copy so that closing windows that mutate
                    # the list does not interfere with iteration.
                    for win in list(extra):
                        try:
                            # Avoid closing self twice.
                            if win is self:
                                continue
                            win.close()
                        except Exception:
                            continue
        except Exception:
            pass

        super().closeEvent(event)

    def _update_language_actions(self) -> None:
        """Ensure the language menu reflects the current setting."""

        current = getattr(self._settings, "interface_language", "en")
        for code, action in self._language_actions.items():
            if isinstance(action, QAction):
                action.setChecked(code == current)

    def changeEvent(self, event):  # pragma: no cover - UI wiring
        """Handle language change events from Qt.

        When the active translator changes, Qt sends a ``LanguageChange``
        event to top-level widgets. We respond by re-applying all
        translatable strings.
        """

        if event.type() == QEvent.LanguageChange:
            self._retranslate_ui()

        super().changeEvent(event)

    def _retranslate_ui(self) -> None:
        """(Re-)apply all translatable UI strings for the current language."""

        # Window title shows app name and current filename when available.
        self._update_window_title()

        # Menus and actions.
        if hasattr(self, "_burger_button"):
            self._burger_button.setToolTip(self.tr("Main menu"))
        if hasattr(self, "_new_menu"):
            self._new_menu.setTitle(self.tr("New"))
        if hasattr(self, "_action_new_document"):
            self._action_new_document.setText(self.tr("New document"))
        if hasattr(self, "_action_new_directory"):
            self._action_new_directory.setText(self.tr("New directory"))
        if hasattr(self, "_action_new_story"):
            self._action_new_story.setText(self.tr("Story"))
        if hasattr(self, "_master_document_menu"):
            self._master_document_menu.setTitle(self.tr("Master document"))
        if hasattr(self, "_action_open_master_document"):
            self._action_open_master_document.setText(
                self.tr("Open master document window")
            )
        if hasattr(self, "_action_new_tab"):
            self._action_new_tab.setText(self.tr("Tab"))
        if hasattr(self, "_action_new_window"):
            self._action_new_window.setText(self.tr("Window"))
        if hasattr(self, "_open_menu"):
            self._open_menu.setTitle(self.tr("Open"))
        if hasattr(self, "_file_open_menu"):
            self._file_open_menu.setTitle(self.tr("File"))
        if hasattr(self, "_master_open_menu"):
            self._master_open_menu.setTitle(self.tr("Master document"))
        if hasattr(self, "_action_open_master_file"):
            self._action_open_master_file.setText(self.tr("From file..."))
        if hasattr(self, "_action_open_story_web"):
            self._action_open_story_web.setText(self.tr("Story on the web"))
        if hasattr(self, "_action_open_file_current_tab"):
            self._action_open_file_current_tab.setText(
                self.tr("in the current tab")
            )
        if hasattr(self, "_action_open_file_new_tab"):
            self._action_open_file_new_tab.setText(self.tr("in a new tab"))
        if hasattr(self, "_action_open_file_new_window"):
            self._action_open_file_new_window.setText(
                self.tr("in a new window")
            )
        if hasattr(self, "_settings_menu"):
            self._settings_menu.setTitle(self.tr("Settings"))
        if hasattr(self, "_spaces_menu"):
            self._spaces_menu.setTitle(self.tr("Spaces"))
        if hasattr(self, "_view_menu"):
            self._view_menu.setTitle(self.tr("View"))
        if hasattr(self, "_search_menu"):
            self._search_menu.setTitle(self.tr("Search"))
        if hasattr(self, "_action_search_find"):
            self._action_search_find.setText(self.tr("Find"))
        if hasattr(self, "_action_search_replace"):
            self._action_search_replace.setText(self.tr("Replace"))
        if hasattr(self, "_story_settings_menu"):
            self._story_settings_menu.setTitle(self.tr("Story settings"))

        # Search bar labels and controls.
        if hasattr(self, "_search_label"):
            self._search_label.setText(self.tr("Find:"))
        if hasattr(self, "_replace_label"):
            self._replace_label.setText(self.tr("Replace:"))
        if hasattr(self, "_chk_match_case"):
            self._chk_match_case.setText(self.tr("Match case"))
        if hasattr(self, "_chk_whole_word"):
            self._chk_whole_word.setText(self.tr("Match whole word"))
        if hasattr(self, "_chk_wrap_around"):
            self._chk_wrap_around.setText(self.tr("Wrap around"))
        if hasattr(self, "_btn_prev"):
            self._btn_prev.setText(self.tr("Previous"))
        if hasattr(self, "_btn_next"):
            self._btn_next.setText(self.tr("Next"))
        if hasattr(self, "_btn_replace"):
            self._btn_replace.setText(self.tr("Replace"))
        if hasattr(self, "_btn_replace_all"):
            self._btn_replace_all.setText(self.tr("Replace All"))
        if hasattr(self, "_btn_close_search"):
            self._btn_close_search.setText(self.tr("Close"))
        if hasattr(self, "_action_view_story_metadata"):
            self._action_view_story_metadata.setText(self.tr("View story metadata"))
        if hasattr(self, "_action_set_story_genre"):
            self._action_set_story_genre.setText(self.tr("Add genre"))
        if hasattr(self, "_action_refresh_story_from_web"):
            self._action_refresh_story_from_web.setText(self.tr("Refresh from web"))
        if hasattr(self, "_action_compare_revisions"):
            self._action_compare_revisions.setText(self.tr("Compare revisions"))
        if hasattr(self, "_action_view_md_editor"):
            self._action_view_md_editor.setText(
                self.tr("Markdown (MD) / HTML editor")
            )
        if hasattr(self, "_action_view_wysiwyg"):
            self._action_view_wysiwyg.setText(
                self.tr("WYSIWYG editor (preview pane)")
            )
            self._action_view_wysiwyg.setChecked(self._preview_toggle.isChecked())
        if hasattr(self, "_sync_menu"):
            self._sync_menu.setTitle(self.tr("Synchronisation with"))
        if hasattr(self, "_action_sync_web"):
            self._action_sync_web.setText(self.tr("web platform"))
            self._action_sync_web.setChecked(self._sync_web_platform)
        if hasattr(self, "_online_storage_menu"):
            self._online_storage_menu.setTitle(self.tr("online storage"))
        if hasattr(self, "_action_sync_dropbox"):
            self._action_sync_dropbox.setText(self.tr("Dropbox"))
            self._action_sync_dropbox.setChecked(self._sync_dropbox)
        if hasattr(self, "_action_sync_gdrive"):
            self._action_sync_gdrive.setText(self.tr("Google Drive"))
            self._action_sync_gdrive.setChecked(self._sync_google_drive)
        if hasattr(self, "_import_menu"):
            self._import_menu.setTitle(self.tr("Import"))
        if hasattr(self, "_action_import"):
            self._action_import.setText(self.tr("Import from file..."))
        if hasattr(self, "_connect_menu"):
            self._connect_menu.setTitle(self.tr("Connect"))
        if hasattr(self, "_action_connect_dropbox"):
            self._action_connect_dropbox.setText(self.tr("to Dropbox"))
        if hasattr(self, "_action_connect_gdrive"):
            self._action_connect_gdrive.setText(self.tr("to Google Drive"))
        if hasattr(self, "_export_menu"):
            self._export_menu.setTitle(self.tr("Export"))
        if hasattr(self, "_action_export_pdf"):
            self._action_export_pdf.setText(self.tr("as PDF"))
        if hasattr(self, "_action_export_epub"):
            self._action_export_epub.setText(self.tr("as EPUB"))
        if hasattr(self, "_action_export_docx"):
            self._action_export_docx.setText(self.tr("as docx"))
        if hasattr(self, "_action_export_odt"):
            self._action_export_odt.setText(self.tr("as odt"))
        if hasattr(self, "_action_export_fdx"):
            self._action_export_fdx.setText(self.tr("as FDX"))
        if hasattr(self, "_action_export_fountain"):
            self._action_export_fountain.setText(self.tr("as FOUNTAIN"))
        if hasattr(self, "_action_choose_project_space"):
            self._action_choose_project_space.setText(
                self.tr("Create or choose your project space")
            )
        if hasattr(self, "_action_clear_project_space"):
            self._action_clear_project_space.setText(
                self.tr("Clear project space setting")
            )
        if hasattr(self, "_language_menu"):
            self._language_menu.setTitle(self.tr("Change interface language"))
        if hasattr(self, "_action_spaces_add"):
            self._action_spaces_add.setText(self.tr("Add"))
        if hasattr(self, "_action_spaces_clear"):
            self._action_spaces_clear.setText(self.tr("Remove"))
        if hasattr(self, "_action_login_logout"):
            if self._logged_in:
                self._action_login_logout.setText(self.tr("Logout"))
            else:
                self._action_login_logout.setText(self.tr("Login"))
        if hasattr(self, "_action_quit"):
            self._action_quit.setText(self.tr("Quit"))

        # Update status bar dynamic labels that depend on translations.
        self._update_document_stats_label()
        self._update_sync_status_label()
        self._update_user_status_label()
        self._update_story_link_label()

        # Language entries within the submenu.
        labels_by_code = {
            "en": self.tr("English"),
            "ru": self.tr("Russian"),
            "pt": self.tr("Portuguese"),
            "kr": self.tr("Korean"),
            "ar": self.tr("Arabic"),
            "zh-Hans": self.tr("Chinese (Simplified)"),
            "zh-Hant": self.tr("Chinese (Traditional)"),
            "ja": self.tr("Japanese"),
        }
        for code, action in self._language_actions.items():
            label = labels_by_code.get(code)
            if label is not None:
                action.setText(label)

        # Update texts that are not automatically refreshed, such as the
        # project space label and preview toggle.
        self._update_project_space_status()
        self._rebuild_spaces_menu()
        if hasattr(self, "_preview_toggle"):
            self._preview_toggle.setText(self.tr("Preview"))
            self._preview_toggle.setToolTip(
                self.tr("Show or hide the preview pane")
            )

    def _compute_document_stats(self) -> tuple[int, int, int]:
        """Return (words, paragraphs, chapters) for the current document.

        - Words: whitespace-separated tokens in the source text.
        - Paragraphs: groups of non-empty lines separated by blank lines.
        - Chapters: Markdown headings, preferring level-2 ("## ") sections
          when present, otherwise falling back to level-1 ("# ") headings.
        """

        # Base stats on the WYSIWYG content so that what you see is what is
        # counted. We use the preview's markdown representation.
        text = self.preview.get_markdown()
        words = len(text.split()) if text else 0

        paragraphs = 0
        current_para_lines = 0
        lines = text.splitlines() if text else []
        for line in lines:
            if line.strip():
                current_para_lines += 1
            else:
                if current_para_lines:
                    paragraphs += 1
                    current_para_lines = 0
        if current_para_lines:
            paragraphs += 1

        # Prefer counting level-2 headings (## ...) as chapters when they
        # exist, since many documents use a single top-level title (# ...) and
        # then number their actual chapters as "## 1.", "## 2.", etc. For
        # simpler documents without subsections we fall back to counting
        # level-1 headings.
        stripped = [line.lstrip() for line in lines]
        h2_chapters = sum(1 for line in stripped if line.startswith("## "))
        if h2_chapters:
            chapters = h2_chapters
        else:
            chapters = sum(1 for line in stripped if line.startswith("# "))

        return words, paragraphs, chapters

    def _update_document_stats_label(self) -> None:
        """Update the central status-bar label with document statistics."""

        label = getattr(self, "_stats_label", None)
        if label is None:
            return

        words, paragraphs, chapters = self._compute_document_stats()
        label.setText(
            self.tr("Words: {words}   Paragraphs: {paras}   Chapters: {chapters}")
            .format(words=words, paras=paragraphs, chapters=chapters)
        )

    def _update_user_status_label(self) -> None:
        """Update the bottom-right user status label."""

        label = getattr(self, "_user_label", None)
        if label is None:
            return

        label.setText(
            self.tr("Logged in as: {username}").format(username=self._username)
        )

    def _update_sync_status_label(self) -> None:
        """Update the sync status label in the status bar."""

        label = getattr(self, "_sync_status_label", None)
        if label is None:
            return

        if getattr(self, "_sync_web_platform", False):
            # Prefer the explicit web credentials username when available,
            # otherwise fall back to the desktop username.
            web_user = None
            try:
                creds = getattr(self, "_crowdly_web_credentials", None)
                if isinstance(creds, tuple) and len(creds) >= 1:
                    web_user = creds[0]
            except Exception:
                web_user = None

            if not web_user:
                try:
                    candidate = getattr(self, "_username", None)
                    if isinstance(candidate, str) and candidate and candidate != "username":
                        web_user = candidate
                except Exception:
                    web_user = None

            if web_user:
                text = self.tr("Web sync: connected as {username}").format(username=web_user)
            else:
                text = self.tr("Web sync: enabled")
        else:
            text = self.tr("Web sync: off")

        label.setText(text)

    def _update_story_link_label(self) -> None:
        """Update the status-bar link for the current story/screenplay, if any."""

        label = getattr(self, "_story_link_label", None)
        if label is None:
            return

        # Default: hide label when there is no associated story/screenplay.
        text = ""
        url: str | None = None
        identifier: str | None = None
        kind: str | None = None

        try:
            path = self._get_current_document_path()
        except Exception:
            path = None

        if path is not None:
            try:
                md = file_metadata.read_story_metadata(path)

                # Prefer explicit story association when present.
                story_id = md.story_id or file_metadata.get_attr(path, "story_id")
                screenplay_id = file_metadata.get_attr(path, "screenplay_id")
                source_url = md.source_url or file_metadata.get_attr(path, "screenplay_url")

                if story_id:
                    identifier = story_id
                    kind = "story"
                    url = md.source_url or None
                    if not url:
                        base = getattr(self, "_settings", None)
                        base = getattr(base, "crowdly_base_url", None)
                        if isinstance(base, str) and base.strip():
                            url = f"{base.rstrip('/')}/story/{identifier}"
                elif screenplay_id:
                    identifier = screenplay_id
                    kind = "screenplay"
                    url = source_url or None
                    if not url:
                        base = getattr(self, "_settings", None)
                        base = getattr(base, "crowdly_base_url", None)
                        if isinstance(base, str) and base.strip():
                            url = f"{base.rstrip('/')}/screenplay/{identifier}"
            except Exception:
                identifier = None
                url = None
                kind = None

        self._current_story_or_screenplay_id = identifier
        self._current_story_or_screenplay_url = url

        if identifier and kind:
            if kind == "story":
                label_text = self.tr('Story ID: <a href="id">{id}</a>').format(id=identifier)
            else:
                label_text = self.tr('Screenplay ID: <a href="id">{id}</a>').format(id=identifier)
            text = label_text.replace("id", identifier)

        label.setText(text)

    def _on_story_link_activated(self, _href: str) -> None:  # pragma: no cover - UI wiring
        """Open the current story/screenplay in the system's default browser."""

        url = getattr(self, "_current_story_or_screenplay_url", None)
        if not url:
            return

        try:
            QDesktopServices.openUrl(QUrl(url))
        except Exception:
            QMessageBox.warning(
                self,
                self.tr("Open in browser"),
                self.tr("Could not open the story in the browser."),
            )

    # ------------------------------------------------------------------
    # Web sync helpers
    # ------------------------------------------------------------------

    def _ensure_story_metadata_for_path(self, path: Path) -> None:
        """Best-effort: ensure a local document has basic Crowdly story metadata.

        This is only used for *new* local stories that do not yet have a
        ``story_id``. When web sync is enabled and credentials + Crowdly
        backend URL are configured, we start a background thread that creates a
        story on the web platform and writes the resulting ``story_id`` and
        ``source_url`` into xattrs.

        The method returns immediately; callers should simply return early
        after invoking it and rely on the next sync attempt to see the
        metadata once the background initialisation completes.
        """

        # If metadata already present (either story or screenplay), nothing to do.
        if file_metadata.has_story_metadata(path) or file_metadata.get_attr(path, "screenplay_id"):
            return

        # Only create remote stories when web sync is actually enabled.
        if not getattr(self, "_sync_web_platform", False):
            return

        base_url_setting = getattr(self._settings, "crowdly_base_url", None)
        if not isinstance(base_url_setting, str) or not base_url_setting.strip():
            # Configuration problem; surface a gentle hint in the status bar.
            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(self.tr("Web sync: Crowdly base URL is not configured."), 5000)
            return

        creds = self._ensure_crowdly_web_credentials()
        if creds is None:
            return

        # Derive the actual API base from the configured base URL using the
        # same localhost 8080 -> 4000 logic as open-from-web flows.
        try:
            from ..crowdly_client import api_base_url_from_story_url

            api_base = api_base_url_from_story_url(base_url_setting)
        except Exception:
            api_base = (base_url_setting or "").rstrip("/")

        if not api_base:
            return

        # Avoid starting multiple init threads for the same document.
        if getattr(self, "_story_init_in_progress", False):
            return

        title = self._guess_document_title() or "Untitled"

        thread = _NewStoryInitThread(
            api_base=api_base,
            credentials=creds,
            local_path=path,
            title=title,
            parent=self,
        )

        thread.initSucceeded.connect(self._on_story_init_succeeded)
        thread.initFailed.connect(self._on_story_init_failed)
        thread.finished.connect(self._on_story_init_finished)
        thread.finished.connect(thread.deleteLater)

        self._story_init_thread = thread
        self._story_init_in_progress = True

        bar = self.statusBar()
        if bar is not None:
            bar.showMessage(self.tr("Linking story with Crowdly web..."), 5000)

        thread.start()

    # Slots ---------------------------------------------------------------

    def _reset_current_tab_document(self) -> None:
        """Internal helper: clear the current tab and start a blank document."""

        # Ensure any pending autosave is processed immediately.
        if self._autosave_timer.isActive():
            self._autosave_timer.stop()
        self._perform_autosave()

        # Reset in-memory document to a fresh, unsaved instance for this tab.
        self._document = Document()
        if 0 <= self._current_tab_index < len(self._tab_documents):
            self._tab_documents[self._current_tab_index] = self._document

        # Clear editor content without triggering autosave or preview updates.
        old_state = self.editor.blockSignals(True)
        try:
            self.editor.setPlainText("")
        finally:
            self.editor.blockSignals(old_state)

        # Clear preview explicitly.
        if self.preview.isVisible():
            self.preview.set_markdown("")

        # Clear any associated story/screenplay link.
        self._current_story_or_screenplay_id = None
        self._current_story_or_screenplay_url = None
        self._update_story_link_label()
        self._update_window_title()

    def _new_document(self) -> None:  # pragma: no cover - UI wiring
        """Save the current document (if needed) and start a new blank one.

        This only affects the *current* tab; other tabs keep their documents
        unchanged.
        """

        # When there is no configured Space / project space and the current
        # document is an in-memory draft, ask the user whether and how to
        # preserve their input before discarding it.
        if not self._confirm_preserve_input_for_document(self._document):
            return

        self._reset_current_tab_document()

    def _new_story_from_template(self) -> None:  # pragma: no cover - UI wiring
        """Create a new Crowdly story or screenplay using backend templates.

        When the user chooses "Story" from the New menu we show a small
        dialog asking whether they want a regular (novel) story or a
        screenplay, mirroring the Crowdly web platform behaviour.
        """

        import traceback

        try:
            try:
                from .create_story_dialog import CreateStoryDialog
            except Exception as exc:
                QMessageBox.warning(
                    self,
                    self.tr("Create story"),
                    self.tr(
                        "The story creation dialog could not be opened.\n\nDetails: {error}"
                    ).format(error=str(exc)),
                )
                return

            dialog = CreateStoryDialog(self)
            if dialog.exec() != QDialog.DialogCode.Accepted:
                return

            choice = dialog.choice()
            if choice == "story":
                self._create_regular_story_from_template()
            elif choice == "screenplay":
                self._create_screenplay_from_template()
        except Exception:
            traceback.print_exc()
            QMessageBox.critical(
                self,
                self.tr("Create story"),
                self.tr("An unexpected error occurred while starting story creation."),
            )

    def _create_regular_story_from_template(self) -> None:  # pragma: no cover - UI wiring
        """Create a new regular (novel) story via the Crowdly backend.

        This uses the same backend template endpoint as the web platform and
        then reuses the existing import-from-web pipeline to materialise a
        local Markdown document and metadata.
        """

        import traceback

        try:
            # Ensure project space exists so we have somewhere to save the file.
            if self._project_space_path is None:
                QMessageBox.information(
                    self,
                    self.tr("Project space required"),
                    self.tr("Please create or choose your project space first."),
                )
                self._choose_project_space()
                if self._project_space_path is None:
                    return

            base_url_setting = getattr(self._settings, "crowdly_base_url", None)
            if not isinstance(base_url_setting, str) or not base_url_setting.strip():
                QMessageBox.information(
                    self,
                    self.tr("Create story"),
                    self.tr(
                        "Crowdly base URL is not configured. Please configure it in settings and try again."
                    ),
                )
                return

            # Obtain web credentials (email/password) for the Crowdly backend.
            creds = self._ensure_crowdly_web_credentials()
            if not creds:
                return

            try:
                from ..crowdly_client import (
                    CrowdlyClient,
                    CrowdlyClientError,
                    api_base_url_from_story_url,
                )
            except Exception as exc:
                QMessageBox.critical(
                    self,
                    self.tr("Create story"),
                    self.tr(
                        "Crowdly client is unavailable.\n\nDetails: {error}"
                    ).format(error=str(exc)),
                )
                return

            # Derive backend API origin from the configured web/base URL.
            try:
                api_base = api_base_url_from_story_url(base_url_setting)
            except Exception:
                api_base = (base_url_setting or "").rstrip("/")

            if not api_base:
                QMessageBox.critical(
                    self,
                    self.tr("Create story"),
                    self.tr("Could not derive Crowdly API base URL from settings."),
                )
                return

            client = CrowdlyClient(api_base, credentials=creds)

            # Use the current document's guessed title as a starting point if
            # available, otherwise fall back to a generic title.
            title = self._guess_document_title() or "Untitled"

            created = client.create_desktop_story(title=title)
            story_url = created.get("story_url")
            story_id = created.get("story_id")
            if not isinstance(story_id, str) or not story_id.strip():
                raise CrowdlyClientError(
                    "Create-story response did not include story id.",
                    kind="invalid_response",
                )

            if not isinstance(story_url, str) or not story_url.strip():
                story_url = f"{api_base.rstrip('/')}/story/{story_id}"

            # Fetch the freshly-created story as Markdown and reuse the
            # existing import pipeline so naming/metadata stays consistent.
            story = client.fetch_story(story_url)
            self._on_crowdly_story_fetched(story)
        except Exception as exc:  # pragma: no cover - defensive
            traceback.print_exc()
            try:
                from ..crowdly_client import CrowdlyClientError

                if isinstance(exc, CrowdlyClientError):
                    message = str(exc)
                else:
                    message = self.tr(
                        "An unexpected error occurred while creating the story."
                    )
            except Exception:
                message = self.tr(
                    "An unexpected error occurred while creating the story."
                )

            QMessageBox.critical(
                self,
                self.tr("Create story"),
                message,
            )

    def _create_screenplay_from_template(self) -> None:  # pragma: no cover - UI wiring
        """Create a new screenplay via the Crowdly backend and open it locally."""

        import traceback

        try:
            # Ensure project space exists.
            if self._project_space_path is None:
                QMessageBox.information(
                    self,
                    self.tr("Project space required"),
                    self.tr("Please create or choose your project space first."),
                )
                self._choose_project_space()
                if self._project_space_path is None:
                    return

            base_url_setting = getattr(self._settings, "crowdly_base_url", None)
            if not isinstance(base_url_setting, str) or not base_url_setting.strip():
                QMessageBox.information(
                    self,
                    self.tr("Create screenplay"),
                    self.tr(
                        "Crowdly base URL is not configured. Please configure it in settings and try again."
                    ),
                )
                return

            creds = self._ensure_crowdly_web_credentials()
            if not creds:
                return

            try:
                from ..crowdly_client import (
                    CrowdlyClient,
                    CrowdlyClientError,
                    api_base_url_from_story_url,
                )
            except Exception as exc:
                QMessageBox.critical(
                    self,
                    self.tr("Create screenplay"),
                    self.tr(
                        "Crowdly client is unavailable.\n\nDetails: {error}"
                    ).format(error=str(exc)),
                )
                return

            try:
                api_base = api_base_url_from_story_url(base_url_setting)
            except Exception:
                api_base = (base_url_setting or "").rstrip("/")

            if not api_base:
                QMessageBox.critical(
                    self,
                    self.tr("Create screenplay"),
                    self.tr("Could not derive Crowdly API base URL from settings."),
                )
                return

            client = CrowdlyClient(api_base, credentials=creds)

            title = self._guess_document_title() or "Untitled Screenplay"

            created = client.create_desktop_screenplay(title=title)
            # Accept both snake_case and camelCase keys from the backend.
            screenplay_id = created.get("screenplay_id") or created.get("screenplayId")
            if not isinstance(screenplay_id, str) or not screenplay_id.strip():
                raise CrowdlyClientError(
                    "Create-screenplay response did not include screenplayId.",
                    kind="invalid_response",
                )

            scenes, blocks = client.get_screenplay_structure(screenplay_id)

            # Simple Markdown representation of the screenplay structure.
            lines: list[str] = []
            lines.append(f"# {title or 'Untitled Screenplay'}")
            lines.append("")
            for scene in scenes:
                # Use the slugline as the full scene heading text. Scene
                # numbering is tracked separately in the database; users are
                # free to name scenes however they like.
                lines.append(f"## {scene.slugline}".rstrip())
                lines.append("")
                scene_blocks = [
                    b for b in blocks if b.scene_id == scene.scene_id
                ]
                for block in scene_blocks:
                    text = block.text or ""
                    bt = (block.block_type or "").lower()
                    if bt == "character":
                        lines.append(text.upper())
                    elif bt == "parenthetical":
                        if not (text.startswith("(") and text.endswith(")")):
                            lines.append(f"({text})")
                        else:
                            lines.append(text)
                    else:
                        lines.append(text)
                    lines.append("")

            body_md = "\n".join(lines).rstrip() + "\n"

            # Persist as a new local document inside the project space.
            project_space = self._project_space_path
            assert project_space is not None

            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            filename = f"screenplay-{screenplay_id}-{timestamp}.md"
            local_path = project_space / filename

            doc = Document(path=None, content=body_md, is_dirty=True)
            # New screenplays start as Markdown but are classified explicitly so
            # that autosave can transition them into `.screenplay` files when
            # edited via the WYSIWYG pane.
            doc.kind = "screenplay"
            doc.storage_format = "markdown"
            doc.save(local_path)

            # Best-effort: record screenplay id + URL in xattrs so the status
            # bar can expose a clickable link similar to stories.
            try:
                file_metadata.set_attr(local_path, "screenplay_id", screenplay_id)
                base = getattr(self._settings, "crowdly_base_url", None)
                sp_url = None
                if isinstance(base, str) and base.strip():
                    sp_url = f"{base.rstrip('/')}/screenplay/{screenplay_id}"
                    file_metadata.set_attr(local_path, "screenplay_url", sp_url)

                # Also initialise generic story metadata so that the file is
                # treated as a first-class Crowdly item (author/initiator,
                # creation/change dates, etc.). For screenplays we reuse the
                # same StoryMetadata carrier; story_id remains empty and
                # screenplay_id is stored as a separate xattr.
                try:
                    from .. import file_metadata as fm

                    now_human = fm.now_human()
                    # CrowdlyClient caches the logged-in user id; reuse it as
                    # both author_id and initiator_id for now.
                    user_id = getattr(client, "_user_id", None)
                    fm.write_story_metadata(
                        local_path,
                        fm.StoryMetadata(
                            author_id=user_id if isinstance(user_id, str) else None,
                            initiator_id=user_id if isinstance(user_id, str) else None,
                            story_id=None,
                            story_title=title,
                            genre=None,
                            tags=None,
                            creation_date=now_human,
                            change_date=now_human,
                            last_sync_date=None,
                            source_url=sp_url,
                            body_format="markdown",
                            remote_updated_at=None,
                        ),
                        remove_missing=False,
                    )
                except Exception:
                    # Metadata initialisation is best-effort; never break
                    # screenplay creation if xattrs are unavailable.
                    pass
            except Exception:
                pass

            try:
                from ..versioning import local_queue

                local_queue.ensure_crowdly_dir_for_document(local_path)
            except Exception:
                pass

            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(
                    self.tr("Created new screenplay at: {path}").format(
                        path=local_path
                    ),
                    5000,
                )

            # Load into current tab.
            self._document = doc
            if 0 <= self._current_tab_index < len(self._tab_documents):
                self._tab_documents[self._current_tab_index] = self._document
            self._last_change_from_preview = False

            old_state = self.editor.blockSignals(True)
            try:
                self.editor.setPlainText(doc.content)
            finally:
                self.editor.blockSignals(old_state)

            self.preview.set_markdown(doc.content)
            self._update_document_stats_label()
            self._update_story_link_label()
            self._update_filename_header_label()
        except Exception as exc:  # pragma: no cover - defensive
            traceback.print_exc()
            try:
                from ..crowdly_client import CrowdlyClientError

                if isinstance(exc, CrowdlyClientError):
                    message = str(exc)
                else:
                    message = self.tr(
                        "An unexpected error occurred while creating the screenplay."
                    )
            except Exception:
                message = self.tr(
                    "An unexpected error occurred while creating the screenplay."
                )

            QMessageBox.critical(
                self,
                self.tr("Create screenplay"),
                message,
            )

    def _new_tab(self) -> None:  # pragma: no cover - UI wiring
        """Create a new tab with its own independent document."""

        new_doc = Document()
        index = self._create_tab_for_document(new_doc)
        self._tab_documents[index] = new_doc
        self._tab_widget.setCurrentIndex(index)

    def _new_window(self) -> None:  # pragma: no cover - UI wiring
        """Open a new top-level editor window sharing the same settings.

        The new window is shown in the foreground and activated so it does
        not appear "behind" the existing window on some window managers.
        """

        app = QCoreApplication.instance()
        if app is None:
            return

        try:
            # Reuse the current settings instance so preferences are shared.
            new_window = MainWindow(self._settings, parent=None, translator=self._translator)
            new_window.show()

            # Explicitly raise and activate the window so it opens in front.
            try:
                new_window.raise_()
                new_window.activateWindow()
            except Exception:
                pass

            # Keep a strong reference attached to the QApplication instance so
            # Python's garbage collector doesn't close the window prematurely.
            extra = getattr(app, "_extra_windows", None)
            if not isinstance(extra, list):
                extra = []
                setattr(app, "_extra_windows", extra)
            extra.append(new_window)
        except Exception:
            # Never let window-creation failures terminate the app.
            QMessageBox.critical(
                self,
                self.tr("Error"),
                self.tr("An unexpected error occurred while opening a new window."),
            )

    def _open_master_document_window(self) -> None:  # pragma: no cover - UI wiring
        """Open a full-window Master Document workspace.

        The new window reuses the current settings instance and project
        space but otherwise operates independently of the main editor
        tabs, so existing behaviour remains unchanged. The window is
        shown in the foreground to avoid opening behind the main window.
        """

        app = QCoreApplication.instance()
        if app is None:
            return

        try:
            window = MasterDocumentWindow(
                settings=self._settings,
                project_space=self._project_space_path,
                master_path=None,
                parent=None,
            )
            # Start maximised to satisfy the full-width / full-height
            # requirement; users can resize afterwards if desired.
            window.showMaximized()

            # Explicitly raise and activate so the window appears on top.
            try:
                window.raise_()
                window.activateWindow()
            except Exception:
                pass

            # Keep a strong reference attached to the QApplication instance so
            # Python's garbage collector does not close the window prematurely.
            extra = getattr(app, "_extra_windows", None)
            if not isinstance(extra, list):
                extra = []
                setattr(app, "_extra_windows", extra)
            extra.append(window)
        except Exception:
            QMessageBox.critical(
                self,
                self.tr("Error"),
                self.tr("An unexpected error occurred while opening the master document window."),
            )

    def _open_master_document_from_file(self) -> None:  # pragma: no cover - UI wiring
        """Let the user pick a `.master` file and open it in its own window."""

        start_dir = str(self._project_space_path) if self._project_space_path else ""
        path_str, _ = QFileDialog.getOpenFileName(
            self,
            self.tr("Open master document"),
            start_dir,
            self.tr("Master documents (*.master);;All files (*)"),
        )
        if not path_str:
            return

        self._open_master_document_from_path(Path(path_str))

    def _open_master_document_from_path(self, master_path: Path) -> None:
        """Open *master_path* in a dedicated MasterDocumentWindow.

        The window is maximised and activated so that it opens in the
        foreground rather than behind existing windows.
        """

        app = QCoreApplication.instance()
        if app is None:
            return

        try:
            window = MasterDocumentWindow(
                settings=self._settings,
                project_space=self._project_space_path,
                master_path=master_path,
                parent=None,
            )
            window.showMaximized()

            # Explicitly raise and activate so it appears on top.
            try:
                window.raise_()
                window.activateWindow()
            except Exception:
                pass

            extra = getattr(app, "_extra_windows", None)
            if not isinstance(extra, list):
                extra = []
                setattr(app, "_extra_windows", extra)
            extra.append(window)
        except Exception:
            QMessageBox.critical(
                self,
                self.tr("Error"),
                self.tr("An unexpected error occurred while opening the master document file."),
            )
    def _export_as_pdf(self) -> None:  # pragma: no cover - UI wiring
        """Export the current document as a PDF file."""

        self._export_document(
            ExportFormat.PDF,
            self.tr("Export as PDF"),
            self.tr("PDF files (*.pdf);;All files (*)"),
        )

    def _export_as_epub(self) -> None:  # pragma: no cover - UI wiring
        """Export the current document as an EPUB file."""

        self._export_document(
            ExportFormat.EPUB,
            self.tr("Export as EPUB"),
            self.tr("EPUB files (*.epub);;All files (*)"),
        )

    def _export_as_docx(self) -> None:  # pragma: no cover - UI wiring
        """Export the current document as a DOCX file."""

        self._export_document(
            ExportFormat.DOCX,
            self.tr("Export as docx"),
            self.tr("Word documents (*.docx);;All files (*)"),
        )

    def _export_as_odt(self) -> None:  # pragma: no cover - UI wiring
        """Export the current document as an ODT file."""

        self._export_document(
            ExportFormat.ODT,
            self.tr("Export as odt"),
            self.tr("OpenDocument text (*.odt);;All files (*)"),
        )

    def _export_as_fdx(self) -> None:  # pragma: no cover - UI wiring
        """Export the current document as a Final Draft (.fdx) file."""

        self._export_document(
            ExportFormat.FDX,
            self.tr("Export as FDX"),
            self.tr("Final Draft files (*.fdx);;All files (*)"),
        )

    def _export_as_fountain(self) -> None:  # pragma: no cover - UI wiring
        """Export the current document as a Fountain (.fountain) file."""

        self._export_document(
            ExportFormat.FOUNTAIN,
            self.tr("Export as Fountain"),
            self.tr("Fountain files (*.fountain);;All files (*)"),
        )

    def _import_from_file(self) -> None:  # pragma: no cover - UI wiring
        """Import content from an external file into the current document.

        The imported content replaces the current tab's document. Existing
        content is autosaved first (if needed) to avoid data loss.
        """

        # Determine which extensions are currently supported by the importing
        # subsystem. This depends on optional third-party libraries.
        exts = importing_controller.get_supported_extensions()
        if not exts:
            QMessageBox.information(
                self,
                self.tr("Import"),
                self.tr(
                    "Import from external formats is currently unavailable. "
                    "Optional import dependencies may not be installed."
                ),
            )
            return

        patterns = " ".join(f"*{ext}" for ext in exts)
        filter_supported = self.tr("Supported documents ({patterns})").format(
            patterns=patterns
        )
        filters = filter_supported + ";;" + self.tr("All files (*)")

        start_dir = str(self._project_space_path) if self._project_space_path else ""

        path_str, _ = QFileDialog.getOpenFileName(
            self,
            self.tr("Import document"),
            start_dir,
            filters,
        )
        if not path_str:
            return

        source_path = Path(path_str)

        try:
            markdown, metadata = importing_controller.import_to_markdown(source_path)
        except DocumentImportError as exc:
            QMessageBox.warning(
                self,
                self.tr("Import failed"),
                str(exc),
            )
            return
        except Exception:
            import traceback

            traceback.print_exc()
            QMessageBox.critical(
                self,
                self.tr("Import failed"),
                self.tr("An unexpected error occurred while importing the document."),
            )
            return

        if not markdown.strip():
            QMessageBox.information(
                self,
                self.tr("Import"),
                self.tr("The selected file did not contain any importable content."),
            )
            return

        # Autosave the current document first so we do not lose work.
        if self._autosave_timer.isActive():
            self._autosave_timer.stop()
        self._perform_autosave()

        # Replace the in-memory document for the current tab.
        self._document = Document(path=None, content=markdown, is_dirty=True)
        if 0 <= self._current_tab_index < len(self._tab_documents):
            self._tab_documents[self._current_tab_index] = self._document

        # Populate editor and preview without triggering extra autosave cycles.
        old_state = self.editor.blockSignals(True)
        try:
            self.editor.setPlainText(markdown)
        finally:
            self.editor.blockSignals(old_state)

        self.preview.set_markdown(markdown)
        self._last_change_from_preview = False
        self._update_document_stats_label()

    def _connect_to_dropbox(self) -> None:  # pragma: no cover - UI wiring
        """Connect to Dropbox (placeholder)."""

        QMessageBox.information(
            self,
            self.tr("Connect"),
            self.tr("Connecting to Dropbox is not implemented yet."),
        )

    def _connect_to_google_drive(self) -> None:  # pragma: no cover - UI wiring
        """Connect to Google Drive (placeholder)."""

        QMessageBox.information(
            self,
            self.tr("Connect"),
            self.tr("Connecting to Google Drive is not implemented yet."),
        )

    def _toggle_sync_web_platform(self) -> None:  # pragma: no cover - UI wiring
        """Toggle synchronisation with the web platform.

        When enabling sync we require valid Crowdly web credentials. If the
        user cancels the login dialog or credentials cannot be obtained, the
        checkbox is reverted and synchronisation remains disabled.
        """

        try:
            # Use the action's checked state as the desired target state.
            enabling: bool
            if hasattr(self, "_action_sync_web") and isinstance(self._action_sync_web, QAction):
                enabling = self._action_sync_web.isChecked()
            else:
                # Fallback for safety if the action is unavailable.
                enabling = not self._sync_web_platform

            if enabling:
                creds = self._ensure_crowdly_web_credentials()
                if not creds:
                    # User aborted or did not provide credentials -> keep sync off.
                    if hasattr(self, "_action_sync_web") and isinstance(self._action_sync_web, QAction):
                        self._action_sync_web.blockSignals(True)
                        self._action_sync_web.setChecked(False)
                        self._action_sync_web.blockSignals(False)
                    self._sync_web_platform = False
                    self._retranslate_ui()
                    # Do not start any timers.
                    return

                # We have credentials: enable sync and start polling.
                self._sync_web_platform = True
                self._retranslate_ui()
                self._update_sync_status_label()

                if self._web_pull_timer.isActive():
                    self._web_pull_timer.stop()
                self._web_pull_timer.start()

                # On enable, force a pull once so toggling OFF->ON always has an
                # effect (it reconciles local state with the remote state
                # immediately). Use authenticated credentials so private stories
                # work without extra prompts.
                self._start_pull_from_web(force=True, credentials=creds)

                # Also perform a best-effort structural pull for Spaces. When no
                # project space is configured yet, we mirror all remote Spaces
                # owned by the user into a local base directory. When a
                # project space is already set, we only pull for that Space.
                try:
                    if self._project_space_path is not None:
                        self._pull_current_space_from_web()
                    else:
                        self._pull_all_remote_spaces_if_no_project_space()
                except Exception:
                    # Structural pulls are best-effort; failures are already
                    # surfaced via message boxes inside the helpers above.
                    pass

                # Finally, when a project space is already configured, perform a
                # best-effort *push* of the current Space so that any new local
                # folders/files (like freshly created subdirectories) are
                # reflected on the web as soon as sync is enabled. This mirrors
                # the behaviour of the manual "Sync current Space now" action
                # that the user reports as working reliably.
                try:
                    if self._project_space_path is not None:
                        self._sync_current_space_to_web()
                except Exception:
                    # Pushing Spaces is also best-effort in this flow; detailed
                    # errors are already surfaced by the helper.
                    pass
            else:
                # Turning sync off: stop polling + pending push debounce.
                self._sync_web_platform = False
                if self._web_pull_timer.isActive():
                    self._web_pull_timer.stop()
                if self._web_sync_timer.isActive():
                    self._web_sync_timer.stop()
                self._retranslate_ui()
                self._update_sync_status_label()
        except Exception:
            # Best-effort: fall back to a safe "sync off" state.
            try:
                self._handle_web_auth_failure(None)
            except Exception:
                pass

    def _toggle_sync_dropbox(self) -> None:  # pragma: no cover - UI wiring
        """Toggle synchronisation with Dropbox (placeholder)."""

        self._sync_dropbox = not self._sync_dropbox
        self._retranslate_ui()

    def _toggle_sync_google_drive(self) -> None:  # pragma: no cover - UI wiring
        """Toggle synchronisation with Google Drive (placeholder)."""

        self._sync_google_drive = not self._sync_google_drive
        self._retranslate_ui()

    def _pull_all_remote_spaces_if_no_project_space(self) -> None:  # pragma: no cover - UI wiring
        """Pull all remote Spaces owned by the current user when no project space is set.

        This helper is only used when web sync is enabled while
        ``self._project_space_path`` is still ``None``. It lets the user
        choose a base directory and then creates one local folder per
        remote Space, mirroring the folder/file *structure* for each via
        :func:`websync.pull_space_from_web`.
        """

        from PySide6.QtWidgets import QMessageBox, QFileDialog
        from pathlib import Path as _Path

        # If a project space is already configured, this helper is a no-op.
        if self._project_space_path is not None:
            return

        # Resolve the Crowdly user id so that Spaces can be fetched.
        if not self._crowdly_user_id:
            if self._username and self._username != "username":
                try:
                    self._crowdly_user_id = local_auth.get_user_id_for_email(self._username)
                except Exception:
                    self._crowdly_user_id = None

        if not self._crowdly_user_id:
            QMessageBox.warning(
                self,
                self.tr("Pull Spaces from web"),
                self.tr(
                    "You need to be logged in to the Crowdly web platform before pulling Spaces."
                ),
            )
            return

        try:
            remote_spaces = websync.list_remote_spaces_for_user(self._settings, self._crowdly_user_id)  # type: ignore[arg-type]
        except Exception as exc:
            QMessageBox.warning(
                self,
                self.tr("Pull Spaces from web"),
                self.tr(
                    "Failed to list Spaces on the web platform.\n\nDetails: {error}"
                ).format(error=str(exc)),
            )
            return

        if not remote_spaces:
            # Nothing to mirror yet; keep behaviour quiet.
            return

        # Derive existing mappings from settings.space_sync_state and
        # spaces-status.json. This lets us avoid creating duplicate local
        # folders for Spaces that are already mapped and whose directories still
        # exist on disk.
        state = getattr(self._settings, "space_sync_state", {}) or {}
        if not isinstance(state, dict):
            state = {}

        # Merge any mappings from spaces-status.json that are not already in
        # the in-memory Settings object. This is best-effort and only adds
        # entries; it never removes or overwrites existing ones.
        try:
            status_state = load_spaces_status_log()
        except Exception:
            status_state = {}
        if isinstance(status_state, dict):
            for root_str, mapping in status_state.items():
                if root_str not in state and isinstance(mapping, dict):
                    state[root_str] = mapping

        existing_roots_by_space_id: dict[str, _Path] = {}
        if isinstance(state, dict):
            for root_str, mapping in state.items():
                if not isinstance(root_str, str) or not isinstance(mapping, dict):
                    continue
                sid = mapping.get("remote_space_id")
                if not isinstance(sid, str) or not sid:
                    continue
                try:
                    root_path = _Path(root_str).expanduser()
                except Exception:
                    continue
                if not root_path.exists() or not root_path.is_dir():
                    # Stale mapping: local folder was moved or deleted.
                    continue
                if sid not in existing_roots_by_space_id:
                    existing_roots_by_space_id[sid] = root_path

        mapped_spaces: list[dict] = []
        unmapped_spaces: list[dict] = []
        for row in remote_spaces:
            sid = row.get("id")
            if not isinstance(sid, str) or not sid:
                continue
            if sid in existing_roots_by_space_id:
                mapped_spaces.append(row)
            else:
                unmapped_spaces.append(row)

        summaries: list[str] = []
        first_root: _Path | None = None

        # First, pull updates for Spaces that already have a local mapping and
        # folder, then push a fresh snapshot so local structural changes are
        # reflected on the web as well.
        for row in mapped_spaces:
            sid = row.get("id")
            name = (row.get("name") or "No name creative space")
            local_root = existing_roots_by_space_id.get(sid)
            if local_root is None:
                continue

            # 1) Pull remote structural changes into this local root.
            try:
                pull_summary = websync.pull_space_from_web(
                    self._settings,
                    local_root,
                    self._crowdly_user_id,  # type: ignore[arg-type]
                )
            except Exception as exc:
                pull_summary = self.tr("Failed to pull: {error}").format(error=str(exc))

            # 2) Push local structural changes back to the web so that enabling
            # web sync behaves like a full two-way sync for already-mapped
            # Spaces.
            push_suffix: str
            try:
                ok, msg = websync.sync_space_to_web(
                    self._settings,
                    local_root,
                    self._crowdly_user_id,  # type: ignore[arg-type]
                )
                if ok:
                    push_suffix = self.tr("; pushed snapshot ({details})").format(details=msg)
                else:
                    push_suffix = self.tr("; failed to push snapshot ({details})").format(details=msg)
            except Exception as exc:
                push_suffix = self.tr("; failed to push snapshot ({details})").format(details=str(exc))

            summary = f"{pull_summary}{push_suffix}"
            summaries.append(f"{name}: {summary}")

            try:
                self._ensure_space_registered(local_root)
            except Exception:
                pass

            if first_root is None:
                first_root = local_root

        # If there are no unmapped Spaces left, we are done after pulling updates.
        if not unmapped_spaces:
            if first_root is not None:
                self._project_space_path = first_root
                self._settings.project_space = first_root
                save_settings(self._settings)
                self._update_project_space_status()
                self._rebuild_spaces_menu()
            if summaries:
                QMessageBox.information(
                    self,
                    self.tr("Spaces pulled from web"),
                    "\n\n".join(summaries),
                )
            return

        # Ask how the user wants to mirror only the *unmapped* Spaces locally.
        count = len(unmapped_spaces)
        box = QMessageBox(self)
        box.setIcon(QMessageBox.Icon.Question)
        box.setWindowTitle(self.tr("Sync Spaces from web"))
        box.setText(
            self.tr(
                "You have {count} Space(s) on the Crowdly platform that are not yet mirrored locally. How should they be created?"
            ).format(count=count),
        )
        same_dir_btn = box.addButton(
            self.tr("All into one folder"),
            QMessageBox.ButtonRole.AcceptRole,
        )
        per_space_btn = box.addButton(
            self.tr("Choose folder per Space"),
            QMessageBox.ButtonRole.ActionRole,
        )
        cancel_btn = box.addButton(
            self.tr("Cancel"),
            QMessageBox.ButtonRole.RejectRole,
        )
        box.setDefaultButton(same_dir_btn)
        box.exec()

        clicked = box.clickedButton()
        if clicked is cancel_btn:
            return
        per_space = clicked is per_space_btn

        def _safe_base_name_for_space(row: dict) -> str:
            """Return a filesystem-safe base folder name for a Space.

            This mirrors the Space name from the Crowdly platform as closely as
            possible. We deliberately do *not* append an id suffix here so that
            new Spaces are created simply as "Test 123" etc. A suffix is added
            later only when a naming collision occurs in the chosen parent
            directory.
            """

            raw = str(row.get("name") or "Space").strip() or "Space"
            # Simple filesystem-safe normalisation: replace path separators
            # and limit length.
            invalid = ["/", "\\"]
            for ch in invalid:
                raw = raw.replace(ch, "_")
            if len(raw) > 80:
                raw = raw[:80].rstrip(" .-_")
            return raw or "Space"

        def _pick_local_root_for_space(parent: _Path, row: dict) -> _Path:
            """Choose a local folder for an unmapped Space under *parent*.

            - Prefer a plain folder named after the Space (e.g. "Test 123").
            - If that already exists, fall back to a suffixed variant like
              "Test 123-<idprefix>". If that also exists, we append a
              numeric counter to ensure uniqueness.
            """

            base_name = _safe_base_name_for_space(row)
            candidate = parent / base_name
            if not candidate.exists():
                return candidate

            sid = str(row.get("id") or "").strip()
            prefix = base_name
            suffix_core = sid[:8] if sid else ""

            attempt = 1
            while True:
                if suffix_core and attempt == 1:
                    name = f"{prefix}-{suffix_core}"
                elif suffix_core:
                    name = f"{prefix}-{suffix_core}-{attempt}"
                else:
                    name = f"{prefix}-{attempt}"
                candidate = parent / name
                if not candidate.exists():
                    return candidate
                attempt += 1

        start_dir = str(getattr(self._settings, "project_space", "") or _Path.home())

        if not per_space:
            # Single base directory for all *unmapped* Spaces.
            base_dir = QFileDialog.getExistingDirectory(
                self,
                self.tr("Choose base folder for Spaces"),
                start_dir,
            )
            if not base_dir:
                return

            base = _Path(base_dir)

            for row in unmapped_spaces:
                sid = row.get("id")
                if not isinstance(sid, str) or not sid:
                    continue
                name = (row.get("name") or "No name creative space")
                local_root = _pick_local_root_for_space(base, row)
                try:
                    local_root.mkdir(parents=True, exist_ok=True)
                except Exception:
                    continue

                # Preseed mapping so pull_space_from_web uses this Space id
                # rather than guessing by path/name.
                try:
                    state = getattr(self._settings, "space_sync_state", {}) or {}
                    if not isinstance(state, dict):
                        state = {}
                    root_path = str(local_root)
                    mapping = dict(state.get(root_path) or {})
                    mapping["remote_space_id"] = sid
                    state[root_path] = mapping
                    self._settings.space_sync_state = state  # type: ignore[assignment]
                    save_settings(self._settings)
                except Exception:
                    pass

                try:
                    summary = websync.pull_space_from_web(self._settings, local_root, self._crowdly_user_id)  # type: ignore[arg-type]
                except Exception as exc:
                    summary = self.tr("Failed to pull: {error}").format(error=str(exc))

                summaries.append(f"{name}: {summary}")

                # Register this folder as a known creative Space in the UI.
                try:
                    self._ensure_space_registered(local_root)
                except Exception:
                    pass

                if first_root is None:
                    first_root = local_root
        else:
            # Let the user choose a directory for each *unmapped* Space individually.
            last_dir = start_dir
            for row in unmapped_spaces:
                sid = row.get("id")
                if not isinstance(sid, str) or not sid:
                    continue
                name = (row.get("name") or "No name creative space")

                parent_dir = QFileDialog.getExistingDirectory(
                    self,
                    self.tr("Choose folder for Space '{name}'").format(name=name),
                    last_dir,
                )
                if not parent_dir:
                    # Skip this Space if the user cancels.
                    continue

                last_dir = parent_dir
                parent = _Path(parent_dir)
                local_root = _pick_local_root_for_space(parent, row)
                try:
                    local_root.mkdir(parents=True, exist_ok=True)
                except Exception:
                    continue

                try:
                    state = getattr(self._settings, "space_sync_state", {}) or {}
                    if not isinstance(state, dict):
                        state = {}
                    root_path = str(local_root)
                    mapping = dict(state.get(root_path) or {})
                    mapping["remote_space_id"] = sid
                    state[root_path] = mapping
                    self._settings.space_sync_state = state  # type: ignore[assignment]
                    save_settings(self._settings)
                except Exception:
                    pass

                try:
                    summary = websync.pull_space_from_web(self._settings, local_root, self._crowdly_user_id)  # type: ignore[arg-type]
                except Exception as exc:
                    summary = self.tr("Failed to pull: {error}").format(error=str(exc))

                summaries.append(f"{name}: {summary}")

                try:
                    self._ensure_space_registered(local_root)
                except Exception:
                    pass

                if first_root is None:
                    first_root = local_root

        # Use the first mirrored or already-mapped Space as the active project
        # space so that subsequent sync operations have a well-defined root.
        if first_root is not None:
            self._project_space_path = first_root
            self._settings.project_space = first_root
            save_settings(self._settings)
            self._update_project_space_status()
            self._rebuild_spaces_menu()

        if summaries:
            QMessageBox.information(
                self,
                self.tr("Spaces pulled from web"),
                "\n\n".join(summaries),
            )

    def _pull_current_space_from_web(self) -> None:  # pragma: no cover - UI wiring
        """Manually pull folder/file structure from the Crowdly backend.

        This mirrors the current creative space's *structure* into the local
        project-space directory without overwriting or deleting existing local
        files. It is a conservative first step for two-way Spaces sync.
        """

        from PySide6.QtWidgets import QMessageBox

        project_space = self._project_space_path
        if project_space is None:
            QMessageBox.information(
                self,
                self.tr("Pull updates for current Space"),
                self.tr("There is no active project space set. Please choose or create one first."),
            )
            return

        # Ensure we know which Crowdly user is associated with this Space so
        # we can resolve the correct creative space id on the backend.
        if not self._crowdly_user_id:
            if self._username and self._username != "username":
                try:
                    self._crowdly_user_id = local_auth.get_user_id_for_email(self._username)
                except Exception:
                    self._crowdly_user_id = None

        if not self._crowdly_user_id:
            QMessageBox.warning(
                self,
                self.tr("Pull updates for current Space"),
                self.tr(
                    "You need to be logged in to the Crowdly web platform before pulling Space updates."
                ),
            )
            return

        try:
            summary = websync.pull_space_from_web(self._settings, project_space, self._crowdly_user_id)  # type: ignore[arg-type]
        except Exception as exc:  # pragma: no cover - network / filesystem dependent
            message = str(exc)

            # Special handling: the previously mapped creative Space has been
            # deleted on the web. Offer the user explicit choices instead of
            # silently recreating or ignoring it.
            if isinstance(message, str) and message.startswith("REMOTE_SPACE_MISSING:"):
                missing_id = message.split(":", 1)[1] if ":" in message else ""

                box = QMessageBox(self)
                box.setIcon(QMessageBox.Icon.Warning)
                box.setWindowTitle(self.tr("Space missing on web"))
                box.setText(
                    self.tr(
                        "The Crowdly Space previously linked to this project space no longer exists on the web.\n\n"
                        "Local folder: {path}\nRemote Space id: {sid}"
                    ).format(path=str(project_space), sid=missing_id or "(unknown)"),
                )
                recreate_btn = box.addButton(
                    self.tr("Recreate on web"),
                    QMessageBox.ButtonRole.AcceptRole,
                )
                detach_btn = box.addButton(
                    self.tr("Detach mapping"),
                    QMessageBox.ButtonRole.DestructiveRole,
                )
                cancel_btn = box.addButton(
                    self.tr("Cancel"),
                    QMessageBox.ButtonRole.RejectRole,
                )
                box.setDefaultButton(recreate_btn)
                box.exec()

                clicked = box.clickedButton()
                if clicked is recreate_btn:
                    try:
                        ok, msg = websync.sync_space_to_web(self._settings, project_space, self._crowdly_user_id)  # type: ignore[arg-type]
                        if ok:
                            QMessageBox.information(
                                self,
                                self.tr("Sync complete"),
                                msg,
                            )
                    except Exception as sync_exc:
                        QMessageBox.warning(
                            self,
                            self.tr("Sync failed"),
                            self.tr(
                                "Failed to recreate the Space on the web.\n\nDetails: {error}"
                            ).format(error=str(sync_exc)),
                        )
                elif clicked is detach_btn:
                    try:
                        state = getattr(self._settings, "space_sync_state", {}) or {}
                        if not isinstance(state, dict):
                            state = {}
                        root_path = str(project_space)
                        mapping = state.get(root_path)
                        if isinstance(mapping, dict) and "remote_space_id" in mapping:
                            mapping = dict(mapping)
                            mapping.pop("remote_space_id", None)
                            mapping.pop("last_pull_at", None)
                            state[root_path] = mapping
                            self._settings.space_sync_state = state  # type: ignore[assignment]
                            save_settings(self._settings)
                        QMessageBox.information(
                            self,
                            self.tr("Mapping detached"),
                            self.tr(
                                "The link between this project space and its Crowdly Space has been removed. "
                                "You can sync it again later to create or attach to a Space on the web."
                            ),
                        )
                    except Exception as detach_exc:
                        QMessageBox.warning(
                            self,
                            self.tr("Detach failed"),
                            self.tr(
                                "Could not update the local mapping for this project space.\n\nDetails: {error}"
                            ).format(error=str(detach_exc)),
                        )
                # In all three branches we stop further processing here.
                return

            QMessageBox.warning(
                self,
                self.tr("Pull failed"),
                self.tr(
                    "Failed to pull updates for the current Space from the web platform.\n\nDetails: {error}"
                ).format(error=message),
            )
            return

        QMessageBox.information(
            self,
            self.tr("Pull complete"),
            summary,
        )

    def _sync_current_space_to_web(self) -> None:  # pragma: no cover - UI wiring
        """Manually push the current project Space to the Crowdly backend.

        This is an alpha implementation that builds a snapshot of the
        current project-space directory and sends it to the
        /creative-spaces/:spaceId/sync endpoint using the logged-in
        local user id.
        """

        from PySide6.QtWidgets import QMessageBox

        project_space = self._project_space_path
        if project_space is None:
            QMessageBox.information(
                self,
                self.tr("Sync current Space now"),
                self.tr("There is no active project space set. Please choose or create one first."),
            )
            return

        # Ensure we know which Crowdly user to attribute this sync to. When the
        # user is logged in we try to resolve their local user id; otherwise we
        # kindly ask them to log in first.
        if not self._crowdly_user_id:
            if self._username and self._username != "username":
                try:
                    self._crowdly_user_id = local_auth.get_user_id_for_email(self._username)
                except Exception:
                    self._crowdly_user_id = None

        if not self._crowdly_user_id:
            QMessageBox.warning(
                self,
                self.tr("Sync current Space now"),
                self.tr(
                    "You need to be logged in to the Crowdly web platform before syncing Spaces."
                ),
            )
            return

        try:
            ok, message = websync.sync_space_to_web(self._settings, project_space, self._crowdly_user_id)  # type: ignore[arg-type]
        except Exception as exc:  # pragma: no cover - network dependent
            QMessageBox.warning(
                self,
                self.tr("Sync failed"),
                self.tr(
                    "Failed to sync the current Space to the web platform.\n\nDetails: {error}"
                ).format(error=str(exc)),
            )
            return

        if ok:
            try:
                self._update_sync_status_label()
            except Exception:
                pass
            QMessageBox.information(
                self,
                self.tr("Sync complete"),
                message,
            )

    def _toggle_login_logout(self) -> None:  # pragma: no cover - UI wiring
        """Handle Login / Logout menu action.

        When logged out, this opens a login dialog backed by the local
        PostgreSQL ``crowdly`` database. When already logged in, this logs
        the user out immediately.
        """

        if not self._logged_in:
            try:
                from .auth_dialog import AuthDialog
            except Exception as exc:  # pragma: no cover - import/runtime issues
                QMessageBox.warning(
                    self,
                    self.tr("Login unavailable"),
                    self.tr(
                        "The login dialog could not be opened.\n\nDetails: {error}"
                    ).format(error=str(exc)),
                )
                return

            dialog = AuthDialog(self)
            # The dialog is responsible for updating our login state via
            # ``apply_login`` on success. We still need to block here so the
            # dialog behaves modally, but we don't have to inspect the
            # return code.
            dialog.exec()
            return

        # Logged in -> perform a simple logout.
        self._logged_in = False
        self._username = "username"
        self._retranslate_ui()
        self._update_user_status_label()
        self._update_sync_status_label()
        QMessageBox.information(
            self,
            self.tr("Logout"),
            self.tr("You are now logged out."),
        )
        self._update_user_status_label()

    def apply_login(self, username: str) -> None:
        """Apply a successful login for *username* to the main window state."""

        self._username = username
        self._logged_in = True

        # Resolve the corresponding local user id so Spaces sync can attribute
        # updates to the correct Crowdly account.
        try:
            user_id = local_auth.get_user_id_for_email(username)
        except Exception:  # pragma: no cover - DB environment dependent
            user_id = None
        self._crowdly_user_id = user_id

        self._retranslate_ui()
        self._update_user_status_label()
        self._update_sync_status_label()

        # If web sync is already enabled and the user logs in afterwards,
        # immediately perform a best-effort structural pull so that newly
        # created Spaces on the web are reflected locally.
        try:
            if getattr(self, "_sync_web_platform", False):
                if self._project_space_path is not None:
                    self._pull_current_space_from_web()
                else:
                    self._pull_all_remote_spaces_if_no_project_space()
        except Exception:
            # Any errors in the automatic pull are surfaced via message boxes
            # inside the helper methods; they must not break login.
            pass

    def _on_md_checkbox_toggled(self, checked: bool) -> None:  # pragma: no cover - UI wiring
        """Show or hide the Markdown/HTML editor pane via the top-bar checkbox.

        If the user attempts to hide both panes, the editor checkbox is forced
        back on so that at least one pane remains visible.
        """

        # Prevent both panes from being hidden.
        other_visible = True
        if hasattr(self, "_chk_wysiwyg"):
            try:
                other_visible = self._chk_wysiwyg.isChecked()
            except Exception:
                other_visible = True
        if not checked and not other_visible:
            try:
                self._chk_md_editor.blockSignals(True)
                self._chk_md_editor.setChecked(True)
                self._chk_md_editor.blockSignals(False)
            except Exception:
                pass
            return

        self.editor.setVisible(checked)

    def _on_wysiwyg_checkbox_toggled(self, checked: bool) -> None:  # pragma: no cover - UI wiring
        """Show or hide the WYSIWYG preview pane via the top-bar checkbox.

        Hiding the preview makes the Markdown editor occupy the full width. If
        the user attempts to hide both panes, the WYSIWYG checkbox is forced
        back on.
        """

        # Prevent both panes from being hidden.
        other_visible = True
        if hasattr(self, "_chk_md_editor"):
            try:
                other_visible = self._chk_md_editor.isChecked()
            except Exception:
                other_visible = True
        if not checked and not other_visible:
            try:
                self._chk_wysiwyg.blockSignals(True)
                self._chk_wysiwyg.setChecked(True)
                self._chk_wysiwyg.blockSignals(False)
            except Exception:
                pass
            return

        self._set_preview_visible(checked)

    def _show_find_dialog(self) -> None:  # pragma: no cover - UI wiring
        """Show the inline search bar configured for Find-only operations."""

        if not hasattr(self, "editor"):
            return

        self._show_search_bar(replace_mode=False)

    def _show_replace_dialog(self) -> None:  # pragma: no cover - UI wiring
        """Show the inline search bar configured for Find+Replace operations."""

        if not hasattr(self, "editor"):
            return

        self._show_search_bar(replace_mode=True)

    def _show_search_bar(self, *, replace_mode: bool) -> None:  # pragma: no cover - UI wiring
        """Display the search bar and configure it for Find or Replace mode."""

        if not hasattr(self, "_search_bar") or self._search_bar is None:
            return

        # Pre-populate search text from current selection when available.
        try:
            cursor = self.editor.textCursor()
            selected = cursor.selectedText()
        except Exception:
            selected = ""

        if selected:
            self._search_entry.setText(selected)
        elif self._search_entry.text() == "" and getattr(self, "_search_text", ""):
            # Restore the last-used search text.
            self._search_entry.setText(self._search_text)

        # Configure visibility of replace-related controls.
        self._replace_label.setVisible(replace_mode)
        self._replace_entry.setVisible(replace_mode)
        self._btn_replace.setVisible(replace_mode)
        self._btn_replace_all.setVisible(replace_mode)

        self._search_bar.setVisible(True)

        # Focus behaviour mirrors typical editors: Find focuses the search
        # entry, Replace focuses the replacement entry so you can type the
        # replacement immediately.
        if replace_mode:
            self._replace_entry.setFocus()
            self._replace_entry.selectAll()
        else:
            self._search_entry.setFocus()
            self._search_entry.selectAll()

    def _hide_search_bar(self) -> None:  # pragma: no cover - UI wiring
        """Hide the inline search bar without changing editor content."""

        if hasattr(self, "_search_bar") and self._search_bar is not None:
            self._search_bar.setVisible(False)

    def _search_get_find_flags(self, *, backwards: bool = False) -> QTextDocument.FindFlags:
        """Return QTextDocument.FindFlags based on current search options."""

        flags = QTextDocument.FindFlags()
        try:
            if getattr(self, "_chk_match_case", None) is not None and self._chk_match_case.isChecked():
                flags |= QTextDocument.FindFlag.FindCaseSensitively
            if getattr(self, "_chk_whole_word", None) is not None and self._chk_whole_word.isChecked():
                flags |= QTextDocument.FindFlag.FindWholeWords
            if backwards:
                flags |= QTextDocument.FindFlag.FindBackward
        except Exception:
            # In case any of the widgets are not initialised yet, fall back to
            # default behaviour without options.
            if backwards:
                flags |= QTextDocument.FindFlag.FindBackward
        return flags

    def _get_search_target(self):
        """Return the active text widget for search operations.

        Preference order:
        - Widget with keyboard focus (Markdown editor vs WYSIWYG preview).
        - Visible Markdown editor.
        - Visible WYSIWYG preview.
        Returns ``None`` if neither is available.
        """

        editor = getattr(self, "editor", None)
        preview = getattr(self, "preview", None)

        try:
            if editor is not None and editor.isVisible() and editor.hasFocus():
                return editor
        except Exception:
            pass

        try:
            if preview is not None and preview.isVisible() and preview.hasFocus():
                return preview
        except Exception:
            pass

        try:
            if editor is not None and editor.isVisible():
                return editor
        except Exception:
            pass

        try:
            if preview is not None and preview.isVisible():
                return preview
        except Exception:
            pass

        return None

    def _search_find(self, *, backwards: bool, show_not_found: bool) -> bool:  # pragma: no cover - UI wiring
        """Core implementation for Find Next / Previous actions.

        Returns ``True`` when a match is found and ``False`` otherwise.
        """

        target = self._get_search_target()
        if target is None:
            return False

        pattern = self._search_entry.text()
        if not pattern:
            return False

        # Remember last-used search text.
        self._search_text = pattern

        flags = self._search_get_find_flags(backwards=backwards)

        # First attempt: start from the current cursor position.
        found = target.find(pattern, flags)

        # Optional wrap-around behaviour.
        try:
            wrap = getattr(self, "_chk_wrap_around", None)
            wrap_enabled = bool(wrap is None or wrap.isChecked())
        except Exception:
            wrap_enabled = True

        if not found and wrap_enabled:
            cursor = target.textCursor()
            if backwards:
                cursor.movePosition(QTextCursor.MoveOperation.End)
            else:
                cursor.movePosition(QTextCursor.MoveOperation.Start)
            target.setTextCursor(cursor)
            found = target.find(pattern, flags)

        if not found:
            if show_not_found:
                QMessageBox.information(
                    self,
                    self.tr("Find"),
                    self.tr("The specified text was not found."),
                )
            return False

        target.setFocus()
        return True

    def _search_find_next(self) -> None:  # pragma: no cover - UI wiring
        """Find the next occurrence of the current search text."""

        self._search_find(backwards=False, show_not_found=True)

    def _search_find_previous(self) -> None:  # pragma: no cover - UI wiring
        """Find the previous occurrence of the current search text."""

        self._search_find(backwards=True, show_not_found=True)

    def _search_replace_one(self) -> None:  # pragma: no cover - UI wiring
        """Replace the current match and move to the next one.

        If there is no current match, the method first searches for the next
        occurrence before performing the replacement.
        """

        target = self._get_search_target()
        if target is None:
            return

        search_text = self._search_entry.text()
        if not search_text:
            return

        replace_text = self._replace_entry.text()
        self._search_text = search_text
        self._replace_text = replace_text

        cursor = target.textCursor()
        selected = cursor.selectedText()

        def _matches_selection() -> bool:
            if not selected:
                return False
            try:
                match_case = getattr(self, "_chk_match_case", None)
                if match_case is not None and match_case.isChecked():
                    return selected == search_text
                return selected.casefold() == search_text.casefold()
            except Exception:
                return selected == search_text

        if not _matches_selection():
            # Move to the next occurrence first.
            if not self._search_find(backwards=False, show_not_found=True):
                return
            cursor = target.textCursor()

        # Replace the current selection.
        cursor.insertText(replace_text)
        target.setTextCursor(cursor)

        # Move to the next match, if any, without re-displaying the not-found
        # message when we simply reach the end.
        self._search_find(backwards=False, show_not_found=False)

    def _search_replace_all(self) -> None:  # pragma: no cover - UI wiring
        """Replace all occurrences of the search text in the current document."""

        target = self._get_search_target()
        if target is None:
            return

        search_text = self._search_entry.text()
        if not search_text:
            return

        replace_text = self._replace_entry.text()
        self._search_text = search_text
        self._replace_text = replace_text

        cursor = target.textCursor()
        cursor.movePosition(QTextCursor.MoveOperation.Start)
        target.setTextCursor(cursor)

        flags = self._search_get_find_flags(backwards=False)
        count = 0

        while True:
            found = target.find(search_text, flags)
            if not found:
                break
            cursor = target.textCursor()
            cursor.insertText(replace_text)
            target.setTextCursor(cursor)
            count += 1

        if count == 0:
            QMessageBox.information(
                self,
                self.tr("Replace"),
                self.tr("The specified text was not found."),
            )
        else:
            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(
                    self.tr("Replaced {count} occurrence(s).").format(count=count),
                    5000,
                )

    def _new_directory(self) -> None:  # pragma: no cover - UI wiring
        """Create a new directory on disk.

        The user is prompted for the parent directory (defaulting to the
        project space when available) and for the new directory name.
        """

        base_dir = str(self._project_space_path) if self._project_space_path else ""
        parent_dir = QFileDialog.getExistingDirectory(
            self,
            self.tr("Choose where to create the new directory"),
            base_dir,
        )
        if not parent_dir:
            return

        name, ok = QInputDialog.getText(
            self,
            self.tr("New directory"),
            self.tr("Directory name:"),
        )
        if not ok:
            return

        name = name.strip()
        if not name:
            return

        target = Path(parent_dir) / name
        if target.exists():
            QMessageBox.warning(
                self,
                self.tr("Directory exists"),
                self.tr("A file or directory with this name already exists."),
            )
            return

        try:
            target.mkdir(parents=False, exist_ok=False)
        except Exception:
            QMessageBox.warning(
                self,
                self.tr("Error"),
                self.tr("Could not create the directory."),
            )

    def _open_story_on_web(self) -> None:  # pragma: no cover - UI wiring
        """Open a story or screenplay from the web and import it into the project space."""

        import traceback

        try:
            # Ensure project space is configured (local-first requirement).
            if self._project_space_path is None:
                QMessageBox.information(
                    self,
                    self.tr("Project space required"),
                    self.tr("Please create or choose your project space first."),
                )
                self._choose_project_space()
                if self._project_space_path is None:
                    return

            try:
                from .open_story_dialog import OpenStoryDialog
            except Exception as exc:  # pragma: no cover
                QMessageBox.warning(
                    self,
                    self.tr("Error"),
                    self.tr("Could not open the web-story dialog.\n\nDetails: {error}").format(
                        error=str(exc)
                    ),
                )
                return

            dialog = OpenStoryDialog(self)
            if dialog.exec() != QDialog.DialogCode.Accepted:
                return

            user_input = dialog.value()
            if not user_input:
                return

            raw = user_input.strip()
            lower = raw.lower()

            # Screenplays are identified either by explicit /screenplay/ URLs or by
            # a bare screenplay_id. Regular stories continue to use full URLs.
            if lower.startswith("http://") or lower.startswith("https://"):
                if "/screenplay/" in lower:
                    self._start_screenplay_fetch(raw)
                else:
                    self._start_crowdly_fetch(raw)
            else:
                # Bare identifier -> treat as screenplay_id.
                self._start_screenplay_fetch(raw)
        except Exception:
            # Never allow an exception in a Qt slot to terminate the app.
            traceback.print_exc()
            QMessageBox.critical(
                self,
                self.tr("Error"),
                self.tr("An unexpected error occurred while opening the web story."),
            )

    def _start_crowdly_fetch(
        self,
        story_url: str,
        *,
        credentials: tuple[str, str] | None = None,
    ) -> None:  # pragma: no cover - UI wiring
        """Start fetching a story from Crowdly on a background thread."""

        import traceback

        try:
            thread = _CrowdlyFetchThread(story_input=story_url, credentials=credentials, parent=self)

            # UI handlers (queued back to the UI thread by Qt).
            thread.storyFetched.connect(self._on_crowdly_story_fetched)
            thread.fetchFailed.connect(
                lambda err: self._on_crowdly_story_fetch_failed(err, story_url=story_url)
            )

            # Ensure thread resources are reclaimed.
            thread.finished.connect(thread.deleteLater)

            # Keep reference so it is not GC'ed mid-flight.
            self._crowdly_fetch_thread = thread

            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(self.tr("Fetching story from the web..."))

            thread.start()
        except Exception:
            traceback.print_exc()
            QMessageBox.critical(
                self,
                self.tr("Error"),
                self.tr("An unexpected error occurred while starting the web fetch."),
            )

    def _start_screenplay_fetch(
        self,
        screenplay_input: str,
        *,
        credentials: tuple[str, str] | None = None,
    ) -> None:  # pragma: no cover - UI wiring
        """Start fetching a screenplay from Crowdly on a background thread."""

        import traceback

        try:
            raw = (screenplay_input or "").strip()
            if not raw:
                return

            # Normalise plain IDs to full URLs using the configured base URL.
            if not (raw.lower().startswith("http://") or raw.lower().startswith("https://")):
                base_url_setting = getattr(self._settings, "crowdly_base_url", None)
                if not isinstance(base_url_setting, str) or not base_url_setting.strip():
                    QMessageBox.information(
                        self,
                        self.tr("Open screenplay failed"),
                        self.tr(
                            "Crowdly base URL is not configured. Please configure it in settings and try again."
                        ),
                    )
                    return
                raw = f"{base_url_setting.rstrip('/')}/screenplay/{raw}"

            thread = _ScreenplayFetchThread(
                screenplay_input=raw,
                credentials=credentials,
                parent=self,
            )

            # UI handlers (queued back to the UI thread by Qt).
            thread.screenplayFetched.connect(self._on_crowdly_screenplay_fetched)
            thread.fetchFailed.connect(
                lambda err: self._on_crowdly_screenplay_fetch_failed(err, screenplay_input=raw)
            )

            # Ensure thread resources are reclaimed.
            thread.finished.connect(thread.deleteLater)

            # Keep reference so it is not GC'ed mid-flight.
            self._screenplay_fetch_thread = thread

            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(self.tr("Fetching screenplay from the web..."))

            thread.start()
        except Exception:
            traceback.print_exc()
            QMessageBox.critical(
                self,
                self.tr("Error"),
                self.tr("An unexpected error occurred while starting the screenplay fetch."),
            )

    def _on_crowdly_story_fetched(self, story) -> None:  # pragma: no cover - UI wiring
        """Handle a successful Crowdly fetch by persisting locally and loading."""

        import traceback

        # Clear any temporary status message.
        bar = self.statusBar()
        if bar is not None:
            bar.clearMessage()

        if self._project_space_path is None:
            QMessageBox.warning(
                self,
                self.tr("Error"),
                self.tr("Project space is not set."),
            )
            return

        try:
            from ..story_import import (
                map_story_to_document,
                persist_import_metadata,
                suggest_local_path,
            )

            doc = map_story_to_document(story)
            # Imported web stories start life as Markdown but are classified as
            # "story" documents so that WYSIWYG-based saves can move them into
            # the `.story` format when desired.
            doc.kind = "story"
            doc.storage_format = "markdown"

            local_path = suggest_local_path(self._project_space_path, story)
            doc.save(local_path)
            persist_import_metadata(local_path, story)

            # Ensure the per-directory `.crowdly` folder exists so subsequent
            # autosaves can start queueing versioning payloads immediately.
            try:
                local_queue.ensure_crowdly_dir_for_document(local_path)
            except Exception:
                pass

            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(self.tr("Imported story to: {path}").format(path=local_path))
        except Exception:
            # Log full traceback so it's visible during development.
            traceback.print_exc()
            QMessageBox.warning(
                self,
                self.tr("Error"),
                self.tr("Failed to save the imported story locally."),
            )
            return

        self._document = doc
        if 0 <= self._current_tab_index < len(self._tab_documents):
            self._tab_documents[self._current_tab_index] = self._document
        self._last_change_from_preview = False

        old_state = self.editor.blockSignals(True)
        try:
            self.editor.setPlainText(doc.content)
        finally:
            self.editor.blockSignals(old_state)

        self.preview.set_markdown(doc.content)
        self._update_document_stats_label()
        self._update_story_link_label()
        self._update_window_title()

    def _on_crowdly_screenplay_fetched(self, payload: object) -> None:  # pragma: no cover - UI wiring
        """Handle a successful screenplay fetch by persisting locally and loading."""

        import traceback

        # Clear any temporary status message.
        bar = self.statusBar()
        if bar is not None:
            bar.clearMessage()

        if self._project_space_path is None:
            QMessageBox.warning(
                self,
                self.tr("Error"),
                self.tr("Project space is not set."),
            )
            return

        try:
            if not isinstance(payload, dict):
                return

            screenplay_id = payload.get("screenplay_id")
            body = payload.get("body")
            title = payload.get("title") or "Untitled Screenplay"
            source_url = payload.get("source_url")
            creator_id = payload.get("creator_id")
            remote_updated_at = payload.get("remote_updated_at")

            if not isinstance(screenplay_id, str) or not screenplay_id.strip():
                return
            if not isinstance(body, str):
                return

            project_space = self._project_space_path
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            filename = f"screenplay-{screenplay_id}-{timestamp}.md"
            local_path = project_space / filename

            doc = Document(path=None, content=body, is_dirty=True)
            doc.save(local_path)

            # Record screenplay association so status bar + sync logic can use it.
            try:
                file_metadata.set_attr(local_path, "screenplay_id", screenplay_id)

                sp_url = None
                if isinstance(source_url, str) and source_url.strip():
                    sp_url = source_url.strip()
                else:
                    base = getattr(self._settings, "crowdly_base_url", None)
                    if isinstance(base, str) and base.strip():
                        sp_url = f"{base.rstrip('/')}/screenplay/{screenplay_id}"

                if sp_url:
                    file_metadata.set_attr(local_path, "screenplay_url", sp_url)
                    source_url = sp_url
            except Exception:
                pass

            # Initial StoryMetadata for the imported screenplay.
            try:
                now_human = file_metadata.now_human()
                author_id = creator_id if isinstance(creator_id, str) and creator_id else None

                file_metadata.write_story_metadata(
                    local_path,
                    file_metadata.StoryMetadata(
                        author_id=author_id,
                        initiator_id=author_id,
                        story_id=None,
                        story_title=title,
                        genre=None,
                        tags=None,
                        creation_date=now_human,
                        change_date=now_human,
                        last_sync_date=None,
                        source_url=source_url if isinstance(source_url, str) else None,
                        body_format="markdown",
                        remote_updated_at=remote_updated_at
                        if isinstance(remote_updated_at, str)
                        else None,
                    ),
                    remove_missing=False,
                )
            except Exception:
                # Metadata initialisation is best-effort.
                traceback.print_exc()

            # Ensure the per-directory `.crowdly` folder exists so versioning
            # can start queuing payloads immediately.
            try:
                local_queue.ensure_crowdly_dir_for_document(local_path)
            except Exception:
                pass

            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(
                    self.tr("Imported screenplay to: {path}").format(path=local_path),
                    5000,
                )

            # Load into current tab.
            self._document = doc
            if 0 <= self._current_tab_index < len(self._tab_documents):
                self._tab_documents[self._current_tab_index] = self._document
            self._last_change_from_preview = False

            old_state = self.editor.blockSignals(True)
            try:
                self.editor.setPlainText(doc.content)
            finally:
                self.editor.blockSignals(old_state)

            self.preview.set_markdown(doc.content)
            self._update_document_stats_label()
            self._update_story_link_label()
        except Exception:
            traceback.print_exc()
            QMessageBox.warning(
                self,
                self.tr("Error"),
                self.tr("Failed to save the imported screenplay locally."),
            )

    def _on_crowdly_story_fetch_failed(self, error: object, *, story_url: str) -> None:  # pragma: no cover - UI wiring
        """Show a user-friendly error when a web story cannot be loaded."""

        import traceback

        try:
            bar = self.statusBar()
            if bar is not None:
                bar.clearMessage()

            kind = None
            message = None
            if isinstance(error, dict):
                kind = error.get("kind")
                message = error.get("message")

            if not message:
                message = str(error)

            if kind == "auth_required":
                # Private story: ask for login and retry.
                try:
                    from .crowdly_login_dialog import CrowdlyLoginDialog
                except Exception as exc:  # pragma: no cover
                    QMessageBox.warning(
                        self,
                        self.tr("Open story failed"),
                        self.tr("Login dialog is unavailable.\n\nDetails: {error}").format(
                            error=str(exc)
                        ),
                    )
                    return

                # Reuse the desktop username/email when available.
                default_username = None
                try:
                    if getattr(self, "_logged_in", False):
                        candidate = getattr(self, "_username", None)
                        if isinstance(candidate, str) and candidate and candidate != "username":
                            default_username = candidate
                except Exception:
                    default_username = None

                dlg = CrowdlyLoginDialog(self, default_username=default_username)
                if dlg.exec() != QDialog.DialogCode.Accepted:
                    return

                creds = dlg.credentials()
                if creds is None:
                    QMessageBox.warning(
                        self,
                        self.tr("Login"),
                        self.tr("Username and password are required."),
                    )
                    return

                # Cache web credentials so that later sync/pull operations can
                # reuse them without forcing another login.
                try:
                    self._crowdly_web_credentials = (creds.username, creds.password)
                    self._update_sync_status_label()
                except Exception:
                    pass

                self._start_crowdly_fetch(
                    story_url, credentials=(creds.username, creds.password)
                )
                return

            # Not the owner / no access.
            if kind == "access_denied":
                QMessageBox.warning(
                    self,
                    self.tr("Open story failed"),
                    self.tr("You don't have access to the story."),
                )
                return

            QMessageBox.warning(
                self,
                self.tr("Open story failed"),
                message,
            )
        except Exception:
            traceback.print_exc()
            QMessageBox.critical(
                self,
                self.tr("Error"),
                self.tr("An unexpected error occurred while handling the web-story error."),
            )

    def _on_crowdly_screenplay_fetch_failed(self, error: object, *, screenplay_input: str) -> None:  # pragma: no cover - UI wiring
        """Show a user-friendly error when a web screenplay cannot be loaded."""

        import traceback

        try:
            bar = self.statusBar()
            if bar is not None:
                bar.clearMessage()

            kind = None
            message = None
            if isinstance(error, dict):
                kind = error.get("kind")
                message = error.get("message")

            if not message:
                message = str(error)

            QMessageBox.warning(
                self,
                self.tr("Open screenplay failed"),
                message,
            )
        except Exception:
            traceback.print_exc()
            QMessageBox.critical(
                self,
                self.tr("Error"),
                self.tr("An unexpected error occurred while handling the web-screenplay error."),
            )

    def _pick_markdown_file_to_open(self) -> Path | None:
        """Open a file dialog and return the chosen document path, if any.

        The filter includes Markdown, `.story` and `.screenplay` files so that
        all supported text formats are discoverable while keeping existing
        behaviour for Markdown-only workflows.
        """

        start_dir = str(self._project_space_path) if self._project_space_path else ""
        path_str, _ = QFileDialog.getOpenFileName(
            self,
            self.tr("Open document"),
            start_dir,
            self.tr("Text documents (*.md *.story *.screenplay);;All files (*)"),
        )
        if not path_str:
            return None

        return Path(path_str)

    def _open_document(self) -> None:  # pragma: no cover - UI wiring
        """Open an existing Markdown document and load it into the current tab."""

        external_path = self._pick_markdown_file_to_open()
        if external_path is None:
            return

        self._load_document_from_path(external_path)

    def _open_document_in_current_tab(self) -> None:  # pragma: no cover - UI wiring
        """Open a Markdown document in the current tab.

        This preserves the previous behaviour of the "Open → File" action,
        which always loaded the chosen document into the active workspace.
        """

        self._open_document()

    def _open_document_in_new_tab(self) -> None:  # pragma: no cover - UI wiring
        """Open a Markdown document in a brand new tab."""

        external_path = self._pick_markdown_file_to_open()
        if external_path is None:
            return

        # Create a new blank tab and make it active, then load the document
        # into that tab so existing content in other tabs is left untouched.
        self._new_tab()
        self._load_document_from_path(external_path)

        # Optionally, name the tab after the file for better discoverability.
        try:
            index = self._current_tab_index
            self._tab_widget.setTabText(index, external_path.name)
        except Exception:
            pass

    def _open_document_in_new_window(self) -> None:  # pragma: no cover - UI wiring
        """Open a Markdown document in a separate top-level window."""

        external_path = self._pick_markdown_file_to_open()
        if external_path is None:
            return

        app = QCoreApplication.instance()
        if app is None:
            return

        try:
            # Reuse the current settings instance so preferences are shared,
            # and carry over the active translator so language stays in sync.
            new_window = MainWindow(self._settings, parent=None, translator=self._translator)

            # Load the chosen document into the new window's initial tab,
            # preserving all existing project-space and metadata behaviour.
            new_window._load_document_from_path(external_path)

            new_window.show()

            # Explicitly raise and activate the window so it opens in front.
            try:
                new_window.raise_()
                new_window.activateWindow()
            except Exception:
                pass

            # Keep a strong reference attached to the QApplication instance so
            # Python's garbage collector doesn't close the window prematurely.
            extra = getattr(app, "_extra_windows", None)
            if not isinstance(extra, list):
                extra = []
                setattr(app, "_extra_windows", extra)
            extra.append(new_window)
        except Exception:
            # Mirror the behaviour of _new_window: never let failures terminate
            # the app.
            QMessageBox.critical(
                self,
                self.tr("Error"),
                self.tr("An unexpected error occurred while opening a new window."),
            )

    def _load_document_from_path(self, external_path: Path) -> None:
        """Load a document from *external_path* into the current tab.

        This centralises the logic for opening documents so that it is shared
        between the file-open dialog, command-line file arguments and any
        future entrypoints. All existing behaviour (including project-space
        mapping, story metadata hydration and status-bar updates) is preserved.
        """

        doc = Document.load(external_path)

        # If a project space is configured and the chosen file is *outside*
        # that space (not in any of its subdirectories), warn the user and
        # arrange for subsequent saves to go to a copy inside the project
        # space instead of overwriting the original file.
        if self._project_space_path is not None:
            project_root = self._project_space_path.resolve()
            try:
                inside = external_path.resolve().is_relative_to(project_root)
            except AttributeError:  # pragma: no cover - older Python fallback
                inside = str(external_path.resolve()).startswith(str(project_root))

            if not inside:
                QMessageBox.warning(
                    self,
                    self.tr("Outside project space"),
                    (
                        self.tr(
                            "You're opening a file outside of your project space."
                        )
                        + "\n\n"
                        + self.tr(
                            "The content of this file will be saved as a new copy "
                            "within the project space."
                        )
                    ),
                )
                mapped = self._map_external_path_to_project_space(external_path)

                # Immediately create a local copy inside the project space.
                # This ensures the user is always working on a project-space file
                # and we never overwrite the original external file.
                try:
                    doc.save(mapped)
                except Exception:
                    # If we cannot create the copy (permissions, etc.), fall back
                    # to opening the file from its original location.
                    QMessageBox.warning(
                        self,
                        self.tr("Error"),
                        self.tr(
                            "Could not create a copy of this file within the project space."
                        ),
                    )
                    doc.path = external_path

        # If this is a Crowdly-imported story (sidecar exists) but xattrs were
        # not written (older files), hydrate xattrs so story settings + sync
        # work without requiring re-import.
        try:
            from ..story_import import hydrate_xattrs_from_sidecar

            hydrate_xattrs_from_sidecar(doc.path)  # type: ignore[arg-type]
        except Exception:
            pass

        self._document = doc
        if 0 <= self._current_tab_index < len(self._tab_documents):
            self._tab_documents[self._current_tab_index] = self._document

        # Populate editor and preview without triggering autosave. We update
        # the preview explicitly. For `.story` / `.screenplay` documents the
        # editor shows raw DSL text and the preview is driven by DSL → HTML.
        old_state = self.editor.blockSignals(True)
        try:
            self.editor.setPlainText(doc.content)
        finally:
            self.editor.blockSignals(old_state)

        try:
            kind, storage_format = format_types.detect_kind_and_format(doc.path or external_path)
        except Exception:
            kind, storage_format = ("generic", "markdown")

        doc.kind = kind
        doc.storage_format = storage_format

        if storage_format == "story_v1":
            try:
                html = story_markup.dsl_to_html(doc.content)
            except Exception:
                html = ""
            self.preview.set_html(html)
        elif storage_format == "screenplay_v1":
            try:
                html = screenplay_markup.dsl_to_html(doc.content)
            except Exception:
                html = ""
            self.preview.set_html(html)
        else:
            self.preview.set_markdown(doc.content)

        self._update_document_stats_label()
        self._update_story_link_label()
        self._update_window_title()

    def _open_paths_from_cli(self, paths: list[str]) -> None:
        """Open one or more filesystem *paths* passed on the command line.

        The first valid path is loaded into the existing initial tab. Any
        additional valid paths are opened in new tabs so that multiple
        documents can be viewed side by side. All existing project-space
        behaviour applies because this delegates to :meth:`_load_document_from_path`.
        """

        if not paths:
            return

        valid_paths: list[Path] = []
        for raw in paths:
            try:
                candidate = Path(raw).expanduser()
            except Exception:
                continue
            if not candidate.exists() or not candidate.is_file():
                continue
            valid_paths.append(candidate)

        if not valid_paths:
            return

        # Split into `.master` files and regular documents.
        master_paths: list[Path] = []
        normal_paths: list[Path] = []
        for p in valid_paths:
            if p.suffix.lower() == ".master":
                master_paths.append(p)
            else:
                normal_paths.append(p)

        # Open each master document in its own dedicated window.
        for mp in master_paths:
            try:
                self._open_master_document_from_path(mp)
            except Exception:
                continue

        if not normal_paths:
            return

        # Open the first *non-master* file in the current tab.
        self._load_document_from_path(normal_paths[0])

        # Any remaining non-master files are opened in their own tabs.
        for extra in normal_paths[1:]:
            try:
                # Create a new blank tab and make it active.
                self._new_tab()
                # Ensure we are operating on the newly-selected tab.
                self._load_document_from_path(extra)

                # Optionally, rename the tab to match the filename for better
                # discoverability. This does not affect existing flows because
                # regular "Open" still uses the current tab.
                index = self._current_tab_index
                try:
                    name = extra.name
                    self._tab_widget.setTabText(index, name)
                except Exception:
                    pass
            except Exception:
                # Never let a CLI argument crash the whole application.
                continue

    def _choose_project_space(self) -> None:  # pragma: no cover - UI wiring
        """Open a dialog to create or choose the project space directory."""

        path = QFileDialog.getExistingDirectory(
            self,
            self.tr("Create or choose your project space"),
        )
        if not path:
            return

        # Store the selected directory and persist via settings as the
        # project space / library root.
        new_space = Path(path)
        self._project_space_path = new_space
        self._ensure_space_registered(new_space)
        self._settings.project_space = new_space
        save_settings(self._settings)
        self._update_project_space_status()
        self._rebuild_spaces_menu()

    def _clear_project_space(self) -> None:  # pragma: no cover - UI wiring
        """Clear the stored project space path without touching any files."""

        self._project_space_path = None
        self._settings.project_space = None
        save_settings(self._settings)
        self._update_project_space_status()

    def _get_current_document_path(self) -> Path | None:
        """Return the current document path, if it exists on disk."""

        path = getattr(self._document, "path", None)
        if not isinstance(path, Path):
            return None
        if not path.exists():
            return None
        return path

    def _open_compare_revisions(self) -> None:  # pragma: no cover - UI wiring
        """Open the Compare revisions window for the current document."""

        path = self._get_current_document_path()
        if path is None:
            QMessageBox.information(
                self,
                self.tr("Compare revisions"),
                self.tr("No file is currently loaded."),
            )
            return

        try:
            window = CompareRevisionsWindow(document_path=path, parent=self)
            window.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
            window.showMaximized()

            # Keep a strong reference attached to the QApplication instance so
            # Python's garbage collector doesn't close the window prematurely.
            app = QCoreApplication.instance()
            if app is not None:
                extra = getattr(app, "_compare_windows", None)
                if not isinstance(extra, list):
                    extra = []
                    setattr(app, "_compare_windows", extra)
                extra.append(window)
        except Exception:
            QMessageBox.warning(
                self,
                self.tr("Compare revisions"),
                self.tr("The Compare revisions window could not be opened."),
            )

    def _view_story_metadata(self) -> None:  # pragma: no cover - UI wiring
        """Display Crowdly story or screenplay metadata for the current file."""

        import traceback

        try:
            path = self._get_current_document_path()
            if path is None:
                QMessageBox.information(
                    self,
                    self.tr("Story metadata"),
                    self.tr("No file is currently loaded."),
                )
                return

            # Treat both regular stories (story_id) and screenplays (screenplay_id)
            # as Crowdly-linked documents for the purposes of metadata display.
            has_story = file_metadata.has_story_metadata(path)
            screenplay_id = file_metadata.get_attr(path, "screenplay_id")

            if not has_story and not screenplay_id:
                QMessageBox.information(
                    self,
                    self.tr("Story metadata"),
                    self.tr("This file is not associated with a Crowdly story."),
                )
                return

            # Best-effort: if this is a screenplay with minimal metadata, try to
            # hydrate author/initiator/title from the backend before showing.
            if screenplay_id:
                self._ensure_screenplay_metadata_for_path(path, screenplay_id)

            md = file_metadata.read_story_metadata(path)

            # Render in a simple, readable block. For screenplays we also show the
            # raw screenplay_id and screenplay_url xattrs when present.
            sp_id = screenplay_id or ""
            sp_url = file_metadata.get_attr(path, "screenplay_url") or ""
            source_url = md.source_url or sp_url

            lines = [
                f"author_id: {md.author_id or ''}",
                f"initiator_id: {md.initiator_id or ''}",
                f"story_id: {md.story_id or ''}",
                f"screenplay_id: {sp_id}",
                f"story_title: {md.story_title or ''}",
                f"genre: {md.genre or ''}",
                f"tags: {md.tags or ''}",
                f"creation_date: {md.creation_date or ''}",
                f"change_date: {md.change_date or ''}",
                f"last_sync_date: {md.last_sync_date or ''}",
                f"source_url: {source_url or ''}",
            ]

            QMessageBox.information(
                self,
                self.tr("Story metadata"),
                "\n".join(lines),
            )
        except Exception:
            traceback.print_exc()
            QMessageBox.critical(
                self,
                self.tr("Error"),
                self.tr("An unexpected error occurred while reading story metadata."),
            )

    def _set_or_clear_story_genre(self) -> None:  # pragma: no cover - UI wiring
        """Set/change/clear the story genre in file metadata."""

        import traceback

        try:
            path = self._get_current_document_path()
            if path is None:
                QMessageBox.information(
                    self,
                    self.tr("Genre"),
                    self.tr("No file is currently loaded."),
                )
                return

            has_story = file_metadata.has_story_metadata(path)
            screenplay_id = file_metadata.get_attr(path, "screenplay_id")
            if not has_story and not screenplay_id:
                QMessageBox.information(
                    self,
                    self.tr("Genre"),
                    self.tr("This file is not associated with a Crowdly story."),
                )
                return

            current = file_metadata.get_attr(path, file_metadata.FIELD_GENRE) or ""

            options = [
                "YA",
                "fiction",
                "sci-fi",
                "fantasy",
                "horror",
                "thriller",
                "drama",
                "comedy",
                "dramedy",
                "other…",
                "(delete genre)",
            ]

            # Preselect current value if it matches.
            try:
                current_idx = options.index(current) if current in options else 0
            except Exception:
                current_idx = 0

            choice, ok = QInputDialog.getItem(
                self,
                self.tr("Choose genre"),
                self.tr("Genre:"),
                options,
                current=current_idx,
                editable=False,
            )
            if not ok:
                return

            choice = (choice or "").strip()
            if not choice:
                return

            if choice == "(delete genre)":
                file_metadata.clear_genre(path)
                file_metadata.touch_change_date(path)
                QMessageBox.information(self, self.tr("Genre"), self.tr("Genre deleted."))
            elif choice == "other…":
                other, ok2 = QInputDialog.getText(
                    self,
                    self.tr("Other genre"),
                    self.tr("Enter genre:"),
                    text=current if current and current not in options else "",
                )
                if not ok2:
                    return
                other = (other or "").strip()
                if not other:
                    return
                file_metadata.set_genre(path, other)
                file_metadata.touch_change_date(path)
                QMessageBox.information(
                    self,
                    self.tr("Genre"),
                    self.tr("Genre updated."),
                )
            else:
                file_metadata.set_genre(path, choice)
                file_metadata.touch_change_date(path)
                QMessageBox.information(
                    self,
                    self.tr("Genre"),
                    self.tr("Genre updated."),
                )

            # Best-effort: if web sync is enabled, schedule a sync attempt.
            if getattr(self, "_sync_web_platform", False):
                self._schedule_web_sync()
        except Exception:
            traceback.print_exc()
            QMessageBox.critical(
                self,
                self.tr("Error"),
                self.tr("An unexpected error occurred while updating genre."),
            )

    def _refresh_story_from_web(self) -> None:  # pragma: no cover - UI wiring
        """Manual refresh: pull the latest content from the web.

        If the story or screenplay requires authentication, prompt once for
        credentials and only start the pull if login succeeds.
        """

        try:
            creds = self._ensure_crowdly_web_credentials()
            if not creds:
                return

            path = self._get_current_document_path()
            if path is not None:
                try:
                    screenplay_id = file_metadata.get_attr(path, "screenplay_id")
                except Exception:
                    screenplay_id = None
            else:
                screenplay_id = None

            if screenplay_id:
                # Screenplay: use the dedicated pull helper so scenes/blocks map correctly.
                self._start_screenplay_pull_from_web(force=True, credentials=creds)
            else:
                # Regular story: existing behaviour.
                self._start_pull_from_web(force=True, credentials=creds)
        except Exception:
            pass

    def _schedule_web_sync(self) -> None:  # pragma: no cover - UI wiring
        """Debounce and schedule a web sync attempt."""

        # Avoid hammering the backend on every autosave keystroke.
        if self._web_sync_timer.isActive():
            self._web_sync_timer.stop()
        self._web_sync_timer.start(1200)

    def _ensure_crowdly_web_credentials(self) -> tuple[str, str] | None:
        """Return cached web credentials, or prompt the user.

        If credentials are not yet known for this session, a modal login
        dialog is shown. On success the credentials are cached for reuse.
        """

        if self._crowdly_web_credentials is not None:
            return self._crowdly_web_credentials

        try:
            from .crowdly_login_dialog import CrowdlyLoginDialog
        except Exception:
            return None

        # Reuse the desktop username/email when available so the user only
        # needs to type their password for web sync.
        default_username = None
        try:
            if getattr(self, "_logged_in", False):
                candidate = getattr(self, "_username", None)
                if isinstance(candidate, str) and candidate and candidate != "username":
                    default_username = candidate
        except Exception:
            default_username = None

        dlg = CrowdlyLoginDialog(self, default_username=default_username)
        if dlg.exec() != QDialog.DialogCode.Accepted:
            return None

        creds = dlg.credentials()
        if creds is None:
            QMessageBox.warning(
                self,
                self.tr("Login"),
                self.tr("Username and password are required."),
            )
            return None

        self._crowdly_web_credentials = (creds.username, creds.password)
        self._update_sync_status_label()
        return self._crowdly_web_credentials

    def _handle_web_auth_failure(self, message: str | None) -> None:  # pragma: no cover - UI wiring
        """Handle web authentication failures in a user-friendly way.

        - Clears cached web credentials so the next attempt will re-prompt.
        - Turns off web synchronisation and keeps the menu checkbox in sync.
        - Shows a clear, actionable error message.
        """

        # Clear cached credentials so the next attempt asks again.
        try:
            self._crowdly_web_credentials = None
        except Exception:
            pass

        # Ensure sync is turned off and timers are stopped.
        self._sync_web_platform = False
        try:
            if self._web_pull_timer.isActive():
                self._web_pull_timer.stop()
        except Exception:
            pass
        try:
            if self._web_sync_timer.isActive():
                self._web_sync_timer.stop()
        except Exception:
            pass

        # Keep the action state consistent without retriggering this handler.
        if hasattr(self, "_action_sync_web") and isinstance(self._action_sync_web, QAction):
            try:
                self._action_sync_web.blockSignals(True)
                self._action_sync_web.setChecked(False)
                self._action_sync_web.blockSignals(False)
            except Exception:
                pass

        try:
            self._retranslate_ui()
            self._update_sync_status_label()
        except Exception:
            pass

        # Show a friendly message to the user.
        try:
            text = self.tr(
                "Please double-check your login data and re-enter them again.\n\n"
                "If nothing works, please get help and possibly contact support."
            )
            if message:
                text = f"{text}\n\n{message}"
            QMessageBox.warning(
                self,
                self.tr("Web login failed"),
                text,
            )
        except Exception:
            # If even the dialog fails, at least don't crash the app.
            pass

    def _poll_web_updates(self) -> None:  # pragma: no cover
        """Poll the backend for remote updates and pull if needed.

        When web credentials are available we use them, so private stories do
        not trigger additional login prompts.
        """

        try:
            creds = getattr(self, "_crowdly_web_credentials", None)
        except Exception:
            creds = None

        try:
            self._start_pull_from_web(force=False, credentials=creds)
        except Exception:
            return

    def _start_pull_from_web(self, *, force: bool, credentials: tuple[str, str] | None = None) -> None:  # pragma: no cover
        """Start a background pull if the remote story/screenplay has changed."""

        import traceback

        path = self._get_current_document_path()
        if path is None:
            return

        # If this is a screenplay-linked document, delegate to the screenplay
        # pull helper so we use the correct API and mapping.
        try:
            screenplay_id = file_metadata.get_attr(path, "screenplay_id")
        except Exception:
            screenplay_id = None
        if screenplay_id:
            try:
                self._start_screenplay_pull_from_web(force=force, credentials=credentials)
            except Exception:
                pass
            return

        if not file_metadata.has_story_metadata(path):
            return

        # Do not pull from the web until we have successfully synced at least
        # once from this desktop device. This prevents an initially-empty web
        # template from overwriting a longer local draft.
        try:
            md = file_metadata.read_story_metadata(path)
            if not md.last_sync_date:
                return
        except Exception:
            # If metadata cannot be read, fall back to safe behaviour (no pull).
            return

        story_id = file_metadata.get_attr(path, file_metadata.FIELD_STORY_ID)
        source_url = file_metadata.get_attr(path, file_metadata.FIELD_SOURCE_URL)
        if not story_id or not source_url:
            return

        # Don't start if pull already running.
        thread = getattr(self, "_story_pull_thread", None)
        if isinstance(thread, _StoryPullThread) and thread.isRunning():
            return

        # Start background check/pull without credentials first (for public stories).
        # If the backend responds with auth_required, we'll prompt and retry with credentials.
        thread = _StoryPullThread(
            story_id=story_id,
            source_url=source_url,
            credentials=credentials,
            local_path=path,
            force=force,
            parent=self,
        )
        thread.pullAvailable.connect(self._on_story_pull_available)
        thread.pullFailed.connect(self._on_story_pull_failed)
        thread.finished.connect(self._on_story_pull_finished)
        thread.finished.connect(thread.deleteLater)
        self._story_pull_thread = thread

        bar = self.statusBar()
        if bar is not None:
            bar.showMessage(self.tr("Checking for web updates..."), 2000)

        thread.start()

    def _maybe_sync_story_to_web(self) -> None:  # pragma: no cover
        """Best-effort: sync the current local story or screenplay to Crowdly.

        For regular stories that do not yet have a ``story_id`` association
        this method will trigger a one-time background initialisation that
        creates a remote story and writes the metadata to xattrs. For
        screenplays created from the Crowdly template, we reuse the same
        markdown chapter parser but sync into the dedicated screenplay tables.
        """

        import traceback

        try:
            path = self._get_current_document_path()
            if path is None:
                return

            # Screenplays created from the Crowdly template store their
            # association via generic xattrs (screenplay_id/screenplay_url).
            # When such metadata is present we sync the screenplay structure
            # instead of treating the document as a regular story.
            try:
                screenplay_id = file_metadata.get_attr(path, "screenplay_id")
            except Exception:
                screenplay_id = None

            if screenplay_id:
                self._maybe_sync_screenplay_to_web(path, screenplay_id)
                return

            # New local stories: attempt to initialise metadata once.
            if not file_metadata.has_story_metadata(path):
                self._ensure_story_metadata_for_path(path)
                return

            story_id = file_metadata.get_attr(path, file_metadata.FIELD_STORY_ID)
            source_url = file_metadata.get_attr(path, file_metadata.FIELD_SOURCE_URL)
            body_format = file_metadata.get_attr(path, file_metadata.FIELD_BODY_FORMAT)
            if not story_id or not source_url:
                return

            # Derive the project-space root (local creative Space) that owns
            # this file, if any, so we can map the story to a specific
            # creative_space on the backend.
            project_root: Path | None = None
            try:
                if self._project_space_path is not None:
                    candidate_root = self._project_space_path.resolve()
                    try:
                        inside = path.resolve().is_relative_to(candidate_root)  # type: ignore[attr-defined]
                    except AttributeError:  # Python < 3.9 fallback
                        inside = str(path.resolve()).startswith(str(candidate_root))
                    if inside:
                        project_root = candidate_root
            except Exception:
                project_root = None

            # If we could not match against the active project-space root, fall
            # back to any known Space whose path is a prefix of the document
            # path. This allows multiple Spaces while still providing a
            # deterministic mapping.
            if project_root is None:
                try:
                    for space in getattr(self, "_spaces", []) or []:
                        try:
                            candidate_root = space.resolve()
                        except Exception:
                            candidate_root = space
                        try:
                            inside = path.resolve().is_relative_to(candidate_root)  # type: ignore[attr-defined]
                        except AttributeError:
                            inside = str(path.resolve()).startswith(str(candidate_root))
                        if inside:
                            project_root = candidate_root
                            break
                except Exception:
                    project_root = None

            # When a document lives under a project-space root that has not yet
            # been linked to a remote creative Space, show a one-time
            # informational prompt so the user understands that a default Space
            # will be created on first sync.
            if project_root is not None:
                try:
                    key = str(project_root)
                    shown = getattr(self, "_space_mapping_prompts", None)
                    if not isinstance(shown, set):
                        shown = set()
                        self._space_mapping_prompts = shown
                    state = getattr(self._settings, "space_sync_state", {}) or {}
                    mapping = state.get(key) if isinstance(state, dict) else None
                    has_remote = (
                        isinstance(mapping, dict)
                        and isinstance(mapping.get("remote_space_id"), str)
                        and bool(mapping.get("remote_space_id"))
                    )
                    if key not in shown and not has_remote:
                        shown.add(key)
                        QMessageBox.information(
                            self,
                            self.tr("Link project space to Crowdly Space"),
                            self.tr(
                                "This document belongs to your project space at:\n{path}\n\n"
                                "On the first sync we will create or reuse a default Crowdly Space "
                                "for this project and link future stories to it."
                            ).format(path=str(project_root)),
                        )
                except Exception:
                    # Prompt failures must never prevent sync from proceeding.
                    pass

            # Look up the mapped remote creative_space id for this project-space
            # root using the existing space_sync_state structure. If there is no
            # mapping yet, we still sync the story content but omit the
            # creative_space_id hint so behaviour remains backward compatible.
            creative_space_id: str | None = None
            try:
                if project_root is not None:
                    state = getattr(self._settings, "space_sync_state", {}) or {}
                    mapping = state.get(str(project_root)) if isinstance(state, dict) else None
                    if isinstance(mapping, dict):
                        val = mapping.get("remote_space_id")
                        if isinstance(val, str) and val:
                            creative_space_id = val
            except Exception:
                creative_space_id = None

            # If a sync is already running, don't start a second one.
            thread = getattr(self, "_story_sync_thread", None)
            if isinstance(thread, _StorySyncThread) and thread.isRunning():
                return

            creds = self._ensure_crowdly_web_credentials()
            if creds is None:
                return

            md = file_metadata.read_story_metadata(path)

            # Skip sync when nothing changed since last sync.
            try:
                changed_at = file_metadata.parse_human(md.change_date)
                synced_at = file_metadata.parse_human(md.last_sync_date)
                if changed_at is not None and synced_at is not None and changed_at <= synced_at:
                    return
            except Exception:
                pass

            # Parse content into chapters.
            story = story_sync.parse_story_from_content(self._document.content, body_format=body_format)

            # Keep file metadata story_title in sync with parsed title.
            try:
                file_metadata.set_attr(path, file_metadata.FIELD_STORY_TITLE, story.title)
            except Exception:
                pass

            # Prepare metadata payload.
            tags_list = None
            if md.tags:
                # Accept comma-separated list.
                tags_list = [t.strip() for t in md.tags.split(",") if t.strip()]

            meta_payload = {
                "author_id": md.author_id,
                "initiator_id": md.initiator_id,
                "genre": md.genre,
                "tags": tags_list,
            }

            api_base = None
            try:
                from ..crowdly_client import api_base_url_from_story_url

                api_base = api_base_url_from_story_url(source_url)
            except Exception:
                api_base = None

            if not api_base:
                return

            # Start thread.
            thread = _StorySyncThread(
                api_base=api_base,
                story_id=story_id,
                title=story.title,
                chapters=story_sync.to_json_payload(story)["chapters"],
                metadata=meta_payload,
                credentials=creds,
                local_path=path,
                creative_space_id=creative_space_id,
                project_root=project_root,
                parent=self,
            )

            thread.syncSucceeded.connect(self._on_story_sync_succeeded)
            thread.syncFailed.connect(self._on_story_sync_failed)
            thread.finished.connect(self._on_story_sync_finished)
            thread.finished.connect(thread.deleteLater)
            self._story_sync_thread = thread

            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(self.tr("Syncing story to the web..."))

            thread.start()
        except Exception:
            traceback.print_exc()

    def _ensure_screenplay_metadata_for_path(self, path: Path, screenplay_id: str) -> None:
        """Hydrate screenplay metadata from the backend when possible.

        When a file has a ``screenplay_id`` but minimal StoryMetadata, we fetch
        the corresponding ``screenplay_title`` row and use it to populate
        author/initiator/title and dates. This is best-effort and never raises.
        """

        import sys

        try:
            # If we already have a title or creation date, assume metadata was set.
            md = file_metadata.read_story_metadata(path)
            if md.story_title or md.creation_date:
                return

            # Derive API base from screenplay_url or configured base URL.
            from ..crowdly_client import CrowdlyClient, api_base_url_from_story_url

            try:
                sp_url = file_metadata.get_attr(path, "screenplay_url")
            except Exception:
                sp_url = None

            api_base = None
            try:
                if sp_url:
                    api_base = api_base_url_from_story_url(sp_url)
                else:
                    base_url_setting = getattr(self._settings, "crowdly_base_url", None)
                    if isinstance(base_url_setting, str) and base_url_setting.strip():
                        api_base = api_base_url_from_story_url(base_url_setting)
            except Exception as exc:
                print(f"[metadata][screenplay] api_base_url_from_story_url failed: {exc}", file=sys.stderr)
                base_url_setting = getattr(self._settings, "crowdly_base_url", None)
                if isinstance(base_url_setting, str) and base_url_setting.strip():
                    api_base = (base_url_setting or "").rstrip("/")

            if not api_base:
                return

            creds = self._ensure_crowdly_web_credentials()
            if creds is None:
                return

            client = CrowdlyClient(api_base, credentials=creds)
            row = client.get_screenplay_title_row(screenplay_id)

            title = row.get("title") or "Untitled Screenplay"
            creator_id = row.get("creator_id") or row.get("creatorId")
            updated_raw = row.get("updated_at") or row.get("updatedAt")
            remote_updated_at = str(updated_raw) if isinstance(updated_raw, str) else md.remote_updated_at
            now_str = file_metadata.now_human()

            updated_meta = file_metadata.StoryMetadata(
                author_id=str(creator_id) if creator_id else md.author_id,
                initiator_id=str(creator_id) if creator_id else md.initiator_id,
                story_id=md.story_id,
                story_title=str(title),
                genre=md.genre,
                tags=md.tags,
                creation_date=md.creation_date or now_str,
                change_date=now_str,
                last_sync_date=md.last_sync_date,
                source_url=md.source_url or sp_url,
                body_format=md.body_format or "markdown",
                remote_updated_at=remote_updated_at,
            )

            file_metadata.write_story_metadata(path, updated_meta, remove_missing=False)
        except Exception as exc:
            # Never break the UI when metadata hydration fails.
            print(f"[metadata][screenplay] hydration failed for {path}: {exc}", file=sys.stderr)

    def _start_screenplay_pull_from_web(self, *, force: bool, credentials: tuple[str, str] | None = None) -> None:  # pragma: no cover
        """Start a background pull for a screenplay if the remote version diverged.

        Behaviour mirrors `_start_pull_from_web` for stories but uses the
        screenplay endpoints and Markdown mapping.
        """

        import traceback

        path = self._get_current_document_path()
        if path is None:
            return

        try:
            screenplay_id = file_metadata.get_attr(path, "screenplay_id")
            screenplay_url = file_metadata.get_attr(path, "screenplay_url") or None
        except Exception:
            screenplay_id = None
            screenplay_url = None

        if not screenplay_id or not screenplay_url:
            return

        # Do not pull from the web until we have successfully synced at least
        # once from this desktop device (to avoid wiping long local drafts
        # with an empty remote template).
        try:
            md = file_metadata.read_story_metadata(path)
            if not md.last_sync_date and not force:
                return
        except Exception:
            if not force:
                return

        # Avoid parallel pulls for the same document.
        thread = getattr(self, "_screenplay_pull_thread", None)
        if isinstance(thread, _ScreenplayPullThread) and thread.isRunning():
            return

        thread = _ScreenplayPullThread(
            screenplay_id=screenplay_id,
            source_url=screenplay_url,
            credentials=credentials,
            local_path=path,
            force=force,
            parent=self,
        )
        thread.pullAvailable.connect(self._on_screenplay_pull_available)
        thread.pullFailed.connect(self._on_screenplay_pull_failed)
        thread.finished.connect(self._on_screenplay_pull_finished)
        thread.finished.connect(thread.deleteLater)
        self._screenplay_pull_thread = thread

        bar = self.statusBar()
        if bar is not None:
            bar.showMessage(self.tr("Checking for screenplay updates..."), 2000)

        try:
            thread.start()
        except Exception:
            traceback.print_exc()

    def _maybe_sync_screenplay_to_web(self, path: Path, screenplay_id: str) -> None:  # pragma: no cover
        """Best-effort: sync the current local screenplay back to the backend.

        This mirrors the story sync pipeline but targets the screenplay
        endpoints. All early returns are logged to stderr so issues can be
        debugged more easily.
        """

        import traceback
        import sys

        try:
            print(f"[web-sync][screenplay] attempting sync for {path} (id={screenplay_id})", file=sys.stderr)
            try:
                from ..crowdly_client import (
                    CrowdlyClient,
                    CrowdlyClientError,
                    api_base_url_from_story_url,
                )
            except Exception as exc:
                print(f"[web-sync][screenplay] CrowdlyClient import failed: {exc}", file=sys.stderr)
                return

            creds = self._ensure_crowdly_web_credentials()
            if creds is None:
                print("[web-sync][screenplay] no web credentials; aborting sync", file=sys.stderr)
                return

            # Derive API base from stored screenplay_url when available, falling
            # back to the configured Crowdly base URL.
            try:
                screenplay_url = file_metadata.get_attr(path, "screenplay_url")
            except Exception as exc:
                print(f"[web-sync][screenplay] failed to read screenplay_url xattr: {exc}", file=sys.stderr)
                screenplay_url = None

            api_base = None
            try:
                if screenplay_url:
                    api_base = api_base_url_from_story_url(screenplay_url)
                else:
                    base_url_setting = getattr(self._settings, "crowdly_base_url", None)
                    if isinstance(base_url_setting, str) and base_url_setting.strip():
                        api_base = api_base_url_from_story_url(base_url_setting)
            except Exception as exc:
                print(f"[web-sync][screenplay] api_base_url_from_story_url failed: {exc}", file=sys.stderr)
                base_url_setting = getattr(self._settings, "crowdly_base_url", None)
                if isinstance(base_url_setting, str) and base_url_setting.strip():
                    api_base = (base_url_setting or "").rstrip("/")

            if not api_base:
                print("[web-sync][screenplay] could not derive API base URL; aborting sync", file=sys.stderr)
                return

            # Parse the current markdown into logical scenes using a
            # screenplay-aware parser that keeps each non-empty line as its own
            # atomic block inside a scene.
            screenplay_story = story_sync.parse_screenplay_from_content(
                self._document.content,
            )

            if not screenplay_story.chapters:
                print("[web-sync][screenplay] no chapters/scenes parsed from content; nothing to sync", file=sys.stderr)
                return

            # Best-effort: keep local metadata in sync for screenplays so the
            # Story metadata dialog reflects title, dates, and source URL.
            try:
                md = file_metadata.read_story_metadata(path)
                now_str = file_metadata.now_human()
                source_url = md.source_url or screenplay_url
                updated_meta = file_metadata.StoryMetadata(
                    author_id=md.author_id,
                    initiator_id=md.initiator_id,
                    story_id=md.story_id,
                    story_title=screenplay_story.title or md.story_title,
                    genre=md.genre,
                    tags=md.tags,
                    creation_date=md.creation_date or now_str,
                    change_date=now_str,
                    last_sync_date=md.last_sync_date,
                    source_url=source_url,
                    body_format=md.body_format or "markdown",
                    remote_updated_at=md.remote_updated_at,
                )
                file_metadata.write_story_metadata(path, updated_meta, remove_missing=False)
            except Exception as exc:
                print(f"[web-sync][screenplay] metadata update failed: {exc}", file=sys.stderr)

            scenes_payload = []
            for idx, ch in enumerate(screenplay_story.chapters, start=1):
                scenes_payload.append(
                    {
                        "sceneIndex": idx,
                        "slugline": ch.chapterTitle,
                        "paragraphs": ch.paragraphs,
                    }
                )

            client = CrowdlyClient(api_base, credentials=creds)
            print(
                f"[web-sync][screenplay] POSTing {len(scenes_payload)} scenes to {api_base} for {screenplay_id}",
                file=sys.stderr,
            )

            # Use remote_updated_at (if any) for conflict detection on the
            # server so we do not overwrite newer web changes silently.
            try:
                md = file_metadata.read_story_metadata(path)
                remote_updated_at = md.remote_updated_at
            except Exception:
                remote_updated_at = None

            try:
                client.sync_desktop_screenplay(
                    screenplay_id=screenplay_id,
                    title=screenplay_story.title,
                    scenes=scenes_payload,
                    metadata=None,
                    remote_updated_at=remote_updated_at,
                )
            except CrowdlyClientError as exc:
                if getattr(exc, "status_code", None) == 409:
                    # Conflict: screenplay changed on the server since last sync.
                    bar = self.statusBar()
                    if bar is not None:
                        bar.showMessage(
                            self.tr("Screenplay has changed on the web; please refresh from web before syncing."),
                            7000,
                        )
                    print(f"[web-sync][screenplay] conflict from server: {exc}", file=sys.stderr)
                    return
                raise

            # On success, mark last_sync_date for this screenplay file.
            try:
                file_metadata.touch_last_sync_date(path)
            except Exception as exc:
                print(f"[web-sync][screenplay] touch_last_sync_date failed: {exc}", file=sys.stderr)

            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(self.tr("Screenplay synced to the web."), 5000)
            print("[web-sync][screenplay] sync completed successfully", file=sys.stderr)
        except Exception as exc:
            traceback.print_exc()
            try:
                bar = self.statusBar()
                if bar is not None:
                    bar.showMessage(self.tr("Screenplay sync failed."), 5000)
            except Exception:
                pass

    def _on_story_sync_succeeded(self, result: object) -> None:  # pragma: no cover
        import traceback

        try:
            # When the sync thread provides Space information, persist the
            # mapping between the local project-space root and the remote
            # creative Space so future syncs can reuse it.
            try:
                if isinstance(result, dict):
                    project_root = result.get("project_root")
                    space_id = result.get("creative_space_id")
                    if isinstance(project_root, str) and project_root and isinstance(space_id, str) and space_id:
                        state = getattr(self._settings, "space_sync_state", None)
                        if not isinstance(state, dict):
                            state = {}
                            self._settings.space_sync_state = state  # type: ignore[assignment]
                        mapping = state.get(project_root)
                        if not isinstance(mapping, dict):
                            mapping = {}
                            state[project_root] = mapping
                        if mapping.get("remote_space_id") != space_id:
                            mapping["remote_space_id"] = space_id
                            try:
                                from .. import file_metadata as _fm

                                mapping["last_story_sync_at"] = _fm.now_human()
                            except Exception:
                                pass
                            save_settings(self._settings)
            except Exception:
                # Space-mapping persistence is best-effort; never break UI.
                traceback.print_exc()

            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(self.tr("Story synced to the web."), 5000)
        except Exception:
            traceback.print_exc()

    def _on_story_init_succeeded(self, payload: object) -> None:  # pragma: no cover
        """Handle successful creation of a new Crowdly story for a local file."""

        import traceback

        try:
            if not isinstance(payload, dict):
                return

            local_path = payload.get("local_path")
            story_id = payload.get("story_id")
            story_url = payload.get("story_url")
            if not isinstance(local_path, Path) or not isinstance(story_id, str):
                return

            # Write minimal metadata so future syncs/pulls behave like for
            # imported stories.
            now_str = file_metadata.now_human()
            metadata = file_metadata.StoryMetadata(
                story_id=story_id,
                story_title=self._guess_document_title() or "Untitled",
                creation_date=now_str,
                change_date=now_str,
                last_sync_date=None,
                source_url=str(story_url) if isinstance(story_url, str) else None,
                body_format="markdown",
            )
            file_metadata.write_story_metadata(local_path, metadata, remove_missing=False)

            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(self.tr("Story linked to Crowdly web."), 5000)
        except Exception:
            traceback.print_exc()

    def _on_story_init_failed(self, error: object) -> None:  # pragma: no cover
        """Handle failures when creating a new Crowdly story for a local file."""

        import traceback

        try:
            message = str(error)
            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(self.tr("Could not create story on the web."), 5000)
            # Log full details to stderr during development.
            print(f"[web-init] failed: {message}")
        except Exception:
            traceback.print_exc()

    def _on_story_init_finished(self) -> None:  # pragma: no cover
        """Clear init-thread bookkeeping when a new-story init completes."""

        self._story_init_in_progress = False
        self._story_init_thread = None

    def _on_story_sync_failed(self, error: object) -> None:  # pragma: no cover
        import traceback

        try:
            bar = self.statusBar()
            if bar is not None:
                bar.clearMessage()

            msg = str(error)
            # If the backend reports an authentication failure, treat it as a
            # login problem and guide the user to correct their credentials.
            if "Login failed" in msg or "auth" in msg.lower():
                self._handle_web_auth_failure(msg)
                return

            QMessageBox.warning(
                self,
                self.tr("Sync failed"),
                self.tr("Could not sync story to the web.\n\nDetails: {error}").format(error=msg),
            )
        except Exception:
            traceback.print_exc()

    def _on_story_pull_available(self, payload: object) -> None:  # pragma: no cover
        """Apply pulled content if it's newer and safe."""

        import traceback

        try:
            if not isinstance(payload, dict):
                return

            path = self._get_current_document_path()
            if path is None:
                return

            new_content = payload.get("content")
            remote_updated_at = payload.get("remote_updated_at")

            if not isinstance(new_content, str) or not new_content:
                return

            md = file_metadata.read_story_metadata(path)

            # If local has unsynced changes, avoid noisy modal prompts.
            # For now we prefer the local copy and simply schedule a web sync
            # (the backend/CRDT layer is responsible for reconciling changes).
            try:
                changed_at = file_metadata.parse_human(md.change_date)
                synced_at = file_metadata.parse_human(md.last_sync_date)
                local_unsynced = changed_at is not None and synced_at is not None and changed_at > synced_at
            except Exception:
                local_unsynced = False

            if local_unsynced:
                try:
                    self._schedule_web_sync()
                except Exception:
                    pass
                return

            # Apply content.
            self._document.set_content(new_content)
            self._last_change_from_preview = False

            old_state = self.editor.blockSignals(True)
            try:
                self.editor.setPlainText(new_content)
            finally:
                self.editor.blockSignals(old_state)

            self.preview.set_markdown(new_content)
            self._update_document_stats_label()

            # Save immediately and update xattrs.
            try:
                self._document.save(path)
            except Exception:
                pass

            try:
                file_metadata.touch_last_sync_date(path)
                if isinstance(remote_updated_at, str) and remote_updated_at:
                    file_metadata.set_attr(path, file_metadata.FIELD_REMOTE_UPDATED_AT, remote_updated_at)
            except Exception:
                pass

            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(self.tr("Pulled latest story from the web."), 5000)
        except Exception:
            traceback.print_exc()

    def _on_story_pull_failed(self, error: object) -> None:  # pragma: no cover
        """Handle failures when checking for or pulling remote updates.

        Authentication problems disable sync and prompt the user once; other
        transient errors are surfaced only via the status bar/logs.
        """

        import traceback

        try:
            kind = None
            message = None
            if isinstance(error, dict):
                kind = error.get("kind")
                message = error.get("message")
            if not message:
                message = str(error)

            if kind in ("auth_required", "auth_failed"):
                self._handle_web_auth_failure(message)
                return

            # For non-auth failures, log message and show a brief status bar hint.
            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(self.tr("Web update check failed."), 3000)
            print(f"[web-pull] failed: {message}")
        except Exception:
            traceback.print_exc()

    def _on_story_pull_finished(self) -> None:  # pragma: no cover
        # Clear stale thread reference so future pulls aren't blocked.
        self._story_pull_thread = None

    def _on_screenplay_pull_available(self, payload: object) -> None:  # pragma: no cover
        """Apply pulled screenplay content if it's newer and safe."""

        import traceback

        try:
            if not isinstance(payload, dict):
                return

            path = self._get_current_document_path()
            if path is None:
                return

            new_content = payload.get("content")
            remote_updated_at = payload.get("remote_updated_at")
            force = bool(payload.get("force"))

            if not isinstance(new_content, str) or not new_content:
                return

            md = file_metadata.read_story_metadata(path)

            # If local has unsynced changes, prefer local and schedule a sync
            # instead of overwriting with the remote version, unless this pull
            # was explicitly forced (e.g. via "Refresh from web").
            try:
                changed_at = file_metadata.parse_human(md.change_date)
                synced_at = file_metadata.parse_human(md.last_sync_date)
                local_unsynced = changed_at is not None and synced_at is not None and changed_at > synced_at
            except Exception:
                local_unsynced = False

            if local_unsynced and not force:
                try:
                    self._schedule_web_sync()
                except Exception:
                    pass
                return

            # Apply content
            self._document.set_content(new_content)
            self._last_change_from_preview = False

            old_state = self.editor.blockSignals(True)
            try:
                self.editor.setPlainText(new_content)
            finally:
                self.editor.blockSignals(old_state)

            self.preview.set_markdown(new_content)
            self._update_document_stats_label()

            # Save immediately and update xattrs.
            try:
                self._document.save(path)
            except Exception:
                pass

            try:
                file_metadata.touch_last_sync_date(path)
                if isinstance(remote_updated_at, str) and remote_updated_at:
                    file_metadata.set_attr(path, file_metadata.FIELD_REMOTE_UPDATED_AT, remote_updated_at)
            except Exception:
                pass

            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(self.tr("Pulled latest screenplay from the web."), 5000)
        except Exception:
            traceback.print_exc()

    def _on_screenplay_pull_failed(self, error: object) -> None:  # pragma: no cover
        """Handle failures when checking for or pulling screenplay updates."""

        import traceback

        try:
            message = str(error)
            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(self.tr("Screenplay update check failed."), 3000)
            print(f"[web-pull][screenplay] failed: {message}")
        except Exception:
            traceback.print_exc()

    def _on_screenplay_pull_finished(self) -> None:  # pragma: no cover
        # Clear stale thread reference so future pulls aren't blocked.
        self._screenplay_pull_thread = None

    def _on_story_sync_finished(self) -> None:  # pragma: no cover
        self._story_sync_thread = None


class _NewStoryInitThread(QThread):
    """Background thread that creates a new Crowdly story for a local file."""

    initSucceeded = Signal(object)
    initFailed = Signal(object)

    def __init__(
        self,
        *,
        api_base: str,
        credentials: tuple[str, str],
        local_path: Path,
        title: str,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self._api_base = api_base
        self._credentials = credentials
        self._local_path = local_path
        self._title = title

    def run(self) -> None:  # pragma: no cover
        import traceback

        try:
            from ..crowdly_client import CrowdlyClient, CrowdlyClientError

            client = CrowdlyClient(self._api_base, credentials=self._credentials)
            result = client.create_desktop_story(title=self._title)

            payload = {
                "local_path": self._local_path,
                "story_id": result.get("story_id"),
                "story_url": result.get("story_url"),
            }
            self.initSucceeded.emit(payload)
        except Exception as exc:
            traceback.print_exc()
            message = str(exc)
            try:
                from ..crowdly_client import CrowdlyClientError

                if isinstance(exc, CrowdlyClientError):
                    message = str(exc)
            except Exception:
                pass
            self.initFailed.emit(message)


class _StoryPullThread(QThread):
    """Background thread that checks and pulls a story from the Crowdly backend."""

    pullAvailable = Signal(object)
    pullFailed = Signal(object)

    def __init__(
        self,
        *,
        story_id: str,
        source_url: str,
        credentials: tuple[str, str] | None,
        local_path: Path,
        force: bool,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self._story_id = story_id
        self._source_url = source_url
        self._credentials = credentials
        self._local_path = local_path
        self._force = force

    def run(self) -> None:
        import traceback

        try:
            from ..crowdly_client import CrowdlyClient, api_base_url_from_story_url

            api_base = api_base_url_from_story_url(self._source_url)
            client = CrowdlyClient(api_base, credentials=self._credentials)

            # 1) Check story_title.updated_at
            title_row = client.get_story_title_row(self._story_id)
            updated_raw = title_row.get("updated_at") or title_row.get("updatedAt")
            remote_updated_at = updated_raw if isinstance(updated_raw, str) else None

            local_remote = file_metadata.get_attr(self._local_path, file_metadata.FIELD_REMOTE_UPDATED_AT)
            if not self._force and remote_updated_at and local_remote and remote_updated_at == local_remote:
                return

            # 2) Fetch full story markdown
            story = client.fetch_story(self._source_url)

            self.pullAvailable.emit(
                {
                    "content": story.body,
                    "remote_updated_at": remote_updated_at,
                }
            )
        except Exception as exc:
            traceback.print_exc()
            try:
                from ..crowdly_client import CrowdlyClientError

                if isinstance(exc, CrowdlyClientError):
                    self.pullFailed.emit({"kind": exc.kind, "message": str(exc)})
                    return
            except Exception:
                pass

            self.pullFailed.emit({"kind": "unknown", "message": str(exc)})


class _StorySyncThread(QThread):
    """Background thread that syncs a local story back to the Crowdly backend.

    In addition to pushing the story metadata and full text, this thread can
    (optionally) associate the story with a creative Space and register
    attachments under that Space based on the local filesystem layout.
    """

    syncSucceeded = Signal(object)
    syncFailed = Signal(object)

    def __init__(
        self,
        *,
        api_base: str,
        story_id: str,
        title: str,
        chapters: list[dict],
        metadata: dict,
        credentials: tuple[str, str],
        local_path: Path,
        creative_space_id: str | None,
        project_root: Path | None,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self._api_base = api_base
        self._story_id = story_id
        self._title = title
        self._chapters = chapters
        self._metadata = metadata
        self._credentials = credentials
        self._local_path = local_path
        self._creative_space_id = creative_space_id
        self._project_root = project_root

    def run(self) -> None:
        import traceback

        try:
            from ..crowdly_client import CrowdlyClient

            client = CrowdlyClient(self._api_base, credentials=self._credentials)

            # If we know which project-space root owns this file but there is no
            # mapped creative Space yet, lazily ensure a default Space exists on
            # the backend for the current user. This keeps the behaviour
            # best-effort: failures here do not prevent the main story sync.
            if self._project_root is not None and not self._creative_space_id:
                try:
                    user_id = client.login()
                    payload = {"userId": user_id}
                    default_space = client._http_post_json(  # type: ignore[attr-defined]
                        f"{client.base_url}/creative-spaces/ensure-default",
                        payload,
                    )
                    space_id = None
                    if isinstance(default_space, dict):
                        sid = default_space.get("id")
                        if isinstance(sid, str) and sid:
                            space_id = sid
                    if space_id:
                        self._creative_space_id = space_id
                except Exception:
                    # Space creation is best-effort; continue without a Space on failure.
                    pass

            result = client.sync_desktop_story(
                self._story_id,
                title=self._title,
                chapters=self._chapters,
                metadata=self._metadata,
                creative_space_id=self._creative_space_id,
            )

            # After a successful story sync, best-effort register attachments in
            # the mapped creative Space when available.
            try:
                self._sync_attachments_to_space(client)
            except Exception:
                # Attachment sync must never break the main story sync pipeline.
                pass

            payload = {
                "result": result,
                "project_root": str(self._project_root) if self._project_root is not None else None,
                "creative_space_id": self._creative_space_id,
            }
            self.syncSucceeded.emit(payload)
        except Exception as exc:
            traceback.print_exc()
            self.syncFailed.emit(str(exc))

    def _sync_attachments_to_space(self, client: "CrowdlyClient") -> None:
        """Best-effort: register story attachment files under the mapped Space.

        Convention: for a document ``/path/to/My Story.md`` (or `.story`), we
        look for a sibling directory named ``My Story.assets``. All files under
        that directory are treated as attachments for the current story and are
        mapped into the project-space tree relative to ``self._project_root``.
        """

        from pathlib import Path as _Path
        import os

        if self._project_root is None or not self._creative_space_id:
            return

        root = self._project_root
        try:
            doc_path = self._local_path.resolve()
        except Exception:
            doc_path = self._local_path

        assets_dir = doc_path.with_suffix(".assets")
        if not assets_dir.is_dir():
            return

        try:
            from .. import file_metadata as _fm  # re-use for potential future hints
        except Exception:  # noqa: F401
            _fm = None  # type: ignore[assignment]

        for dirpath, _dirnames, filenames in os.walk(assets_dir):
            base = _Path(dirpath)
            for name in filenames:
                full_path = base / name
                try:
                    rel = full_path.resolve().relative_to(root.resolve())
                except Exception:
                    # Attachment is outside the project-space root; skip.
                    continue

                rel_posix = rel.as_posix()
                parent_rel = rel.parent.as_posix() if rel.parent != _Path(".") else ""

                try:
                    stat_result = full_path.stat()
                    size_bytes = int(stat_result.st_size)
                except OSError:
                    size_bytes = None

                # First, ensure there is a creative_space_items row for this file
                # by hitting the existing /creative-spaces/:spaceId/items/file
                # endpoint. We do a best-effort lookup via the items listing to
                # avoid duplicates when possible.
                try:
                    from urllib.parse import urlencode as _urlencode
                    import json as _json
                    from urllib import request as _request

                    space_id = self._creative_space_id

                    # Check if an item already exists at this relative_path.
                    items_url = f"{client.base_url}/creative-spaces/{space_id}/items?" + _urlencode({"path": parent_rel})
                    req = _request.Request(
                        items_url,
                        headers={"User-Agent": "crowdly-editor/0.1", "Accept": "application/json"},
                        method="GET",
                    )
                    existing_id = None
                    try:
                        with _request.urlopen(req, timeout=10.0) as resp:  # type: ignore[arg-type]
                            if "json" in (resp.headers.get_content_type() or "").lower():
                                data = _json.loads(resp.read().decode(resp.headers.get_content_charset() or "utf-8"))
                                items = data.get("items") if isinstance(data, dict) else None
                                if isinstance(items, list):
                                    for row in items:
                                        try:
                                            if str(row.get("relative_path") or "").strip() == rel_posix:
                                                cid = row.get("id")
                                                if isinstance(cid, str) and cid:
                                                    existing_id = cid
                                                    break
                                        except Exception:
                                            continue
                    except Exception:
                        existing_id = None

                    if existing_id is None:
                        # Create a new file metadata entry inside the Space.
                        payload = {
                            "parentPath": parent_rel or "",
                            "name": name,
                            "mimeType": None,
                            "sizeBytes": size_bytes,
                            "hash": None,
                            "userId": None,
                        }
                        raw = _json.dumps(payload).encode("utf-8")
                        file_url = f"{client.base_url}/creative-spaces/{space_id}/items/file"
                        file_req = _request.Request(
                            file_url,
                            data=raw,
                            headers={
                                "User-Agent": "crowdly-editor/0.1",
                                "Accept": "application/json",
                                "Content-Type": "application/json",
                            },
                            method="POST",
                        )
                        try:
                            with _request.urlopen(file_req, timeout=10.0) as resp:  # type: ignore[arg-type]
                                if "json" in (resp.headers.get_content_type() or "").lower():
                                    data = _json.loads(resp.read().decode(resp.headers.get_content_charset() or "utf-8"))
                                    cid = data.get("id")
                                    if isinstance(cid, str) and cid:
                                        existing_id = cid
                        except Exception:
                            existing_id = None

                    if not existing_id:
                        continue

                    # Classify attachment kind based on file extension.
                    lower_name = name.lower()
                    if lower_name.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")):
                        kind = "image"
                    elif lower_name.endswith((".mp3", ".wav", ".flac", ".ogg", ".m4a")):
                        kind = "audio"
                    elif lower_name.endswith((".mp4", ".mov", ".avi", ".mkv", ".webm")):
                        kind = "video"
                    elif lower_name.endswith((".pdf", ".doc", ".docx", ".odt", ".rtf", ".txt")):
                        kind = "document"
                    else:
                        kind = "other"

                    attach_payload = {
                        "spaceId": space_id,
                        "itemId": existing_id,
                        "kind": kind,
                        "role": None,
                    }
                    raw_attach = _json.dumps(attach_payload).encode("utf-8")
                    attach_url = f"{client.base_url}/stories/{self._story_id}/attachments"
                    attach_req = _request.Request(
                        attach_url,
                        data=raw_attach,
                        headers={
                            "User-Agent": "crowdly-editor/0.1",
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                        },
                        method="POST",
                    )
                    try:
                        _request.urlopen(attach_req, timeout=10.0)  # type: ignore[arg-type]
                    except Exception:
                        # Attachment linking is best-effort.
                        continue
                except Exception:
                    # Per-file failures should not stop the whole loop.
                    continue


class _ScreenplayPullThread(QThread):
    """Background thread that checks and pulls a screenplay from the backend."""

    pullAvailable = Signal(object)
    pullFailed = Signal(object)

    def __init__(
        self,
        *,
        screenplay_id: str,
        source_url: str,
        credentials: tuple[str, str] | None,
        local_path: Path,
        force: bool,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self._screenplay_id = screenplay_id
        self._source_url = source_url
        self._credentials = credentials
        self._local_path = local_path
        self._force = force

    def run(self) -> None:  # pragma: no cover
        import traceback

        try:
            from ..crowdly_client import (
                CrowdlyClient,
                api_base_url_from_story_url,
            )

            api_base = api_base_url_from_story_url(self._source_url)
            client = CrowdlyClient(api_base, credentials=self._credentials)

            # Check screenplay_title.updated_at first.
            title_row = client.get_screenplay_title_row(self._screenplay_id)
            updated_raw = title_row.get("updated_at") or title_row.get("updatedAt")
            remote_updated_at = updated_raw if isinstance(updated_raw, str) else None

            local_remote = file_metadata.get_attr(self._local_path, file_metadata.FIELD_REMOTE_UPDATED_AT)
            if not self._force and remote_updated_at and local_remote and remote_updated_at == local_remote:
                return

            # Fetch full screenplay structure and map to Markdown.
            scenes, blocks = client.get_screenplay_structure(self._screenplay_id, include_blocks=True)

            title = title_row.get("title") or "Untitled Screenplay"
            lines: list[str] = []
            lines.append(f"# {title}")
            lines.append("")
            for scene in scenes:
                # Use the slugline as-is for the Markdown heading so users can
                # control scene names freely.
                lines.append(f"## {scene.slugline}".rstrip())
                lines.append("")
                scene_blocks = [b for b in blocks if b.scene_id == scene.scene_id]
                for block in scene_blocks:
                    text = block.text or ""
                    bt = (block.block_type or "").lower()
                    if bt == "character":
                        lines.append(text.upper())
                    elif bt == "parenthetical":
                        if not (text.startswith("(") and text.endswith(")")):
                            lines.append(f"({text})")
                        else:
                            lines.append(text)
                    else:
                        lines.append(text)
                    lines.append("")

            body_md = "\n".join(lines).rstrip() + "\n"

            self.pullAvailable.emit(
                {
                    "content": body_md,
                    "remote_updated_at": remote_updated_at,
                    "force": self._force,
                }
            )
        except Exception as exc:
            traceback.print_exc()
            self.pullFailed.emit(str(exc))


class _RenamableTabBar(QTabBar):
    """A QTabBar that supports inline renaming of tab labels.

    - Double-clicking a tab starts editing its title in-place.
    - Pressing Enter or clicking away (focus loss) commits the new title.
    """

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._editor: QLineEdit | None = None
        self._editing_index: int | None = None

    def mousePressEvent(self, event):  # pragma: no cover - UI wiring
        """Start inline rename when clicking on the tab label *and* preserve
        normal tab switching.

        A single left-click on a tab's text both selects the tab and makes it
        editable. Clicking the close button or outside any tab falls back to
        the default behaviour.
        """

        index = self.tabAt(event.position().toPoint())
        if index < 0:
            return super().mousePressEvent(event)

        # If the click lands on the close button, let the default handler
        # manage it (so the 'x' still closes the tab as usual).
        if self.tabsClosable():
            close_rect = self.tabRect(index)
            close_size = close_rect.height()
            close_region = close_rect.adjusted(
                close_rect.width() - close_size,
                0,
                0,
                0,
            )
            if close_region.contains(event.position().toPoint()):
                return super().mousePressEvent(event)

        # First, let the base class handle normal tab selection.
        super().mousePressEvent(event)

        # Then, for left-clicks on the label area, begin inline rename.
        if event.button() == Qt.MouseButton.LeftButton:
            self._begin_inline_rename(index)
            return

    def _begin_inline_rename(self, index: int) -> None:
        if index < 0 or index >= self.count():
            return

        # If an editor is already active, commit its changes first.
        if self._editor is not None:
            self._commit_inline_rename()

        rect = self.tabRect(index)
        editor = QLineEdit(self)
        editor.setFrame(False)
        editor.setText(self.tabText(index))
        editor.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
        editor.setGeometry(rect)
        editor.show()
        editor.raise_()
        editor.selectAll()
        editor.setFocus()

        editor.editingFinished.connect(self._commit_inline_rename)

        self._editor = editor
        self._editing_index = index

    def _commit_inline_rename(self) -> None:
        if self._editor is None or self._editing_index is None:
            return

        text = self._editor.text().strip()
        index = self._editing_index

        # If the name is emptied, keep the old title rather than blank.
        if text:
            self.setTabText(index, text)

        self._editor.deleteLater()
        self._editor = None
        self._editing_index = None


class _CrowdlyFetchThread(QThread):
    """QThread that fetches a story and emits results back to the UI thread.

    This avoids moveToThread + deleteLater timing pitfalls that can cause Qt
    cross-thread warnings and, in some environments, segfaults.
    """

    storyFetched = Signal(object)
    fetchFailed = Signal(object)

    def __init__(
        self,
        *,
        story_input: str,
        credentials: tuple[str, str] | None = None,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self._story_input = story_input
        self._credentials = credentials

    def run(self) -> None:
        import traceback

        try:
            from ..crowdly_client import CrowdlyClient, api_base_url_from_story_url

            api_base = api_base_url_from_story_url(self._story_input)
            client = CrowdlyClient(api_base, credentials=self._credentials)
            story = client.fetch_story(self._story_input)
            self.storyFetched.emit(story)
        except Exception as exc:
            traceback.print_exc()
            try:
                from ..crowdly_client import CrowdlyClientError

                if isinstance(exc, CrowdlyClientError):
                    self.fetchFailed.emit({"kind": exc.kind, "message": str(exc)})
                    return
            except Exception:
                pass

            self.fetchFailed.emit(
                {"kind": "unknown", "message": f"Unexpected error: {exc}"}
            )


class _ScreenplayFetchThread(QThread):
    """QThread that fetches a screenplay and emits results back to the UI thread."""

    screenplayFetched = Signal(object)
    fetchFailed = Signal(object)

    def __init__(
        self,
        *,
        screenplay_input: str,
        credentials: tuple[str, str] | None = None,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self._screenplay_input = screenplay_input
        self._credentials = credentials

    def run(self) -> None:  # pragma: no cover - background worker
        import traceback

        try:
            from urllib.parse import urlparse
            import re

            from ..crowdly_client import (
                CrowdlyClient,
                CrowdlyClientError,
                api_base_url_from_story_url,
            )

            raw = (self._screenplay_input or "").strip()
            if not raw:
                raise CrowdlyClientError("Screenplay ID / URL is required.", kind="invalid_input")

            api_base = api_base_url_from_story_url(raw)
            client = CrowdlyClient(api_base, credentials=self._credentials)

            # Derive screenplay_id from the input (URL or raw id).
            screenplay_id = raw
            if raw.lower().startswith("http://") or raw.lower().startswith("https://"):
                parsed = urlparse(raw)
                path = parsed.path or ""
                match = re.search(r"/screenplay/([^/?#]+)", path)
                if not match:
                    raise CrowdlyClientError(
                        "Could not find '/screenplay/{screenplay_id}' in the provided URL.",
                        kind="invalid_input",
                    )
                screenplay_id = match.group(1)

            title_row = client.get_screenplay_title_row(screenplay_id)
            scenes, blocks = client.get_screenplay_structure(screenplay_id, include_blocks=True)

            title = title_row.get("title") or "Untitled Screenplay"
            updated_raw = title_row.get("updated_at") or title_row.get("updatedAt")
            remote_updated_at = updated_raw if isinstance(updated_raw, str) else None
            creator_id = title_row.get("creator_id") or title_row.get("creatorId")

            # Build Markdown body from scenes/blocks (mirrors _ScreenplayPullThread).
            lines: list[str] = []
            lines.append(f"# {title}")
            lines.append("")
            for scene in scenes:
                lines.append(f"## {scene.slugline}".rstrip())
                lines.append("")
                scene_blocks = [b for b in blocks if b.scene_id == scene.scene_id]
                for block in scene_blocks:
                    text = block.text or ""
                    bt = (block.block_type or "").lower()
                    if bt == "character":
                        lines.append(text.upper())
                    elif bt == "parenthetical":
                        if not (text.startswith("(") and text.endswith(")")):
                            lines.append(f"({text})")
                        else:
                            lines.append(text)
                    else:
                        lines.append(text)
                    lines.append("")

            body_md = "\n".join(lines).rstrip() + "\n"

            self.screenplayFetched.emit(
                {
                    "screenplay_id": screenplay_id,
                    "title": title,
                    "body": body_md,
                    "source_url": raw,
                    "creator_id": creator_id,
                    "remote_updated_at": remote_updated_at,
                }
            )
        except Exception as exc:
            traceback.print_exc()
            try:
                from ..crowdly_client import CrowdlyClientError

                if isinstance(exc, CrowdlyClientError):
                    self.fetchFailed.emit({"kind": exc.kind, "message": str(exc)})
                    return
            except Exception:
                pass

            self.fetchFailed.emit(
                {"kind": "unknown", "message": f"Unexpected error: {exc}"}
            )
