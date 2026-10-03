"""Round-trip tests for the WYSIWYG pane (Phase 0 of the desktop v2.0 plan).

Saving from the WYSIWYG pane used to rewrite the whole Markdown file. These
tests pin down that an unedited document comes back byte-for-byte and that a
small edit changes only the lines it touches.
"""

import difflib

import pytest
from PySide6.QtCore import Qt
from PySide6.QtGui import QTextBlockFormat, QTextCursor

from editor.markdown_roundtrip import split_chunks
from editor.ui.preview_widget import PreviewWidget

SAMPLES = ["plan_sample.md", "tables_sample.md", "mixed_sample.md"]


def _changed_lines(before: str, after: str) -> list[str]:
    return [
        line
        for line in difflib.unified_diff(before.splitlines(), after.splitlines(), lineterm="", n=0)
        if line[:1] in "+-" and not line.startswith(("+++", "---"))
    ]


def _find_block(preview: PreviewWidget, needle: str):
    block = preview._editor.document().begin()
    while block.isValid():
        if needle in block.text():
            return block
        block = block.next()
    raise AssertionError(f"block containing {needle!r} not found")


def _insert_after(preview: PreviewWidget, needle: str, text: str) -> None:
    block = _find_block(preview, needle)
    cursor = QTextCursor(block)
    cursor.setPosition(block.position() + block.text().index(needle) + len(needle))
    cursor.insertText(text)


@pytest.mark.parametrize("name", SAMPLES)
def test_split_chunks_is_lossless(name, fixture_text):
    text = fixture_text(name)
    assert "".join(c.raw for c in split_chunks(text)) == text


@pytest.mark.parametrize("name", SAMPLES)
def test_unedited_document_is_byte_identical(qapp, name, fixture_text):
    text = fixture_text(name)
    preview = PreviewWidget()
    preview.set_markdown(text)
    assert preview.get_markdown() == text


def test_one_word_edit_changes_one_line(qapp, fixture_text):
    text = fixture_text("plan_sample.md")
    preview = PreviewWidget()
    preview.set_markdown(text)

    emitted: list[str] = []
    preview.markdownEdited.connect(emitted.append)
    _insert_after(preview, "We want a second mode", " (really)")

    result = preview.get_markdown()
    assert emitted and emitted[-1] == result
    changed = _changed_lines(text, result)
    assert len(changed) == 2, changed  # one line removed, one added
    assert "We want a second mode (really)" in changed[1]


def test_list_item_edit_keeps_other_lines(qapp, fixture_text):
    text = fixture_text("mixed_sample.md")
    preview = PreviewWidget()
    preview.set_markdown(text)
    _insert_after(preview, "deeper", " still")

    result = preview.get_markdown()
    assert "    - deeper still" in result
    # Everything outside the edited list is untouched.
    for line in text.splitlines():
        if not line.startswith(("-", " ", "**Label**")):
            assert line in result.splitlines(), line


def test_alignment_only_change_does_not_rewrite(qapp, fixture_text):
    text = fixture_text("mixed_sample.md")
    preview = PreviewWidget()
    preview.set_markdown(text)

    cursor = QTextCursor(preview._editor.document())
    cursor.select(QTextCursor.SelectionType.Document)
    fmt = QTextBlockFormat()
    fmt.setAlignment(Qt.AlignmentFlag.AlignHCenter)
    cursor.mergeBlockFormat(fmt)

    assert preview.get_markdown() == text


def test_undo_restores_exact_source(qapp, fixture_text):
    text = fixture_text("mixed_sample.md")
    preview = PreviewWidget()
    preview.set_markdown(text)
    _insert_after(preview, "Intro paragraph", " XYZ")
    assert preview.get_markdown() != text
    preview._editor.document().undo()
    assert preview.get_markdown() == text


def test_comments_and_refdefs_survive_edit(qapp, fixture_text):
    text = fixture_text("mixed_sample.md")
    preview = PreviewWidget()
    preview.set_markdown(text)
    _insert_after(preview, "Intro paragraph", " edited")

    result = preview.get_markdown()
    assert "<!-- leading comment -->" in result
    assert "<!-- trailing comment -->" in result
    assert "[ref]: https://example.com" in result
    assert "Intro paragraph edited with **bold**, *italic*, `code_span`" in result
    assert "[link](https://crowdly.cloud)" in result


def test_new_paragraph_is_written(qapp, fixture_text):
    text = fixture_text("mixed_sample.md")
    preview = PreviewWidget()
    preview.set_markdown(text)
    block = _find_block(preview, "Last line.")
    cursor = QTextCursor(block)
    cursor.movePosition(QTextCursor.MoveOperation.EndOfBlock)
    cursor.insertBlock()
    cursor.insertText("Brand new line")

    result = preview.get_markdown()
    assert result.rstrip().endswith("Brand new line")
    assert result.startswith(text.split("Last line.")[0])


def test_set_html_mode_still_uses_qt_markdown(qapp):
    preview = PreviewWidget()
    preview.set_html("<p>Hello <b>world</b></p>")
    assert "**world**" in preview.get_markdown()


def test_edited_code_block_keeps_language_and_lists_stay_apart(qapp, fixture_text):
    text = fixture_text("mixed_sample.md")
    preview = PreviewWidget()
    preview.set_markdown(text)
    _insert_after(preview, "def f():", "  # edited")
    _insert_after(preview, "Q&A a+b", "!")

    result = preview.get_markdown()
    assert "```python\ndef f():  # edited\n" in result
    # Bullets and the numbered list that follows remain two separate lists.
    assert "\n\n1. first" in result
