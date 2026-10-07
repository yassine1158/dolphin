import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ClaudeLlm, toDolphinError, type MessagesClient } from "../src/adapters/llm/claude.js";
import { MetaPagePublisher } from "../src/adapters/publish/meta.js";
import { Vault } from "../src/adapters/secrets/vault.js";
import { MemoryStore } from "../src/adapters/storage/index.js";
import { brand } from "./fixtures.js";

const message = (text: string, stop: string = "end_turn") => ({
  id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: stop, stop_sequence: null,
  content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 20 },
});
const fakeClient = (impl: () => Promise<unknown>, seen: unknown[] = []): MessagesClient =>
  ({ messages: { stream: (params: unknown) => { seen.push(params); return { finalMessage: impl }; } } }) as unknown as MessagesClient;

describe("ClaudeLlm", () => {
  it("sends the prompts with a JSON schema and parses the answer", async () => {
    const seen: unknown[] = [];
    const llm = new ClaudeLlm({ client: fakeClient(async () => message(JSON.stringify({ posts: [{ title: "T", caption: "C" }] })), seen) });
    const r = await llm.generate(brand, { count: 1 });
    expect(r.drafts[0]!.title).toBe("T");
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    const params = seen[0] as { model: string; output_config: { format: { type: string } }; system: string };
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.system).toContain("ACME");
  });
  it("maps stop reasons and bad JSON", async () => {
    await expect(new ClaudeLlm({ client: fakeClient(async () => message("", "refusal")) }).generate(brand, { count: 1 })).rejects.toMatchObject({ code: "refusal" });
    await expect(new ClaudeLlm({ client: fakeClient(async () => message("{", "max_tokens")) }).generate(brand, { count: 1 })).rejects.toMatchObject({ code: "too_long" });
    await expect(new ClaudeLlm({ client: fakeClient(async () => message("not json")) }).generate(brand, { count: 1 })).rejects.toMatchObject({ code: "invalid_output" });
  });
  it("maps API errors", () => {
    const err = (status: number, msg = "x") => Anthropic.APIError.generate(status, { error: { message: msg } }, msg, new Headers());
    expect(toDolphinError(err(401)).code).toBe("auth");
    expect(toDolphinError(err(429)).code).toBe("rate_limit");
    expect(toDolphinError(err(400, "Your credit balance is too low")).code).toBe("quota");
    expect(toDolphinError(err(529)).code).toBe("overloaded");
    expect(toDolphinError(new Anthropic.APIConnectionError({ message: "down" })).code).toBe("network");
  });
});

describe("MetaPagePublisher", () => {
  it("posts a scheduled photo with the right fields", async () => {
    const calls: { url: string; body: FormData }[] = [];
    const pub = new MetaPagePublisher({
      pageId: "123", accessToken: "tok",
      fetch: (async (url: string, init: RequestInit) => { calls.push({ url, body: init.body as FormData }); return new Response(JSON.stringify({ id: "9", post_id: "123_9" })); }) as typeof fetch,
    });
    const at = new Date(Date.now() + 3_600_000);
    expect(await pub.publish({ image: new Blob(["x"]), caption: "hello", scheduledAt: at })).toEqual({ id: "123_9" });
    const f = calls[0]!.body;
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v23.0/123/photos");
    expect([f.get("message"), f.get("published"), f.get("unpublished_content_type"), f.get("scheduled_publish_time")])
      .toEqual(["hello", "false", "SCHEDULED", String(Math.floor(at.getTime() / 1000))]);
  });
  it("maps Graph errors", async () => {
    const pub = new MetaPagePublisher({ pageId: "1", accessToken: "t", fetch: (async () => new Response(JSON.stringify({ error: { code: 190, message: "expired" } }), { status: 400 })) as typeof fetch });
    await expect(pub.verify()).rejects.toMatchObject({ code: "auth" });
  });
});

describe("Vault", () => {
  it("encrypts secrets and refuses a wrong passphrase", async () => {
    const store = new MemoryStore();
    const v = new Vault(store);
    await v.seal("passphrase-1", { claudeKey: "sk-ant-secret" });
    expect(await store.get("vault")).not.toContain("sk-ant-secret");
    expect(await v.open("passphrase-1")).toEqual({ claudeKey: "sk-ant-secret" });
    await expect(v.open("wrong-pass")).rejects.toMatchObject({ code: "auth" });
    await expect(v.seal("short", {})).rejects.toMatchObject({ code: "invalid_request" });
  });
});
