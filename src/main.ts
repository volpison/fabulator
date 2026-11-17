import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { initAppearance } from "./lib/appearance";
import { installWebviewGuards } from "./lib/webviewGuards";
import { setPlatform } from "./lib/platform";
import { tauriPlatform } from "./lib/platform/tauri";

// On Android the app draws under the status bar and navigation bar: let the style sheet keep clear of them.
if (/\bAndroid\b/i.test(navigator.userAgent)) document.documentElement.classList.add("android");

// The desktop backend (Rust via Tauri). Everything else talks to the Platform interface only.
setPlatform(tauriPlatform);

// Apply the saved theme/sizes before anything is drawn (no flash of the wrong theme).
initAppearance();
// No browser menu or reload shortcuts: a reload would restart the app and could lose typing.
installWebviewGuards();

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
