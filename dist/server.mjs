/*! DOLPHin 0.1.0 · (c) Yassine Chaabane */

// src/server/index.ts
import { timingSafeEqual } from "node:crypto";

// src/core/errors.ts
var DolphinError = class extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
  name = "DolphinError";
  toJSON() {
    return { code: this.code, message: this.message };
  }
};
var isDolphinError = (e) => e instanceof DolphinError;
var HTTP_STATUS = {
  auth: 401,
  permission: 403,
  quota: 402,
  rate_limit: 429,
  overloaded: 503,
  network: 502,
  invalid_request: 400,
  invalid_output: 502,
  refusal: 422,
  too_long: 422,
  schedule_window: 400,
  not_configured: 501,
  unknown: 500
};

// src/core/schema.ts
var MAX_POSTS = 10;
var THEMES = ["dark", "light", "accent"];
var STYLES = ["checks", "steps"];
var POSTS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["posts"],
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tag", "title", "subtitle", "points", "style", "theme", "caption", "hashtags"],
        properties: {
          tag: { type: "string", description: "Short label on top of the poster, 1 to 3 words." },
          title: { type: "string", description: "Poster headline, 45 characters at most." },
          subtitle: { type: "string", description: "Short line under the title, 60 characters at most. Empty string if not useful." },
          points: { type: "array", items: { type: "string" }, description: "2 to 4 short points for the poster, 38 characters at most each." },
          style: { type: "string", enum: [...STYLES], description: "steps for ordered advice or steps, checks otherwise." },
          theme: { type: "string", enum: [...THEMES], description: "Poster colors; alternate from one post to the next." },
          caption: { type: "string", description: "Post text: 3 to 7 short lines, a few emojis, ends with the call to action and the contact." },
          hashtags: { type: "array", items: { type: "string" }, description: "3 to 6 hashtags without the # sign." }
        }
      }
    }
  }
};

// src/core/brand.ts
var LANGS = ["fr", "en", "ar"];
var HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
var fail = (msg) => {
  throw new DolphinError("invalid_request", msg);
};
var text = (v, field, max, required = false) => {
  if (v === void 0 || v === null || v === "") return required ? fail(`${field} is required.`) : void 0;
  if (typeof v !== "string") return fail(`${field} must be a string.`);
  if (v.length > max) return fail(`${field} is longer than ${max} characters.`);
  return v.trim();
};
var list = (v, field, maxItems, maxLen) => {
  if (v === void 0) return void 0;
  if (!Array.isArray(v) || v.length > maxItems) return fail(`${field} must be a list of at most ${maxItems} items.`);
  return v.map((x, i) => text(x, `${field}[${i}]`, maxLen, true));
};
var obj = (v, field) => v && typeof v === "object" && !Array.isArray(v) ? v : fail(`${field} must be an object.`);
function validateBrand(input) {
  const b = obj(input, "brand");
  const colors = obj(b.colors, "brand.colors");
  const contact = obj(b.contact ?? {}, "brand.contact");
  const rules = b.rules === void 0 ? void 0 : obj(b.rules, "brand.rules");
  if (!Array.isArray(b.products) || b.products.length > 50) fail("brand.products must be a list of at most 50 products.");
  const language = b.language ?? "fr";
  if (!LANGS.includes(language)) fail(`brand.language must be one of ${LANGS.join(", ")}.`);
  const color = (v, f, required) => {
    const c = text(v, f, 7, required);
    if (c && !HEX.test(c)) fail(`${f} must be a hex color like #0b3f2f.`);
    return c;
  };
  const footer = list(b.footerLines, "brand.footerLines", 2, 60);
  const brand = {
    id: text(b.id, "brand.id", 64, true),
    name: text(b.name, "brand.name", 80, true),
    language,
    contact: {},
    products: b.products.map((raw, i) => {
      const p = obj(raw, `brand.products[${i}]`);
      if (p.status !== "available" && p.status !== "soon") fail(`brand.products[${i}].status must be "available" or "soon".`);
      const details = text(p.details, `brand.products[${i}].details`, 600);
      return { name: text(p.name, `brand.products[${i}].name`, 100, true), status: p.status, ...details ? { details } : {} };
    }),
    colors: { primary: color(colors.primary, "brand.colors.primary", true), accent: color(colors.accent, "brand.colors.accent", true) }
  };
  const opt = (k, v) => {
    if (v !== void 0) brand[k] = v;
  };
  opt("fullName", text(b.fullName, "brand.fullName", 120));
  opt("location", text(b.location, "brand.location", 120));
  opt("audience", text(b.audience, "brand.audience", 200));
  opt("logoUrl", text(b.logoUrl, "brand.logoUrl", 500));
  opt("logoOnDarkUrl", text(b.logoOnDarkUrl, "brand.logoOnDarkUrl", 500));
  if (footer?.length) brand.footerLines = [footer[0], footer[1]];
  const light = color(colors.light, "brand.colors.light", false);
  if (light) brand.colors.light = light;
  for (const k of ["whatsapp", "phone", "website", "callToAction"]) {
    const v = text(contact[k], `brand.contact.${k}`, 120);
    if (v) brand.contact[k] = v;
  }
  if (rules) {
    brand.rules = {};
    if (typeof rules.hidePrices === "boolean") brand.rules.hidePrices = rules.hidePrices;
    const never = list(rules.neverMention, "brand.rules.neverMention", 20, 200);
    const extra = list(rules.extra, "brand.rules.extra", 20, 300);
    if (never) brand.rules.neverMention = never;
    if (extra) brand.rules.extra = extra;
  }
  return brand;
}
function validateGenerateRequest(input) {
  const r = obj(input, "request");
  const count = r.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > MAX_POSTS) fail(`request.count must be an integer from 1 to ${MAX_POSTS}.`);
  const req = { count };
  const subject = text(r.subject, "request.subject", 200);
  const tone = text(r.tone, "request.tone", 100);
  const notes = text(r.notes, "request.notes", 1e3);
  const avoid = list(r.avoidTitles, "request.avoidTitles", 30, 160);
  if (subject) req.subject = subject;
  if (tone) req.tone = tone;
  if (notes) req.notes = notes;
  if (avoid) req.avoidTitles = avoid;
  return req;
}

