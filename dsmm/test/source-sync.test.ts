import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { DSMM_ROLES, DSMM_ROLE_IDS } from "../lib/roles.js";
import { DSMM_SKILL_NAMES, readBundledSkill } from "../lib/skills.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(root);
const maintenance = await import(new URL("../scripts/sync-source-assets.mjs", import.meta.url).href);
const adaptation = await import(new URL("../scripts/source-adaptations.mjs", import.meta.url).href);
const checks = await import(new URL("../scripts/check-source-assets.mjs", import.meta.url).href);
const inventory = await import(new URL("../scripts/source-inventory.mjs", import.meta.url).href);

function sourceFixture() {
  const directory = mkdtempSync(join(tmpdir(), "dsmm-root-source-"));
  for (const path of inventory.SOURCE_INPUT_FILES as string[]) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    cpSync(join(repositoryRoot, path), join(directory, path));
  }
  for (const source of Object.values(inventory.SKILL_SOURCES) as string[]) {
    mkdirSync(dirname(join(directory, source)), { recursive: true });
    cpSync(join(repositoryRoot, source), join(directory, source), { recursive: true });
  }
  return directory;
}

test("native skills expose their bundled bodies and resource directories", async () => {
  const expected: Map<string, Buffer> = maintenance.sourceOutputs();
  const manifest = JSON.parse(readFileSync(join(root, "prompts/source/manifest.json"), "utf8"));
  assert.deepEqual(manifest.roles.map((row: { id: string }) => row.id), DSMM_ROLE_IDS);
  assert.equal(new Set(manifest.roles.map((row: { sourceId: string }) => row.sourceId)).size, DSMM_ROLES.length);
  assert.deepEqual(Object.keys(manifest.skills), DSMM_SKILL_NAMES);
  assert.equal(manifest.skills["remove-ai-slops"], "skills/remove-ai-slops");
  for (const name of DSMM_SKILL_NAMES) {
    const registration = await readBundledSkill(name, new AbortController().signal);
    assert.ok(registration.content.trim().length > 0);
    assert.equal(registration.resourceBase?.kind, "directory");
    if (registration.resourceBase?.kind !== "directory") throw new Error("missing native resourceBase");
    for (const path of expected.keys()) {
      if (!path.startsWith(`skills/${name}/`) || path.endsWith("SKILL.md")) continue;
      assert.ok(existsSync(join(registration.resourceBase.path, path.slice(`skills/${name}/`.length))), path);
    }
  }
});

test("sync is idempotent and check reports missing resources without writing", () => {
  const temporary = mkdtempSync(join(tmpdir(), "dsmm-source-sync-"));
  writeFileSync(join(temporary, ".run-owner"), "source-sync.test.ts\n");
  try {
    maintenance.syncSourceAssets({ root: temporary });
    assert.deepEqual(maintenance.syncSourceAssets({ root: temporary }).differences, []);
    const target = join(temporary, "skills/brainstorming/SKILL.md");
    rmSync(target);
    const result = maintenance.syncSourceAssets({ root: temporary, check: true });
    assert.deepEqual(result.differences, ["skills/brainstorming/SKILL.md"]);
    assert.equal(existsSync(target), false);
    maintenance.syncSourceAssets({ root: temporary });
    const extra = "skills/debugging/references/scripts/injected.mjs";
    writeFileSync(join(temporary, extra), "export default 1;\n");
    assert.ok(maintenance.syncSourceAssets({ root: temporary, check: true }).differences.includes(extra));
    assert.throws(() => maintenance.syncSourceAssets({ root: temporary }), /unexpected prepared source resources/u);
    assert.equal(readFileSync(join(temporary, extra), "utf8"), "export default 1;\n");
    assert.throws(() => adaptation.adaptPrompt("prompts/v1/agents/orchestrator.md", "missing source anchor"), /anchor drift/u);
  } finally {
    assert.equal(readFileSync(join(temporary, ".run-owner"), "utf8"), "source-sync.test.ts\n");
    rmSync(temporary, { recursive: true });
  }
});

