/**
 * DOLPHin HTTP server (Node ≥ 20, no framework). Keeps the Claude key and the Meta token
 * on the server; browsers use the widget in proxy mode. Contract: openapi.yaml.
 */
import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { validateBrand, validateGenerateRequest } from "../core/brand.js";
import { DolphinError, HTTP_STATUS, isDolphinError } from "../core/errors.js";
import type { BrandProfile } from "../core/types.js";
import type { LlmPort, PublisherPort } from "../ports/index.js";

export const VERSION = "0.2.0";

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

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status;
  if (body === undefined) { res.end(); return; }
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) { reject(new DolphinError("invalid_request", "Request body too large.", 413)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch { reject(new DolphinError("invalid_request", "Body must be JSON.")); }
    });
    req.on("error", () => reject(new DolphinError("network", "Connection interrupted.")));
  });
}

const sameToken = (given: string, expected: string): boolean => {
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function createDolphinHandler(opts: ServerOptions): Handler {
  const base = (opts.basePath ?? "").replace(/\/+$/, "");
  const limit = opts.maxBodyBytes ?? 12 * 1024 * 1024;
  const origins = opts.allowedOrigins ?? [];

  const cors = (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    if (!origin) return;
    if (origins.includes("*") || origins.includes(origin)) {
      res.setHeader("access-control-allow-origin", origins.includes("*") ? "*" : origin);
      res.setHeader("access-control-allow-headers", "content-type, authorization");
      res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      res.setHeader("access-control-max-age", "600");
    }
    res.setHeader("vary", "origin");
  };

  const routes: Record<string, (req: IncomingMessage) => Promise<unknown>> = {
    "GET /v1/health": async () => ({ ok: true, version: VERSION, llm: !!opts.llm, publisher: !!opts.publisher }),

    "POST /v1/generate": async req => {
      if (!opts.llm) throw new DolphinError("not_configured", "No language model is configured on the server.");
      const body = (await readJson(req, limit)) as { brand?: unknown; request?: unknown };
      const brand = opts.brand ?? validateBrand(body.brand);
      return opts.llm.generate(brand, validateGenerateRequest(body.request));
    },

    "POST /v1/publish": async req => {
      if (!opts.publisher) throw new DolphinError("not_configured", "No publisher is configured on the server.");
      const body = (await readJson(req, limit)) as { imageBase64?: unknown; caption?: unknown; scheduledAt?: unknown };
      if (typeof body.imageBase64 !== "string" || !body.imageBase64) throw new DolphinError("invalid_request", "imageBase64 is required.");
      if (typeof body.caption !== "string" || body.caption.length > 5000) throw new DolphinError("invalid_request", "caption must be a string of at most 5000 characters.");
      const bytes = Buffer.from(body.imageBase64, "base64");
      if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new DolphinError("invalid_request", "The image must be a PNG of at most 8 MB.");
      if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new DolphinError("invalid_request", "The image must be a PNG.");
      let scheduledAt: Date | undefined;
      if (body.scheduledAt !== undefined) {
        scheduledAt = new Date(String(body.scheduledAt));
        if (Number.isNaN(scheduledAt.getTime())) throw new DolphinError("invalid_request", "scheduledAt must be an ISO date.");
      }
      return opts.publisher.publish({ image: new Blob([bytes], { type: "image/png" }), caption: body.caption, ...(scheduledAt ? { scheduledAt } : {}) });
    },

    "GET /v1/publisher": async () => {
      if (!opts.publisher?.verify) throw new DolphinError("not_configured", "No publisher is configured on the server.");
      return opts.publisher.verify();
    },
  };

  return async (req, res) => {
    const started = Date.now();
    cors(req, res);
    const path = (req.url ?? "/").split("?")[0]!;
    const route = path.startsWith(base) ? path.slice(base.length) || "/" : null;
    try {
      if (route === null) throw new DolphinError("invalid_request", "Not found.", 404);
      if (req.method === "OPTIONS") { send(res, 204); return; }
      const fn = routes[`${req.method} ${route}`];
      if (!fn) throw new DolphinError("invalid_request", "Not found.", 404);
      if (opts.apiToken && route !== "/v1/health") {
        const auth = req.headers.authorization ?? "";
        if (!auth.startsWith("Bearer ") || !sameToken(auth.slice(7), opts.apiToken)) throw new DolphinError("auth", "Missing or invalid API token.", 401);
      }
      send(res, 200, await fn(req));
    } catch (err) {
      const e = isDolphinError(err) ? err : new DolphinError("unknown", "Internal error.");
      if (!isDolphinError(err)) opts.log?.(`error ${String(err)}`);
      send(res, e.status && e.status >= 400 ? e.status : HTTP_STATUS[e.code], { error: e.toJSON() });
    } finally {
      opts.log?.(`${req.method} ${path} ${res.statusCode} ${Date.now() - started}ms`);
    }
  };
}

// Server-side building blocks, so Node hosts can assemble their own server from one import.
export { ClaudeLlm, type ClaudeLlmOptions } from "../adapters/llm/claude.js";
export { MetaPagePublisher, type MetaPageOptions } from "../adapters/publish/meta.js";
export { validateBrand, validateGenerateRequest } from "../core/brand.js";
export { DolphinError } from "../core/errors.js";
