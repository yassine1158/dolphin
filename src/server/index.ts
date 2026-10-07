// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
/**
 * DOLPHin HTTP server (Node ≥ 20, no framework). Keeps the Claude key and the Meta token
 * on the server; browsers use the widget in proxy mode. Contract: openapi.yaml.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { validateBrand, validateGenerateRequest, validateSnapshot } from "../core/brand.js";
import { DolphinError, HTTP_STATUS, isDolphinError } from "../core/errors.js";
import type { BrandProfile } from "../core/types.js";
import type { LlmPort, PublisherPort } from "../ports/index.js";

export const VERSION = "0.5.0";

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
  rateLimit?: { expensive?: number; other?: number } | false;
  /** Read the client IP from X-Forwarded-For (only behind a reverse proxy you control). Default: false. */
  trustProxy?: boolean;
  log?: (line: string) => void;
}

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** JSON bodies of the AI routes: a brand (logo included as data URL) and a request. */
const MAX_AI_BODY = 2 * 1024 * 1024;
const EXPENSIVE = new Set(["POST /v1/generate", "POST /v1/analyze"]);

/** Sliding one-minute window per key. Memory is bounded: old keys are swept. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly perMinute: number, private readonly now: () => number = Date.now) {}
  allow(key: string): boolean {
    const t = this.now(), from = t - 60_000;
    const list = (this.hits.get(key) ?? []).filter(x => x > from);
    if (list.length >= this.perMinute) { this.hits.set(key, list); return false; }
    list.push(t);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (!v.some(x => x > from)) this.hits.delete(k);
    return true;
  }
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status;
  // API answers are never cached, sniffed or framed
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
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

/** Constant-time comparison that does not reveal the token length either. */
const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();
const sameToken = (given: string, expected: string): boolean => timingSafeEqual(digest(given), digest(expected));

