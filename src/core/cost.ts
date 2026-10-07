// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
import type { Usage } from "./types.js";

/** USD per million tokens. */
export const MODEL_PRICING: Record<string, { input: number; output: number; label: string }> = {
  "claude-opus-5-5": { input: 4, output: 20, label: "Claude Opus 5.5" },
  "claude-sonnet-5-5": { input: 2, output: 10, label: "Claude Sonnet 5.5" },
};

export const DEFAULT_MODEL = "claude-opus-5-5";

export function estimateCostUsd(usage: Usage, model: string): number {
  const price = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL]!;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1e6;
}

/** Typical size of one post: ~3k input tokens, ~1.5k output tokens. */
export const estimatePerPostUsd = (model: string): number =>
  estimateCostUsd({ inputTokens: 3000, outputTokens: 1500 }, model);
