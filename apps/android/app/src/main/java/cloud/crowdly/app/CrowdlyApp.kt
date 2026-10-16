package cloud.crowdly.app

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import android.content.Context
import cloud.crowdly.app.data.Connectivity
import cloud.crowdly.app.data.Db
import cloud.crowdly.app.data.Outbox
import cloud.crowdly.app.data.Prefs
import cloud.crowdly.app.data.Session
import cloud.crowdly.app.i18n.I18n
import cloud.crowdly.app.net.Api
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** The app's singletons. Screens reach them through [crowdly]. */
class CrowdlyApp : Application(), SingletonImageLoader.Factory {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    val prefs by lazy { Prefs(this) }
    val db by lazy { Db(this) }
    val outbox by lazy { Outbox(db) }
    val api by lazy { Api(prefs, outbox, db) }
    val repo by lazy { cloud.crowdly.app.data.Repo(api, session) }
    val io by lazy { cloud.crowdly.app.data.WorkIo(repo, api) }
    val session by lazy { Session(api, prefs, db, outbox) }
    val i18n by lazy { I18n(api, prefs, db, session) }
    val connectivity by lazy { Connectivity(this) }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    /** Images load through the API's OkHttp client, so uploads behind auth carry the session token. */
    override fun newImageLoader(context: PlatformContext): ImageLoader =
        ImageLoader.Builder(context).components { add(OkHttpNetworkFetcherFactory(callFactory = { api.http })) }.build()

    companion object {
        lateinit var instance: CrowdlyApp
            private set
    }
}

val crowdly: CrowdlyApp get() = CrowdlyApp.instance
val Context.crowdlyApp: CrowdlyApp get() = applicationContext as CrowdlyApp
