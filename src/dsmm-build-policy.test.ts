import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("fresh pnpm 11 installs approve only the two pinned required dependency builds", () => {
  const workspace = readFileSync(new URL("../pnpm-workspace.yaml", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  assert.match(workspace, /^strictDepBuilds: true$/mu);
  assert.match(workspace, /\nallowBuilds:\n  esbuild@0\.25\.12: true\n  koffi@3\.1\.1: true\n$/u);
  assert.doesNotMatch(workspace, /(?:dangerouslyAllowAllBuilds|onlyBuiltDependencies|ignoredBuiltDependencies|neverBuiltDependencies|ignoreDepScripts):/u);
});

test("DSMM source verification retains frozen installation rather than suppressing dependency build failures", () => {
  const workflow = readFileSync(new URL("../.github/workflows/dsmm-release.yml", import.meta.url), "utf8");
  const sourceStep = workflow.split("- name: Verify future source with pnpm")[1]?.split("- name:")[0];
  assert.ok(sourceStep);
  assert.match(sourceStep, /pnpm install --frozen-lockfile/u);
  assert.doesNotMatch(sourceStep, /(?:--ignore-scripts|strict[-_]?[Dd]ep[-_]?[Bb]uilds=false|dangerouslyAllowAllBuilds|\|\|\s*true)/u);
});
