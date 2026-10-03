"""Editor for a smart shelf: a name plus rules that fill the shelf by themselves.

The rule vocabulary mirrors ``RULE_FIELDS`` in backend/src/shelves.js (the
server validates again). Each field has exactly one operator, so a rule row
is: field, the operator shown as text, and a value widget for that field.
"""

from __future__ import annotations

from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

# field -> (operator, enum values or None, kind) - same as the backend.
RULE_FIELDS: dict[str, tuple[str, tuple[str, ...] | None, str]] = {
    "source": ("is", ("library", "crowdly"), "enum"),
    "format": ("is", ("epub", "pdf", "audio", "text", "story", "screenplay"), "enum"),
    "language": ("is", None, "text"),
    "title": ("contains", None, "text"),
    "author": ("contains", None, "text"),
    "status": ("is", ("favorite", "living", "lived"), "enum"),
    "progress": ("is", ("unread", "reading", "finished"), "enum"),
    "added_within_days": ("lte", None, "days"),
    "read_within_days": ("lte", None, "days"),
}
SORTS = ("title", "added", "progress", "last_read")
MAX_RULES = 20


class _RuleRow(QWidget):
    def __init__(self, dialog: "SmartShelfDialog", rule: dict | None = None) -> None:
        super().__init__(dialog)
        self._dialog = dialog
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        self.field = QComboBox(self)
        for key in RULE_FIELDS:
            self.field.addItem(dialog.field_label(key), key)
        layout.addWidget(self.field, 2)
        self.op_label = QLabel(self)
        layout.addWidget(self.op_label, 1)
        self.values = QStackedWidget(self)
        self.enum_value = QComboBox(self.values)
        self.text_value = QLineEdit(self.values)
        self.days_value = QSpinBox(self.values)
        self.days_value.setRange(1, 36500)
        self.days_value.setValue(30)
        for widget in (self.enum_value, self.text_value, self.days_value):
            self.values.addWidget(widget)
        layout.addWidget(self.values, 2)
        self.remove = QPushButton("−", self)
        self.remove.setFixedWidth(28)
        self.remove.clicked.connect(lambda: dialog.remove_row(self))
        layout.addWidget(self.remove)
        self.field.currentIndexChanged.connect(self._field_changed)
        if rule and rule.get("field") in RULE_FIELDS:
            self.field.setCurrentIndex(list(RULE_FIELDS).index(rule["field"]))
        self._field_changed()
        if rule:
            self.set_value(rule.get("value"))

    def _field_changed(self) -> None:
        key = self.field.currentData()
        op, values, kind = RULE_FIELDS[key]
        self.op_label.setText(self._dialog.op_label(op))
        if kind == "enum":
            self.enum_value.clear()
            for value in values or ():
                self.enum_value.addItem(self._dialog.value_label(value), value)
            self.values.setCurrentWidget(self.enum_value)
        elif kind == "days":
            self.values.setCurrentWidget(self.days_value)
        else:
            self.values.setCurrentWidget(self.text_value)

    def set_value(self, value) -> None:
        kind = RULE_FIELDS[self.field.currentData()][2]
        if kind == "enum":
            index = self.enum_value.findData(value)
            if index >= 0:
                self.enum_value.setCurrentIndex(index)
        elif kind == "days":
            try:
                self.days_value.setValue(int(value))
            except (TypeError, ValueError):
                pass
        else:
            self.text_value.setText(str(value or ""))

    def rule(self) -> dict:
        key = self.field.currentData()
        op, _values, kind = RULE_FIELDS[key]
        if kind == "enum":
            value = self.enum_value.currentData()
        elif kind == "days":
            value = int(self.days_value.value())
        else:
            value = self.text_value.text().strip()
        return {"field": key, "op": op, "value": value}


