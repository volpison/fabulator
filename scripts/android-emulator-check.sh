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
