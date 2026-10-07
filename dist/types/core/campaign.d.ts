import type { CampaignObjective, Post } from "./types.js";
export declare const OBJECTIVES: readonly CampaignObjective[];
/** What each objective asks from the model. Written in English for the model. */
export declare const OBJECTIVE_BRIEF: Record<CampaignObjective, string>;
export interface UtmParams {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
}
/** Turns a campaign name into a utm value: lowercase, dashes, no accents. */
export declare const slug: (s: string) => string;
/** Adds UTM parameters to an http(s) link. Existing utm_* values are replaced; other parameters are kept. */
export declare function withUtm(link: string, p: UtmParams): string;
/** Caption as published, with the tracked link on its own line before the hashtags. */
export declare function captionWithLink(post: Pick<Post, "caption" | "hashtags" | "link" | "campaign" | "id">): string;
/** The plan as CSV (UTF-8 with BOM, opens in Excel and Google Sheets). */
export declare function planToCsv(posts: readonly Post[]): string;
export interface CalendarDay {
    /** YYYY-MM-DD, local time */
    date: string;
    posts: Post[];
}
/** Posts grouped by local day, from the first day of the week of `from`, for `weeks` weeks. Monday first. */
export declare function calendarWeeks(posts: readonly Post[], from: Date, weeks?: number): CalendarDay[];
