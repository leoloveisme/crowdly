"""The Discovery reader: EPUB / text / Crowdly stories, PDF and audio.

Besides showing a book, the reader

- remembers the reading position (percent + an exact locator per format:
  text position, PDF page, audio seconds),
- measures *active* reading time (``ReadingSessionTracker``),
- lets the reader highlight passages and attach notes. A highlight stores
  the quoted text; when the text around it changes, the quote is searched
  again so the highlight is re-anchored instead of drifting.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from PySide6.QtCore import QEvent, QObject, QPoint, QPointF, Qt, QTimer, QUrl, Signal
from PySide6.QtGui import QColor, QTextCharFormat, QTextCursor
from PySide6.QtWidgets import (
    QComboBox,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMenu,
    QPushButton,
    QSlider,
    QSplitter,
    QStackedWidget,
    QTextBrowser,
    QTextEdit,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

HIGHLIGHT_COLORS = {
    "yellow": "#fff3a3",
    "green": "#c8f0c0",
    "blue": "#c4ddff",
    "pink": "#ffc9e3",
}

# BookOrbit-style session rules: a session ends after 5 minutes without any
# activity, and the reader's time only counts while the window is active.
IDLE_LIMIT_SECONDS = 5 * 60


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ReadingSessionTracker(QObject):
    """Counts active reading time for one open item.

    The timer ticks once a second and only counts while the reader's window
    is the active window and the reader saw activity in the last five
    minutes. Ending a session emits ``sessionFinished``; the library drops
    sessions under 10 seconds.
    """

    sessionFinished = Signal(str, str, str, int)  # item_id, started, ended, seconds

    def __init__(self, watched: QWidget) -> None:
        super().__init__(watched)
        self._watched = watched
        self._item_id: str | None = None
        self._started_at: str | None = None
        self._seconds = 0
        self._idle = 0
        self._timer = QTimer(self)
        self._timer.setInterval(1000)
        self._timer.timeout.connect(self._tick)

    def start(self, item_id: str) -> None:
        self.stop()
        self._item_id = item_id
        self._started_at = None
        self._seconds = 0
        self._idle = 0
        self._timer.start()

    def activity(self) -> None:
        self._idle = 0

    def stop(self) -> None:
        self._timer.stop()
        self._finish()
        self._item_id = None

    def _finish(self) -> None:
        if self._item_id and self._started_at and self._seconds > 0:
            self.sessionFinished.emit(self._item_id, self._started_at, _now_iso(), self._seconds)
        self._started_at = None
        self._seconds = 0

    def _tick(self) -> None:
        if self._item_id is None:
            return
        window = self._watched.window()
        if window is None or not window.isActiveWindow() or not self._watched.isVisible():
            return
        if self._idle >= IDLE_LIMIT_SECONDS:
            # Idle for five minutes: the session ends where the activity
            # stopped (the idle minutes don't count); the next activity
            # starts a new one.
            if self._started_at is not None:
                self._seconds = max(0, self._seconds - IDLE_LIMIT_SECONDS)
                self._finish()
            return
        self._idle += 1
        if self._started_at is None:
            self._started_at = _now_iso()
        self._seconds += 1


class _ActivityFilter(QObject):
    def __init__(self, tracker: ReadingSessionTracker) -> None:
        super().__init__(tracker)
        self._tracker = tracker

    def eventFilter(self, obj, event):  # pragma: no cover - UI wiring
        if event.type() in (
            QEvent.Type.KeyPress,
            QEvent.Type.MouseButtonPress,
            QEvent.Type.Wheel,
            QEvent.Type.MouseMove,
        ):
            self._tracker.activity()
        return False


class ReaderWidget(QWidget):
    """Shows one book or story and reports position, sessions, highlights."""

    backRequested = Signal()
    positionChanged = Signal(str, float, dict)  # item_id, percent, locator
    highlightAdded = Signal(str, int, int, str, str, str)  # item, start, end, quote, color, note
    highlightChanged = Signal(str, str, dict)  # item_id, highlight_id, changes
    highlightDeleted = Signal(str, str)  # item_id, highlight_id
    sessionFinished = Signal(str, str, str, int)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._item_id: str | None = None
        self._kind = "text"
        self._highlights: list[dict] = []
        self._restoring = False
        self._pdf_document = None
        self._player = None
        self._audio_output = None
        self._sleep_timer = QTimer(self)
        self._sleep_timer.setSingleShot(True)
        self._sleep_timer.timeout.connect(self._sleep_now)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Toolbar --------------------------------------------------------
        bar = QWidget(self)
        bar_layout = QHBoxLayout(bar)
        bar_layout.setContentsMargins(6, 4, 6, 4)
        self._btn_back = QPushButton(bar)
        self._btn_back.clicked.connect(self._on_back)
        bar_layout.addWidget(self._btn_back)
        self._title = QLabel(bar)
        self._title.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        bar_layout.addWidget(self._title, 1)
        self._progress = QLabel(bar)
        bar_layout.addWidget(self._progress)
        self._btn_highlight = QToolButton(bar)
        self._btn_highlight.setPopupMode(QToolButton.ToolButtonPopupMode.MenuButtonPopup)
        self._btn_highlight.clicked.connect(lambda: self._highlight_selection("yellow"))
        self._highlight_menu = QMenu(self._btn_highlight)
        self._color_actions = {}
        for name in HIGHLIGHT_COLORS:
            action = self._highlight_menu.addAction(name)
            action.triggered.connect(lambda _=False, n=name: self._highlight_selection(n))
            self._color_actions[name] = action
        self._btn_highlight.setMenu(self._highlight_menu)
        bar_layout.addWidget(self._btn_highlight)
        self._btn_note = QPushButton(bar)
        self._btn_note.clicked.connect(self._note_on_selection)
        bar_layout.addWidget(self._btn_note)
        self._btn_panel = QToolButton(bar)
        self._btn_panel.setCheckable(True)
        self._btn_panel.setChecked(True)
        self._btn_panel.toggled.connect(lambda on: self._panel.setVisible(on))
        bar_layout.addWidget(self._btn_panel)
        layout.addWidget(bar)

        # Content + highlights panel ----------------------------------------
        splitter = QSplitter(Qt.Orientation.Horizontal, self)
        self._stack = QStackedWidget(splitter)

        self._text = QTextBrowser(self._stack)
        self._text.setOpenExternalLinks(True)
        self._text.setReadOnly(True)
        self._text.document().setDocumentMargin(32)
        self._text.verticalScrollBar().valueChanged.connect(self._schedule_position)
        self._stack.addWidget(self._text)

        self._pdf_view = None
        self._pdf_placeholder = QLabel(self._stack)
        self._stack.addWidget(self._pdf_placeholder)

        self._audio_panel = self._build_audio_panel()
        self._stack.addWidget(self._audio_panel)

        self._panel = QWidget(splitter)
        panel_layout = QVBoxLayout(self._panel)
        panel_layout.setContentsMargins(4, 4, 4, 4)
        self._panel_title = QLabel(self._panel)
        panel_layout.addWidget(self._panel_title)
        self._highlight_list = QListWidget(self._panel)
        self._highlight_list.itemActivated.connect(self._jump_to_highlight)
        self._highlight_list.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self._highlight_list.customContextMenuRequested.connect(self._highlight_context_menu)
        panel_layout.addWidget(self._highlight_list, 1)
        splitter.addWidget(self._stack)
        splitter.addWidget(self._panel)
        splitter.setStretchFactor(0, 4)
        splitter.setStretchFactor(1, 1)
        layout.addWidget(splitter, 1)

        self._position_timer = QTimer(self)
        self._position_timer.setSingleShot(True)
        self._position_timer.setInterval(1200)
        self._position_timer.timeout.connect(self._emit_position)

        self._tracker = ReadingSessionTracker(self)
        self._tracker.sessionFinished.connect(self.sessionFinished)
        self._activity_filter = _ActivityFilter(self._tracker)
        self._text.viewport().installEventFilter(self._activity_filter)
        self._text.installEventFilter(self._activity_filter)

        self.retranslate()

    # -- public API ----------------------------------------------------------

    def retranslate(self) -> None:
        self._btn_back.setText(self.tr("← Library"))
        self._btn_highlight.setText(self.tr("Highlight"))
        self._btn_note.setText(self.tr("Add note"))
        self._btn_panel.setText(self.tr("Highlights"))
        self._panel_title.setText(self.tr("Highlights and notes"))
        self._pdf_placeholder.setText(self.tr("PDF viewing is not available in this build."))
        colors = {
            "yellow": self.tr("Yellow"),
            "green": self.tr("Green"),
            "blue": self.tr("Blue"),
            "pink": self.tr("Pink"),
        }
        for name, action in self._color_actions.items():
            action.setText(colors[name])
        self._btn_play.setText(self.tr("Play / Pause"))
        self._speed_label.setText(self.tr("Speed"))
        self._sleep_label.setText(self.tr("Sleep timer"))
        self._sleep_combo.setItemText(0, self.tr("Off"))
        for i, minutes in enumerate((15, 30, 60), start=1):
            self._sleep_combo.setItemText(i, self.tr("{count} min").format(count=minutes))
        self._refresh_highlight_list()
        self._update_progress_label(self._current_percent())

    def current_item_id(self) -> str | None:
        return self._item_id

    def title(self) -> str:
        return self._title.text()

    def open_text(self, item_id: str, title: str, html: str, position: dict | None, highlights: list[dict]) -> None:
        """Show HTML content (EPUB, text, Markdown, Crowdly story)."""

        self._begin(item_id, title, "text")
        self._restoring = True
        self._text.setHtml(html)
        self._stack.setCurrentWidget(self._text)
        self._highlights = [dict(h) for h in highlights]
        self._apply_highlights()
        self._set_highlight_tools_enabled(True)
        QTimer.singleShot(0, lambda: self._restore_text_position(position or {}))

    def open_pdf(self, item_id: str, title: str, path: Path, position: dict | None) -> None:
        self._begin(item_id, title, "pdf")
        self._set_highlight_tools_enabled(False)
        view = self._ensure_pdf_view()
        if view is None:
            self._stack.setCurrentWidget(self._pdf_placeholder)
            return
        self._pdf_document.load(str(path))
        view.setDocument(self._pdf_document)
        self._stack.setCurrentWidget(view)
        page = int(((position or {}).get("locator") or {}).get("page") or 0)
        self._restoring = True
        QTimer.singleShot(0, lambda: self._restore_pdf_page(page))

    def open_audio(self, item_id: str, title: str, path: Path, position: dict | None) -> None:
        self._begin(item_id, title, "audio")
        self._set_highlight_tools_enabled(False)
        player = self._ensure_player()
        self._stack.setCurrentWidget(self._audio_panel)
        if player is None:
            return
        narration = (position or {}).get("narration") or (position or {}).get("locator") or {}
        self._pending_audio_seek = int(float(narration.get("seconds") or 0) * 1000)
        player.setSource(QUrl.fromLocalFile(str(path)))

    def close_item(self) -> None:
        """Stop playback, flush the position and end the reading session."""

        if self._item_id is None:
            return
        if self._position_timer.isActive():
            self._position_timer.stop()
        self._emit_position()
        self._tracker.stop()
        if self._player is not None:
            self._player.stop()
        self._sleep_timer.stop()
        self._item_id = None

    def capture_state(self) -> dict:
        percent, locator = self._position_snapshot()
        return {"item_id": self._item_id, "percent": percent, "locator": locator}

    def set_highlights(self, highlights: list[dict]) -> None:
        self._highlights = [dict(h) for h in highlights]
        if self._kind == "text":
            self._apply_highlights()

    # -- shared --------------------------------------------------------------

    def _begin(self, item_id: str, title: str, kind: str) -> None:
        self.close_item()
        self._item_id = item_id
        self._kind = kind
        self._title.setText(title)
        self._highlights = []
        self._refresh_highlight_list()
        self._panel.setVisible(self._btn_panel.isChecked() and kind == "text")
        self._btn_panel.setEnabled(kind == "text")
        self._tracker.start(item_id)

    def _set_highlight_tools_enabled(self, enabled: bool) -> None:
        self._btn_highlight.setEnabled(enabled)
        self._btn_note.setEnabled(enabled)

    def _on_back(self) -> None:
        self.close_item()
        self.backRequested.emit()

    def _schedule_position(self, *_args) -> None:
        if self._restoring or self._item_id is None:
            return
        self._tracker.activity()
        self._position_timer.start()

    def _current_percent(self) -> float:
        return self._position_snapshot()[0] if self._item_id else 0.0

    def _update_progress_label(self, percent: float) -> None:
        if self._item_id is None:
            self._progress.setText("")
        else:
            self._progress.setText(f"{int(round(percent))}%")

    def _position_snapshot(self) -> tuple[float, dict]:
        if self._kind == "text":
            bar = self._text.verticalScrollBar()
            maximum = bar.maximum()
            percent = 100.0 if maximum <= 0 else 100.0 * bar.value() / maximum
            cursor = self._text.cursorForPosition(QPoint(4, 4))
            return percent, {"text_pos": int(cursor.position()), "scroll": int(bar.value())}
        if self._kind == "pdf" and self._pdf_view is not None and self._pdf_document is not None:
            page = int(self._pdf_view.pageNavigator().currentPage())
            count = max(1, int(self._pdf_document.pageCount()))
            return 100.0 * (page + 1) / count, {"page": page}
        if self._kind == "audio" and self._player is not None:
            pos = int(self._player.position())
            duration = max(1, int(self._player.duration()))
            return 100.0 * pos / duration, {"seconds": pos / 1000.0}
        return 0.0, {}

    def _emit_position(self) -> None:
        if self._item_id is None or self._restoring:
            return
        percent, locator = self._position_snapshot()
        self._update_progress_label(percent)
        self.positionChanged.emit(self._item_id, percent, locator)

    # -- text ------------------------------------------------------------------

    def _restore_text_position(self, position: dict) -> None:
        try:
            locator = position.get("locator") or {}
            text_pos = locator.get("text_pos")
            if isinstance(text_pos, int) and text_pos > 0:
                cursor = QTextCursor(self._text.document())
                cursor.setPosition(min(text_pos, self._text.document().characterCount() - 1))
                self._text.setTextCursor(cursor)
                # Put the restored position at the top of the viewport.
                bar = self._text.verticalScrollBar()
                bar.setValue(bar.maximum())
                self._text.ensureCursorVisible()
            else:
                percent = float(position.get("percent") or 0)
                bar = self._text.verticalScrollBar()
                bar.setValue(int(bar.maximum() * percent / 100.0))
        finally:
            self._restoring = False
            self._update_progress_label(self._current_percent())

    def _apply_highlights(self) -> None:
        """Show highlights as extra selections (the document is never changed)."""

        doc = self._text.document()
        plain = doc.toPlainText()
        selections = []
        for h in self._highlights:
            if h.get("deleted"):
                continue
            start, end = int(h.get("start", 0)), int(h.get("end", 0))
            quote = h.get("quote") or ""
            if quote and plain[start:end] != quote:
                # The text is the truth: re-anchor by searching the quote.
                found = plain.find(quote)
                if found >= 0:
                    start, end = found, found + len(quote)
                    h["start"], h["end"] = start, end
                    h.pop("unanchored", None)
                    if self._item_id:
                        self.highlightChanged.emit(self._item_id, h["id"], {"start": start, "end": end})
                else:
                    h["unanchored"] = True
                    continue
            selection = QTextEdit.ExtraSelection()
            cursor = QTextCursor(doc)
            cursor.setPosition(start)
            cursor.setPosition(end, QTextCursor.MoveMode.KeepAnchor)
            selection.cursor = cursor
            fmt = QTextCharFormat()
            fmt.setBackground(QColor(HIGHLIGHT_COLORS.get(h.get("color") or "yellow", "#fff3a3")))
            selection.format = fmt
            selections.append(selection)
        self._text.setExtraSelections(selections)
        self._refresh_highlight_list()

    def _selection(self) -> tuple[int, int, str] | None:
        cursor = self._text.textCursor()
        if not cursor.hasSelection():
            return None
        start, end = cursor.selectionStart(), cursor.selectionEnd()
        quote = self._text.document().toPlainText()[start:end]
        if not quote.strip():
            return None
        return start, end, quote

    def _highlight_selection(self, color: str, note: str = "") -> None:
        if self._item_id is None or self._kind != "text":
            return
        selection = self._selection()
        if selection is None:
            return
        start, end, quote = selection
        self.highlightAdded.emit(self._item_id, start, end, quote, color, note)

    def _note_on_selection(self) -> None:
        if self._selection() is None:
            return
        note, ok = QInputDialog.getMultiLineText(self, self.tr("Add note"), self.tr("Note:"))
        if ok:
            self._highlight_selection("yellow", note)

    def _refresh_highlight_list(self) -> None:
        self._highlight_list.clear()
        for h in sorted(self._highlights, key=lambda x: int(x.get("start", 0))):
            if h.get("deleted"):
                continue
            quote = (h.get("quote") or "").replace("\n", " ")
            text = quote if len(quote) <= 90 else quote[:87] + "…"
            if h.get("note"):
                text += "\n✎ " + h["note"]
            if h.get("unanchored"):
                text = self.tr("(text changed) ") + text
            item = QListWidgetItem(text, self._highlight_list)
            item.setData(Qt.ItemDataRole.UserRole, h.get("id"))
            item.setBackground(QColor(HIGHLIGHT_COLORS.get(h.get("color") or "yellow", "#fff3a3")))

    def _highlight_by_id(self, highlight_id: str) -> dict | None:
        return next((h for h in self._highlights if h.get("id") == highlight_id), None)

    def _jump_to_highlight(self, list_item: QListWidgetItem) -> None:
        h = self._highlight_by_id(list_item.data(Qt.ItemDataRole.UserRole))
        if h is None or h.get("unanchored"):
            return
        cursor = QTextCursor(self._text.document())
        cursor.setPosition(int(h.get("start", 0)))
        self._text.setTextCursor(cursor)
        self._text.ensureCursorVisible()

    def _highlight_context_menu(self, pos) -> None:
        list_item = self._highlight_list.itemAt(pos)
        if list_item is None or self._item_id is None:
            return
        hid = list_item.data(Qt.ItemDataRole.UserRole)
        h = self._highlight_by_id(hid)
        if h is None:
            return
        menu = QMenu(self)
        edit = menu.addAction(self.tr("Edit note"))
        delete = menu.addAction(self.tr("Delete highlight"))
        chosen = menu.exec(self._highlight_list.mapToGlobal(pos))
        if chosen is edit:
            note, ok = QInputDialog.getMultiLineText(
                self, self.tr("Edit note"), self.tr("Note:"), h.get("note") or ""
            )
            if ok:
                h["note"] = note
                self.highlightChanged.emit(self._item_id, hid, {"note": note})
                self._refresh_highlight_list()
        elif chosen is delete:
            self.highlightDeleted.emit(self._item_id, hid)

    # -- PDF -------------------------------------------------------------------

    def _ensure_pdf_view(self):
        if self._pdf_view is not None:
            return self._pdf_view
        try:
            from PySide6.QtPdf import QPdfDocument
            from PySide6.QtPdfWidgets import QPdfView
        except Exception:
            return None
        self._pdf_document = QPdfDocument(self)
        view = QPdfView(self._stack)
        view.setPageMode(QPdfView.PageMode.MultiPage)
        view.setZoomMode(QPdfView.ZoomMode.FitToWidth)
        view.pageNavigator().currentPageChanged.connect(self._schedule_position)
        view.viewport().installEventFilter(self._activity_filter)
        self._stack.addWidget(view)
        self._pdf_view = view
        return view

    def _restore_pdf_page(self, page: int) -> None:
        try:
            if self._pdf_view is not None and self._pdf_document is not None:
                page = max(0, min(page, int(self._pdf_document.pageCount()) - 1))
                self._pdf_view.pageNavigator().jump(page, QPointF(0, 0))
        finally:
            self._restoring = False
            self._update_progress_label(self._current_percent())

    # -- audio -----------------------------------------------------------------

    def _build_audio_panel(self) -> QWidget:
        panel = QWidget(self)
        layout = QVBoxLayout(panel)
        layout.addStretch(1)
        self._audio_time = QLabel("0:00 / 0:00", panel)
        self._audio_time.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self._audio_time)
        self._audio_slider = QSlider(Qt.Orientation.Horizontal, panel)
        self._audio_slider.sliderMoved.connect(self._seek_audio)
        layout.addWidget(self._audio_slider)
        row = QHBoxLayout()
        self._btn_play = QPushButton(panel)
        self._btn_play.clicked.connect(self._toggle_play)
        row.addWidget(self._btn_play)
        self._speed_label = QLabel(panel)
        row.addWidget(self._speed_label)
        self._speed_combo = QComboBox(panel)
        for speed in (0.75, 1.0, 1.25, 1.5, 1.75, 2.0):
            self._speed_combo.addItem(f"{speed:g}×", speed)
        self._speed_combo.setCurrentIndex(1)
        self._speed_combo.currentIndexChanged.connect(self._apply_speed)
        row.addWidget(self._speed_combo)
        self._sleep_label = QLabel(panel)
        row.addWidget(self._sleep_label)
        self._sleep_combo = QComboBox(panel)
        self._sleep_combo.addItem("", 0)
        for minutes in (15, 30, 60):
            self._sleep_combo.addItem("", minutes)
        self._sleep_combo.currentIndexChanged.connect(self._apply_sleep_timer)
        row.addWidget(self._sleep_combo)
        row.addStretch(1)
        layout.addLayout(row)
        layout.addStretch(2)
        self._pending_audio_seek = 0
        return panel

    def _ensure_player(self):
        if self._player is not None:
            return self._player
        try:
            from PySide6.QtMultimedia import QAudioOutput, QMediaPlayer
        except Exception:
            return None
        self._audio_output = QAudioOutput(self)
        self._player = QMediaPlayer(self)
        self._player.setAudioOutput(self._audio_output)
        self._player.durationChanged.connect(lambda d: self._audio_slider.setRange(0, int(d)))
        self._player.positionChanged.connect(self._on_audio_position)
        self._player.mediaStatusChanged.connect(self._on_media_status)
        return self._player

    def _on_media_status(self, status) -> None:
        from PySide6.QtMultimedia import QMediaPlayer

        if status == QMediaPlayer.MediaStatus.LoadedMedia and self._pending_audio_seek:
            self._player.setPosition(self._pending_audio_seek)
            self._pending_audio_seek = 0

    def _on_audio_position(self, pos: int) -> None:
        if not self._audio_slider.isSliderDown():
            self._audio_slider.setValue(int(pos))
        duration = int(self._player.duration()) if self._player is not None else 0

        def fmt(ms: int) -> str:
            seconds = max(0, ms // 1000)
            h, rem = divmod(seconds, 3600)
            m, s = divmod(rem, 60)
            return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"

        self._audio_time.setText(f"{fmt(int(pos))} / {fmt(duration)}")
        if self._player is not None and self._player.isPlaying():
            self._tracker.activity()
        self._schedule_position()

    def _toggle_play(self) -> None:
        if self._player is None:
            return
        if self._player.isPlaying():
            self._player.pause()
        else:
            self._player.play()
        self._tracker.activity()

    def _seek_audio(self, value: int) -> None:
        if self._player is not None:
            self._player.setPosition(int(value))

    def _apply_speed(self) -> None:
        if self._player is not None:
            self._player.setPlaybackRate(float(self._speed_combo.currentData() or 1.0))

    def _apply_sleep_timer(self) -> None:
        minutes = int(self._sleep_combo.currentData() or 0)
        if minutes:
            self._sleep_timer.start(minutes * 60 * 1000)
        else:
            self._sleep_timer.stop()

    def _sleep_now(self) -> None:
        if self._player is not None:
            self._player.pause()
        self._sleep_combo.setCurrentIndex(0)

    def hideEvent(self, event) -> None:  # pragma: no cover - UI wiring
        if self._position_timer.isActive():
            self._position_timer.stop()
            self._emit_position()
        super().hideEvent(event)

