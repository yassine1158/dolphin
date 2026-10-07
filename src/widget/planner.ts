// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
/** Markup for the marketing manager (campaign fields, calendar) and the designer (poster controls). */
import { OBJECTIVES, calendarWeeks } from "../core/campaign.js";
import { FORMATS, LAYOUTS } from "../core/design.js";
import type { CampaignObjective, Lang, Post, PosterFormat, PosterLayout } from "../core/types.js";
import type { Messages } from "./i18n.js";
import { esc } from "./profile.js";

export interface CampaignPrefs {
  objective: CampaignObjective;
  campaign: string;
  audience: string;
  offer: string;
  link: string;
  format: PosterFormat;
  layout: PosterLayout;
}

export const DEFAULT_CAMPAIGN: CampaignPrefs = { objective: "engagement", campaign: "", audience: "", offer: "", link: "", format: "portrait", layout: "classic" };

const options = <K extends string>(keys: readonly K[], labels: Record<K, string>, value: string) =>
  keys.map(k => `<option value="${esc(k)}"${k === value ? " selected" : ""}>${esc(labels[k])}</option>`).join("");

/** Campaign block of the "Create with AI" card. Inputs carry data-pref="c.<field>". */
export function campaignFields(t: Messages, c: CampaignPrefs): string {
  const input = (k: keyof CampaignPrefs, label: string, ph: string, attrs = "") =>
    `<label><span>${esc(label)}</span><input data-pref="c.${k}" value="${esc(c[k])}" placeholder="${esc(ph)}"${attrs}></label>`;
  return `<details class="campaign" data-k="campaign"${c.campaign || c.offer || c.link ? " open" : ""}><summary>${esc(t.campaign)} · ${esc(t.design)}</summary>
    <div class="grid">
      <label><span>${esc(t.objective)}</span><select data-pref="c.objective">${options(OBJECTIVES, t.objectives, c.objective)}</select></label>
      ${input("campaign", t.campaignName, t.campaignPh, ' maxlength="80"')}
      ${input("audience", t.audienceFor, t.audiencePh, ' maxlength="200"')}
      ${input("offer", t.offer, t.offerPh, ' maxlength="500"')}
    </div>
    <label><span>${esc(t.link)}</span><em class="help">${esc(t.linkHelp)}</em><input data-pref="c.link" value="${esc(c.link)}" placeholder="https://" inputmode="url" maxlength="1000"></label>
    <div class="grid">
      <label><span>${esc(t.format)}</span><select data-pref="c.format">${options(FORMATS, t.formats, c.format)}</select></label>
      <label><span>${esc(t.layout)}</span><select data-pref="c.layout">${options(LAYOUTS, t.layouts, c.layout)}</select></label>
    </div></details>`;
}

/** Designer controls of one post. Inputs carry data-d="<postId>:<field>". */
export function designFields(t: Messages, p: Post, editable: boolean): string {
  const ro = editable ? "" : " disabled";
  const d = p.design ?? {};
  const id = esc(p.id);
  return `<details class="designer" data-k="design:${id}"><summary>${esc(t.design)} · ${esc(t.formats[d.format ?? "portrait"])} · ${esc(t.layouts[d.layout ?? "classic"])}</summary>
    <div class="grid">
      <label><span>${esc(t.format)}</span><select data-d="${id}:format"${ro}>${options(FORMATS, t.formats, d.format ?? "portrait")}</select></label>
      <label><span>${esc(t.layout)}</span><select data-d="${id}:layout"${ro}>${options(LAYOUTS, t.layouts, d.layout ?? "classic")}</select></label>
    </div>
    <div class="row photo-row">
      <label class="upload"><input type="file" accept="image/jpeg,image/png,image/webp" data-photo="${id}"${ro}><span>${esc(d.photo ? t.photo : t.addPhoto)}</span></label>
      ${d.photo && editable ? `<button class="link" data-act="no-photo" data-id="${id}">${esc(t.removePhoto)}</button>` : ""}
      <label class="check"><input type="checkbox" data-d="${id}:hideLogo"${d.hideLogo ? " checked" : ""}${ro}><span>${esc(t.hideLogo)}</span></label>
    </div>
    ${d.photo ? `<label><span>${esc(t.overlay)}</span><input type="range" min="0" max="0.9" step="0.05" data-d="${id}:overlay" value="${esc(d.overlay ?? 0.55)}"${ro}></label>` : ""}
    <div class="grid">
      <label><span>${esc(t.campaignName)}</span><input data-f="${id}:campaign" value="${esc(p.campaign)}" maxlength="80"${ro}></label>
      <label><span>${esc(t.link)}</span><input data-f="${id}:link" value="${esc(p.link)}" placeholder="https://" inputmode="url" maxlength="1000"${ro}></label>
    </div></details>`;
}

