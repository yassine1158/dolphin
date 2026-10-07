import type { Usage } from "./types.js";
/** USD per million tokens. */
export declare const MODEL_PRICING: Record<string, {
    input: number;
    output: number;
    label: string;
}>;
export declare const DEFAULT_MODEL = "claude-opus-5-5";
export declare function estimateCostUsd(usage: Usage, model: string): number;
/** Typical size of one post: ~3k input tokens, ~1.5k output tokens. */
export declare const estimatePerPostUsd: (model: string) => number;
