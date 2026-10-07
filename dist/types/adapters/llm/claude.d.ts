import Anthropic from "@anthropic-ai/sdk";
import { DolphinError } from "../../core/errors.js";
import type { BrandProfile, GenerateRequest, GenerateResult } from "../../core/types.js";
import type { LlmPort } from "../../ports/index.js";
/** The part of the SDK client this adapter uses; lets tests inject a fake. */
export interface MessagesClient {
    messages: Pick<Anthropic["messages"], "stream">;
}
export interface ClaudeLlmOptions {
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    /** Required to call the API straight from a browser (the key is then visible to that browser). */
    allowBrowser?: boolean;
    client?: MessagesClient;
}
export declare class ClaudeLlm implements LlmPort {
    readonly model: string;
    private readonly client;
    private readonly maxTokens;
    constructor(opts?: ClaudeLlmOptions);
    generate(brand: BrandProfile, request: GenerateRequest): Promise<GenerateResult>;
}
export declare function toDolphinError(err: unknown): DolphinError;
