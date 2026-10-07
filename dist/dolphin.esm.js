/*! DOLPHin 0.2.0 · (c) Yassine Chaabane */

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
var MAX_POINTS = 5;
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
var str = (v, max = 2e3) => typeof v === "string" ? v.trim().slice(0, max) : "";
var strList = (v, maxItems, maxLen = 200) => Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];
var cleanHashtag = (h) => h.replace(/^#+/, "").replace(/\s+/g, "");
function parseDrafts(value) {
  const posts = value?.posts;
  if (!Array.isArray(posts)) throw new DolphinError("invalid_output", "The model answer has no posts array.");
  const drafts = posts.slice(0, MAX_POSTS).map((raw) => {
    const p = raw ?? {};
    return {
      tag: str(p.tag, 40),
      title: str(p.title, 120),
      subtitle: str(p.subtitle, 160),
      points: strList(p.points, MAX_POINTS, 120),
      style: STYLES.includes(p.style) ? p.style : "checks",
      theme: THEMES.includes(p.theme) ? p.theme : "dark",
      caption: str(p.caption, 2200),
      hashtags: strList(p.hashtags, 10, 60).map(cleanHashtag).filter(Boolean)
    };
  }).filter((d) => d.title && d.caption);
  if (!drafts.length) throw new DolphinError("invalid_output", "The model answer contains no usable post.");
  return drafts;
}
var fullCaption = (p) => [p.caption.trim(), p.hashtags.map((h) => "#" + cleanHashtag(h)).join(" ")].filter(Boolean).join("\n\n");

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

// src/core/prompt.ts
var LANGUAGE = { fr: "French", en: "English", ar: "Modern Standard Arabic" };
var line = (label, value) => value ? `${label}: ${value}
` : "";
function buildSystemPrompt(brand) {
  const rules = brand.rules ?? {};
  const available = brand.products.filter((p) => p.status === "available");
  const soon = brand.products.filter((p) => p.status === "soon");
  const fmt = (p) => `- ${p.name}${p.details ? ` \u2014 ${p.details}` : ""}`;
  const contact = [brand.contact.whatsapp && `WhatsApp ${brand.contact.whatsapp}`, brand.contact.phone && `phone ${brand.contact.phone}`, brand.contact.website].filter(Boolean).join(", ");
  const hard = [
    'Only sell what is AVAILABLE. Products coming soon are only announced ("coming soon", "be the first to know"), never sold.',
    "Never invent facts, figures, promises, awards, discounts or certifications that are not written in this prompt.",
    "Technical advice must be accurate and cautious.",
    "Every post differs from the others: angle, title and theme."
  ];
  if (rules.hidePrices !== false) hard.push("Never give a price, a minimum quantity, a selling unit or a delivery delay: those are discussed privately with the customer.");
  for (const topic of rules.neverMention ?? []) hard.push(`Never mention: ${topic}.`);
  if (brand.fullName) hard.push(`When the full company name is used, write it exactly: "${brand.fullName}".`);
  for (const x of rules.extra ?? []) hard.push(x);
  return `You are the social media manager of ${brand.name}${brand.fullName ? ` (${brand.fullName})` : ""}.
You write Facebook and Instagram posts in ${LANGUAGE[brand.language]}, in simple and warm wording.
${line("Location", brand.location)}${line("Audience", brand.audience)}${line("Contact for the call to action", contact)}
Available now:
${available.length ? available.map(fmt).join("\n") : "- (nothing is sold yet: only announce)"}
${soon.length ? `
Coming soon:
${soon.map(fmt).join("\n")}
` : ""}
Rules you never break:
${hard.map((r) => "- " + r).join("\n")}`;
}
function buildUserPrompt(req) {
  const parts = [`Write ${req.count} post(s). They will be published one per day, in order.`];
  if (req.subject) parts.push(`Subject: ${req.subject}.`);
  if (req.tone) parts.push(`Tone: ${req.tone}.`);
  if (req.notes) parts.push(`Instruction from the manager: ${req.notes}`);
  if (req.avoidTitles?.length) parts.push(`Titles already used, do not repeat them:
${req.avoidTitles.map((t) => "- " + t).join("\n")}`);
  return parts.join("\n");
}

// src/core/schedule.ts
var SCHEDULE_MIN_MS = 10 * 6e4;
var SCHEDULE_MAX_MS = 30 * 864e5;
function planSchedule(count, start, time = "19:00", everyDays = 1) {
  const [h, m] = time.split(":").map((n) => Number.parseInt(n, 10));
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i * everyDays);
    d.setHours(Number.isFinite(h) ? h : 19, Number.isFinite(m) ? m : 0, 0, 0);
    return d;
  });
}
function assertSchedulable(at, now = /* @__PURE__ */ new Date()) {
  const delta = at.getTime() - now.getTime();
  if (!Number.isFinite(delta) || delta < SCHEDULE_MIN_MS || delta > SCHEDULE_MAX_MS) {
    throw new DolphinError("schedule_window", "The date must be between 10 minutes and 30 days from now.");
  }
}
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// src/core/cost.ts
var MODEL_PRICING = {
  "claude-opus-5-5": { input: 4, output: 20, label: "Claude Opus 5.5" },
  "claude-sonnet-5-5": { input: 2, output: 10, label: "Claude Sonnet 5.5" }
};
var DEFAULT_MODEL = "claude-opus-5-5";
function estimateCostUsd(usage, model) {
  const price = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL];
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1e6;
}
var estimatePerPostUsd = (model) => estimateCostUsd({ inputTokens: 3e3, outputTokens: 1500 }, model);

// src/adapters/llm/claude.ts
import Anthropic from "@anthropic-ai/sdk";
var ClaudeLlm = class {
  model;
  client;
  maxTokens;
  constructor(opts = {}) {
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? 16e3;
    this.client = opts.client ?? new Anthropic({
      ...opts.apiKey ? { apiKey: opts.apiKey } : {},
      ...opts.allowBrowser ? { dangerouslyAllowBrowser: true } : {}
    });
  }
  async generate(brand, request) {
    let message;
    try {
      message = await this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        system: buildSystemPrompt(brand),
        messages: [{ role: "user", content: buildUserPrompt(request) }],
        output_config: { format: { type: "json_schema", schema: POSTS_JSON_SCHEMA } }
      }).finalMessage();
    } catch (err) {
      throw toDolphinError(err);
    }
    if (message.stop_reason === "refusal") throw new DolphinError("refusal", "The model declined this request.");
    if (message.stop_reason === "max_tokens") throw new DolphinError("too_long", "The answer was cut: ask for fewer posts.");
    const text2 = message.content.flatMap((b) => b.type === "text" ? [b.text] : []).join("");
    let json;
    try {
      json = JSON.parse(text2);
    } catch {
      throw new DolphinError("invalid_output", "The model answer is not valid JSON.");
    }
    return {
      drafts: parseDrafts(json),
      usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
      model: message.model
    };
  }
};
function toDolphinError(err) {
  if (err instanceof DolphinError) return err;
  if (err instanceof Anthropic.APIConnectionError) return new DolphinError("network", "Cannot reach the Claude API.");
  if (err instanceof Anthropic.APIError) {
    const msg = err.message || "Claude API error.";
    switch (err.status) {
      case 401:
        return new DolphinError("auth", "Invalid Claude API key.", 401);
      case 403:
        return new DolphinError("permission", "This key has no access to this model.", 403);
      case 429:
        return new DolphinError("rate_limit", "Too many requests or spend limit reached.", 429);
      case 400:
        return /credit balance/i.test(msg) ? new DolphinError("quota", "Claude credit exhausted: top up the account.", 400) : new DolphinError("invalid_request", msg, 400);
      default:
        return (err.status ?? 0) >= 500 ? new DolphinError("overloaded", "The Claude API is overloaded, retry in a few minutes.", err.status) : new DolphinError("unknown", msg, err.status);
    }
  }
  return new DolphinError("unknown", err instanceof Error ? err.message : String(err));
}

