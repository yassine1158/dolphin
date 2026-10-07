// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
/** Markup of the insights card (what the past posts say) and of the data import. State in, HTML out. */
import type { ImportedData } from "../app/studio.js";
import type { InsightsReport } from "../core/insights.js";
import type { Lang } from "../core/types.js";
import { fill, type Messages } from "./i18n.js";
import { esc } from "./profile.js";

/** One hue for magnitude (same blue as the heat map); the best bar takes the darkest step. */
const BAR = "#5598e7", BAR_BEST = "#104281";

export function insightsCard(t: Messages, lang: Lang, report: InsightsReport | null, imported: Readonly<ImportedData> | null, busy: boolean): string {
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar" : lang, { maximumFractionDigits: 1 });
  const hour = (h: number) => t.hourShort.replace("{h}", String(h));
  let body = `<p class="hint">${esc(t.insIntro)}</p>`;

  if (report && report.samples > 0) {
    const kpi = (label: string, value: string, extra = "") => `<div class="kpi"><span>${esc(label)}</span><strong${extra}>${esc(value)}</strong></div>`;
    const trend = report.trend === undefined ? "—" : `${report.trend > 0 ? "+" : ""}${nf.format(report.trend)} %`;
    body += `<div class="kpis">
      ${kpi(t.insPosts, nf.format(report.samples))}
      ${kpi(t.insAvg, nf.format(report.avgPerPost))}
      ${kpi(t.insRhythm, fill(t.insPerWeek, { n: nf.format(report.postsPerWeek) }))}
      ${kpi(t.insTrend, trend, report.trend === undefined ? "" : ` class="${report.trend >= 0 ? "up" : "down"}"`)}
      ${kpi(t.insConfidence, t.confidence[report.confidence], ` class="conf-${report.confidence}"`)}</div>`;

    // average engagement by day: horizontal bars, value printed at the end of each bar
    const maxDay = Math.max(...report.byDay.map(d => d.avg), 0);
    const dayRows = report.byDay.map((d, i) => {
      const w = maxDay > 0 ? Math.max(2, (d.avg / maxDay) * 100) : 0;
      const label = `${t.days[i]} : ${d.posts ? `${nf.format(d.avg)} (${d.posts})` : t.insNoPosts}`;
      return `<div class="bar-row" title="${esc(label)}"><span class="bar-label">${esc(t.days[i]!.slice(0, 3))}</span>
        <span class="bar-track">${d.posts ? `<i style="width:${w.toFixed(1)}%;background:${i === report.bestDay ? BAR_BEST : BAR}"></i>` : ""}</span>
        <span class="bar-val">${d.posts ? esc(nf.format(d.avg)) : "—"}</span></div>`;
    }).join("");

    // average engagement by posting hour: 24 thin columns, a label every 3 hours
    const maxHour = Math.max(...report.byHour.map(h => h.avg), 0);
    const best = report.bestBlock;
    const cols = report.byHour.map((h, i) => {
      const ht = maxHour > 0 && h.posts ? Math.max(4, (h.avg / maxHour) * 100) : 0;
      const inBest = best !== undefined && i >= best && i < best + 3;
      const label = `${hour(i)} : ${h.posts ? `${nf.format(h.avg)} (${h.posts})` : t.insNoPosts}`;
      return `<span class="col" title="${esc(label)}" aria-label="${esc(label)}" role="img"><i style="height:${ht.toFixed(1)}%;background:${inBest ? BAR_BEST : BAR}"></i></span>`;
    }).join("");
    const axis = report.byHour.map((_, i) => `<span>${i % 3 === 0 ? esc(String(i)) : ""}</span>`).join("");

    const fmtDate = (iso: string) => new Date(iso).toLocaleString(lang === "ar" ? "ar" : lang, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const top = report.top.map(p => `<li><div><strong>${esc(fmtDate(p.createdTime))}</strong> · ${esc(fill(t.insScore, { n: nf.format(p.score) }))}
      ${p.message ? `<p>${esc(p.message)}</p>` : ""}</div>${p.url && /^https:\/\//.test(p.url) ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(t.insOpen)}</a>` : ""}</li>`).join("");

    const advice: string[] = [];
    if (report.confidence === "low") advice.push(t.adviceLow);
    if (report.postsPerWeek < 3) advice.push(t.adviceFew);
    if (report.trend !== undefined && report.trend <= -15) advice.push(t.adviceDown);
    if (report.trend !== undefined && report.trend >= 15) advice.push(t.adviceUp);
    if (report.untestedDays.length && report.untestedDays.length < 7) advice.push(fill(t.insUntested, { days: report.untestedDays.map(d => t.days[d]).join(", ") }));

    body += `<div class="ins">
      <div><h4>${esc(t.insByDay)}</h4><div class="bars">${dayRows}</div>
        ${report.bestDay !== undefined ? `<p class="hint">${esc(t.insBestDay)} : <strong>${esc(t.days[report.bestDay])}</strong></p>` : ""}</div>
      <div><h4>${esc(t.insByHour)}</h4><div class="cols" role="group" aria-label="${esc(t.insByHour)}">${cols}</div><div class="axis" aria-hidden="true">${axis}</div>
        ${best !== undefined ? `<p class="hint">${esc(t.insBestBlock)} : <strong>${esc(hour(best))} – ${esc(hour(best + 3))}</strong></p>` : ""}</div></div>
      ${advice.length ? `<ul class="advice">${advice.map(a => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
      ${top ? `<h4>${esc(t.insTop)}</h4><ol class="top">${top}</ol>` : ""}`;
  }

  const info = imported
    ? `<p class="state ok">${esc(fill(t.importInfo, { file: imported.fileName ?? "CSV", n: imported.samples.length, kind: t.importKinds[imported.kind] }))}</p>
       ${imported.undated ? `<p class="hint">${esc(t.importUndated)}</p>` : ""}`
    : "";
  body += `<h4>${esc(t.importTitle)}</h4><p class="hint">${esc(t.importHelp)}</p>${info}
    <div class="row"><label class="upload"><input type="file" accept=".csv,text/csv" data-import${busy ? " disabled" : ""}><span>${esc(t.importBtn)}</span></label>
    ${imported ? `<button class="danger" data-act="clear-import" data-confirm>${esc(t.clearImport)}</button>` : ""}</div>`;
  return `<div class="card insights"><h3>${esc(t.insTitle)}</h3>${body}</div>`;
}

export const INSIGHTS_STYLES = /* css */ `
.kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:14px}
.kpi{border:1px solid var(--d-line);border-radius:12px;padding:10px 12px}
.kpi span{display:block;font-size:.78rem;color:var(--d-muted)}
.kpi strong{font-size:1.15rem}
.kpi .up{color:var(--d-ok)}.kpi .down{color:var(--d-danger)}.kpi .conf-low{color:#a15c07}
.ins{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:22px}
.bars{display:grid;gap:4px}
.bar-row{display:grid;grid-template-columns:40px minmax(0,1fr) 52px;gap:8px;align-items:center;font-size:.82rem}
.bar-label{color:var(--d-muted)}.bar-val{text-align:end;font-variant-numeric:tabular-nums}
.bar-track{height:14px;border-radius:4px;background:color-mix(in srgb,var(--d-line) 55%,#fff);overflow:hidden}
.bar-track i{display:block;height:100%;border-radius:0 4px 4px 0}
.cols{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:2px;align-items:end;height:110px;border-bottom:1px solid var(--d-line)}
.col{height:100%;display:flex;align-items:flex-end}
.col i{display:block;width:100%;border-radius:3px 3px 0 0}
.axis{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:2px;font-size:.72rem;color:var(--d-muted);margin-top:4px}
.advice{margin:14px 0 4px;padding-inline-start:1.2em;display:grid;gap:4px;font-size:.9rem}
.top{margin:0 0 12px;padding-inline-start:1.3em;display:grid;gap:8px}
.top li>div{display:inline}
.top p{margin:2px 0 0;color:var(--d-muted);font-size:.86rem}
.top li{position:relative}
.top a{margin-inline-start:8px;font-weight:600;color:var(--d-primary)}
.upload input[disabled]+span{opacity:.55}
@container (max-width:720px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.ins{grid-template-columns:1fr}}
`;
