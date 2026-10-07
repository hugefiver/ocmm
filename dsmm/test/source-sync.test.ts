import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { DSMM_ROLES, DSMM_ROLE_IDS } from "../lib/roles.js";
import { DSMM_SKILL_NAMES, readBundledSkill } from "../lib/skills.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const maintenance = await import(new URL("../scripts/sync-source-assets.mjs", import.meta.url).href);
const adaptation = await import(new URL("../scripts/source-adaptations.mjs", import.meta.url).href);
const checks = await import(new URL("../scripts/check-source-assets.mjs", import.meta.url).href);
const frontend = await import(new URL("../scripts/materialize-frontend.mjs", import.meta.url).href);

test("every source file's adapted result equals its artifact and native loaded body/resource", async () => {
  const expected: Map<string, Buffer> = maintenance.sourceOutputs();
  for (const [artifact, bytes] of expected) assert.deepEqual(readFileSync(join(root, artifact)), bytes, artifact);
  const manifest = JSON.parse(readFileSync(join(root, "prompts/source/manifest.json"), "utf8"));
  assert.equal(manifest.sourceBaseline, "89ca14b");
  assert.deepEqual(manifest.roles.map((row: { id: string }) => row.id), DSMM_ROLE_IDS);
  assert.equal(new Set(manifest.roles.map((row: { sourceId: string }) => row.sourceId)).size, DSMM_ROLES.length);
  assert.deepEqual(Object.keys(manifest.skills), DSMM_SKILL_NAMES);
  assert.equal(manifest.skills["remove-ai-slops"], "skills/remove-ai-slops");
  for (const name of DSMM_SKILL_NAMES) {
    const registration = await readBundledSkill(name, new AbortController().signal);
    const markdown = expected.get(`skills/${name}/SKILL.md`)!.toString("utf8");
    assert.equal(registration.content, markdown.replace(/^---\n[\s\S]*?\n---\n\n/u, ""));
    assert.equal(registration.resourceBase?.kind, "directory");
    if (registration.resourceBase?.kind !== "directory") throw new Error("missing native resourceBase");
    for (const [path, content] of expected) {
      if (!path.startsWith(`skills/${name}/`) || path.endsWith("SKILL.md")) continue;
      assert.deepEqual(readFileSync(join(registration.resourceBase.path, path.slice(`skills/${name}/`.length))), content, path);
    }
    if (name === "frontend") for (const row of manifest.files as Array<{ artifact: string; blob?: string }>) {
      if (row.blob === undefined || !row.artifact.startsWith("skills/frontend/")) continue;
      const resourceBytes: Buffer = readFileSync(join(registration.resourceBase.path, row.artifact.slice("skills/frontend/".length)));
      assert.equal(frontend.gitBlob(resourceBytes), row.blob, row.artifact);
    }
  }
});

test("sync is idempotent and check observes drift without writing; source adaptation anchor drift fails", () => {
  const temporary = mkdtempSync(join(tmpdir(), "dsmm-source-sync-"));
  writeFileSync(join(temporary, ".run-owner"), "source-sync.test.ts\n");
  try {
    maintenance.syncSourceAssets({ root: temporary });
    assert.deepEqual(maintenance.syncSourceAssets({ root: temporary }).differences, []);
    const target = join(temporary, "skills/brainstorming/SKILL.md");
    writeFileSync(target, "changed body\n");
    const before = statSync(target).mtimeMs;
    const result = maintenance.syncSourceAssets({ root: temporary, check: true });
    assert.deepEqual(result.differences, ["skills/brainstorming/SKILL.md"]);
    assert.equal(readFileSync(target, "utf8"), "changed body\n");
    assert.equal(statSync(target).mtimeMs, before);
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
