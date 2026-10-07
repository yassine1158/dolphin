/** Meta accepts scheduled posts between 10 minutes and 30 days ahead. */
export declare const SCHEDULE_MIN_MS: number;
export declare const SCHEDULE_MAX_MS: number;
/**
 * One slot per post: `start` day at `time` (HH:MM, local time), then every `everyDays` days.
 */
export declare function planSchedule(count: number, start: Date, time?: string, everyDays?: number): Date[];
export declare function assertSchedulable(at: Date, now?: Date): void;
/** `YYYY-MM-DDTHH:MM` in local time, the value format of <input type="datetime-local">. */
export declare function toLocalInput(d: Date): string;
