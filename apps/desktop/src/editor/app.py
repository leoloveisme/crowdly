"""Application entrypoint for the distraction-free WYSIWYG editor.

This module bootstraps the Qt application and shows the main window.
"""

from __future__ import annotations

import sys
from pathlib import Path
import traceback

from PySide6.QtCore import QCoreApplication, QEvent, QTranslator
from PySide6.QtWidgets import QApplication, QMessageBox

from . import app_modes, session_store, settings
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
        if event.type() == QEvent.Type.Quit:
            # Cmd+Q / app-wide quit: lets the first window that closes save
            # the whole session (every window), see MainWindow.closeEvent.
            self._crowdly_quitting = True
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

    # Verify HTTPS through the OS trust store (macOS Keychain). The bundled
    # OpenSSL in the PyInstaller .app has no CA file of its own, so without
    # this every urllib call (Google OAuth/Drive, web sync) fails with
    # CERTIFICATE_VERIFY_FAILED.
    try:
        import truststore

        truststore.inject_into_ssl()
    except Exception:
        pass

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

    # First start: take the mode this download was built for ("Crowdly
    # Discovery" or "Crowdly Creation"); from then on it is the user's
    # Settings -> Startup -> Start in choice.
    if app_modes.normalize_mode(app_settings.startup_mode) is None:
        app_settings.startup_mode = app_modes.first_start_mode()
        try:
            settings.save_settings(app_settings)
        except Exception:
            pass

    # Pre-load translator based on saved preference, if available.
    translator = _load_translator_for(app_settings.interface_language)
    if translator is not None:
        app.installTranslator(translator)

    # Combine CLI-provided paths (Linux desktop environments) with any
    # macOS FileOpen paths that arrived before the window existed (i.e. the
    # file launched the app in the first place). Opening documents always
    # wins over restoring the last session.
    startup_paths = [*argv, *app.pending_open_paths]
    resume = (
        not startup_paths
        and getattr(app_settings, "session_control", "close_all") == "keep_session"
    )
    session = session_store.session_from_settings(app_settings) if resume else {}

    extra_windows: list[MainWindow] = []
    missing: list[str] = []
    if session.get("windows"):
        # "Start where I left off": rebuild every saved window. The first one
        # is the primary window (it resumes sync and receives FileOpen events).
        def _create(index: int) -> MainWindow:
            return MainWindow(
                app_settings,
                translator=translator,
                restore_sync=(index == 0),
                mode=app_modes.MODE_CREATION,
            )

        try:
            windows, missing = session_store.restore_session(session, _create)
        except Exception:
            traceback.print_exc()
            windows = []
        if windows:
            window = windows[0]
            extra_windows = windows[1:]
        else:
            window = MainWindow(app_settings, translator=translator, restore_sync=True)
    else:
        mode = app_modes.MODE_CREATION if startup_paths else app_settings.startup_mode
        window = MainWindow(app_settings, translator=translator, restore_sync=True, mode=mode)

    # Register the window so any FileOpen events arriving from now on (the
    # app was already running and macOS delivered another "Open With"
    # request) are opened immediately instead of being buffered.
    app.set_main_window(window)
    if extra_windows:
        # Keep strong references, like MainWindow._new_window does.
        setattr(app, "_extra_windows", list(extra_windows))

    # If file paths were provided on the command line (e.g. when the editor is
    # invoked as the handler for .md files) or via a macOS "Open With"
    # request, open them now so that the initial window reflects the
    # requested documents.
    if startup_paths:
        try:
            window._open_paths_from_cli(startup_paths)  # type: ignore[attr-defined]
        except Exception:
            # Never allow argument handling to prevent the UI from starting.
            pass

    for extra in extra_windows:
        extra.show()

    window.show()
    if missing:
        window.statusBar().showMessage(
            QCoreApplication.translate(
                "App", "Files from your last session that could not be found: {count}"
            ).format(count=len(missing)),
            10000,
        )

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
