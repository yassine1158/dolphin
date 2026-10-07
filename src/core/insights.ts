// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
/**
 * Insights: what the past posts (or ads) say about the audience — best days, best hours,
 * best posts, posting rhythm and trend. Pure computation, local time of the device running it.
 */
import { mondayFirst, weight, type EngagementSample } from "./peak.js";

export interface Bucket {
  /** Average engagement per post in this bucket. */
  avg: number;
  posts: number;
}

export interface TopPost {
  createdTime: string;
  score: number;
  message?: string;
  url?: string;
}

export type Confidence = "low" | "medium" | "high";

export interface InsightsReport {
  samples: number;
  /** First and last post analyzed (ISO). */
  from?: string;
  to?: string;
  /** Monday first. */
  byDay: Bucket[];
  /** 0..23 */
  byHour: Bucket[];
  /** Best day and best 3-hour block (start hour), by average engagement. */
  bestDay?: number;
  bestBlock?: number;
  /** Average engagement of one post. */
  avgPerPost: number;
  postsPerWeek: number;
  top: TopPost[];
  /** Last 4 weeks against the 4 weeks before, in percent; undefined without both periods. */
  trend?: number;
  confidence: Confidence;
  /** Days of the week without any post: nothing can be said about them. */
  untestedDays: number[];
}

const WEEK = 7 * 86_400_000;
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export function analyzeInsights(samples: readonly EngagementSample[], now: Date = new Date()): InsightsReport {
  const valid = samples
    .map(s => ({ s, t: new Date(s.createdTime).getTime() }))
    .filter(x => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);
  const bucket = (n: number) => Array.from({ length: n }, () => ({ sum: 0, posts: 0 }));
  const days = bucket(7), hours = bucket(24);
  let total = 0;
  for (const { s } of valid) {
    const d = new Date(s.createdTime), w = weight(s);
    days[mondayFirst(d)]!.sum += w; days[mondayFirst(d)]!.posts++;
    hours[d.getHours()]!.sum += w; hours[d.getHours()]!.posts++;
    total += w;
  }
  const out = (b: { sum: number; posts: number }[]): Bucket[] => b.map(x => ({ avg: x.posts ? round(x.sum / x.posts) : 0, posts: x.posts }));
  const byDay = out(days), byHour = out(hours);

  // best day / block need at least 2 posts, so one lucky post does not decide
  const bestOf = (list: { avg: number; posts: number }[], min = 2) => {
    let best: number | undefined;
    list.forEach((b, i) => { if (b.posts >= min && (best === undefined || b.avg > list[best]!.avg)) best = i; });
    return best;
  };
  const blocks = Array.from({ length: 8 }, (_, i) => {
    const hs = byHour.slice(i * 3, i * 3 + 3), posts = hs.reduce((a, h) => a + h.posts, 0);
    return { avg: posts ? hs.reduce((a, h) => a + h.avg * h.posts, 0) / posts : 0, posts };
  });
  const bestBlock = bestOf(blocks);

  const first = valid[0]?.t, last = valid[valid.length - 1]?.t;
  const spanWeeks = first !== undefined && last !== undefined ? Math.max(1, (last - first) / WEEK) : 1;
  const sumBetween = (a: number, b: number) => {
    const xs = valid.filter(x => x.t >= a && x.t < b);
    return xs.length ? xs.reduce((n, x) => n + weight(x.s), 0) / xs.length : undefined;
  };
  const t = now.getTime();
  const recent = sumBetween(t - 4 * WEEK, t + 1), before = sumBetween(t - 8 * WEEK, t - 4 * WEEK);
  const trend = recent !== undefined && before !== undefined && before > 0 ? Math.round(((recent - before) / before) * 100) : undefined;

  const testedDays = byDay.filter(d => d.posts > 0).length;
  const confidence: Confidence = valid.length >= 40 && testedDays >= 6 ? "high" : valid.length >= 15 && testedDays >= 4 ? "medium" : "low";

  const report: InsightsReport = {
    samples: valid.length,
    byDay, byHour,
    avgPerPost: valid.length ? round(total / valid.length) : 0,
    postsPerWeek: valid.length ? round(valid.length / spanWeeks) : 0,
    top: [...valid].sort((a, b) => weight(b.s) - weight(a.s)).slice(0, 5).map(({ s }) => ({
      createdTime: s.createdTime, score: round(weight(s)),
      ...(s.message ? { message: s.message.slice(0, 140) } : {}), ...(s.url ? { url: s.url } : {}),
    })),
    confidence,
    untestedDays: byDay.flatMap((d, i) => (d.posts ? [] : [i])),
  };
  const bestDay = bestOf(byDay);
  if (bestDay !== undefined) report.bestDay = bestDay;
  if (bestBlock !== undefined) report.bestBlock = bestBlock * 3;
  if (first !== undefined) report.from = new Date(first).toISOString();
  if (last !== undefined) report.to = new Date(last).toISOString();
  if (trend !== undefined) report.trend = trend;
  return report;
}

/**
 * Puts several sources on the same scale (page engagement, ad results…): each sample is divided
 * by the average of its own source, so a source with big numbers does not drown the other.
 */
export function mergeSources(...sources: readonly (readonly EngagementSample[])[]): EngagementSample[] {
  return sources.flatMap(src => {
    const avg = src.length ? src.reduce((a, s) => a + weight(s), 0) / src.length : 0;
    return src.map(s => ({ ...s, score: avg > 0 ? weight(s) / avg : 0 }));
  });
}
