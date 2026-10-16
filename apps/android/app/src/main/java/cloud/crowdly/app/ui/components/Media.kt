package cloud.crowdly.app.ui.components

import android.content.Context
import androidx.annotation.OptIn
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import cloud.crowdly.app.crowdly
import kotlinx.coroutines.delay

/** An ExoPlayer that sends the session token with backend media requests (uploads behind auth). */
@OptIn(UnstableApi::class)
fun crowdlyPlayer(context: Context): ExoPlayer {
    val token = crowdly.prefs.token
    val http = DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(true)
    if (token != null) http.setDefaultRequestProperties(mapOf("Authorization" to "Bearer $token"))
    return ExoPlayer.Builder(context).setMediaSourceFactory(DefaultMediaSourceFactory(context).setDataSourceFactory(http)).build()
}

fun fmtTime(ms: Long): String {
    val s = (ms / 1000).coerceAtLeast(0)
    return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, s / 60 % 60, s % 60) else "%d:%02d".format(s / 60, s % 60)
}

/** A compact play / seek row for one audio (or video-as-audio) URL. */
@Composable
fun AudioRow(url: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val player = remember(url) { crowdlyPlayer(context).apply { setMediaItem(MediaItem.fromUri(crowdly.api.mediaUrl(url))); prepare() } }
    var playing by remember { mutableStateOf(false) }
    var pos by remember { mutableFloatStateOf(0f) }
    var dur by remember { mutableFloatStateOf(0f) }
    DisposableEffect(player) {
        val l = object : Player.Listener { override fun onIsPlayingChanged(isPlaying: Boolean) { playing = isPlaying } }
        player.addListener(l)
        onDispose { player.removeListener(l); player.release() }
    }
    LaunchedEffect(player) {
        while (true) {
            pos = player.currentPosition.toFloat()
            dur = player.duration.takeIf { it > 0 }?.toFloat() ?: 0f
            delay(500)
        }
    }
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        IconButton({ if (player.isPlaying) player.pause() else player.play() }) { Icon(if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, null) }
        Slider(pos.coerceAtMost(dur.coerceAtLeast(1f)), { player.seekTo(it.toLong()); pos = it }, Modifier.weight(1f), valueRange = 0f..dur.coerceAtLeast(1f))
        Text("${fmtTime(pos.toLong())} / ${fmtTime(dur.toLong())}", Modifier.padding(start = 8.dp))
    }
}