/** Four weeks from this week, Monday first; each post is a chip that opens the post card. */
export function calendarCard(t: Messages, lang: Lang, posts: readonly Post[], now: Date): string {
  if (!posts.length) return "";
  const days = calendarWeeks(posts, now, 4);
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const time = (iso: string) => new Date(iso).toLocaleTimeString(lang === "ar" ? "ar" : lang, { hour: "2-digit", minute: "2-digit" });
  const head = t.days.map(d => `<span class="cal-h">${esc(d.slice(0, 3))}</span>`).join("");
  const cells = days.map(d => {
    const [, m, day] = d.date.split("-");
    const chips = d.posts.map(p => `<button class="chip ${p.status}" data-act="goto" data-id="${esc(p.id)}" title="${esc(`${time(p.scheduledAt)} · ${p.title}`)}">
      <b>${esc(time(p.scheduledAt))}</b> ${esc(p.title)}</button>`).join("");
    return `<div class="cal-d${d.date === todayKey ? " today" : ""}${d.date < todayKey ? " past" : ""}"><span class="cal-n">${esc(`${Number(day)}/${Number(m)}`)}${d.date === todayKey ? ` · ${esc(t.today)}` : ""}</span>${chips}</div>`;
  }).join("");
  return `<div class="card"><h3>${esc(t.calendar)}</h3><p class="hint">${esc(t.calendarHint)}</p><div class="cal">${head}${cells}</div></div>`;
}

export const PLANNER_STYLES = /* css */ `
details.campaign,details.designer{border:1px dashed var(--d-line);border-radius:12px;padding:10px 12px;margin:4px 0 12px}
details>summary{cursor:pointer;font-weight:700;color:var(--d-primary);font-size:.92rem}
details[open]>summary{margin-bottom:10px}
.photo-row{margin-bottom:10px}.photo-row .check{margin:0}
input[type=range]{padding:0;accent-color:var(--d-primary)}
.cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.cal-h{font-size:.75rem;font-weight:700;color:var(--d-muted);text-align:center}
.cal-d{min-height:74px;border:1px solid var(--d-line);border-radius:8px;padding:4px;display:flex;flex-direction:column;gap:3px;background:#fff}
.cal-d.past{background:color-mix(in srgb,var(--d-line) 35%,#fff)}
.cal-d.today{border-color:var(--d-primary);box-shadow:inset 0 0 0 1px var(--d-primary)}
.cal-n{font-size:.72rem;color:var(--d-muted)}
.chip{font:600 .72rem var(--d-font);text-align:start;padding:3px 5px;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:color-mix(in srgb,var(--d-accent) 16%,#fff);color:var(--d-ink);border:0}
.chip.scheduled,.chip.published{background:color-mix(in srgb,var(--d-ok) 18%,#fff)}
.chip.failed{background:color-mix(in srgb,var(--d-danger) 15%,#fff)}
.chip b{font-weight:800}
article.flash{outline:3px solid var(--d-accent);outline-offset:2px}
@container (max-width:720px){.cal{grid-template-columns:repeat(7,minmax(0,1fr));gap:2px}.cal-d{min-height:56px;padding:2px}.chip b{display:none}}
`;
