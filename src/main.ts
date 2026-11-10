import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { initAppearance } from "./lib/appearance";
import { installWebviewGuards } from "./lib/webviewGuards";

// Apply the saved theme/sizes before anything is drawn (no flash of the wrong theme).
initAppearance();
// No browser menu or reload shortcuts: a reload would restart the app and could lose typing.
installWebviewGuards();

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
