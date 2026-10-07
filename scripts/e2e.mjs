// End-to-end check in a real browser. Needs Playwright (NODE_PATH or local install) and `npm run build`.
// Proxy mode against a local server with fake model/publisher, direct mode with mocked Claude/Meta APIs, Arabic RTL.
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";
import { createDolphinHandler } from "../dist/server.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = new URL("..", import.meta.url).pathname;
const OUT = process.env.E2E_OUT ?? join(ROOT, ".e2e");
mkdirSync(OUT, { recursive: true });

const drafts = lang => [
  { tag: lang === "ar" ? "متوفر" : "Disponible", title: lang === "ar" ? "بيض التفريخ متوفر الآن" : "Œufs à couver : lancez votre incubation", subtitle: lang === "ar" ? "للحاضنة أو الدجاجة" : "Pour incubateur ou poule couveuse", points: lang === "ar" ? ["بيض مخصّب", "اطلب عبر واتساب"] : ["Œufs fécondés", "Commande simple sur WhatsApp", "Retrait ou livraison à convenir"], style: "checks", theme: "dark", caption: "Texte 1", hashtags: ["ACME"] },
  { tag: "Conseil", title: "4 règles avant l'incubateur", subtitle: "", points: ["Au frais, à l'abri du soleil", "Pointe vers le bas", "Ne pas laver les œufs", "Incuber rapidement"], style: "steps", theme: "light", caption: "Texte 2", hashtags: ["Elevage"] },
  { tag: "Bientôt", title: "Ce n'est que le début", subtitle: "Soyez prévenu en premier", points: ["Aliments", "Poussins"], style: "checks", theme: "accent", caption: "Texte 3", hashtags: ["ACME"] },
];
const published = [];
const handler = createDolphinHandler({
  apiToken: "change-me",
  llm: { generate: async (brand, req) => ({ drafts: drafts(brand.language).slice(0, req.count), usage: { inputTokens: 3000, outputTokens: 4000 }, model: "claude-opus-5-5" }) },
  publisher: { publish: async i => { published.push(i); return { id: `fb_${published.length}` }; }, verify: async () => ({ name: "ACME" }) },
});
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".css": "text/css" };
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (path.startsWith("/v1/")) return void handler(req, res);
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
  createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(8787, r));

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const failures = [];
const check = (ok, label) => { console.log(`${ok ? "✓" : "✗"} ${label}`); if (!ok) failures.push(label); };

