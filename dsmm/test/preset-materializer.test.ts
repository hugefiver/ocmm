import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { apply } from "../lib/index.js";
import { DSMM_ROLES, renderAgentCordis, renderPresetMetadata } from "../lib/roles.js";
import { DEFAULT_DSMM_SETTINGS, resolveConfig } from "../lib/settings.js";
import { DSMM_MANAGED_PRESET_MARKER, materializeRolePresets, reconcileRolePresets, resolveManagedPresetRoot } from "../lib/preset-materializer.js";

test("reconcileRolePresets materializes enabled roles and skips disabled roles", () => {
  usingFixture((root) => {
    const settings = resolveConfig({ presets: { materialize: true }, roles: { "dsmm-reviewer": false } });

    reconcileRolePresets({ root, settings });

    for (const role of DSMM_ROLES) {
      const presetDirectory = join(root, role.id);

      if (role.id === "dsmm-reviewer") {
        assert.equal(existsSync(presetDirectory), false, "disabled role directory is absent");
        continue;
      }

      assert.equal(readFileSync(join(presetDirectory, "agent.cordis.yml"), "utf8"), renderAgentCordis(role));
      assert.equal(readFileSync(join(presetDirectory, "preset.yml"), "utf8"), renderPresetMetadata(role));
      assert.equal(readFileSync(join(presetDirectory, DSMM_MANAGED_PRESET_MARKER), "utf8"), "managed by dsmm\n");
    }
  });
});

test("reconcileRolePresets removes disabled role directories only when dsmm-marked", () => {
  usingFixture((root) => {
    const reviewerDirectory = join(root, "dsmm-reviewer");
    const clarifierDirectory = join(root, "dsmm-clarifier");

    reconcileRolePresets({ root, settings: resolveConfig({ presets: { materialize: true } }) });
    writeFileSync(join(clarifierDirectory, DSMM_MANAGED_PRESET_MARKER), "", "utf8");
    rmSync(join(reviewerDirectory, DSMM_MANAGED_PRESET_MARKER));

    reconcileRolePresets({
      root,
      settings: resolveConfig({
        presets: { materialize: true },
        roles: { "dsmm-clarifier": false, "dsmm-reviewer": false }
      })
    });

    assert.equal(existsSync(clarifierDirectory), false, "marked disabled role directory is removed");
    assert.equal(existsSync(reviewerDirectory), true, "unmarked disabled role directory is preserved");
  });
});

test("reconcileRolePresets with materialize false removes marked role directories only", () => {
  usingFixture((root) => {
    const foreignDirectory = join(root, "custom-preset");
    const legacyDirectory = join(root, "dsmm-legacy-role");

    reconcileRolePresets({ root, settings: resolveConfig({ presets: { materialize: true } }) });
    writeFileSync(join(root, "custom-file.txt"), "keep\n", "utf8");
    rmSync(join(root, "dsmm-planner", DSMM_MANAGED_PRESET_MARKER));
    mkdirSync(foreignDirectory, { recursive: true });
    writeFileSync(join(foreignDirectory, "preset.yml"), "id: custom-preset\n", "utf8");
    mkdirSync(legacyDirectory, { recursive: true });
    writeFileSync(join(legacyDirectory, DSMM_MANAGED_PRESET_MARKER), "managed by dsmm\n", "utf8");

    reconcileRolePresets({ root, settings: resolveConfig({ presets: { materialize: false } }) });

    assert.equal(existsSync(join(root, "dsmm-orchestrator")), false, "marked dsmm preset is removed");
    assert.equal(existsSync(join(root, "dsmm-planner")), true, "unmarked dsmm directory is preserved");
    assert.equal(existsSync(legacyDirectory), false, "legacy marked dsmm directory is removed");
    assert.equal(existsSync(foreignDirectory), true, "unmarked custom directory is preserved");
    assert.equal(existsSync(join(root, "custom-file.txt")), true, "non-directory root files are preserved");
  });
});

test("materializeRolePresets writes enabled roles even when settings materialize is false", () => {
  usingFixture((root) => {
    materializeRolePresets({ root, settings: { ...DEFAULT_DSMM_SETTINGS, presets: { materialize: false } } });

    assert.equal(existsSync(join(root, "dsmm-orchestrator", DSMM_MANAGED_PRESET_MARKER)), true);
  });
});

test("reconcileRolePresets materialize false no-ops when root is absent", () => {
  usingFixture((parent) => {
    const missingRoot = join(parent, "missing-root");

    assert.doesNotThrow(() => reconcileRolePresets({ root: missingRoot, settings: resolveConfig({ presets: { materialize: false } }) }));
    assert.equal(existsSync(missingRoot), false);
  });
});

test("apply reconciles configured preset roots without defaulting to home", () => {
  usingFixture((root) => {
    apply({}, { presets: { materialize: true, root }, roles: { "dsmm-reviewer": false } });

    assert.equal(existsSync(join(root, "dsmm-orchestrator", DSMM_MANAGED_PRESET_MARKER)), true);
    assert.equal(existsSync(join(root, "dsmm-reviewer")), false);
  });
});

test("apply skips preset reconciliation when root is absent", () => {
  assert.doesNotThrow(() => apply({}, { presets: { materialize: true } }));
});

test("resolveManagedPresetRoot falls back to DSH_HOME agent preset root", () => {
  assert.equal(
    resolveManagedPresetRoot(resolveConfig({ presets: { materialize: true } }), { DSH_HOME: "C:/tmp/dsh-home" }),
    join("C:/tmp/dsh-home", ".agent-presets")
  );
  assert.equal(resolveManagedPresetRoot(resolveConfig({ presets: { materialize: true } }), {}), undefined);
});

test("apply uses DSH_HOME fallback root when preset root is absent", () => {
  usingFixture((home) => {
    const previous = process.env.DSH_HOME;
    process.env.DSH_HOME = home;
    try {
      apply({}, { presets: { materialize: true }, roles: { "dsmm-reviewer": false } });

      assert.equal(existsSync(join(home, ".agent-presets", "dsmm-orchestrator", DSMM_MANAGED_PRESET_MARKER)), true);
      assert.equal(existsSync(join(home, ".agent-presets", "dsmm-reviewer")), false);
    } finally {
      process.env.DSH_HOME = previous;
    }
  });
});

function usingFixture(callback: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "dsmm-presets-"));
  try {
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
