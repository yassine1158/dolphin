import type { IncomingMessage, ServerResponse } from "node:http";
import type { BrandProfile } from "../core/types.js";
import type { LlmPort, PublisherPort } from "../ports/index.js";
export declare const VERSION = "0.1.0";
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
    log?: (line: string) => void;
}
type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
export declare function createDolphinHandler(opts: ServerOptions): Handler;
export {};
