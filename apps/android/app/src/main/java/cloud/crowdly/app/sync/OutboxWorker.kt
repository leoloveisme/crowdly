package cloud.crowdly.app.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import cloud.crowdly.app.crowdlyApp

/** Sends the offline outbox once a network is available, even if the app was closed meanwhile. */
class OutboxWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext.crowdlyApp
        if (app.prefs.token == null) return Result.success()
        app.api.flushOutbox()
        return if (app.outbox.count.value == 0) Result.success() else Result.retry()
    }

    companion object {
        fun schedule(context: Context) {
            val req = OneTimeWorkRequestBuilder<OutboxWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("outbox", ExistingWorkPolicy.REPLACE, req)
        }
    }
}
