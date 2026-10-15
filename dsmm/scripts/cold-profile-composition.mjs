import { dirname, extname, isAbsolute, join, relative, sep } from "node:path";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { SourceReadset, jsonDocument, refuse } from "./cold-profile-sources.mjs";

export const BASE_BUNDLE = "@deepseek-ai/dsh-base";
export const MODULE_REPLACEMENTS = Object.freeze({
  "@deepseek-ai/dsh-settings": "@dsmm/dsmm/managed-settings",
  "@deepseek-ai/dsh-llm": "@dsmm/dsmm/llm-runtime",
  "@deepseek-ai/dsh-subagent": "@dsmm/dsmm/subagent-runtime",
  "@deepseek-ai/dsh-session-persistence-jsonl": "@dsmm/dsmm/session-persistence",
  "@deepseek-ai/dsh-tool-bash": "@dsmm/dsmm/permission-bash",
  "@deepseek-ai/dsh-tool-pwsh": "@dsmm/dsmm/permission-pwsh",
  "@deepseek-ai/dsh-tool-fs": "@dsmm/dsmm/permission-fs",
  "@deepseek-ai/dsh-tool-fs-search": "@dsmm/dsmm/permission-fs-search",
  "@deepseek-ai/dsh-tool-web": "@dsmm/dsmm/permission-web",
});
const nativeToolIds = new Map([
  ["@deepseek-ai/dsh-tool-fs", "tool-fs"],
  ["@deepseek-ai/dsh-tool-fs-search", "tool-fs-search"],
  ["@deepseek-ai/dsh-tool-web", "tool-web"],
]);
const projectedNativeTools = new Set([...nativeToolIds.keys()].map(name => MODULE_REPLACEMENTS[name]));
const nativeGroups = new Set(["cordis:group", "@deepseek-ai/cordis-plugin-group"]);
const nativeIncludes = new Set(["cordis:include", "@deepseek-ai/cordis-plugin-include"]);
const officialLoop = "@deepseek-ai/dsh-agent-loop";
const officialPiAi = "@deepseek-ai/dsh-llm-pi-ai";
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const under = (root, filename) => {
  const path = relative(root, filename);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
};

function entryWalk(rows, visit) {
  if (!Array.isArray(rows)) refuse("UNSUPPORTED_ENTRY_TREE");
  for (const row of rows) {
    if (!object(row) || typeof row.name !== "string") refuse("UNSUPPORTED_ENTRY_TREE");
    visit(row);
    if (nativeGroups.has(row.name)) entryWalk(row.config, visit);
    else if (row.group) refuse("UNSUPPORTED_GROUP_CARRIER");
  }
}

/** Mutates only approved, original base insertion declarations, never selector names. */
function projectBase(patches, { migrateShell, migrateSubagent, migrateSessionPersistence }) {
  patches = structuredClone(patches);
  const changed = new Map();
  for (const patch of patches) {
    if (!patch.insert) continue;
    entryWalk(patch.insert, row => {
      if (row.name === "@deepseek-ai/dsh-llm") {
        if (row.id !== "llm" || changed.has(row.id)) refuse("AMBIGUOUS_BASE_LLM");
      } else if (row.name === "@deepseek-ai/dsh-settings") {
        if (row.id !== "settings" || changed.has(row.id)) refuse("AMBIGUOUS_BASE_SETTINGS");
      } else if (row.name === "@deepseek-ai/dsh-subagent") {
        if (!migrateSubagent) return;
        if (row.id !== "subagent" || changed.has(row.id)) refuse("AMBIGUOUS_BASE_SUBAGENT");
      } else if (row.name === "@deepseek-ai/dsh-session-persistence-jsonl") {
        if (!migrateSessionPersistence) return;
        if (row.id !== "session-persistence-jsonl" || changed.has(row.id)) refuse("AMBIGUOUS_BASE_SESSION_PERSISTENCE");
      } else if (nativeToolIds.has(row.name)) {
        if (row.id !== nativeToolIds.get(row.name)) refuse("AMBIGUOUS_BASE_NATIVE_TOOL");
      } else if (!migrateShell || !["@deepseek-ai/dsh-tool-bash", "@deepseek-ai/dsh-tool-pwsh"].includes(row.name)) return;
      if (typeof row.id !== "string" || changed.has(row.id)) refuse("AMBIGUOUS_BASE_ENTRY");
      const name = MODULE_REPLACEMENTS[row.name];
      changed.set(row.id, { original: row.name, replacement: name });
      row.name = name;
    });
  }
  if (!changed.has("llm")) refuse("ORIGINAL_BASE_LLM_REQUIRED");
  if (!changed.has("settings")) refuse("ORIGINAL_BASE_SETTINGS_REQUIRED");
  if (migrateSubagent && !changed.has("subagent")) refuse("ORIGINAL_BASE_SUBAGENT_REQUIRED");
  if (migrateSessionPersistence && !changed.has("session-persistence-jsonl")) refuse("ORIGINAL_BASE_SESSION_PERSISTENCE_REQUIRED");
  return { patches, changed };
}

