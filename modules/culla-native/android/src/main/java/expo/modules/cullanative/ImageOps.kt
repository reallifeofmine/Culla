package expo.modules.cullanative

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.net.Uri
import android.provider.MediaStore
import androidx.exifinterface.media.ExifInterface
import kotlin.math.roundToInt

/** Compression and light edits. Both write a new photo next to the original and keep its date. */
object ImageOps {
  data class Source(val uri: Uri, val name: String, val path: String, val taken: Long, val mime: String)

  private fun source(context: Context, uri: Uri): Source {
    context.contentResolver.query(
      uri,
      arrayOf(MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.RELATIVE_PATH, MediaStore.MediaColumns.DATE_TAKEN, MediaStore.MediaColumns.DATE_MODIFIED, MediaStore.MediaColumns.MIME_TYPE),
      null, null, null
    )?.use { c ->
      if (c.moveToFirst()) {
        val taken = if (c.isNull(2) || c.getLong(2) == 0L) c.getLong(3) * 1000 else c.getLong(2)
        return Source(uri, c.getString(0) ?: "photo.jpg", c.getString(1) ?: "Pictures/", taken, c.getString(4) ?: "image/jpeg")
      }
    }
    throw IllegalStateException("Photo not found")
  }

  /** Decodes upright, no larger than maxDim on the long side. */
  private fun decode(context: Context, uri: Uri, maxDim: Int): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxDim) sample *= 2
    val opts = BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 }
    var bmp = context.contentResolver.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it, null, opts) }
      ?: throw IllegalStateException("Couldn't read this photo")
    val rotation = context.contentResolver.openInputStream(uri)!!.use { ExifInterface(it).rotationDegrees }
    val scale = minOf(1f, maxDim.toFloat() / maxOf(bmp.width, bmp.height))
    if (rotation != 0 || scale < 1f) {
      val m = Matrix().apply { postScale(scale, scale); postRotate(rotation.toFloat()) }
      val out = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
      if (out != bmp) bmp.recycle()
      bmp = out
    }
    return bmp
  }

  private val EXIF_TAGS = listOf(
    ExifInterface.TAG_DATETIME, ExifInterface.TAG_DATETIME_ORIGINAL, ExifInterface.TAG_DATETIME_DIGITIZED,
    ExifInterface.TAG_OFFSET_TIME_ORIGINAL, ExifInterface.TAG_MAKE, ExifInterface.TAG_MODEL,
    ExifInterface.TAG_GPS_LATITUDE, ExifInterface.TAG_GPS_LATITUDE_REF, ExifInterface.TAG_GPS_LONGITUDE, ExifInterface.TAG_GPS_LONGITUDE_REF,
    ExifInterface.TAG_GPS_ALTITUDE, ExifInterface.TAG_GPS_ALTITUDE_REF, ExifInterface.TAG_GPS_TIMESTAMP, ExifInterface.TAG_GPS_DATESTAMP,
    ExifInterface.TAG_F_NUMBER, ExifInterface.TAG_EXPOSURE_TIME, ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY, ExifInterface.TAG_FOCAL_LENGTH,
  )

  /** Saves bitmap as a JPEG beside the source, copying date and location metadata. */
  private fun save(context: Context, src: Source, bmp: Bitmap, suffix: String, quality: Int): Map<String, Any?> {
    val base = src.name.substringBeforeLast('.')
    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, "${base}_$suffix.jpg")
      put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
      put(MediaStore.MediaColumns.RELATIVE_PATH, src.path)
      put(MediaStore.MediaColumns.DATE_TAKEN, src.taken)
      put(MediaStore.MediaColumns.IS_PENDING, 1)
    }
    val resolver = context.contentResolver
    val out = resolver.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values)
      ?: throw IllegalStateException("Couldn't create the new photo")
    try {
      resolver.openOutputStream(out)!!.use { bmp.compress(Bitmap.CompressFormat.JPEG, quality, it) }
      try {
        val original = resolver.openInputStream(MediaStore.setRequireOriginal(src.uri))?.use { ExifInterface(it) }
          ?: resolver.openInputStream(src.uri)?.use { ExifInterface(it) }
        resolver.openFileDescriptor(out, "rw")?.use { fd ->
          val exif = ExifInterface(fd.fileDescriptor)
          if (original != null) for (t in EXIF_TAGS) original.getAttribute(t)?.let { exif.setAttribute(t, it) }
          exif.setAttribute(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL.toString())
          exif.saveAttributes()
        }
      } catch (e: Throwable) {
        // Metadata is a nice-to-have; the photo itself is saved.
      }
      resolver.update(out, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
    } catch (e: Throwable) {
      resolver.delete(out, null, null)
      throw e
    }
    var size = 0L
    resolver.query(out, arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.SIZE), null, null, null)?.use { c ->
      if (c.moveToFirst()) size = c.getLong(1)
    }
    return mapOf("id" to out.lastPathSegment, "uri" to out.toString(), "size" to size.toDouble(), "w" to bmp.width, "h" to bmp.height)
  }

  fun compress(context: Context, uri: Uri, maxDim: Int, quality: Int): Map<String, Any?> {
    val src = source(context, uri)
    val bmp = decode(context, uri, maxDim)
    try {
      return save(context, src, bmp, "c", quality)
    } finally {
      bmp.recycle()
    }
  }

  /**
   * Colour matrix matching the preview's CSS filters, applied in the same order:
   * brightness, contrast, saturate, then a warm/cool white balance shift.
   */
  fun colourMatrix(brightness: Double, contrast: Double, saturation: Double, warmth: Double): ColorMatrix {
    val m = ColorMatrix()
    val b = (1 + 0.5 * brightness).toFloat()
    m.postConcat(ColorMatrix(floatArrayOf(b, 0f, 0f, 0f, 0f, 0f, b, 0f, 0f, 0f, 0f, 0f, b, 0f, 0f, 0f, 0f, 0f, 1f, 0f)))
    val c = (1 + 0.6 * contrast).toFloat()
    val t = 127.5f * (1 - c)
    m.postConcat(ColorMatrix(floatArrayOf(c, 0f, 0f, 0f, t, 0f, c, 0f, 0f, t, 0f, 0f, c, 0f, t, 0f, 0f, 0f, 1f, 0f)))
    val s = (1 + saturation).toFloat()
    m.postConcat(ColorMatrix(floatArrayOf(
      0.213f + 0.787f * s, 0.715f - 0.715f * s, 0.072f - 0.072f * s, 0f, 0f,
      0.213f - 0.213f * s, 0.715f + 0.285f * s, 0.072f - 0.072f * s, 0f, 0f,
      0.213f - 0.213f * s, 0.715f - 0.715f * s, 0.072f + 0.928f * s, 0f, 0f,
      0f, 0f, 0f, 1f, 0f,
    )))
    val wr = (1 + 0.1 * warmth).toFloat()
    val wb = (1 - 0.1 * warmth).toFloat()
    m.postConcat(ColorMatrix(floatArrayOf(wr, 0f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 0f, wb, 0f, 0f, 0f, 0f, 0f, 1f, 0f)))
    return m
  }

  /** Suggested auto-enhance values from the histogram (levels stretch + gentle saturation). */
  fun autoParams(context: Context, uri: Uri): Map<String, Double> {
    val bmp = decode(context, uri, 512)
    val px = IntArray(bmp.width * bmp.height).also { bmp.getPixels(it, 0, bmp.width, 0, 0, bmp.width, bmp.height) }
    bmp.recycle()
    val grey = ImageMetrics.grey(px)
    val sorted = grey.sorted()
    val lo = sorted[(sorted.size * 0.01).toInt()]
    val hi = sorted[minOf(sorted.size - 1, (sorted.size * 0.99).toInt())]
    val mean = grey.average()
    val spread = maxOf(40, hi - lo)
    val contrast = ((255.0 / spread - 1) / 0.6).coerceIn(0.0, 0.5)
    val brightness = ((128 - mean) / 128 * 0.6).coerceIn(-0.3, 0.4)
    val colour = ImageMetrics.colourfulness(px)
    val saturation = if (colour < 35) 0.2 else if (colour < 60) 0.1 else 0.0
    return mapOf("brightness" to brightness, "contrast" to contrast, "saturation" to saturation, "warmth" to 0.0)
  }

  fun edit(context: Context, uri: Uri, e: Map<String, Any?>): Map<String, Any?> {
    val src = source(context, uri)
    var bmp = decode(context, uri, 4096)
    val rotate = (e["rotate"] as? Number)?.toInt() ?: 0
    if (rotate % 360 != 0) {
      val r = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(rotate.toFloat()) }, true)
      if (r != bmp) bmp.recycle()
      bmp = r
    }
    @Suppress("UNCHECKED_CAST")
    (e["crop"] as? Map<String, Any?>)?.let { c ->
      val x = (((c["x"] as Number).toDouble()) * bmp.width).roundToInt().coerceIn(0, bmp.width - 1)
      val y = (((c["y"] as Number).toDouble()) * bmp.height).roundToInt().coerceIn(0, bmp.height - 1)
      val w = (((c["w"] as Number).toDouble()) * bmp.width).roundToInt().coerceIn(1, bmp.width - x)
      val h = (((c["h"] as Number).toDouble()) * bmp.height).roundToInt().coerceIn(1, bmp.height - y)
      if (w < bmp.width || h < bmp.height) {
        val cropped = Bitmap.createBitmap(bmp, x, y, w, h)
        if (cropped != bmp) bmp.recycle()
        bmp = cropped
      }
    }
    val num = { k: String -> (e[k] as? Number)?.toDouble() ?: 0.0 }
    if (listOf("brightness", "contrast", "saturation", "warmth").any { num(it) != 0.0 }) {
      val out = Bitmap.createBitmap(bmp.width, bmp.height, Bitmap.Config.ARGB_8888)
      val paint = Paint(Paint.FILTER_BITMAP_FLAG).apply {
        colorFilter = ColorMatrixColorFilter(colourMatrix(num("brightness"), num("contrast"), num("saturation"), num("warmth")))
      }
      Canvas(out).drawBitmap(bmp, 0f, 0f, paint)
      bmp.recycle()
      bmp = out
    }
    try {
      return save(context, src, bmp, "edit", 92)
    } finally {
      bmp.recycle()
    }
  }
}
