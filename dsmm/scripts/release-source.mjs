import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { validateRecoveryBinding } from "./release-recovery-policy.mjs";

export const CONTROL_FILES = Object.freeze([
  ".github/workflows/dsmm-release.yml", "dsmm/scripts/dsmm-release.mjs", "dsmm/scripts/check-dsmm-release-completion.mjs",
  "dsmm/scripts/dsmm-registry-install-probe.mjs", "dsmm/scripts/release-contract.mjs", "dsmm/scripts/release-source.mjs",
  "dsmm/scripts/native-core-smoke.mjs", "dsmm/scripts/native-picker-proof.mjs", "dsmm/scripts/extract-runtime-sdk.mjs",
]);
export const RECOVERY_CONTROL_FILES = Object.freeze([...CONTROL_FILES,
  "dsmm/scripts/release-recovery-022.mjs", "dsmm/scripts/release-recovery-policy.mjs", "dsmm/scripts/release-native-gate.mjs",
]);
export const PACK_INPUTS = Object.freeze(["dsmm", ".github/workflows/dsmm-release.yml", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json"]);
function executeGit(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, windowsHide: true });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, "pack source Git check failed");
  return result.stdout.trim();
}
export function assertPackSource(root, context, execute = executeGit, { sourceRoot } = {}) {
  const recovery = context.mode === "recovery-022";
  if (recovery) {
    validateRecoveryBinding(context);
    assert.ok(sourceRoot, "recovery requires explicit source-root");
    const controlPath = realpathSync(root), sourcePath = realpathSync(sourceRoot);
    const independent = (a, b) => { const path = relative(a, b); return isAbsolute(path) || path === ".." || path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`); };
    assert.ok(independent(controlPath, sourcePath) && independent(sourcePath, controlPath), "source/control paths must be independent");
    assert.equal(execute(root, ["rev-parse", "HEAD"]), context.controlSha, "control checkout differs");
    for (const path of RECOVERY_CONTROL_FILES) execute(root, ["cat-file", "-e", `${context.controlSha}:${path}`]);
    assert.equal(execute(root, ["status", "--porcelain", "--untracked-files=all", "--", ...RECOVERY_CONTROL_FILES]), "", "dirty control files");
    root = sourceRoot;
    const manifest = JSON.parse(execute(root, ["show", "HEAD:dsmm/package.json"]));
    assert.equal(manifest.name, context.packageName); assert.equal(manifest.version, context.version);
  } else {
    assert.equal(sourceRoot, undefined, "ordinary source/control checkout must be identical");
    assert.equal(context.mode, "future", "only tagged future source may pack");
    assert.equal(context.releaseSha, context.controlSha);
  }
  assert.match(context.releaseSha, /^[a-f0-9]{40}$/u);
  assert.match(context.tag, /^dsmm-scoped-v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u);
  assert.equal(execute(root, ["rev-parse", "HEAD"]), context.releaseSha, "pack checkout differs from released source");
  assert.equal(execute(root, ["rev-parse", "--verify", `refs/tags/${context.tag}^{commit}`]), context.releaseSha, "pack tag differs from released source");
  assert.equal(execute(root, ["status", "--porcelain", "--untracked-files=all", "--", ...PACK_INPUTS]), "",
    "packing requires clean tracked tagged DSMM source and no untracked package inputs; preserve local edits outside the release checkout");
  if (!recovery) for (const path of CONTROL_FILES) execute(root, ["cat-file", "-e", `${context.controlSha}:${path}`]);
  return { releaseSha: context.releaseSha, controlSha: context.controlSha, tag: context.tag };
}
