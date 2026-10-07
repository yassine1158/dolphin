// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
/** Markup of the "Your website" and "Post ideas" cards. Pure functions: state in, HTML out. */
import type { PeakReport } from "../core/peak.js";
import type { BrandProfile, PostIdea } from "../core/types.js";
import type { Messages } from "./i18n.js";

export const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export interface SiteCardState {
  t: Messages;
  brand: BrandProfile;
  locked: boolean;
  saved: boolean;
  draft: BrandProfile | null;
  logoCandidates: string[];
  siteUrl: string;
  busy: boolean;
  canAnalyze: boolean;
}

export function siteCard(s: SiteCardState): string {
  const { t } = s;
  if (s.locked) return "";
  if (s.draft) return editor(s, s.draft);
  if (s.saved) {
    const available = s.brand.products.filter(p => p.status === "available").length;
    return `<div class="card"><h3>${esc(t.site)}</h3><div class="profile-sum">
      ${s.brand.logoUrl ? `<img class="logo-thumb" src="${esc(s.brand.logoUrl)}" alt="">` : ""}
      <div><strong>${esc(s.brand.name)}</strong><p class="hint">${esc(t.summary.replace("{n}", String(s.brand.products.length)).replace("{a}", String(available)))}</p></div></div>
      <div class="row"><button data-act="edit-profile">${esc(t.editProfile)}</button>
      <button data-act="analyze"${s.busy || !s.canAnalyze ? " disabled" : ""}>${esc(s.busy ? t.analyzing : t.reanalyze)}</button></div></div>`;
  }
  return `<div class="card"><h3>${esc(t.site)}</h3><p class="hint">${esc(t.siteIntro)}</p>
    <label><span>${esc(t.siteUrl)}</span><input data-site-url value="${esc(s.siteUrl)}" inputmode="url"></label>
    <div class="row"><button class="accent" data-act="analyze"${s.busy || !s.canAnalyze ? " disabled" : ""}>${esc(s.busy ? t.analyzing : "✦ " + t.analyze)}</button></div>
    ${s.canAnalyze ? "" : `<p class="hint">${esc(t.keyMissing)}</p>`}</div>`;
}

