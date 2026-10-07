// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
import { DolphinError } from "./errors.js";
import { MAX_POSTS } from "./schema.js";
import type { BrandProfile, GenerateRequest, Lang, Product, SiteSnapshot } from "./types.js";

const LANGS: readonly Lang[] = ["fr", "en", "ar"];
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const fail = (msg: string): never => { throw new DolphinError("invalid_request", msg); };
const text = (v: unknown, field: string, max: number, required = false): string | undefined => {
  if (v === undefined || v === null || v === "") return required ? fail(`${field} is required.`) : undefined;
  if (typeof v !== "string") return fail(`${field} must be a string.`);
  if (v.length > max) return fail(`${field} is longer than ${max} characters.`);
  return v.trim();
};
const list = (v: unknown, field: string, maxItems: number, maxLen: number): string[] | undefined => {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > maxItems) return fail(`${field} must be a list of at most ${maxItems} items.`);
  return v.map((x, i) => text(x, `${field}[${i}]`, maxLen, true)!);
};
const obj = (v: unknown, field: string): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(`${field} must be an object.`);

/** A logo is a URL, or an uploaded image kept as a data URL (at most ~700 KB). */
const logo = (v: unknown, field: string): string | undefined => {
  if (typeof v === "string" && v.startsWith("data:")) {
    if (!/^data:image\/(png|jpeg|webp|svg\+xml)[;,]/.test(v)) fail(`${field} must be a PNG, JPEG, WebP or SVG image.`);
    return text(v, field, 1_000_000);
  }
  return text(v, field, 500);
};

/** Validates a brand profile coming from configuration or from the network. */
export function validateBrand(input: unknown): BrandProfile {
  const b = obj(input, "brand");
  const colors = obj(b.colors, "brand.colors");
  const contact = obj(b.contact ?? {}, "brand.contact");
  const rules = b.rules === undefined ? undefined : obj(b.rules, "brand.rules");
  if (!Array.isArray(b.products) || b.products.length > 50) fail("brand.products must be a list of at most 50 products.");
  const language = (b.language ?? "fr") as Lang;
  if (!LANGS.includes(language)) fail(`brand.language must be one of ${LANGS.join(", ")}.`);
  const color = (v: unknown, f: string, required: boolean) => {
    const c = text(v, f, 7, required);
    if (c && !HEX.test(c)) fail(`${f} must be a hex color like #0b3f2f.`);
    return c;
  };
  const footer = list(b.footerLines, "brand.footerLines", 2, 60);

  const brand: BrandProfile = {
    id: text(b.id, "brand.id", 64, true)!,
    name: text(b.name, "brand.name", 80, true)!,
    language,
    contact: {},
    products: (b.products as unknown[]).map((raw, i): Product => {
      const p = obj(raw, `brand.products[${i}]`);
      if (p.status !== "available" && p.status !== "soon") fail(`brand.products[${i}].status must be "available" or "soon".`);
      const details = text(p.details, `brand.products[${i}].details`, 600);
      return { name: text(p.name, `brand.products[${i}].name`, 100, true)!, status: p.status as Product["status"], ...(details ? { details } : {}) };
    }),
    colors: { primary: color(colors.primary, "brand.colors.primary", true)!, accent: color(colors.accent, "brand.colors.accent", true)! },
  };
  const opt = <K extends keyof BrandProfile>(k: K, v: BrandProfile[K] | undefined) => { if (v !== undefined) brand[k] = v; };
  opt("fullName", text(b.fullName, "brand.fullName", 120));
  opt("location", text(b.location, "brand.location", 120));
  opt("audience", text(b.audience, "brand.audience", 200));
  opt("logoUrl", logo(b.logoUrl, "brand.logoUrl"));
  opt("logoOnDarkUrl", logo(b.logoOnDarkUrl, "brand.logoOnDarkUrl"));
  if (footer?.length) brand.footerLines = [footer[0]!, footer[1]];
  const light = color(colors.light, "brand.colors.light", false);
  if (light) brand.colors.light = light;
  for (const k of ["whatsapp", "phone", "website", "callToAction"] as const) {
    const v = text(contact[k], `brand.contact.${k}`, 120);
    if (v) brand.contact[k] = v;
  }
  if (rules) {
    brand.rules = {};
    if (typeof rules.hidePrices === "boolean") brand.rules.hidePrices = rules.hidePrices;
    const never = list(rules.neverMention, "brand.rules.neverMention", 20, 200);
    const extra = list(rules.extra, "brand.rules.extra", 20, 300);
    if (never) brand.rules.neverMention = never;
    if (extra) brand.rules.extra = extra;
  }
  return brand;
}

export function validateGenerateRequest(input: unknown): GenerateRequest {
  const r = obj(input, "request");
  const count = r.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > MAX_POSTS) fail(`request.count must be an integer from 1 to ${MAX_POSTS}.`);
  const req: GenerateRequest = { count: count as number };
  const subject = text(r.subject, "request.subject", 200);
  const tone = text(r.tone, "request.tone", 100);
  const notes = text(r.notes, "request.notes", 1000);
  const avoid = list(r.avoidTitles, "request.avoidTitles", 30, 160);
  if (subject) req.subject = subject;
  if (tone) req.tone = tone;
  if (notes) req.notes = notes;
  if (avoid) req.avoidTitles = avoid;
  return req;
}

/** Validates a page snapshot sent by a browser before it reaches the model. */
export function validateSnapshot(input: unknown): SiteSnapshot {
  const v = obj(input, "snapshot");
  const snap: SiteSnapshot = {
    url: text(v.url, "snapshot.url", 500, true)!,
    headings: list(v.headings, "snapshot.headings", 40, 200) ?? [],
    text: text(v.text, "snapshot.text", 8000) ?? "",
    phones: list(v.phones, "snapshot.phones", 10, 40) ?? [],
    whatsapp: list(v.whatsapp, "snapshot.whatsapp", 10, 40) ?? [],
    emails: list(v.emails, "snapshot.emails", 10, 120) ?? [],
    logoCandidates: list(v.logoCandidates, "snapshot.logoCandidates", 10, 1000) ?? [],
    structured: {},
  };
  for (const k of ["lang", "title", "description", "siteName", "themeColor"] as const) {
    const t = text(v[k], `snapshot.${k}`, 400);
    if (t) snap[k] = t;
  }
  const st = v.structured === undefined ? {} : obj(v.structured, "snapshot.structured");
  for (const [k, val] of Object.entries(st).slice(0, 20)) {
    const t = text(val, `snapshot.structured.${k}`, 400);
    if (t) snap.structured[k.slice(0, 40)] = t;
  }
  return snap;
}
