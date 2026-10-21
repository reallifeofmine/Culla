# Culla – project notes

Android-first photo cleaner (Expo SDK 58, React Native 0.88). Finds similar shots and keeps the best,
flags blurry / eyes-closed / grainy / dark / accidental photos, smart albums + search, compression, light editor.
Everything runs on the phone; nothing is uploaded.

## Build & release
- No local Android SDK (dl.google.com is blocked in the dev sandbox). `.github/workflows/android.yml` builds on
  every push to main: typecheck + tests → `expo prebuild` → `gradlew assembleRelease` (arm64 only) → GitHub
  release `v<version>-build<run>` with `culla.apk`. Install link for the phone:
  https://github.com/reallifeofmine/culla/releases/latest
- On failure the workflow force-pushes the log tail to branch `ci-logs` (readable without a token):
  `git fetch origin ci-logs && git show origin/ci-logs:build.log | tail -80`.
- `versionCode` = CI run number (app.config.js), so each APK installs over the last.
- Release builds are signed with the React Native template's debug keystore (same every build, so updates install).
  It is a public key: fine for a personal sideloaded app, replace with a secret keystore before any store release.
- `android/` and `ios/` are generated; never edit them. Native code lives in `modules/culla-native`.

## Native module (modules/culla-native, Kotlin)
- `MediaQueries` – column listing of MediaStore (images + videos, trashed or not).
- `Analyzer` – per photo, from a 1024 px system thumbnail: ML Kit faces (eye-open + smile probabilities, face
  sharpness on a 160 px crop), ML Kit labels, ML Kit OCR (screenshots + document-like labels), MediaPipe
  MobileNetV3 embedding (int8, base64), and `pure/ImageMetrics` (Laplacian variance at 512 px, exposure, dHash).
  Noise is measured on a full-resolution 512 px centre crop (thumbnails hide grain). 2–3 worker threads.
- Deletes use `MediaStore.createTrashRequest` (Android's own confirmation, 30-day bin, restorable in the app's Bin
  tab) and `createDeleteRequest` for emptying the bin. Request code must fit 16 bits.
- `ImageOps` – compress / edit write a new JPEG beside the original with the same DATE_TAKEN and copied EXIF.
  Edit colour maths matches the preview's CSS filters (brightness, contrast, saturate) + a warmth channel gain.
- `tests/kotlin` – JVM harness for `pure/ImageMetrics` (uses Google's Maven Central mirror; Maven Central rate-limits).

## Decisions (src/lib/quality.ts, unit-tested in tests/quality.test.ts)
- Thresholds calibrated on blurred/noisy/dark variants of natural images at 512 px: sharp 400–1600,
  gaussian σ1.5 → 8–30. Blurry < 40 (relaxed 22, strict 70); with judgeable faces blur is judged on faces
  (×0.6) so portraits with soft backgrounds aren't flagged. Noisy > 7.5. Accidental = featureless
  (std < 8 & sharp < 3) or black frame (lum < 20 & std < 10).
- Eyes closed: any face ≥ 6 % of width with min(eye-open) < 0.2.
- Similar sets: sorted by time, 30-min window; join if similar to the set's first AND latest photo
  (prevents chaining); cosine ≥ 0.80 within 1 min, 0.86 within 10 min, 0.93 beyond; dHash ≤ 5 = same picture;
  shapes (aspect ratio) must match. Exact duplicates (same dHash) join across any time (WhatsApp copies).
- Best pick = keepScore (eyes, smile, face sharpness, sharpness, exposure, noise). Everything else pre-ticked.
- Scan order: newest first, batches of 6, saved to SQLite (`culla.db`) so nothing is analysed twice.

## Testing
- `npm test` – logic tests (node --experimental-strip-types).
- Web preview with a simulated gallery (`CullaNativeModule.web.ts`, `persist.web.ts`):
  `npx expo export --platform web` → serve → `tests/web-e2e.mjs` (Playwright, 390 px dark mode).
- Real-device verification still needed: thresholds on real camera photos, scan speed, trash dialog flow.
