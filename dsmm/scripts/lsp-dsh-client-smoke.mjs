import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { smokeDshMcpClient } from "./docker-smoke.mjs";

if (process.argv.length !== 4) throw new Error("Usage: node lsp-dsh-client-smoke.mjs <pinned-dsh-package.json> <ocmm-lsp executable>");
const dshManifest = resolve(process.argv[2]);
const manifest = JSON.parse(readFileSync(dshManifest, "utf8"));
if (manifest.name !== "@deepseek-ai/dsh" || manifest.version !== "0.2.0-rc.2") throw new Error("DSH 0.2.0-rc.2 is required");
const dsmm = await import(new URL("../lib/index.js", import.meta.url));
await smokeDshMcpClient(createRequire(dshManifest), dsmm, resolve(process.argv[3]));
console.log(`DSH_MCP_DIAGNOSTICS_FORMAT_OK ${fileURLToPath(import.meta.url)}`);
