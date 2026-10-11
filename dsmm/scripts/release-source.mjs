import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

export const CONTROL_FILES = Object.freeze([
  ".github/workflows/dsmm-release.yml", "dsmm/scripts/dsmm-release.mjs", "dsmm/scripts/check-dsmm-release-completion.mjs",
  "dsmm/scripts/dsmm-registry-install-probe.mjs", "dsmm/scripts/release-contract.mjs", "dsmm/scripts/release-source.mjs",
  "dsmm/scripts/native-core-smoke.mjs", "dsmm/scripts/native-picker-proof.mjs", "dsmm/scripts/extract-runtime-sdk.mjs",
]);
export const PACK_INPUTS = Object.freeze(["dsmm", ".github/workflows/dsmm-release.yml", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json"]);
function executeGit(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, windowsHide: true });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, "pack source Git check failed");
  return result.stdout.trim();
}
export function assertPackSource(root, context, execute = executeGit) {
  assert.equal(context.mode, "future", "only tagged future source may pack");
  assert.match(context.releaseSha, /^[a-f0-9]{40}$/u); assert.equal(context.releaseSha, context.controlSha);
  assert.match(context.tag, /^dsmm-scoped-v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u);
  assert.equal(execute(root, ["rev-parse", "HEAD"]), context.releaseSha, "pack checkout differs from released source");
  assert.equal(execute(root, ["rev-parse", "--verify", `refs/tags/${context.tag}^{commit}`]), context.releaseSha, "pack tag differs from released source");
  assert.equal(execute(root, ["status", "--porcelain", "--untracked-files=all", "--", ...PACK_INPUTS]), "",
    "packing requires clean tracked tagged DSMM source and no untracked package inputs; preserve local edits outside the release checkout");
  for (const path of CONTROL_FILES) execute(root, ["cat-file", "-e", `${context.controlSha}:${path}`]);
  return { releaseSha: context.releaseSha, controlSha: context.controlSha, tag: context.tag };
}
