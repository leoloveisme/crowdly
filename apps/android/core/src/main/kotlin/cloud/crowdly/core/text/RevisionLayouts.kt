package cloud.crowdly.core.text

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int

/**
 * The 25 revision-compare tiling presets (2 for 2 revisions, 4 for 3, 19 for
 * 4), generated from src/lib/revision-layouts.ts, which matches the desktop's
 * _LAYOUTS table in apps/desktop/src/editor/ui/compare_revisions.py
 * preset-for-preset. Regenerate resources/…/revision-layouts.json from that
 * file when it changes.
 */
sealed interface LayoutNode {
    data class Leaf(val tile: Int) : LayoutNode
    data class Split(val horizontal: Boolean, val children: List<LayoutNode>, val sizes: List<Double>?) : LayoutNode
}

data class LayoutPreset(val label: String, val tree: LayoutNode)

object RevisionLayouts {
    val presets: Map<Int, List<LayoutPreset>> by lazy {
        val text = RevisionLayouts::class.java.getResourceAsStream("/cloud/crowdly/core/revision-layouts.json")!!.bufferedReader().readText()
        Json.parseToJsonElement(text).jsonObject.mapKeys { it.key.toInt() }.mapValues { (_, v) ->
            v.jsonArray.map { p -> p.jsonObject.let { LayoutPreset(it["label"]!!.jsonPrimitive.content, node(it["tree"]!!.jsonObject)) } }
        }
    }

    private fun node(o: JsonObject): LayoutNode =
        if (o["type"]!!.jsonPrimitive.content == "leaf") LayoutNode.Leaf(o["tileIndex"]!!.jsonPrimitive.int)
        else LayoutNode.Split(
            o["direction"]!!.jsonPrimitive.content == "horizontal",
            o["children"]!!.jsonArray.map { node(it.jsonObject) },
            (o["sizes"] as? JsonArray)?.map { it.jsonPrimitive.doubleOrNull ?: 0.0 },
        )
}
