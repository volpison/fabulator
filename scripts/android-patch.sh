#!/usr/bin/env bash
# Run after `tauri android init` (CI only: the Android project is generated, not committed).
# Edge-to-edge drawing stops Android from resizing the page when the on-screen keyboard opens, so the
# keyboard would cover the lower half of the writing area. This lifts the page above the keyboard.
set -eu
F=$(find src-tauri/gen/android/app/src/main -name MainActivity.kt | head -n 1)
[ -n "$F" ] || { echo "android-patch: MainActivity.kt not found"; exit 1; }
echo "--- MainActivity.kt before the patch ($F)"
cat "$F"
if grep -q "fabulator-ime-patch" "$F"; then echo "already patched"; exit 0; fi
python3 - "$F" <<'PY'
import re, sys
path = sys.argv[1]
s = open(path, encoding="utf-8").read()
body = '''
    // fabulator-ime-patch: lift the page above the on-screen keyboard.
    val content = findViewById<android.view.View>(android.R.id.content)
    androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
      val ime = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.ime())
      v.setPadding(0, 0, 0, ime.bottom)
      insets
    }
'''
if "super.onCreate(savedInstanceState)" in s:
    s = s.replace("super.onCreate(savedInstanceState)", "super.onCreate(savedInstanceState)" + body, 1)
else:
    method = "\n  override fun onCreate(savedInstanceState: android.os.Bundle?) {\n    super.onCreate(savedInstanceState)" + body + "  }\n"
    m = re.search(r"TauriActivity\(\)\s*\{", s)
    if m:
        s = s[: m.end()] + method + s[m.end():]
    else:
        s = re.sub(r"(TauriActivity\(\))", r"\1 {" + method.replace("\\", "\\\\") + "}", s, count=1)
open(path, "w", encoding="utf-8").write(s)
PY
echo "--- MainActivity.kt after the patch"
cat "$F"