// src/server/index.ts
var VERSION = "0.1.0";
var MAX_IMAGE_BYTES = 8 * 1024 * 1024;
function send(res, status, body) {
  res.statusCode = status;
  if (body === void 0) {
    res.end();
    return;
  }
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new DolphinError("invalid_request", "Request body too large.", 413));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new DolphinError("invalid_request", "Body must be JSON."));
      }
    });
    req.on("error", () => reject(new DolphinError("network", "Connection interrupted.")));
  });
}
var sameToken = (given, expected) => {
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
function createDolphinHandler(opts) {
  const base = (opts.basePath ?? "").replace(/\/+$/, "");
  const limit = opts.maxBodyBytes ?? 12 * 1024 * 1024;
  const origins = opts.allowedOrigins ?? [];
  const cors = (req, res) => {
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
  const routes = {
    "GET /v1/health": async () => ({ ok: true, version: VERSION, llm: !!opts.llm, publisher: !!opts.publisher }),
    "POST /v1/generate": async (req) => {
      if (!opts.llm) throw new DolphinError("not_configured", "No language model is configured on the server.");
      const body = await readJson(req, limit);
      const brand = opts.brand ?? validateBrand(body.brand);
      return opts.llm.generate(brand, validateGenerateRequest(body.request));
    },
    "POST /v1/publish": async (req) => {
      if (!opts.publisher) throw new DolphinError("not_configured", "No publisher is configured on the server.");
      const body = await readJson(req, limit);
      if (typeof body.imageBase64 !== "string" || !body.imageBase64) throw new DolphinError("invalid_request", "imageBase64 is required.");
      if (typeof body.caption !== "string" || body.caption.length > 5e3) throw new DolphinError("invalid_request", "caption must be a string of at most 5000 characters.");
      const bytes = Buffer.from(body.imageBase64, "base64");
      if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new DolphinError("invalid_request", "The image must be a PNG of at most 8 MB.");
      if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new DolphinError("invalid_request", "The image must be a PNG.");
      let scheduledAt;
      if (body.scheduledAt !== void 0) {
        scheduledAt = new Date(String(body.scheduledAt));
        if (Number.isNaN(scheduledAt.getTime())) throw new DolphinError("invalid_request", "scheduledAt must be an ISO date.");
      }
      return opts.publisher.publish({ image: new Blob([bytes], { type: "image/png" }), caption: body.caption, ...scheduledAt ? { scheduledAt } : {} });
    },
    "GET /v1/publisher": async () => {
      if (!opts.publisher?.verify) throw new DolphinError("not_configured", "No publisher is configured on the server.");
      return opts.publisher.verify();
    }
  };
  return async (req, res) => {
    const started = Date.now();
    cors(req, res);
    const path = (req.url ?? "/").split("?")[0];
    const route = path.startsWith(base) ? path.slice(base.length) || "/" : null;
    try {
      if (route === null) throw new DolphinError("invalid_request", "Not found.", 404);
      if (req.method === "OPTIONS") {
        send(res, 204);
        return;
      }
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
export {
  VERSION,
  createDolphinHandler
};
//# sourceMappingURL=server.mjs.map
