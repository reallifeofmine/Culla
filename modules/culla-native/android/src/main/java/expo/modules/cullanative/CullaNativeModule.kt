package expo.modules.cullanative

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.MediaStore
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

class CullaNativeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val analyzer by lazy { Analyzer(context) }
  private val io = Executors.newSingleThreadExecutor()
  private var pendingRequest: Promise? = null

  private fun mediaPermissions(): Array<String> =
    if (Build.VERSION.SDK_INT >= 33) arrayOf(Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO, Manifest.permission.ACCESS_MEDIA_LOCATION)
    else arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.ACCESS_MEDIA_LOCATION)

  private fun granted(p: String) = context.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED

  /** "full", "limited" (Android 14 'selected photos only') or "none". */
  private fun access(): String {
    val full = if (Build.VERSION.SDK_INT >= 33) granted(Manifest.permission.READ_MEDIA_IMAGES) else granted(Manifest.permission.READ_EXTERNAL_STORAGE)
    if (full) return "full"
    if (Build.VERSION.SDK_INT >= 34 && granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)) return "limited"
    return "none"
  }

  /** Runs work off the JS queue and settles the promise when done. */
  private fun background(promise: Promise, work: () -> Any?) {
    io.execute {
      try {
        promise.resolve(work())
      } catch (e: Throwable) {
        promise.reject("E_CULLA", e.message ?: e.javaClass.simpleName, e)
      }
    }
  }

  /** Shows Android's own confirmation for trash/restore/delete and reports whether it was accepted. */
  private fun systemRequest(request: PendingIntent, promise: Promise) {
    val activity = appContext.currentActivity ?: run { promise.reject("E_NO_ACTIVITY", "App is not in the foreground", null); return }
    pendingRequest?.resolve(false)
    pendingRequest = promise
    activity.runOnUiThread {
      try {
        activity.startIntentSenderForResult(request.intentSender, REQUEST_CODE, null, 0, 0, 0, null)
      } catch (e: Throwable) {
        pendingRequest = null
        promise.reject("E_REQUEST", e.message, e)
      }
    }
  }

  private fun uris(ids: List<String>): List<Uri> = MediaQueries.uris(context, ids)

  override fun definition() = ModuleDefinition {
    Name("CullaNative")

    Function("getAccess") { access() }

    AsyncFunction("requestAccess") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(appContext.permissions, object : Promise {
        override fun resolve(value: Any?) { promise.resolve(access()) }
        override fun reject(code: String?, message: String?, cause: Throwable?) { promise.resolve(access()) }
      }, *mediaPermissions())
    }

    AsyncFunction("listMedia") { trashed: Boolean, promise: Promise ->
      background(promise) { MediaQueries.list(context, trashed) }
    }

    // Analysis has its own thread pool inside Analyzer; this thread only waits for the batch.
    AsyncFunction("analyze") { ids: List<String>, readText: List<Boolean>, promise: Promise ->
      Thread {
        try {
          promise.resolve(analyzer.analyzeBatch(ids, readText))
        } catch (e: Throwable) {
          promise.reject("E_ANALYZE", e.message, e)
        }
      }.start()
    }

    AsyncFunction("readText") { id: String, promise: Promise ->
      background(promise) { analyzer.readText(uris(listOf(id)).first()) }
    }

    AsyncFunction("trash") { ids: List<String>, promise: Promise ->
      systemRequest(MediaStore.createTrashRequest(context.contentResolver, uris(ids), true), promise)
    }

    AsyncFunction("restore") { ids: List<String>, promise: Promise ->
      systemRequest(MediaStore.createTrashRequest(context.contentResolver, uris(ids), false), promise)
    }

    AsyncFunction("deleteForever") { ids: List<String>, promise: Promise ->
      systemRequest(MediaStore.createDeleteRequest(context.contentResolver, uris(ids)), promise)
    }

    AsyncFunction("compress") { id: String, maxDim: Int, quality: Int, promise: Promise ->
      background(promise) { ImageOps.compress(context, uris(listOf(id)).first(), maxDim, quality) }
    }

    AsyncFunction("autoParams") { id: String, promise: Promise ->
      background(promise) { ImageOps.autoParams(context, uris(listOf(id)).first()) }
    }

    AsyncFunction("saveEdit") { id: String, edit: Map<String, Any?>, promise: Promise ->
      background(promise) { ImageOps.edit(context, uris(listOf(id)).first(), edit) }
    }

    AsyncFunction("storage") {
      val stat = StatFs(Environment.getExternalStorageDirectory().path)
      mapOf("total" to stat.totalBytes.toDouble(), "free" to stat.availableBytes.toDouble())
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode == REQUEST_CODE) {
        pendingRequest?.resolve(payload.resultCode == Activity.RESULT_OK)
        pendingRequest = null
      }
    }
  }

  companion object {
    // Activity result codes must fit in 16 bits.
    private const val REQUEST_CODE = 7185
  }
}
