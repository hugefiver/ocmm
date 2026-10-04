import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  absWorkingDir: root, entryPoints: ["src/client/index.ts"], outfile: "lib/client.js",
  bundle: true, platform: "browser", format: "cjs", target: "es2022", charset: "utf8",
  external: ["react", "react/jsx-runtime", "@deepseek-ai/dsh-client-ui-primitives"],
  banner: { js: 'window.__ModuleLoader__.load({ id: "@dsmm/dsmm", factory: (require) => { const module = { exports: {} }; const exports = module.exports;' },
  footer: { js: "return module.exports; } });" },
  logLevel: "info",
});
