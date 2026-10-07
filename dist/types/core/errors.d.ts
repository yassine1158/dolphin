export type DolphinErrorCode = "auth" | "permission" | "quota" | "rate_limit" | "overloaded" | "network" | "invalid_request" | "invalid_output" | "refusal" | "too_long" | "schedule_window" | "not_configured" | "storage_full" | "unknown";
export declare class DolphinError extends Error {
    readonly code: DolphinErrorCode;
    readonly status?: number | undefined;
    readonly name = "DolphinError";
    constructor(code: DolphinErrorCode, message: string, status?: number | undefined);
    toJSON(): {
        code: DolphinErrorCode;
        message: string;
    };
}
export declare const isDolphinError: (e: unknown) => e is DolphinError;
/** HTTP status used by the server for each error code. */
export declare const HTTP_STATUS: Record<DolphinErrorCode, number>;