class SmartShelfDialog(QDialog):
    """Create or edit a smart shelf; ``result_data()`` gives name, rules, sort."""

    def __init__(self, parent: QWidget | None = None, *, name: str = "", rules: dict | None = None, sort: str = "title") -> None:
        super().__init__(parent)
        self.setWindowTitle(self.tr("Smart shelf"))
        self.setMinimumWidth(620)
        layout = QVBoxLayout(self)

        form = QFormLayout()
        self.name = QLineEdit(name, self)
        self.name.setMaxLength(100)
        form.addRow(self.tr("Name"), self.name)
        self.match = QComboBox(self)
        self.match.addItem(self.tr("all of these rules"), "all")
        self.match.addItem(self.tr("any of these rules"), "any")
        if (rules or {}).get("match") == "any":
            self.match.setCurrentIndex(1)
        form.addRow(self.tr("Show items that match"), self.match)
        self.sort = QComboBox(self)
        for key in SORTS:
            self.sort.addItem(sort_label(self, key), key)
        index = self.sort.findData(sort)
        self.sort.setCurrentIndex(max(0, index))
        form.addRow(self.tr("Sort by"), self.sort)
        layout.addLayout(form)

        self._rows_box = QVBoxLayout()
        layout.addLayout(self._rows_box)
        self._rows: list[_RuleRow] = []
        for rule in (rules or {}).get("rules") or [None]:
            self.add_row(rule)

        self._btn_add = QPushButton(self.tr("Add rule"), self)
        self._btn_add.clicked.connect(lambda: self.add_row(None))
        layout.addWidget(self._btn_add)

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Save | QDialogButtonBox.StandardButton.Cancel, self
        )
        buttons.accepted.connect(self._accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    # -- labels (translated) ------------------------------------------------------

    def field_label(self, key: str) -> str:
        return {
            "source": self.tr("Source"),
            "format": self.tr("Format"),
            "language": self.tr("Language"),
            "title": self.tr("Title"),
            "author": self.tr("Author"),
            "status": self.tr("Crowdly status"),
            "progress": self.tr("Reading progress"),
            "added_within_days": self.tr("Added in the last"),
            "read_within_days": self.tr("Read in the last"),
        }[key]

    def op_label(self, op: str) -> str:
        return {"is": self.tr("is"), "contains": self.tr("contains"), "lte": self.tr("days (at most)")}[op]

    def value_label(self, value: str) -> str:
        return {
            "library": self.tr("My library"),
            "crowdly": self.tr("Crowdly"),
            "epub": "EPUB",
            "pdf": "PDF",
            "audio": self.tr("Audio"),
            "text": self.tr("Text"),
            "story": self.tr("Story"),
            "screenplay": self.tr("Screenplay"),
            "favorite": self.tr("Favorite"),
            "living": self.tr("Living"),
            "lived": self.tr("Lived"),
            "unread": self.tr("Not started"),
            "reading": self.tr("In progress"),
            "finished": self.tr("Finished"),
        }.get(value, value)

    # -- rows -------------------------------------------------------------------

    def add_row(self, rule: dict | None) -> None:
        if len(self._rows) >= MAX_RULES:
            return
        row = _RuleRow(self, rule)
        self._rows.append(row)
        self._rows_box.addWidget(row)

    def remove_row(self, row: _RuleRow) -> None:
        if len(self._rows) <= 1:
            return
        self._rows.remove(row)
        row.setParent(None)
        row.deleteLater()

    def rules(self) -> dict:
        return {"match": self.match.currentData(), "rules": [r.rule() for r in self._rows]}

    def result_data(self) -> dict:
        return {"name": self.name.text().strip(), "rules": self.rules(), "sort": self.sort.currentData()}

    def _accept(self) -> None:
        data = self.result_data()
        if not data["name"]:
            QMessageBox.warning(self, self.tr("Smart shelf"), self.tr("Please give the shelf a name."))
            return
        if any(r["value"] in ("", None) for r in data["rules"]["rules"]):
            QMessageBox.warning(self, self.tr("Smart shelf"), self.tr("Every rule needs a value."))
            return
        self.accept()


def sort_label(widget: QWidget, key: str) -> str:
    """Translated label for a shelf sort (shared with the shelves page)."""

    from PySide6.QtCore import QCoreApplication

    labels = {
        "manual": QCoreApplication.translate("Shelves", "My order"),
        "title": QCoreApplication.translate("Shelves", "Title"),
        "added": QCoreApplication.translate("Shelves", "Recently added"),
        "progress": QCoreApplication.translate("Shelves", "Reading progress"),
        "last_read": QCoreApplication.translate("Shelves", "Recently read"),
    }
    return labels[key]
