import type { EngagementSample } from "./peak.js";
export declare const MAX_CSV_BYTES: number;
/** RFC 4180 parser; the separator (comma, semicolon or tab) is detected from the first line. */
export declare function parseCsv(text: string): string[][];
/** "1 234", "1,234", "1.234,5", "12%" → number. Empty or "--" → 0. */
export declare function toNumber(v: string | undefined): number;
/**
 * Date-time in the formats spreadsheets and Meta use. `dayFirst` decides 03/10/2026:
 * 3 October (true) or March 10 (false). Returns local time.
 */
export declare function parseDateTime(v: string, dayFirst: boolean): Date | null;
export interface ImportResult {
    kind: "posts" | "ads";
    samples: EngagementSample[];
    /** Rows that could not be read (no date, no number). */
    skipped: number;
    /** Which columns were used, for the user to check. */
    columns: {
        time: string;
        metrics: string[];
    };
    /** Ads report without a day column: each hour was counted on every day of the week. */
    undated?: boolean;
}
/** Reads an export and turns each row into a sample. Throws when no time column can be found. */
export declare function importEngagementCsv(text: string): ImportResult;
