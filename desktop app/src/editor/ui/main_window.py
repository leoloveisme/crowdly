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
)
from PySide6.QtCore import Qt, QTimer, QEvent, QCoreApplication, QObject, QThread, Signal
from PySide6.QtGui import QAction, QActionGroup

from ..document import Document
from ..settings import Settings, save_settings
from .. import file_metadata
from .. import story_sync
from ..versioning import local_queue
from .editor_widget import EditorWidget
from .preview_widget import PreviewWidget


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
        self._language_actions: dict[str, QAction] = {}
        self._translator = translator
        self._logged_in = False

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

        # Track where the last content change originated from so that we can
        # decide whether re-rendering the preview from Markdown is safe.
        self._last_change_from_preview = False

        # Current in-memory document being edited. With multiple tabs, this
        # always refers to the document in the *active* tab.
        self._document = Document()

        # Per-tab state (documents and their associated editor/preview widgets).
        self._tab_documents: list[Document] = []
        self._tab_widgets: list[tuple[EditorWidget, PreviewWidget]] = []
        self._current_tab_index: int = 0

        # Simple debounced autosave timer (milliseconds).
        self._autosave_interval_ms = 2000
        self._autosave_timer = QTimer(self)
        self._autosave_timer.setSingleShot(True)
        self._autosave_timer.timeout.connect(self._perform_autosave)

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
        self._action_open_file = open_menu.addAction(
            self.tr("File"),
            self._open_document,
        )

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

        view_menu = menu.addMenu(self.tr("View"))
        self._view_menu = view_menu

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

        # Both the Markdown/HTML editor and the WYSIWYG preview are available;
        # the View menu lets the user decide which panes are visible.
        self._action_view_md_editor = view_menu.addAction(
            self.tr("Markdown (MD) / HTML editor"),
        )
        self._action_view_md_editor.setCheckable(True)
        self._action_view_md_editor.setChecked(True)
        self._action_view_md_editor.toggled.connect(self._on_view_md_toggled)

        menu.addSeparator()
        self._action_login_logout = menu.addAction(
            self.tr("Login"), self._toggle_login_logout
        )
        self._action_quit = menu.addAction(self.tr("Quit"), self.close)
        burger_button.setMenu(menu)
        self._menu = menu

        top_layout.addWidget(burger_button)
        top_layout.addStretch(1)

        # Toggle button in the top-right to show/hide the preview pane.
        self._preview_toggle = QToolButton(top_bar)
        self._preview_toggle.setText(self.tr("Preview"))
        self._preview_toggle.setCheckable(True)
        self._preview_toggle.setChecked(True)
        self._preview_toggle.setToolTip(self.tr("Show or hide the preview pane"))
        self._preview_toggle.toggled.connect(self._set_preview_visible)
        top_layout.addWidget(self._preview_toggle)

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

        # Assemble layout: top bar above the tab widget.
        root_layout.addWidget(top_bar)
        root_layout.addWidget(self._tab_widget, 1)

        self.setCentralWidget(container)

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

        # Right-aligned user label.
        self._user_label = QLabel(self)
        bar.addPermanentWidget(self._user_label, 0)

        self._update_document_stats_label()
        self._update_sync_status_label()
        self._update_user_status_label()

    # Internal helpers ----------------------------------------------------

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

    def _on_editor_text_changed(self, text: str) -> None:  # pragma: no cover - UI wiring
        """Handle text changes from the editor.

        Updates the in-memory document, refreshes the preview, and schedules
        an autosave after a short delay.
        """

        self._document.set_content(text)
        self._last_change_from_preview = False

        # Push the updated Markdown into the WYSIWYG preview without
        # triggering a feedback loop.
        if self.preview.isVisible():
            self.preview.set_markdown(text)

        # Restart autosave timer.
        if self._autosave_timer.isActive():
            self._autosave_timer.stop()
        self._autosave_timer.start(self._autosave_interval_ms)

        self._update_document_stats_label()

    def _on_preview_markdown_changed(self, text: str) -> None:  # pragma: no cover
        """Handle text changes from the WYSIWYG preview.

        *text* is the Markdown representation of the current document as edited
        in the preview. We treat this as the canonical source so that the local
        file and backend sync remain Markdown-based.
        """

        self._document.set_content(text)
        self._last_change_from_preview = True

        # Update the plain-text editor without triggering a feedback loop.
        old_state = self.editor.blockSignals(True)
        try:
            self.editor.setPlainText(text)
        finally:
            self.editor.blockSignals(old_state)

        # Restart autosave timer.
        if self._autosave_timer.isActive():
            self._autosave_timer.stop()
        self._autosave_timer.start(self._autosave_interval_ms)

        self._update_document_stats_label()

    def _create_tab_for_document(self, document: Document, title: str | None = None) -> int:
        """Create a new tab for *document* and return its index."""

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

        index = self._tab_widget.addTab(
            splitter,
            title or self.tr("Tab {index}").format(index=self._tab_widget.count() + 1),
        )

        # Ensure our parallel tab state lists stay aligned with the QTabWidget.
        self._tab_documents.insert(index, document)
        self._tab_widgets.insert(index, (editor, preview))

        # If this is the very first tab, make its widgets the active ones.
        if self._tab_widget.count() == 1:
            self.editor = editor
            self.preview = preview
            self._current_tab_index = 0

            # Ensure preview visibility matches the toggle state.
            if hasattr(self, "_preview_toggle"):
                self._set_preview_visible(self._preview_toggle.isChecked())

        return index

    def _on_tab_close_requested(self, index: int) -> None:  # pragma: no cover - UI wiring
        """Handle requests to close a tab via its 'x' button.

        At least one tab is always kept open; closing the last remaining tab is
        ignored for now.
        """

        if index < 0 or index >= len(self._tab_widgets):
            return

        # Do not allow closing the last remaining tab.
        if self._tab_widget.count() <= 1:
            return

        # Remove the tab from the QTabWidget first; Qt will pick a new current
        # index automatically.
        self._tab_widget.removeTab(index)

        # Remove parallel state entries.
        try:
            self._tab_documents.pop(index)
            self._tab_widgets.pop(index)
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
        """Switch active editor/preview and document when the tab changes."""

        if index < 0 or index >= len(self._tab_widgets):
            return

        self._current_tab_index = index

        # Update active widgets.
        self.editor, self.preview = self._tab_widgets[index]

        # Switch the in-memory document to the one associated with this tab.
        self._document = self._tab_documents[index]

        # Make sure the UI reflects the new document's content and statistics.
        # We avoid emitting extra change signals by blocking them while
        # updating the editor programmatically.
        old_state = self.editor.blockSignals(True)
        try:
            self.editor.setPlainText(self._document.content)
        finally:
            self.editor.blockSignals(old_state)

        self.preview.set_markdown(self._document.content)
        self._update_document_stats_label()

        # Keep the preview visibility in sync with the global toggle.
        if hasattr(self, "_preview_toggle"):
            self._set_preview_visible(self._preview_toggle.isChecked())

    def _set_preview_visible(self, visible: bool) -> None:  # pragma: no cover - UI wiring
        """Show or hide the preview pane without affecting the editor.

        The toggle button in the top bar controls this. When hidden, the
        editor takes all horizontal space; when shown, the splitter layout is
        restored automatically by Qt.
        """

        self.preview.setVisible(visible)
        # When re-showing the preview, ensure it has up-to-date content if
        # the last change came from the plain-text editor. If the last
        # change came from the WYSIWYG pane itself, preserve its rich
        # formatting (including alignment) and do not overwrite.
        if visible and not self._last_change_from_preview:
            self.preview.set_markdown(self.editor.get_text())

    def _generate_default_document_path(self) -> Path:
        """Return a default path for new documents in the project space.

        The current strategy is ``untitled-YYYYMMDD-HHMMSS.md`` inside the
        selected project space directory.
        """

        if not self._project_space_path:
            raise RuntimeError("Cannot generate document path without project space")

        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        return self._project_space_path / f"untitled-{timestamp}.md"

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
            target_path = self._document.path
        elif self._project_space_path is not None:
            target_path = self._generate_default_document_path()
        else:
            # No file path and no project space to create one in.
            return

        self._document.save(target_path)

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

        self.setWindowTitle(self.tr("Distraction-Free Editor"))

        # Menus and actions.
        if hasattr(self, "_burger_button"):
            self._burger_button.setToolTip(self.tr("Main menu"))
        if hasattr(self, "_new_menu"):
            self._new_menu.setTitle(self.tr("New"))
        if hasattr(self, "_action_new_document"):
            self._action_new_document.setText(self.tr("New document"))
        if hasattr(self, "_action_new_directory"):
            self._action_new_directory.setText(self.tr("New directory"))
        if hasattr(self, "_action_new_tab"):
            self._action_new_tab.setText(self.tr("Tab"))
        if hasattr(self, "_action_new_window"):
            self._action_new_window.setText(self.tr("Window"))
        if hasattr(self, "_open_menu"):
            self._open_menu.setTitle(self.tr("Open"))
        if hasattr(self, "_action_open_story_web"):
            self._action_open_story_web.setText(self.tr("Story on the web"))
        if hasattr(self, "_action_open_file"):
            self._action_open_file.setText(self.tr("File"))
        if hasattr(self, "_settings_menu"):
            self._settings_menu.setTitle(self.tr("Settings"))
        if hasattr(self, "_view_menu"):
            self._view_menu.setTitle(self.tr("View"))
        if hasattr(self, "_story_settings_menu"):
            self._story_settings_menu.setTitle(self.tr("Story settings"))
        if hasattr(self, "_action_view_story_metadata"):
            self._action_view_story_metadata.setText(self.tr("View story metadata"))
        if hasattr(self, "_action_set_story_genre"):
            self._action_set_story_genre.setText(self.tr("Add genre"))
        if hasattr(self, "_action_refresh_story_from_web"):
            self._action_refresh_story_from_web.setText(self.tr("Refresh from web"))
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

        # Language entries within the submenu.
        labels_by_code = {
            "en": self.tr("English"),
            "ru": self.tr("Russian"),
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
        if hasattr(self, "_preview_toggle"):
            self._preview_toggle.setText(self.tr("Preview"))
            self._preview_toggle.setToolTip(
                self.tr("Show or hide the preview pane")
            )

    def _compute_document_stats(self) -> tuple[int, int, int]:
        """Return (words, paragraphs, chapters) for the current document.

        - Words: whitespace-separated tokens in the source text.
        - Paragraphs: groups of non-empty lines separated by blank lines.
        - Chapters: lines starting with a Markdown level-1 heading ("# ").
        """

        # Base stats on the WYSIWYG content so that what you see is what is
        # counted. We use the preview's markdown representation.
        text = self.preview.get_markdown()
        words = len(text.split()) if text else 0

        paragraphs = 0
        current_para_lines = 0
        for line in text.splitlines():
            if line.strip():
                current_para_lines += 1
            else:
                if current_para_lines:
                    paragraphs += 1
                    current_para_lines = 0
        if current_para_lines:
            paragraphs += 1

        chapters = sum(1 for line in text.splitlines()
                       if line.lstrip().startswith("# "))

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

    # Slots ---------------------------------------------------------------

    def _new_document(self) -> None:  # pragma: no cover - UI wiring
        """Save the current document (if needed) and start a new blank one.

        This only affects the *current* tab; other tabs keep their documents
        unchanged.
        """

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

    def _new_tab(self) -> None:  # pragma: no cover - UI wiring
        """Create a new tab with its own independent document."""

        new_doc = Document()
        index = self._create_tab_for_document(new_doc)
        self._tab_documents[index] = new_doc
        self._tab_widget.setCurrentIndex(index)

    def _new_window(self) -> None:  # pragma: no cover - UI wiring
        """Open a new top-level editor window sharing the same settings."""

        app = QCoreApplication.instance()
        if app is None:
            return

        try:
            # Reuse the current settings instance so preferences are shared.
            new_window = MainWindow(self._settings, parent=None, translator=self._translator)
            new_window.show()

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

    def _export_as_pdf(self) -> None:  # pragma: no cover - UI wiring
        """Export the current document as a PDF file.

        The concrete export implementation will be wired up in a later
        iteration.
        """

        QMessageBox.information(
            self,
            self.tr("Export as PDF"),
            self.tr("Export to PDF is not implemented yet."),
        )

    def _export_as_epub(self) -> None:  # pragma: no cover - UI wiring
        """Export the current document as an EPUB file."""

        QMessageBox.information(
            self,
            self.tr("Export as EPUB"),
            self.tr("Export to EPUB is not implemented yet."),
        )

    def _export_as_docx(self) -> None:  # pragma: no cover - UI wiring
        """Export the current document as a DOCX file."""

        QMessageBox.information(
            self,
            self.tr("Export as docx"),
            self.tr("Export to docx is not implemented yet."),
        )

    def _export_as_odt(self) -> None:  # pragma: no cover - UI wiring
        """Export the current document as an ODT file."""

        QMessageBox.information(
            self,
            self.tr("Export as odt"),
            self.tr("Export to odt is not implemented yet."),
        )

    def _import_from_file(self) -> None:  # pragma: no cover - UI wiring
        """Import content from a file into the current document.

        The concrete import behaviour (supported file types, merge strategy,
        etc.) will be defined in a later iteration.
        """

        QMessageBox.information(
            self,
            self.tr("Import"),
            self.tr("Import from file is not implemented yet."),
        )

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
        self._retranslate_ui()
        self._update_user_status_label()
        self._update_sync_status_label()

    def _on_view_md_toggled(self, checked: bool) -> None:  # pragma: no cover
        """Show or hide the Markdown/HTML editor pane via the View menu.

        If the user attempts to hide both panes, this method restores the
        editor to a visible state. When only the editor is visible it
        automatically occupies the full width of the splitter.
        """

        # Prevent both panes from being hidden.
        if not checked and hasattr(self, "_action_view_wysiwyg"):
            if not self._action_view_wysiwyg.isChecked():
                self._action_view_md_editor.blockSignals(True)
                self._action_view_md_editor.setChecked(True)
                self._action_view_md_editor.blockSignals(False)
                return

        self.editor.setVisible(checked)

    def _on_view_wysiwyg_toggled(self, checked: bool) -> None:  # pragma: no cover
        """Show or hide the WYSIWYG preview pane via the View menu.

        Hiding the preview makes the Markdown editor occupy the full width.
        If the user attempts to hide both panes, the preview checkbox is
        forced back on.
        """

        # Prevent both panes from being hidden.
        if not checked and hasattr(self, "_action_view_md_editor"):
            if not self._action_view_md_editor.isChecked():
                self._action_view_wysiwyg.blockSignals(True)
                self._action_view_wysiwyg.setChecked(True)
                self._action_view_wysiwyg.blockSignals(False)
                return

        # Drive the existing preview toggle so all behaviour is centralised.
        self._preview_toggle.setChecked(checked)
        if hasattr(self, "_action_view_wysiwyg"):
            self._action_view_wysiwyg.blockSignals(True)
            self._action_view_wysiwyg.setChecked(checked)
            self._action_view_wysiwyg.blockSignals(False)

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
        """Open a story from the web and import it into the project space."""

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

            story_url = dialog.value()
            if not story_url:
                return

            self._start_crowdly_fetch(story_url)
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

    def _open_document(self) -> None:  # pragma: no cover - UI wiring
        """Open an existing Markdown document and load it into the editor."""

        start_dir = str(self._project_space_path) if self._project_space_path else ""
        path, _ = QFileDialog.getOpenFileName(
            self,
            self.tr("Open Markdown document"),
            start_dir,
            self.tr("Markdown files (*.md);;All files (*)"),
        )
        if not path:
            return

        external_path = Path(path)
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
        # the preview explicitly.
        old_state = self.editor.blockSignals(True)
        try:
            self.editor.setPlainText(doc.content)
        finally:
            self.editor.blockSignals(old_state)

        self.preview.set_markdown(doc.content)
        self._update_document_stats_label()

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
        self._project_space_path = Path(path)
        self._settings.project_space = self._project_space_path
        save_settings(self._settings)
        self._update_project_space_status()

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

    def _view_story_metadata(self) -> None:  # pragma: no cover - UI wiring
        """Display Crowdly story metadata for the current file."""

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

            if not file_metadata.has_story_metadata(path):
                QMessageBox.information(
                    self,
                    self.tr("Story metadata"),
                    self.tr("This file is not associated with a Crowdly story."),
                )
                return

            md = file_metadata.read_story_metadata(path)

            # Render in a simple, readable block.
            lines = [
                f"author_id: {md.author_id or ''}",
                f"initiator_id: {md.initiator_id or ''}",
                f"story_id: {md.story_id or ''}",
                f"story_title: {md.story_title or ''}",
                f"genre: {md.genre or ''}",
                f"tags: {md.tags or ''}",
                f"creation_date: {md.creation_date or ''}",
                f"change_date: {md.change_date or ''}",
                f"last_sync_date: {md.last_sync_date or ''}",
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

            if not file_metadata.has_story_metadata(path):
                QMessageBox.information(
                    self,
                    self.tr("Genre"),
                    self.tr("This file is not associated with a Crowdly story."),
                )
                return

            current = file_metadata.get_attr(path, file_metadata.FIELD_GENRE) or ""

            options = [
                "YA",
                "sci-fi",
                "fantasy",
                "horror",
                "thriller",
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

        If the story requires authentication, prompt once for credentials and
        only start the pull if login succeeds.
        """

        try:
            creds = self._ensure_crowdly_web_credentials()
            if not creds:
                return
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
        """Start a background pull if the remote story has changed."""

        import traceback

        path = self._get_current_document_path()
        if path is None:
            return
        if not file_metadata.has_story_metadata(path):
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
        """Best-effort: sync the current local story back to the Crowdly backend."""

        import traceback

        try:
            path = self._get_current_document_path()
            if path is None:
                return

            if not file_metadata.has_story_metadata(path):
                return

            story_id = file_metadata.get_attr(path, file_metadata.FIELD_STORY_ID)
            source_url = file_metadata.get_attr(path, file_metadata.FIELD_SOURCE_URL)
            body_format = file_metadata.get_attr(path, file_metadata.FIELD_BODY_FORMAT)
            if not story_id or not source_url:
                return

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

    def _on_story_sync_succeeded(self, result: object) -> None:  # pragma: no cover
        import traceback

        try:
            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(self.tr("Story synced to the web."), 5000)
        except Exception:
            traceback.print_exc()

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

    def _on_story_sync_finished(self) -> None:  # pragma: no cover
        self._story_sync_thread = None


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
    """Background thread that syncs a local story back to the Crowdly backend."""

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

    def run(self) -> None:
        import traceback

        try:
            from ..crowdly_client import CrowdlyClient

            client = CrowdlyClient(self._api_base, credentials=self._credentials)
            result = client.sync_desktop_story(
                self._story_id,
                title=self._title,
                chapters=self._chapters,
                metadata=self._metadata,
            )

            # Update last_sync_date on success.
            try:
                file_metadata.touch_last_sync_date(self._local_path)
            except Exception:
                pass

            self.syncSucceeded.emit(result)
        except Exception as exc:
            traceback.print_exc()
            self.syncFailed.emit(str(exc))


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
