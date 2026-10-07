// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
import { sizeOf } from "../core/design.js";
import type { BrandProfile, Post } from "../core/types.js";
import type { PosterRenderer } from "../ports/index.js";
import { paletteFor, rgba, type Palette } from "./theme.js";

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1350;

export interface PosterFonts {
  display: string;
  body: string;
}

export const DEFAULT_FONTS: PosterFonts = {
  display: '"Outfit", "Segoe UI", system-ui, sans-serif',
  body: '"Source Sans 3", "Segoe UI", system-ui, sans-serif',
};

export interface PosterAssets {
  logo?: CanvasImageSource | null;
  /** Background photo chosen by the designer (post.design.photo, already loaded). */
  photo?: CanvasImageSource | null;
  /** Draw the logo on a white plate (a dark logo on a dark background). */
  logoPlate?: boolean;
  fonts?: PosterFonts;
  /** Small label above the contact number. */
  contactLabel?: string;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const sizeOf2 = (img: CanvasImageSource): [number, number] => {
  const i = img as { naturalWidth?: number; naturalHeight?: number; width: number | SVGAnimatedLength; height: number | SVGAnimatedLength };
  const w = i.naturalWidth || (typeof i.width === "number" ? i.width : 0);
  const h = i.naturalHeight || (typeof i.height === "number" ? i.height : 0);
  return [w || 1, h || 1];
};

export function wrapText(ctx: Pick<Ctx, "measureText">, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of String(text || "").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** On a photo the text is always light, on a darkened image, whatever the theme. */
function photoPalette(T: Palette): Palette {
  return { ...T, fg: "#ffffff", tagBg: "rgba(0,0,0,.35)", tagFg: "#ffffff", tagLine: "rgba(255,255,255,.55)", logo: "plate" };
}

/** Draws `img` so it covers the whole rectangle (centered crop). */
function cover(ctx: Ctx, img: CanvasImageSource, W: number, H: number): void {
  const [iw, ih] = sizeOf2(img);
  const k = Math.max(W / iw, H / ih), w = iw * k, h = ih * k;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

/**
 * Draws a poster: 1080×1350 by default, 1080×1080 or 1080×1920 with `post.design.format`.
 * Content shrinks until it fits above the footer bar. Arabic posters are mirrored (right-to-left).
 */
export function drawPoster(ctx: Ctx, post: Post, brand: BrandProfile, assets: PosterAssets = {}): void {
  const { width: W, height: H } = sizeOf(post.design);
  const M = 80, BAR = 170, MAXW = W - 2 * M;
  const layout = post.design?.layout ?? "classic";
  const centered = layout === "centered";
  const F = assets.fonts ?? DEFAULT_FONTS;
  const photo = assets.photo ?? null;
  const base = paletteFor(brand.colors, post.theme);
  const T = photo ? photoPalette(base) : base;
  const rtl = brand.language === "ar";
  const x = (v: number, w = 0) => (rtl ? W - v - w : v); // mirror a left offset
  const start: CanvasTextAlign = centered ? "center" : rtl ? "right" : "left";
  const end: CanvasTextAlign = rtl ? "left" : "right";
  const tx0 = centered ? W / 2 : x(M); // where text lines start
  ctx.direction = rtl ? "rtl" : "ltr";

  // background
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  if (photo) {
    cover(ctx, photo, W, H);
    const k = post.design?.overlay ?? 0.55;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(0,0,0,${Math.min(0.95, k * 0.75)})`);
    g.addColorStop(0.45, `rgba(0,0,0,${k})`);
    g.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, k + 0.2)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = rgba(brand.colors.primary, 0.25); ctx.fillRect(0, 0, W, H);
  } else {
    const glow = (gx: number, gy: number, r: number, color: string) => {
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
      g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    };
    glow(x(W * 0.92), H * 0.08, 640, T.glow[0]);
    glow(x(0), H, 560, T.glow[1]);
  }

  // logo + tag
  const lh = 118;
  let lw = 0;
  if (assets.logo && !post.design?.hideLogo) {
    const [iw, ih] = sizeOf2(assets.logo);
    lw = Math.min(lh * iw / ih, 420);
    if (T.logo === "plate" || assets.logoPlate) { ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.roundRect(x(M - 20, lw + 40), 60, lw + 40, lh + 24, 26); ctx.fill(); }
    ctx.drawImage(assets.logo, x(M, lw), 72, lw, lh);
  }
  if (post.tag) {
    ctx.font = `700 26px ${F.display}`;
    const label = post.tag.toUpperCase();
    const tw = Math.min(ctx.measureText(label).width + 56, W - 2 * M - lw - 40);
    const tx = x(W - M - tw, tw), ty = 72 + lh / 2 - 30;
    ctx.fillStyle = T.tagBg; ctx.beginPath(); ctx.roundRect(tx, ty, tw, 60, 30); ctx.fill();
    if (T.tagLine) { ctx.strokeStyle = T.tagLine; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = T.tagFg; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, tx + tw / 2, ty + 31, tw - 40);
  }

  // content, scaled to fit (minimal: a bigger title and no points)
  const points = layout === "minimal" ? [] : post.points.filter(Boolean).slice(0, 6);
  const big = layout === "minimal" ? 1.3 : 1;
  const top = H >= 1800 ? 380 : H <= 1100 ? 250 : 290, bottom = H - BAR - (H >= 1800 ? 120 : 50);
  type Layout = { s: number; title: string[]; sub: string[]; pts: string[][]; rows: number[]; h: number };
  let L: Layout | undefined;
  for (let s = big; s >= 0.5; s -= 0.04) {
    ctx.font = `800 ${88 * s}px ${F.display}`; const title = wrapText(ctx, post.title, MAXW);
    ctx.font = `700 ${50 * Math.min(s, 1)}px ${F.display}`; const sub = wrapText(ctx, post.subtitle, MAXW);
    ctx.font = `700 ${40 * s}px ${F.body}`; const pts = points.map(t => wrapText(ctx, t, MAXW - 96 * s));
    const rows = pts.map(l => Math.max(68 * s, l.length * 48 * s));
    const h = title.length * 94 * s + (sub.length ? 20 * s + sub.length * 60 * Math.min(s, 1) : 0)
      + (rows.length ? 48 * s + rows.reduce((a, r) => a + r + 26 * s, 0) - 26 * s : 0);
    L = { s, title, sub, pts, rows, h };
    if (top + h <= bottom) break;
  }
  const { s, title, sub, pts, rows, h } = L!;
  let y = top + Math.max(0, (bottom - top - h) * (centered || layout === "minimal" ? 0.5 : 0.4));
  ctx.textAlign = start; ctx.textBaseline = "top";
  if (photo) { ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 18; }
  ctx.fillStyle = T.fg; ctx.font = `800 ${88 * s}px ${F.display}`;
  for (const l of title) { ctx.fillText(l, tx0, y); y += 94 * s; }
  if (sub.length) {
    y += 20 * s;
    ctx.fillStyle = T.accent; ctx.font = `700 ${50 * Math.min(s, 1)}px ${F.display}`;
    for (const l of sub) { ctx.fillText(l, tx0, y); y += 60 * Math.min(s, 1); }
  }
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
  if (rows.length) y += 48 * s;
  // centered: the points form one block (markers aligned), centered as a whole
  ctx.font = `700 ${40 * s}px ${F.body}`;
  const blockW = Math.max(0, ...pts.flat().map(l => ctx.measureText(l).width)) + 96 * s;
  const blockStart = centered ? Math.max(M, (W - blockW) / 2) : M;
  pts.forEach((lines, i) => {
    const r = 34 * s, rowH = rows[i]!, cy = y + rowH / 2;
    const cx = x(blockStart + r);
    ctx.fillStyle = T.markBg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = T.markFg; ctx.strokeStyle = T.markFg; ctx.textBaseline = "middle";
    if (post.style === "steps") {
      ctx.font = `800 ${34 * s}px ${F.display}`; ctx.textAlign = "center";
      ctx.fillText(String(i + 1), cx, cy + 2 * s);
    } else {
      // a check mark keeps its shape in right-to-left layouts
      ctx.lineWidth = 5 * s; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath();
      ctx.moveTo(cx - 14 * s, cy + s); ctx.lineTo(cx - 4 * s, cy + 11 * s); ctx.lineTo(cx + 15 * s, cy - 10 * s); ctx.stroke();
    }
    ctx.textAlign = rtl ? "right" : "left"; ctx.fillStyle = T.fg; ctx.font = `700 ${40 * s}px ${F.body}`;
    lines.forEach((l, j) => ctx.fillText(l, x(blockStart + 96 * s), cy + (j - (lines.length - 1) / 2) * 48 * s));
    y += rowH + 26 * s;
  });

  // footer bar: contact on one side, call to action on the other
  const by = H - BAR, cyb = by + BAR / 2;
  ctx.fillStyle = T.bar; ctx.fillRect(0, by, W, BAR);
  const contact = brand.contact.whatsapp ?? brand.contact.phone ?? brand.contact.website ?? "";
  const icx = x(M + 38);
  ctx.fillStyle = brand.contact.whatsapp ? "#25d366" : "rgba(255,255,255,.18)";
  ctx.beginPath(); ctx.arc(icx, cyb, 38, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(icx, cyb - 1, 19, Math.PI * 0.75, Math.PI * 2.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(icx - 14, cyb + 12); ctx.lineTo(icx - 20, cyb + 21); ctx.lineTo(icx - 8, cyb + 17); ctx.stroke();
  ctx.fillStyle = T.barFg; ctx.textBaseline = "alphabetic";

  // call to action first, so the contact gets whatever width is left
  const [l1, l2] = brand.footerLines ?? [brand.contact.callToAction ?? ""];
  ctx.font = `700 26px ${F.display}`;
  const ctaW = Math.min(380, Math.max(ctx.measureText(l1 ?? "").width, ctx.measureText(l2 ?? "").width));
  ctx.textAlign = end;
  if (l2) { ctx.fillText(l1, x(W - M), cyb - 6, 380); ctx.fillText(l2, x(W - M), cyb + 32, 380); } else if (l1) ctx.fillText(l1, x(W - M), cyb + 12, 380);

  ctx.textAlign = rtl ? "right" : "left";
  if (assets.contactLabel) { ctx.globalAlpha = 0.85; ctx.font = `700 24px ${F.body}`; ctx.fillText(assets.contactLabel.toUpperCase(), x(M + 98), cyb - 14); ctx.globalAlpha = 1; }
  const room = MAXW - 98 - (ctaW ? ctaW + 32 : 0);
  let size = 42;
  do { ctx.font = `800 ${size}px ${F.display}`; } while (ctx.measureText(contact).width > room && (size -= 2) > 22);
  ctx.direction = "ltr"; // phone numbers and URLs always read left to right
  ctx.textAlign = rtl ? "right" : "left";
  ctx.fillText(contact, x(M + 98), assets.contactLabel ? cyb + 30 : cyb + 15, room);
  ctx.direction = rtl ? "rtl" : "ltr";
}

/** Browser renderer: loads the logo once, waits for fonts, returns a PNG. */
export class CanvasPosterRenderer implements PosterRenderer {
  private readonly images = new Map<string, Promise<HTMLImageElement | null>>();
  constructor(private readonly options: { fonts?: PosterFonts; contactLabel?: string | ((brand: BrandProfile) => string | undefined) } = {}) {}

  private loadImage(url?: string, cache = true): Promise<HTMLImageElement | null> {
    if (!url) return Promise.resolve(null);
    let p = this.images.get(url);
    if (!p) {
      p = new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = "anonymous"; // keeps the canvas exportable; a logo without CORS is skipped
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
      // photos are big data URLs: keep only the last few in memory
      if (!cache && this.images.size > 12) this.images.delete(this.images.keys().next().value!);
      this.images.set(url, p);
    }
    return p;
  }

  async logoFor(post: Post, brand: BrandProfile): Promise<HTMLImageElement | null> {
    const variant = paletteFor(brand.colors, post.theme).logo;
    return this.loadImage(variant === "onDark" ? brand.logoOnDarkUrl ?? brand.logoUrl : brand.logoUrl);
  }

  async draw(canvas: HTMLCanvasElement, post: Post, brand: BrandProfile): Promise<void> {
    const fonts = this.options.fonts ?? DEFAULT_FONTS;
    await Promise.all([`800 80px ${fonts.display}`, `700 40px ${fonts.body}`].map(f => document.fonts?.load(f).catch(() => undefined)));
    const [logo, photo] = await Promise.all([this.logoFor(post, brand), this.loadImage(post.design?.photo, false)]);
    // no light version of the logo for dark posters: keep it readable on a white plate
    const logoPlate = paletteFor(brand.colors, post.theme).logo === "onDark" && !brand.logoOnDarkUrl;
    const { width, height } = sizeOf(post.design);
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available.");
    const label = typeof this.options.contactLabel === "function" ? this.options.contactLabel(brand) : this.options.contactLabel;
    drawPoster(ctx, post, brand, { logo, photo, logoPlate, fonts, ...(label ? { contactLabel: label } : {}) });
  }

  async render(post: Post, brand: BrandProfile): Promise<Blob> {
    return this.export(post, brand, "image/png");
  }

  /** PNG (lossless, for Facebook) or JPEG (smaller, for messaging apps and print shops). */
  async export(post: Post, brand: BrandProfile, type: "image/png" | "image/jpeg" = "image/png"): Promise<Blob> {
    const canvas = document.createElement("canvas");
    await this.draw(canvas, post, brand);
    return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Image export failed."))), type, 0.92));
  }
}
