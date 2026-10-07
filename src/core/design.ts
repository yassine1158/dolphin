// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
/**
 * Poster design options and the validation of posts that come back from storage or from the UI.
 * Pure: no DOM.
 */
import { DolphinError } from "./errors.js";
import { MAX_POINTS, cleanHashtag } from "./schema.js";
import type { PointStyle, Post, PostStatus, PosterDesign, PosterFormat, PosterLayout, PosterTheme } from "./types.js";

export const POSTER_SIZES: Record<PosterFormat, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};
export const FORMATS = Object.keys(POSTER_SIZES) as PosterFormat[];
export const LAYOUTS: readonly PosterLayout[] = ["classic", "centered", "minimal"];
const THEMES: readonly PosterTheme[] = ["dark", "light", "accent"];
const STYLES: readonly PointStyle[] = ["checks", "steps"];
const STATUSES: readonly PostStatus[] = ["draft", "scheduled", "published", "failed"];

/** A background photo is a JPEG, PNG or WebP data URL of at most ~1.5 MB. */
export const MAX_PHOTO_CHARS = 2_000_000;
const PHOTO = /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i;

export const sizeOf = (design?: PosterDesign): { width: number; height: number } =>
  POSTER_SIZES[design?.format ?? "portrait"] ?? POSTER_SIZES.portrait;

/** Keeps only valid design fields; throws on a value that cannot be used. */
export function sanitizeDesign(input: unknown): PosterDesign {
  if (input === undefined || input === null) return {};
  if (typeof input !== "object" || Array.isArray(input)) throw new DolphinError("invalid_request", "design must be an object.");
  const d = input as Record<string, unknown>;
  const out: PosterDesign = {};
  if (d.format !== undefined) {
    if (!FORMATS.includes(d.format as PosterFormat)) throw new DolphinError("invalid_request", `design.format must be one of ${FORMATS.join(", ")}.`);
    out.format = d.format as PosterFormat;
  }
  if (d.layout !== undefined) {
    if (!LAYOUTS.includes(d.layout as PosterLayout)) throw new DolphinError("invalid_request", `design.layout must be one of ${LAYOUTS.join(", ")}.`);
    out.layout = d.layout as PosterLayout;
  }
  if (d.photo !== undefined && d.photo !== "") {
    if (typeof d.photo !== "string" || d.photo.length > MAX_PHOTO_CHARS || !PHOTO.test(d.photo)) {
      throw new DolphinError("invalid_request", "design.photo must be a JPEG, PNG or WebP image of at most 1.5 MB.");
    }
    out.photo = d.photo;
  }
  if (d.overlay !== undefined) {
    const o = Number(d.overlay);
    if (!Number.isFinite(o)) throw new DolphinError("invalid_request", "design.overlay must be a number.");
    out.overlay = Math.min(0.9, Math.max(0, o));
  }
  if (d.hideLogo !== undefined) out.hideLogo = d.hideLogo === true;
  return out;
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const isDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(new Date(v).getTime());

/** A link printed in a caption: http(s) only. */
export function safeLink(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href.slice(0, 1000) : undefined;
  } catch { return undefined; }
}

/**
 * Posts read back from storage can be old, partial or edited by hand: keep what is valid,
 * drop what is not, never throw. Returns null for an entry that is not a post at all.
 */
export function sanitizePost(input: unknown): Post | null {
  if (!input || typeof input !== "object") return null;
  const p = input as Record<string, unknown>;
  if (typeof p.id !== "string" || !p.id || p.id.length > 100) return null;
  const now = new Date().toISOString();
  const post: Post = {
    id: p.id,
    createdAt: isDate(p.createdAt) ? p.createdAt : now,
    scheduledAt: isDate(p.scheduledAt) ? p.scheduledAt : now,
    status: STATUSES.includes(p.status as PostStatus) ? (p.status as PostStatus) : "draft",
    tag: str(p.tag, 40),
    title: str(p.title, 120),
    subtitle: str(p.subtitle, 160),
    points: Array.isArray(p.points) ? p.points.filter((x): x is string => typeof x === "string").map(x => x.slice(0, 120)).slice(0, MAX_POINTS) : [],
    style: STYLES.includes(p.style as PointStyle) ? (p.style as PointStyle) : "checks",
    theme: THEMES.includes(p.theme as PosterTheme) ? (p.theme as PosterTheme) : "dark",
    caption: str(p.caption, 2200),
    hashtags: Array.isArray(p.hashtags) ? p.hashtags.filter((x): x is string => typeof x === "string").map(cleanHashtag).filter(Boolean).slice(0, 10) : [],
  };
  if (typeof p.externalId === "string") post.externalId = p.externalId.slice(0, 200);
  if (typeof p.error === "string") post.error = p.error.slice(0, 500);
  if (typeof p.errorCode === "string") post.errorCode = p.errorCode as Post["errorCode"];
  if (typeof p.campaign === "string" && p.campaign.trim()) post.campaign = p.campaign.trim().slice(0, 80);
  const link = safeLink(p.link);
  if (link) post.link = link;
  try {
    const design = sanitizeDesign(p.design);
    if (Object.keys(design).length) post.design = design;
  } catch { /* a broken design falls back to the default look */ }
  return post;
}
