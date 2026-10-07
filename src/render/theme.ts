import type { BrandColors, PosterTheme } from "../core/types.js";

export interface Palette {
  bg: string;
  fg: string;
  accent: string;
  glow: [string, string];
  tagBg: string;
  tagFg: string;
  tagLine: string;
  markBg: string;
  markFg: string;
  bar: string;
  barFg: string;
  /** Which logo variant the background needs. */
  logo: "onDark" | "onLight" | "plate";
}

function rgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const n = Number.parseInt(h.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
}

export const rgba = (hex: string, a: number): string => `rgba(${rgb(hex).join(",")},${a})`;

/** Relative luminance (WCAG). */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** White or the dark color, whichever reads better on `bg`. */
export const readableOn = (bg: string, dark: string): string => (contrast(bg, "#ffffff") >= contrast(bg, dark) ? "#ffffff" : dark);

function mix(hex: string, withHex: string, t: number): string {
  const a = rgb(hex), b = rgb(withHex);
  return "#" + a.map((v, i) => Math.round(v + (b[i]! - v) * t).toString(16).padStart(2, "0")).join("");
}

export function paletteFor(colors: BrandColors, theme: PosterTheme): Palette {
  const { primary, accent } = colors;
  const light = colors.light ?? mix(primary, "#ffffff", 0.94);
  switch (theme) {
    case "light":
      return {
        bg: light, fg: primary, accent, glow: [rgba(accent, 0.22), rgba(primary, 0.12)],
        tagBg: "#ffffff", tagFg: accent, tagLine: accent,
        markBg: primary, markFg: readableOn(primary, "#111111"),
        bar: primary, barFg: readableOn(primary, "#111111"), logo: "onLight",
      };
    case "accent": {
      const fg = readableOn(accent, primary);
      return {
        bg: accent, fg, accent: fg === "#ffffff" ? primary : "#ffffff", glow: [rgba("#ffffff", 0.3), rgba(primary, 0.3)],
        tagBg: primary, tagFg: readableOn(primary, "#111111"), tagLine: "",
        markBg: fg, markFg: accent,
        bar: primary, barFg: readableOn(primary, "#111111"), logo: "plate",
      };
    }
    default:
      return {
        bg: primary, fg: readableOn(primary, "#111111"), accent, glow: [rgba(accent, 0.25), rgba(accent, 0.18)],
        tagBg: "rgba(255,255,255,.12)", tagFg: accent, tagLine: rgba(accent, 0.5),
        markBg: accent, markFg: readableOn(accent, primary),
        bar: accent, barFg: readableOn(accent, primary), logo: "onDark",
      };
  }
}
