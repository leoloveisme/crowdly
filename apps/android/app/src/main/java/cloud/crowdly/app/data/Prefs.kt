package cloud.crowdly.app.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import cloud.crowdly.app.BuildConfig
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** App settings, plus the session token, which is encrypted with a key that never leaves the Android Keystore. */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("crowdly", Context.MODE_PRIVATE)

    var server: String
        get() = sp.getString("server", null) ?: BuildConfig.DEFAULT_SERVER
        set(v) = sp.edit().putString("server", v.trim().trimEnd('/')).apply()

    /** The main Crowdly platform, for "open on the platform" links and first-time Drive/GitHub connects. */
    var platformUrl: String
        get() = sp.getString("platform", null)
            ?: if (BuildConfig.DEBUG) server.replace(Regex(":\\d+$"), ":8080") else "https://crowdly.cloud"
        set(v) = sp.edit().putString("platform", v.trim().trimEnd('/')).apply()

    /** Interface language as the backend names it ("English", "Russian", … — see apps/web/src/lib/languages.ts). */
    private val _language = MutableStateFlow(sp.getString("language", null) ?: "English")
    val language: StateFlow<String> = _language
    fun setLanguage(v: String) { sp.edit().putString("language", v).apply(); _language.value = v }

    /** "system", "light" or "dark". */
    private val _theme = MutableStateFlow(sp.getString("theme", null) ?: "system")
    val theme: StateFlow<String> = _theme
    fun setTheme(v: String) { sp.edit().putString("theme", v).apply(); _theme.value = v }

    /** Shows the interface-text editing affordance for platform_admin / ui_translator users. */
    private val _editInterface = MutableStateFlow(sp.getBoolean("edit_interface", false))
    val editInterface: StateFlow<Boolean> = _editInterface
    fun setEditInterface(v: Boolean) { sp.edit().putBoolean("edit_interface", v).apply(); _editInterface.value = v }

    /** Stable per-install id for reading sessions and highlight sync (lib/discovery.ts deviceId). */
    val deviceId: String
        get() = sp.getString("device_id", null) ?: UUID.randomUUID().toString().also { sp.edit().putString("device_id", it).apply() }

    var userJson: String?
        get() = sp.getString("user", null)
        set(v) = sp.edit().putString("user", v).apply()

    /** The local folder picked on the Local files screen (a tree content:// URI). */
    var localFolder: String?
        get() = sp.getString("local_folder", null)
        set(v) = sp.edit().putString("local_folder", v).apply()

    var token: String?
        get() = sp.getString("token", null)?.let { runCatching { decrypt(it) }.getOrNull() }
        set(v) {
            if (v == null) sp.edit().remove("token").apply() else sp.edit().putString("token", encrypt(v)).apply()
        }

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return gen.generateKey()
    }

    private fun encrypt(plain: String): String {
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val out = c.iv + c.doFinal(plain.toByteArray())
        return Base64.encodeToString(out, Base64.NO_WRAP)
    }

    private fun decrypt(stored: String): String {
        val raw = Base64.decode(stored, Base64.NO_WRAP)
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, raw, 0, 12)) }
        return String(c.doFinal(raw, 12, raw.size - 12))
    }

    private companion object {
        const val ALIAS = "crowdly_session"
    }
}
