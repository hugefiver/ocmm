import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syncSourceAssets } from "./sync-source-assets.mjs";
import { generateRoleAssets } from "./generate-role-assets.mjs";
import { frontendRecipe } from "./frontend-recipe.mjs";
import { checkFrontendAssets } from "./materialize-frontend.mjs";
import { skillResourceProblems } from "./source-input-resources.mjs";
export { skillResourceProblems } from "./source-input-resources.mjs";

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
