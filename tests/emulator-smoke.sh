#!/usr/bin/env bash
# Real-app smoke test on an Android emulator (run by CI). Installs the APK with permissions
# granted, adds test photos to the gallery, lets the check run, and records screenshots,
# the on-screen text and the log. Fails if the app crashed or reported a check error.
set -x
APK="$1"
OUT=smoke
PKG=com.reallifeofmine.culla
mkdir -p "$OUT"

# Let the emulator settle so system apps don't throw "not responding" dialogs over ours.
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done
sleep 30
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null

adb install -r -g "$APK"
adb shell mkdir -p /sdcard/DCIM/Camera
for f in tests/fixtures/*.jpg; do adb push "$f" /sdcard/DCIM/Camera/; done
for f in tests/fixtures/*.jpg; do
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/DCIM/Camera/$(basename "$f")" > /dev/null
done
sleep 8
adb shell content query --uri content://media/external/images/media --projection _display_name:relative_path > "$OUT/mediastore.txt" || true

adb logcat -G 16M || true
adb logcat -c
adb logcat -v time > "$OUT/logcat-full.txt" 2>&1 &
LOGPID=$!
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1
sleep 90

ui() { adb shell uiautomator dump /sdcard/ui.xml > /dev/null && adb pull /sdcard/ui.xml "$OUT/$1.xml" > /dev/null; }
text() { python3 - "$OUT/$1.xml" <<'PY'
import sys, re
x = open(sys.argv[1], encoding='utf-8').read()
print('\n'.join(t for t in re.findall(r' text="([^"]*)"', x) if t))
PY
}
tap() { # tap the first element whose text matches $2 in dump $1
  python3 - "$OUT/$1.xml" "$2" <<'PY' | { read x y && [ -n "$x" ] && adb shell input tap "$x" "$y"; }
import sys, re
x = open(sys.argv[1], encoding='utf-8').read()
for m in re.finditer(r'text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', x):
    if re.search(sys.argv[2], m.group(1)):
        a, b, c, d = map(int, m.groups()[1:]); print((a + c) // 2, (b + d) // 2); break
PY
}

# Dismiss any system "isn't responding" dialog (tap Wait) and bring Culla back to the front.
for i in 1 2 3; do
  ui front
  if grep -q "isn.t responding" "$OUT/front.xml"; then tap front '^Wait$'; sleep 3; adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1; sleep 10; else break; fi
done
adb exec-out screencap -p > "$OUT/1-dashboard.png"
ui dashboard; text dashboard > "$OUT/1-dashboard.txt"
tap dashboard '^Similar shots$'; sleep 4
adb exec-out screencap -p > "$OUT/2-similar.png"
ui similar; text similar > "$OUT/2-similar.txt"
tap similar 'Keep'; sleep 4
adb exec-out screencap -p > "$OUT/3-set.png"
ui set; text set > "$OUT/3-set.txt"
adb shell input keyevent KEYCODE_BACK; sleep 1; adb shell input keyevent KEYCODE_BACK; sleep 2
ui home2; tap home2 '^Albums$'; sleep 4
adb exec-out screencap -p > "$OUT/4-albums.png"
ui albums; text albums > "$OUT/4-albums.txt"

kill $LOGPID 2>/dev/null; sleep 1
grep -E "AndroidRuntime|ReactNativeJS|Culla|FATAL|CullaNative|mlkit|mediapipe" "$OUT/logcat-full.txt" | tail -400 > "$OUT/logcat.txt"

set +x
echo "---- dashboard ----"; cat "$OUT/1-dashboard.txt"
echo "---- similar ----"; cat "$OUT/2-similar.txt"
fail=0
grep -q "FATAL EXCEPTION" "$OUT/logcat-full.txt" && { echo "App crashed"; fail=1; }
grep -q "Culla analyze" "$OUT/logcat.txt" && { echo "Analysis errors in the log"; fail=1; }
grep -q "^Clean up$" "$OUT/1-dashboard.txt" || { echo "Culla's screen was not visible"; fail=1; }
grep -qi "couldn.t check\|couldn.t be checked" "$OUT/1-dashboard.txt" && { echo "Check reported an error"; fail=1; }
grep -q "^0 / " "$OUT/1-dashboard.txt" && { echo "Nothing was checked"; fail=1; }
python3 - "$OUT/1-dashboard.txt" <<'PY' || { echo "No similar set found for the burst"; fail=1; }
import sys
lines = [l.strip() for l in open(sys.argv[1], encoding='utf-8') if l.strip()]
i = lines.index('Similar shots') if 'Similar shots' in lines else -1
# Fixtures: a 4-shot burst (one blurred) and a grainy copy of the coffee photo → 2 sets, 4 extra photos.
ok = i >= 0 and i + 2 < len(lines) and lines[i + 1].startswith('2 sets') and lines[i + 2] == '4'
print('similar:', lines[i + 1:i + 3] if i >= 0 else None)
sys.exit(0 if ok else 1)
PY
echo "---- analysis log ----"; grep -E "Culla" "$OUT/logcat-full.txt" | grep -E "analysed|Similarity|analyze" | head -30
echo "smoke result: $([ $fail = 0 ] && echo PASS || echo FAIL)" | tee "$OUT/result.txt"
exit $fail
