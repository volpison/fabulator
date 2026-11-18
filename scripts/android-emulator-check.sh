#!/usr/bin/env bash
# Runs inside the emulator job: installs the debug APK, opens the app, and keeps evidence in emulator-out/.
# It fails if the app is not running after start-up.
set -u
OUT=emulator-out
mkdir -p "$OUT"

APK=$(find src-tauri/gen/android/app/build/outputs/apk -name '*.apk' | head -n 1)
echo "APK: $APK" | tee "$OUT/summary.txt"
[ -n "$APK" ] || { echo "No APK was built" | tee -a "$OUT/summary.txt"; exit 1; }

adb install -r "$APK" 2>&1 | tee -a "$OUT/summary.txt"
PKG=$(grep -o '"identifier": *"[^"]*"' src-tauri/tauri.conf.json | sed 's/.*"\([^"]*\)"$/\1/')
echo "Package: $PKG" | tee -a "$OUT/summary.txt"

adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 25
# The emulator's own launcher sometimes shows a "not responding" box over the app: close system dialogs.
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1
sleep 3
adb exec-out screencap -p > "$OUT/start.png"
adb logcat -d > "$OUT/logcat.txt" 2>&1
adb shell wm size 2>&1 | tee -a "$OUT/summary.txt"

# Evidence in the job log, readable without downloading anything.
echo "=== Text on screen (uiautomator) ==="
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
adb exec-out cat /sdcard/ui.xml > "$OUT/ui.xml" 2>/dev/null
grep -o 'text="[^"]\+"' "$OUT/ui.xml" | head -80
echo "=== Log lines about the app, errors and the web view ==="
grep -iE "fatal|AndroidRuntime|chromium|Tauri|nv.fabulator|console|wry" "$OUT/logcat.txt" | tail -60

if adb shell pidof "$PKG" >/dev/null 2>&1 && [ -n "$(adb shell pidof "$PKG" | tr -d '\r')" ]; then
  echo "RESULT: the app is running after 25 seconds" | tee -a "$OUT/summary.txt"
else
  echo "RESULT: the app is NOT running (it crashed or never started)" | tee -a "$OUT/summary.txt"
  exit 1
fi

# ── Touch and typing (best effort: a failure here is reported, not fatal) ──
# tap_text "words": tap the centre of the first screen element whose text contains the words.
tap_text() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb exec-out cat /sdcard/ui.xml > "$OUT/ui.xml" 2>/dev/null
  XY=$(python3 - "$1" <<'PY'
import re, sys
want = sys.argv[1]
xml = open("emulator-out/ui.xml", encoding="utf-8", errors="replace").read()
for m in re.finditer(r'<node[^>]*>', xml):
    node = m.group(0)
    t = re.search(r' text="([^"]*)"', node)
    d = re.search(r' content-desc="([^"]*)"', node)
    b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node)
    if b and ((t and want in t.group(1)) or (d and want in d.group(1))):
        x1, y1, x2, y2 = map(int, b.groups())
        print((x1 + x2) // 2, (y1 + y2) // 2)
        break
PY
)
  if [ -z "$XY" ]; then echo "TAP: could not find '$1' on screen" | tee -a "$OUT/summary.txt"; return 1; fi
  echo "TAP: '$1' at $XY" | tee -a "$OUT/summary.txt"
  adb shell input tap $XY
}

tap_text "Untitled scene" && sleep 4
adb exec-out screencap -p > "$OUT/step2-writing.png"
echo "=== Text on screen after tapping the scene ==="
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb exec-out cat /sdcard/ui.xml > "$OUT/ui2.xml"
grep -o 'text="[^"]\+"' "$OUT/ui2.xml" | head -40

# Tap inside the page area (centre of the screen) and type.
SIZE=$(adb shell wm size | grep -o '[0-9]\+x[0-9]\+' | tail -1); W=${SIZE%x*}; H=${SIZE#*x}
adb shell input tap $((W / 2)) $((H / 2)); sleep 2
adb shell input text "Once%supon%sa%stime"; sleep 3
adb exec-out screencap -p > "$OUT/step3-typed.png"
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb exec-out cat /sdcard/ui.xml > "$OUT/ui3.xml"
if grep -q "Once upon a time" "$OUT/ui3.xml"; then
  echo "TYPING: the typed text reached the editor" | tee -a "$OUT/summary.txt"
else
  echo "TYPING: the typed text was NOT found in the editor" | tee -a "$OUT/summary.txt"
fi

# Open the File menu by touch.
tap_text "File" && sleep 2
adb exec-out screencap -p > "$OUT/step4-file-menu.png"
echo "=== Text on screen with the File menu ==="
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb exec-out cat /sdcard/ui.xml > "$OUT/ui4.xml"
grep -o 'text="[^"]\+"' "$OUT/ui4.xml" | head -40
echo "=== App state at the end ==="
echo "pid: $(adb shell pidof "$PKG" | tr -d '\r')"
adb logcat -d > "$OUT/logcat-end.txt" 2>&1
echo "=== Crash buffer ==="
adb logcat -b crash -d 2>&1 | tail -40 | cut -c1-220
echo "=== Lines about the app dying ==="
grep -E "nv\.fabulator" "$OUT/logcat-end.txt" | grep -iE "died|kill|fatal|crash|signal|abort|lowmem|anr" | tail -15 | cut -c1-220
grep -E "lmkd" "$OUT/logcat-end.txt" | tail -8 | cut -c1-220
exit 0
