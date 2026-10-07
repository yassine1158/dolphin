// Local demo: one port serves the example pages AND the DOLPHin API, with your real keys.
// Usage: copy .env.example to .env, fill ANTHROPIC_API_KEY (and optionally META_*), then `npm run demo`.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { ClaudeLlm, MetaPagePublisher, createDolphinHandler } from "../dist/server.mjs";

const env = process.env;
const ROOT = new URL("..", import.meta.url).pathname;
const PORT = Number(env.PORT ?? 8787);

if (!env.ANTHROPIC_API_KEY) {
  console.error("\n  ANTHROPIC_API_KEY manquante : copiez .env.example en .env et collez votre clé Claude.\n");
  process.exit(1);
}
const publisher = env.META_PAGE_ID && env.META_PAGE_TOKEN
  ? new MetaPagePublisher({ pageId: env.META_PAGE_ID, accessToken: env.META_PAGE_TOKEN })
  : undefined;
const api = createDolphinHandler({
  llm: new ClaudeLlm({ apiKey: env.ANTHROPIC_API_KEY, ...(env.DOLPHIN_MODEL ? { model: env.DOLPHIN_MODEL } : {}) }),
  ...(publisher ? { publisher } : {}),
  apiToken: "change-me", // same token as examples/plain-html; this demo only listens on localhost
  log: line => console.log(`  ${line}`),
});

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (path.startsWith("/v1/")) return void api(req, res);
  if (path === "/") { res.statusCode = 302; res.setHeader("location", "/examples/plain-html/"); return res.end(); }
  let file = normalize(join(ROOT, path));
  if (file.endsWith("/")) file = join(file, "index.html");
  if (!file.startsWith(ROOT) || file.includes("node_modules") || file.includes(".env") || !existsSync(file) || statSync(file).isDirectory()) {
    res.statusCode = 404; return res.end("Not found");
  }
  res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
  createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`\n  DOLPHin démo prête : http://localhost:${PORT}`);
  console.log(`  Génération : Claude ${env.DOLPHIN_MODEL ?? "claude-opus-5-5"} · Publication Facebook : ${publisher ? "activée" : "désactivée (téléchargement seulement)"}\n`);
});
