package expo.modules.cullanative

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** Own subclass so the provider never clashes with another library's FileProvider. */
class UpdateFileProvider : FileProvider()

/** Downloads a new APK into the cache and opens Android's install/update confirmation. */
object Updater {
  private fun file(context: Context) = File(File(context.cacheDir, "updates").apply { mkdirs() }, "culla-update.apk")

  /** Downloads to the cache, reporting progress 0..1. Follows GitHub's redirect to its file host. */
  fun download(context: Context, url: String, onProgress: (Double) -> Unit): String {
    val out = file(context)
    var location = url
    var conn: HttpURLConnection
    var hops = 0
    while (true) {
      conn = (URL(location).openConnection() as HttpURLConnection).apply {
        instanceFollowRedirects = false
        connectTimeout = 20_000
        readTimeout = 30_000
        setRequestProperty("Accept", "application/octet-stream")
      }
      val code = conn.responseCode
      if (code in 300..399 && hops < 5) {
        location = conn.getHeaderField("Location") ?: throw IllegalStateException("Update link broken")
        conn.disconnect(); hops++; continue
      }
      if (code != 200) throw IllegalStateException("Download failed ($code)")
      break
    }
    val total = conn.contentLengthLong.takeIf { it > 0 } ?: -1L
    conn.inputStream.use { input ->
      out.outputStream().use { output ->
        val buf = ByteArray(64 * 1024)
        var done = 0L
        var lastReport = 0L
        while (true) {
          val n = input.read(buf)
          if (n < 0) break
          output.write(buf, 0, n)
          done += n
          if (total > 0 && done - lastReport > 512 * 1024) { lastReport = done; onProgress(done.toDouble() / total) }
        }
      }
    }
    conn.disconnect()
    onProgress(1.0)
    return out.absolutePath
  }

  fun canInstall(context: Context) = context.packageManager.canRequestPackageInstalls()

  /** Opens the system page where the user allows Culla to install updates (one time). */
  fun openInstallPermission(context: Context) {
    context.startActivity(
      Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
  }

  fun install(context: Context, path: String) {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.culla.updates", File(path))
    context.startActivity(
      Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, "application/vnd.android.package-archive")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    )
  }
}
