package cloud.crowdly.app.ui.components

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.OpenableColumns
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.FileProvider
import cloud.crowdly.app.data.WorkIo
import cloud.crowdly.app.net.Api
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Hands an export to another app (mail, Drive, Files…) through the share sheet. */
fun shareFile(context: Context, file: WorkIo.Exported) {
    val dir = File(context.cacheDir, "exports").apply { mkdirs() }
    val f = File(dir, file.name).apply { writeBytes(file.bytes) }
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", f)
    val send = Intent(Intent.ACTION_SEND).apply {
        type = file.mime
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_SUBJECT, file.name.substringBeforeLast('.'))
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(send, file.name))
}

/** Writes bytes to a document the user picked with ACTION_CREATE_DOCUMENT. */
suspend fun writeToUri(context: Context, uri: Uri, bytes: ByteArray) = withContext(Dispatchers.IO) {
    context.contentResolver.openOutputStream(uri, "wt")!!.use { it.write(bytes) }
}

/** Prints HTML through Android's print system, whose "Save as PDF" makes the PDF export. */
fun printHtml(context: Context, html: String, title: String) {
    val web = WebView(context)
    web.webViewClient = object : WebViewClient() {
        override fun onPageFinished(view: WebView, url: String?) {
            val pm = context.getSystemService(PrintManager::class.java)
            pm.print(title, view.createPrintDocumentAdapter(title), PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build())
        }
    }
    web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
}

/** A picked file (photo picker, document picker) as an upload part. */
suspend fun readPicked(context: Context, uri: Uri, field: String): Api.FilePart = withContext(Dispatchers.IO) {
    val cr = context.contentResolver
    val name = cr.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } ?: uri.lastPathSegment ?: "file"
    val mime = cr.getType(uri) ?: WorkIo.mimeOf(name.substringAfterLast('.', ""))
    val bytes = cr.openInputStream(uri)!!.use { it.readBytes() }
    Api.FilePart(field, name, mime, bytes)
}
