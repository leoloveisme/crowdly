package cloud.crowdly.app.reader

import android.content.ComponentName
import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.session.MediaController
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionToken
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.ui.components.crowdlyPlayer
import kotlinx.coroutines.guava.await

/**
 * Plays audiobooks and narrations with the screen off: a Media3 session
 * service, so playback shows in the notification and on the lock screen and
 * keeps going when the reader is closed.
 */
class ReaderAudioService : MediaSessionService() {
    private var session: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        session = MediaSession.Builder(this, crowdlyPlayer(this)).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onDestroy() {
        session?.run { player.release(); release() }
        session = null
        super.onDestroy()
    }

    companion object {
        /** Connects to the service (starting it) and loads [url] unless it's already playing it. */
        suspend fun controller(context: Context, url: String, title: String): MediaController {
            val token = SessionToken(context, ComponentName(context, ReaderAudioService::class.java))
            val c = MediaController.Builder(context, token).buildAsync().await()
            val full = crowdly.api.mediaUrl(url)
            if (c.currentMediaItem?.mediaId != full) {
                c.setMediaItem(MediaItem.Builder().setMediaId(full).setUri(full).setMediaMetadata(MediaMetadata.Builder().setTitle(title).setArtist("Crowdly").build()).build())
                c.prepare()
            }
            return c
        }
    }
}
