import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function runLegacyReadScenario(scenario: string): void {
  const loader = new URL("./child-admission-source-loader.mjs", import.meta.url).href;
  const fixture = fileURLToPath(new URL("./legacy-read-fixture.mjs", import.meta.url));
  const process_ = spawnSync(process.execPath, ["--import", loader, fixture, scenario], { encoding: "utf8", timeout: 30000 });
  assert.equal(process_.status, 0, process_.stderr + process_.stdout);
  const result = JSON.parse(process_.stdout.trim().split("\n").at(-1)!) as { scenario: string };
  assert.equal(result.scenario, scenario);
}