function compose(boot, lists) {
  const warnings = [];
  const rows = boot.composeEntries(lists, warning => warnings.push(warning));
  return { rows, warnings };
}

function expectedRows(rows, changed) {
  const expected = structuredClone(rows);
  const seen = new Set();
  entryWalk(expected, row => {
    const change = changed.get(row.id);
    if (!change) return;
    if (seen.has(row.id) || row.name !== change.original) refuse("ALTERNATE_ENTRY_OWNER");
    seen.add(row.id);
    row.name = change.replacement;
  });
  if (seen.size !== changed.size) refuse("MIGRATED_ENTRY_MISSING");
  return expected;
}

function assertSelectorSemantics(composeAll, original, projected) {
  const originalPatches = original.flat();
  const projectedPatches = projected.flat();
  // Prefix composition retains the SDK's single-pass patch index and detects
  // changed match/skip decisions even when later patches mask their final values.
  for (let count = 1; count <= originalPatches.length; count++) {
    if (composeAll([originalPatches.slice(0, count)]).warnings.length !== composeAll([projectedPatches.slice(0, count)]).warnings.length) refuse("SELECTOR_SEMANTICS_CHANGED");
  }
}

function llmRealm(row, inherited, position) {
  if (row.intercept?.llm != null) refuse("UNSUPPORTED_LLM_TOPOLOGY");
  if (!Object.hasOwn(row.isolate ?? {}, "llm")) return inherited;
  const label = row.isolate.llm;
  if (label == null || label === "") return "root";
  if (label === true) return `local:${position}`;
  if (typeof label === "string") return `named:${label}`;
  refuse("UNSUPPORTED_LLM_TOPOLOGY");
}

/** All declarations participate, including disabled/expression-gated rows; this is not activation proof. */
function assertLlmTopology(topology) {
  if (topology.owners.length !== 1) refuse("ALTERNATE_LLM_OWNER");
  if (topology.loops.length !== 1) refuse("OFFICIAL_AGENT_LOOP_REQUIRED");
  const ownerRealm = topology.owners[0];
  if ([...topology.loops, ...topology.providers, ...topology.consumers].some(realm => realm !== ownerRealm)) refuse("LLM_REALM_MISMATCH");
}

function dormantModule(row, options, readset, disabledBaseURL) {
  if (!disabledBaseURL || row.group || !object(row.disabled) || typeof row.disabled.__jsExpr !== "string") return false;
  const declarations = [
    ["dsh-tui-code-runtime", "@deepseek-ai/dsh-code-runtime-worker-thread", "@deepseek-ai/dsh-ptc-runtime-node", "code-runtime"],
    ["dsh-tui-agent-presets", "@deepseek-ai/dsh-agent-presets", "@deepseek-ai/dsh-agent-preset-registry", "agent-presets"],
  ];
  for (const [id, name, capability, official] of declarations) {
    if (row.id !== id || row.name !== name) continue;
    const expression = `(() => {
  const require = process.getBuiltinModule('node:module').createRequire(ctx.baseUrl)
  try { require.resolve('${capability}/package.json'); return true } catch {}
  return [...ctx.loader.entries()].some(entry => entry.options.id === '${official}' && entry.options.name === '${name}' && !entry.disabled)
})()`;
    if (row.disabled.__jsExpr.trim() !== expression) return false;
    return readset.dormantCapability(options, disabledBaseURL, `${capability}/package.json`);
  }
  return false;
}

