// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
/** Logo helpers for the browser: load, keep as a data URL, read the brand colors. */
import type { BrandColors } from "../core/types.js";
import { DEFAULT_COLORS, colorsFromImage } from "../render/colors.js";

const MAX_SIDE = 512;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

/**
 * Re-encodes an image as a PNG data URL (at most 512 px). The poster canvas can then always be
 * exported, the logo travels with the brand profile, and the original site is not hit again.
 * Throws when the image is cross-origin without CORS (the canvas would be tainted).
 */
export function toDataUrl(img: HTMLImageElement): string {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const k = Math.min(1, MAX_SIDE / Math.max(w, h || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * k)); canvas.height = Math.max(1, Math.round(h * k));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

const fallbackColors = (themeColor?: string): BrandColors =>
  themeColor && /^#[0-9a-f]{6}$/i.test(themeColor) ? { primary: themeColor, accent: DEFAULT_COLORS.accent } : DEFAULT_COLORS;

/** First usable logo among the candidates (big enough, readable), with its colors. */
export async function chooseLogo(candidates: string[], themeColor?: string): Promise<{ logoUrl?: string; colors: BrandColors }> {
  for (const src of candidates) {
    try {
      const img = await loadImage(src);
      if ((img.naturalWidth || img.width) < 32) continue;
      const logoUrl = toDataUrl(img);
      return { logoUrl, colors: colorsFromImage(img, fallbackColors(themeColor)) };
    } catch { /* not reachable, or no CORS: try the next one */ }
  }
  return { colors: fallbackColors(themeColor) };
}

/** A logo chosen by the user from their device. */
export async function logoFromFile(file: File): Promise<{ logoUrl: string; colors: BrandColors }> {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw new Error("type");
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return { logoUrl: toDataUrl(img), colors: colorsFromImage(img) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
