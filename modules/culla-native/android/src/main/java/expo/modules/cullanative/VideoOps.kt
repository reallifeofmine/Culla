package expo.modules.cullanative

import android.content.ContentValues
import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import java.nio.ByteBuffer

/**
 * Saves part of a video as a new video, without re-encoding: samples are copied as they are, so it
 * is fast and keeps the original quality. The clip starts at the last keyframe at or before the
 * chosen start (usually under a second earlier) because a video can only begin on a keyframe.
 */
object VideoOps {
  private const val TAG = "Culla"

  fun trim(context: Context, source: Uri, startMs: Long, endMs: Long, taken: Long): Map<String, Any?> {
    require(endMs > startMs) { "The end must be after the start" }
    val resolver = context.contentResolver
    val name = "Culla_clip_${System.currentTimeMillis()}.mp4"
    val values = ContentValues().apply {
      put(MediaStore.Video.Media.DISPLAY_NAME, name)
      put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
      put(MediaStore.Video.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MOVIES}/Culla")
      // Sorts next to the original in the gallery.
      if (taken > 0) put(MediaStore.Video.Media.DATE_TAKEN, taken + startMs)
      put(MediaStore.Video.Media.IS_PENDING, 1)
    }
    val out = resolver.insert(MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values)
      ?: throw IllegalStateException("Couldn't create the new video")
    try {
      val durationMs = resolver.openFileDescriptor(out, "rw")!!.use { pfd ->
        copySegment(context, source, startMs * 1000, endMs * 1000, MediaMuxer(pfd.fileDescriptor, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4))
      }
      resolver.update(out, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null)
      val id = out.lastPathSegment ?: ""
      Log.i(TAG, "clip saved $out from $source ${startMs}-${endMs} ms, $durationMs ms long")
      return mapOf("id" to id, "uri" to out.toString(), "duration" to durationMs.toDouble())
    } catch (e: Throwable) {
      resolver.delete(out, null, null)
      throw e
    }
  }

  /** Copies every track's samples between the times (µs) into the muxer. Returns the clip length in ms. */
  private fun copySegment(context: Context, source: Uri, startUs: Long, endUs: Long, muxer: MediaMuxer): Long {
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(context, source, null)
      // Keep the phone's rotation so portrait videos stay portrait.
      MediaMetadataRetriever().run {
        try {
          setDataSource(context, source)
          extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull()?.let { muxer.setOrientationHint(it) }
        } finally {
          release()
        }
      }
      val trackMap = HashMap<Int, Int>()
      var maxInput = 1 shl 20
      var videoTrack = -1
      for (i in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(i)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
        if (!mime.startsWith("video/") && !mime.startsWith("audio/")) continue
        val muxTrack = try {
          muxer.addTrack(format)
        } catch (e: Throwable) {
          Log.w(TAG, "clip: skipping $mime track the MP4 format can't hold", e)
          continue
        }
        extractor.selectTrack(i)
        trackMap[i] = muxTrack
        if (mime.startsWith("video/") && videoTrack < 0) videoTrack = i
        if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) maxInput = maxOf(maxInput, format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE))
      }
      require(trackMap.isNotEmpty()) { "This video's format can't be trimmed" }

      // Every track starts from the video's keyframe at or before the requested start.
      extractor.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
      val firstUs = extractor.sampleTime.coerceAtLeast(0)
      muxer.start()
      val buffer = ByteBuffer.allocate(maxInput)
      val info = MediaCodec.BufferInfo()
      var lastUs = firstUs
      while (true) {
        val track = extractor.sampleTrackIndex
        if (track < 0) break
        val time = extractor.sampleTime
        if (time > endUs) break
        val mux = trackMap[track]
        if (mux != null && time >= firstUs) {
          info.offset = 0
          info.size = extractor.readSampleData(buffer, 0)
          if (info.size < 0) break
          info.presentationTimeUs = time - firstUs
          info.flags = if (extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0
          muxer.writeSampleData(mux, buffer, info)
          lastUs = maxOf(lastUs, time)
        }
        if (!extractor.advance()) break
      }
      muxer.stop()
      return (lastUs - firstUs) / 1000
    } finally {
      try { muxer.release() } catch (_: Throwable) {}
      extractor.release()
    }
  }
}
