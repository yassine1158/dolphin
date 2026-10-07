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
const published = [], generated = [], analyzed = [];
const handler = createDolphinHandler({
  apiToken: "change-me",
  llm: {
    generate: async (brand, req) => { generated.push({ brand, req }); return { drafts: drafts(brand.language).slice(0, req.count), usage: { inputTokens: 3000, outputTokens: 4000 }, model: "claude-opus-5-5" }; },
    analyze: async (snapshot, brand) => {
      analyzed.push({ snapshot, brand });
      return {
        brand: brand ?? { name: snapshot.structured.name ?? "?", location: "Cocody, Abidjan", audience: "familles et bureaux", language: "fr",
          products: [{ name: "Pain au feu de bois", status: "available" }, { name: "Livraison à domicile", status: "soon" }], contact: { callToAction: "Commandez sur WhatsApp" } },
        ideas: [{ title: "La fournée de 6 h", angle: "Montrer le pain qui sort du four", product: "Pain au feu de bois", why: "Donne envie le matin" },
                { title: "Gâteau d'anniversaire", angle: "Rappeler la commande 48 h avant", why: "Commandes plus faciles" }],
        usage: { inputTokens: 2000, outputTokens: 900 }, model: "claude-opus-5-5",
      };
    },
  },
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
const tab = async (p, name) => {
  await p.click(`dolphin-studio [data-tab=${name}]`);
  await p.waitForSelector(`dolphin-studio [data-tab=${name}][aria-selected=true]`);
};
/** Reads a value saved by the widget (IndexedDB "dolphin", store "kv"). */
const idb = (p, key) => p.evaluate(async k => {
  if (!(await indexedDB.databases()).some(d => d.name === "dolphin")) return null;
  return new Promise(res => {
    const r = indexedDB.open("dolphin");
    r.onsuccess = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("kv")) { db.close(); res(null); return; }
      const g = db.transaction("kv").objectStore("kv").get(k);
      g.onsuccess = () => { db.close(); res(g.result ?? null); };
      g.onerror = () => { db.close(); res(null); };
    };
    r.onerror = () => res(null);
  });
}, key);

