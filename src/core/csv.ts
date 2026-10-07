// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
/**
 * Imports engagement data from a CSV export, to learn the best times even without a page token:
 *  - Meta Business Suite / Creator Studio post exports (publish time, reactions, comments, shares);
 *  - Meta Ads Manager reports broken down by hour of day (results, clicks…), with or without a day column;
 *  - any sheet with a date-time column and number columns.
 * Pure: the file content comes in as text.
 */
import { DolphinError } from "./errors.js";
import type { EngagementSample } from "./peak.js";

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20_000;

/** RFC 4180 parser; the separator (comma, semicolon or tab) is detected from the first line. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = [",", ";", "\t"].map(c => ({ c, n: firstLine.split(c).length })).sort((a, b) => b.n - a.n)[0]!.c;
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(c => c.trim())) rows.push(row);
      row = [];
      if (rows.length > MAX_ROWS) throw new DolphinError("invalid_request", `The file has more than ${MAX_ROWS} rows.`);
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim())) rows.push(row);
  return rows;
}

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const find = (headers: string[], patterns: RegExp[], not?: RegExp): number => {
  for (const p of patterns) {
    const i = headers.findIndex(h => p.test(h) && !(not?.test(h)));
    if (i >= 0) return i;
  }
  return -1;
};

/** "1 234", "1,234", "1.234,5", "12%" → number. Empty or "--" → 0. */
export function toNumber(v: string | undefined): number {
  const s = (v ?? "").replace(/[\s %]/g, "");
  if (!s || /^-+$/.test(s)) return 0;
  let t = s;
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, ""); // thousands separators only
  else if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", "."); // decimal comma
  else t = t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Date-time in the formats spreadsheets and Meta use. `dayFirst` decides 03/10/2026:
 * 3 October (true) or March 10 (false). Returns local time.
 */
export function parseDateTime(v: string, dayFirst: boolean): Date | null {
  const s = v.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) { const d = new Date(s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")); return Number.isNaN(d.getTime()) ? null : d; }
    return new Date(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0));
  }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[\s,T]+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?)?/i);
  if (m) {
    let [a, b] = [+m[1]!, +m[2]!];
    if (a > 12) dayFirst = true; else if (b > 12) dayFirst = false;
    const [day, month] = dayFirst ? [a, b] : [b, a];
    const year = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    let h = +(m[4] ?? 0);
    const pm = m[6]?.toLowerCase().startsWith("p");
    if (m[6]) h = (h % 12) + (pm ? 12 : 0);
    const d = new Date(year, month - 1, day, h, +(m[5] ?? 0));
    return d.getMonth() === month - 1 ? d : null;
  }
  return null;
}

export interface ImportResult {
  kind: "posts" | "ads";
  samples: EngagementSample[];
  /** Rows that could not be read (no date, no number). */
  skipped: number;
  /** Which columns were used, for the user to check. */
  columns: { time: string; metrics: string[] };
  /** Ads report without a day column: each hour was counted on every day of the week. */
  undated?: boolean;
}

const TIME_OF_DAY = [/time of day/, /heure de la journee/, /tranche horaire/, /^hour/, /^heure$/];
const DATE_TIME = [/publish time/, /heure de publication/, /date de publication/, /created/, /date.*heure/, /date.?time/, /^date$/, /^day$/, /^jour$/, /^time$/, /^date/, /^reporting starts/, /^debut des rapports/];
const DAY = [/^day$/, /^jour$/, /^date$/, /^reporting starts/, /^debut des rapports/];

