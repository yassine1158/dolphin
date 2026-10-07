// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
/**
 * Reads a web page (DOM) into a SiteSnapshot. Works on the live document or on HTML
 * fetched and parsed with DOMParser. No network access except `discoverSite`.
 */
import { DolphinError } from "../core/errors.js";
import type { SiteSnapshot } from "../core/types.js";

const MAX_TEXT = 6000;
const clean = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim();
const uniq = <T>(a: T[]) => [...new Set(a)];

function abs(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, base);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "data:" ? u.href : null;
  } catch { return null; }
}

/** schema.org nodes of a business kind, including inside @graph. */
function businessNodes(doc: Document): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const kinds = /Organization|LocalBusiness|Store|Restaurant|Bakery|Shop|Corporation|Brand|Farm|Service/i;
  const visit = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    const type = ([] as unknown[]).concat(o["@type"] ?? []).join(" ");
    if (kinds.test(type)) out.push(o);
    if (o["@graph"]) visit(o["@graph"]);
  };
  doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    try { visit(JSON.parse(s.textContent ?? "")); } catch { /* invalid JSON-LD is ignored */ }
  });
  return out;
}

const str = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.url === "string") return o.url;
    return ["streetAddress", "addressLocality", "addressRegion", "addressCountry"].map(k => (typeof o[k] === "string" ? o[k] : "")).filter(Boolean).join(", ");
  }
  return "";
};

export function snapshotFromDocument(doc: Document, url: string): SiteSnapshot {
  const meta = (sel: string) => clean(doc.querySelector(sel)?.getAttribute("content"));
  const nodes = businessNodes(doc);
  const structured: Record<string, string> = {};
  for (const n of nodes) {
    for (const k of ["name", "legalName", "description", "telephone", "email", "address", "logo", "url"]) {
      const v = clean(str(n[k]));
      if (v && !structured[k]) structured[k] = v.slice(0, 300);
    }
  }

  // logo candidates, best first
  const logos: (string | null)[] = [];
  if (structured.logo) logos.push(abs(structured.logo, url));
  // "logo" in the alt text, any case (the `i` selector flag is not supported by every DOM implementation)
  const LOGO_IMG = "header img, nav img, [class*=logo] img, img[class*=logo], img[id*=logo], img[src*=logo]";
  const imgs = [...doc.querySelectorAll<HTMLImageElement>(`${LOGO_IMG}, img[alt]`)].filter(img => /logo/i.test(img.alt) || img.matches(LOGO_IMG));
  imgs.forEach(img => logos.push(abs(img.getAttribute("src"), url)));
  logos.push(abs(meta('meta[property="og:logo"]'), url));
  const icons = [...doc.querySelectorAll<HTMLLinkElement>('link[rel~="apple-touch-icon"], link[rel~="icon"]')]
    .map(l => ({ href: abs(l.getAttribute("href"), url), size: Number.parseInt(l.getAttribute("sizes") ?? "", 10) || (/\.svg(\?|$)/i.test(l.getAttribute("href") ?? "") ? 512 : 32) }))
    .sort((a, b) => b.size - a.size);
  icons.forEach(i => logos.push(i.href));
  logos.push(abs(meta('meta[property="og:image"]'), url));

  const links = [...doc.querySelectorAll<HTMLAnchorElement>("a[href]")].map(a => a.getAttribute("href") ?? "");
  const phones = links.filter(h => h.startsWith("tel:")).map(h => decodeURIComponent(h.slice(4)).trim());
  if (structured.telephone) phones.unshift(structured.telephone);
  const whatsapp = links.flatMap(h => {
    const m = h.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|whatsapp:\/\/send\?phone=)\+?(\d{6,15})/i);
    return m ? ["+" + m[1]] : [];
  });
  const emails = links.filter(h => h.startsWith("mailto:")).map(h => decodeURIComponent(h.slice(7).split("?")[0] ?? "").trim());

  // visible text without scripts, styles and embedded widgets
  const body = doc.body?.cloneNode(true) as HTMLElement | undefined;
  body?.querySelectorAll("script, style, noscript, template, svg, iframe, dolphin-studio").forEach(n => n.remove());
  const headings = [...doc.querySelectorAll("h1, h2, h3")].map(h => clean(h.textContent)).filter(Boolean);

  const snap: SiteSnapshot = {
    url,
    headings: uniq(headings).slice(0, 30).map(h => h.slice(0, 160)),
    text: clean(body?.textContent).slice(0, MAX_TEXT),
    phones: uniq(phones).slice(0, 5),
    whatsapp: uniq(whatsapp).slice(0, 5),
    emails: uniq(emails).filter(Boolean).slice(0, 5),
    logoCandidates: uniq(logos.filter((l): l is string => !!l)).slice(0, 8),
    structured,
  };
  const set = (k: "lang" | "title" | "description" | "siteName" | "themeColor", v: string) => { if (v) snap[k] = v.slice(0, 300); };
  set("lang", clean(doc.documentElement.getAttribute("lang")));
  set("title", clean(doc.querySelector("title")?.textContent));
  set("description", meta('meta[name="description"]') || meta('meta[property="og:description"]'));
  set("siteName", meta('meta[property="og:site_name"]') || structured.name || "");
  set("themeColor", meta('meta[name="theme-color"]'));
  return snap;
}

/** Fetches a page (same origin, or a site that allows CORS) and reads it. Browser only. */
export async function discoverSite(url: string, f: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<SiteSnapshot> {
  const target = new URL(url, globalThis.location?.href).href;
  let html: string;
  try {
    const res = await f(target, { credentials: "same-origin" });
    if (!res.ok) throw new Error(String(res.status));
    html = await res.text();
  } catch {
    throw new DolphinError("network", `Cannot read ${target}. Use a page of this site, or one that allows CORS.`);
  }
  return snapshotFromDocument(new DOMParser().parseFromString(html, "text/html"), target);
}
