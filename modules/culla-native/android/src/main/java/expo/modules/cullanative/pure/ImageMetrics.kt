package expo.modules.cullanative

import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.sqrt

/**
 * Pure image measurements on 8-bit greyscale or ARGB pixel arrays (no Android types, so this
 * file is unit-tested on the JVM). Callers scale images to a fixed size first, because every
 * measure here depends on scale.
 */
object ImageMetrics {
  /** Luma (BT.601) of packed ARGB pixels. */
  fun grey(argb: IntArray): IntArray = IntArray(argb.size) { i ->
    val p = argb[i]
    ((p shr 16 and 0xff) * 299 + (p shr 8 and 0xff) * 587 + (p and 0xff) * 114) / 1000
  }

  /** Variance of the 4-neighbour Laplacian: high for crisp edges, low for blur. */
  fun laplacianVariance(g: IntArray, w: Int, h: Int): Double {
    if (w < 3 || h < 3) return 0.0
    var sum = 0.0
    var sumSq = 0.0
    var n = 0
    for (y in 1 until h - 1) {
      val row = y * w
      for (x in 1 until w - 1) {
        val i = row + x
        val v = (g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i]).toDouble()
        sum += v
        sumSq += v * v
        n++
      }
    }
    val mean = sum / n
    return sumSq / n - mean * mean
  }

  /**
   * Immerkær's fast noise estimate (sigma in grey levels). Run on a full-resolution crop:
   * downscaled thumbnails average the noise away.
   */
  fun noiseSigma(g: IntArray, w: Int, h: Int): Double {
    if (w < 3 || h < 3) return 0.0
    var total = 0.0
    for (y in 1 until h - 1) {
      val row = y * w
      for (x in 1 until w - 1) {
        val i = row + x
        val v = g[i - w - 1] - 2 * g[i - w] + g[i - w + 1] -
          2 * g[i - 1] + 4 * g[i] - 2 * g[i + 1] +
          g[i + w - 1] - 2 * g[i + w] + g[i + w + 1]
        total += abs(v)
      }
    }
    return total * sqrt(Math.PI / 2) / (6.0 * (w - 2) * (h - 2))
  }

  /**
   * Grain in the smoothest parts of the image: Immerkær's estimate per 32 px block, taking the
   * 10th percentile. Texture (rock, sand, foliage) only raises busy blocks, so it no longer
   * reads as grain; sensor noise raises every block, including sky and walls.
   */
  fun flatNoise(g: IntArray, w: Int, h: Int, block: Int = 32): Double {
    if (w < block || h < block) return noiseSigma(g, w, h)
    val values = ArrayList<Double>()
    val tile = IntArray(block * block)
    var by = 0
    while (by + block <= h) {
      var bx = 0
      while (bx + block <= w) {
        for (y in 0 until block) System.arraycopy(g, (by + y) * w + bx, tile, y * block, block)
        values.add(noiseSigma(tile, block, block))
        bx += block
      }
      by += block
    }
    values.sort()
    return values[(values.size * 0.1).toInt()]
  }

  data class Exposure(val mean: Double, val std: Double, val clipLow: Double, val clipHigh: Double, val entropy: Double)

  fun exposure(g: IntArray): Exposure {
    val hist = IntArray(256)
    var sum = 0.0
    for (v in g) { hist[v]++; sum += v }
    val n = g.size.toDouble()
    val mean = sum / n
    var varSum = 0.0
    var entropy = 0.0
    var low = 0
    var high = 0
    for (v in 0..255) {
      val c = hist[v]
      if (c == 0) continue
      varSum += c * (v - mean) * (v - mean)
      val p = c / n
      entropy -= p * ln(p) / ln(2.0)
      if (v <= 16) low += c
      if (v >= 240) high += c
    }
    return Exposure(mean, sqrt(varSum / n), low / n, high / n, entropy)
  }

  /** Hasler & Süsstrunk colourfulness. */
  fun colourfulness(argb: IntArray): Double {
    var sRg = 0.0; var sYb = 0.0; var qRg = 0.0; var qYb = 0.0
    for (p in argb) {
      val r = (p shr 16 and 0xff).toDouble()
      val gg = (p shr 8 and 0xff).toDouble()
      val b = (p and 0xff).toDouble()
      val rg = r - gg
      val yb = 0.5 * (r + gg) - b
      sRg += rg; sYb += yb; qRg += rg * rg; qYb += yb * yb
    }
    val n = argb.size.toDouble()
    val mRg = sRg / n; val mYb = sYb / n
    val sdRg = sqrt(maxOf(0.0, qRg / n - mRg * mRg))
    val sdYb = sqrt(maxOf(0.0, qYb / n - mYb * mYb))
    return sqrt(sdRg * sdRg + sdYb * sdYb) + 0.3 * sqrt(mRg * mRg + mYb * mYb)
  }

  /** 64-bit difference hash from a 9x8 greyscale image, as 16 hex characters. */
  fun dHash(g9x8: IntArray): String {
    var bits = 0UL
    var k = 0
    for (y in 0 until 8) for (x in 0 until 8) {
      if (g9x8[y * 9 + x] > g9x8[y * 9 + x + 1]) bits = bits or (1UL shl k)
      k++
    }
    return bits.toString(16).padStart(16, '0')
  }

  /** Box-filter downscale of a greyscale image (area average). */
  fun resizeGrey(g: IntArray, w: Int, h: Int, nw: Int, nh: Int): IntArray {
    val out = IntArray(nw * nh)
    for (y in 0 until nh) {
      val y0 = y * h / nh
      val y1 = maxOf(y0 + 1, (y + 1) * h / nh)
      for (x in 0 until nw) {
        val x0 = x * w / nw
        val x1 = maxOf(x0 + 1, (x + 1) * w / nw)
        var s = 0
        for (yy in y0 until y1) for (xx in x0 until x1) s += g[yy * w + xx]
        out[y * nw + x] = s / ((y1 - y0) * (x1 - x0))
      }
    }
    return out
  }
}
