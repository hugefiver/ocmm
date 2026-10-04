import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Keep DAP and its referenced runtime/methodology guides in sync with ocmm.
// The DSMM entry SKILL.md is intentionally DSH-native and maintained separately.
const dsmmRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dsmmRoot);
cpSync(join(repoRoot, "skills", "debugging", "references"), join(dsmmRoot, "skills", "debugging", "references"), {
  recursive: true,
  filter(path) { return !["dap.test.mjs", "fixture-adapter.mjs"].includes(basename(path)); }
});

const investigation = join(dsmmRoot, "skills", "debugging", "references", "methodology", "02-investigate.md");
const investigationSource = readFileSync(investigation, "utf8");
const phaseStart = investigationSource.indexOf("## Phase 3 — Parallel Investigation");
const evidenceStart = investigationSource.indexOf("## Evidence capture discipline", phaseStart);
if (phaseStart < 0 || evidenceStart < 0) throw new Error("debugging investigation reference changed; update the DSH-native adaptation");
writeFileSync(investigation, `${investigationSource.slice(0, phaseStart)}## Phase 3 — Investigate Distinct Evidence\n\nUse available DSH role-specific tools only when parallel evidence collection is genuinely independent and within current permission and depth limits. Otherwise investigate sequentially. Assign one hypothesis and its falsifying observation per investigation. Never assume OpenCode team APIs or an automatically writable agent.\n\n${investigationSource.slice(evidenceStart)}`);

const flaky = join(dsmmRoot, "skills", "debugging", "references", "methodology", "03-flaky-triage.md");
writeFileSync(flaky, readFileSync(flaky, "utf8").replace("Temp\\opencode", "Temp\\dsmm-debug"));
