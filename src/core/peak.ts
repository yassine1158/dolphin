// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
/**
 * Peak times: when the page's audience reacts the most. Pure computation on the page's own
 * past posts (local time of the device running it); a general recommendation when there is too little data.
 */

/** One past post: when it went out and how much it engaged. */
export interface EngagementSample {
  createdTime: string;
  reactions: number;
  comments: number;
  shares: number;
  /** Ready-made score (e.g. ad results or clicks from an import). Replaces the weighted engagement. */
  score?: number;
  /** First words of the post, to show the top posts. */
  message?: string;
  url?: string;
}

export interface PeakSlot {
  /** 0 = Monday … 6 = Sunday */
  day: number;
  hour: number;
  /** 0..1, relative to the best slot */
  score: number;
}

export interface PeakReport {
  /** page: the page's own posts; import: a file the user imported; mixed: both; default: general habits. */
  source: "page" | "import" | "mixed" | "default";
  /** Number of posts the report is based on. */
  samples: number;
  /** grid[day][hour], 0..1 */
  grid: number[][];
  /** Best three slots, spread out (never two neighbouring hours of the same day). */
  best: PeakSlot[];
  /** Best hour for each day of the week. */
  bestHourByDay: number[];
}

export const MIN_SAMPLES = 8;
const DAYS = 7, HOURS = 24;
/** Engagement of one post: a comment counts double and a share triple. */
export const weight = (s: EngagementSample): number =>
  Math.max(0, Number.isFinite(s.score) ? s.score! : (s.reactions || 0) + 2 * (s.comments || 0) + 3 * (s.shares || 0));
export const mondayFirst = (d: Date): number => (d.getDay() + 6) % 7;

/** General habits of Facebook audiences (lunch break and evening on weekdays, late morning on weekends). */
function defaultGrid(): number[][] {
  const weekday = (h: number) => (h >= 19 && h <= 21 ? 1 : h >= 12 && h <= 13 ? 0.8 : h === 18 || h === 22 ? 0.7 : h >= 7 && h <= 8 ? 0.5 : h >= 9 && h <= 17 ? 0.35 : 0.08);
  const weekend = (h: number) => (h >= 10 && h <= 12 ? 0.9 : h >= 17 && h <= 20 ? 0.85 : h >= 13 && h <= 16 ? 0.5 : h >= 8 && h <= 22 ? 0.3 : 0.06);
  return Array.from({ length: DAYS }, (_, d) => Array.from({ length: HOURS }, (_, h) => (d >= 5 ? weekend(h) : weekday(h))));
}

function pickBest(grid: number[][]): PeakSlot[] {
  const cells = grid.flatMap((row, day) => row.map((score, hour) => ({ day, hour, score }))).sort((a, b) => b.score - a.score || a.day - b.day || a.hour - b.hour);
  const best: PeakSlot[] = [];
  for (const c of cells) {
    if (best.length === 3) break;
    if (best.some(b => b.day === c.day && Math.abs(b.hour - c.hour) < 3)) continue;
    best.push(c);
  }
  return best;
}

export function analyzePeaks(samples: readonly EngagementSample[], minSamples = MIN_SAMPLES, from: Exclude<PeakReport["source"], "default"> = "page"): PeakReport {
  const valid = samples.filter(s => !Number.isNaN(new Date(s.createdTime).getTime()));
  let grid: number[][];
  let source: PeakReport["source"] = from;
  if (valid.length < minSamples) {
    grid = defaultGrid();
    source = "default";
  } else {
    const sum = Array.from({ length: DAYS }, () => new Array<number>(HOURS).fill(0));
    const count = Array.from({ length: DAYS }, () => new Array<number>(HOURS).fill(0));
    for (const s of valid) {
      const d = new Date(s.createdTime);
      sum[mondayFirst(d)]![d.getHours()]! += weight(s);
      count[mondayFirst(d)]![d.getHours()]! += 1;
    }
    // average engagement per post, smoothed with the neighbouring hours (posts keep engaging for a while)
    // an hour without posts counts as zero, so it only inherits half of its neighbours
    const avg = (d: number, h: number) => (h < 0 || h >= HOURS || !count[d]![h] ? 0 : sum[d]![h]! / count[d]![h]!);
    const raw = Array.from({ length: DAYS }, (_, d) => Array.from({ length: HOURS }, (_, h) =>
      avg(d, h) + 0.5 * avg(d, h - 1) + 0.5 * avg(d, h + 1)));
    const max = Math.max(...raw.flat());
    grid = raw.map(row => row.map(v => (max > 0 ? v / max : 0)));
    if (max <= 0) { grid = defaultGrid(); source = "default"; }
  }
  return {
    source,
    samples: valid.length,
    grid,
    best: pickBest(grid),
    bestHourByDay: grid.map(row => row.reduce((bi, v, h) => (v > row[bi]! ? h : bi), 0)),
  };
}

/** One slot per post from `start`, every `everyDays` days, each at that weekday's best hour. */
export function planWithPeaks(count: number, start: Date, report: PeakReport, everyDays = 1): Date[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i * everyDays);
    d.setHours(report.bestHourByDay[mondayFirst(d)] ?? 19, 0, 0, 0);
    return d;
  });
}