export function createDolphinHandler(opts: ServerOptions): Handler {
  const base = (opts.basePath ?? "").replace(/\/+$/, "");
  const limit = opts.maxBodyBytes ?? 12 * 1024 * 1024;
  const aiLimit = Math.min(limit, MAX_AI_BODY);
  const origins = opts.allowedOrigins ?? [];
  const limits = opts.rateLimit === false ? null : {
    expensive: new RateLimiter(opts.rateLimit?.expensive ?? 20),
    other: new RateLimiter(opts.rateLimit?.other ?? 120),
  };
  if (origins.includes("*") && !opts.apiToken) opts.log?.("warning: any website can call this server (allowedOrigins \"*\" without apiToken)");

  const clientIp = (req: IncomingMessage): string => {
    if (opts.trustProxy) {
      const fwd = String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim();
      if (fwd) return fwd;
    }
    return req.socket?.remoteAddress ?? "unknown";
  };

  /** A browser on another site, not allowed by CORS: refused before any work is done. */
  const foreignOrigin = (req: IncomingMessage): boolean => {
    const origin = req.headers.origin;
    if (!origin || origins.includes("*") || origins.includes(origin)) return false;
    try { return new URL(origin).host !== req.headers.host; } catch { return true; }
  };

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
      const body = (await readJson(req, aiLimit)) as { brand?: unknown; request?: unknown };
      const brand = opts.brand ?? validateBrand(body.brand);
      return opts.llm.generate(brand, validateGenerateRequest(body.request));
    },

    "POST /v1/analyze": async req => {
      if (!opts.llm) throw new DolphinError("not_configured", "No language model is configured on the server.");
      const body = (await readJson(req, aiLimit)) as { snapshot?: unknown; brand?: unknown };
      const brand = opts.brand ?? (body.brand === undefined ? undefined : validateBrand(body.brand));
      return opts.llm.analyze(validateSnapshot(body.snapshot), brand);
    },

    "POST /v1/publish": async req => {
      if (!opts.publisher) throw new DolphinError("not_configured", "No publisher is configured on the server.");
      const body = (await readJson(req, limit)) as { imageBase64?: unknown; caption?: unknown; scheduledAt?: unknown };
      if (typeof body.imageBase64 !== "string" || !body.imageBase64) throw new DolphinError("invalid_request", "imageBase64 is required.");
      if (typeof body.caption !== "string" || body.caption.length > 5000) throw new DolphinError("invalid_request", "caption must be a string of at most 5000 characters.");
      const bytes = Buffer.from(body.imageBase64, "base64");
      if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new DolphinError("invalid_request", "The image must be a PNG or JPEG of at most 8 MB.");
      // the type is read from the file itself, never from what the client says
      const type = bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" ? "image/png"
        : bytes.subarray(0, 3).toString("hex") === "ffd8ff" ? "image/jpeg" : null;
      if (!type) throw new DolphinError("invalid_request", "The image must be a PNG or JPEG.");
      let scheduledAt: Date | undefined;
      if (body.scheduledAt !== undefined) {
        scheduledAt = new Date(String(body.scheduledAt));
        if (Number.isNaN(scheduledAt.getTime())) throw new DolphinError("invalid_request", "scheduledAt must be an ISO date.");
      }
      return opts.publisher.publish({ image: new Blob([bytes], { type }), caption: body.caption, ...(scheduledAt ? { scheduledAt } : {}) });
    },

    "GET /v1/publisher/history": async () => {
      if (!opts.publisher?.history) throw new DolphinError("not_configured", "No publisher is configured on the server.");
      return { samples: await opts.publisher.history() };
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
    // the token never travels in the query string, where it would end up in access logs
    if (/[?&](token|access_token|key)=/i.test(req.url ?? "")) { send(res, 400, { error: { code: "invalid_request", message: "Send the token in the Authorization header." } }); return; }
    const route = path.startsWith(base) ? path.slice(base.length) || "/" : null;
    try {
      if (route === null) throw new DolphinError("invalid_request", "Not found.", 404);
      if (req.method === "OPTIONS") { send(res, 204); return; }
      const key = `${req.method} ${route}`;
      const fn = routes[key];
      if (!fn) throw new DolphinError("invalid_request", "Not found.", 404);
      if (foreignOrigin(req)) throw new DolphinError("permission", "This origin is not allowed.", 403);
      if (limits && !(EXPENSIVE.has(key) ? limits.expensive : limits.other).allow(`${EXPENSIVE.has(key) ? "x" : "o"}:${clientIp(req)}`)) {
        res.setHeader("retry-after", "60");
        throw new DolphinError("rate_limit", "Too many requests: retry in a minute.", 429);
      }
      if (opts.apiToken && route !== "/v1/health") {
        const auth = req.headers.authorization ?? "";
        if (!auth.startsWith("Bearer ") || !sameToken(auth.slice(7), opts.apiToken)) throw new DolphinError("auth", "Missing or invalid API token.", 401);
      }
      // JSON only: a plain HTML form on another site cannot post to the API without a CORS preflight
      if (req.method === "POST" && !/^application\/json\b/i.test(req.headers["content-type"] ?? "")) {
        throw new DolphinError("invalid_request", "Content-Type must be application/json.", 415);
      }
      send(res, 200, await fn(req));
    } catch (err) {
      const e = isDolphinError(err) ? err : new DolphinError("unknown", "Internal error.");
      if (!isDolphinError(err)) opts.log?.(`error ${err instanceof Error ? err.name : "unknown"}`); // never log a message that could hold a key
      // upstream statuses (Claude, Facebook) are mapped, so a 401 from Facebook is not read as "bad DOLPHin token"
      const status = e.status && [404, 413, 415, 429].includes(e.status) ? e.status : HTTP_STATUS[e.code];
      send(res, status, { error: e.toJSON() });
    } finally {
      opts.log?.(`${req.method} ${path} ${res.statusCode} ${Date.now() - started}ms`);
    }
  };
}

// Server-side building blocks, so Node hosts can assemble their own server from one import.
export { ClaudeLlm, type ClaudeLlmOptions } from "../adapters/llm/claude.js";
export { MetaPagePublisher, appSecretProof, type MetaPageOptions } from "../adapters/publish/meta.js";
export { validateBrand, validateGenerateRequest } from "../core/brand.js";
export { DolphinError } from "../core/errors.js";
