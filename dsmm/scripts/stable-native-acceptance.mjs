import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { STABLE_UI_CHECKS_021, isSource030, isStableNativeSource, publicRuntimeExportsForVersion, stableUiKindForVersion, startupProfileContract } from "./release-contract.mjs";

export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const STABLE_UI_CHECKS = STABLE_UI_CHECKS_021;

/** Native Renderer and UiSession supply the scope; only the acceptance shell is owned. */
export function stableCompositionBundle(compositionId, { current = false } = {}) {
  assert.ok(typeof compositionId === "string" && compositionId.length > 0);
  const currentSetup = current ? `
     const source=value=>{const listeners=new Set();return {getSnapshot:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},set:next=>{value=next;listeners.forEach(fn=>fn())}}};
     const roleArgs={role:'dsmm-builder',level:'low',description:'030 requested identity',prompt:'retain raw input'};let roleRaw=JSON.stringify(roleArgs);
     const transcript=source({phase:'preparing',name:'dsmm_role',callId:'dsmm-030-role-call',subCalls:[]});
     const assistant=source({blocks:[{kind:'tool-call',callId:'dsmm-030-role-call',argsRaw:roleRaw}]});
     const nodeLocation={kind:'step',step:{data:{source:()=>assistant}}};
     function useDisclosure(){const [expanded,setExpanded]=React.useState(false);return {expanded,setExpanded,toggle:()=>setExpanded(value=>!value)}}
     function RoleToolSurface({renderSlot,SessionProvider}){const root=React.useSyncExternalStore(transcript.subscribe,transcript.getSnapshot);return React.createElement(SessionProvider,{},renderSlot('conversation.chat.node',{node:{kind:'tool-call',key:'dsmm-030-tool-node',data:{root},location:nodeLocation},cwd:'/workspace',openFile:()=>{},loadImage:async()=>undefined,inspectCall:()=>{},useDisclosure},{entryKey:'tool-call'}))}
     window.__dsmmRoleTool={requested:roleArgs,start(){transcript.set({phase:'start',name:'dsmm_role',callId:'dsmm-030-role-call',argsRaw:roleRaw,subCalls:[]})},result(meta){transcript.set({kind:'tool-result',seq:3,time:0,callId:'dsmm-030-role-call',call:{name:'dsmm_role',argsRaw:roleRaw},callTime:0,content:[{type:'text',text:'030 complete raw output'}],isError:false,meta,subCalls:[]})}};` : "";
  const currentChildren = current ? `,'plugins.bundle.config':{kind:'keyed',scope:'root'},'conversation.chat.node':{kind:'keyed',scope:'session'}` : "";
  const currentViews = current ? `,
            renderSlot('plugins.bundle.config',{view:'page'},{entryKey:'@dsmm/dsmm'}),
            React.createElement(RoleToolSurface,{renderSlot,SessionProvider})` : "";
  return `window.__ModuleLoader__.load({id:${JSON.stringify(compositionId)},factory(require){
    const React=require('react');
    const {installConnection}=require('@deepseek-ai/dsh-client-connection/client');
    const {LocaleRuntime}=require('@deepseek-ai/dsh-client-locale/client');
    return {inject:['slots'],apply(ctx){
      installConnection(ctx,{interactions:'answer',transport:{rpc:window.__dsmmOwnedCarrier,ownsHost:true}});
     const locale=new LocaleRuntime(ctx,undefined,{languages:['en'],preference:'en'});
     ctx.provide('locale',locale);ctx.slots.installLocale(locale);
     ${currentSetup}
     document.body.style.overflow='auto';document.getElementById('root').style.height='auto';
     ctx.slots.register({name:'root',children:{'settings.section':{kind:'list',scope:'root'},'conversation.view':{kind:'list',scope:'session'}${currentChildren}}},
       ({renderSlot,SessionProvider})=>React.createElement('main',{'data-profile-ui-harness':'',style:{padding:'24px',width:'100%',minWidth:0,boxSizing:'border-box'}},
           renderSlot('settings.section',{}, {only:'dsmm-profiles'}),
           React.createElement(SessionProvider,{},renderSlot('conversation.view',{}, {only:'dsmm-children'}))${currentViews}));
      window.__dsmmUiContext=ctx;
    }};
  }});`;
}

export function stableRuntimeStartupRows(version) {
  if (isSource030(version)) return [];
  return [
    { id: "subagent", name: "@deepseek-ai/dsh-subagent", disabled: true },
    { insert: [{ id: "dsmm-subagent-runtime", name: "@dsmm/dsmm/subagent-runtime", inject: ["agents"], config: { maxDepth: 3, maxActiveSubagents: 8 } }] },
  ];
}

