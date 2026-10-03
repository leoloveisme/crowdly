"""Suggestion copies: edited Markdown -> proposals for the story's owner."""

from editor.suggestions import build_proposals

SNAPSHOT = [
    {"chapter_id": "c1", "title": "Beginning", "paragraphs": ["One.", "Two.", "Three.", "Four."]},
    {"chapter_id": "c2", "title": "Middle", "paragraphs": ["Alpha.", "", "Beta."]},
]


def doc(*chapters):
    parts = ["# Story"]
    for title, paragraphs in chapters:
        parts.append(f"## {title}")
        parts.extend(paragraphs)
    return "\n\n".join(parts) + "\n"


UNCHANGED = doc(("Beginning", ["One.", "Two.", "Three.", "Four."]), ("Middle", ["Alpha.", "Beta."]))


def simple(plan):
    return [(p.target_type, p.chapter_id, p.target_path, p.text) for p in plan.proposals]


def test_unchanged_document_has_no_proposals():
    plan = build_proposals(SNAPSHOT, UNCHANGED)
    assert plan.proposals == [] and plan.skipped == []


def test_edited_paragraph():
    plan = build_proposals(SNAPSHOT, doc(("Beginning", ["One.", "Two, better.", "Three.", "Four."]), ("Middle", ["Alpha.", "Beta."])))
    assert simple(plan) == [("paragraph", "c1", "1", "Two, better.")]


def test_deleted_and_inserted_paragraphs():
    plan = build_proposals(SNAPSHOT, doc(("Beginning", ["One.", "Three.", "New.", "Four."]), ("Middle", ["Alpha.", "Beta."])))
    assert simple(plan) == [
        ("paragraph", "c1", "1", ""),
        ("paragraph", "c1", "2", "Three.\n\nNew."),
    ]


def test_server_indexes_skip_empty_paragraphs():
    plan = build_proposals(SNAPSHOT, doc(("Beginning", ["One.", "Two.", "Three.", "Four."]), ("Middle", ["Alpha.", "Beta!"])))
    assert simple(plan) == [("paragraph", "c2", "2", "Beta!")]


def test_title_change_and_unsupported_changes():
    plan = build_proposals(
        SNAPSHOT,
        doc(("The beginning", ["One.", "Two.", "Three.", "Four."]), ("Middle", ["Alpha.", "Beta."]), ("Extra", ["New chapter."])),
    )
    assert simple(plan) == [("chapter_title", "c1", None, "The beginning")]
    assert plan.skipped == ['Adding the chapter "Extra"']

    plan = build_proposals(SNAPSHOT, doc(("Beginning", ["One.", "Two.", "Three.", "Four."])))
    assert plan.skipped == ['Removing the chapter "Middle"']


def test_already_sent_proposals_are_not_repeated():
    edited = doc(("Beginning", ["One.", "Two, better.", "Three.", "Four."]), ("Middle", ["Alpha.", "Beta."]))
    first = build_proposals(SNAPSHOT, edited)
    again = build_proposals(SNAPSHOT, edited, already_sent={p.key() for p in first.proposals})
    assert again.proposals == []


def test_suggestion_copy_marking(tmp_path):
    from editor.suggestions import is_suggestion_copy, mark_suggestion_copy, record_sent, suggestion_state

    path = tmp_path / "story.md"
    path.write_text(UNCHANGED, encoding="utf-8")
    assert not is_suggestion_copy(path)
    mark_suggestion_copy(path, [{"chapter_id": "c1", "chapter_title": "Beginning", "paragraphs": ["One."]}])
    assert is_suggestion_copy(path)
    snapshot, sent = suggestion_state(path)
    assert snapshot[0]["chapter_id"] == "c1" and sent == set()
    plan = build_proposals(snapshot, doc(("Beginning", ["Uno."])))
    record_sent(path, plan.proposals)
    assert suggestion_state(path)[1] == {plan.proposals[0].key()}