/** Reads an export and turns each row into a sample. Throws when no time column can be found. */
export function importEngagementCsv(text: string): ImportResult {
  if (text.length > MAX_CSV_BYTES) throw new DolphinError("invalid_request", "The file is larger than 5 MB.");
  const rows = parseCsv(text);
  // some exports put a title line first: the header is the first line with 3 cells or more
  const headerAt = rows.findIndex(r => r.filter(c => c.trim()).length >= 3);
  if (headerAt < 0) throw new DolphinError("invalid_request", "The file has no header line.");
  const raw = rows[headerAt]!;
  const headers = raw.map(norm);
  const body = rows.slice(headerAt + 1);
  // French exports write dates day first (03/10/2026 = 3 October); English ones month first
  const french = headers.some(h => /heure|publication|^jour$|partages|commentaires|resultats|clics|couverture/.test(h));

  const hourCol = find(headers, TIME_OF_DAY);
  const kind: ImportResult["kind"] = hourCol >= 0 ? "ads" : "posts";
  const timeCol = kind === "ads" ? find(headers, DAY) : find(headers, DATE_TIME);
  if (kind === "posts" && timeCol < 0) throw new DolphinError("invalid_request", "No date or publish time column was found.");

  const col = (patterns: RegExp[], not?: RegExp) => find(headers, patterns, not);
  const reactions = col([/^reactions$/, /reactions/, /j.?aime/, /likes/], /comment|partage|share/);
  const comments = col([/^comments$/, /^commentaires$/, /comment/], /reaction|share|partage/);
  const shares = col([/^shares$/, /^partages$/, /share/, /partage/], /reaction|comment/);
  const combined = col([/reactions, comments and shares/, /reactions, commentaires et partages/, /engagement/, /interactions/]);
  const results = col([/^results$/, /^resultats$/, /link clicks/, /clics sur (un|le) lien/, /^clicks/, /^clics/, /conversions/, /purchases/, /achats/, /^reach$/, /^couverture$/, /impressions/]);
  const message = col([/^title$/, /^titre$/, /^description$/, /message/, /^post$/, /^publication$/]);
  const permalink = col([/permalink/, /^lien$/, /^link$/, /url/]);

  const metrics = kind === "ads"
    ? [results]
    : reactions >= 0 || comments >= 0 || shares >= 0 ? [reactions, comments, shares] : [combined >= 0 ? combined : results];
  if (!metrics.some(i => i >= 0)) throw new DolphinError("invalid_request", "No engagement column (reactions, comments, shares, results, clicks) was found.");

  const samples: EngagementSample[] = [];
  let skipped = 0, undated = false;
  for (const r of body) {
    let when: Date | null;
    if (kind === "ads") {
      const h = (r[hourCol] ?? "").match(/(\d{1,2})[:h]/);
      if (!h) { skipped++; continue; }
      const day = timeCol >= 0 ? parseDateTime(r[timeCol] ?? "", french) : null;
      if (timeCol >= 0 && !day) { skipped++; continue; }
      const score = toNumber(r[results]);
      if (!day) {
        // no day: the same hour on each day of a reference week (Monday 1 January 2024)
        undated = true;
        for (let d = 0; d < 7; d++) samples.push({ createdTime: new Date(2024, 0, 1 + d, +h[1]!).toISOString(), reactions: 0, comments: 0, shares: 0, score });
        continue;
      }
      when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), +h[1]!);
      samples.push({ createdTime: when.toISOString(), reactions: 0, comments: 0, shares: 0, score });
      continue;
    }
    when = parseDateTime(r[timeCol] ?? "", french);
    if (!when) { skipped++; continue; }
    const s: EngagementSample = {
      createdTime: when.toISOString(),
      reactions: reactions >= 0 ? toNumber(r[reactions]) : 0,
      comments: comments >= 0 ? toNumber(r[comments]) : 0,
      shares: shares >= 0 ? toNumber(r[shares]) : 0,
    };
    if (reactions < 0 && comments < 0 && shares < 0) s.score = toNumber(r[metrics[0]!]);
    const msg = message >= 0 ? (r[message] ?? "").trim() : "";
    if (msg) s.message = msg.slice(0, 200);
    const link = permalink >= 0 ? (r[permalink] ?? "").trim() : "";
    if (/^https:\/\//.test(link)) s.url = link.slice(0, 500);
    samples.push(s);
  }
  if (!samples.length) throw new DolphinError("invalid_request", "No row could be read: check the date column.");
  return {
    kind, samples, skipped,
    columns: { time: raw[kind === "ads" ? hourCol : timeCol] ?? "", metrics: metrics.filter(i => i >= 0).map(i => raw[i]!) },
    ...(undated ? { undated } : {}),
  };
}
