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
export declare const MIN_SAMPLES = 8;
/** Engagement of one post: a comment counts double and a share triple. */
export declare const weight: (s: EngagementSample) => number;
export declare const mondayFirst: (d: Date) => number;
export declare function analyzePeaks(samples: readonly EngagementSample[], minSamples?: number, from?: Exclude<PeakReport["source"], "default">): PeakReport;
/** One slot per post from `start`, every `everyDays` days, each at that weekday's best hour. */
export declare function planWithPeaks(count: number, start: Date, report: PeakReport, everyDays?: number): Date[];
