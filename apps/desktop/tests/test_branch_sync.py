"""branch_sync: ids written back after a content sync, and branch reconciliation."""

import json

from editor import branch_sync
from editor.format import comic_markup, screenplay_markup, story_markup

SCREENPLAY = """[screenplay_title center]Night Shift[/screenplay_title]

[scene_slugline left]INT. CORRIDOR - NIGHT[/scene_slugline]

[character]MARA[/character]

[dialogue bold]Is anyone there?[/dialogue]

[branch name=Bolder]Show yourself.[/branch]

Wind howls.
"""


def test_screenplay_payload_and_ids_round_trip():
    title, scenes = branch_sync.screenplay_sync_payload(SCREENPLAY)
    assert title == "Night Shift"
    assert [b["blockType"] for b in scenes[0]["blocks"]] == ["character", "dialogue", "action"]
    assert "sceneId" not in scenes[0]

    response = [{"sceneId": "s1", "blocks": [{"blockId": "b1"}, {"blockId": "b2"}, {"blockId": "b3"}]}]
    text = branch_sync.apply_screenplay_ids(SCREENPLAY, response)
    doc = screenplay_markup.parse_dsl(text)
    assert doc["scenes"][0]["id"] == "s1"
    assert [b.get("id") for b in doc["scenes"][0]["blocks"]] == ["b1", "b2", "b3"]
    assert "[dialogue bold id=b2]" in text  # styling kept
    assert "[action id=b3]Wind howls.[/action]" in text  # untagged text gets a tag to hold its id

    # The next payload sends the ids back.
    _, again = branch_sync.screenplay_sync_payload(text)
    assert again[0]["sceneId"] == "s1"
    assert [b["blockId"] for b in again[0]["blocks"]] == ["b1", "b2", "b3"]


def test_screenplay_branches_created_deleted_and_pulled():
    text = branch_sync.apply_screenplay_ids(
        SCREENPLAY, [{"sceneId": "s1", "blocks": [{"blockId": "b1"}, {"blockId": "b2"}, {"blockId": "b3"}]}]
    )
    sent = {}

    def send(entries):
        sent["entries"] = entries
        return {
            "results": [{"index": 0, "id": "br-new", "status": "created"}, {"index": 1, "id": "br-old", "status": "deleted"}],
            "branches": [
                {"id": "br-new", "blockId": "b2", "text": "Show yourself.", "name": "Bolder"},
                {"id": "br-web", "blockId": "b1", "text": "MARA (V.O.)", "name": "Web"},
            ],
        }

    out = branch_sync.sync_screenplay_branches(text, known_ids=["br-old"], send=send)
    assert sent["entries"] == [
        {"blockId": "b2", "text": "Show yourself.", "name": "Bolder"},
        {"id": "br-old", "deleted": True},
    ]
    doc = screenplay_markup.parse_dsl(out.text)
    blocks = doc["scenes"][0]["blocks"]
    assert blocks[0]["branches"] == [{"name": "Web", "text": "MARA (V.O.)", "id": "br-web"}]
    assert blocks[1]["branches"] == [{"name": "Bolder", "text": "Show yourself.", "id": "br-new"}]
    assert out.known_ids == ["br-new", "br-web"]


def test_story_branches_use_chapter_ids_and_paragraph_index():
    text = (
        "[story_title]T[/story_title]\n\n[chapter_title]One[/chapter_title]\n\n"
        "[paragraph]A[/paragraph]\n\n[paragraph]B[/paragraph]\n\n[branch name=x]B2[/branch]\n"
    )
    sent = {}

    def send(entries):
        sent["entries"] = entries
        return {
            "results": [{"index": 0, "id": "p-1", "status": "created"}],
            "branches": [
                {"id": "p-1", "chapterId": "c1", "paragraphIndex": 1, "text": "B2", "name": "x"},
                {"id": "p-2", "chapterId": "c1", "paragraphIndex": 0, "text": "A2", "name": ""},
            ],
        }

    out = branch_sync.sync_story_branches(text, ["c1"], [], send)
    assert sent["entries"] == [{"chapterId": "c1", "paragraphIndex": 1, "text": "B2", "name": "x"}]
    branches = story_markup.parse_dsl(out.text)["chapters"][0]["branches"]
    assert branches == {"0": [{"name": "", "text": "A2", "id": "p-2"}], "1": [{"name": "x", "text": "B2", "id": "p-1"}]}


COMIC = """[comic_title direction=rtl]Moon[/comic_title]

[issue]Issue 1[/issue]

[page alt=Cover](pages/001.png)[/page]

[layer x=20 y=15 style=bubble]Hi[/layer]

[alt name=Night](pages/001b.png)[/alt]

[layer x=10 y=10 style=box]Night text[/layer]
"""


def test_comic_payload_ids_and_alternatives():
    uploaded = []

    def image_url(src):
        uploaded.append(src)
        return f"/uploads/{src}"

    payload = branch_sync.comic_sync_payload(COMIC, image_url)
    assert payload["direction"] == "rtl"
    page = payload["issues"][0]["pages"][0]
    assert page["imageUrl"] == "/uploads/pages/001.png"
    assert page["overlays"] == [{"text": "Hi", "x": 20.0, "y": 15.0, "style": "bubble"}]  # the alt's layer isn't the page's

    text = branch_sync.apply_comic_ids(COMIC, [{"issueId": "i1", "pages": [{"pageId": "p1"}]}])
    doc = comic_markup.parse_dsl(text)
    assert doc["issues"][0]["id"] == "i1" and doc["issues"][0]["pages"][0]["id"] == "p1"

    sent = {}

    def send(entries):
        sent["entries"] = entries
        return {"results": [{"index": 0, "id": "alt-1", "status": "created"}], "branches": []}

    out = branch_sync.sync_comic_alternatives(text, [], send, image_url)
    assert sent["entries"] == [
        {
            "pageId": "p1",
            "name": "Night",
            "overlays": [{"text": "Night text", "x": 10.0, "y": 10.0, "style": "box"}],
            "imageUrl": "/uploads/pages/001b.png",
        }
    ]
    assert comic_markup.parse_dsl(out.text)["issues"][0]["pages"][0]["alternatives"][0]["id"] == "alt-1"


def test_suggestions_diff_by_id():
    text = branch_sync.apply_screenplay_ids(
        SCREENPLAY, [{"sceneId": "s1", "blocks": [{"blockId": "b1"}, {"blockId": "b2"}, {"blockId": "b3"}]}]
    )
    proposals = branch_sync.screenplay_suggestions(
        text, {"b1": "MARA", "b2": "Anyone there?", "b3": "Wind howls."}, {"s1": "INT. CORRIDOR - DAY"}
    )
    assert proposals == [
        {"targetType": "scene", "targetSceneId": "s1", "proposedText": "INT. CORRIDOR - NIGHT"},
        {"targetType": "block", "targetBlockId": "b2", "proposedText": "Is anyone there?"},
    ]

    comic = branch_sync.apply_comic_ids(COMIC, [{"issueId": "i1", "pages": [{"pageId": "p1"}]}])
    layers = branch_sync.comic_suggestions(comic, {"p1": [{"text": "Hello", "x": 20, "y": 15, "style": "bubble"}]})
    assert layers[0]["targetPageId"] == "p1"
    assert json.loads(layers[0]["proposedText"]) == [{"text": "Hi", "x": 20.0, "y": 15.0, "style": "bubble"}]
