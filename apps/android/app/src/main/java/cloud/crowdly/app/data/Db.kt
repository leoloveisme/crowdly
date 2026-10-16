package cloud.crowdly.app.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * The app's one local database:
 * - `outbox`: writes made without a connection, one row per target, so only
 *   the latest version is sent (apps/web/src/lib/offline.ts);
 * - `cache`: the last JSON seen for a key (a work, a Space listing, the
 *   interface translations), so opened things still open offline;
 * - `file_state`: what the desktop app keeps in xattrs per local file
 *   (branch ids seen at the last sync, comic id, uploaded image urls),
 *   keyed by the document's content:// URI.
 */
class Db(context: Context) : SQLiteOpenHelper(context, "crowdly.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE outbox (key TEXT PRIMARY KEY, method TEXT NOT NULL, path TEXT NOT NULL, body TEXT, content_type TEXT, at INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, at INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE file_state (uri TEXT NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (uri, name))")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    // --- cache ---
    fun cacheGet(key: String): String? =
        readableDatabase.rawQuery("SELECT value FROM cache WHERE key = ?", arrayOf(key)).use { if (it.moveToFirst()) it.getString(0) else null }

    fun cachePut(key: String, value: String) {
        writableDatabase.insertWithOnConflict("cache", null, ContentValues().apply {
            put("key", key); put("value", value); put("at", System.currentTimeMillis())
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun cacheDelete(prefix: String) {
        writableDatabase.delete("cache", "key LIKE ?", arrayOf("$prefix%"))
    }

    fun cacheSize(): Long =
        readableDatabase.rawQuery("SELECT COALESCE(SUM(LENGTH(value)), 0) FROM cache", null).use { if (it.moveToFirst()) it.getLong(0) else 0 }

    // --- file state ---
    fun fileStateGet(uri: String, name: String): String? =
        readableDatabase.rawQuery("SELECT value FROM file_state WHERE uri = ? AND name = ?", arrayOf(uri, name)).use { if (it.moveToFirst()) it.getString(0) else null }

    fun fileStatePut(uri: String, name: String, value: String) {
        writableDatabase.insertWithOnConflict("file_state", null, ContentValues().apply {
            put("uri", uri); put("name", name); put("value", value)
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }
}