try {
  // 1. Proxy mode
  {
    const { p, errors } = await page("http://localhost:8787/examples/plain-html/index.html");
    await p.fill("dolphin-studio [data-pref=count]", "3");
    await p.click("dolphin-studio [data-act=generate]");
    await p.waitForFunction(() => document.querySelector("dolphin-studio").shadowRoot.querySelectorAll("canvas").length === 3);
    await p.waitForTimeout(600);
    check(/3 publication/.test(await p.textContent("dolphin-studio .toast")), "proxy: 3 posts generated");
    const hours = await p.$$eval("dolphin-studio input[type=datetime-local]", els => els.map(e => Number(e.value.slice(11, 13))));
    check(hours.length === 3 && hours.every(h => h === 19 || h === 10), `proxy: auto peak times by default (${hours.join(", ")} h)`);
    await tab(p, "audience");
    await p.click("dolphin-studio [data-act=peaks]");
    await p.waitForSelector("dolphin-studio .hm-cell");
    check((await p.$$("dolphin-studio .hm-cell")).length === 42 && /Recommandation générale/.test(await p.textContent("dolphin-studio .peaks ~ * , dolphin-studio .card .state.missing") ?? ""), "proxy: peak card (heat map, general recommendation without history)");
    await tab(p, "posts");
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
    const fbHistory = [];
    await p.route("https://graph.facebook.com/**", route => { if (route.request().url().includes("/published_posts")) fbHistory.push(route.request().url()); else fbCalls++; return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ id: "1", post_id: "p_1", name: "ACME" }) }); });
    await p.fill("dolphin-studio input[name=pass]", "phrase-secrete");
    await p.fill("dolphin-studio input[name=pass2]", "phrase-secrete");
    await p.click("dolphin-studio button[type=submit]");
    await p.fill("dolphin-studio [data-key=claudeKey]", "sk-ant-test");
    await p.fill("dolphin-studio [data-key=metaPageId]", "123");
    await p.fill("dolphin-studio [data-key=metaToken]", "EAAtest");
    await p.click("dolphin-studio [data-act=save-keys]");
    const vault = await idb(p, "dolphin:acme:vault");
    check(vault && !vault.includes("sk-ant-test"), "direct: keys encrypted at rest");
    await p.fill("dolphin-studio [data-pref=count]", "2");
    await p.click("dolphin-studio [data-act=generate]");
    await p.waitForFunction(() => document.querySelector("dolphin-studio").shadowRoot.querySelectorAll("canvas").length >= 2);
    check(claudeReq?.body.model === "claude-opus-5-5" && claudeReq.body.output_config?.format?.type === "json_schema" && claudeReq.body.stream === true, "direct: Claude called with streaming + JSON schema");
    check(claudeReq?.headers["x-api-key"] === "sk-ant-test", "direct: key sent to Claude only");
    await p.click("dolphin-studio [data-act=publish]");
    await p.waitForFunction(() => document.querySelector("dolphin-studio").shadowRoot.querySelector(".pill.published"));
    check(fbCalls === 1, "direct: published on Facebook");
    check(fbHistory.length === 1 && fbHistory[0].includes("access_token=EAAtest"), "direct: page history read for peak times");
    // lock / unlock keeps keys
    await p.click("dolphin-studio [data-act=lock]");
    await p.fill("dolphin-studio input[name=pass]", "phrase-secrete");
    await p.click("dolphin-studio button[type=submit]");
    await tab(p, "settings");
    check(/Clé Claude enregistrée/.test(await p.textContent("dolphin-studio .state")), "direct: unlock restores keys");
    check(errors.length === 0, `direct: no console errors ${errors.join(" | ")}`);
    await p.close();
  }

  // 3. Keys managed by the host page: no passphrase screen, changes reported to the host
  {
    const { p, errors } = await page("http://localhost:8787/examples/direct/index.html");
    await p.waitForSelector("dolphin-studio input[name=pass]"); // the page's own widget is mounted: replace it
    await p.route("https://api.anthropic.com/**", route => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }) }));
    await p.evaluate(async () => {
      document.querySelector("#studio").innerHTML = "";
      const brand = await (await fetch("../brand.example.json")).json();
      window.saved = [];
      Dolphin.mount("#studio", { mode: "direct", brand, secrets: { claudeKey: "sk-ant-host" }, onSecretsChange: s => { window.saved.push(s); } });
    });
    await p.waitForSelector("dolphin-studio [data-act=generate]");
    check(await p.$("dolphin-studio input[name=pass]") === null && await p.$("dolphin-studio [data-act=lock]") === null, "host keys: no passphrase screen, no lock button");
    await tab(p, "settings");
    check(/Clé Claude enregistrée/.test(await p.textContent("dolphin-studio .state")), "host keys: Claude key detected");
    await p.fill("dolphin-studio [data-key=metaPageId]", "999");
    await p.click("dolphin-studio [data-act=save-keys]");
    check(await p.evaluate(() => window.saved.length === 1 && window.saved[0].metaPageId === "999" && window.saved[0].claudeKey === "sk-ant-host"), "host keys: onSecretsChange receives the new keys");
    check(await idb(p, "dolphin:acme:vault") === null && await p.evaluate(() => localStorage.getItem("dolphin:acme:vault")) === null, "host keys: nothing written to the widget vault");
    await tab(p, "create");
    await p.click("dolphin-studio [data-act=generate]");
    await p.waitForFunction(() => /invalide/.test(document.querySelector("dolphin-studio").shadowRoot.querySelector(".toast")?.textContent ?? ""));
    check(true, "host keys: Claude 401 shown as a clear message");
    check(errors.length === 0, `host keys: no console errors ${errors.join(" | ")}`);
    await p.close();
  }

  // 4. No brand given: DOLPHin reads the site, proposes the profile, logo and colors, then ideas
  {
    const { p, errors } = await page("http://localhost:8787/examples/auto/index.html");
    await p.waitForSelector("dolphin-studio [data-act=analyze]");
    check(await p.$("dolphin-studio [data-act=generate]") === null, "auto: nothing to generate before the profile is saved");
    await p.click("dolphin-studio [data-act=analyze]");
    await p.waitForSelector("dolphin-studio [data-act=save-profile]");
    const snap = analyzed.at(-1).snapshot;
    check(snap.structured.name === "Le Fournil" && snap.whatsapp[0] === "+2250711223344" && snap.logoCandidates[0]?.endsWith("/examples/auto/logo.svg") && snap.text.includes("feu de bois"), "auto: site read (JSON-LD, WhatsApp, logo, text)");
    check(analyzed.at(-1).brand === undefined, "auto: no brand sent before a profile exists");
    check(await p.inputValue("dolphin-studio [data-b=name]") === "Le Fournil" && await p.inputValue("dolphin-studio [data-b='contact.whatsapp']") === "+225 07 11 22 33 44", "auto: profile proposed with the site's contact");
    check((await p.getAttribute("dolphin-studio .logo-preview img", "src"))?.startsWith("data:image/png"), "auto: logo taken from the site");
    const primary = await p.inputValue("dolphin-studio [data-b='colors.primary']"), accent = await p.inputValue("dolphin-studio [data-b='colors.accent']");
    check(primary === "#6b3e1f" && accent === "#f2b705", `auto: colors from the logo (${primary}, ${accent})`);
    await p.screenshot({ path: join(OUT, "auto-profile.png"), fullPage: true });
    // the owner uploads another logo
    const before = await p.getAttribute("dolphin-studio .logo-preview img", "src"); // read before the upload: it can finish very fast
    await p.setInputFiles("dolphin-studio [data-upload]", join(ROOT, "examples/dolphin-mark.svg"));
    await p.waitForFunction(old => document.querySelector("dolphin-studio").shadowRoot.querySelector(".logo-preview img")?.src !== old, before);
    const uploaded = await p.getAttribute("dolphin-studio .logo-preview img", "src");
    check(uploaded?.startsWith("data:image/png"), "auto: uploaded logo replaces it");
    await p.selectOption("dolphin-studio [data-b='products.1.status']", "soon");
    await p.click("dolphin-studio [data-act=save-profile]");
    await p.waitForSelector("dolphin-studio [role=tab]");
    check(await p.getAttribute("dolphin-studio [data-tab=create]", "aria-selected") === "true", "auto: tabs appear once the profile is saved, on « Créer »");
    check((await p.$$("dolphin-studio .idea")).length === 2, "auto: post ideas shown");
    await tab(p, "settings");
    await p.waitForSelector("dolphin-studio [data-act=edit-profile]");
    check(/2 produit\(s\), dont 1 disponible/.test(await p.textContent("dolphin-studio .profile-sum")), "auto: profile saved");
    await tab(p, "create");
    await p.click("dolphin-studio [data-act=write-idea]");
    await p.waitForFunction(() => document.querySelector("dolphin-studio").shadowRoot.querySelectorAll("canvas").length === 1);
    const g = generated.at(-1);
    check(g.brand.name === "Le Fournil" && g.brand.logoUrl?.startsWith("data:image/png") && /La fournée de 6 h/.test(g.req.subject ?? ""), "auto: idea written with the saved profile");
    await p.waitForTimeout(600);
    await p.screenshot({ path: join(OUT, "auto-ideas.png"), fullPage: true });
    const poster = await p.evaluate(() => document.querySelector("dolphin-studio").shadowRoot.querySelector("canvas").toDataURL());
    await import("node:fs").then(fs => fs.writeFileSync(join(OUT, "poster-auto.png"), Buffer.from(poster.split(",")[1], "base64")));
    // reload: the profile and ideas persist
    await p.reload();
    await p.waitForSelector("dolphin-studio [role=tab]");
    await tab(p, "create");
    await p.waitForSelector("dolphin-studio .idea");
    check((await p.$$("dolphin-studio .idea")).length === 2 && (await p.$$("dolphin-studio [data-tab=posts] .count")).length === 1, "auto: profile, ideas and posts kept after reload");
    check(errors.length === 0, `auto: no console errors ${errors.join(" | ")}`);
    await p.close();
  }

  // 5. Arabic, right to left
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

  // 6. Marketing manager and designer: campaign, formats, photo, story copy, calendar, CSV export, data import
  {
    const { p, errors } = await page("http://localhost:8787/examples/plain-html/index.html");
    await p.evaluate(() => {
      const old = document.querySelector("dolphin-studio");
      const cfg = JSON.parse(old.querySelector("script").textContent);
      old.remove();
      localStorage.clear();
      Dolphin.mount("main", { ...cfg, brand: { ...cfg.brand, id: "acme-pro" } });
    });
    const sr = fn => p.evaluate(fn);
    await p.waitForSelector("dolphin-studio details.campaign");
    await p.click("dolphin-studio details.campaign summary");
    await p.selectOption("dolphin-studio [data-pref='c.objective']", "event");
    await p.fill("dolphin-studio [data-pref='c.campaign']", "Portes ouvertes");
    await p.fill("dolphin-studio [data-pref='c.offer']", "Portes ouvertes samedi 12 octobre");
    await p.fill("dolphin-studio [data-pref='c.link']", "https://acme.example/visite");
    await p.selectOption("dolphin-studio [data-pref='c.format']", "square");
    await p.fill("dolphin-studio [data-pref=count]", "2");
    await p.click("dolphin-studio [data-act=generate]");
    await p.waitForFunction(() => document.querySelector("dolphin-studio").shadowRoot.querySelectorAll("canvas").length === 2);
    const g = generated.at(-1);
    check(g.req.objective === "event" && /12 octobre/.test(g.req.offer ?? "") && g.req.link === undefined, "pro: objective and offer sent to the model, link kept local");
    check(await sr(() => [...document.querySelector("dolphin-studio").shadowRoot.querySelectorAll("canvas")].every(c => c.width === 1080 && c.height === 1080)), "pro: square posters (1080×1080)");
    // designer: centered layout and a background photo on the first post
    await p.click("dolphin-studio details.designer summary");
    await p.selectOption("dolphin-studio [data-d$=':layout']", "centered");
    const photo = await p.screenshot({ type: "jpeg", quality: 70, clip: { x: 0, y: 0, width: 800, height: 600 } });
    await p.setInputFiles("dolphin-studio [data-photo]", { name: "photo.jpg", mimeType: "image/jpeg", buffer: photo });
    await p.waitForSelector("dolphin-studio [data-act=no-photo]");
    const stored = JSON.parse(await idb(p, "dolphin:acme-pro:posts:acme-pro"));
    check(stored[0].design?.layout === "centered" && stored[0].design?.photo?.startsWith("data:image/jpeg") && stored[0].campaign === "Portes ouvertes", "pro: layout, photo and campaign saved on the post");
    await p.waitForTimeout(500);
    const designed = await sr(() => document.querySelector("dolphin-studio").shadowRoot.querySelector("canvas").toDataURL());
    await import("node:fs").then(fs => fs.writeFileSync(join(OUT, "poster-photo.png"), Buffer.from(designed.split(",")[1], "base64")));
    // story copy
    await p.click("dolphin-studio [data-act=story]");
    await p.waitForFunction(() => document.querySelector("dolphin-studio").shadowRoot.querySelectorAll("canvas").length === 3);
    check(await sr(() => { const c = document.querySelector("dolphin-studio").shadowRoot.querySelectorAll("canvas")[1]; return c.width === 1080 && c.height === 1920; }), "pro: story copy (1080×1920) next to the original");
    await p.waitForTimeout(500);
    const story = await sr(() => document.querySelector("dolphin-studio").shadowRoot.querySelectorAll("canvas")[1].toDataURL());
    await import("node:fs").then(fs => fs.writeFileSync(join(OUT, "poster-story.png"), Buffer.from(story.split(",")[1], "base64")));
    check(await p.textContent("dolphin-studio [data-tab=posts] .count") === "3", "pro: the « Publications » tab counts the 3 drafts");
    await tab(p, "calendar");
    const chips = (await p.$$("dolphin-studio .chip")).length;
    check(chips === 3, `pro: calendar shows the 3 posts (${chips})`);
    await p.click("dolphin-studio .chip");
    await p.waitForSelector("dolphin-studio article.flash");
    check(await p.getAttribute("dolphin-studio [data-tab=posts]", "aria-selected") === "true", "pro: a calendar chip opens its post");
    // keyboard: arrow keys move between tabs
    await p.focus("dolphin-studio [data-tab=posts]");
    await p.keyboard.press("ArrowRight");
    await p.waitForFunction(() => document.querySelector("dolphin-studio").shadowRoot.activeElement?.dataset.tab === "calendar");
    check(true, "pro: arrow keys move between tabs");
    await tab(p, "posts");
    // export the plan
    const [download] = await Promise.all([p.waitForEvent("download"), p.click("dolphin-studio [data-act=export-csv]")]);
    const csv = await import("node:fs").then(async fs => fs.readFileSync(await download.path(), "utf8"));
    check(csv.startsWith("﻿date,time,status") && /utm_campaign=portes-ouvertes/.test(csv) && csv.split("\r\n").length === 5, "pro: plan exported as CSV with tracked links");
    // import a Business Suite export: insights appear
    const rows = Array.from({ length: 24 }, (_, i) => { const d = new Date(2026, 4, 1 + i, i % 2 ? 19 : 9); return `${i},Post ${i},${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/2026 ${d.getHours()}:00,${i % 2 ? 60 : 8},${i % 2 ? 6 : 1},${i % 2 ? 3 : 0}`; });
    await tab(p, "audience");
    await p.setInputFiles("dolphin-studio [data-import]", { name: "posts.csv", mimeType: "text/csv", buffer: Buffer.from(`Post ID,Title,Publish time,Reactions,Comments,Shares\n${rows.join("\n")}\n`) });
    await p.waitForSelector("dolphin-studio .kpis");
    const kpis = await p.textContent("dolphin-studio .kpis");
    check(/24/.test(kpis) && (await p.$$("dolphin-studio .bar-row")).length === 7 && (await p.$$("dolphin-studio .col")).length === 24, "pro: CSV import → insights (KPIs, days, hours)");
    check(await sr(() => /Calculé à partir de 24 lignes importées/.test(document.querySelector("dolphin-studio").shadowRoot.textContent)), "pro: peak card based on the imported file");
    await p.screenshot({ path: join(OUT, "pro.png"), fullPage: true });
    // publish: the tracked link is in the caption
    await tab(p, "posts");
    const before = published.length;
    await p.click("dolphin-studio [data-act=schedule-all]");
    await p.waitForFunction(() => document.querySelector("dolphin-studio").shadowRoot.querySelectorAll(".pill.scheduled").length === 3);
    const sent = published.slice(before);
    check(sent.length === 3 && sent.every(x => /👉 https:\/\/acme\.example\/visite\?utm_source=facebook&utm_medium=social&utm_campaign=portes-ouvertes/.test(x.caption)), "pro: captions carry the UTM link");
    check(sent[0].image.type === "image/jpeg" && sent[0].image.size < 3_900_000 && sent.slice(1).some(x => x.image.type === "image/png"), "pro: a poster with a photo goes out as JPEG (under Facebook's 4 MB), the others as PNG");
    await p.setViewportSize({ width: 390, height: 900 });
    await p.waitForTimeout(200);
    check(await p.evaluate(() => document.documentElement.scrollWidth <= 390), "pro: no horizontal scroll on mobile");
    await p.screenshot({ path: join(OUT, "pro-mobile.png"), fullPage: true });
    check(errors.length === 0, `pro: no console errors ${errors.join(" | ")}`);
    await p.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(failures.length ? `\n${failures.length} check(s) failed` : `\nAll checks passed. Screenshots: ${OUT}`);
process.exit(failures.length ? 1 : 0);
