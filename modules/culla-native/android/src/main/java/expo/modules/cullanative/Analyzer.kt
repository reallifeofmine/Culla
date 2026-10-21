package expo.modules.cullanative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapRegionDecoder
import android.graphics.PointF
import android.graphics.Rect
import android.net.Uri
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.util.Size
import androidx.exifinterface.media.ExifInterface
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.face.FaceLandmark
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import java.util.concurrent.Callable
import kotlin.math.abs
import kotlin.math.roundToInt
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * On-device photo analysis. Everything runs on the phone: ML Kit for faces, eyes, smiles,
 * labels and text; TensorFlow Lite (MobileNetV3) for the similarity embedding; ImageMetrics for blur, noise
 * and exposure. Nothing is uploaded.
 */
class Analyzer(private val context: Context) {
  private val workers = Executors.newFixedThreadPool(THREADS)

  private val faces = FaceDetection.getClient(
    FaceDetectorOptions.Builder()
      .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
      .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
      .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
      .setMinFaceSize(0.05f)
      .build()
  )
  private val labeler = ImageLabeling.getClient(ImageLabelerOptions.Builder().setConfidenceThreshold(0.55f).build())
  private val reader = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

  // MobileNetV3 image embedder run with TensorFlow Lite. Interpreters are not thread-safe:
  // one per worker thread.
  private val interpreter = ThreadLocal.withInitial {
    try {
      val model = context.assets.openFd(MODEL).use { fd ->
        FileInputStream(fd.fileDescriptor).channel.map(FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)
      }
      Interpreter(model, Interpreter.Options().setNumThreads(1))
    } catch (e: Throwable) {
      Log.e(TAG, "Similarity model failed to start", e)
      null
    }
  }

  /** 1024-value fingerprint of what the photo shows, L2-normalised and stored as int8 (base64). */
  private fun embed(b: Bitmap): String? {
    val tf = interpreter.get() ?: return null
    val sized = Bitmap.createScaledBitmap(b, INPUT, INPUT, true)
    val px = pixels(sized)
    if (sized != b) sized.recycle()
    val input = ByteBuffer.allocateDirect(INPUT * INPUT * 3 * 4).order(ByteOrder.nativeOrder())
    for (p in px) {
      input.putFloat((p shr 16 and 0xff) / 255f)
      input.putFloat((p shr 8 and 0xff) / 255f)
      input.putFloat((p and 0xff) / 255f)
    }
    input.rewind()
    val out = Array(1) { FloatArray(1024) }
    tf.run(input, out)
    val v = out[0]
    val maxAbs = v.maxOf { abs(it) }.takeIf { it > 0f } ?: return null
    val q = ByteArray(v.size) { i -> (v[i] / maxAbs * 127f).roundToInt().coerceIn(-127, 127).toByte() }
    return Base64.encodeToString(q, Base64.NO_WRAP)
  }

  /** Analyses photos in parallel; one failure doesn't stop the batch. */
  fun analyzeBatch(ids: List<String>, readText: List<Boolean>): List<Map<String, Any?>> {
    val uris = MediaQueries.uris(context, ids)
    val jobs = ids.indices.map { i ->
      workers.submit(Callable {
        try {
          analyze(uris[i], readText.getOrElse(i) { false }) + ("id" to ids[i])
        } catch (e: Throwable) {
          mapOf("id" to ids[i], "error" to e.stackTraceToString().take(800))
        }
      })
    }
    return jobs.map { it.get(60, TimeUnit.SECONDS) }
  }

  private fun software(b: Bitmap): Bitmap =
    if (b.config == Bitmap.Config.ARGB_8888) b else b.copy(Bitmap.Config.ARGB_8888, false).also { b.recycle() }

  private fun pixels(b: Bitmap): IntArray = IntArray(b.width * b.height).also { b.getPixels(it, 0, b.width, 0, 0, b.width, b.height) }

  private fun scaled(b: Bitmap, longSide: Int): Bitmap {
    val s = longSide.toFloat() / maxOf(b.width, b.height)
    if (s >= 1f) return b
    return Bitmap.createScaledBitmap(b, maxOf(1, (b.width * s).toInt()), maxOf(1, (b.height * s).toInt()), true)
  }

