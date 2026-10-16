package cloud.crowdly.app.net

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull

// Lenient readers for the backend's JSON: every field may be missing or null,
// so each one has a default. Mirrors the shapes in apps/web/src/lib/*.ts.

val JsonCodec = Json { ignoreUnknownKeys = true; explicitNulls = false }

fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.contentOrNull
fun JsonObject.s(key: String): String = str(key).orEmpty()
fun JsonObject.bool(key: String, default: Boolean = false): Boolean =
    (this[key] as? JsonPrimitive)?.let { it.booleanOrNull ?: it.contentOrNull?.toBooleanStrictOrNull() } ?: default
fun JsonObject.long(key: String): Long? = (this[key] as? JsonPrimitive)?.let { it.longOrNull ?: it.doubleOrNull?.toLong() ?: it.contentOrNull?.toLongOrNull() }
fun JsonObject.int(key: String): Int? = long(key)?.toInt()
fun JsonObject.double(key: String): Double? = (this[key] as? JsonPrimitive)?.let { it.doubleOrNull ?: it.contentOrNull?.toDoubleOrNull() }
fun JsonObject.obj(key: String): JsonObject? = this[key] as? JsonObject
fun JsonObject.arr(key: String): List<JsonElement> = (this[key] as? JsonArray).orEmpty()
fun JsonObject.objects(key: String): List<JsonObject> = arr(key).filterIsInstance<JsonObject>()
fun JsonObject.strings(key: String): List<String> = arr(key).mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p !is JsonNull }?.contentOrNull }

fun JsonElement?.asObject(): JsonObject = this as? JsonObject ?: JsonObject(emptyMap())
fun JsonElement?.asObjects(): List<JsonObject> = (this as? JsonArray)?.filterIsInstance<JsonObject>().orEmpty()

/** Builds a JSON body from Kotlin values; nulls are dropped, like JSON.stringify drops undefined. */
fun jsonOf(vararg pairs: Pair<String, Any?>): JsonObject = buildJsonObject {
    for ((k, v) in pairs) if (v != null) put(k, toJson(v))
}

fun toJson(v: Any?): JsonElement = when (v) {
    null -> JsonNull
    is JsonElement -> v
    is String -> JsonPrimitive(v)
    is Number -> JsonPrimitive(v)
    is Boolean -> JsonPrimitive(v)
    is Map<*, *> -> buildJsonObject { v.forEach { (k, x) -> if (x != null) put(k.toString(), toJson(x)) } }
    is Iterable<*> -> buildJsonArray { v.forEach { add(toJson(it)) } }
    is Array<*> -> buildJsonArray { v.forEach { add(toJson(it)) } }
    else -> JsonPrimitive(v.toString())
}
