import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL } from "../../core/cost.js";
import { DolphinError } from "../../core/errors.js";
import { buildSystemPrompt, buildUserPrompt } from "../../core/prompt.js";
import { POSTS_JSON_SCHEMA, parseDrafts } from "../../core/schema.js";
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

export class ClaudeLlm implements LlmPort {
  readonly model: string;
  private readonly client: MessagesClient;
  private readonly maxTokens: number;

  constructor(opts: ClaudeLlmOptions = {}) {
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? 16_000;
    this.client = opts.client ?? new Anthropic({
      ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
      ...(opts.allowBrowser ? { dangerouslyAllowBrowser: true } : {}),
    });
  }

  async generate(brand: BrandProfile, request: GenerateRequest): Promise<GenerateResult> {
    let message: Anthropic.Message;
    try {
      // Streaming avoids HTTP timeouts on long answers; finalMessage() gathers the result.
      message = await this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        system: buildSystemPrompt(brand),
        messages: [{ role: "user", content: buildUserPrompt(request) }],
        output_config: { format: { type: "json_schema", schema: POSTS_JSON_SCHEMA } },
      }).finalMessage();
    } catch (err) {
      throw toDolphinError(err);
    }

    if (message.stop_reason === "refusal") throw new DolphinError("refusal", "The model declined this request.");
    if (message.stop_reason === "max_tokens") throw new DolphinError("too_long", "The answer was cut: ask for fewer posts.");

    const text = message.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("");
    let json: unknown;
    try { json = JSON.parse(text); } catch { throw new DolphinError("invalid_output", "The model answer is not valid JSON."); }

    return {
      drafts: parseDrafts(json),
      usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
      model: message.model,
    };
  }
}

export function toDolphinError(err: unknown): DolphinError {
  if (err instanceof DolphinError) return err;
  if (err instanceof Anthropic.APIConnectionError) return new DolphinError("network", "Cannot reach the Claude API.");
  if (err instanceof Anthropic.APIError) {
    const msg = err.message || "Claude API error.";
    switch (err.status) {
      case 401: return new DolphinError("auth", "Invalid Claude API key.", 401);
      case 403: return new DolphinError("permission", "This key has no access to this model.", 403);
      case 429: return new DolphinError("rate_limit", "Too many requests or spend limit reached.", 429);
      case 400: return /credit balance/i.test(msg)
        ? new DolphinError("quota", "Claude credit exhausted: top up the account.", 400)
        : new DolphinError("invalid_request", msg, 400);
      default: return (err.status ?? 0) >= 500
        ? new DolphinError("overloaded", "The Claude API is overloaded, retry in a few minutes.", err.status)
        : new DolphinError("unknown", msg, err.status);
    }
  }
  return new DolphinError("unknown", err instanceof Error ? err.message : String(err));
}
