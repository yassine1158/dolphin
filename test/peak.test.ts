import { describe, expect, it } from "vitest";
import { analyzePeaks, planWithPeaks, type EngagementSample } from "../src/core/peak.js";

// local-time dates: 2026-06-01 is a Monday
const at = (day: number, hour: number) => new Date(2026, 5, 1 + day, hour, 0).toISOString();
const post = (day: number, hour: number, reactions: number): EngagementSample => ({ createdTime: at(day, hour), reactions, comments: 0, shares: 0 });

describe("analyzePeaks", () => {
  it("falls back to the general recommendation with too few posts", () => {
    const r = analyzePeaks([post(0, 9, 5)]);
    expect(r.source).toBe("default");
    expect(r.bestHourByDay.slice(0, 5).every(h => h >= 19 && h <= 21)).toBe(true); // weekday evenings
    expect(r.bestHourByDay[5]).toBeGreaterThanOrEqual(10); // weekend late morning
  });

  it("finds the page's own peak from engagement, not from post count", () => {
    const samples = [
      ...Array.from({ length: 6 }, (_, w) => post(1 + 7 * w, 20, 120)), // Tuesdays 20 h: few posts, many reactions
      ...Array.from({ length: 10 }, (_, w) => post(3 + 7 * (w % 4), 9, 10)), // Thursdays 9 h: many posts, little engagement
      { createdTime: at(5, 11), reactions: 40, comments: 10, shares: 5 }, // Saturday 11 h: comments and shares count more
    ];
    const r = analyzePeaks(samples);
    expect(r.source).toBe("page");
    expect(r.samples).toBe(17);
    expect(r.best[0]).toMatchObject({ day: 1, hour: 20, score: 1 });
    expect(r.bestHourByDay[1]).toBe(20);
    expect(r.best.map(b => b.day)).toContain(5);
  });

  it("spreads the best slots", () => {
    const r = analyzePeaks([]);
    for (const a of r.best) for (const b of r.best) if (a !== b && a.day === b.day) expect(Math.abs(a.hour - b.hour)).toBeGreaterThanOrEqual(3);
  });
});

it("plans each post at its weekday's best hour", () => {
  const report = analyzePeaks([]);
  report.bestHourByDay = [8, 9, 10, 11, 12, 13, 14];
  const d = planWithPeaks(3, new Date(2026, 5, 6), report); // Saturday, Sunday, Monday
  expect(d.map(x => [x.getDate(), x.getHours()])).toEqual([[6, 13], [7, 14], [8, 8]]);
});
