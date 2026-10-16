package cloud.crowdly.core.sync

import cloud.crowdly.core.formats.parseComic
import cloud.crowdly.core.formats.parseScreenplay
import cloud.crowdly.core.formats.parseStory
import cloud.crowdly.core.formats.ScreenplayBranchDoc
import cloud.crowdly.core.formats.StoryBranch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Port of apps/desktop/tests/test_branch_sync.py. */
class BranchSyncTest {
    private fun j(s: String) = Json.parseToJsonElement(s).jsonObject
    private fun ja(s: String) = Json.parseToJsonElement(s).jsonArray.map { it.jsonObject }

    private val screenplay = """[screenplay_title center]Night Shift[/screenplay_title]

[scene_slugline left]INT. CORRIDOR - NIGHT[/scene_slugline]

[character]MARA[/character]

[dialogue bold]Is anyone there?[/dialogue]

[branch name=Bolder]Show yourself.[/branch]

Wind howls.
"""
    private val ids = ja("""[{"sceneId": "s1", "blocks": [{"blockId": "b1"}, {"blockId": "b2"}, {"blockId": "b3"}]}]""")

    @Test fun screenplayPayloadAndIdsRoundTrip() {
        val (title, scenes) = screenplaySyncPayload(screenplay)
        assertEquals("Night Shift", title)
        assertEquals(listOf("character", "dialogue", "action"), scenes[0]["blocks"]!!.jsonArray.map { it.jsonObject["blockType"]!!.jsonPrimitive.content })
        assertFalse("sceneId" in scenes[0])

        val text = applyScreenplayIds(screenplay, ids)
        val doc = parseScreenplay(text)
        assertEquals("s1", doc.scenes[0].id)
        assertEquals(listOf("b1", "b2", "b3"), doc.scenes[0].blocks.map { it.id })
        assertTrue("[dialogue bold id=b2]" in text) // styling kept
        assertTrue("[action id=b3]Wind howls.[/action]" in text) // untagged text gets a tag to hold its id

        val again = screenplaySyncPayload(text).scenes
        assertEquals("s1", again[0]["sceneId"]!!.jsonPrimitive.content)
        assertEquals(listOf("b1", "b2", "b3"), again[0]["blocks"]!!.jsonArray.map { it.jsonObject["blockId"]!!.jsonPrimitive.content })
    }

    @Test fun screenplayBranchesCreatedDeletedAndPulled() {
        val text = applyScreenplayIds(screenplay, ids)
        var sent: List<JsonObject> = emptyList()
        val out = syncScreenplayBranches(text, listOf("br-old")) { entries ->
            sent = entries
            j("""{"results": [{"index": 0, "id": "br-new", "status": "created"}, {"index": 1, "id": "br-old", "status": "deleted"}],
                 "branches": [{"id": "br-new", "blockId": "b2", "text": "Show yourself.", "name": "Bolder"},
                              {"id": "br-web", "blockId": "b1", "text": "MARA (V.O.)", "name": "Web"}]}""")
        }
        assertEquals(ja("""[{"blockId": "b2", "text": "Show yourself.", "name": "Bolder"}, {"id": "br-old", "deleted": true}]"""), sent)
        val blocks = parseScreenplay(out.text).scenes[0].blocks
        assertEquals(listOf(ScreenplayBranchDoc("Web", "MARA (V.O.)", "br-web")), blocks[0].branches)
        assertEquals(listOf(ScreenplayBranchDoc("Bolder", "Show yourself.", "br-new")), blocks[1].branches)
        assertEquals(listOf("br-new", "br-web"), out.knownIds)
    }

    @Test fun storyBranchesUseChapterIdsAndParagraphIndex() {
        val text = "[story_title]T[/story_title]\n\n[chapter_title]One[/chapter_title]\n\n" +
            "[paragraph]A[/paragraph]\n\n[paragraph]B[/paragraph]\n\n[branch name=x]B2[/branch]\n"
        var sent: List<JsonObject> = emptyList()
        val out = syncStoryBranches(text, listOf("c1"), emptyList()) { entries ->
            sent = entries
            j("""{"results": [{"index": 0, "id": "p-1", "status": "created"}],
                 "branches": [{"id": "p-1", "chapterId": "c1", "paragraphIndex": 1, "text": "B2", "name": "x"},
                              {"id": "p-2", "chapterId": "c1", "paragraphIndex": 0, "text": "A2", "name": ""}]}""")
        }
        assertEquals(ja("""[{"chapterId": "c1", "paragraphIndex": 1, "text": "B2", "name": "x"}]"""), sent)
        assertEquals(
            mapOf("0" to listOf(StoryBranch("", "A2", "p-2")), "1" to listOf(StoryBranch("x", "B2", "p-1"))),
            parseStory(out.text).chapters[0].branches.toSortedMap(),
        )
    }

