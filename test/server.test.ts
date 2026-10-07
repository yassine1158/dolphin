import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpLlm, HttpPublisher } from "../src/adapters/http.js";
import { createDolphinHandler } from "../src/server/index.js";
import { FakeLlm, FakePublisher, brand } from "./fixtures.js";

const llm = new FakeLlm(2);
const publisher = new FakePublisher();
let server: Server;
let url = "";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);

beforeAll(async () => {
  const handler = createDolphinHandler({ llm, publisher, apiToken: "secret-token", allowedOrigins: ["https://shop.example"], basePath: "/dolphin" });
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/dolphin`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));

const post = (path: string, body: unknown, token = "secret-token") =>
  fetch(url + path, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

describe("server", () => {
  it("answers health without a token", async () => {
    expect(await (await fetch(url + "/v1/health")).json()).toMatchObject({ ok: true, llm: true, publisher: true });
  });
  it("requires the bearer token", async () => {
    const r = await post("/v1/generate", { brand, request: { count: 1 } }, "wrong");
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: { code: "auth", message: "Missing or invalid API token." } });
  });
  it("validates input", async () => {
    const r = await post("/v1/generate", { brand: { ...brand, colors: {} }, request: { count: 1 } });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe("invalid_request");
  });
  it("works end to end with the HTTP adapters", async () => {
    const http = { endpoint: url, token: "secret-token" };
    const r = await new HttpLlm(http).generate(brand, { count: 2 });
    expect(r.drafts.map(d => d.title)).toEqual(["Titre 1", "Titre 2"]);
    const at = new Date(Date.now() + 3_600_000);
    expect(await new HttpPublisher(http).publish({ image: new Blob([PNG], { type: "image/png" }), caption: "cap", scheduledAt: at })).toEqual({ id: "fb_1" });
    expect(publisher.sent[0]!.scheduledAt!.toISOString()).toBe(at.toISOString());
    expect(publisher.sent[0]!.image.size).toBe(PNG.length);
    expect(await new HttpPublisher(http).verify()).toEqual({ name: "Page ACME" });
  });
  it("analyzes a snapshot", async () => {
    const r = await new HttpLlm({ endpoint: url, token: "secret-token" }).analyze({ url: "https://x.ci", headings: ["h"], text: "t", phones: [], whatsapp: [], emails: [], logoCandidates: [], structured: {} });
    expect(r.brand.name).toBe("Le Fournil");
    expect(r.ideas).toHaveLength(1);
    const bad = await post("/v1/analyze", { snapshot: { url: "x", text: "y".repeat(9000) } });
    expect(bad.status).toBe(400);
  });
  it("rejects non-PNG images", async () => {
    const r = await post("/v1/publish", { imageBase64: Buffer.from("GIF89a").toString("base64"), caption: "x" });
    expect((await r.json()).error.message).toMatch(/PNG/);
  });
  it("handles CORS for allowed origins only", async () => {
    const ok = await fetch(url + "/v1/generate", { method: "OPTIONS", headers: { origin: "https://shop.example" } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://shop.example");
    const ko = await fetch(url + "/v1/health", { headers: { origin: "https://evil.example" } });
    expect(ko.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("returns 404 outside the mount path", async () => {
    expect((await fetch(url.replace("/dolphin", "") + "/v1/health")).status).toBe(404);
  });
});
