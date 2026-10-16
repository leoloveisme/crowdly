package cloud.crowdly.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.net.isNetwork
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** Shows a one-line message at the bottom of the current screen. */
val LocalSnack = staticCompositionLocalOf<(String) -> Unit> { {} }

/** Runs a suspend action and reports failures through the snackbar. */
class Actions(private val scope: CoroutineScope, private val snack: (String) -> Unit) {
    fun run(ok: String? = null, block: suspend () -> Unit) {
        scope.launch {
            try {
                block()
                if (ok != null) snack(ok)
            } catch (e: Exception) {
                snack(errorText(e))
            }
        }
    }
}

@Composable
fun rememberActions(): Actions {
    val scope = rememberCoroutineScope()
    val snack = LocalSnack.current
    return remember(scope, snack) { Actions(scope, snack) }
}

fun errorText(e: Throwable): String =
    if (e.isNetwork()) "You're offline or the server can't be reached." else e.message ?: "Something went wrong."

/** A top-app-bar screen; [back] adds the back arrow. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Screen(
    title: String,
    back: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
    subtitle: String? = null,
    floating: @Composable () -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    val snackState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val snack: (String) -> Unit = remember(snackState) { { m -> scope.launch { snackState.showSnackbar(m) } } }
    androidx.compose.runtime.CompositionLocalProvider(LocalSnack provides snack) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                        }
                    },
                    navigationIcon = {
                        if (back != null) IconButton(onClick = back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, tr("android-back", "Back")) }
                    },
                    actions = actions,
                )
            },
            snackbarHost = { SnackbarHost(snackState) },
            floatingActionButton = floating,
        ) { pad -> content(pad) }
    }
}

/** Loads data with [load], showing a spinner, an error with Retry, or [content]. Call `reload()` to fetch again. */
class Loader<T>(val state: MutableState<LoadState<T>>, private val bump: () -> Unit) {
    fun reload() = bump()
    val value: T? get() = (state.value as? LoadState.Ready)?.value
    fun set(v: T) { state.value = LoadState.Ready(v) }
}

sealed interface LoadState<out T> {
    data object Loading : LoadState<Nothing>
    data class Ready<T>(val value: T) : LoadState<T>
    data class Failed(val message: String) : LoadState<Nothing>
}

@Composable
fun <T> rememberLoader(vararg keys: Any?, load: suspend () -> T): Loader<T> {
    var tick by remember { mutableIntStateOf(0) }
    val state = remember(*keys) { mutableStateOf<LoadState<T>>(LoadState.Loading) }
    LaunchedEffect(tick, *keys) {
        if (state.value !is LoadState.Ready) state.value = LoadState.Loading
        state.value = try { LoadState.Ready(load()) } catch (e: Exception) { LoadState.Failed(errorText(e)) }
    }
    return remember(state) { Loader(state) { tick++ } }
}

@Composable
fun <T> Loaded(loader: Loader<T>, modifier: Modifier = Modifier, content: @Composable (T) -> Unit) {
    when (val s = loader.state.value) {
        LoadState.Loading -> Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        is LoadState.Failed -> Column(modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text(s.message, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.size(12.dp))
            OutlinedButton(onClick = { loader.reload() }) { AppText("android-retry", "Retry") }
        }
        is LoadState.Ready -> content(s.value)
    }
}

@Composable
fun Empty(text: String, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, trailing: @Composable RowScope.() -> Unit = {}) {
    Row(modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 16.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        trailing()
    }
}

@Composable
fun ListRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    leading: @Composable (() -> Unit)? = null,
    trailing: @Composable (() -> Unit)? = null,
    onClick: (() -> Unit)? = null,
) {
    Row(
        modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leading != null) { leading(); Spacer(Modifier.width(16.dp)) }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (!subtitle.isNullOrBlank()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (trailing != null) { Spacer(Modifier.width(8.dp)); trailing() }
    }
}

@Composable
fun Pill(text: String, color: Color = MaterialTheme.colorScheme.secondaryContainer, onColor: Color = MaterialTheme.colorScheme.onSecondaryContainer) {
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        color = onColor,
        modifier = Modifier.background(color, RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

@Composable
fun Dot(color: Color, size: Int = 8) {
    Box(Modifier.size(size.dp).background(color, CircleShape))
}

@Composable
fun SoftCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Card(
        modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
    ) { content() }
}

/** A dialog asking for one line of text (names, titles, links). */
@Composable
fun TextPrompt(
    title: String,
    initial: String = "",
    label: String? = null,
    confirm: String = "OK",
    singleLine: Boolean = true,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var text by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { OutlinedTextField(text, { text = it }, label = label?.let { { Text(it) } }, singleLine = singleLine, modifier = Modifier.fillMaxWidth()) },
        confirmButton = { Button(onClick = { onConfirm(text) }, enabled = text.isNotBlank()) { Text(confirm) } },
        dismissButton = { TextButton(onClick = onDismiss) { AppText("android-cancel", "Cancel") } },
    )
}

@Composable
fun Confirm(title: String, text: String, confirm: String, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = { Button(onClick = { onConfirm(); onDismiss() }) { Text(confirm) } },
        dismissButton = { TextButton(onClick = onDismiss) { AppText("android-cancel", "Cancel") } },
    )
}

/** Placeholder for a screen that a later phase of the Android plan fills in. */
@Composable
fun ComingSoon() {
    val nav = cloud.crowdly.app.ui.LocalNav.current
    Screen(tr("android-coming-soon", "Coming soon"), back = { nav.popBackStack() }) { pad ->
        Empty(tr("android-coming-soon-text", "This part of the app is on its way."), Modifier.padding(pad))
    }
}
