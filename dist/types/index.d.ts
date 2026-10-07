/**
 * DOLPHin — public API (ESM). Layers:
 *   core/      domain model, rules, prompts, schema, scheduling (pure)
 *   ports/     interfaces the application depends on
 *   adapters/  Claude, Meta Graph API, HTTP proxy, storage, encrypted vault
 *   render/    poster renderer (Canvas 2D)
 *   app/       use cases (DolphinStudio)
 *   widget/    <dolphin-studio> Web Component
 */
export * from "./core/types.js";
export * from "./core/errors.js";
export { validateBrand, validateGenerateRequest, validateSnapshot } from "./core/brand.js";
export { ANALYSIS_JSON_SCHEMA, buildAnalyzePrompt, parseAnalysis } from "./core/analysis.js";
export { POSTS_JSON_SCHEMA, parseDrafts, fullCaption, MAX_POSTS } from "./core/schema.js";
export { buildSystemPrompt, buildUserPrompt } from "./core/prompt.js";
export { planSchedule, assertSchedulable } from "./core/schedule.js";
export { analyzePeaks, planWithPeaks, type PeakReport, type EngagementSample } from "./core/peak.js";
export { analyzeInsights, mergeSources, type InsightsReport } from "./core/insights.js";
export { importEngagementCsv, parseCsv, type ImportResult } from "./core/csv.js";
export { POSTER_SIZES, sanitizeDesign, sanitizePost } from "./core/design.js";
export { OBJECTIVES, withUtm, captionWithLink, planToCsv, calendarWeeks } from "./core/campaign.js";
export { MODEL_PRICING, DEFAULT_MODEL, estimateCostUsd, estimatePerPostUsd } from "./core/cost.js";
export type * from "./ports/index.js";
export { ClaudeLlm, type ClaudeLlmOptions } from "./adapters/llm/claude.js";
export { HttpLlm, HttpPublisher, type HttpOptions } from "./adapters/http.js";
export { MetaPagePublisher, appSecretProof, type MetaPageOptions } from "./adapters/publish/meta.js";
export { IdbStore, LocalStore, MemoryStore } from "./adapters/storage/index.js";
export { Vault, type StudioSecrets } from "./adapters/secrets/vault.js";
export { discoverSite, snapshotFromDocument } from "./adapters/site.js";
export { drawPoster, CanvasPosterRenderer, POSTER_WIDTH, POSTER_HEIGHT, type PosterFonts } from "./render/poster.js";
export { paletteFor, contrast } from "./render/theme.js";
export { pickBrandColors, colorsFromImage, DEFAULT_COLORS } from "./render/colors.js";
export { DolphinStudio, type StudioDeps, type GenerateOptions, type SendReport, type ImportedData } from "./app/studio.js";
export { DolphinStudioElement, defineDolphinElement, mount, type DolphinConfig } from "./widget/element.js";
export { enableDirectMode } from "./direct.js";
