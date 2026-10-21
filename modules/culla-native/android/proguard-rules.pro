# ML Kit and MediaPipe find their components by reflection. The release build's code shrinker
# (R8) would otherwise strip those constructors and the detectors fail to start.
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_** { *; }
-keep class com.google.android.gms.vision.** { *; }
-keep class * implements com.google.firebase.components.ComponentRegistrar { <init>(); }
-keep class com.google.firebase.components.** { *; }
-keep class com.google.android.gms.common.** { *; }
-keep class com.google.android.datatransport.** { *; }
-keep class com.google.mediapipe.** { *; }
-keep class * extends com.google.protobuf.GeneratedMessageLite { *; }
-keep class com.google.protobuf.** { *; }
-dontwarn com.google.mlkit.**
-dontwarn com.google.mediapipe.**
-dontwarn com.google.protobuf.**
-dontwarn com.google.auto.value.**
-dontwarn javax.lang.model.**
