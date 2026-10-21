import expo.modules.cullanative.ImageMetrics
import java.io.File
import javax.imageio.ImageIO

// Prints the metrics for every PNG in a folder, measured the way the app measures them:
// greyscale scaled so the long side is 512 px.
fun main(args: Array<String>) {
  val dir = File(args[0])
  println("%-24s %8s %7s %6s %6s %5s %5s %5s %6s".format("file", "sharp", "noise", "lum", "std", "lo", "hi", "ent", "colour"))
  for (f in dir.listFiles()!!.filter { it.name.endsWith(".png") }.sortedBy { it.name }) {
    val img = ImageIO.read(f)
    val w = img.width; val h = img.height
    val argb = img.getRGB(0, 0, w, h, null, 0, w)
    val g = ImageMetrics.grey(argb)
    val s = 512.0 / maxOf(w, h)
    val nw = (w * s).toInt(); val nh = (h * s).toInt()
    val g512 = if (s < 1) ImageMetrics.resizeGrey(g, w, h, nw, nh) else g
    val sw = if (s < 1) nw else w; val sh = if (s < 1) nh else h
    val e = ImageMetrics.exposure(g512)
    println("%-24s %8.1f %7.2f %6.1f %6.1f %5.2f %5.2f %5.2f %6.1f".format(f.name, ImageMetrics.laplacianVariance(g512, sw, sh),
      ImageMetrics.flatNoise(g, w, h), e.mean, e.std, e.clipLow, e.clipHigh, e.entropy, ImageMetrics.colourfulness(argb)))
  }
}
