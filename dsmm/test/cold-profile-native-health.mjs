import assert from "node:assert/strict";
import { createRequire, registerHooks } from "node:module";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { inspect } from "node:util";
import { installColdProfileNetworkGuard } from "./cold-profile-network-guard.mjs";

const [anchor, profileDir] = process.argv.slice(2);
const guard = installColdProfileNetworkGuard({ blockSubprocesses: true });
const native = createRequire(anchor);
const load = name => import(pathToFileURL(native.resolve(name)).href);
const legacy = ["@deepseek-ai/dsh-code-runtime-worker-thread", "@deepseek-ai/dsh-agent-presets"];
const legacyImportAttempts = [];
registerHooks({ resolve(specifier, context, next) {
  if (legacy.includes(specifier)) legacyImportAttempts.push(specifier);
  return next(specifier, context);
} });
const boot = await load("@deepseek-ai/dsh-app-boot");
const { runProfile } = await load("@deepseek-ai/dsh/profile-boot");
const profile = boot.loadProfileDirectory("dsmm-genuine-health", profileDir, anchor);
assert.deepEqual(profile.skippedBundles, []);
const before = boot.composeEntries([...profile.layers.map(layer => layer.patches), profile.patches]);
const compatibility = before.filter(row => legacy.includes(row.name));
assert.equal(compatibility.length, 2);
const safetyOverlays = [{ id: "dsh-tui", disabled: true }, { id: "session-telemetry-otel", disabled: true }];
const overlayPath = join(profileDir, "genuine-health-overlay.yml");
await writeFile(overlayPath, JSON.stringify(safetyOverlays));
let app;
let report;
try {
  app = await runProfile({
    environment: boot.loadLayeredEnv("dsmm-genuine-health"), profile: "dsh-tui", resolvedProfile: { profile, installAnchor: anchor },
    patchFiles: [overlayPath], args: [],
  });
  const entries = [...app.ctx.loader.entries()];
  const enabledUnhealthy = entries.filter(row => !row.disabled && row.options.name && (!row.fiber || row.fiber.state !== 2)).map(row => ({ id: row.options.id, name: row.options.name, state: row.fiber?.state }));
  assert.deepEqual(enabledUnhealthy, [], "The public native Loader must activate every enabled entry");
  const requiredServices = ["llm", "agents", "subagents", "settings", "agentPresets", "webServer"];
  for (const name of requiredServices) assert.ok(app.ctx.get(name), `Native service ${name} must be present after migration`);
  for (const [id, name] of [["llm", "llm-runtime"], ["settings", "managed-settings"], ["subagent", "subagent-runtime"], ["session-persistence-jsonl", "session-persistence"]]) {
    const entry = entries.find(row => row.options.id === id);
    assert.equal(entry?.options.name, `@dsmm/dsmm/${name}`);
    assert.equal(entry.disabled, false);
    assert.equal(entry.fiber?.state, 2, `Migrated native entry ${id} must be active`);
  }
  const dormant = entries.filter(row => legacy.includes(row.options.name)).map(row => {
    assert.equal(row.disabled, true);
    assert.equal(row.fiber, undefined);
    assert.deepEqual(row.options.disabled, compatibility.find(original => original.id === row.options.id).disabled);
    return { id: row.options.id, name: row.options.name, disabled: row.disabled, fiber: null };
  });
  assert.equal(dormant.length, 2);
  assert.deepEqual(legacyImportAttempts, []);
  report = { enabledUnhealthy, requiredServices, dormant, legacyImportAttempts, safetyOverlays };
} catch (error) {
  if (error.startup?.messages) process.stderr.write(inspect(error.startup.messages, { depth: 8, colors: false, maxArrayLength: 50 }) + "\n");
  throw error;
} finally { await app?.shutdown.shutdown(0); }
assert.deepEqual(guard.attempts, []);
process.stdout.write(JSON.stringify({ ...report, networkAttempts: guard.attempts }));