test("package-independent resource layout preserves meaningful fixtures and refuses incomplete frontend", () => {
  const temporary = mkdtempSync(join(tmpdir(), "dsmm-source-layout-"));
  writeFileSync(join(temporary, ".run-owner"), "source-layout.test.ts\n");
  try {
    mkdirSync(join(temporary, "skills"));
    cpSync(join(root, "skills"), join(temporary, "skills"), { recursive: true });
    assert.equal(existsSync(join(temporary, "skills/debugging/references/scripts/fixture-adapter.mjs")), true);
    assert.equal(existsSync(join(temporary, "skills/coding-agent-sessions/scripts/agent_sessions/cli.py")), true);
    const missing: string[] = checks.missingFrontendResources(temporary);
    assert.deepEqual(missing, checks.missingFrontendResources(root), "distribution layout retains the same complete-or-missing observation");
    rmSync(join(temporary, "skills/frontend/references/design/react-dev-tooling-skill.md"));
    assert.ok(checks.missingFrontendResources(temporary).includes("references/design/react-dev-tooling-skill.md"));
    const reference = "skills/debugging/references/tools/dap.md";
    rmSync(join(temporary, reference));
    const problems: Array<{ file: string; reference?: string; reason: string }> = checks.skillResourceProblems(temporary);
    assert.ok(problems.some((problem) => problem.reference === "references/tools/dap.md" && problem.reason === "missing resource"));
  } finally {
    assert.equal(readFileSync(join(temporary, ".run-owner"), "utf8"), "source-layout.test.ts\n");
    rmSync(temporary, { recursive: true });
  }
});

test("sync reads declared repository-root inputs and rejects unsafe or incomplete resources", () => {
  const sourceRoot = sourceFixture();
  try {
    const skill = "skills/v1/brainstorming/SKILL.md";
    const original = readFileSync(join(sourceRoot, skill), "utf8");
    const description = "A direct repository source metadata change.";
    writeFileSync(join(sourceRoot, skill), original.replace(/^description:.*$/mu, `description: ${JSON.stringify(description)}`));
    const outputs: Map<string, Buffer> = maintenance.sourceOutputs({ sourceRoot });
    assert.ok(outputs.get("src/skills.ts")!.toString("utf8").includes(JSON.stringify(description)));
    assert.ok(outputs.get("skills/brainstorming/SKILL.md")!.toString("utf8").includes(description));

    const policy = "src/hooks/config.ts", policyBytes = readFileSync(join(sourceRoot, policy));
    writeFileSync(join(sourceRoot, policy), policyBytes.toString("utf8").replace("The role prompt above is authoritative for this agent's scope, permissions, and output contract.", "Removed authority boundary."));
    assert.throws(() => maintenance.sourceOutputs({ sourceRoot }), /source anchor drift/u);
    writeFileSync(join(sourceRoot, policy), policyBytes);

    rmSync(join(sourceRoot, "skills/debugging/references/tools/dap.md"));
    assert.throws(() => maintenance.sourceOutputs({ sourceRoot }), /source resource closure drift/u);
    cpSync(join(repositoryRoot, "skills/debugging/references/tools/dap.md"), join(sourceRoot, "skills/debugging/references/tools/dap.md"));

    const frontendIndex = "skills/frontend/references/design/_INDEX.md";
    const indexBytes = readFileSync(join(sourceRoot, frontendIndex));
    const changedIndex = indexBytes.toString("utf8").replace("### Mood-based shortcuts", "| `source-only-brand.md` | Required input brand |\n\n### Mood-based shortcuts");
    assert.notEqual(changedIndex, indexBytes.toString("utf8"));
    writeFileSync(join(sourceRoot, frontendIndex), changedIndex);
    assert.throws(() => maintenance.sourceOutputs({ sourceRoot }), /missing frontend resource: references\/design\/source-only-brand\.md/u);
    writeFileSync(join(sourceRoot, frontendIndex), indexBytes);

    const intent = join(sourceRoot, "src/intent");
    rmSync(intent, { recursive: true });
    symlinkSync(join(repositoryRoot, "src/intent"), intent, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => maintenance.sourceOutputs({ sourceRoot }), /linked or non-regular source input/u);
  } finally {
    rmSync(sourceRoot, { recursive: true });
  }
});
