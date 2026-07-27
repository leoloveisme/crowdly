"""Application entrypoint for the distraction-free WYSIWYG editor.

This module bootstraps the Qt application and shows the main window.
"""

from __future__ import annotations

import sys
from pathlib import Path
import traceback

from PySide6.QtCore import QEvent, QTranslator
from PySide6.QtWidgets import QApplication, QMessageBox

from . import settings
from .ui.main_window import MainWindow


class _CrowdlyApplication(QApplication):
    """QApplication subclass that captures macOS "Open With" file requests.

    On macOS, launching (or re-activating) the app by double-clicking a
    file of a registered document type does not pass the file path via
    ``sys.argv`` the way it does on Linux desktop environments. Instead the
    OS sends an "Open Documents" Apple Event, which Qt surfaces as a
    :class:`QFileOpenEvent` delivered to the application instance. We
    override :meth:`event` to catch it: if the main window already exists
    (the app was already running), the file is opened immediately; if not
    (the file launched the app), the path is buffered in
    ``pending_open_paths`` for :func:`main` to consume once the window has
    been created.
    """

    def __init__(self, argv: list[str]) -> None:
        super().__init__(argv)
        self.pending_open_paths: list[str] = []
        self._main_window: MainWindow | None = None

    def set_main_window(self, window: MainWindow) -> None:
        """Register the main window so further FileOpen events open live."""

        self._main_window = window

    def event(self, event) -> bool:  # pragma: no cover - platform-specific UI wiring
        if event.type() == QEvent.Type.FileOpen:
            path = event.file()
            if path:
                if self._main_window is not None:
                    try:
                        self._main_window._open_paths_from_cli([path])  # type: ignore[attr-defined]
                    except Exception:
                        # Never allow file-open handling to crash the app.
                        pass
                else:
                    self.pending_open_paths.append(path)
            return True
        return super().event(event)


def main(argv: list[str] | None = None) -> None:
    """Run the editor application.

    Creates a QApplication instance and shows the main window.

    Parameters
    ----------
    argv:
        Optional list of command-line arguments *excluding* the program name.
        When provided, these are treated as filesystem paths to open on
        startup (for example when the editor is launched as the handler for
        ``.md`` files). If omitted, :data:`sys.argv` is used.
    """

    if argv is None:
        # Skip the program name; only treat the remaining entries as
        # user-supplied arguments (typically file paths on Linux desktop
        # environments when opening .md files via a file manager).
        argv = sys.argv[1:]

    app = _CrowdlyApplication(sys.argv)

    # Ensure unexpected exceptions in Qt callbacks are logged and surfaced.
    def _excepthook(exc_type, exc, tb):
        traceback.print_exception(exc_type, exc, tb)
        try:
            QMessageBox.critical(
                None,
                "Unexpected error",
                f"{exc_type.__name__}: {exc}",
            )
        except Exception:
            pass

    sys.excepthook = _excepthook

    app_settings = settings.load_settings()

    # Pre-load translator based on saved preference, if available.
    translator = _load_translator_for(app_settings.interface_language)
    if translator is not None:
        app.installTranslator(translator)

    window = MainWindow(app_settings, translator=translator)

    # Register the window so any FileOpen events arriving from now on (the
    # app was already running and macOS delivered another "Open With"
    # request) are opened immediately instead of being buffered.
    app.set_main_window(window)

    # Combine CLI-provided paths (Linux desktop environments) with any
    # macOS FileOpen paths that arrived before the window existed (i.e. the
    # file launched the app in the first place).
    startup_paths = [*argv, *app.pending_open_paths]

    # If file paths were provided on the command line (e.g. when the editor is
    # invoked as the handler for .md files) or via a macOS "Open With"
    # request, open them now so that the initial window reflects the
    # requested documents.
    # Otherwise, if the session was saved with "keep_session", restore the
    # previously open tabs.
    if startup_paths:
        try:
            window._open_paths_from_cli(startup_paths)  # type: ignore[attr-defined]
        except Exception:
            # Never allow argument handling to prevent the UI from starting.
            pass
    elif getattr(app_settings, "session_control", "close_all") == "keep_session":
        try:
            saved_tabs = getattr(app_settings, "session_open_tabs", []) or []
            if saved_tabs:
                window._open_paths_from_cli(saved_tabs)  # type: ignore[attr-defined]

                # Restore user-assigned custom tab titles.  A non-empty entry
                # means the user renamed that tab; an empty string means the
                # filename should be used (which _open_paths_from_cli already
                # set).
                saved_titles = getattr(app_settings, "session_tab_titles", []) or []
                for i, title in enumerate(saved_titles):
                    if title and i < window._tab_widget.count():  # type: ignore[attr-defined]
                        window._tab_widget.setTabText(i, title)  # type: ignore[attr-defined]
                        window._tab_user_renamed.add(i)  # type: ignore[attr-defined]

                # Restore the active tab that was focused when the session was saved.
                active = getattr(app_settings, "session_active_tab", 0)
                if isinstance(active, int) and 0 <= active < len(saved_tabs):
                    window._tab_widget.setCurrentIndex(active)  # type: ignore[attr-defined]
        except Exception:
            pass

    window.show()

    # Enter the Qt main event loop. The return code is intentionally ignored
    # here because ``python -m editor.app`` does not currently need to
    # propagate it to an external caller.
    app.exec()


def _load_translator_for(code: str) -> QTranslator | None:
    """Load and return a translator for the given language *code*.

    This expects compiled Qt translation files named
    ``editor_<code>.qm`` to live under ``src/editor/i18n`` inside the
    installed package. For example: ``editor_en.qm``, ``editor_ru.qm``, etc.
    """

    if not code:
        return None

    # ``__file__`` points at ``editor/app.py``; walk up to the package root
    # and then into the ``i18n`` directory.
    base_dir = Path(__file__).resolve().parent.joinpath("i18n")
    filename = f"editor_{code}.qm"
    path = base_dir.joinpath(filename)

    if not path.is_file():
        return None

    translator = QTranslator()
    if not translator.load(str(path)):
        return None

    return translator


if __name__ == "__main__":  # pragma: no cover - convenience entrypoint
    main()
