/**
 * Base16 (https://github.com/chriskempson/base16, tinted-theming) importer.
 *
 * A scheme is 16 colours base00..base0F in YAML. Both layouts exist and both
 * are accepted:
 *
 *   scheme: "Solarized Dark"            system: "base16"
 *   author: "Ethan Schoonover"          name: "Solarized Dark"
 *   base00: "002b36"                    variant: "dark"
 *   …                                   palette:
 *                                         base00: "#002b36"
 *
 * We only need `key: value` lines, so this is a small line parser rather than
 * a YAML library.
 *
 * Base24 schemes (base00..base17) are accepted too: base00..base0F mean the same
 * thing, and on dark schemes base10 (the darker background) becomes the sidebar.
 *
 * Mapping (Base16 style guide): base00/01 backgrounds, base02 selection (used
 * for borders), base04 dim text, base05 text, base08 red, base0A yellow,
 * base0B green, base0D blue.
 */
import { luminance } from "./themes";
import { mix, normalizeHex } from "./themegen";
import type { ParseResult } from "./theme-file";

const SLOTS = Array.from({ length: 16 }, (_, i) => `base0${i.toString(16).toUpperCase()}`);

function cleanValue(raw: string): string {
  const v = raw.trim();
  const quoted = /^(["'])(.*?)\1/.exec(v);
  if (quoted) return quoted[2].trim();
  const hex = /^#[0-9a-fA-F]{3,6}\b/.exec(v);
  if (hex) return hex[0];
  return v.replace(/\s+#.*$/, "").trim();
}

export function parseBase16(text: string): ParseResult {
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*["']?([A-Za-z0-9_-]+)["']?\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    // First occurrence wins (e.g. a top-level "name" before nested keys).
    if (!values.has(key)) values.set(key, cleanValue(m[2]));
  }

  const c: Record<string, string> = {};
  for (const slot of SLOTS) {
    const raw = values.get(slot.toLowerCase());
    if (raw === undefined || raw === "") {
      return { ok: false, error: `The Base16 scheme is missing ${slot}.` };
    }
    const hex = normalizeHex(raw);
    if (!hex) return { ok: false, error: `${slot} is not a hex colour: ${JSON.stringify(raw)}` };
    c[slot] = hex;
  }

  const name = (values.get("name") || values.get("scheme") || "Base16 theme").slice(0, 60);
  const author = values.get("author") || undefined;
  const variant = values.get("variant")?.toLowerCase();
  const dark = variant === "dark" ? true : variant === "light" ? false : luminance(c.base00) < 0.4;

  // Dark: base00 is the page, base01 a lighter panel. Light: base00 is the brightest, so it is the panel.
  const middle = mix(c.base00, c.base01, 0.5);
  const base24 = /base24/i.test(values.get("system") ?? "") || (values.has("base10") && values.has("base11"));
  const darker = base24 ? normalizeHex(values.get("base10") ?? "") : null;
  const surfaces = dark
    ? { background: c.base00, panel: c.base01, sidebar: darker ?? middle }
    : { background: middle, panel: c.base00, sidebar: c.base01 };

  return {
    ok: true,
    source: base24 ? "base24" : "base16",
    warnings: [],
    spec: {
      name,
      author,
      dark,
      colors: {
        ...surfaces,
        border: c.base02,
        foreground: c.base05,
        muted: c.base04,
        accent: c.base0D,
        danger: c.base08,
        warning: c.base0A,
        success: c.base0B,
        character: c.base0D,
        place: c.base0B,
        highlight: c.base0A,
      },
    },
  };
}
