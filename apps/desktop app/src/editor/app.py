"""Application entrypoint for the distraction-free WYSIWYG editor.

This module bootstraps the Qt application and shows the main window.
"""

from __future__ import annotations

import sys
from pathlib import Path
import traceback

from PySide6.QtCore import QTranslator
from PySide6.QtWidgets import QApplication, QMessageBox

from . import settings
from .ui.main_window import MainWindow


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

    app = QApplication(sys.argv)

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

    # If file paths were provided on the command line (e.g. when the editor is
    # invoked as the handler for .md files), open them now so that the initial
    # window reflects the requested documents.
    try:
        window._open_paths_from_cli(argv)  # type: ignore[attr-defined]
    except Exception:
        # Never allow argument handling to prevent the UI from starting.
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
