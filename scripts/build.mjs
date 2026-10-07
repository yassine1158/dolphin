// Builds every distributable from src/. Types are emitted separately by tsc.
import { build } from "esbuild";
import { rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
const banner = { js: "/*! DOLPHin 0.2.0 · (c) Yassine Chaabane */" };
const common = { bundle: true, sourcemap: true, target: "es2022", legalComments: "eof", logLevel: "info" };

await Promise.all([
  // <script> tags, any website: window.Dolphin + <dolphin-studio>
  build({ ...common, entryPoints: ["src/browser.ts"], outfile: "dist/dolphin.js", format: "iife", platform: "browser", minify: true, sourcemap: false, banner }),
  build({ ...common, entryPoints: ["src/browser-lite.ts"], outfile: "dist/dolphin.lite.js", format: "iife", platform: "browser", minify: true, sourcemap: false, banner }),
  // bundlers (Vite, webpack, Next…): import { mount } from "@dolphin/studio"
  build({ ...common, entryPoints: ["src/index.ts"], outfile: "dist/dolphin.esm.js", format: "esm", platform: "browser", external: ["@anthropic-ai/sdk"], banner }),
  // Node server
  build({ ...common, entryPoints: ["src/server/index.ts"], outfile: "dist/server.mjs", format: "esm", platform: "node", external: ["@anthropic-ai/sdk"], banner }),
  build({ ...common, entryPoints: ["src/server/cli.ts"], outfile: "dist/server-cli.mjs", format: "esm", platform: "node", external: ["@anthropic-ai/sdk"] }),
]);
