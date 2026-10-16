package cloud.crowdly.core

import cloud.crowdly.core.formats.MasterContainer
import cloud.crowdly.core.formats.comicFromJson
import cloud.crowdly.core.formats.comicToDsl
import cloud.crowdly.core.formats.jsonSame
import cloud.crowdly.core.formats.parseAttrs
import cloud.crowdly.core.formats.parseBlocks
import cloud.crowdly.core.formats.parseComic
import cloud.crowdly.core.formats.parseMaster
import cloud.crowdly.core.formats.parseScreenplay
import cloud.crowdly.core.formats.parseStory
import cloud.crowdly.core.formats.screenplayFromJson
import cloud.crowdly.core.formats.screenplayToDsl
import cloud.crowdly.core.formats.serializeMaster
import cloud.crowdly.core.formats.storyFromJson
import cloud.crowdly.core.formats.storyFromMarkdown
import cloud.crowdly.core.formats.storyToDsl
import cloud.crowdly.core.formats.toJson
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Kotlin parsers against the fixtures the desktop app's tests and the web
 * app's scripts/test-formats.ts use (apps/desktop/tests/fixtures/formats), so
 * all three apps read and write these files identically.
 */
class FormatsTest {
    private val dir = File(System.getProperty("crowdly.fixtures") ?: "../../desktop/tests/fixtures/formats")
    private fun read(name: String) = File(dir, name).readText()
    private fun json(name: String) = Json.parseToJsonElement(read(name)).jsonObject

    private fun same(expected: JsonElement, actual: JsonElement, what: String) =
        assertTrue("$what\nexpected: $expected\nactual:   $actual", jsonSame(expected, actual))

    @Test fun fixturesParseAndRoundTrip() {
        for (name in listOf("sample", "branching")) {
            val story = json("$name.story.json")
            same(story, parseStory(read("$name.story")).toJson(), "$name.story parse")
            same(story, parseStory(storyToDsl(storyFromJson(story))).toJson(), "$name.story round trip")

            val sp = json("$name.screenplay.json")
            same(sp, parseScreenplay(read("$name.screenplay")).toJson(), "$name.screenplay parse")
            same(sp, parseScreenplay(screenplayToDsl(screenplayFromJson(sp))).toJson(), "$name.screenplay round trip")

            val comic = json("$name.comic.json")
            same(comic, parseComic(read("$name.comic")).toJson(), "$name.comic parse")
            same(comic, parseComic(comicToDsl(comicFromJson(comic))).toJson(), "$name.comic round trip")
        }
    }

    @Test fun bracketedProseIsNotATag() {
        assertEquals(listOf("raw", "paragraph"), parseBlocks("He said [sic] twice.\n\n[paragraph]Real.[/paragraph]").map { it.tag })
    }

    @Test fun quotedAttributes() {
        assertEquals(mapOf("align" to "center", "name" to "Two words", "bold" to "1"), parseAttrs("center name=\"Two words\" bold"))
    }

    @Test fun masterRoundTripWithEscapes() {
        val cs = listOf(
            MasterContainer("chapters/one.md", "One", 1760000000.5, "Text\n---\nmore"),
            MasterContainer(null, "", null, "## not a title\nbody"),
        )
        assertEquals(cs, parseMaster(serializeMaster(cs)))
    }

    @Test fun markdownChapters() {
        val doc = storyFromMarkdown("# Book\n\n## One\n\nA\n\nB\n\n## Two\n\nC")
        assertEquals("Book", doc.title)
        assertEquals(listOf("One", "Two"), doc.chapters.map { it.title })
        assertEquals(listOf("A", "B"), doc.chapters[0].paragraphs)
    }
}
