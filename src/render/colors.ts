// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
/**
 * Brand colors from a logo: a dark color for backgrounds and a vivid accent.
 * `pickBrandColors` is pure (pixel array in, colors out); `colorsFromImage` samples an image in the browser.
 */
import type { BrandColors } from "../core/types.js";
import { contrast, luminance } from "./theme.js";

const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");

function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

/** Darkens a color until white text reads well on it (contrast ≥ 7). */
function deepen(color: string): string {
  let [r, g, b] = [1, 3, 5].map(i => Number.parseInt(color.slice(i, i + 2), 16)) as [number, number, number];
  for (let i = 0; i < 20 && contrast(hex(r, g, b), "#ffffff") < 7; i++) { r *= 0.88; g *= 0.88; b *= 0.88; }
  return hex(r, g, b);
}

export const DEFAULT_COLORS: BrandColors = { primary: "#0b3f2f", accent: "#f3811d" };

export function pickBrandColors(pixels: ArrayLike<number>, fallback: BrandColors = DEFAULT_COLORS): BrandColors {
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const [r, g, b, a] = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, pixels[i + 3]!];
    if (a < 128) continue;
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const colors = [...buckets.values()].map(e => {
    const [r, g, b] = [e.r / e.n, e.g / e.n, e.b / e.n];
    const [h, s, l] = hsl(r, g, b);
    return { n: e.n, hex: hex(r, g, b), h, s, l };
  }).filter(c => c.l < 0.95 && c.l > 0.04); // ignore white and black backgrounds
  if (!colors.length) return fallback;

  const vivid = colors.filter(c => c.s > 0.35).sort((a, b) => b.n * b.s - a.n * a.s);
  const darkish = colors.filter(c => luminance(c.hex) < 0.2 && c.s > 0.12).sort((a, b) => b.n - a.n);
  let primary = darkish[0];
  // an accent stands out from the primary by hue, or by being much brighter (brown and yellow)
  const distinct = (c: (typeof colors)[number]) => !primary || c !== primary && (
    Math.min(Math.abs(c.h - primary.h), 360 - Math.abs(c.h - primary.h)) > 25 || luminance(c.hex) - luminance(primary.hex) > 0.3);
  const accent = vivid.find(c => luminance(c.hex) > 0.15 && distinct(c)) ?? vivid.find(distinct);
  if (!primary) primary = vivid.find(c => c !== accent) ?? accent;
  if (!primary || !accent) return fallback;
  if (primary === accent) return { primary: deepen(primary.hex), accent: fallback.accent };
  return { primary: deepen(primary.hex), accent: accent.hex };
}

/** Samples a loaded image (must be same-origin, CORS-enabled or a data URL). */
export function colorsFromImage(img: CanvasImageSource, fallback?: BrandColors): BrandColors {
  const canvas = document.createElement("canvas");
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return fallback ?? DEFAULT_COLORS;
  ctx.drawImage(img, 0, 0, 64, 64);
  try { return pickBrandColors(ctx.getImageData(0, 0, 64, 64).data, fallback); }
  catch { return fallback ?? DEFAULT_COLORS; } // tainted canvas: logo without CORS
}
