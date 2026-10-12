import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

const source = new URL("../src/", import.meta.url).href;
const compiled = new URL("../lib/", import.meta.url).href;

// Exercise current source through native SDK modules without emitting shared lib/.
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL !== undefined && specifier.startsWith(".")) {
      let url = new URL(specifier, context.parentURL).href;
      if (url.startsWith(compiled)) url = source + url.slice(compiled.length);
      if (url.startsWith(source) && url.endsWith(".js")) {
        const input = `${url.slice(0, -3)}.ts`;
        if (existsSync(fileURLToPath(input))) return { url: input, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.startsWith(source) || !url.endsWith(".ts")) return next(url, context);
    const output = transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
      fileName: fileURLToPath(url), compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022, verbatimModuleSyntax: true }
    });
    return { format: "module", source: output.outputText, shortCircuit: true };
  }
});
