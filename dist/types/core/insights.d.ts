/**
 * Insights: what the past posts (or ads) say about the audience — best days, best hours,
 * best posts, posting rhythm and trend. Pure computation, local time of the device running it.
 */
import { type EngagementSample } from "./peak.js";
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
export declare function analyzeInsights(samples: readonly EngagementSample[], now?: Date): InsightsReport;
/**
 * Puts several sources on the same scale (page engagement, ad results…): each sample is divided
 * by the average of its own source, so a source with big numbers does not drown the other.
 */
export declare function mergeSources(...sources: readonly (readonly EngagementSample[])[]): EngagementSample[];
