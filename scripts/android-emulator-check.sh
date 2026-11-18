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

# ── Edit a scene card by touch (finger drag and drop does not work in the Android web view, so the
#    Edit mode has the chapter and plotline choices and move up/down buttons) ──
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
adb exec-out cat /sdcard/ui.xml > "$OUT/ui.xml" 2>/dev/null
CARDB=$(python3 - <<'PY'
import re
xml = open("emulator-out/ui.xml", encoding="utf-8", errors="replace").read()
for m in re.finditer(r'<node[^>]*>', xml):
    n = m.group(0)
    t = re.search(r' text="([^"]*)"', n); b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n)
    if t and b and t.group(1).startswith("Untitled scene") and "Edit" in t.group(1):
        print(*b.groups()); break
PY
)
if [ -n "$CARDB" ]; then
  set -- $CARDB
  adb shell input tap $(( $3 - 40 )) $(( $2 + 24 )); sleep 3   # the small Edit label at the card's top right
  adb exec-out screencap -p > "$OUT/edit-by-touch.png"
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb exec-out cat /sdcard/ui.xml > "$OUT/ui.xml"
  if grep -q 'text="Delete"' "$OUT/ui.xml" && grep -q 'text="Done"' "$OUT/ui.xml"; then
    echo "EDIT-BY-TOUCH: the scene's Edit mode opened (chapter, plotline, move up/down, Done)" | tee -a "$OUT/summary.txt"
  else
    echo "EDIT-BY-TOUCH: the Edit mode did NOT open" | tee -a "$OUT/summary.txt"
  fi
  tap_text "Done" && sleep 2
else
  echo "EDIT-BY-TOUCH: could not find the scene card" | tee -a "$OUT/summary.txt"
fi

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

sleep 6
adb exec-out screencap -p > "$OUT/step3b-typed-later.png"
# Where is the page's bottom line (the status bar) while the keyboard is open? If it is lower than the
# keyboard's top, the page was NOT resized and the keyboard covers it.
echo "=== Bounds of page elements with the keyboard open ==="
python3 - <<'PY'
import re
xml = open("emulator-out/ui3.xml", encoding="utf-8", errors="replace").read()
for m in re.finditer(r'<node[^>]*>', xml):
    n = m.group(0)
    t = re.search(r' text="([^"]*)"', n); b = re.search(r'bounds="([^"]*)"', n)
    if t and b and re.match(r'(Not saved to a file yet|\d+ words|Once upon a time|No characters yet|Untitled scene$)', t.group(1)):
        print(t.group(1)[:40], b.group(1))
PY
echo "=== Window and keyboard state ==="
adb shell dumpsys window | grep -iE "softInputMode|mInputMethodWindow|InputMethod.*Frame|imeLayeringTarget|isImeShowing|mImeShowing" | head -8 | cut -c1-200
adb shell dumpsys input_method | grep -iE "mInputShown|mImeWindowVis|inputShown" | head -3
if grep -q "No characters yet" "$OUT/ui3.xml"; then
  echo "KEYBOARD-FOLD: the scene details are still shown with the keyboard open" | tee -a "$OUT/summary.txt"
else
  echo "KEYBOARD-FOLD: the scene details are folded away while the keyboard is open" | tee -a "$OUT/summary.txt"
fi

# Open the File menu by touch.
tap_text "File" && sleep 2
adb exec-out screencap -p > "$OUT/step4-file-menu.png"
echo "=== Text on screen with the File menu ==="
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb exec-out cat /sdcard/ui.xml > "$OUT/ui4.xml"
grep -o 'text="[^"]\+"' "$OUT/ui4.xml" | head -40
# ── Open a file with the real Android file picker (File → Open…) ──
# The File menu is still open from the step above.
dump_texts() { # label
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb exec-out cat /sdcard/ui.xml > "$OUT/ui.xml" 2>/dev/null
  echo "=== $1 ==="
  grep -o 'text="[^"]\+"' "$OUT/ui.xml" | head -40
}
if [ -f emulator-in/Imported.fabulator.json ]; then
  adb push emulator-in/Imported.fabulator.json /sdcard/Download/Imported.fabulator.json 2>&1 | tail -1
  tap_text "Open…" && sleep 4
  dump_texts "After choosing Open…"
  adb exec-out screencap -p > "$OUT/picker0-after-open.png"
  # The open story has unsaved typing: the app asks before replacing it.
  tap_text "Discard changes" && sleep 5
  dump_texts "Picker (first screen)"
  adb exec-out screencap -p > "$OUT/picker1.png"
  if ! grep -q "Imported.fabulator.json" "$OUT/ui.xml"; then
    # Show the Downloads folder: open the side menu, then Downloads.
    adb shell input tap 88 112; sleep 2   # the picker's menu button (top left)
    dump_texts "Picker side menu"
    adb exec-out screencap -p > "$OUT/picker1b-menu.png"
    tap_text "Downloads" && sleep 3 || true
    dump_texts "Picker (after choosing Downloads)"
    adb exec-out screencap -p > "$OUT/picker2.png"
  fi
  # The file is a tile in a grid: tap its middle (tapping the name's own box hits a small preview icon).
  adb shell input tap 216 660; sleep 6
  adb exec-out screencap -p > "$OUT/picker3-opened.png"
  dump_texts "After picking the file"
  if grep -q "Imported from the device" "$OUT/ui.xml"; then
    echo "PICKER-OPEN: the story picked with the Android file picker was opened" | tee -a "$OUT/summary.txt"
  else
    echo "PICKER-OPEN: the picked story was NOT opened" | tee -a "$OUT/summary.txt"
  fi
else
  echo "PICKER-OPEN: no sample file was made (skipped)" | tee -a "$OUT/summary.txt"
fi

# ── Save a copy to the device through the real Android file picker ──
if grep -q "Imported from the device" "$OUT/ui.xml"; then
  adb shell ls /sdcard/Download > "$OUT/download-before.txt" 2>&1
  tap_text "File" && sleep 2
  tap_text "Save a copy to your device" && sleep 5
  dump_texts "Save-a-copy picker (first screen)"
  adb exec-out screencap -p > "$OUT/save1.png"
  adb shell input tap 88 112; sleep 2
  tap_text "Downloads" && sleep 3 || true
  dump_texts "Save-a-copy picker (Downloads)"
  adb exec-out screencap -p > "$OUT/save2.png"
  tap_text "Save" && sleep 5 || true
  dump_texts "After saving the copy"
  adb exec-out screencap -p > "$OUT/save3.png"
  adb shell ls -la /sdcard/Download | tee "$OUT/download-after.txt"
  NEW=$(adb shell ls /sdcard/Download | grep -c "fabulator.json")
  if [ "$NEW" -ge 2 ]; then
    echo "SAVE-COPY: a copy of the story was written to Downloads through the file picker" | tee -a "$OUT/summary.txt"
  else
    echo "SAVE-COPY: no new copy appeared in Downloads" | tee -a "$OUT/summary.txt"
  fi
fi

echo "=== App state at the end ==="
echo "pid: $(adb shell pidof "$PKG" | tr -d '\r')"
adb logcat -d > "$OUT/logcat-end.txt" 2>&1
echo "=== Crash buffer ==="
adb logcat -b crash -d 2>&1 | tail -40 | cut -c1-220
echo "=== Lines about the app dying ==="
grep -E "nv\.fabulator" "$OUT/logcat-end.txt" | grep -iE "died|kill|fatal|crash|signal|abort|lowmem|anr" | tail -15 | cut -c1-220
grep -E "lmkd" "$OUT/logcat-end.txt" | tail -8 | cut -c1-220
exit 0
