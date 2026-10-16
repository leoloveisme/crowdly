"""`.story` / `.screenplay` / `.comic` parsers against the shared fixtures.

The same fixtures are checked by the web app's parser
(apps/web/scripts/test-formats.ts), so both apps read and write the same
files the same way.
"""

import json

import pytest

from editor.format import comic_markup, dsl, screenplay_markup, story_markup

from conftest import FIXTURES

MODULES = {"story": story_markup, "screenplay": screenplay_markup, "comic": comic_markup}


# "sample" covers the base formats, "branching" branches / ids / comic layers
# and page alternatives (Documentation/branching-api.md).
CASES = [(name, ext) for name in ("sample", "branching") for ext in sorted(MODULES)]


@pytest.mark.parametrize("name,ext", CASES)
def test_parse_matches_fixture(name, ext):
    src = (FIXTURES / "formats" / f"{name}.{ext}").read_text(encoding="utf-8")
    expected = json.loads((FIXTURES / "formats" / f"{name}.{ext}.json").read_text(encoding="utf-8"))
    assert MODULES[ext].parse_dsl(src) == expected


@pytest.mark.parametrize("name,ext", CASES)
def test_round_trip(name, ext):
    expected = json.loads((FIXTURES / "formats" / f"{name}.{ext}.json").read_text(encoding="utf-8"))
    mod = MODULES[ext]
    assert mod.parse_dsl(mod.dict_to_dsl(expected)) == expected


@pytest.mark.parametrize("name,ext", CASES)
def test_html_keeps_all_text(name, ext):
    src = (FIXTURES / "formats" / f"{name}.{ext}").read_text(encoding="utf-8")
    html = MODULES[ext].dsl_to_html(src)
    assert html.strip()
    for b in dsl.parse_blocks(src):
        if b.tag in ("image", "page", "alt"):
            assert dsl.image_source(b.body) in html
        else:
            first_line = b.body.strip().split("\n")[0]
            assert first_line.replace("&", "&amp;").replace("'", "&#x27;").replace('"', "&quot;") in html


def test_bracketed_prose_is_not_a_tag():
    blocks = dsl.parse_blocks("He said [sic] twice.\n\n[paragraph]Real.[/paragraph]")
    assert [b.tag for b in blocks] == ["raw", "paragraph"]


def test_quoted_attributes():
    assert dsl.parse_attrs('center name="Two words" bold') == {"align": "center", "name": "Two words", "bold": "1"}


def test_restore_tags_keeps_branches_after_wysiwyg_rebuild():
    original = "[paragraph]A[/paragraph]\n\n[branch name=Alt]B[/branch]\n"
    rebuilt = "[paragraph left bold]A[/paragraph]\n\n[paragraph left]B[/paragraph]\n"
    fixed = dsl.restore_tags(original, rebuilt, {"paragraph"}, {"branch"})
    doc = story_markup.parse_dsl(fixed)
    assert doc["chapters"][0]["branches"] == {"0": [{"name": "Alt", "text": "B"}]}
    assert "bold" in fixed


def test_screenplay_markdown_guesses_dialogue():
    out = screenplay_markup.parse_dsl(screenplay_markup.markdown_to_dsl("# T\n\n## INT. ROOM - DAY\n\nShe enters.\n\nMARA\n\nHello.\n\nCUT TO:"))
    assert [b["type"] for b in out["scenes"][0]["blocks"]] == ["action", "character", "dialogue", "transition"]


def test_comic_from_markdown_images():
    out = comic_markup.parse_dsl(comic_markup.markdown_to_dsl("# Moon\n\n## Issue 1\n\n![Cover](p1.png)\n![](p2.png)"))
    assert out["title"] == "Moon"
    assert out["issues"][0]["pages"] == [{"src": "p1.png", "alt": "Cover"}, {"src": "p2.png", "alt": ""}]


def test_restore_tags_keeps_sync_ids_on_rebuilt_headings():
    original = "[scene_slugline left id=abc]INT. ROOM[/scene_slugline]\n\n[dialogue id=d1]Hi.[/dialogue]\n"
    rebuilt = "[scene_slugline left]INT. ROOM[/scene_slugline]\n\n[action left]Hi.[/action]\n"
    fixed = dsl.restore_tags(original, rebuilt, {"action"}, {"dialogue", "branch"})
    doc = screenplay_markup.parse_dsl(fixed)
    assert doc["scenes"][0]["id"] == "abc"
    assert doc["scenes"][0]["blocks"][0] == {"type": "dialogue", "text": "Hi.", "id": "d1"}
