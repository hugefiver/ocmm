import assert from "node:assert/strict";
import { createRequire, findPackageJSON } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { cp, mkdtemp, mkdir, writeFile, readFile, symlink, realpath, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { modelRouteToCall } from "../src/role-llm.ts";
import { planColdProfileMigration, applyColdProfileMigration } from "../scripts/migrate-cold-profile.mjs";

const native = createRequire(process.env.DSMM_TEST_DSH_ENTRY);
export const loadNative = name => import(pathToFileURL(native.resolve(name)).href);

/** All services and admissions are production modules; only the remote HTTP peer is local. */
export async function nativeRootLlmFixture(t, config = {}, controls = {}) {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const parent = await realpath(join(tmpdir(), "opencode"));
  const root = await mkdtemp(join(parent, "dsmm-native-root-"));
  const home = join(root, "home"), workspace = join(root, "workspace"), agentsHome = join(root, "agents");
  await Promise.all([home, workspace, agentsHome].map(path => mkdir(path)));
  if (controls.globalConfig) {
    const directory = join(home, "plugins", "dsmm");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "config.json"), JSON.stringify(controls.globalConfig));
  }
  await writeFile(join(workspace, "AGENTS.md"), "Answer in the language of the question. Workspace instruction: preserve-native-instructions.");
  const prior = Object.fromEntries(["DSH_HOME", "DSH_AGENTS_HOME", "DSH_TELEMETRY_DISABLED"].map(key => [key, process.env[key]]));
  process.env.DSH_HOME = home; process.env.DSH_AGENTS_HOME = agentsHome; process.env.DSH_TELEMETRY_DISABLED = "1";
  const bodies = [], errors = [], requests = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString()); bodies.push({ body, headers: req.headers, url: req.url });
    await controls.beforeRespond?.();
    if (controls.respond) return controls.respond(body, res);
    res.writeHead(200, { "content-type": "text/event-stream" });
    const base = { id: "native-root-response", object: "chat.completion.chunk", created: 1, model: body.model };
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "native root completed" }, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let ctx;
  t.after(async () => {
    await controls.cleanup?.(); await ctx?.fiber.dispose();
    await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    assert.equal(dirname(await realpath(root)), parent); await rm(root, { recursive: true });
  });
  const bootApi = await loadNative("@deepseek-ai/dsh-app-boot");
  const { prepareProfile, PROFILE_ROOT_FILENAME } = await loadNative("@deepseek-ai/dsh/profile-boot");
  const { createLaunchEnvironmentSnapshot } = await loadNative("@deepseek-ai/dsh-launch-environment");
  const { credentialRef } = await loadNative("@deepseek-ai/dsh-credentials");
  const { Config: providerConfig } = await loadNative("@deepseek-ai/dsh-llm-pi-ai");
  const { createUserMessage } = await loadNative("@deepseek-ai/dsh-llm");
  const profileDir = bootApi.resolveProfileDir("native-root", home);
  const packageDir = join(profileDir, "node_modules", "@dsmm", "dsmm");
  await mkdir(packageDir, { recursive: true });
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const sourceTarget = target => target.startsWith("./lib/") ? target.replace("./lib/", "./src/").replace(/\.js$/u, ".ts") : target;
  const exports = controls.compiled ? manifest.exports : Object.fromEntries(Object.entries(manifest.exports).map(([name, target]) => [name, typeof target === "string" ? sourceTarget(target) : { ...target, default: sourceTarget(target.default) }]));
  await writeFile(join(packageDir, "package.json"), JSON.stringify({ ...manifest, main: controls.compiled ? manifest.main : "./src/index.ts", exports }));
  for (const name of ["locale", "prompts", "skills", "agent-presets"]) await symlink(fileURLToPath(new URL(`../${name}/`, import.meta.url)), join(packageDir, name), "junction");
  if (controls.compiled) {
    await cp(fileURLToPath(new URL("../lib/", import.meta.url)), join(packageDir, "lib"), { recursive: true });
    const anchors = [process.env.DSMM_TEST_DSH_ENTRY, ...["@deepseek-ai/dsh-base/package.json", "@deepseek-ai/dsh-sdk-minimal/package.json", "@deepseek-ai/dsh-llm-pi-ai/package.json"].map(name => native.resolve(name))];
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
      let packageRoot;
      for (const anchor of anchors) {
        try {
          const metadata = findPackageJSON(name, pathToFileURL(anchor));
          if (metadata !== undefined) { packageRoot = dirname(metadata); break; }
        }
        catch (error) {
          if (error.code !== "MODULE_NOT_FOUND" && error.code !== "ERR_MODULE_NOT_FOUND") throw error;
        }
      }
      if (packageRoot === undefined) {
        assert.equal(Object.hasOwn(manifest.peerDependencies, name), false, `The native runtime must supply peer ${name}`);
        packageRoot = dirname(findPackageJSON(name, import.meta.url));
      }
      const target = join(packageDir, "node_modules", name);
      await mkdir(dirname(target), { recursive: true }); await symlink(packageRoot, target, "junction");
    }
  } else await symlink(fileURLToPath(new URL("../src/", import.meta.url)), join(packageDir, "src"), "junction");
  await writeFile(join(packageDir, "cordis.patch.yml"), await readFile(new URL("../cordis.patch.yml", import.meta.url)));
  if (controls.deferredCredentials) {
    await writeFile(join(profileDir, "credential-fixture.mjs"), `import { CredentialProvider } from ${JSON.stringify(pathToFileURL(native.resolve("@deepseek-ai/dsh-credentials")).href)};
export default class FixtureCredentials extends CredentialProvider {
  constructor(ctx) {
    super(ctx); this.values = new Map(); this.pending = undefined;
    ctx.provide('fixtureCredentialControl', { pauseNext: () => {
      const entered = Promise.withResolvers(), gate = Promise.withResolvers();
      this.pending = { entered, gate }; return { entered: entered.promise, release: () => gate.resolve() };
    } });
  }
  async resolve(ref) { const pending = this.pending; this.pending = undefined;
    if (pending) { pending.entered.resolve(); await pending.gate.promise; }
    const value = this.values.get(ref); return value === undefined ? undefined : { value, source: 'fictional' }; }
  async set(ref, value) { this.values.set(ref, value); this.notifyUpdated(ref); }
  async unset(ref) { this.values.delete(ref); this.notifyUpdated(ref); }
  async describe(ref) { return { configured: this.values.has(ref), writable: true, source: 'fictional' }; }
  async readRecord() { return undefined; }
  async describeRecord() { return { configured: false, writable: true }; }
  async listRecords() { return []; }
  async modifyRecord() { throw new Error('No credential records in this fixture'); }
  async deleteRecord() {}
}`);
  }
  if (controls.cli) await writeFile(join(profileDir, "route-input.mjs"), `export const inject = ['dsmmCoreLlmOwner'];
export function apply(ctx) { ctx.on('agent/request', async (_frame, next) => ({ ...await next(), customParameters: ${JSON.stringify(controls.cli)} })); }
`);
  await writeFile(join(profileDir, "package.json"), JSON.stringify({ private: true, type: "module", dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", ...controls.cli ? ["@deepseek-ai/dsh-headless"] : [], "@dsmm/dsmm"] } } }));
  const provider = { api: "openai-completions", baseURL: `http://127.0.0.1:${server.address().port}/v1`, apiKeyEnv: "DSMM_ROOT_FICTIONAL",
    models: [{ id: "root-model" }, { id: "fallback-model" }], compat: { maxTokensField: "max_tokens" }, retryPolicy: { mode: "normal", maxRetries: 0 } };
  await writeFile(join(profileDir, "cordis.patch.yml"), JSON.stringify([
    ...controls.lateSpawn ? [{ id: "subagent-spawn-in-process", disabled: true }] : [],
    ...controls.deferredCredentials ? [{ id: "credentials", disabled: true }, { insert: [{ id: "fixture-credentials", name: "./credential-fixture.mjs" }] }] : [],
    ...controls.cli ? [{ insert: [{ id: "request-input", name: "./route-input.mjs" }] }] : [],
    { insert: [{ id: "agent-presets", name: "@deepseek-ai/dsh-agent-preset-registry", config: { default: "dsmm-orchestrator" } }] },
    { id: "hmr", disabled: true },
    { id: "session-title-llm", disabled: true },
    ...controls.llmRealm ? ["llm", "agent-loop", "llm-pi-ai", "llm-deepseek", "llm-deepseek-account", "compaction-basic", "command-compact", "session-checkpoint-policy", "dsmm"].map(id => ({ id, isolate: { llm: controls.llmRealm } })) : [],
    ...controls.approvalPolicy ? [{ id: "approval", config: { policy: controls.approvalPolicy } },
      { id: "permission", config: { presets: { fixture: { sandbox: "workspace-write", approval: controls.approvalPolicy } }, defaultPreset: "fixture" } }] : [],
    ...controls.loopConfig ? [{ id: "agent-loop", config: { ...controls.loopConfig,
      agents: (controls.loopConfig.agents ?? []).map(agent => ({ cwd: workspace, ...agent })) } }] : [],
    { id: "llm-pi-ai", config: { providers: { local: provider } } },
    { id: "agent-default-model", config: { provider: "local", model: "root-model" } },
    { id: "dsmm", inject: ["subagents"], config: { presets: { root: join(root, "presets") }, lsp: { enabled: false }, defaultActive: true, ...config } },
  ]));
  const migration = { target: controls.target ?? "dsh-tui", profileDir, home, installAnchor: process.env.DSMM_TEST_DSH_ENTRY, migrateShell: controls.migrateShell ?? false, migrateSubagent: !controls.nativeSubagent, migrateSessionPersistence: true };
  const planned = await planColdProfileMigration(migration);
  await applyColdProfileMigration({ ...migration, expectedRevision: planned.revision, sourceWriteExclusion: true });
  if (controls.cli) return { root, home, profileDir, workspace, bodies, errors, provider };
  const profile = prepareProfile("native-root");
  const resolution = await bootApi.createRuntimeResolution({ installAnchor: process.env.DSMM_TEST_DSH_ENTRY, profile });
  const profileContext = { name: "native-root", dir: profile.dir, patchPath: profile.patchPath, installAnchor: process.env.DSMM_TEST_DSH_ENTRY, startedBundles: profile.layers.map(layer => layer.packageName), cwd: workspace, home, overlays: [], telemetryDisabledEnv: "1" };
  ctx = await bootApi.boot("dsmm-native-root", join(profile.dir, PROFILE_ROOT_FILENAME), bootApi.readProfilePatches("dsmm-native-root", profileContext, profile), async host => {
    host.provide("profileContext", profileContext);
    if (controls.configuredIdentities) host.provide("configuredAgentIdentities", controls.configuredIdentities);
    host.provide("launchEnvironment", createLaunchEnvironmentSnapshot([{ source: "process", values: { DSH_HOME: home, DSH_AGENTS_HOME: agentsHome } }]));
    host.on("agent/error", ({ error }) => errors.push(error));
    host.on("llm/stream", (request, next) => { requests.push(request); return next(); }, { global: true });
    await host.plugin(bootApi.PluginPackages, { resolution });
  });
  assert.ok(ctx.get("dsmmCoreLlmOwner"), "ordinary main module must publish real Core admission");
  await ctx.credentials.set(credentialRef("DSMM_ROOT_FICTIONAL"), "fictional-loopback-key");
  let sequence = 0;
  const handles = [];
  return { ctx, root, home, profileDir, workspace, bodies, errors, requests, provider,
    async spawn() {
      const entry = [...ctx.loader.entries()].find(row => row.options.name === "@deepseek-ai/dsh-subagent-spawn-in-process");
      assert.ok(entry); await entry.update({ disabled: false }); await ctx.loader.await();
      await ctx.get("dsmmRuntimeIntegration").ready();
    },
    async create(preset, route) {
      const handle = await ctx.agents.create({ sessionId: `native-root-${++sequence}`, meta: { cwd: workspace, ...(preset ? { agentPreset: preset } : {}) }, agentOptions: { provider: "local", model: "root-model" },
        setup: async scope => {
          if (preset) await ctx.get("agentPresets").mount(scope, preset);
          // The public request waterfall is the native input seam for full routes.
          if (route) scope.on("agent/request", async (_frame, next) => ({ ...await next(), ...modelRouteToCall(route) }));
        } });
      handles.push(handle); t.after(() => handle.dispose()); return handle.agent;
    },
    async run(agent, text = "Answer the native Root request") { agent.followup(createUserMessage({ content: [{ type: "text", text }], source: { kind: "user" } })); await agent.whenIdle(); },
    async setProvider(patch) {
      const entry = [...ctx.loader.entries()].find(row => row.options.id === "llm-pi-ai");
      const current = entry.options.config.providers.local;
      const config = { providers: { local: { ...current, ...patch } } };
      const expected = providerConfig(config).providers.get().local;
      await entry.update({ config }); await ctx.loader.await();
      for (const key of Object.keys(patch)) assert.deepEqual(entry.fiber.config.providers.get().local[key], expected[key], `live provider field ${key}`);
    },
  };
}
