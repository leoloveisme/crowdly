package cloud.crowdly.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import cloud.crowdly.app.ui.CrowdlyRoot
import cloud.crowdly.app.ui.theme.CrowdlyTheme

class MainActivity : ComponentActivity() {
    /** A file another app asked us to open (ACTION_VIEW on a .story/.screenplay/.comic/.master). */
    private val opened = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) opened.value = fileOf(intent)
        setContent {
            val theme by crowdly.prefs.theme.collectAsState()
            val dark = when (theme) { "dark" -> true; "light" -> false; else -> isSystemInDarkTheme() }
            CrowdlyTheme(dark) {
                CrowdlyRoot(opened.value, onOpened = { opened.value = null })
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        opened.value = fileOf(intent)
    }

    private fun fileOf(intent: Intent): String? =
        if (intent.action == Intent.ACTION_VIEW) intent.data?.toString() else null
}
