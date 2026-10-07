import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DSMM_ROLES, renderAgentCordis, renderPresetMetadata } from "../lib/roles.js";
import { BASE_DEEPWORK_PROMPT, DEEPSEEK_FLASH_OVERLAY, DEEPSEEK_V4_PRO_OVERLAY } from "../lib/prompts.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export function generateRoleAssets({ check = false, root = packageRoot } = {}) {
  const outputs = new Map();
  for (const role of DSMM_ROLES) {
    outputs.set(`agent-presets/${role.id}/agent.cordis.yml`, renderAgentCordis(role));
    outputs.set(`agent-presets/${role.id}/preset.yml`, renderPresetMetadata(role));
  }
  outputs.set("prompts/deepwork.md", `${BASE_DEEPWORK_PROMPT}\n`);
  outputs.set("prompts/deepseek-v4-pro.md", `${DEEPSEEK_V4_PRO_OVERLAY}\n`);
  outputs.set("prompts/deepseek-flash.md", `${DEEPSEEK_FLASH_OVERLAY}\n`);
  const differences = [];
  for (const [artifact, content] of outputs) {
    const path = join(root, artifact);
    if (existsSync(path) && readFileSync(path, "utf8") === content) continue;
    differences.push(artifact);
    if (!check) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
  }
  return { outputs: outputs.size, differences };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  if (process.argv.slice(2).some((argument) => argument !== "--check")) throw new Error("usage: generate-role-assets.mjs [--check]");
  const result = generateRoleAssets({ check });
  console.log(JSON.stringify({ mode: check ? "check" : "generate", ...result }, null, 2));
  if (check && result.differences.length > 0) process.exitCode = 1;
}
