package cloud.crowdly.core.formats

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

// The docs as the same JSON the web app's parsers produce (and the fixture
// .json files hold): optional keys are left out when unset.

private fun JsonObject.s(k: String) = (this[k] as? JsonPrimitive)?.contentOrNull.orEmpty()
private fun JsonObject.opt(k: String) = (this[k] as? JsonPrimitive)?.contentOrNull
private fun JsonObject.list(k: String) = (this[k] as? JsonArray)?.map { it.jsonObject }

fun StoryDoc.toJson(): JsonObject = buildJsonObject {
    put("title", title)
    put("chapters", buildJsonArray {
        for (ch in chapters) add(buildJsonObject {
            put("title", ch.title)
            put("paragraphs", buildJsonArray { ch.paragraphs.forEach { add(JsonPrimitive(it)) } })
            put("branches", buildJsonObject {
                for ((k, v) in ch.branches) put(k, buildJsonArray {
                    v.forEach { br -> add(buildJsonObject { put("name", br.name); put("text", br.text); br.id?.let { put("id", it) } }) }
                })
            })
            ch.id?.let { put("id", it) }
        })
    })
}

fun storyFromJson(o: JsonObject) = StoryDoc(
    o.s("title"),
    o.list("chapters").orEmpty().map { ch ->
        StoryChapterDoc(
            ch.s("title"),
            ch["paragraphs"]?.jsonArray?.map { it.jsonPrimitive.content }.orEmpty(),
            (ch["branches"] as? JsonObject)?.mapValues { (_, v) -> v.jsonArray.map { b -> b.jsonObject.let { StoryBranch(it.s("name"), it.s("text"), it.opt("id")) } } }.orEmpty(),
            ch.opt("id"),
        )
    },
)

fun ScreenplayDoc.toJson(): JsonObject = buildJsonObject {
    put("title", title)
    put("scenes", buildJsonArray {
        for (sc in scenes) add(buildJsonObject {
            put("slugline", sc.slugline)
            put("blocks", buildJsonArray {
                for (b in sc.blocks) add(buildJsonObject {
                    put("type", b.type)
                    put("text", b.text)
                    b.id?.let { put("id", it) }
                    b.branches?.let { brs -> put("branches", buildJsonArray { brs.forEach { br -> add(buildJsonObject { put("name", br.name); put("text", br.text); br.id?.let { put("id", it) } }) } }) }
                })
            })
            sc.id?.let { put("id", it) }
        })
    })
}

fun screenplayFromJson(o: JsonObject) = ScreenplayDoc(
    o.s("title"),
    o.list("scenes").orEmpty().map { sc ->
        ScreenplaySceneDoc(
            sc.s("slugline"),
            sc.list("blocks").orEmpty().map { b ->
                ScreenplayBlockDoc(b.s("type"), b.s("text"), b.opt("id"), b.list("branches")?.map { ScreenplayBranchDoc(it.s("name"), it.s("text"), it.opt("id")) })
            },
            sc.opt("id"),
        )
    },
)

private fun layersJson(ls: List<ComicLayerDoc>) = buildJsonArray {
    ls.forEach { l -> add(buildJsonObject { put("text", l.text); put("x", l.x); put("y", l.y); put("style", l.style) }) }
}

private fun layersFrom(a: List<JsonObject>?) = a?.map {
    ComicLayerDoc(it.s("text"), (it["x"] as? JsonPrimitive)?.doubleOrNull ?: 0.0, (it["y"] as? JsonPrimitive)?.doubleOrNull ?: 0.0, it.opt("style") ?: "bubble")
}

fun ComicDoc.toJson(): JsonObject = buildJsonObject {
    put("title", title)
    put("direction", direction)
    put("issues", buildJsonArray {
        for (issue in issues) add(buildJsonObject {
            put("title", issue.title)
            issue.id?.let { put("id", it) }
            put("pages", buildJsonArray {
                for (p in issue.pages) add(buildJsonObject {
                    put("src", p.src)
                    put("alt", p.alt)
                    p.id?.let { put("id", it) }
                    p.layers?.let { put("layers", layersJson(it)) }
                    p.alternatives?.let { alts ->
                        put("alternatives", buildJsonArray {
                            alts.forEach { a -> add(buildJsonObject { put("src", a.src); put("name", a.name); a.id?.let { put("id", it) }; a.layers?.let { put("layers", layersJson(it)) } }) }
                        })
                    }
                })
            })
        })
    })
}

fun comicFromJson(o: JsonObject) = ComicDoc(
    o.s("title"),
    o.opt("direction") ?: "ltr",
    o.list("issues").orEmpty().map { issue ->
        ComicIssueDoc(
            issue.s("title"),
            issue.list("pages").orEmpty().map { p ->
                ComicPageDoc(
                    p.s("src"), p.s("alt"), p.opt("id"), layersFrom(p.list("layers")),
                    p.list("alternatives")?.map { a -> ComicAlternativeDoc(a.s("src"), a.s("name"), a.opt("id"), layersFrom(a.list("layers"))) },
                )
            },
            issue.opt("id"),
        )
    },
)

/** Structural JSON equality that treats 40 and 40.0 as the same number (JS has one number type). */
fun jsonSame(a: JsonElement, b: JsonElement): Boolean = when {
    a is JsonObject && b is JsonObject -> a.keys == b.keys && a.keys.all { jsonSame(a[it]!!, b[it]!!) }
    a is JsonArray && b is JsonArray -> a.size == b.size && a.indices.all { jsonSame(a[it], b[it]) }
    a is JsonPrimitive && b is JsonPrimitive ->
        if (!a.isString && !b.isString && a.doubleOrNull != null && b.doubleOrNull != null) a.doubleOrNull == b.doubleOrNull
        else a.isString == b.isString && a.content == b.content
    else -> a == b
}
