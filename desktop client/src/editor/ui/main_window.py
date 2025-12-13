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
)
from PySide6.QtCore import Qt, QTimer, QEvent, QCoreApplication
from PySide6.QtGui import QAction, QActionGroup

from ..document import Document
from ..settings import Settings, save_settings
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

        # Track where the last content change originated from so that we can
        # decide whether re-rendering the preview from Markdown is safe.
        self._last_change_from_preview = False

        # Current in-memory document being edited.
        self._document = Document()

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
        self._action_open = menu.addAction(self.tr("Open..."), self._open_document)
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

        # Both the Markdown/HTML editor and the WYSIWYG preview are available;
        # the View menu lets the user decide which panes are visible.
        self._action_view_md_editor = view_menu.addAction(
            self.tr("Markdown (MD) / HTML editor"),
        )
        self._action_view_md_editor.setCheckable(True)
        self._action_view_md_editor.setChecked(True)
        self._action_view_md_editor.toggled.connect(self._on_view_md_toggled)

        self._action_view_wysiwyg = view_menu.addAction(
            self.tr("WYSIWYG editor (preview pane)"),
        )
        self._action_view_wysiwyg.setCheckable(True)
        self._action_view_wysiwyg.setChecked(True)
        self._action_view_wysiwyg.toggled.connect(self._on_view_wysiwyg_toggled)

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

        # Main content: horizontal splitter with editor and preview.
        splitter = QSplitter(Qt.Orientation.Horizontal, container)

        self.editor = EditorWidget(splitter)
        self.preview = PreviewWidget(splitter)

        splitter.addWidget(self.editor)
        splitter.addWidget(self.preview)
        splitter.setStretchFactor(0, 3)
        splitter.setStretchFactor(1, 2)

        # Keep document and preview in sync with editor content.
        self.editor.textChangedWithContent.connect(self._on_editor_text_changed)
        self.preview.markdownEdited.connect(self._on_preview_markdown_changed)

        # Assemble layout: top bar above the splitter.
        root_layout.addWidget(top_bar)
        root_layout.addWidget(splitter, 1)

        self.setCentralWidget(container)

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

        # Right-aligned user label.
        self._user_label = QLabel(self)
        bar.addPermanentWidget(self._user_label, 0)

        self._update_document_stats_label()
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

        *text* is the HTML representation of the current document as edited in
        the preview. We treat this as the canonical source so that rich
        formatting (such as alignment) is preserved, while still allowing the
        left-hand editor to display and edit the same content as plain text.
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
        if hasattr(self, "_action_open"):
            self._action_open.setText(self.tr("Open..."))
        if hasattr(self, "_settings_menu"):
            self._settings_menu.setTitle(self.tr("Settings"))
        if hasattr(self, "_view_menu"):
            self._view_menu.setTitle(self.tr("View"))
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

    # Slots ---------------------------------------------------------------

    def _new_document(self) -> None:  # pragma: no cover - UI wiring
        """Save the current document (if needed) and start a new blank one."""

        # Ensure any pending autosave is processed immediately.
        if self._autosave_timer.isActive():
            self._autosave_timer.stop()
        self._perform_autosave()

        # Reset in-memory document to a fresh, unsaved instance.
        self._document = Document()

        # Clear editor content without triggering autosave or preview updates.
        old_state = self.editor.blockSignals(True)
        try:
            self.editor.setPlainText("")
        finally:
            self.editor.blockSignals(old_state)

        # Clear preview explicitly.
        if self.preview.isVisible():
            self.preview.set_markdown("")

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
        """Toggle synchronisation with the web platform (placeholder)."""

        self._sync_web_platform = not self._sync_web_platform
        self._retranslate_ui()

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
                doc.path = mapped

        self._document = doc

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
