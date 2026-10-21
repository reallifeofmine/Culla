package expo.modules.cullanative

import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore

/** Reads the photo and video index from MediaStore, column by column (fast for 20,000+ items). */
object MediaQueries {
  private val FILES: Uri = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL)

  fun uriFor(id: Long, isVideo: Boolean): Uri = ContentUris.withAppendedId(
    if (isVideo) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id
  )

  /** Looks up whether each id is a video so callers can pass plain ids. */
  fun uris(context: Context, ids: List<String>): List<Uri> {
    if (ids.isEmpty()) return emptyList()
    val videos = HashSet<Long>()
    val args = Bundle().apply {
      putString(ContentResolver.QUERY_ARG_SQL_SELECTION, "${MediaStore.Files.FileColumns._ID} IN (${ids.joinToString(",") { it.toLong().toString() }})")
      putInt(MediaStore.QUERY_ARG_MATCH_TRASHED, MediaStore.MATCH_INCLUDE)
    }
    context.contentResolver.query(FILES, arrayOf(MediaStore.Files.FileColumns._ID, MediaStore.Files.FileColumns.MEDIA_TYPE), args, null)?.use { c ->
      while (c.moveToNext()) if (c.getInt(1) == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO) videos.add(c.getLong(0))
    }
    return ids.map { val id = it.toLong(); uriFor(id, id in videos) }
  }

  fun list(context: Context, trashed: Boolean): Map<String, Any?> {
    val cols = arrayOf(
      MediaStore.Files.FileColumns._ID,
      MediaStore.Files.FileColumns.MEDIA_TYPE,
      MediaStore.MediaColumns.DATE_TAKEN,
      MediaStore.MediaColumns.DATE_MODIFIED,
      MediaStore.MediaColumns.SIZE,
      MediaStore.MediaColumns.WIDTH,
      MediaStore.MediaColumns.HEIGHT,
      MediaStore.MediaColumns.MIME_TYPE,
      MediaStore.MediaColumns.BUCKET_DISPLAY_NAME,
      MediaStore.MediaColumns.RELATIVE_PATH,
      MediaStore.MediaColumns.DURATION,
      MediaStore.MediaColumns.ORIENTATION,
      MediaStore.MediaColumns.DATE_EXPIRES,
      MediaStore.MediaColumns.DISPLAY_NAME,
    )
    val args = Bundle().apply {
      putString(
        ContentResolver.QUERY_ARG_SQL_SELECTION,
        "${MediaStore.Files.FileColumns.MEDIA_TYPE} IN (${MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE}, ${MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO})"
      )
      putStringArray(ContentResolver.QUERY_ARG_SORT_COLUMNS, arrayOf(MediaStore.Files.FileColumns._ID))
      putInt(MediaStore.QUERY_ARG_MATCH_TRASHED, if (trashed) MediaStore.MATCH_ONLY else MediaStore.MATCH_EXCLUDE)
      putInt(MediaStore.QUERY_ARG_MATCH_PENDING, MediaStore.MATCH_EXCLUDE)
    }
    val id = ArrayList<String>(); val video = ArrayList<Boolean>(); val uri = ArrayList<String>()
    val taken = ArrayList<Double>(); val size = ArrayList<Double>(); val w = ArrayList<Int>(); val h = ArrayList<Int>()
    val mime = ArrayList<String>(); val bucket = ArrayList<String>(); val path = ArrayList<String>()
    val duration = ArrayList<Double>(); val expires = ArrayList<Double>(); val name = ArrayList<String>()
    context.contentResolver.query(FILES, cols, args, null)?.use { c ->
      while (c.moveToNext()) {
        val rowId = c.getLong(0)
        val isVideo = c.getInt(1) == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO
        val dateTaken = if (c.isNull(2)) 0L else c.getLong(2)
        val rotated = !isVideo && (c.getInt(11) == 90 || c.getInt(11) == 270)
        id.add(rowId.toString())
        video.add(isVideo)
        uri.add(uriFor(rowId, isVideo).toString())
        taken.add((if (dateTaken > 0) dateTaken else c.getLong(3) * 1000).toDouble())
        size.add(c.getLong(4).toDouble())
        w.add(if (rotated) c.getInt(6) else c.getInt(5))
        h.add(if (rotated) c.getInt(5) else c.getInt(6))
        mime.add(c.getString(7) ?: "")
        bucket.add(c.getString(8) ?: "")
        path.add(c.getString(9) ?: "")
        duration.add(if (c.isNull(10)) 0.0 else c.getLong(10).toDouble())
        expires.add(if (c.isNull(12)) 0.0 else c.getLong(12) * 1000.0)
        name.add(c.getString(13) ?: "")
      }
    }
    return mapOf(
      "id" to id, "video" to video, "uri" to uri, "taken" to taken, "size" to size, "w" to w, "h" to h,
      "mime" to mime, "bucket" to bucket, "path" to path, "duration" to duration, "expires" to expires, "name" to name,
    )
  }
}