export function stableMainStartupRow(config, version) {
  assert.equal(config.experimentalLegacyRead, undefined, "experimental LegacyRead is programmatic-only and must remain off");
  assert.equal(config.legacyRead, undefined, "obsolete legacyRead is not a startup acceptance input");
  return { id: "dsmm", name: "@dsmm/dsmm", inject: isSource030(version) ? ["profileContext", "agents"] : ["subagents"], config };
}

/** Capture actual settled Loader and Host authority, never patch intent alone. */
export function inspectStableBootstrap(ctx, { template = "web", requireDeliveryFence = true, version } = {}) {
  const profile = ctx.get("profileContext"), entries = [...ctx.get("loader").entries()];
  const startedBundles = [...profile.startedBundles];
  assert.deepEqual(startedBundles, ["@deepseek-ai/dsh-base", template === "web" ? "@deepseek-ai/dsh-web-app" : "@deepseek-ai/dsh-headless", "@dsmm/dsmm"]);
  const stock = entries.filter((entry) => entry.options.id === "subagent");
  assert.equal(stock.length, 1); assert.equal(stock[0].options.name, "@deepseek-ai/dsh-subagent"); assert.equal(stock[0].disabled, true);
  const stockAgent = entries.filter((entry) => entry.options.id === "agent");
  if (isSource030(version)) { assert.equal(stockAgent.length, 1); assert.equal(stockAgent[0].options.name, "@deepseek-ai/dsh-agent"); assert.equal(stockAgent[0].disabled, true); }
  const registry = entries.filter((entry) => entry.options.name === "@dsmm/dsmm/agent-registry");
  const custom = entries.filter((entry) => entry.options.name === "@dsmm/dsmm/subagent-runtime");
  const main = entries.filter((entry) => entry.options.name === "@dsmm/dsmm");
  assert.equal(custom.length, 1); assert.equal(main.length, 1);
  if (isSource030(version)) assert.equal(registry.length, 1); else assert.equal(registry.length, 0);
  if (isSource030(version)) assert.equal(registry[0].fiber.state, 2);
  assert.equal(custom[0].fiber.state, 2); assert.equal(main[0].fiber.state, 2);
  assert.equal(entries.some((entry) => entry.options.name === "@dsmm/dsmm/legacy-read-host"), false);
  const runtime = ctx.get("dsmmProfileRuntime"), integration = ctx.get("dsmmRuntimeIntegration");
  const binding = runtime.getSettings.subagentRuntime();
  assert.equal(binding.binding, "dsmm");
  if (requireDeliveryFence) {
    assert.ok(integration); assert.equal(binding.deliveryFenceReady, true); assert.equal(binding.restartRequired, false);
    assert.equal(integration.legacyRead, undefined);
    assert.equal(integration.runtime.authority.view().deliveryFenceReady, true);
  } else assert.equal(integration, undefined, "cold-off Core must not install managed role integration");
  const autoRuntimeEntries = custom.filter((entry) => entry.id === "dsmm-auto-subagent-runtime").length;
  const manualRuntimeEntries = custom.filter((entry) => entry.id === "dsmm-subagent-runtime").length;
  if (isSource030(version)) { assert.equal(autoRuntimeEntries, 1); assert.equal(manualRuntimeEntries, 0); }
  const result = { startedBundles, stockSubagentDisabled: stock[0].disabled, customRuntimeEntries: custom.length, mainEntries: main.length,
    runtimeLoaded: custom[0].fiber.state === 2, mainLoaded: main[0].fiber.state === 2, ...binding,
    ...(isSource030(version) ? { legacyCompatibility: "not-composed", runtimeMode: "auto", autoRuntimeEntries, manualRuntimeEntries } : { experimentalLegacyRead: "unconfigured/unavailable" }),
    loader: [...main, ...registry, ...custom].map((entry) => ({ id: entry.id, name: entry.options.name, state: entry.fiber.state })) };
  if (isSource030(version)) Object.assign(result, {
    stockAgentDisabled: stockAgent[0].disabled,
    registryEntries: registry.length,
    registryLoaded: registry[0].fiber.state === 2,
    agentsService: ctx.get("agents")?.constructor?.name,
    subagentsService: ctx.get("subagents")?.constructor?.name,
  });
  return result;
}

