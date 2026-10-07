import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ITERATIONS, Vault } from "../src/adapters/secrets/vault.js";
import { MemoryStore } from "../src/adapters/storage/index.js";
import { MetaPagePublisher, appSecretProof } from "../src/adapters/publish/meta.js";
import { RateLimiter, createDolphinHandler } from "../src/server/index.js";
import { FakeLlm, FakePublisher, brand } from "./fixtures.js";

let server: Server;
let url = "";
const logs: string[] = [];
beforeAll(async () => {
  const handler = createDolphinHandler({
    llm: new FakeLlm(1), publisher: new FakePublisher(), apiToken: "tok", allowedOrigins: ["https://shop.example"],
    rateLimit: { expensive: 2, other: 50 }, log: l => logs.push(l),
  });
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));

const json = { "content-type": "application/json", authorization: "Bearer tok" };

describe("server hardening", () => {
  it("sends security headers", async () => {
    const r = await fetch(url + "/v1/health");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
  });
  it("refuses a POST that is not JSON (no CORS preflight)", async () => {
    const r = await fetch(url + "/v1/generate", { method: "POST", headers: { authorization: "Bearer tok", "content-type": "text/plain" }, body: "{}" });
    expect(r.status).toBe(415);
  });
  it("refuses a browser on a site that is not allowed", async () => {
    const r = await fetch(url + "/v1/publisher", { headers: { authorization: "Bearer tok", origin: "https://evil.example" } });
    expect(r.status).toBe(403);
    const ok = await fetch(url + "/v1/publisher", { headers: { authorization: "Bearer tok", origin: "https://shop.example" } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://shop.example");
  });
  it("refuses a token in the query string", async () => {
    expect((await fetch(url + "/v1/health?token=tok")).status).toBe(400);
  });
  it("limits the AI routes per client, before any work and any token check", async () => {
    const handler = createDolphinHandler({ llm: new FakeLlm(1), apiToken: "tok", rateLimit: { expensive: 2 } });
    const own = createServer((req, res) => void handler(req, res));
    await new Promise<void>(r => own.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(own.address() as AddressInfo).port}`;
    try {
      const body = JSON.stringify({ brand, request: { count: 1 } });
      const codes: number[] = [];
      for (let i = 0; i < 3; i++) codes.push((await fetch(base + "/v1/generate", { method: "POST", headers: json, body })).status);
      expect(codes).toEqual([200, 200, 429]);
      const r = await fetch(base + "/v1/generate", { method: "POST", headers: { ...json, authorization: "Bearer wrong" }, body });
      expect(r.status).toBe(429);
      expect(r.headers.get("retry-after")).toBe("60");
      expect((await fetch(base + "/v1/health")).status).toBe(200); // the other routes have their own budget
    } finally {
      await new Promise<void>(r => own.close(() => r()));
    }
  });
  it("the limiter forgets after a minute", () => {
    let t = 0;
    const rl = new RateLimiter(1, () => t);
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("a")).toBe(false);
    expect(rl.allow("b")).toBe(true);
    t = 61_000;
    expect(rl.allow("a")).toBe(true);
  });
});

describe("vault hardening", () => {
  it("uses 600 000 PBKDF2 iterations and re-encrypts an old vault", async () => {
    const store = new MemoryStore();
    const v = new Vault(store);
    await v.seal("passphrase-1", { claudeKey: "k" });
    expect(JSON.parse((await store.get("vault"))!).i).toBe(ITERATIONS);
    // a v1 vault (310 000 iterations, no "i" field) still opens, then is upgraded
    const legacy = JSON.parse((await store.get("vault"))!);
    delete legacy.i;
    const salt = Uint8Array.from(atob(legacy.salt), c => c.charCodeAt(0));
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode("passphrase-1"), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 310_000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode('{"claudeKey":"old"}')));
    await store.set("vault", JSON.stringify({ v: 1, salt: legacy.salt, iv: btoa(String.fromCharCode(...iv)), ct: btoa(String.fromCharCode(...ct)) }));
    expect(await v.open("passphrase-1")).toEqual({ claudeKey: "old" });
    expect(JSON.parse((await store.get("vault"))!).i).toBe(ITERATIONS);
  }, 20_000);
  it("slows down after 3 wrong passphrases", async () => {
    let t = 0;
    const store = new MemoryStore();
    const v = new Vault(store, () => t);
    await v.seal("passphrase-1", {});
    for (let i = 0; i < 3; i++) await expect(v.open("nope-nope")).rejects.toMatchObject({ code: "auth" });
    expect(v.retryInMs).toBeGreaterThan(0);
    await expect(v.open("passphrase-1")).rejects.toMatchObject({ code: "rate_limit" });
    t = 120_000;
    expect(await v.open("passphrase-1")).toEqual({});
    expect(v.retryInMs).toBe(0);
  }, 30_000);
});

describe("Meta hardening", () => {
  it("adds appsecret_proof and follows pages without leaking the token in next links", async () => {
    const seen: string[] = [];
    const pages = [
      { data: [{ created_time: "2026-06-02T20:00:00+0000" }], paging: { next: "https://graph.facebook.com/v23.0/1/published_posts?after=X&access_token=LEAK" } },
      { data: [{ created_time: "2026-06-01T20:00:00+0000" }], paging: { next: "https://evil.example/steal" } },
    ];
    const pub = new MetaPagePublisher({ pageId: "1", accessToken: "tok", appSecret: "shh", fetch: (async (u: string) => { seen.push(u); return new Response(JSON.stringify(pages[seen.length - 1])); }) as typeof fetch });
    expect(await pub.history()).toHaveLength(2);
    expect(seen).toHaveLength(2); // the link to another host is not followed
    const proof = await appSecretProof("tok", "shh");
    expect(proof).toMatch(/^[0-9a-f]{64}$/);
    expect(seen.every(u => new URL(u).searchParams.get("appsecret_proof") === proof)).toBe(true);
    expect(seen[1]).not.toContain("LEAK");
  });
  it("sends the token in the body when publishing", async () => {
    let asked = "", body: FormData | undefined;
    const pub = new MetaPagePublisher({ pageId: "1", accessToken: "tok", fetch: (async (u: string, init: RequestInit) => { asked = u; body = init.body as FormData; return new Response(JSON.stringify({ id: "9" })); }) as typeof fetch });
    await pub.publish({ image: new Blob(["x"], { type: "image/png" }), caption: "c" });
    expect(asked).not.toContain("tok");
    expect(body!.get("access_token")).toBe("tok");
  });
});
