"""Run blocking network work off the UI thread."""

from __future__ import annotations

import traceback
from typing import Any, Callable

from PySide6.QtCore import QObject, QRunnable, QThreadPool, Signal


class _Signals(QObject):
    done = Signal(object)
    failed = Signal(str)


class _Task(QRunnable):
    def __init__(self, fn: Callable[[], Any]) -> None:
        super().__init__()
        self.fn = fn
        self.signals = _Signals()

    def run(self) -> None:  # pragma: no cover - runs on a worker thread
        try:
            result = self.fn()
        except Exception as exc:  # report every failure to the UI
            traceback.print_exc()
            self.signals.failed.emit(str(exc) or exc.__class__.__name__)
            return
        self.signals.done.emit(result)


_live: set[_Task] = set()


def run_in_background(
    fn: Callable[[], Any],
    on_done: Callable[[Any], None] | None = None,
    on_error: Callable[[str], None] | None = None,
) -> None:
    """Run *fn* on the global thread pool; callbacks run on the UI thread."""

    task = _Task(fn)
    task.setAutoDelete(False)
    _live.add(task)

    def _finish(*_args) -> None:
        _live.discard(task)

    if on_done is not None:
        task.signals.done.connect(on_done)
    if on_error is not None:
        task.signals.failed.connect(on_error)
    task.signals.done.connect(_finish)
    task.signals.failed.connect(_finish)
    QThreadPool.globalInstance().start(task)
