package cloud.crowdly.app.data

import cloud.crowdly.app.net.Api
import cloud.crowdly.app.net.ApiError
import cloud.crowdly.app.net.JsonCodec
import cloud.crowdly.app.net.asObject
import cloud.crowdly.app.net.isNetwork
import cloud.crowdly.app.net.jsonOf
import cloud.crowdly.app.net.s
import cloud.crowdly.app.net.str
import cloud.crowdly.app.net.strings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.JsonObject

data class User(val id: String, val email: String, val roles: List<String>) {
    val isStaff get() = "platform_admin" in roles || "editor" in roles || "chief_editor" in roles
    val isTranslator get() = "platform_admin" in roles || "ui_translator" in roles
    val displayName get() = email.substringBefore('@')

    fun toJson(): String = jsonOf("id" to id, "email" to email, "roles" to roles).toString()

    companion object {
        fun from(o: JsonObject) = User(o.s("id"), o.s("email"), o.strings("roles"))
    }
}

/**
 * Sign-in state. Logs in with `client: "android"` so the backend hands back
 * the session token (backend/src/server.js /auth/login), keeps the last
 * known user so the app starts offline, and re-checks /auth/me on start.
 */
class Session(private val api: Api, private val prefs: Prefs, private val db: Db, private val outbox: Outbox) {
    private val _user = MutableStateFlow(prefs.userJson?.let { runCatching { User.from(JsonCodec.parseToJsonElement(it).asObject()) }.getOrNull() })
    val user: StateFlow<User?> = _user

    val userId: String? get() = _user.value?.id

    suspend fun signIn(email: String, password: String): User {
        val o = api.post("/auth/login", jsonOf("email" to email.trim(), "password" to password, "client" to "android")).asObject()
        val token = o.str("token") ?: throw ApiError(500, "This server doesn't support the Android app yet (no session token in the login reply). Update the backend.")
        prefs.token = token
        return remember(User.from(o))
    }

    /** /auth/register creates the account only; signing in follows. */
    suspend fun signUp(email: String, password: String): User {
        api.post("/auth/register", jsonOf("email" to email.trim(), "password" to password))
        return signIn(email, password)
    }

    /** Confirms the session is still valid server-side. Offline keeps the cached user. */
    suspend fun refresh() {
        if (prefs.token == null) return
        try {
            remember(User.from(api.get("/auth/me").asObject()))
        } catch (e: ApiError) {
            if (e.status == 401) forget()
        } catch (e: Exception) {
            if (!e.isNetwork()) throw e
        }
    }

    suspend fun signOut() {
        runCatching { api.post("/auth/logout") }
        forget()
    }

    fun forget() {
        prefs.token = null
        prefs.userJson = null
        outbox.clear()
        db.cacheDelete("")
        _user.value = null
    }

    private fun remember(u: User): User {
        prefs.userJson = u.toJson()
        _user.value = u
        return u
    }
}