function editor(s: SiteCardState, d: BrandProfile): string {
  const { t } = s;
  const f = (path: string, label: string, value: unknown, attrs = "") => `<label><span>${esc(label)}</span><input data-b="${path}" value="${esc(value)}"${attrs}></label>`;
  const products = d.products.map((p, i) => `<div class="product">
      <input data-b="products.${i}.name" value="${esc(p.name)}" aria-label="${esc(t.productName)}" placeholder="${esc(t.productName)}">
      <select data-b="products.${i}.status" aria-label="${esc(t.products)}"><option value="available"${p.status === "available" ? " selected" : ""}>${esc(t.pAvailable)}</option><option value="soon"${p.status === "soon" ? " selected" : ""}>${esc(t.pSoon)}</option></select>
      <button class="danger" data-act="del-product" data-i="${i}" aria-label="${esc(t.remove)}">✕</button>
      <input class="wide" data-b="products.${i}.details" value="${esc(p.details)}" placeholder="${esc(t.details)}" aria-label="${esc(t.details)}"></div>`).join("");
  const candidates = s.logoCandidates.slice(0, 6).map((u, i) =>
    `<button class="cand" data-act="pick-logo" data-i="${i}" title="${esc(u)}"><img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join("");
  return `<div class="card"><h3>${esc(t.site)}</h3><p class="hint">${esc(t.proposed)}</p>
    <div class="grid">${f("name", t.bName, d.name)}${f("fullName", t.bFullName, d.fullName)}${f("audience", t.bAudience, d.audience)}${f("location", t.bLocation, d.location)}
    ${f("contact.whatsapp", t.bWhatsapp, d.contact.whatsapp, ' inputmode="tel"')}${f("contact.phone", t.bPhone, d.contact.phone, ' inputmode="tel"')}
    ${f("contact.website", t.bWebsite, d.contact.website, ' inputmode="url"')}${f("contact.callToAction", t.bCta, d.contact.callToAction)}</div>
    <h4>${esc(t.products)}</h4><div class="products">${products}</div>
    <button data-act="add-product">${esc(t.addProduct)}</button>
    <h4>${esc(t.logo)}</h4>
    <div class="logo-row"><div class="logo-preview">${d.logoUrl ? `<img src="${esc(d.logoUrl)}" alt="${esc(t.logo)}">` : `<span class="hint">${esc(t.noLogoFound)}</span>`}</div>
      <div><p class="hint">${esc(t.logoHint)}</p><div class="row">${candidates}
        <label class="upload"><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-upload><span>${esc(t.uploadLogo)}</span></label>
        ${d.logoUrl ? `<button class="link" data-act="no-logo">${esc(t.noLogo)}</button>` : ""}</div></div></div>
    <h4>${esc(t.colorsTitle)}</h4>
    <div class="row colors"><label><span>${esc(t.primaryColor)}</span><input type="color" data-b="colors.primary" value="${esc(d.colors.primary)}"></label>
      <label><span>${esc(t.accentColor)}</span><input type="color" data-b="colors.accent" value="${esc(d.colors.accent)}"></label></div>
    <div class="row"><button class="primary" data-act="save-profile">${esc(t.saveProfile)}</button>${s.saved ? `<button data-act="cancel-profile">${esc(t.cancel)}</button>` : ""}</div></div>`;
}

export function ideasCard(t: Messages, ideas: readonly PostIdea[], busy: boolean, canAnalyze: boolean, canWrite: boolean): string {
  const list = ideas.map((idea, i) => `<li class="idea"><div><strong>${esc(idea.title)}</strong>${idea.product ? ` <span class="pill">${esc(idea.product)}</span>` : ""}
      <p>${esc(idea.angle)}</p><p class="hint">${esc(idea.why)}</p></div>
      <button class="accent" data-act="write-idea" data-i="${i}"${busy || !canWrite ? " disabled" : ""}>${esc(t.writeThis)}</button></li>`).join("");
  return `<div class="card"><h3>${esc(t.ideas)}</h3>${ideas.length ? `<ul class="ideas">${list}</ul>` : `<p class="hint">${esc(t.noIdeas)}</p>`}
    <div class="row"><button data-act="suggest"${busy || !canAnalyze ? " disabled" : ""}>${esc(busy ? t.suggesting : "✦ " + t.suggest)}</button></div></div>`;
}

/** Sequential scale (one hue, light to dark) for the engagement heat map. */
const HEAT = ["#cde2fb", "#9ec5f4", "#5598e7", "#256abf", "#104281"];
const BLOCKS = [6, 9, 12, 15, 18, 21]; // 3-hour columns, 6 h to midnight

export function peakCard(t: Messages, report: PeakReport | null, busy: boolean): string {
  const hour = (h: number) => t.hourShort.replace("{h}", String(h));
  let body = `<p class="hint">${esc(t.peakIntro)}</p>`;
  if (report) {
    const cell = (d: number, from: number) => Math.max(...report.grid[d]!.slice(from, from + 3));
    const rows = t.days.map((day, d) => `<div class="hm-row"><span class="hm-day">${esc(day.slice(0, 3))}</span>${BLOCKS.map(from => {
      const v = cell(d, from), step = Math.min(HEAT.length - 1, Math.floor(v * HEAT.length));
      const label = `${day} ${hour(from)}–${hour(from + 3)} : ${Math.round(v * 100)} %`;
      return `<span class="hm-cell" style="background:${HEAT[step]}" title="${esc(label)}" aria-label="${esc(label)}" role="img"></span>`;
    }).join("")}</div>`).join("");
    body += `<p class="state ${report.source === "default" ? "missing" : "ok"}">${esc(({ page: t.peakFromPage, import: t.peakFromImport, mixed: t.peakMixed, default: t.peakDefault }[report.source] ?? t.peakDefault).replace("{n}", String(report.samples)))}</p>
      <div class="peaks"><div><h4>${esc(t.peakBest)}</h4><ol class="best">${report.best.map(b => `<li><strong>${esc(t.days[b.day])}</strong> · ${esc(hour(b.hour))}</li>`).join("")}</ol></div>
      <div class="hm" role="group" aria-label="${esc(t.peakTitle)}"><div class="hm-row hm-head"><span class="hm-day"></span>${BLOCKS.map(h => `<span>${esc(hour(h))}</span>`).join("")}</div>${rows}
      <div class="hm-legend"><span>${esc(t.peakLess)}</span>${HEAT.map(c => `<i style="background:${c}"></i>`).join("")}<span>${esc(t.peakMore)}</span></div></div></div>`;
  }
  return `<div class="card"><h3>${esc(t.peakTitle)}</h3>${body}
    <div class="row"><button data-act="peaks"${busy ? " disabled" : ""}>${esc(busy ? t.peakBusy : report ? t.peakRefresh : "⏱ " + t.peakAnalyze)}</button></div></div>`;
}

export const PROFILE_STYLES = /* css */ `
.peaks{display:grid;grid-template-columns:minmax(160px,220px) minmax(0,1fr);gap:20px;align-items:start;margin-bottom:12px}
.best{margin:0;padding-inline-start:1.2em;display:grid;gap:4px}
.hm{display:grid;gap:2px;font-size:.75rem;color:var(--d-muted)}
.hm-row{display:grid;grid-template-columns:44px repeat(6,minmax(0,1fr));gap:2px;align-items:center}
.hm-head span{text-align:center}
.hm-cell{height:22px;border-radius:4px}
.hm-legend{display:flex;align-items:center;gap:2px;margin-top:6px;justify-content:flex-end}
.hm-legend i{width:18px;height:10px;border-radius:2px}
.hm-legend span{margin:0 6px}
@container (max-width:720px){.peaks{grid-template-columns:1fr}}
.card h4{margin:16px 0 8px;font-size:.92rem;color:var(--d-primary)}
.profile-sum{display:flex;gap:14px;align-items:center;margin-bottom:12px}
.profile-sum p{margin:2px 0 0}
.logo-thumb{width:56px;height:56px;object-fit:contain;border-radius:10px;background:#fff;border:1px solid var(--d-line);padding:4px}
.products{display:grid;gap:10px;margin-bottom:10px}
.product{display:grid;grid-template-columns:minmax(0,1fr) 150px auto;gap:8px;align-items:center;padding:10px;border:1px dashed var(--d-line);border-radius:10px}
.product .wide{grid-column:1 / -1}
.logo-row{display:grid;grid-template-columns:160px minmax(0,1fr);gap:14px;align-items:start}
.logo-preview{height:120px;border-radius:12px;display:grid;place-items:center;padding:10px;background:repeating-conic-gradient(#eef1ef 0 25%,#fff 0 50%) 0 0/16px 16px;border:1px solid var(--d-line)}
.logo-preview img{max-width:100%;max-height:100px;object-fit:contain}
.cand{width:56px;height:56px;padding:4px;background:#fff;border:1.5px solid var(--d-line)}
.cand img{width:100%;height:100%;object-fit:contain}
.upload{display:inline-flex;margin:0;cursor:pointer}
.upload input{position:absolute;width:1px;height:1px;opacity:0}
.upload span{font:600 .9rem var(--d-font);border-radius:10px;padding:9px 14px;background:var(--d-primary);color:#fff}
.upload input:focus-visible+span{outline:3px solid color-mix(in srgb,var(--d-accent) 55%,transparent)}
.colors label{margin:0}.colors input[type=color]{width:72px;height:40px;padding:3px}
.ideas{list-style:none;margin:0 0 12px;padding:0;display:grid;gap:10px}
.idea{display:flex;gap:12px;justify-content:space-between;align-items:center;border:1px solid var(--d-line);border-radius:12px;padding:12px 14px}
.idea p{margin:4px 0 0}
@container (max-width:720px){.product{grid-template-columns:1fr auto}.product select{grid-column:1}.logo-row{grid-template-columns:1fr}.idea{flex-direction:column;align-items:flex-start}}
`;
