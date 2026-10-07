import type { BrandProfile, GenerateRequest } from "./types.js";
/**
 * System prompt: who the brand is, what it sells right now, and the rules it never breaks.
 * Written in English for the model; the output language is set explicitly.
 */
export declare function buildSystemPrompt(brand: BrandProfile): string;
export declare function buildUserPrompt(req: GenerateRequest): string;