    private val comic = """[comic_title direction=rtl]Moon[/comic_title]

[issue]Issue 1[/issue]

[page alt=Cover](pages/001.png)[/page]

[layer x=20 y=15 style=bubble]Hi[/layer]

[alt name=Night](pages/001b.png)[/alt]

[layer x=10 y=10 style=box]Night text[/layer]
"""

    @Test fun comicPayloadIdsAndAlternatives() {
        val uploaded = mutableListOf<String>()
        val imageUrl = { src: String -> uploaded += src; "/uploads/$src" }
        val payload = comicSyncPayload(comic, imageUrl)
        assertEquals("rtl", payload["direction"]!!.jsonPrimitive.content)
        val page = payload["issues"]!!.jsonArray[0].jsonObject["pages"]!!.jsonArray[0].jsonObject
        assertEquals("/uploads/pages/001.png", page["imageUrl"]!!.jsonPrimitive.content)
        assertEquals(ja("""[{"text": "Hi", "x": 20.0, "y": 15.0, "style": "bubble"}]"""), page["overlays"]!!.jsonArray.map { it.jsonObject })

        val text = applyComicIds(comic, ja("""[{"issueId": "i1", "pages": [{"pageId": "p1"}]}]"""))
        val doc = parseComic(text)
        assertEquals("i1", doc.issues[0].id)
        assertEquals("p1", doc.issues[0].pages[0].id)

        var sent: List<JsonObject> = emptyList()
        val out = syncComicAlternatives(text, emptyList(), { entries -> sent = entries; j("""{"results": [{"index": 0, "id": "alt-1", "status": "created"}], "branches": []}""") }, imageUrl)
        assertEquals(
            ja("""[{"pageId": "p1", "name": "Night", "overlays": [{"text": "Night text", "x": 10.0, "y": 10.0, "style": "box"}], "imageUrl": "/uploads/pages/001b.png"}]"""),
            sent,
        )
        assertEquals("alt-1", parseComic(out.text).issues[0].pages[0].alternatives!![0].id)
    }

    @Test fun stripIdsForAFirstLink() {
        val text = applyScreenplayIds(screenplay, ids)
        assertFalse("id=" in stripIds(text))
        assertEquals(parseScreenplay(screenplay).scenes[0].blocks.map { it.text }, parseScreenplay(stripIds(text)).scenes[0].blocks.map { it.text })
    }

    @Test fun suggestionsDiffById() {
        val text = applyScreenplayIds(screenplay, ids)
        val proposals = screenplaySuggestions(text, mapOf("b1" to "MARA", "b2" to "Anyone there?", "b3" to "Wind howls."), mapOf("s1" to "INT. CORRIDOR - DAY"))
        assertEquals(
            ja("""[{"targetType": "scene", "targetSceneId": "s1", "proposedText": "INT. CORRIDOR - NIGHT"}, {"targetType": "block", "targetBlockId": "b2", "proposedText": "Is anyone there?"}]"""),
            proposals,
        )
        val c = applyComicIds(comic, ja("""[{"issueId": "i1", "pages": [{"pageId": "p1"}]}]"""))
        val layers = comicSuggestions(c, mapOf("p1" to ja("""[{"text": "Hello", "x": 20, "y": 15, "style": "bubble"}]""")))
        assertEquals("p1", layers[0]["targetPageId"]!!.jsonPrimitive.content)
        assertEquals(ja("""[{"text": "Hi", "x": 20.0, "y": 15.0, "style": "bubble"}]"""), (Json.parseToJsonElement(layers[0]["proposedText"]!!.jsonPrimitive.content) as JsonArray).map { it.jsonObject })
    }
}
