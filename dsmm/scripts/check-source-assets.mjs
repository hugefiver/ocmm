import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { syncSourceAssets } from "./sync-source-assets.mjs";
import { generateRoleAssets } from "./generate-role-assets.mjs";
import { frontendRecipe } from "./frontend-recipe.mjs";
import { checkFrontendAssets } from "./materialize-frontend.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// The source frontend router/index name the materialized reference inventory.
// Derive required filenames from those actual files, not a size/count quota.
export function missingFrontendResources(root = packageRoot) {
  const skillRoot = join(root, "skills/frontend"), design = join(skillRoot, "references/design");
  const entry = readFileSync(join(skillRoot, "SKILL.md"), "utf8");
  const index = readFileSync(join(design, "_INDEX.md"), "utf8");
  const required = new Set(frontendRecipe(root).map((row) => row.target));
  for (const text of [entry, index]) {
    for (const match of text.matchAll(/`(?:references\/design\/|design\/)?([\w.-]+\.md)`/gu)) {
      if (["DESIGN.md", "SKILL.md", "README.md", "react-perf-tooling.md"].includes(match[1])) continue;
      required.add(`references/design/${match[1]}`);
    }
  }
  return [...required].filter((path) => !existsSync(join(skillRoot, path))).sort();
}

export function skillResourceProblems(root = packageRoot) {
  const problems = [];
  const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : entry.name.endsWith(".md") ? [path] : [];
  });
  for (const name of readdirSync(join(root, "skills"))) {
    const base = resolve(root, "skills", name);
    for (const file of walk(base)) {
      // Notices describe upstream paths, not executable resource lookups.
      if (/^(?:ATTRIBUTION|NOTICE|LICENSE)(?:[.-]|$)/iu.test(basename(file))) continue;
      const text = readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/gu, "");
      if (/Task tool \(general-purpose\)|task\(description=|Use TodoWrite|~\/\.opencode\/teams\//u.test(text)) problems.push({ file: relative(root, file), reason: "unadapted host invocation" });
      const references = [...text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/gu)].map((match) => match[1]);
      references.push(...[...text.matchAll(/`((?:references|scripts|assets|templates|data)\/[\w./-]+\.(?:md|mjs|py|json|csv|ps1|sh))`/gu)].map((match) => match[1]));
      for (const reference of new Set(references)) {
        if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/iu.test(reference) || /[<>*{}]/u.test(reference)) continue;
        const path = reference.split("#")[0];
        const target = resolve(/^(?:references|scripts|assets|templates|data)\//u.test(path) ? base : dirname(file), path);
        if (target !== base && !target.startsWith(`${base}${sep}`)) problems.push({ file: relative(root, file), reference, reason: "resource escapes skill base" });
        else if (!existsSync(target)) problems.push({ file: relative(root, file), reference, reason: "missing resource" });
      }
    }
  }
  return problems;
}

export function checkSourceAssets() {
  const source = syncSourceAssets({ check: true }), generated = generateRoleAssets({ check: true });
  const missing = missingFrontendResources();
  const resources = skillResourceProblems();
  const frontend = checkFrontendAssets();
  return { outcome: source.differences.length === 0 && generated.differences.length === 0 && missing.length === 0 && resources.length === 0 && frontend.outcome === "ready" ? "ready" : "failed", source, generated, missingFrontendResources: missing, resourceProblems: resources, frontend: { ...frontend, files: frontend.files.length } };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error("usage: check-source-assets.mjs");
  const result = checkSourceAssets();
  console.log(JSON.stringify(result, null, 2));
  if (result.outcome !== "ready") process.exitCode = 1;
}
