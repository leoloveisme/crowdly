"""Text editor widget for editing Markdown/HTML source.

This widget is responsible only for text editing concerns. Higher-level
behaviour (document loading/saving) is handled by the main window.
"""

from __future__ import annotations

from PySide6.QtCore import Signal, Qt
from PySide6.QtWidgets import QPlainTextEdit
from PySide6.QtGui import QTextCursor


class EditorWidget(QPlainTextEdit):
    """Plain text editor that emits the full content on change.

    In addition to the usual ``textChangedWithContent`` signal, the editor
    emits ``paneFocused`` whenever it gains focus so that the main window can
    treat the Markdown pane as the active one for save/format decisions.
    """

    textChangedWithContent = Signal(str)
    paneFocused = Signal(str)

    def __init__(self, parent: object | None = None) -> None:
        super().__init__(parent)

        # Track zoom level so that we can keep zooming within a sensible range.
        self._zoom_level = 0

        # Use a monospaced font by default; the exact font will be chosen by Qt
        # based on platform defaults.
        self.textChanged.connect(self._on_text_changed)

    # Public API -----------------------------------------------------------

    def set_text(self, text: str) -> None:
        """Replace the entire editor content without emitting change twice."""

        # Block signals so that setting text programmatically does not trigger
        # redundant updates.
        old_state = self.blockSignals(True)
        try:
            self.setPlainText(text)
        finally:
            self.blockSignals(old_state)

        # Emit a single consolidated signal with the new content.
        self.textChangedWithContent.emit(self.toPlainText())

    def get_text(self) -> str:
        """Return the current editor content."""

        return self.toPlainText()

    def get_cursor_state(self) -> dict:
        """Return the current caret and scroll position.

        The state dictionary is suitable for passing to ``restore_cursor_state``
        to return to the same logical position later.
        """

        cursor = self.textCursor()
        try:
            vscroll = self.verticalScrollBar().value()
        except Exception:
            vscroll = 0

        return {
            "position": int(cursor.position()),
            "anchor": int(cursor.anchor()),
            "vscroll": int(vscroll),
        }

    def restore_cursor_state(self, state: dict | None) -> None:
        """Restore caret and scroll position from *state*.

        The method clamps positions to the current document length so it is
        safe to use after modest content changes.
        """

        if not state:
            return

        try:
            doc = self.document()
        except Exception:
            doc = None
        if doc is None:
            return

        try:
            max_pos = max(0, int(doc.characterCount()) - 1)
        except Exception:
            max_pos = 0

        pos = int(state.get("position", 0))
        anc = int(state.get("anchor", pos))
        pos = max(0, min(pos, max_pos))
        anc = max(0, min(anc, max_pos))

        cursor = self.textCursor()
        cursor.setPosition(anc)
        if anc != pos:
            cursor.setPosition(pos, QTextCursor.MoveMode.KeepAnchor)
        else:
            cursor.setPosition(pos, QTextCursor.MoveMode.MoveAnchor)

        self.setTextCursor(cursor)
        try:
            self.ensureCursorVisible()
        except Exception:
            pass

        try:
            vscroll = int(state.get("vscroll", 0))
            self.verticalScrollBar().setValue(vscroll)
        except Exception:
            pass

    # Internal slots ------------------------------------------------------

    def _on_text_changed(self) -> None:  # pragma: no cover - thin wrapper
        self.textChangedWithContent.emit(self.toPlainText())

    # Focus handling ------------------------------------------------------

    def focusInEvent(self, event) -> None:  # pragma: no cover - UI wiring
        """Emit a pane-focused signal when the editor gains focus."""

        try:
            self.paneFocused.emit("md")
        except Exception:
            pass
        super().focusInEvent(event)

    # Zoom handling -------------------------------------------------------

    def wheelEvent(self, event) -> None:  # pragma: no cover - UI wiring
        """Support Ctrl+wheel zooming while preserving normal scrolling."""

        if event.modifiers() & Qt.KeyboardModifier.ControlModifier:
            delta = event.angleDelta().y()
            if delta == 0:
                return

            step = 1 if delta > 0 else -1
            new_level = self._zoom_level + step
            # Clamp zoom level between -5 and +10 steps.
            if -5 <= new_level <= 10:
                self._zoom_level = new_level
                if step > 0:
                    self.zoomIn(1)
                else:
                    self.zoomOut(1)
            event.accept()
            return

        super().wheelEvent(event)
