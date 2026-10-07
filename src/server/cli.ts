#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
/**
 * dolphin-server: ready-to-run proxy. Configuration through environment variables:
 *   ANTHROPIC_API_KEY       Claude API key (required to generate)
 *   DOLPHIN_MODEL           default claude-opus-5-5
 *   META_PAGE_ID            Facebook page id (optional: enables publishing)
 *   META_PAGE_TOKEN         page access token with pages_manage_posts
 *   META_GRAPH_VERSION      default v23.0
 *   DOLPHIN_API_TOKEN       bearer token the widget must send (recommended)
 *   DOLPHIN_ALLOWED_ORIGINS comma-separated origins allowed by CORS, e.g. https://www.example.com
 *   DOLPHIN_BRAND_FILE      JSON file with a fixed brand profile (optional)
 *   DOLPHIN_BASE_PATH       mount path, default ""
 *   PORT / HOST             default 8787 / 0.0.0.0
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { ClaudeLlm } from "../adapters/llm/claude.js";
import { MetaPagePublisher } from "../adapters/publish/meta.js";
import { validateBrand } from "../core/brand.js";
import { createDolphinHandler, VERSION } from "./index.js";

const env = process.env;
const list = (v?: string) => (v ?? "").split(",").map(s => s.trim()).filter(Boolean);

const llm = env.ANTHROPIC_API_KEY ? new ClaudeLlm({ apiKey: env.ANTHROPIC_API_KEY, ...(env.DOLPHIN_MODEL ? { model: env.DOLPHIN_MODEL } : {}) }) : undefined;
const publisher = env.META_PAGE_ID && env.META_PAGE_TOKEN
  ? new MetaPagePublisher({ pageId: env.META_PAGE_ID, accessToken: env.META_PAGE_TOKEN, ...(env.META_GRAPH_VERSION ? { graphVersion: env.META_GRAPH_VERSION } : {}) })
  : undefined;
const brand = env.DOLPHIN_BRAND_FILE ? validateBrand(JSON.parse(readFileSync(env.DOLPHIN_BRAND_FILE, "utf8"))) : undefined;

if (!env.DOLPHIN_API_TOKEN) console.warn("[dolphin] DOLPHIN_API_TOKEN is not set: anyone who can reach this server can use your keys.");
if (!llm) console.warn("[dolphin] ANTHROPIC_API_KEY is not set: /v1/generate is disabled.");

const handler = createDolphinHandler({
  ...(llm ? { llm } : {}),
  ...(publisher ? { publisher } : {}),
  ...(brand ? { brand } : {}),
  ...(env.DOLPHIN_API_TOKEN ? { apiToken: env.DOLPHIN_API_TOKEN } : {}),
  allowedOrigins: list(env.DOLPHIN_ALLOWED_ORIGINS),
  basePath: env.DOLPHIN_BASE_PATH ?? "",
  log: line => console.log(`[dolphin] ${line}`),
});

const port = Number(env.PORT ?? 8787);
createServer((req, res) => void handler(req, res)).listen(port, env.HOST ?? "0.0.0.0", () => {
  console.log(`[dolphin] v${VERSION} listening on :${port} (generate: ${llm ? "on" : "off"}, publish: ${publisher ? "on" : "off"})`);
});