// src/adapters/http.ts
async function call(o, method, path, body) {
  const f = o.fetch ?? globalThis.fetch.bind(globalThis);
  let res;
  try {
    res = await f(o.endpoint.replace(/\/+$/, "") + path, {
      method,
      headers: { "content-type": "application/json", ...o.token ? { authorization: `Bearer ${o.token}` } : {} },
      ...body === void 0 ? {} : { body: JSON.stringify(body) }
    });
  } catch {
    throw new DolphinError("network", "Cannot reach the DOLPHin server.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new DolphinError(data?.error?.code ?? "unknown", data?.error?.message ?? `Server error ${res.status}.`, res.status);
  return data;
}
var HttpLlm = class {
  constructor(opts) {
    this.opts = opts;
  }
  async generate(brand, request) {
    const r = await call(this.opts, "POST", "/v1/generate", { brand, request });
    return { drafts: parseDrafts({ posts: r.drafts }), usage: r.usage, model: r.model };
  }
};
async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(bin);
}
var HttpPublisher = class {
  constructor(opts) {
    this.opts = opts;
  }
  async publish(input) {
    return call(this.opts, "POST", "/v1/publish", {
      imageBase64: await blobToBase64(input.image),
      caption: input.caption,
      ...input.scheduledAt ? { scheduledAt: input.scheduledAt.toISOString() } : {}
    });
  }
  verify() {
    return call(this.opts, "GET", "/v1/publisher");
  }
};

// src/adapters/publish/meta.ts
var MetaPagePublisher = class {
  constructor(opts) {
    this.opts = opts;
    if (!opts.pageId || !opts.accessToken) throw new DolphinError("not_configured", "Facebook page id and access token are required.");
    this.base = `https://graph.facebook.com/${opts.graphVersion ?? "v23.0"}/${encodeURIComponent(opts.pageId)}`;
  }
  base;
  async publish({ image, caption, scheduledAt }) {
    const form = new FormData();
    form.append("source", image, "dolphin.png");
    form.append("message", caption);
    form.append("access_token", this.opts.accessToken);
    if (scheduledAt) {
      assertSchedulable(scheduledAt);
      form.append("published", "false");
      form.append("unpublished_content_type", "SCHEDULED");
      form.append("scheduled_publish_time", String(Math.floor(scheduledAt.getTime() / 1e3)));
    }
    const data = await this.request(`${this.base}/photos`, { method: "POST", body: form });
    return { id: data.post_id ?? data.id ?? "" };
  }
  async verify() {
    const url = `${this.base}?fields=name&access_token=${encodeURIComponent(this.opts.accessToken)}`;
    const data = await this.request(url, { method: "GET" });
    return { name: data.name ?? "" };
  }
  async request(url, init) {
    const f = this.opts.fetch ?? globalThis.fetch.bind(globalThis);
    let res;
    try {
      res = await f(url, init);
    } catch {
      throw new DolphinError("network", "Cannot reach Facebook.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw graphError(data.error ?? {}, res.status);
    return data;
  }
};
function graphError(e, status) {
  const msg = e.message ?? "Facebook error.";
  switch (e.code) {
    case 190:
      return new DolphinError("auth", "The page token is invalid or expired.", status);
    case 3:
    case 10:
    case 200:
      return new DolphinError("permission", "The token lacks pages_manage_posts for this page.", status);
    case 4:
    case 32:
    case 368:
      return new DolphinError("rate_limit", "Facebook is temporarily limiting posts.", status);
    case 100:
      return /schedul/i.test(msg) ? new DolphinError("schedule_window", "The date must be between 10 minutes and 30 days from now.", status) : new DolphinError("invalid_request", "Wrong page id, or the page is not reachable with this token.", status);
    default:
      return new DolphinError("unknown", msg, status);
  }
}

// src/adapters/storage/index.ts
var MemoryStore = class {
  map = /* @__PURE__ */ new Map();
  async get(key) {
    return this.map.get(key) ?? null;
  }
  async set(key, value) {
    this.map.set(key, value);
  }
  async delete(key) {
    this.map.delete(key);
  }
};
var LocalStore = class {
  constructor(prefix = "dolphin:") {
    this.prefix = prefix;
  }
  fallback = new MemoryStore();
  ls() {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }
  async get(key) {
    try {
      const v = this.ls()?.getItem(this.prefix + key);
      if (v != null) return v;
    } catch {
    }
    return this.fallback.get(key);
  }
  async set(key, value) {
    try {
      this.ls()?.setItem(this.prefix + key, value);
    } catch {
    }
    await this.fallback.set(key, value);
  }
  async delete(key) {
    try {
      this.ls()?.removeItem(this.prefix + key);
    } catch {
    }
    await this.fallback.delete(key);
  }
};

// src/adapters/secrets/vault.ts
var ITERATIONS = 31e4;
var KEY = "vault";
var enc = new TextEncoder();
var dec = new TextDecoder();
var b64 = (u8) => btoa(String.fromCharCode(...u8));
var unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
var Vault = class {
  constructor(store) {
    this.store = store;
  }
  async exists() {
    return await this.store.get(KEY) != null;
  }
  async seal(passphrase, secrets) {
    if (passphrase.length < 8) throw new DolphinError("invalid_request", "The passphrase needs at least 8 characters.");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(secrets))));
    await this.store.set(KEY, JSON.stringify({ v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) }));
  }
  async open(passphrase) {
    const raw = await this.store.get(KEY);
    if (!raw) throw new DolphinError("not_configured", "No vault on this device.");
    try {
      const v = JSON.parse(raw);
      const key = await deriveKey(passphrase, unb64(v.salt));
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(v.iv) }, key, unb64(v.ct));
      return JSON.parse(dec.decode(pt));
    } catch {
      throw new DolphinError("auth", "Wrong passphrase.");
    }
  }
  async reset() {
    await this.store.delete(KEY);
  }
};