export function stableNativeProofIdentity(manifest, { sourceContract = "0.2.1" } = {}) {
  assert.equal(manifest.name, "@dsmm/dsmm"); assert.equal(isStableNativeSource(manifest.version), true);
  startupProfileContract(manifest.version, { sourceContract });
  return { kind: stableUiKindForVersion(manifest.version), sourceContract: manifest.version, packageVersion: manifest.version };
}

export async function inspectStableExports(packageRoot, profilePackage, options = {}) {
  const require = createRequire(profilePackage), manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  stableNativeProofIdentity(manifest, options);
  const keys = [".", "./preset-skills", "./session-persistence", "./client", "./package.json", "./locale/en.json", "./locale/zh.json", ...Object.keys(publicRuntimeExportsForVersion(manifest.version))];
  assert.deepEqual(Object.keys(manifest.exports).sort(), keys.sort());
  const exports = [];
  for (const key of keys) {
    const specifier = key === "." ? manifest.name : `${manifest.name}${key.slice(1)}`;
    const target = require.resolve(specifier), declaration = manifest.exports[key];
    const expected = join(packageRoot, typeof declaration === "string" ? declaration : declaration.default);
    assert.equal(await realpath(target), await realpath(expected));
    assert.ok(relative(packageRoot, target) !== "" && !relative(packageRoot, target).startsWith(".."));
    const row = { specifier, resolved: target, sha256: digest(await readFile(target)) };
    if (declaration.types) { row.types = join(packageRoot, declaration.types); await readFile(row.types); }
    exports.push(row);
  }
  assert.equal(require.resolve("@dsmm/dsmm/subagent-runtime"), join(packageRoot, "lib", "runtime-integration.js"));
  if (isSource030(manifest.version)) {
    const registry = await import(pathToFileURL(require.resolve("@dsmm/dsmm/agent-registry")).href);
    assert.equal(typeof registry.default, "function"); assert.equal(registry.default.name, "DsmmAgentRegistry");
    return { exports, agentRegistryClass: true };
  }
  assert.equal(require.resolve("@dsmm/dsmm/legacy-read-host"), join(packageRoot, "lib", "legacy-read-host.js"));
  const legacy = await import(pathToFileURL(require.resolve("@dsmm/dsmm/legacy-read-host")).href);
  assert.equal(typeof legacy.createLegacyReadHost, "function"); assert.equal(legacy.default, undefined);
  return { exports, legacyReadHostLibraryFactory: true };
}

export function stableNativeStorage(nativeStorage, env) {
  assert.ok(typeof env.DSH_HOME === "string" && isAbsolute(env.DSH_HOME));
  assert.equal(nativeStorage?.root, join(env.DSH_HOME, "sessions")); assert.equal(nativeStorage.compression, "zstd");
  return { root: nativeStorage.root, compression: nativeStorage.compression };
}

export async function inspectStableProfileStorage(store, { home, hostProfileDir, entryId }) {
  assert.equal(await realpath(home), home); assert.equal(await realpath(hostProfileDir), hostProfileDir);
  assert.equal(store.origin, "central");
  const identity = process.platform === "win32" ? hostProfileDir.toLowerCase() : hostProfileDir;
  const profileDir = join(home, "plugins", "dsmm", "profiles"), stateDir = join(profileDir, ".state", digest(JSON.stringify([identity, entryId])));
  assert.equal(store.profileDir, profileDir); assert.equal(store.stateDir, stateDir);
  for (const directory of [profileDir, stateDir]) for (let current = directory; current !== home; current = dirname(current)) {
    const subpath = relative(home, current);
    assert.ok(subpath !== "" && subpath !== ".." && !subpath.startsWith(`..${sep}`) && !isAbsolute(subpath));
     // Cold reads intentionally leave unmaterialized storage absent.
     const status = await lstat(current).catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
     if (status) { assert.ok(status.isDirectory() && !status.isSymbolicLink()); assert.equal(await realpath(current), current); }
  }
  return { origin: store.origin, profileDir, stateDir, entryId, pointerPath: join(stateDir, ".selection.json") };
}

export async function removeStableUiRoot(runRoot, token) {
  const owned = await realpath(runRoot);
  assert.equal(dirname(owned), await realpath(tmpdir())); assert.match(basename(owned), /^dsmm-profile-ui-stable(?:021|030)-[A-Za-z0-9_-]+$/u);
  assert.equal(await readFile(join(owned, ".dsmm-ui-owner"), "utf8"), token);
  await rm(owned, { recursive: true, force: false });
}