async function page(url, width = 1280) {
  const p = await browser.newPage({ viewport: { width, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  p.on("console", m => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await p.goto(url);
  return { p, errors };
}

try {
  // 1. Proxy mode
  {
    const { p, errors } = await page("http://localhost:8787/examples/plain-html/index.html");
    await p.fill("dolphin-studio [data-pref=count]", "3");
    await p.click("dolphin-studio [data-act=generate]");
    await p.waitForFunction(() => document.querySelector("dolphin-studio").shadowRoot.querySelectorAll("canvas").length === 3);
    await p.waitForTimeout(600);
    check(/3 publication/.test(await p.textContent("dolphin-studio .toast")), "proxy: 3 posts generated");
    await p.fill("dolphin-studio input[data-f$=':title']", "Titre modifié");
    await p.waitForTimeout(300);
    await p.screenshot({ path: join(OUT, "proxy.png"), fullPage: true });
    await p.click("dolphin-studio [data-act=schedule-all]");
    await p.waitForFunction(() => document.querySelector("dolphin-studio").shadowRoot.querySelectorAll(".pill.scheduled").length === 3);
    check(published.length === 3 && published.every(x => x.image.size > 10_000 && x.scheduledAt), "proxy: 3 PNG posters scheduled through the server");
    check(published[0].caption === "Texte 1\n\n#ACME", "proxy: caption + hashtags");
    const poster = await p.evaluate(() => document.querySelector("dolphin-studio").shadowRoot.querySelector("canvas").toDataURL());
    await import("node:fs").then(fs => fs.writeFileSync(join(OUT, "poster-1.png"), Buffer.from(poster.split(",")[1], "base64")));
    await p.setViewportSize({ width: 390, height: 900 });
    await p.waitForTimeout(200);
    check(await p.evaluate(() => document.documentElement.scrollWidth <= 390), "proxy: no horizontal scroll on mobile");
    await p.screenshot({ path: join(OUT, "proxy-mobile.png") });
    check(errors.length === 0, `proxy: no console errors ${errors.join(" | ")}`);
    await p.close();
  }

  // 2. Direct mode (Claude and Facebook mocked at the network level)
  {
    const { p, errors } = await page("http://localhost:8787/examples/direct/index.html");
    let claudeReq, fbCalls = 0;
    await p.route("https://api.anthropic.com/**", async route => {
      claudeReq = { body: JSON.parse(route.request().postData()), headers: route.request().headers() };
      const text = JSON.stringify({ posts: drafts("fr").slice(0, 2) });
      const ev = (n, d) => `event: ${n}\ndata: ${JSON.stringify(d)}\n\n`;
      await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body:
        ev("message_start", { type: "message_start", message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 3000, output_tokens: 1 } } })
        + ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })
        + ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })
        + ev("content_block_stop", { type: "content_block_stop", index: 0 })
        + ev("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 3000 } })
        + ev("message_stop", { type: "message_stop" }) });
    });
    await p.route("https://graph.facebook.com/**", route => { fbCalls++; return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ id: "1", post_id: "p_1", name: "ACME" }) }); });
    await p.fill("dolphin-studio input[name=pass]", "phrase-secrete");
    await p.fill("dolphin-studio input[name=pass2]", "phrase-secrete");
    await p.click("dolphin-studio button[type=submit]");
    await p.fill("dolphin-studio [data-key=claudeKey]", "sk-ant-test");
    await p.fill("dolphin-studio [data-key=metaPageId]", "123");
    await p.fill("dolphin-studio [data-key=metaToken]", "EAAtest");
    await p.click("dolphin-studio [data-act=save-keys]");
    const vault = await p.evaluate(() => localStorage.getItem("dolphin:acme:vault"));
    check(vault && !vault.includes("sk-ant-test"), "direct: keys encrypted at rest");
    await p.fill("dolphin-studio [data-pref=count]", "2");
    await p.click("dolphin-studio [data-act=generate]");
    await p.waitForFunction(() => document.querySelector("dolphin-studio").shadowRoot.querySelectorAll("canvas").length >= 2);
    check(claudeReq?.body.model === "claude-opus-5-5" && claudeReq.body.output_config?.format?.type === "json_schema" && claudeReq.body.stream === true, "direct: Claude called with streaming + JSON schema");
    check(claudeReq?.headers["x-api-key"] === "sk-ant-test", "direct: key sent to Claude only");
    await p.click("dolphin-studio [data-act=publish]");
    await p.waitForFunction(() => document.querySelector("dolphin-studio").shadowRoot.querySelector(".pill.published"));
    check(fbCalls === 1, "direct: published on Facebook");
    // lock / unlock keeps keys
    await p.click("dolphin-studio [data-act=lock]");
    await p.fill("dolphin-studio input[name=pass]", "phrase-secrete");
    await p.click("dolphin-studio button[type=submit]");
    check(/Clé Claude enregistrée/.test(await p.textContent("dolphin-studio .state")), "direct: unlock restores keys");
    check(errors.length === 0, `direct: no console errors ${errors.join(" | ")}`);
    await p.close();
  }

  // 3. Keys managed by the host page: no passphrase screen, changes reported to the host
  {
    const { p, errors } = await page("http://localhost:8787/examples/direct/index.html");
    await p.route("https://api.anthropic.com/**", route => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }) }));
    await p.evaluate(async () => {
      document.querySelector("#studio").innerHTML = "";
      const brand = await (await fetch("../brand.example.json")).json();
      window.saved = [];
      Dolphin.mount("#studio", { mode: "direct", brand, secrets: { claudeKey: "sk-ant-host" }, onSecretsChange: s => { window.saved.push(s); } });
    });
    await p.waitForSelector("dolphin-studio [data-act=generate]");
    check(await p.$("dolphin-studio input[name=pass]") === null && await p.$("dolphin-studio [data-act=lock]") === null, "host keys: no passphrase screen, no lock button");
    check(/Clé Claude enregistrée/.test(await p.textContent("dolphin-studio .state")), "host keys: Claude key detected");
    await p.fill("dolphin-studio [data-key=metaPageId]", "999");
    await p.click("dolphin-studio [data-act=save-keys]");
    check(await p.evaluate(() => window.saved.length === 1 && window.saved[0].metaPageId === "999" && window.saved[0].claudeKey === "sk-ant-host"), "host keys: onSecretsChange receives the new keys");
    check(await p.evaluate(() => localStorage.getItem("dolphin:acme:vault")) === null, "host keys: nothing written to the widget vault");
    await p.click("dolphin-studio [data-act=generate]");
    await p.waitForFunction(() => /invalide/.test(document.querySelector("dolphin-studio").shadowRoot.querySelector(".toast")?.textContent ?? ""));
    check(true, "host keys: Claude 401 shown as a clear message");
    check(errors.length === 0, `host keys: no console errors ${errors.join(" | ")}`);
    await p.close();
  }

  // 4. Arabic, right to left
  {
    const { p, errors } = await page("http://localhost:8787/examples/plain-html/index.html");
    await p.evaluate(() => {
      const old = document.querySelector("dolphin-studio");
      const cfg = JSON.parse(old.querySelector("script").textContent);
      old.remove();
      localStorage.clear();
      Dolphin.mount("main", { ...cfg, brand: { ...cfg.brand, id: "acme-ar", language: "ar" } });
    });
    await p.fill("dolphin-studio [data-pref=count]", "1");
    await p.click("dolphin-studio [data-act=generate]");
    await p.waitForFunction(() => document.querySelector("dolphin-studio").shadowRoot.querySelector("canvas"));
    await p.waitForTimeout(600);
    check(await p.evaluate(() => document.querySelector("dolphin-studio").getAttribute("dir")) === "rtl", "ar: interface right to left");
    await p.screenshot({ path: join(OUT, "arabic.png"), fullPage: true });
    const poster = await p.evaluate(() => document.querySelector("dolphin-studio").shadowRoot.querySelector("canvas").toDataURL());
    await import("node:fs").then(fs => fs.writeFileSync(join(OUT, "poster-ar.png"), Buffer.from(poster.split(",")[1], "base64")));
    check(errors.length === 0, `ar: no console errors ${errors.join(" | ")}`);
    await p.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(failures.length ? `\n${failures.length} check(s) failed` : `\nAll checks passed. Screenshots: ${OUT}`);
process.exit(failures.length ? 1 : 0);