// src/render/theme.ts
function rgb(hex) {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = Number.parseInt(h.slice(0, 6), 16);
  return Number.isFinite(n) ? [n >> 16 & 255, n >> 8 & 255, n & 255] : [0, 0, 0];
}
var rgba = (hex, a) => `rgba(${rgb(hex).join(",")},${a})`;
function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
var readableOn = (bg, dark) => contrast(bg, "#ffffff") >= contrast(bg, dark) ? "#ffffff" : dark;
function mix(hex, withHex, t) {
  const a = rgb(hex), b = rgb(withHex);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
function paletteFor(colors, theme) {
  const { primary, accent } = colors;
  const light = colors.light ?? mix(primary, "#ffffff", 0.94);
  switch (theme) {
    case "light":
      return {
        bg: light,
        fg: primary,
        accent,
        glow: [rgba(accent, 0.22), rgba(primary, 0.12)],
        tagBg: "#ffffff",
        tagFg: accent,
        tagLine: accent,
        markBg: primary,
        markFg: readableOn(primary, "#111111"),
        bar: primary,
        barFg: readableOn(primary, "#111111"),
        logo: "onLight"
      };
    case "accent": {
      const fg = readableOn(accent, primary);
      return {
        bg: accent,
        fg,
        accent: fg === "#ffffff" ? primary : "#ffffff",
        glow: [rgba("#ffffff", 0.3), rgba(primary, 0.3)],
        tagBg: primary,
        tagFg: readableOn(primary, "#111111"),
        tagLine: "",
        markBg: fg,
        markFg: accent,
        bar: primary,
        barFg: readableOn(primary, "#111111"),
        logo: "plate"
      };
    }
    default:
      return {
        bg: primary,
        fg: readableOn(primary, "#111111"),
        accent,
        glow: [rgba(accent, 0.25), rgba(accent, 0.18)],
        tagBg: "rgba(255,255,255,.12)",
        tagFg: accent,
        tagLine: rgba(accent, 0.5),
        markBg: accent,
        markFg: readableOn(accent, primary),
        bar: accent,
        barFg: readableOn(accent, primary),
        logo: "onDark"
      };
  }
}

// src/render/poster.ts
var POSTER_WIDTH = 1080;
var POSTER_HEIGHT = 1350;
var DEFAULT_FONTS = {
  display: '"Outfit", "Segoe UI", system-ui, sans-serif',
  body: '"Source Sans 3", "Segoe UI", system-ui, sans-serif'
};
var sizeOf = (img) => {
  const i = img;
  const w = i.naturalWidth || (typeof i.width === "number" ? i.width : 0);
  const h = i.naturalHeight || (typeof i.height === "number" ? i.height : 0);
  return [w || 1, h || 1];
};
function wrapText(ctx, text2, maxWidth) {
  const lines = [];
  for (const paragraph of String(text2 || "").split("\n")) {
    let line2 = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line2 ? `${line2} ${word}` : word;
      if (line2 && ctx.measureText(next).width > maxWidth) {
        lines.push(line2);
        line2 = word;
      } else line2 = next;
    }
    if (line2) lines.push(line2);
  }
  return lines;
}
function drawPoster(ctx, post, brand, assets = {}) {
  const W = POSTER_WIDTH, H = POSTER_HEIGHT, M = 80, BAR = 170, MAXW = W - 2 * M;
  const F = assets.fonts ?? DEFAULT_FONTS;
  const T = paletteFor(brand.colors, post.theme);
  const rtl = brand.language === "ar";
  const x = (v, w = 0) => rtl ? W - v - w : v;
  const start = rtl ? "right" : "left";
  const end = rtl ? "left" : "right";
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);
  const glow = (gx, gy, r, color) => {
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(x(W * 0.92), H * 0.08, 640, T.glow[0]);
  glow(x(0), H, 560, T.glow[1]);
  const lh = 118;
  let lw = 0;
  if (assets.logo) {
    const [iw, ih] = sizeOf(assets.logo);
    lw = Math.min(lh * iw / ih, 420);
    if (T.logo === "plate") {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(x(M - 20, lw + 40), 60, lw + 40, lh + 24, 26);
      ctx.fill();
    }
    ctx.drawImage(assets.logo, x(M, lw), 72, lw, lh);
  }
  if (post.tag) {
    ctx.font = `700 26px ${F.display}`;
    const label = post.tag.toUpperCase();
    const tw = Math.min(ctx.measureText(label).width + 56, W - 2 * M - lw - 40);
    const tx = x(W - M - tw, tw), ty = 72 + lh / 2 - 30;
    ctx.fillStyle = T.tagBg;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, 60, 30);
    ctx.fill();
    if (T.tagLine) {
      ctx.strokeStyle = T.tagLine;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = T.tagFg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, tx + tw / 2, ty + 31, tw - 40);
  }
  const points = post.points.filter(Boolean).slice(0, 6);
  const top = 290, bottom = H - BAR - 50;
  let L;
  for (let s2 = 1; s2 >= 0.6; s2 -= 0.04) {
    ctx.font = `800 ${88 * s2}px ${F.display}`;
    const title2 = wrapText(ctx, post.title, MAXW);
    ctx.font = `700 ${50 * s2}px ${F.display}`;
    const sub2 = wrapText(ctx, post.subtitle, MAXW);
    ctx.font = `700 ${40 * s2}px ${F.body}`;
    const pts2 = points.map((t) => wrapText(ctx, t, MAXW - 96 * s2));
    const rows2 = pts2.map((l) => Math.max(68 * s2, l.length * 48 * s2));
    const h2 = title2.length * 94 * s2 + (sub2.length ? 20 * s2 + sub2.length * 60 * s2 : 0) + (rows2.length ? 48 * s2 + rows2.reduce((a, r) => a + r + 26 * s2, 0) - 26 * s2 : 0);
    L = { s: s2, title: title2, sub: sub2, pts: pts2, rows: rows2, h: h2 };
    if (top + h2 <= bottom) break;
  }
  const { s, title, sub, pts, rows, h } = L;
  let y = top + Math.max(0, (bottom - top - h) * 0.4);
  ctx.textAlign = start;
  ctx.textBaseline = "top";
  ctx.fillStyle = T.fg;
  ctx.font = `800 ${88 * s}px ${F.display}`;
  for (const l of title) {
    ctx.fillText(l, x(M), y);
    y += 94 * s;
  }
  if (sub.length) {
    y += 20 * s;
    ctx.fillStyle = T.accent;
    ctx.font = `700 ${50 * s}px ${F.display}`;
    for (const l of sub) {
      ctx.fillText(l, x(M), y);
      y += 60 * s;
    }
  }
  if (rows.length) y += 48 * s;
  pts.forEach((lines, i) => {
    const r = 34 * s, rowH = rows[i], cy = y + rowH / 2, cx = x(M + r);
    ctx.fillStyle = T.markBg;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = T.markFg;
    ctx.strokeStyle = T.markFg;
    ctx.textBaseline = "middle";
    if (post.style === "steps") {
      ctx.font = `800 ${34 * s}px ${F.display}`;
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), cx, cy + 2 * s);
    } else {
      ctx.lineWidth = 5 * s;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(cx - 14 * s, cy + s);
      ctx.lineTo(cx - 4 * s, cy + 11 * s);
      ctx.lineTo(cx + 15 * s, cy - 10 * s);
      ctx.stroke();
    }
    ctx.textAlign = start;
    ctx.fillStyle = T.fg;
    ctx.font = `700 ${40 * s}px ${F.body}`;
    lines.forEach((l, j) => ctx.fillText(l, x(M + 96 * s), cy + (j - (lines.length - 1) / 2) * 48 * s));
    y += rowH + 26 * s;
  });
  const by = H - BAR, cyb = by + BAR / 2;
  ctx.fillStyle = T.bar;
  ctx.fillRect(0, by, W, BAR);
  const contact = brand.contact.whatsapp ?? brand.contact.phone ?? brand.contact.website ?? "";
  const icx = x(M + 38);
  ctx.fillStyle = brand.contact.whatsapp ? "#25d366" : "rgba(255,255,255,.18)";
  ctx.beginPath();
  ctx.arc(icx, cyb, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(icx, cyb - 1, 19, Math.PI * 0.75, Math.PI * 2.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(icx - 14, cyb + 12);
  ctx.lineTo(icx - 20, cyb + 21);
  ctx.lineTo(icx - 8, cyb + 17);
  ctx.stroke();
  ctx.fillStyle = T.barFg;
  ctx.textBaseline = "alphabetic";
  const [l1, l2] = brand.footerLines ?? [brand.contact.callToAction ?? ""];
  ctx.font = `700 26px ${F.display}`;
  const ctaW = Math.min(380, Math.max(ctx.measureText(l1 ?? "").width, ctx.measureText(l2 ?? "").width));
  ctx.textAlign = end;
  if (l2) {
    ctx.fillText(l1, x(W - M), cyb - 6, 380);
    ctx.fillText(l2, x(W - M), cyb + 32, 380);
  } else if (l1) ctx.fillText(l1, x(W - M), cyb + 12, 380);
  ctx.textAlign = start;
  if (assets.contactLabel) {
    ctx.globalAlpha = 0.85;
    ctx.font = `700 24px ${F.body}`;
    ctx.fillText(assets.contactLabel.toUpperCase(), x(M + 98), cyb - 14);
    ctx.globalAlpha = 1;
  }
  const room = MAXW - 98 - (ctaW ? ctaW + 32 : 0);
  let size = 42;
  do {
    ctx.font = `800 ${size}px ${F.display}`;
  } while (ctx.measureText(contact).width > room && (size -= 2) > 22);
  ctx.direction = "ltr";
  ctx.textAlign = rtl ? "right" : "left";
  ctx.fillText(contact, x(M + 98), assets.contactLabel ? cyb + 30 : cyb + 15, room);
  ctx.direction = rtl ? "rtl" : "ltr";
}
var CanvasPosterRenderer = class {
  constructor(options = {}) {
    this.options = options;
  }
  images = /* @__PURE__ */ new Map();
  loadImage(url) {
    if (!url) return Promise.resolve(null);
    let p = this.images.get(url);
    if (!p) {
      p = new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
      this.images.set(url, p);
    }
    return p;
  }
  async logoFor(post, brand) {
    const variant = paletteFor(brand.colors, post.theme).logo;
    return this.loadImage(variant === "onDark" ? brand.logoOnDarkUrl ?? brand.logoUrl : brand.logoUrl);
  }
  async draw(canvas, post, brand) {
    const fonts = this.options.fonts ?? DEFAULT_FONTS;
    await Promise.all([`800 80px ${fonts.display}`, `700 40px ${fonts.body}`].map((f) => document.fonts?.load(f).catch(() => void 0)));
    const logo = await this.logoFor(post, brand);
    canvas.width = POSTER_WIDTH;
    canvas.height = POSTER_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available.");
    drawPoster(ctx, post, brand, { logo, fonts, ...this.options.contactLabel ? { contactLabel: this.options.contactLabel } : {} });
  }
  async render(post, brand) {
    const canvas = document.createElement("canvas");
    await this.draw(canvas, post, brand);
    return new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("PNG export failed.")), "image/png"));
  }
};

// src/app/studio.ts
var EDITABLE = ["tag", "title", "subtitle", "points", "style", "theme", "caption", "hashtags", "scheduledAt"];
var DolphinStudio = class {
  constructor(deps) {
    this.deps = deps;
    this.key = `posts:${deps.brand.id}`;
    this.now = deps.now ?? (() => /* @__PURE__ */ new Date());
    this.newId = deps.newId ?? (() => globalThis.crypto.randomUUID());
  }
  posts = [];
  listeners = /* @__PURE__ */ new Set();
  key;
  now;
  newId;
  loaded = false;
  get brand() {
    return this.deps.brand;
  }
  get canGenerate() {
    return !!this.deps.llm;
  }
  get canPublish() {
    return !!this.deps.publisher;
  }
  /** Swap adapters at runtime (e.g. after the user unlocks their keys). */
  connect(adapters) {
    this.deps = { ...this.deps, ...adapters };
    this.emit();
  }
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  async load() {
    if (!this.loaded) {
      try {
        this.posts = JSON.parse(await this.deps.store.get(this.key) ?? "[]");
      } catch {
        this.posts = [];
      }
      this.loaded = true;
    }
    return this.list();
  }
  list() {
    return this.posts;
  }
  get(id) {
    return this.posts.find((p) => p.id === id);
  }
  async generate(opts) {
    if (!this.deps.llm) throw new DolphinError("not_configured", "No language model is connected.");
    const count = Math.min(MAX_POSTS, Math.max(1, Math.floor(opts.count)));
    const avoidTitles = [...opts.avoidTitles ?? [], ...this.posts.slice(-15).map((p) => p.title)];
    const result = await this.deps.llm.generate(this.brand, { ...opts, count, avoidTitles });
    const now = this.now();
    const start = opts.startDate ?? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const slots = planSchedule(result.drafts.length, start, opts.time, opts.everyDays);
    const created = result.drafts.map((d, i) => ({
      ...d,
      id: this.newId(),
      createdAt: now.toISOString(),
      scheduledAt: slots[i].toISOString(),
      status: "draft"
    }));
    this.posts = [...this.posts, ...created];
    await this.save();
    return { posts: created, usage: result.usage, model: result.model };
  }
  async update(id, patch) {
    const post = this.require(id);
    if (post.status !== "draft" && post.status !== "failed") throw new DolphinError("invalid_request", "This post was already sent.");
    const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => EDITABLE.includes(k)));
    const next = { ...post, ...clean };
    this.posts = this.posts.map((p) => p.id === id ? next : p);
    await this.save();
    return next;
  }
  async remove(id) {
    this.posts = this.posts.filter((p) => p.id !== id);
    await this.save();
  }
  async clear() {
    this.posts = [];
    await this.save();
  }
  renderImage(id) {
    return this.deps.renderer.render(this.require(id), this.brand);
  }
  caption(id) {
    return fullCaption(this.require(id));
  }
  /** Publishes now (`schedule: false`) or at each post's `scheduledAt`. */
  async send(ids, schedule) {
    const publisher = this.deps.publisher;
    if (!publisher) throw new DolphinError("not_configured", "No publishing account is connected.");
    const report = { sent: [], failed: [] };
    for (const id of ids) {
      const post = this.get(id);
      if (!post || post.status !== "draft" && post.status !== "failed") continue;
      try {
        const at = schedule ? new Date(post.scheduledAt) : void 0;
        if (at) assertSchedulable(at, this.now());
        const image = await this.deps.renderer.render(post, this.brand);
        const { id: externalId } = await publisher.publish({ image, caption: fullCaption(post), ...at ? { scheduledAt: at } : {} });
        this.replace({ ...post, status: schedule ? "scheduled" : "published", externalId, error: void 0, errorCode: void 0 });
        report.sent.push(id);
      } catch (err) {
        const error = isDolphinError(err) ? err : new DolphinError("unknown", err instanceof Error ? err.message : String(err));
        this.replace({ ...post, status: "failed", error: error.message, errorCode: error.code });
        report.failed.push({ id, error });
      }
      await this.save();
    }
    return report;
  }
  sendAllScheduled() {
    return this.send(this.posts.filter((p) => p.status === "draft" || p.status === "failed").map((p) => p.id), true);
  }
  require(id) {
    const p = this.get(id);
    if (!p) throw new DolphinError("invalid_request", `Unknown post ${id}.`);
    return p;
  }
  replace(post) {
    const clean = { ...post };
    if (clean.error === void 0) delete clean.error;
    if (clean.errorCode === void 0) delete clean.errorCode;
    this.posts = this.posts.map((p) => p.id === post.id ? clean : p);
  }
  async save() {
    await this.deps.store.set(this.key, JSON.stringify(this.posts));
    this.emit();
  }
  emit() {
    for (const fn of this.listeners) fn(this.posts);
  }
};