/** Native groups inherit context; native includes keep their own patch index and source base. */
function inspectTrees(rows, options, sdk, readset, baseURL, {
  ancestors = new Set(), root = true, ids = new Set(), inheritedRealm = "root", prefix = "root",
  topology = { owners: [], loops: [], providers: [], consumers: [] },
  nativeToolSelection = { projected: [], unprojected: [] },
  disabledBaseURL,
} = {}) {
  if (!Array.isArray(rows)) refuse("UNSUPPORTED_ENTRY_TREE");
  for (const [index, row] of rows.entries()) {
    if (!object(row) || typeof row.name !== "string") refuse("UNSUPPORTED_ENTRY_TREE");
    const position = `${prefix}/${index}`;
    const slot = { path: position, ...(row.id ? { id: row.id } : {}), name: row.name };
    if (nativeToolIds.has(row.name)) nativeToolSelection.unprojected.push(slot);
    else if (projectedNativeTools.has(row.name)) nativeToolSelection.projected.push(slot);
    if (row.id) {
      if (ids.has(row.id)) refuse("DUPLICATE_ENTRY_ID");
      ids.add(row.id);
    }
    if ((row.name === "@deepseek-ai/dsh-llm" || row.name === MODULE_REPLACEMENTS["@deepseek-ai/dsh-llm"]) && (!root || row.id !== "llm")) refuse("ALTERNATE_LLM_OWNER");
    if ((row.id === "llm" || row.name.endsWith("/llm-runtime")) && row.name !== "@deepseek-ai/dsh-llm" && row.name !== MODULE_REPLACEMENTS["@deepseek-ai/dsh-llm"]) refuse("ALTERNATE_LLM_OWNER");
    if (typeof row.inject !== "undefined" && row.inject !== null && !Array.isArray(row.inject) && !object(row.inject)) refuse("UNSUPPORTED_SCOPE_METADATA");
    for (const key of ["isolate", "intercept"]) {
      if (row[key] !== undefined && row[key] !== null && (!object(row[key]) || row[key].__jsExpr)) refuse("UNSUPPORTED_SCOPE_METADATA");
    }
    const realm = llmRealm(row, inheritedRealm, position);
    if (row.name === "@deepseek-ai/dsh-llm" || row.name === MODULE_REPLACEMENTS["@deepseek-ai/dsh-llm"]) topology.owners.push(realm);
    if (row.id === "agent-loop" || row.name === officialLoop || /(?:^|\/)agent-loop(?:$|\/)/.test(row.name)) {
      if (row.name !== officialLoop || row.id !== "agent-loop") refuse("ALTERNATE_AGENT_LOOP");
      topology.loops.push(realm);
    }
    if (row.id === "llm-pi-ai" && row.name !== officialPiAi) refuse("ALTERNATE_PROVIDER_OWNER");
    if (row.name === officialPiAi || row.name.startsWith("@deepseek-ai/dsh-llm-deepseek-")) topology.providers.push(realm);
    if ((Array.isArray(row.inject) && row.inject.includes("llm")) || (object(row.inject) && Object.hasOwn(row.inject, "llm"))) topology.consumers.push(realm);
    if (!row.name.startsWith("cordis:") && !dormantModule(row, options, readset, disabledBaseURL)) {
      let filename;
      const local = row.name.startsWith("file:") || row.name.startsWith(".") || isAbsolute(row.name);
      if (local) {
        try { filename = isAbsolute(row.name) ? row.name : fileURLToPath(new URL(row.name, baseURL)); } catch { refuse("UNSUPPORTED_MODULE_SOURCE"); }
        if (!options.sourceRoots.some(sourceRoot => under(sourceRoot, filename))) refuse("MODULE_OUTSIDE_SOURCE_SCOPE");
        readset.module(filename);
      } else {
        const packageName = row.name.startsWith("@") ? row.name.split("/").slice(0, 2).join("/") : row.name.split("/")[0];
        const entry = sdk.resolution.entries.find(entry => entry.name === packageName);
        const require = createRequire(baseURL);
        const localDir = (require.resolve.paths(packageName) ?? [])
          .filter(searchPath => under(options.profileDir, searchPath))
          .map(searchPath => join(searchPath, packageName))
          .find(candidate => existsSync(join(candidate, "package.json")));
        const packageDir = localDir ?? entry?.packageDir;
        if (!packageDir) refuse("UNRESOLVED_ENTRY_MODULE");
        const manifest = readset.package(join(packageDir, "package.json"));
        try {
          if (Object.hasOwn(manifest, "exports")) {
            const targets = sdk.packageExports.exports(manifest, row.name, { conditions: ["node"] });
            if (!targets || targets.length !== 1 || !targets[0].startsWith("./")) refuse("UNSUPPORTED_MODULE_EXPORT");
            filename = join(packageDir, targets[0]);
          } else {
            const subpath = row.name.slice(packageName.length + 1);
            filename = createRequire(join(packageDir, "package.json")).resolve(join(packageDir, subpath || manifest.main || "index.js"));
          }
        } catch {
          refuse("UNRESOLVED_ENTRY_MODULE");
        }
        readset.module(filename, { packageSource: true });
      }
    }
    if (nativeGroups.has(row.name)) {
      inspectTrees(row.config, options, sdk, readset, baseURL, { ancestors, root, ids, inheritedRealm: realm, prefix: position, topology, nativeToolSelection });
      continue;
    }
    if (row.group) refuse("UNSUPPORTED_GROUP_CARRIER");
    if (row.name === "@deepseek-ai/dsh-agent-preset") {
      if (!object(row.config) || !Array.isArray(row.config.plugins)) refuse("UNSUPPORTED_PRESET_PLUGINS");
      inspectTrees(row.config.plugins, options, sdk, readset, baseURL, {
        ancestors, root: false, inheritedRealm: realm, prefix: `${position}/plugins`, nativeToolSelection,
      });
    }
    if (!nativeIncludes.has(row.name)) continue;
    const config = row.config;
    if (!object(config) || typeof config.path !== "string" || config.__jsExpr) refuse("UNSUPPORTED_INCLUDE");
    let filename;
    try { filename = fileURLToPath(new URL(config.path, baseURL)); } catch { refuse("UNSUPPORTED_INCLUDE"); }
    if (!options.sourceRoots.some(sourceRoot => under(sourceRoot, filename))) refuse("INCLUDE_OUTSIDE_SOURCE_SCOPE");
    if (!new Set([".json", ".yml", ".yaml"]).has(extname(filename)) || /(?:credentials|secrets|\.env)/i.test(filename)) refuse("UNSUPPORTED_INCLUDE");
    if (ancestors.has(filename)) refuse("INCLUDE_CYCLE");
    const content = readset.read(filename, { optional: true });
    const source = content === null ? config.initial : extname(filename) === ".json"
      ? jsonDocument(content).value : sdk.yaml.load(content, { schema: sdk.include.entryListSchema });
    if (!Array.isArray(source)) refuse("UNSUPPORTED_INCLUDE");
    const warnings = [];
    const children = sdk.include.applyEntryPatches(source, config.patches, (...args) => warnings.push(args));
    if (warnings.length) refuse("INCLUDE_PATCH_DIAGNOSTIC");
    const next = new Set(ancestors).add(filename);
    inspectTrees(children, options, sdk, readset, new URL(".", pathToFileURL(filename)).href, {
      ancestors: next, root: false, inheritedRealm: realm, prefix: `${position}/include`, topology,
      nativeToolSelection,
    });
  }
  return topology;
}

