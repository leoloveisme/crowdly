"""Application entrypoint for the distraction-free WYSIWYG editor.

This module bootstraps the Qt application and shows the main window.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PySide6.QtCore import QTranslator
from PySide6.QtWidgets import QApplication

from . import settings
from .ui.main_window import MainWindow


def main() -> None:
    """Run the editor application.

    Creates a QApplication instance and shows the main window. This will be
    extended over time to load user settings, translations, and other
    application services before showing the UI.
    """

    app = QApplication(sys.argv)

    app_settings = settings.load_settings()

    # Pre-load translator based on saved preference, if available.
    translator = _load_translator_for(app_settings.interface_language)
    if translator is not None:
        app.installTranslator(translator)

    window = MainWindow(app_settings, translator=translator)
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