// src/widget/i18n.ts
var fr = {
  tagline: "Studio IA \xB7 publications et affiches automatiques",
  beta: "b\xEAta",
  lockTitle: "D\xE9verrouiller le studio",
  lockIntro: "Vos cl\xE9s sont chiffr\xE9es sur cet appareil.",
  setupTitle: "Prot\xE9ger vos cl\xE9s",
  setupIntro: "Choisissez une phrase secr\xE8te (8 caract\xE8res minimum) : elle chiffre vos cl\xE9s sur cet appareil.",
  passphrase: "Phrase secr\xE8te",
  confirm: "Confirmer",
  unlock: "D\xE9verrouiller",
  create: "Cr\xE9er",
  lock: "Verrouiller",
  forgot: "Effacer les cl\xE9s de cet appareil",
  forgotConfirm: "Confirmer l'effacement",
  mismatch: "Les deux phrases ne sont pas identiques.",
  connections: "Connexions",
  claudeKey: "Cl\xE9 API Claude",
  claudeHelp: "console.anthropic.com \u2192 API Keys. Ajoutez un cr\xE9dit et une limite de d\xE9pense.",
  pageId: "ID de la page Facebook",
  pageToken: "Jeton de la page (pages_manage_posts)",
  keyOk: "Cl\xE9 Claude enregistr\xE9e.",
  keyMissing: "Aucune cl\xE9 Claude : la g\xE9n\xE9ration est d\xE9sactiv\xE9e.",
  fbOk: "Page Facebook connect\xE9e.",
  fbMissing: "Page Facebook non connect\xE9e : t\xE9l\xE9chargement et copie seulement.",
  save: "Enregistrer",
  test: "Tester",
  saved: "Connexions enregistr\xE9es.",
  proxyOk: "Connect\xE9 au serveur DOLPHin.",
  create_: "Cr\xE9er avec l'IA",
  subject: "Sujet",
  tone: "Ton",
  count: "Nombre de publications",
  startDate: "Premi\xE8re publication le",
  time: "Heure (une par jour)",
  notes: "Id\xE9e ou consigne (optionnel)",
  notesPh: "Ex. : nouvelle fourn\xE9e cette semaine",
  generate: "G\xE9n\xE9rer les publications",
  generating: "G\xE9n\xE9ration en cours\u2026",
  costHint: "Co\xFBt estim\xE9 : environ {cost} $ par publication.",
  posts: "Publications",
  empty: "Aucune publication pour l'instant.",
  scheduleAll: "Programmer tout",
  clearAll: "Tout effacer",
  confirmQ: "Confirmer ?",
  tag: "\xC9tiquette",
  theme: "Couleurs",
  title: "Titre",
  subtitle: "Sous-titre",
  points: "Points (un par ligne)",
  style: "Pr\xE9sentation",
  caption: "Texte de la publication",
  hashtags: "Hashtags",
  when: "Date et heure",
  themes: { dark: "Fonc\xE9", light: "Clair", accent: "Accent" },
  styles: { checks: "Coches", steps: "\xC9tapes" },
  download: "T\xE9l\xE9charger",
  copy: "Copier le texte",
  schedule: "Programmer",
  publishNow: "Publier maintenant",
  remove: "Supprimer",
  status: { draft: "Brouillon", scheduled: "Programm\xE9e", published: "Publi\xE9e", failed: "\xC9chec" },
  copied: "Texte copi\xE9.",
  generated: "{n} publication(s) pr\xEAte(s). Co\xFBt : environ {cost} $.",
  sent: "{n} publication(s) envoy\xE9e(s).",
  partly: "{ok} envoy\xE9e(s), {ko} en \xE9chec.",
  subjects: { mix: "Un peu de tout", sell: "Vendre les produits disponibles", tips: "Conseils utiles", trust: "Confiance et coulisses", soon: "Annoncer les nouveaut\xE9s" },
  tones: { warm: "Chaleureux", pro: "Professionnel", bold: "\xC9nergique" },
  contact: "Contact",
  errors: {
    auth: "Cl\xE9 ou jeton invalide.",
    permission: "Permission manquante.",
    quota: "Cr\xE9dit \xE9puis\xE9 : rechargez votre compte.",
    rate_limit: "Trop de demandes : r\xE9essayez dans une minute.",
    overloaded: "Service surcharg\xE9 : r\xE9essayez plus tard.",
    network: "Connexion impossible.",
    invalid_request: "Demande invalide.",
    invalid_output: "R\xE9ponse inattendue de l'IA : r\xE9essayez.",
    refusal: "L'IA a refus\xE9 : reformulez la consigne.",
    too_long: "R\xE9ponse trop longue : demandez moins de publications.",
    schedule_window: "Choisissez une date entre 10 minutes et 30 jours.",
    not_configured: "Service non configur\xE9.",
    unknown: "Erreur inattendue."
  }
};
var en = {
  tagline: "AI studio \xB7 automatic posts and posters",
  beta: "beta",
  lockTitle: "Unlock the studio",
  lockIntro: "Your keys are encrypted on this device.",
  setupTitle: "Protect your keys",
  setupIntro: "Choose a passphrase (8 characters minimum): it encrypts your keys on this device.",
  passphrase: "Passphrase",
  confirm: "Confirm",
  unlock: "Unlock",
  create: "Create",
  lock: "Lock",
  forgot: "Erase keys from this device",
  forgotConfirm: "Confirm erase",
  mismatch: "The passphrases do not match.",
  connections: "Connections",
  claudeKey: "Claude API key",
  claudeHelp: "console.anthropic.com \u2192 API Keys. Add credit and a spend limit.",
  pageId: "Facebook page ID",
  pageToken: "Page token (pages_manage_posts)",
  keyOk: "Claude key saved.",
  keyMissing: "No Claude key: generation is disabled.",
  fbOk: "Facebook page connected.",
  fbMissing: "Facebook page not connected: download and copy only.",
  save: "Save",
  test: "Test",
  saved: "Connections saved.",
  proxyOk: "Connected to the DOLPHin server.",
  create_: "Create with AI",
  subject: "Subject",
  tone: "Tone",
  count: "Number of posts",
  startDate: "First post on",
  time: "Time (one per day)",
  notes: "Idea or instruction (optional)",
  notesPh: "E.g.: new batch this week",
  generate: "Generate posts",
  generating: "Generating\u2026",
  costHint: "Estimated cost: about ${cost} per post.",
  posts: "Posts",
  empty: "No posts yet.",
  scheduleAll: "Schedule all",
  clearAll: "Clear all",
  confirmQ: "Confirm?",
  tag: "Label",
  theme: "Colors",
  title: "Title",
  subtitle: "Subtitle",
  points: "Points (one per line)",
  style: "Layout",
  caption: "Post text",
  hashtags: "Hashtags",
  when: "Date and time",
  themes: { dark: "Dark", light: "Light", accent: "Accent" },
  styles: { checks: "Checks", steps: "Steps" },
  download: "Download",
  copy: "Copy text",
  schedule: "Schedule",
  publishNow: "Publish now",
  remove: "Delete",
  status: { draft: "Draft", scheduled: "Scheduled", published: "Published", failed: "Failed" },
  copied: "Text copied.",
  generated: "{n} post(s) ready. Cost: about ${cost}.",
  sent: "{n} post(s) sent.",
  partly: "{ok} sent, {ko} failed.",
  subjects: { mix: "A bit of everything", sell: "Sell available products", tips: "Useful tips", trust: "Trust and behind the scenes", soon: "Announce what's coming" },
  tones: { warm: "Warm", pro: "Professional", bold: "Bold" },
  contact: "Contact",
  errors: {
    auth: "Invalid key or token.",
    permission: "Missing permission.",
    quota: "Credit exhausted: top up your account.",
    rate_limit: "Too many requests: retry in a minute.",
    overloaded: "Service overloaded: retry later.",
    network: "Cannot connect.",
    invalid_request: "Invalid request.",
    invalid_output: "Unexpected AI answer: retry.",
    refusal: "The AI declined: rephrase the instruction.",
    too_long: "Answer too long: ask for fewer posts.",
    schedule_window: "Pick a date between 10 minutes and 30 days.",
    not_configured: "Service not configured.",
    unknown: "Unexpected error."
  }
};
var ar = {
  tagline: "\u0627\u0633\u062A\u0648\u062F\u064A\u0648 \u0630\u0643\u0627\u0621 \u0627\u0635\u0637\u0646\u0627\u0639\u064A \xB7 \u0645\u0646\u0634\u0648\u0631\u0627\u062A \u0648\u0645\u0644\u0635\u0642\u0627\u062A \u062A\u0644\u0642\u0627\u0626\u064A\u0629",
  beta: "\u062A\u062C\u0631\u064A\u0628\u064A",
  lockTitle: "\u0641\u062A\u062D \u0627\u0644\u0627\u0633\u062A\u0648\u062F\u064A\u0648",
  lockIntro: "\u0645\u0641\u0627\u062A\u064A\u062D\u0643 \u0645\u0634\u0641\u0651\u0631\u0629 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632.",
  setupTitle: "\u0627\u062D\u0645\u0650 \u0645\u0641\u0627\u062A\u064A\u062D\u0643",
  setupIntro: "\u0627\u062E\u062A\u0631 \u0639\u0628\u0627\u0631\u0629 \u0633\u0631\u064A\u0629 (8 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644): \u062A\u064F\u0633\u062A\u062E\u062F\u0645 \u0644\u062A\u0634\u0641\u064A\u0631 \u0645\u0641\u0627\u062A\u064A\u062D\u0643 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632.",
  passphrase: "\u0627\u0644\u0639\u0628\u0627\u0631\u0629 \u0627\u0644\u0633\u0631\u064A\u0629",
  confirm: "\u062A\u0623\u0643\u064A\u062F",
  unlock: "\u0641\u062A\u062D",
  create: "\u0625\u0646\u0634\u0627\u0621",
  lock: "\u0642\u0641\u0644",
  forgot: "\u0645\u0633\u062D \u0627\u0644\u0645\u0641\u0627\u062A\u064A\u062D \u0645\u0646 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632",
  forgotConfirm: "\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u0645\u0633\u062D",
  mismatch: "\u0627\u0644\u0639\u0628\u0627\u0631\u062A\u0627\u0646 \u063A\u064A\u0631 \u0645\u062A\u0637\u0627\u0628\u0642\u062A\u064A\u0646.",
  connections: "\u0627\u0644\u0627\u062A\u0635\u0627\u0644\u0627\u062A",
  claudeKey: "\u0645\u0641\u062A\u0627\u062D Claude API",
  claudeHelp: "console.anthropic.com \u2190 API Keys. \u0623\u0636\u0641 \u0631\u0635\u064A\u062F\u064B\u0627 \u0648\u062D\u062F\u064B\u0627 \u0644\u0644\u0625\u0646\u0641\u0627\u0642.",
  pageId: "\u0645\u0639\u0631\u0651\u0641 \u0635\u0641\u062D\u0629 \u0641\u064A\u0633\u0628\u0648\u0643",
  pageToken: "\u0631\u0645\u0632 \u0627\u0644\u0635\u0641\u062D\u0629 (pages_manage_posts)",
  keyOk: "\u062A\u0645 \u062D\u0641\u0638 \u0645\u0641\u062A\u0627\u062D Claude.",
  keyMissing: "\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u0641\u062A\u0627\u062D Claude: \u0627\u0644\u062A\u0648\u0644\u064A\u062F \u0645\u0639\u0637\u0651\u0644.",
  fbOk: "\u0635\u0641\u062D\u0629 \u0641\u064A\u0633\u0628\u0648\u0643 \u0645\u062A\u0635\u0644\u0629.",
  fbMissing: "\u0635\u0641\u062D\u0629 \u0641\u064A\u0633\u0628\u0648\u0643 \u063A\u064A\u0631 \u0645\u062A\u0635\u0644\u0629: \u0627\u0644\u062A\u0646\u0632\u064A\u0644 \u0648\u0627\u0644\u0646\u0633\u062E \u0641\u0642\u0637.",
  save: "\u062D\u0641\u0638",
  test: "\u0627\u062E\u062A\u0628\u0627\u0631",
  saved: "\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0627\u062A\u0635\u0627\u0644\u0627\u062A.",
  proxyOk: "\u0645\u062A\u0635\u0644 \u0628\u062E\u0627\u062F\u0645 DOLPHin.",
  create_: "\u0625\u0646\u0634\u0627\u0621 \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A",
  subject: "\u0627\u0644\u0645\u0648\u0636\u0648\u0639",
  tone: "\u0627\u0644\u0623\u0633\u0644\u0648\u0628",
  count: "\u0639\u062F\u062F \u0627\u0644\u0645\u0646\u0634\u0648\u0631\u0627\u062A",
  startDate: "\u0623\u0648\u0644 \u0645\u0646\u0634\u0648\u0631 \u064A\u0648\u0645",
  time: "\u0627\u0644\u0633\u0627\u0639\u0629 (\u0645\u0646\u0634\u0648\u0631 \u064A\u0648\u0645\u064A\u064B\u0627)",
  notes: "\u0641\u0643\u0631\u0629 \u0623\u0648 \u062A\u0639\u0644\u064A\u0645\u0627\u062A (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)",
  notesPh: "\u0645\u062B\u0627\u0644: \u062F\u0641\u0639\u0629 \u062C\u062F\u064A\u062F\u0629 \u0647\u0630\u0627 \u0627\u0644\u0623\u0633\u0628\u0648\u0639",
  generate: "\u062A\u0648\u0644\u064A\u062F \u0627\u0644\u0645\u0646\u0634\u0648\u0631\u0627\u062A",
  generating: "\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u0648\u0644\u064A\u062F\u2026",
  costHint: "\u0627\u0644\u062A\u0643\u0644\u0641\u0629 \u0627\u0644\u062A\u0642\u062F\u064A\u0631\u064A\u0629: \u062D\u0648\u0627\u0644\u064A {cost} $ \u0644\u0644\u0645\u0646\u0634\u0648\u0631.",
  posts: "\u0627\u0644\u0645\u0646\u0634\u0648\u0631\u0627\u062A",
  empty: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0646\u0634\u0648\u0631\u0627\u062A \u0628\u0639\u062F.",
  scheduleAll: "\u062C\u062F\u0648\u0644\u0629 \u0627\u0644\u0643\u0644",
  clearAll: "\u0645\u0633\u062D \u0627\u0644\u0643\u0644",
  confirmQ: "\u062A\u0623\u0643\u064A\u062F\u061F",
  tag: "\u0627\u0644\u0648\u0633\u0645",
  theme: "\u0627\u0644\u0623\u0644\u0648\u0627\u0646",
  title: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646",
  subtitle: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0641\u0631\u0639\u064A",
  points: "\u0627\u0644\u0646\u0642\u0627\u0637 (\u0633\u0637\u0631 \u0644\u0643\u0644 \u0646\u0642\u0637\u0629)",
  style: "\u0627\u0644\u0639\u0631\u0636",
  caption: "\u0646\u0635 \u0627\u0644\u0645\u0646\u0634\u0648\u0631",
  hashtags: "\u0627\u0644\u0648\u0633\u0648\u0645",
  when: "\u0627\u0644\u062A\u0627\u0631\u064A\u062E \u0648\u0627\u0644\u0633\u0627\u0639\u0629",
  themes: { dark: "\u062F\u0627\u0643\u0646", light: "\u0641\u0627\u062A\u062D", accent: "\u0645\u0645\u064A\u0651\u0632" },
  styles: { checks: "\u0639\u0644\u0627\u0645\u0627\u062A", steps: "\u062E\u0637\u0648\u0627\u062A" },
  download: "\u062A\u0646\u0632\u064A\u0644",
  copy: "\u0646\u0633\u062E \u0627\u0644\u0646\u0635",
  schedule: "\u062C\u062F\u0648\u0644\u0629",
  publishNow: "\u0646\u0634\u0631 \u0627\u0644\u0622\u0646",
  remove: "\u062D\u0630\u0641",
  status: { draft: "\u0645\u0633\u0648\u062F\u0629", scheduled: "\u0645\u062C\u062F\u0648\u0644", published: "\u0645\u0646\u0634\u0648\u0631", failed: "\u0641\u0634\u0644" },
  copied: "\u062A\u0645 \u0646\u0633\u062E \u0627\u0644\u0646\u0635.",
  generated: "{n} \u0645\u0646\u0634\u0648\u0631 \u062C\u0627\u0647\u0632. \u0627\u0644\u062A\u0643\u0644\u0641\u0629: \u062D\u0648\u0627\u0644\u064A {cost} $.",
  sent: "\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 {n} \u0645\u0646\u0634\u0648\u0631.",
  partly: "\u0623\u064F\u0631\u0633\u0644 {ok}\u060C \u0648\u0641\u0634\u0644 {ko}.",
  subjects: { mix: "\u0642\u0644\u064A\u0644 \u0645\u0646 \u0643\u0644 \u0634\u064A\u0621", sell: "\u0628\u064A\u0639 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u0627\u0644\u0645\u062A\u0648\u0641\u0631\u0629", tips: "\u0646\u0635\u0627\u0626\u062D \u0645\u0641\u064A\u062F\u0629", trust: "\u0627\u0644\u062B\u0642\u0629 \u0648\u0645\u0627 \u0648\u0631\u0627\u0621 \u0627\u0644\u0643\u0648\u0627\u0644\u064A\u0633", soon: "\u0627\u0644\u0625\u0639\u0644\u0627\u0646 \u0639\u0646 \u0627\u0644\u062C\u062F\u064A\u062F" },
  tones: { warm: "\u0648\u062F\u0648\u062F", pro: "\u0627\u062D\u062A\u0631\u0627\u0641\u064A", bold: "\u062D\u0645\u0627\u0633\u064A" },
  contact: "\u062A\u0648\u0627\u0635\u0644",
  errors: {
    auth: "\u0645\u0641\u062A\u0627\u062D \u0623\u0648 \u0631\u0645\u0632 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.",
    permission: "\u0635\u0644\u0627\u062D\u064A\u0629 \u0646\u0627\u0642\u0635\u0629.",
    quota: "\u0646\u0641\u062F \u0627\u0644\u0631\u0635\u064A\u062F: \u0627\u0634\u062D\u0646 \u062D\u0633\u0627\u0628\u0643.",
    rate_limit: "\u0637\u0644\u0628\u0627\u062A \u0643\u062B\u064A\u0631\u0629: \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0628\u0639\u062F \u062F\u0642\u064A\u0642\u0629.",
    overloaded: "\u0627\u0644\u062E\u062F\u0645\u0629 \u0645\u0632\u062F\u062D\u0645\u0629: \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0644\u0627\u062D\u0642\u064B\u0627.",
    network: "\u062A\u0639\u0630\u0651\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644.",
    invalid_request: "\u0637\u0644\u0628 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.",
    invalid_output: "\u0625\u062C\u0627\u0628\u0629 \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0639\u0629: \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.",
    refusal: "\u0631\u0641\u0636 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u0627\u0644\u0637\u0644\u0628: \u0623\u0639\u062F \u0627\u0644\u0635\u064A\u0627\u063A\u0629.",
    too_long: "\u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0637\u0648\u064A\u0644\u0629 \u062C\u062F\u064B\u0627: \u0627\u0637\u0644\u0628 \u0639\u062F\u062F\u064B\u0627 \u0623\u0642\u0644.",
    schedule_window: "\u0627\u062E\u062A\u0631 \u062A\u0627\u0631\u064A\u062E\u064B\u0627 \u0628\u064A\u0646 10 \u062F\u0642\u0627\u0626\u0642 \u064830 \u064A\u0648\u0645\u064B\u0627.",
    not_configured: "\u0627\u0644\u062E\u062F\u0645\u0629 \u063A\u064A\u0631 \u0645\u0647\u064A\u0651\u0623\u0629.",
    unknown: "\u062E\u0637\u0623 \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0639."
  }
};
var MESSAGES = { fr, en, ar };
var fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

