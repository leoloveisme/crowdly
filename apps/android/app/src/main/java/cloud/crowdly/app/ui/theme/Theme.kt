package cloud.crowdly.app.ui.theme

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// The platform's shadcn/ui palette (src/index.css :root and .dark): slate
// neutrals with a near-black primary, plus Crowdly's violet as the accent
// used for branches and live presence.
private val Light = lightColorScheme(
    primary = Color(0xFF0F172A),
    onPrimary = Color(0xFFF8FAFC),
    secondary = Color(0xFF7C3AED),
    onSecondary = Color.White,
    tertiary = Color(0xFFD97706),
    background = Color.White,
    onBackground = Color(0xFF020817),
    surface = Color.White,
    onSurface = Color(0xFF020817),
    surfaceVariant = Color(0xFFF1F5F9),
    onSurfaceVariant = Color(0xFF64748B),
    surfaceContainer = Color(0xFFF8FAFC),
    surfaceContainerHigh = Color(0xFFF1F5F9),
    outline = Color(0xFFE2E8F0),
    outlineVariant = Color(0xFFE2E8F0),
    error = Color(0xFFEF4444),
    secondaryContainer = Color(0xFFEDE9FE),
    onSecondaryContainer = Color(0xFF4C1D95),
)

private val Dark = darkColorScheme(
    primary = Color(0xFFF8FAFC),
    onPrimary = Color(0xFF0F172A),
    secondary = Color(0xFFA78BFA),
    onSecondary = Color(0xFF1E1B4B),
    tertiary = Color(0xFFFBBF24),
    background = Color(0xFF020817),
    onBackground = Color(0xFFF8FAFC),
    surface = Color(0xFF020817),
    onSurface = Color(0xFFF8FAFC),
    surfaceVariant = Color(0xFF1E293B),
    onSurfaceVariant = Color(0xFF94A3B8),
    surfaceContainer = Color(0xFF0B1222),
    surfaceContainerHigh = Color(0xFF1E293B),
    outline = Color(0xFF1E293B),
    outlineVariant = Color(0xFF1E293B),
    error = Color(0xFFF87171),
    secondaryContainer = Color(0xFF2E1065),
    onSecondaryContainer = Color(0xFFDDD6FE),
)

@Composable
fun CrowdlyTheme(dark: Boolean, content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) Dark else Light) {
        // A Surface sets the content colour, so plain Text reads well in both themes.
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background, content = content)
    }
}
