package cloud.crowdly.app.data

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Offline outbox, the same rules as apps/web/src/lib/offline.ts: writes made
 * without a connection are kept one per target key (only the latest version
 * is sent) and replayed oldest first when the network is back. A 4xx answer
 * won't get better by retrying (e.g. the chapter was deleted), so it drops
 * the entry; a network error stops the flush until next time.
 */
class Outbox(private val db: Db) {
    data class Entry(val key: String, val method: String, val path: String, val body: String?, val contentType: String?, val at: Long)

    private val _count = MutableStateFlow(0)
    val count: StateFlow<Int> = _count

    init { refresh() }

    fun enqueue(key: String, method: String, path: String, body: String?, contentType: String?) {
        db.writableDatabase.insertWithOnConflict("outbox", null, ContentValues().apply {
            put("key", key); put("method", method); put("path", path); put("body", body)
            put("content_type", contentType); put("at", System.currentTimeMillis())
        }, SQLiteDatabase.CONFLICT_REPLACE)
        refresh()
    }

    fun entries(): List<Entry> =
        db.readableDatabase.rawQuery("SELECT key, method, path, body, content_type, at FROM outbox ORDER BY at ASC", null).use { c ->
            buildList {
                while (c.moveToNext()) add(Entry(c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getString(4), c.getLong(5)))
            }
        }

    fun pending(key: String): Entry? = entries().firstOrNull { it.key == key }

    fun remove(key: String) {
        db.writableDatabase.delete("outbox", "key = ?", arrayOf(key))
        refresh()
    }

    fun clear() {
        db.writableDatabase.delete("outbox", null, null)
        refresh()
    }

    private fun refresh() {
        _count.value = db.readableDatabase.rawQuery("SELECT COUNT(*) FROM outbox", null).use { if (it.moveToFirst()) it.getInt(0) else 0 }
    }
}