  fun analyze(uri: Uri, readText: Boolean): Map<String, Any?> {
    val big = software(context.contentResolver.loadThumbnail(uri, Size(1024, 1024), null))
    val small = scaled(big, 512)
    val argb = pixels(small)
    val grey = ImageMetrics.grey(argb)
    val exp = ImageMetrics.exposure(grey)
    val tiny = Bitmap.createScaledBitmap(small, 9, 8, true)
    val hash = ImageMetrics.dHash(ImageMetrics.grey(pixels(tiny)))
    tiny.recycle()

    val image = InputImage.fromBitmap(big, 0)
    val faceList = Tasks.await(faces.process(image), 20, TimeUnit.SECONDS).map { f ->
      val r = Rect(f.boundingBox)
      r.intersect(0, 0, big.width, big.height)
      // Sharpness only when the face is big enough to judge without enlarging it (enlarging
      // makes any face look soft). Faces wider than 160 px are scaled down to 160 px.
      val faceSharp = if (r.width() >= MIN_FACE_PX && r.height() > 8) {
        val crop = Bitmap.createBitmap(big, r.left, r.top, r.width(), r.height())
        val fw = minOf(160, r.width())
        val fh = maxOf(1, (r.height() * fw.toFloat() / r.width()).toInt())
        val norm = if (fw == r.width()) crop else Bitmap.createScaledBitmap(crop, fw, fh, true)
        val v = ImageMetrics.laplacianVariance(ImageMetrics.grey(pixels(norm)), fw, fh)
        if (norm != crop) norm.recycle()
        crop.recycle()
        v
      } else -1.0
      // Eye brightness relative to the face: sunglasses make the eye areas much darker than skin.
      val eyeLum = eyeBrightness(big, r, f.getLandmark(FaceLandmark.LEFT_EYE)?.position, f.getLandmark(FaceLandmark.RIGHT_EYE)?.position)
      mapOf(
        "x" to r.left.toDouble() / big.width, "y" to r.top.toDouble() / big.height,
        "w" to r.width().toDouble() / big.width, "h" to r.height().toDouble() / big.height,
        "leftEye" to f.leftEyeOpenProbability?.toDouble(),
        "rightEye" to f.rightEyeOpenProbability?.toDouble(),
        "smile" to f.smilingProbability?.toDouble(),
        "sharp" to faceSharp,
        "px" to r.width(),
        "eyeLum" to eyeLum,
      )
    }
    val labels = Tasks.await(labeler.process(image), 20, TimeUnit.SECONDS).map { mapOf("t" to it.text, "c" to it.confidence.toDouble()) }
    val documentish = labels.any { (it["t"] as String).lowercase() in DOC_LABELS }
    val text = if (readText || documentish) {
      Tasks.await(reader.process(image), 20, TimeUnit.SECONDS).text.take(1500).ifBlank { null }
    } else null

    val emb = embed(small)

    val noise = sensorNoise(uri) ?: ImageMetrics.flatNoise(ImageMetrics.grey(pixels(big)), big.width, big.height)
    val latLon = location(uri)

    val result = mapOf(
      "sharp" to ImageMetrics.laplacianVariance(grey, small.width, small.height),
      "noise" to noise,
      "lum" to exp.mean, "std" to exp.std, "clipLow" to exp.clipLow, "clipHigh" to exp.clipHigh, "entropy" to exp.entropy,
      "colour" to ImageMetrics.colourfulness(argb),
      "hash" to hash,
      "emb" to emb,
      "v" to ANALYSIS_VERSION,
      "faces" to faceList,
      "labels" to labels,
      "text" to text,
      "lat" to latLon?.get(0), "lon" to latLon?.get(1),
    )
    Log.i(TAG, "analysed $uri sharp=${result["sharp"]} noise=$noise hash=$hash emb=${emb?.length ?: "none"} faces=${faceList.size} labels=${labels.size}")
    if (small != big) small.recycle()
    big.recycle()
    return result
  }

  /** Mean eye-area brightness divided by mean face brightness (null if landmarks are missing). */
  private fun eyeBrightness(b: Bitmap, face: Rect, left: PointF?, right: PointF?): Double? {
    if (left == null || right == null || face.width() < MIN_FACE_PX) return null
    fun mean(cx: Int, cy: Int, half: Int): Double {
      val x0 = (cx - half).coerceIn(0, b.width - 1); val x1 = (cx + half).coerceIn(x0 + 1, b.width)
      val y0 = (cy - half).coerceIn(0, b.height - 1); val y1 = (cy + half).coerceIn(y0 + 1, b.height)
      val px = IntArray((x1 - x0) * (y1 - y0))
      b.getPixels(px, 0, x1 - x0, x0, y0, x1 - x0, y1 - y0)
      return ImageMetrics.grey(px).average()
    }
    val half = maxOf(2, face.width() / 12)
    val eyes = (mean(left.x.toInt(), left.y.toInt(), half) + mean(right.x.toInt(), right.y.toInt(), half)) / 2
    val skin = mean(face.centerX(), (face.top + face.height() * 0.68f).toInt(), face.width() / 6)
    return if (skin > 0) eyes / skin else null
  }

  /** Grain measured on a full-resolution centre crop (thumbnails hide grain), in its smoothest areas. */
  @Suppress("DEPRECATION")
  private fun sensorNoise(uri: Uri): Double? = try {
    context.contentResolver.openInputStream(uri)?.use { input ->
      val dec = BitmapRegionDecoder.newInstance(input, false) ?: return null
      val side = minOf(512, dec.width, dec.height)
      val left = (dec.width - side) / 2
      val top = (dec.height - side) / 2
      val crop = dec.decodeRegion(Rect(left, top, left + side, top + side), null)
      dec.recycle()
      val c = software(crop)
      val v = ImageMetrics.flatNoise(ImageMetrics.grey(pixels(c)), c.width, c.height)
      c.recycle()
      v
    }
  } catch (e: Throwable) {
    null
  }

  private fun location(uri: Uri): DoubleArray? = try {
    context.contentResolver.openInputStream(MediaStore.setRequireOriginal(uri))?.use { ExifInterface(it).latLong }
  } catch (e: Throwable) {
    null
  }

  fun readText(uri: Uri): String? {
    val big = software(context.contentResolver.loadThumbnail(uri, Size(2048, 2048), null))
    val text = Tasks.await(reader.process(InputImage.fromBitmap(big, 0)), 30, TimeUnit.SECONDS).text
    big.recycle()
    return text.ifBlank { null }
  }

  companion object {
    private const val TAG = "Culla"
    private const val MODEL = "mobilenet_v3_small.tflite"
    private const val INPUT = 224
    private const val MIN_FACE_PX = 120
    /** Bump when measurements change so photos are re-checked. */
    const val ANALYSIS_VERSION = 2
    val THREADS = maxOf(2, minOf(3, Runtime.getRuntime().availableProcessors() / 2))
    private val DOC_LABELS = setOf("paper", "menu", "receipt", "poster", "newspaper", "document", "whiteboard", "handwriting", "text", "book", "business card", "envelope")
  }
}