// src/widget/styles.ts
var STYLES2 = (
  /* css */
  `
:host{--d-primary:#0b3f2f;--d-accent:#f3811d;--d-bg:#f5f7f6;--d-surface:#fff;--d-ink:#14211c;--d-muted:#5d6b65;--d-line:#dde5e1;--d-danger:#b42318;--d-ok:#1f7a45;
  --d-radius:14px;--d-font:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Arabic",sans-serif;
  display:block;font:15px/1.5 var(--d-font);color:var(--d-ink);container-type:inline-size}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
.wrap{background:var(--d-bg);border:1px solid var(--d-line);border-radius:calc(var(--d-radius) + 4px);padding:20px}
header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
header .mark{width:44px;height:44px;flex:none}
header h2{margin:0;font-size:1.45rem;letter-spacing:-.01em}
header h2 b{color:var(--d-accent)}
header p{margin:0;color:var(--d-muted);font-size:.9rem}
.badge{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#fff;background:var(--d-accent);border-radius:99px;padding:3px 9px}
header .end{margin-inline-start:auto}
.card{background:var(--d-surface);border:1px solid var(--d-line);border-radius:var(--d-radius);padding:18px;margin-bottom:14px}
.card h3{margin:0 0 12px;font-size:1.05rem;color:var(--d-primary)}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px}
label{display:block;margin-bottom:12px}
label>span{display:block;font-weight:600;font-size:.88rem;margin-bottom:5px}
.help{display:block;font-size:.8rem;color:var(--d-muted);margin:-2px 0 6px}
input,select,textarea{width:100%;font:inherit;color:inherit;background:#fff;border:1.5px solid var(--d-line);border-radius:10px;padding:9px 11px}
input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible{outline:3px solid color-mix(in srgb,var(--d-accent) 55%,transparent);outline-offset:1px}
textarea{resize:vertical}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
button{font:600 .9rem var(--d-font);border-radius:10px;padding:9px 14px;border:1.5px solid transparent;cursor:pointer;background:color-mix(in srgb,var(--d-primary) 8%,#fff);color:var(--d-primary)}
button:hover{background:color-mix(in srgb,var(--d-primary) 14%,#fff)}
button.primary{background:var(--d-primary);color:#fff}
button.accent{background:var(--d-accent);color:#fff}
button.danger{background:transparent;color:var(--d-danger);border-color:color-mix(in srgb,var(--d-danger) 35%,#fff)}
button.danger[data-armed]{background:var(--d-danger);color:#fff}
button.link{background:none;border:0;padding:4px 0;color:var(--d-muted);text-decoration:underline}
button[disabled]{opacity:.55;cursor:progress}
.state{font-weight:600;font-size:.9rem;margin:0 0 10px}
.state.ok{color:var(--d-ok)}.state.missing{color:#a15c07}
.hint{color:var(--d-muted);font-size:.85rem;margin:2px 0 12px}
.toast{position:sticky;top:8px;z-index:5;margin-bottom:12px;padding:11px 14px;border-radius:10px;font-weight:600;background:var(--d-primary);color:#fff}
.toast.error{background:var(--d-danger)}.toast.success{background:var(--d-ok)}
.lock{max-width:420px;margin:10px auto}
.post{display:grid;grid-template-columns:minmax(200px,300px) minmax(0,1fr);gap:18px;align-items:start}
.post canvas{display:block;width:100%;height:auto;aspect-ratio:1080/1350;border-radius:12px;background:var(--d-line)}
.post .head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}
.pill{font-size:.75rem;font-weight:700;border-radius:99px;padding:3px 10px;background:var(--d-line)}
.pill.scheduled,.pill.published{background:color-mix(in srgb,var(--d-ok) 18%,#fff);color:var(--d-ok)}
.pill.failed{background:color-mix(in srgb,var(--d-danger) 15%,#fff);color:var(--d-danger)}
.err{color:var(--d-danger);font-size:.85rem;font-weight:600;margin:0 0 8px}
.empty{color:var(--d-muted)}
@container (max-width:720px){.grid{grid-template-columns:1fr}.post{grid-template-columns:1fr}.post canvas{max-width:320px}}
@media (prefers-reduced-motion:no-preference){button{transition:background .15s}}
`
);
var MARK_SVG = `<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="dg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2fd3a0"/><stop offset="1" stop-color="#0b6b4f"/></linearGradient></defs><rect x="2" y="2" width="96" height="96" rx="26" fill="url(#dg)"/><path d="M12 80 C 30 72, 44 84, 60 78 S 82 70, 90 76" fill="none" stroke="#ffa124" stroke-width="4" stroke-linecap="round"/><g fill="#fff"><path d="M28 72 C 26 48, 44 28, 66 26 C 74 25.5, 80 28, 83 32.5 C 86 33.5, 90 34.5, 94 37 C 90 39.5, 85 40, 80 39.5 C 62 39, 45 50, 36 71 Z"/><path d="M45 32 C 46 24, 51 19, 58 16.5 C 55 22, 55 26.5, 57 29.5 Z"/><path d="M55 43 C 55 50, 52 55, 47 58 C 49 52, 50 47, 50 44 Z"/><path d="M32 68 C 27 74, 21 76, 15 75 C 20 72, 24 69, 27 65 Z"/><path d="M33 69 C 35 76, 34 82, 30 87 C 31 81, 30 76, 28 72 Z"/></g><circle cx="78.5" cy="33" r="2.1" fill="#0b5a43"/><g fill="#ffa124"><path d="M82 9 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/><circle cx="92" cy="20" r="2"/></g></svg>`;

