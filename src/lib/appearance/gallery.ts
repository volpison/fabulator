/**
 * Theme gallery: popular colour schemes ready to add with one click.
 *
 * Only the handful of colours that make up each scheme are stored, with the
 * author, licence and home page, so credit travels with the theme. Fabulator
 * derives the rest of the interface and guarantees readable contrast (so a
 * scheme's own text colours may be lightened or darkened a little).
 * Adding a theme saves it like an imported one: it can be edited or removed.
 */
import type { ThemeSpec } from "./theme-file";
import type { BaseColors } from "./themegen";

export type GalleryTheme = {
  family: string;
  spec: ThemeSpec;
  license: string;
  source: string;
};

type Family = { name: string; author: string; license: string; source: string };

const FAMILIES: Record<string, Family> = {
  dracula: { name: "Dracula", author: "Zeno Rocha and contributors", license: "MIT", source: "draculatheme.com" },
  nord: { name: "Nord", author: "Arctic Ice Studio (Sven Greb)", license: "MIT", source: "nordtheme.com" },
  catppuccin: { name: "Catppuccin", author: "Catppuccin Org", license: "MIT", source: "catppuccin.com" },
  rosepine: { name: "Rosé Pine", author: "Rosé Pine contributors", license: "MIT", source: "rosepinetheme.com" },
  tokyo: { name: "Tokyo Night", author: "enkia", license: "MIT", source: "github.com/enkia/tokyo-night-vscode-theme" },
  solarized: { name: "Solarized", author: "Ethan Schoonover", license: "MIT", source: "ethanschoonover.com/solarized" },
  gruvbox: { name: "Gruvbox", author: "Pavel Pertsev", license: "MIT", source: "github.com/morhetz/gruvbox" },
  onedark: { name: "One", author: "Atom / GitHub", license: "MIT", source: "github.com/atom/atom" },
  github: { name: "GitHub", author: "GitHub (Primer)", license: "MIT", source: "primer.style" },
  everforest: { name: "Everforest", author: "Sainnhe Park", license: "MIT", source: "github.com/sainnhe/everforest" },
  kanagawa: { name: "Kanagawa", author: "rebelot (after Hokusai's wave)", license: "MIT", source: "github.com/rebelot/kanagawa.nvim" },
};

function entry(family: keyof typeof FAMILIES, name: string, dark: boolean, colors: BaseColors): GalleryTheme {
  const f = FAMILIES[family];
  return {
    family: f.name,
    license: f.license,
    source: f.source,
    spec: { name, author: f.author, collection: "Gallery", dark, colors },
  };
}

