// JVM harness for the pure-Kotlin image metrics used by the Android module (no Android SDK needed).
plugins {
  kotlin("jvm") version "2.1.21"
  application
}
repositories {
  maven("https://maven-central.storage-download.googleapis.com/maven2/")
  mavenCentral()
}
kotlin { jvmToolchain(21) }
sourceSets {
  main { kotlin.srcDirs("src/main/kotlin", "../../modules/culla-native/android/src/main/java/expo/modules/cullanative/pure") }
}
application { mainClass.set("MetricsCheckKt") }
