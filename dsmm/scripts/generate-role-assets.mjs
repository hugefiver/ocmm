import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DSMM_ROLES, renderAgentCordis, renderPresetMetadata } from "../lib/roles.js";
import { BASE_DEEPWORK_PROMPT, DEEPSEEK_FLASH_OVERLAY, DEEPSEEK_V4_PRO_OVERLAY } from "../lib/prompts.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
for (const role of DSMM_ROLES) {
  const directory = join(root, "agent-presets", role.id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "agent.cordis.yml"), renderAgentCordis(role));
  writeFileSync(join(directory, "preset.yml"), renderPresetMetadata(role));
}
writeFileSync(join(root, "prompts", "deepwork.md"), `${BASE_DEEPWORK_PROMPT}\n`);
writeFileSync(join(root, "prompts", "deepseek-v4-pro.md"), `${DEEPSEEK_V4_PRO_OVERLAY}\n`);
writeFileSync(join(root, "prompts", "deepseek-flash.md"), `${DEEPSEEK_FLASH_OVERLAY}\n`);
