import type { IncomingMessage, ServerResponse } from "node:http";
import type { BrandProfile } from "../core/types.js";
import type { LlmPort, PublisherPort } from "../ports/index.js";
export declare const VERSION = "0.5.0";
export interface ServerOptions {
    llm?: LlmPort;
    publisher?: PublisherPort;
    /** Fixed brand: when set, the brand sent by clients is ignored. */
    brand?: BrandProfile;
    /** When set, every /v1 call needs `Authorization: Bearer <token>`. */
    apiToken?: string;
    /** Origins allowed by CORS. `["*"]` allows any origin. Default: none (same origin only). */
    allowedOrigins?: string[];
    /** Mount path, e.g. "/dolphin". */
    basePath?: string;
    maxBodyBytes?: number;
    /**
     * Requests allowed per client IP and per minute. `expensive` covers the AI routes (generate, analyze),
     * which cost money. Default: { expensive: 20, other: 120 }. `false` disables the limit.
     */
    rateLimit?: {
        expensive?: number;
        other?: number;
    } | false;
    /** Read the client IP from X-Forwarded-For (only behind a reverse proxy you control). Default: false. */
    trustProxy?: boolean;
    log?: (line: string) => void;
}
type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
/** Sliding one-minute window per key. Memory is bounded: old keys are swept. */
export declare class RateLimiter {
    private readonly perMinute;
    private readonly now;
    private readonly hits;
    constructor(perMinute: number, now?: () => number);
    allow(key: string): boolean;
}
export declare function createDolphinHandler(opts: ServerOptions): Handler;
export { ClaudeLlm, type ClaudeLlmOptions } from "../adapters/llm/claude.js";
export { MetaPagePublisher, appSecretProof, type MetaPageOptions } from "../adapters/publish/meta.js";
export { validateBrand, validateGenerateRequest } from "../core/brand.js";
export { DolphinError } from "../core/errors.js";
