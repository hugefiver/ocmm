import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Source-only pack authority is deliberately not published.
import { assertPackSource, CONTROL_FILES } from "../scripts/release-source.mjs";
const sha = "a".repeat(40);
const context = { mode: "future", releaseSha: sha, controlSha: sha, tag: "dsmm-scoped-v0.2.0" };
test("pack authority binds exact tracked tag/checkout/control without reading dirty roadmap bytes", () => {
  const calls: string[][] = [];
  const execute = (_root: string, args: string[]) => { calls.push(args); return args[0] === "rev-parse" ? sha : ""; };
  assert.deepEqual(assertPackSource("owned-checkout", context, execute), { releaseSha: sha, controlSha: sha, tag: context.tag });
  assert.deepEqual(calls.filter(([command]) => command === "cat-file").map((row) => row[2]), CONTROL_FILES.map((path: string) => `${sha}:${path}`));
  for (const dirty of [" M dsmm/docs/roadmap.md", "?? dsmm/extra.json", "M  dsmm/package.json", " M .github/workflows/dsmm-release.yml", " M pnpm-lock.yaml", " M package.json", " M pnpm-workspace.yaml"]) {
    assert.throws(() => assertPackSource("owned-checkout", context, (_root: string, args: string[]) => args[0] === "rev-parse" ? sha : args[0] === "status" ? dirty : ""));
  }
  assert.throws(() => assertPackSource("owned-checkout", { ...context, mode: "bootstrap" }, execute));
  assert.throws(() => assertPackSource("owned-checkout", context, () => "b".repeat(40)));
  assert.throws(() => assertPackSource("owned-checkout", context, (_root: string, args: string[]) => args[0] === "rev-parse" ? args[1] === "HEAD" ? sha : "b".repeat(40) : ""));
  assert.throws(() => assertPackSource("owned-checkout", context, (_root: string, args: string[]) => { if (args[0] === "cat-file") throw Error("missing tracked control"); return args[0] === "rev-parse" ? sha : ""; }));
});