// src/widget/element.ts
var SUBJECTS = {
  mix: "a balanced mix: selling what is available, useful tips, trust and behind the scenes, what is coming soon",
  sell: "selling the products that are available now",
  tips: "useful, accurate tips for the audience, leading to the available products",
  trust: "trust: care, seriousness and behind the scenes of the company",
  soon: "announcing the products coming soon, inviting people to be notified first"
};
var TONES = { warm: "warm and close to the audience", pro: "professional and reassuring", bold: "energetic, makes people act" };
var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var usd = (n) => n < 0.01 ? n.toFixed(3) : n.toFixed(2);
var DolphinStudioElement = class _DolphinStudioElement extends HTMLElement {
  /** Set by the full bundle; the lite bundle only supports proxy mode. */
  static directFactory;
  root;
  cfg;
  studio;
  renderer = new CanvasPosterRenderer();
  store;
  vault;
  secrets = null;
  passphrase = "";
  view = "loading";
  busy = false;
  t = MESSAGES.fr;
  prefs = { subject: "mix", tone: "warm", count: 5, start: "", time: "19:00", notes: "" };
  toastTimer;
  redraw = /* @__PURE__ */ new Map();
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.root.addEventListener("click", (e) => void this.onClick(e));
    this.root.addEventListener("input", (e) => void this.onInput(e));
    this.root.addEventListener("submit", (e) => void this.onSubmit(e));
  }
  connectedCallback() {
    if (this.cfg) return;
    const inline = this.querySelector('script[type="application/json"]');
    if (inline?.textContent) {
      try {
        this.config = JSON.parse(inline.textContent);
      } catch {
        this.root.textContent = "DOLPHin: invalid JSON configuration.";
      }
    }
  }
  get config() {
    return this.cfg;
  }
  set config(value) {
    try {
      this.cfg = { ...value, brand: validateBrand(value.brand) };
    } catch (err) {
      this.root.textContent = `DOLPHin: ${err instanceof Error ? err.message : String(err)}`;
      return;
    }
    void this.init();
  }
  get mode() {
    return this.cfg.mode ?? (this.cfg.endpoint ? "proxy" : "direct");
  }
  get hostManaged() {
    return this.mode === "direct" && !!this.cfg?.secrets;
  }
  get model() {
    return this.cfg?.model ?? DEFAULT_MODEL;
  }
  async init() {
    const cfg = this.cfg;
    const lang = cfg.lang ?? cfg.brand.language;
    this.t = MESSAGES[lang];
    this.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    this.style.setProperty("--d-primary", cfg.brand.colors.primary);
    this.style.setProperty("--d-accent", cfg.brand.colors.accent);
    this.renderer = new CanvasPosterRenderer({ ...cfg.fonts ? { fonts: cfg.fonts } : {}, contactLabel: cfg.brand.contact.whatsapp ? "WhatsApp" : this.t.contact });
    this.store = new LocalStore(`dolphin:${cfg.brand.id}:`);
    this.studio = new DolphinStudio({ brand: cfg.brand, renderer: this.renderer, store: this.store });
    await this.studio.load();
    try {
      Object.assign(this.prefs, JSON.parse(await this.store.get("prefs") ?? "{}"));
    } catch {
    }
    if (!this.prefs.start || new Date(this.prefs.start) < new Date((/* @__PURE__ */ new Date()).toDateString())) {
      this.prefs.start = toLocalInput(new Date(Date.now() + 864e5)).slice(0, 10);
    }
    if (this.mode === "proxy") {
      const http = { endpoint: cfg.endpoint ?? "", ...cfg.token ? { token: cfg.token } : {} };
      let publisher = false;
      try {
        const res = await fetch(http.endpoint.replace(/\/+$/, "") + "/v1/health");
        publisher = !!(await res.json()).publisher;
      } catch {
      }
      this.studio.connect({ llm: new HttpLlm(http), ...publisher ? { publisher: new HttpPublisher(http) } : {} });
      this.view = "main";
    } else if (this.hostManaged) {
      this.secrets = { ...cfg.secrets };
      this.applySecrets();
      this.view = "main";
    } else {
      this.vault = new Vault(this.store);
      this.view = await this.vault.exists() ? "lock" : "setup";
    }
    this.render();
  }
  // ---------------------------------------------------------------- rendering
  render() {
    const t = this.t;
    const head = `<header>${MARK_SVG}<div><h2>DOLPH<b>in</b></h2><p>${esc(t.tagline)}</p></div><span class="badge">${esc(t.beta)}</span>
      ${this.view === "main" && this.mode === "direct" && !this.hostManaged ? `<button class="end" data-act="lock">${esc(t.lock)}</button>` : ""}</header>`;
    let body = "";
    if (this.view === "loading") body = "";
    else if (this.view === "setup" || this.view === "lock") body = this.lockView();
    else body = this.connectionsView() + this.generateView() + this.postsView();
    this.root.innerHTML = `<style>${STYLES2}</style><div class="wrap">${head}<div class="toast" role="status" hidden></div>${body}</div>`;
    this.drawAll();
  }
  lockView() {
    const t = this.t, setup = this.view === "setup";
    return `<form class="card lock" data-form="${setup ? "setup" : "unlock"}">
      <h3>${esc(setup ? t.setupTitle : t.lockTitle)}</h3><p class="hint">${esc(setup ? t.setupIntro : t.lockIntro)}</p>
      <label><span>${esc(t.passphrase)}</span><input type="password" name="pass" required minlength="8" autocomplete="${setup ? "new-password" : "current-password"}"></label>
      ${setup ? `<label><span>${esc(t.confirm)}</span><input type="password" name="pass2" required minlength="8" autocomplete="new-password"></label>` : ""}
      <p class="err" data-lock-msg role="alert"></p>
      <div class="row"><button class="primary" type="submit">${esc(setup ? t.create : t.unlock)}</button>
      ${setup ? "" : `<button type="button" class="link" data-act="forget" data-confirm>${esc(t.forgot)}</button>`}</div></form>`;
  }
  connectionsView() {
    const t = this.t, studio = this.studio;
    if (this.mode === "proxy") {
      return `<div class="card"><h3>${esc(t.connections)}</h3><p class="state ok">${esc(t.proxyOk)}</p>
        <p class="state ${studio.canPublish ? "ok" : "missing"}">${esc(studio.canPublish ? t.fbOk : t.fbMissing)}</p></div>`;
    }
    const s = this.secrets ?? {};
    return `<div class="card"><h3>${esc(t.connections)}</h3>
      <p class="state ${s.claudeKey ? "ok" : "missing"}">${esc(s.claudeKey ? t.keyOk : t.keyMissing)}</p>
      <label><span>${esc(t.claudeKey)}</span><em class="help">${esc(t.claudeHelp)}</em><input type="password" data-key="claudeKey" autocomplete="off" placeholder="sk-ant-\u2026"></label>
      <p class="state ${s.metaPageId && s.metaToken ? "ok" : "missing"}">${esc(s.metaPageId && s.metaToken ? t.fbOk : t.fbMissing)}</p>
      <div class="grid"><label><span>${esc(t.pageId)}</span><input data-key="metaPageId" value="${esc(s.metaPageId)}"></label>
      <label><span>${esc(t.pageToken)}</span><input type="password" data-key="metaToken" autocomplete="off"></label></div>
      <div class="row"><button class="primary" data-act="save-keys">${esc(t.save)}</button><button data-act="test">${esc(t.test)}</button></div></div>`;
  }
  generateView() {
    const t = this.t, p = this.prefs;
    const opts = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${k}"${k === v ? " selected" : ""}>${esc(l)}</option>`).join("");
    return `<div class="card"><h3>${esc(t.create_)}</h3><div class="grid">
      <label><span>${esc(t.subject)}</span><select data-pref="subject">${opts(t.subjects, p.subject)}</select></label>
      <label><span>${esc(t.tone)}</span><select data-pref="tone">${opts(t.tones, p.tone)}</select></label>
      <label><span>${esc(t.count)}</span><input type="number" min="1" max="10" data-pref="count" value="${p.count}"></label>
      <label><span>${esc(t.startDate)}</span><input type="date" data-pref="start" value="${esc(p.start)}"></label>
      <label><span>${esc(t.time)}</span><input type="time" data-pref="time" value="${esc(p.time)}"></label></div>
      <label><span>${esc(t.notes)}</span><textarea rows="2" data-pref="notes" placeholder="${esc(t.notesPh)}">${esc(p.notes)}</textarea></label>
      <p class="hint">${esc(fill(t.costHint, { cost: usd(estimatePerPostUsd(this.model)) }))}</p>
      <div class="row"><button class="accent" data-act="generate"${this.busy || !this.studio.canGenerate ? " disabled" : ""}>${esc(this.busy ? t.generating : "\u2726 " + t.generate)}</button></div></div>`;
  }
  postsView() {
    const t = this.t, posts = this.studio.list();
    const canPublish = this.studio.canPublish;
    const bulk = posts.length ? `<div class="row" style="margin-bottom:12px">${canPublish ? `<button class="primary" data-act="schedule-all"${this.busy ? " disabled" : ""}>${esc(t.scheduleAll)}</button>` : ""}
      <button class="danger" data-act="clear" data-confirm>${esc(t.clearAll)}</button></div>` : `<p class="empty">${esc(t.empty)}</p>`;
    return `<h3>${esc(t.posts)}${posts.length ? ` (${posts.length})` : ""}</h3>${bulk}${posts.map((p, i) => this.postCard(p, i, canPublish)).join("")}`;
  }
  postCard(p, i, canPublish) {
    const t = this.t, editable = p.status === "draft" || p.status === "failed";
    const ro = editable ? "" : " disabled";
    const field = (k, label) => `<label><span>${esc(label)}</span><input data-f="${p.id}:${k}" value="${esc(p[k])}"${ro}></label>`;
    const sel = (k, label, o) => `<label><span>${esc(label)}</span><select data-f="${p.id}:${k}"${ro}>${Object.entries(o).map(([v, l]) => `<option value="${v}"${p[k] === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
    return `<article class="card"><div class="head"><strong>${i + 1}. ${esc(p.title)}</strong><span class="pill ${p.status}">${esc(t.status[p.status])}</span></div>
      <div class="post"><canvas width="1080" height="1350" data-canvas="${p.id}" role="img" aria-label="${esc(p.title)}"></canvas><div>
      ${p.error ? `<p class="err">${esc(p.errorCode ? t.errors[p.errorCode] : p.error)}</p>` : ""}
      <div class="grid">${field("tag", t.tag)}${sel("theme", t.theme, t.themes)}</div>
      ${field("title", t.title)}${field("subtitle", t.subtitle)}
      <div class="grid"><label><span>${esc(t.points)}</span><textarea rows="4" data-f="${p.id}:points"${ro}>${esc(p.points.join("\n"))}</textarea></label>${sel("style", t.style, t.styles)}</div>
      <label><span>${esc(t.caption)}</span><textarea rows="6" data-f="${p.id}:caption"${ro}>${esc(p.caption)}</textarea></label>
      <label><span>${esc(t.hashtags)}</span><input data-f="${p.id}:hashtags" value="${esc(p.hashtags.map((h) => "#" + h).join(" "))}"${ro}></label>
      <label><span>${esc(t.when)}</span><input type="datetime-local" data-f="${p.id}:scheduledAt" value="${esc(toLocalInput(new Date(p.scheduledAt)))}"${ro}></label>
      <div class="row"><button data-act="download" data-id="${p.id}">${esc(t.download)}</button><button data-act="copy" data-id="${p.id}">${esc(t.copy)}</button>
      ${canPublish && editable ? `<button class="primary" data-act="schedule" data-id="${p.id}"${this.busy ? " disabled" : ""}>${esc(t.schedule)}</button>
        <button class="accent" data-act="publish" data-id="${p.id}"${this.busy ? " disabled" : ""}>${esc(t.publishNow)}</button>` : ""}
      <button class="danger" data-act="remove" data-id="${p.id}" data-confirm>${esc(t.remove)}</button></div></div></div></article>`;
  }
  drawAll() {
    this.root.querySelectorAll("canvas[data-canvas]").forEach((c) => this.drawOne(c));
  }
  drawOne(canvas) {
    const post = this.studio?.get(canvas.dataset.canvas ?? "");
    if (post) void this.renderer.draw(canvas, post, this.cfg.brand);
  }
  toast(text2, kind = "info") {
    const el = this.root.querySelector(".toast");
    if (!el) return;
    el.textContent = text2;
    el.className = `toast ${kind}`;
    el.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.hidden = true;
    }, kind === "error" ? 9e3 : 5e3);
  }
  errorText(err) {
    return isDolphinError(err) ? this.t.errors[err.code] : this.t.errors.unknown;
  }
  // ---------------------------------------------------------------- events
  async onSubmit(e) {
    const form = e.target;
    if (!form.dataset.form) return;
    e.preventDefault();
    const msg = form.querySelector("[data-lock-msg]");
    const pass = form.elements.namedItem("pass").value;
    try {
      if (form.dataset.form === "setup") {
        if (pass !== form.elements.namedItem("pass2").value) {
          msg.textContent = this.t.mismatch;
          return;
        }
        await this.vault.seal(pass, {});
        this.unlocked(pass, {});
      } else {
        this.unlocked(pass, await this.vault.open(pass));
      }
    } catch (err) {
      msg.textContent = this.errorText(err);
    }
  }
  unlocked(pass, secrets) {
    this.passphrase = pass;
    this.secrets = secrets;
    this.applySecrets();
    this.view = "main";
    this.render();
  }
  applySecrets() {
    const factory = _DolphinStudioElement.directFactory;
    const adapters = factory && this.secrets ? factory(this.secrets, this.cfg) : {};
    this.studio.connect({ llm: adapters.llm, publisher: adapters.publisher });
  }
  async onInput(e) {
    const el = e.target;
    if (el.dataset.pref) {
      const k = el.dataset.pref;
      this.prefs[k] = k === "count" ? Math.min(10, Math.max(1, Number.parseInt(el.value, 10) || 1)) : el.value;
      await this.store.set("prefs", JSON.stringify(this.prefs));
      return;
    }
    const f = el.dataset.f;
    if (!f) return;
    const [id, key] = f.split(":");
    const v = el.value;
    const value = key === "points" ? v.split("\n").map((x) => x.trim()).filter(Boolean) : key === "hashtags" ? v.split(/[\s,]+/).map((x) => x.replace(/^#+/, "")).filter(Boolean) : key === "scheduledAt" ? v ? new Date(v).toISOString() : void 0 : v;
    if (value === void 0) return;
    await this.studio.update(id, { [key]: value });
    clearTimeout(this.redraw.get(id));
    this.redraw.set(id, setTimeout(() => {
      const c = this.root.querySelector(`canvas[data-canvas="${CSS.escape(id)}"]`);
      if (c) this.drawOne(c);
    }, 150));
  }
  async onClick(e) {
    const b = e.target.closest("button[data-act]");
    if (!b || b.disabled) return;
    if (b.hasAttribute("data-confirm") && !b.dataset.armed) {
      const label = b.textContent ?? "";
      b.dataset.armed = "1";
      b.textContent = this.t.confirmQ;
      setTimeout(() => {
        if (b.isConnected) {
          delete b.dataset.armed;
          b.textContent = label;
        }
      }, 3e3);
      return;
    }
    const id = b.dataset.id ?? "";
    const studio = this.studio;
    try {
      switch (b.dataset.act) {
        case "lock":
          this.secrets = null;
          this.passphrase = "";
          studio.connect({ llm: void 0, publisher: void 0 });
          this.view = "lock";
          this.render();
          break;
        case "forget":
          await this.vault.reset();
          this.view = "setup";
          this.render();
          break;
        case "save-keys":
          await this.saveKeys();
          break;
        case "test":
          await this.testConnections();
          break;
        case "generate":
          await this.generate();
          break;
        case "download":
          await this.download(id);
          break;
        case "copy":
          await navigator.clipboard.writeText(studio.caption(id));
          this.toast(this.t.copied, "success");
          break;
        case "remove":
          await studio.remove(id);
          this.render();
          break;
        case "clear":
          await studio.clear();
          this.render();
          break;
        case "schedule":
          await this.sendPosts([id], true);
          break;
        case "publish":
          await this.sendPosts([id], false);
          break;
        case "schedule-all":
          await this.sendPosts(studio.list().filter((p) => p.status === "draft" || p.status === "failed").map((p) => p.id), true);
          break;
      }
    } catch (err) {
      this.busy = false;
      this.render();
      this.toast(this.errorText(err), "error");
    }
  }
  async saveKeys() {
    const read = (k) => this.root.querySelector(`[data-key="${k}"]`)?.value.trim() ?? "";
    const next = { ...this.secrets };
    if (read("claudeKey")) next.claudeKey = read("claudeKey");
    if (read("metaToken")) next.metaToken = read("metaToken");
    next.metaPageId = read("metaPageId");
    if (this.hostManaged) await this.cfg.onSecretsChange?.(next);
    else await this.vault.seal(this.passphrase, next);
    this.secrets = next;
    this.applySecrets();
    this.render();
    this.toast(this.t.saved, "success");
  }
  async testConnections() {
    const studio = this.studio;
    const parts = [];
    let ok = true;
    if (this.secrets?.metaPageId && this.secrets.metaToken && _DolphinStudioElement.directFactory) {
      const { publisher } = _DolphinStudioElement.directFactory(this.secrets, this.cfg);
      try {
        const r = await publisher?.verify?.();
        parts.push(`Facebook : ${r?.name ?? "OK"}`);
      } catch (err) {
        ok = false;
        parts.push(`Facebook : ${this.errorText(err)}`);
      }
    }
    parts.push(studio.canGenerate ? this.t.keyOk : this.t.keyMissing);
    this.toast(parts.join(" \u2014 "), ok ? "success" : "error");
  }
  async generate() {
    this.busy = true;
    this.render();
    const p = this.prefs;
    const { posts, usage, model } = await this.studio.generate({
      count: p.count,
      subject: SUBJECTS[p.subject] ?? SUBJECTS.mix,
      tone: TONES[p.tone] ?? TONES.warm,
      ...p.notes ? { notes: p.notes } : {},
      ...p.start ? { startDate: /* @__PURE__ */ new Date(p.start + "T00:00") } : {},
      time: p.time
    });
    this.busy = false;
    this.render();
    this.toast(fill(this.t.generated, { n: posts.length, cost: usd(estimateCostUsd(usage, model)) }), "success");
  }
  async download(id) {
    const blob = await this.studio.renderImage(id);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dolphin-${id.slice(0, 8)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
  }
  async sendPosts(ids, schedule) {
    this.busy = true;
    this.render();
    const report = await this.studio.send(ids, schedule);
    this.busy = false;
    this.render();
    if (report.failed.length) this.toast(fill(this.t.partly, { ok: report.sent.length, ko: report.failed.length }), "error");
    else this.toast(fill(this.t.sent, { n: report.sent.length }), "success");
  }
};
function defineDolphinElement(tag = "dolphin-studio") {
  if (!customElements.get(tag)) customElements.define(tag, DolphinStudioElement);
}
function mount(target, config) {
  defineDolphinElement();
  const host = typeof target === "string" ? document.querySelector(target) : target;
  if (!host) throw new Error(`DOLPHin: ${String(target)} not found.`);
  const el = document.createElement("dolphin-studio");
  host.appendChild(el);
  el.config = config;
  return el;
}

// src/direct.ts
function enableDirectMode() {
  DolphinStudioElement.directFactory = (s, cfg) => ({
    ...s.claudeKey ? { llm: new ClaudeLlm({ apiKey: s.claudeKey, allowBrowser: true, ...cfg.model ? { model: cfg.model } : {} }) } : {},
    ...s.metaPageId && s.metaToken ? { publisher: new MetaPagePublisher({ pageId: s.metaPageId, accessToken: s.metaToken, ...cfg.graphVersion ? { graphVersion: cfg.graphVersion } : {} }) } : {}
  });
}
export {
  CanvasPosterRenderer,
  ClaudeLlm,
  DEFAULT_MODEL,
  DolphinError,
  DolphinStudio,
  DolphinStudioElement,
  HTTP_STATUS,
  HttpLlm,
  HttpPublisher,
  LocalStore,
  MAX_POSTS,
  MODEL_PRICING,
  MemoryStore,
  MetaPagePublisher,
  POSTER_HEIGHT,
  POSTER_WIDTH,
  POSTS_JSON_SCHEMA,
  Vault,
  assertSchedulable,
  buildSystemPrompt,
  buildUserPrompt,
  contrast,
  defineDolphinElement,
  drawPoster,
  enableDirectMode,
  estimateCostUsd,
  estimatePerPostUsd,
  fullCaption,
  isDolphinError,
  mount,
  paletteFor,
  parseDrafts,
  planSchedule,
  validateBrand,
  validateGenerateRequest
};
//# sourceMappingURL=dolphin.esm.js.map