/** Full ordered bundle/profile/Home/explicit-launcher source validation and necessary CAS revision. */
export async function inspectColdComposition(options, sdk, { projectionName, receipt } = {}) {
  const readset = new SourceReadset();
  const manifestPath = join(options.profileDir, "package.json");
  const manifestText = readset.read(manifestPath);
  const manifest = jsonDocument(manifestText).value;
  const bundles = manifest.dsh?.profile?.bundles;
  if (!Array.isArray(bundles) || !bundles.every(name => typeof name === "string")) refuse("INVALID_BUNDLES");
  const originalName = receipt?.projectionName ?? BASE_BUNDLE;
  const slot = bundles.indexOf(originalName);
  if (slot < 0 || bundles.lastIndexOf(originalName) !== slot) refuse("EXACT_BASE_SLOT_REQUIRED");
  readset.package(options.installAnchor);
  for (const filename of sdk.modulePaths) readset.module(filename, { packageSource: true });
  readset.read(join(options.profileDir, "compatibility.json"), { optional: true });
  readset.read(join(options.profileDir, "cordis.patch.yml"), { optional: true });
  const homePatch = join(options.home, "cordis.patch.yml");
  readset.read(homePatch, { optional: true });
  for (const filename of options.overlays) readset.read(filename);
  if (options.rootConfig) readset.read(options.rootConfig);
  if (receipt) readset.read(join(options.profileDir, "node_modules", receipt.projectionName, ".dsmm-cold-profile.json"));
  const discover = sdk.boot.loadProfileDirectory("dsmm-cold-profile", options.profileDir, options.installAnchor);
  if (discover.skippedBundles.length || discover.layers.length !== bundles.length) refuse("SKIPPED_BUNDLE");
  for (const layer of discover.layers) {
    readset.package(join(layer.packageDir, "package.json"), { packageSource: layer.packageName !== originalName || !receipt });
    for (const filename of layer.patchPaths) readset.read(filename, { packageSource: layer.packageName !== originalName || !receipt });
  }
  const profile = sdk.boot.loadProfileDirectory("dsmm-cold-profile", options.profileDir, options.installAnchor);
  if (profile.skippedBundles.length || profile.layers.length !== bundles.length) refuse("SOURCE_CONFLICT");
  const lists = profile.layers.map(layer => layer.patches);
  lists.push(profile.patches, sdk.boot.loadOptionalPatches("dsmm-cold-profile", homePatch) ?? []);
  lists.push(...options.overlays.map(filename => sdk.boot.loadOverlayPatches("dsmm-cold-profile", filename)));
  // Normal profile launchers mount an empty root file. Explicit roots retain their original base.
  const rootRows = options.rootConfig
    ? sdk.yaml.load(readset.read(options.rootConfig), { schema: sdk.include.entryListSchema }) : [];
  if (!Array.isArray(rootRows)) refuse("UNSUPPORTED_ROOT_CONFIG");
  const composeAll = layers => {
    if (rootRows.length === 0) return compose(sdk.boot, layers);
    const warnings = [];
    const rows = sdk.include.applyEntryPatches(rootRows, layers.flat(), (...args) => warnings.push(args));
    return { rows, warnings };
  };
  const before = composeAll(lists);
  let projected = lists[slot];
  let changed;
  let after;
  if (receipt) {
    changed = new Map(receipt.changes.map(change => [change.id, change]));
    after = before;
    const originalLists = structuredClone(lists);
    for (const patch of originalLists[slot]) if (patch.insert) entryWalk(patch.insert, row => {
      const change = changed.get(row.id);
      if (change && row.name === change.replacement) row.name = change.original;
    });
    const original = composeAll(originalLists);
    assertSelectorSemantics(composeAll, originalLists, lists);
    if (!isDeepStrictEqual(expectedRows(original.rows, changed), after.rows) || original.warnings.length !== after.warnings.length) refuse("SELECTOR_SEMANTICS_CHANGED");
  } else {
    ({ patches: projected, changed } = projectBase(lists[slot], options));
    const projectedLists = [...lists];
    projectedLists[slot] = projected;
    after = composeAll(projectedLists);
    assertSelectorSemantics(composeAll, lists, projectedLists);
    if (!isDeepStrictEqual(expectedRows(before.rows, changed), after.rows) || before.warnings.length !== after.warnings.length) refuse("SELECTOR_SEMANTICS_CHANGED");
  }
  const rootURL = pathToFileURL(options.rootConfig ?? join(options.profileDir, "cordis.yml")).href;
  const resolution = await sdk.boot.createRuntimeResolution({ installAnchor: options.installAnchor, profile, home: options.home });
  const nativeToolSelection = { projected: [], unprojected: [] };
  // First disabled evaluation inherits loader.ctx before Entry._patchContext.
  // Nested groups/includes/presets receive no proof from their traversal base.
  assertLlmTopology(inspectTrees(after.rows, options, { ...sdk, resolution }, readset, rootURL, {
    nativeToolSelection, disabledBaseURL: pathToFileURL(dirname(fileURLToPath(rootURL))).href + "/",
  }));
  readset.assertCurrent();
  const context = { ...options, projectionName: receipt?.projectionName ?? projectionName ?? null };
  // Generated transaction identity is not part of a caller's expected source revision.
  delete context.projectionName;
  return {
    readset, revision: readset.revision(context), manifestText, manifestPath, slot,
    baseLayer: profile.layers[slot], projected, changes: [...changed].map(([id, change]) => ({ id, ...change })),
    rows: after.rows,
    nativeToolSelection: { status: nativeToolSelection.unprojected.length ? "partial" : "projected", ...nativeToolSelection },
  };
}
