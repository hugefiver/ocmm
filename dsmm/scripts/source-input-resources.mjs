import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SKILL_SOURCES } from "./source-inventory.mjs";
import { frontendRecipe } from "./frontend-recipe.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function skillResourceProblems(root = packageRoot, outputs) {
  const files = new Map();
  if (outputs !== undefined) {
    for (const [path, bytes] of outputs) if (path.startsWith("skills/")) files.set(path, bytes);
    const index = files.get("skills/frontend/references/design/_INDEX.md");
    if (index === undefined) throw new Error("missing generated frontend index");
    for (const row of frontendRecipe(root, index.toString("utf8"))) files.set(`skills/frontend/${row.target}`, readFileSync(join(root, "skills/frontend", row.target)));
  } else {
    const walk = (directory) => readdirSync(join(root, directory)).sort().forEach((name) => {
      if (["__pycache__", "node_modules", ".git"].includes(name) || name.endsWith(".pyc")) return;
      const path = `${directory}/${name}`, stat = lstatSync(join(root, path));
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error(`linked or non-regular skill resource: ${path}`);
      if (stat.isDirectory()) walk(path); else files.set(path, readFileSync(join(root, path)));
    });
    for (const name of Object.keys(SKILL_SOURCES)) {
      const path = `skills/${name}`;
      if (!existsSync(join(root, path))) throw new Error(`missing skill resource tree: ${path}`);
      if (lstatSync(join(root, path)).isSymbolicLink()) throw new Error(`linked skill resource tree: ${path}`);
      walk(path);
    }
  }
  const problems = [];
  for (const [file, bytes] of files) {
    if (!file.endsWith(".md") || /^(?:ATTRIBUTION|NOTICE|LICENSE)(?:[.-]|$)/iu.test(basename(file))) continue;
    const base = resolve(root, "skills", file.split("/")[1]);
    const text = bytes.toString("utf8").replace(/<!--[\s\S]*?-->/gu, "");
    if (/Task tool \(general-purpose\)|task\(description=|Use TodoWrite|~\/\.opencode\/teams\//u.test(text)) problems.push({ file, reason: "unadapted host invocation" });
    const references = [...text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/gu)].map((match) => match[1]);
    references.push(...[...text.matchAll(/`((?:references|scripts|assets|templates|data)\/[\w./-]+\.(?:md|mjs|py|json|csv|ps1|sh))`/gu)].map((match) => match[1]));
    if (["skills/frontend/SKILL.md", "skills/frontend/references/design/_INDEX.md"].includes(file)) for (const match of text.matchAll(/`(?:references\/design\/|design\/)?([\w.-]+\.md)`/gu)) {
      if (!["DESIGN.md", "SKILL.md", "README.md", "react-perf-tooling.md"].includes(match[1])) references.push(`references/design/${match[1]}`);
    }
    for (const reference of new Set(references)) {
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/iu.test(reference) || /[<>*{}]/u.test(reference)) continue;
      const path = reference.split("#")[0];
      const target = resolve(/^(?:references|scripts|assets|templates|data)\//u.test(path) ? base : dirname(join(root, file)), path);
      const artifact = relative(root, target).replaceAll("\\", "/");
      if (target !== base && !target.startsWith(`${base}${sep}`)) problems.push({ file, reference, reason: "resource escapes skill base" });
      else if (target !== base && !files.has(artifact) && ![...files.keys()].some((path) => path.startsWith(`${artifact}/`))) problems.push({ file, reference, reason: "missing resource" });
    }
  }
  return problems;
}