export const GALLERY: GalleryTheme[] = [
  entry("dracula", "Dracula", true, {
    background: "#282a36", foreground: "#f8f8f2", accent: "#bd93f9", panel: "#343746", sidebar: "#21222c",
    border: "#44475a", muted: "#6272a4", danger: "#ff5555", success: "#50fa7b", warning: "#f1fa8c",
    character: "#8be9fd", place: "#50fa7b", highlight: "#f1fa8c",
  }),
  entry("nord", "Nord", true, {
    background: "#2e3440", foreground: "#d8dee9", accent: "#88c0d0", panel: "#3b4252", border: "#4c566a",
    muted: "#616e88", danger: "#bf616a", success: "#a3be8c", warning: "#ebcb8b",
    character: "#81a1c1", place: "#a3be8c", highlight: "#ebcb8b",
  }),

  entry("catppuccin", "Catppuccin Latte", false, {
    background: "#eff1f5", foreground: "#4c4f69", accent: "#8839ef", sidebar: "#e6e9ef", border: "#ccd0da",
    muted: "#6c6f85", danger: "#d20f39", success: "#40a02b", warning: "#df8e1d",
    character: "#1e66f5", place: "#179299", highlight: "#df8e1d",
  }),
  entry("catppuccin", "Catppuccin Frappé", true, {
    background: "#303446", foreground: "#c6d0f5", accent: "#ca9ee6", panel: "#414559", sidebar: "#292c3c",
    border: "#51576d", muted: "#a5adce", danger: "#e78284", success: "#a6d189", warning: "#e5c890",
    character: "#8caaee", place: "#81c8be", highlight: "#e5c890",
  }),
  entry("catppuccin", "Catppuccin Macchiato", true, {
    background: "#24273a", foreground: "#cad3f5", accent: "#c6a0f6", panel: "#363a4f", sidebar: "#1e2030",
    border: "#494d64", muted: "#a5adcb", danger: "#ed8796", success: "#a6da95", warning: "#eed49f",
    character: "#8aadf4", place: "#8bd5ca", highlight: "#eed49f",
  }),
  entry("catppuccin", "Catppuccin Mocha", true, {
    background: "#1e1e2e", foreground: "#cdd6f4", accent: "#cba6f7", panel: "#313244", sidebar: "#181825",
    border: "#45475a", muted: "#a6adc8", danger: "#f38ba8", success: "#a6e3a1", warning: "#f9e2af",
    character: "#89b4fa", place: "#94e2d5", highlight: "#f9e2af",
  }),

  entry("rosepine", "Rosé Pine", true, {
    background: "#191724", foreground: "#e0def4", accent: "#c4a7e7", panel: "#1f1d2e", border: "#403d52",
    muted: "#908caa", danger: "#eb6f92", success: "#9ccfd8", warning: "#f6c177",
    character: "#9ccfd8", place: "#31748f", highlight: "#f6c177",
  }),
  entry("rosepine", "Rosé Pine Moon", true, {
    background: "#232136", foreground: "#e0def4", accent: "#c4a7e7", panel: "#2a273f", border: "#44415a",
    muted: "#908caa", danger: "#eb6f92", success: "#9ccfd8", warning: "#f6c177",
    character: "#9ccfd8", place: "#3e8fb0", highlight: "#f6c177",
  }),
  entry("rosepine", "Rosé Pine Dawn", false, {
    background: "#faf4ed", foreground: "#575279", accent: "#907aa9", panel: "#fffaf3", border: "#dfdad9",
    muted: "#797593", danger: "#b4637a", success: "#56949f", warning: "#ea9d34",
    character: "#56949f", place: "#286983", highlight: "#ea9d34",
  }),

  entry("tokyo", "Tokyo Night", true, {
    background: "#1a1b26", foreground: "#a9b1d6", accent: "#7aa2f7", panel: "#1f2335", sidebar: "#16161e",
    border: "#292e42", muted: "#737aa2", danger: "#f7768e", success: "#9ece6a", warning: "#e0af68",
    character: "#7dcfff", place: "#9ece6a", highlight: "#e0af68",
  }),
  entry("tokyo", "Tokyo Night Storm", true, {
    background: "#24283b", foreground: "#a9b1d6", accent: "#7aa2f7", panel: "#292e42", sidebar: "#1f2335",
    border: "#3b4261", muted: "#737aa2", danger: "#f7768e", success: "#9ece6a", warning: "#e0af68",
    character: "#7dcfff", place: "#9ece6a", highlight: "#e0af68",
  }),

  entry("solarized", "Solarized Dark", true, {
    background: "#002b36", foreground: "#839496", accent: "#268bd2", panel: "#073642",
    muted: "#586e75", danger: "#dc322f", success: "#859900", warning: "#b58900",
    character: "#2aa198", place: "#859900", highlight: "#b58900",
  }),
  entry("solarized", "Solarized Light", false, {
    background: "#fdf6e3", foreground: "#657b83", accent: "#268bd2", sidebar: "#eee8d5",
    muted: "#93a1a1", danger: "#dc322f", success: "#859900", warning: "#b58900",
    character: "#2aa198", place: "#859900", highlight: "#b58900",
  }),

  entry("gruvbox", "Gruvbox Dark", true, {
    background: "#282828", foreground: "#ebdbb2", accent: "#fe8019", panel: "#3c3836", sidebar: "#1d2021",
    border: "#504945", muted: "#a89984", danger: "#fb4934", success: "#b8bb26", warning: "#fabd2f",
    character: "#83a598", place: "#8ec07c", highlight: "#fabd2f",
  }),
  entry("gruvbox", "Gruvbox Light", false, {
    background: "#fbf1c7", foreground: "#3c3836", accent: "#af3a03", sidebar: "#ebdbb2", border: "#d5c4a1",
    muted: "#7c6f64", danger: "#9d0006", success: "#79740e", warning: "#b57614",
    character: "#076678", place: "#427b58", highlight: "#fabd2f",
  }),

  entry("onedark", "One Dark", true, {
    background: "#282c34", foreground: "#abb2bf", accent: "#61afef", panel: "#2c313a", sidebar: "#21252b",
    border: "#3e4451", muted: "#7f848e", danger: "#e06c75", success: "#98c379", warning: "#e5c07b",
    character: "#56b6c2", place: "#98c379", highlight: "#e5c07b",
  }),
  entry("onedark", "One Light", false, {
    background: "#fafafa", foreground: "#383a42", accent: "#4078f2", sidebar: "#eaeaeb", border: "#dbdbdc",
    muted: "#a0a1a7", danger: "#e45649", success: "#50a14f", warning: "#c18401",
    character: "#0184bc", place: "#50a14f", highlight: "#e5c07b",
  }),

  entry("github", "GitHub Light", false, {
    background: "#ffffff", foreground: "#24292f", accent: "#0969da", sidebar: "#f6f8fa", border: "#d0d7de",
    muted: "#59636e", danger: "#cf222e", success: "#1a7f37", warning: "#9a6700",
    character: "#8250df", place: "#1a7f37", highlight: "#eac54f",
  }),
  entry("github", "GitHub Dark", true, {
    background: "#0d1117", foreground: "#e6edf3", accent: "#2f81f7", panel: "#161b22", sidebar: "#010409",
    border: "#30363d", muted: "#8d96a0", danger: "#f85149", success: "#3fb950", warning: "#d29922",
    character: "#a371f7", place: "#3fb950", highlight: "#d29922",
  }),

  entry("everforest", "Everforest Dark", true, {
    background: "#2d353b", foreground: "#d3c6aa", accent: "#a7c080", panel: "#343f44", sidebar: "#232a2e",
    border: "#475258", muted: "#859289", danger: "#e67e80", success: "#a7c080", warning: "#dbbc7f",
    character: "#7fbbb3", place: "#83c092", highlight: "#dbbc7f",
  }),
  entry("everforest", "Everforest Light", false, {
    background: "#fdf6e3", foreground: "#5c6a72", accent: "#8da101", sidebar: "#f4f0d9", border: "#e6e2cc",
    muted: "#939f91", danger: "#f85552", success: "#8da101", warning: "#dfa000",
    character: "#3a94c5", place: "#35a77c", highlight: "#dfa000",
  }),

  entry("kanagawa", "Kanagawa Wave", true, {
    background: "#1f1f28", foreground: "#dcd7ba", accent: "#7e9cd8", panel: "#2a2a37", sidebar: "#16161d",
    border: "#363646", muted: "#727169", danger: "#e46876", success: "#98bb6c", warning: "#e6c384",
    character: "#7fb4ca", place: "#98bb6c", highlight: "#e6c384",
  }),
];

/** Families in gallery order, each with its themes. */
export function galleryFamilies(list: GalleryTheme[] = GALLERY): { family: string; themes: GalleryTheme[] }[] {
  const out: { family: string; themes: GalleryTheme[] }[] = [];
  for (const t of list) {
    const group = out.find((g) => g.family === t.family);
    if (group) group.themes.push(t);
    else out.push({ family: t.family, themes: [t] });
  }
  return out;
}
