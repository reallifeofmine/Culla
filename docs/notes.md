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
  sharpness on a 160 px crop), ML Kit labels, ML Kit OCR (screenshots + document-like labels), TensorFlow Lite
  MobileNetV3 embedding via TensorFlow Lite (input 224², RGB 0–1; L2-normalised, int8 scaled by max |v|, base64). MediaPipe was dropped: no x86_64 build, so it could not be emulator-tested, and `pure/ImageMetrics` (Laplacian variance at 512 px, exposure, dHash).
  Noise is measured on a full-resolution 512 px centre crop (thumbnails hide grain). 2–3 worker threads.
- Deletes use `MediaStore.createTrashRequest` (Android's own confirmation, 30-day bin, restorable in the app's Bin
  tab) and `createDeleteRequest` for emptying the bin. Request code must fit 16 bits.
- `ImageOps` – compress / edit write a new JPEG beside the original with the same DATE_TAKEN and copied EXIF.
  Edit colour maths matches the preview's CSS filters (brightness, contrast, saturate) + a warmth channel gain.
- `tests/kotlin` – JVM harness for `pure/ImageMetrics` (uses Google's Maven Central mirror; Maven Central rate-limits).

## Decisions (src/lib/quality.ts, unit-tested in tests/quality.test.ts)
- Analysis v2 (ANALYSIS_VERSION; older photos are re-checked in the background, keeping old results meanwhile).
- Blur: whole photo at 512 px, blurry < 40 (relaxed 22, strict 70). A face is used instead only when it is
  ≥120 px wide in the 1024 px thumbnail (smaller faces were enlarged before and always read as soft —
  user report: sharp beach/desert photos flagged); face blurry < 24 (14/40).
- Eyes closed: BOTH eyes < 0.1 (0.05/0.2) on a face ≥120 px, not wearing sunglasses (eye-area brightness ÷
  face brightness < 0.55, or a Sunglasses/Goggles label). Small/squinting eyes and winks are not closed.
- Noise (v3, label "Noisy"): a low-light problem only. With EXIF ISO: noisy if ISO ≥ 1600 (relaxed 3200, strict 1600; user rule) and smooth-area
  noise > 2 (3/1.5). No EXIF (screenshots, chat copies): only lum < 70 and noise > 3 (4.5/2.5). Noise = Immerkær
  per 32 px tile over five 320 px full-res crops (centre + quadrants), 10th percentile. User report: ferns, forest,
  grass, rock, car fabric in daylight were flagged as grainy by the v2 rule (texture everywhere, no smooth area).
- Accidental = featureless (std < 8 & sharp < 3) or black frame (lum < 20 & std < 10).
- No washed-out label (removed, user decision): white backgrounds (product shots, documents, snow) are usually
  intended. "Too dark" stays (user: fine as is).
- Which photos are judged: issueFlags() runs the checks only on camera photos (EXIF ISO present, or in the
  camera folder). Screenshots never get issue flags: Screenshots folder/bucket, or v3 with no ISO and a phone
  screen shape (short side in SCREEN_WIDTHS, ratio 1.9–2.4) → Screenshots album. Saved/chat images are not judged.
  groupSimilar still uses flags() directly to drop accidental shots from sets.
- Similar sets: sorted by time, 30-min window; join if similar to the set's first AND latest photo
  (prevents chaining); cosine ≥ 0.72 within 1 min (a blurred burst shot measured 0.76), 0.86 within 10 min, 0.93 beyond; dHash ≤ 5 = same picture;
  shapes (aspect ratio) must match. Exact duplicates (same dHash) join across any time (WhatsApp copies).
- Best pick = keepScore (eyes, smile, face sharpness, sharpness, exposure, noise). Everything else pre-ticked.
- Scan order: newest first, batches of 6, saved to SQLite (`culla.db`) so nothing is analysed twice.

## In-app updates
- `UpdatePrompt` (root layout) checks GitHub releases on launch and from Settings; shows bullet points from
  every release newer than the installed build (`nativeBuildVersion` = CI run number).
- **Before every push, rewrite `RELEASE_NOTES.md`** with "- " dot points for that build; CI publishes it as the
  release body (`--notes-file`).
- Native `Updater`: downloads the APK to cache/updates (follows GitHub's redirect), then ACTION_VIEW via
  `UpdateFileProvider` (authority `<package>.culla.updates`). Needs REQUEST_INSTALL_PACKAGES; first time the
  user allows "Install unknown apps" for Culla (the app opens that setting and resumes on return).
- Browser preview: add `?updateTest=1` to the URL to exercise the popup (tests mock api.github.com).

## Testing
- `npm test` – logic tests (node --experimental-strip-types).
- Web preview with a simulated gallery (`CullaNativeModule.web.ts`, `persist.web.ts`):
  `npx expo export --platform web` → serve → `tests/web-e2e.mjs` (Playwright, 390 px dark mode).
- Real-device verification still needed: thresholds on real camera photos, scan speed, trash dialog flow.
