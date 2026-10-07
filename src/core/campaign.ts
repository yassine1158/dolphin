// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
/** Marketing helpers: campaign objectives, tracked links, plan export. Pure. */
import { fullCaption } from "./schema.js";
import type { CampaignObjective, Post } from "./types.js";

export const OBJECTIVES: readonly CampaignObjective[] = ["awareness", "engagement", "traffic", "leads", "sales", "event"];

/** What each objective asks from the model. Written in English for the model. */
export const OBJECTIVE_BRIEF: Record<CampaignObjective, string> = {
  awareness: "make the brand known: memorable, easy to share, one clear message per post",
  engagement: "start conversations: ask a question or invite a reaction in every post",
  traffic: "bring people to the website: give a reason to click the link",
  leads: "get people to write or call: invite them to send a message for information",
  sales: "sell the available products: benefits, proof from the facts given, a clear call to order",
  event: "promote the event or offer: what, when, where, and a reminder to come or book",
};

export interface UtmParams {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
}

/** Turns a campaign name into a utm value: lowercase, dashes, no accents. */
export const slug = (s: string): string =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Adds UTM parameters to an http(s) link. Existing utm_* values are replaced; other parameters are kept. */
export function withUtm(link: string, p: UtmParams): string {
  const url = new URL(link);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http(s) links can be tracked.");
  const set = (k: string, v?: string) => { if (v) url.searchParams.set(k, slug(v) || v); };
  set("utm_source", p.source ?? "facebook");
  set("utm_medium", p.medium ?? "social");
  set("utm_campaign", p.campaign);
  set("utm_content", p.content);
  return url.href;
}

/** Caption as published, with the tracked link on its own line before the hashtags. */
export function captionWithLink(post: Pick<Post, "caption" | "hashtags" | "link" | "campaign" | "id">): string {
  if (!post.link) return fullCaption(post);
  let link = post.link;
  try { link = withUtm(post.link, { ...(post.campaign ? { campaign: post.campaign } : {}), content: post.id.slice(0, 8) }); } catch { /* keep as typed */ }
  return fullCaption({ caption: `${post.caption.trim()}\n\n👉 ${link}`, hashtags: post.hashtags });
}

const csvCell = (v: unknown): string => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // a spreadsheet must never run a cell as a formula
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The plan as CSV (UTF-8 with BOM, opens in Excel and Google Sheets). */
export function planToCsv(posts: readonly Post[]): string {
  const head = ["date", "time", "status", "campaign", "title", "subtitle", "caption", "hashtags", "link", "format"];
  const rows = [...posts].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).map(p => {
    const d = new Date(p.scheduledAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    return [
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      p.status, p.campaign ?? "", p.title, p.subtitle, captionWithLink(p), p.hashtags.map(h => "#" + h).join(" "), p.link ?? "", p.design?.format ?? "portrait",
    ];
  });
  return "﻿" + [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export interface CalendarDay {
  /** YYYY-MM-DD, local time */
  date: string;
  posts: Post[];
}

/** Posts grouped by local day, from the first day of the week of `from`, for `weeks` weeks. Monday first. */
export function calendarWeeks(posts: readonly Post[], from: Date, weeks = 4): CalendarDay[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const days: CalendarDay[] = Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { date: key(d), posts: [] };
  });
  const index = new Map(days.map(d => [d.date, d]));
  for (const p of posts) index.get(key(new Date(p.scheduledAt)))?.posts.push(p);
  for (const d of days) d.posts.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return days;
}
