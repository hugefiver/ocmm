import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { checkFrontendAssets } from "./materialize-frontend.mjs";
import { dshPolicyForVersion, OFFICIAL_RUNTIME_PACKAGES_031, validatePublicExports031 } from "./release-contract.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultPackageRoot = resolve(scriptDirectory, "..");
const RELEASE_VERSION = "0.3.1";
const DSH_POLICY = dshPolicyForVersion(RELEASE_VERSION);
const operatorScripts = [];
const retiredCompatibilityFiles = new Set(["legacy-read-host", "legacy-read-contracts", "legacy-read-composition", "legacy-read-integration", "legacy-read-proxy", "legacy-child-policy"]
  .flatMap((name) => [`lib/${name}.js`, `lib/${name}.d.ts`]));
const metadataResources = ["locale/en.json", "locale/zh.json"];

const requiredExact = [
  "LICENSE", "README.md", "package.json", "cordis.patch.yml",
  ...operatorScripts,
  ...metadataResources,
  "lib/index.js", "lib/index.d.ts",
  "lib/client.js", "lib/client/index.d.ts",
  "docs/releasing.md"
];

const requiredTrees = ["agent-presets", "patches", "prompts", "skills"];

const requiredFileSelectors = [
  "lib/**/*.js",
  "lib/**/*.d.ts",
  "locale/*.json",
  "agent-presets",
  "patches",
  "prompts",
  "skills",
  "cordis.patch.yml",
  "LICENSE",
  "README.md"
];

const expectedDependencies = {
  "@deepseek-ai/dsh-web-fetch-http": "0.2.1-rc.2",
  "@deepseek-ai/schemastery": "~3.18.5",
  "ipaddr.js": "^2.5.0",
  "jsonc-parser": "^3.3.1"
};

const expectedPeers = {
  "@earendil-works/pi-ai": "^1.1.0",
  "@deepseek-ai/cordis": "~4.0.5",
  "@deepseek-ai/dsh-typert-protocol": "0.2.0-rc.2",
  "@deepseek-ai/dsh-client-connection": "0.2.0-rc.2",
  "@deepseek-ai/dsh-attachment": "0.2.0-rc.2",
  "@deepseek-ai/dsh-brand": "0.2.0-rc.2",
  "@deepseek-ai/dsh-jobs": "0.2.0-rc.2",
  "@deepseek-ai/dsh-llm": "0.2.0-rc.2",
  "@deepseek-ai/dsh-llm-pi-ai": "0.2.0-rc.2",
  "@deepseek-ai/dsh-agent-loop": "0.2.0-rc.2",
  "@deepseek-ai/dsh-settings": "0.2.0-rc.2",
  "@deepseek-ai/dsh-timeout": "0.2.0-rc.2",
  "@deepseek-ai/dsh-session": "0.2.0-rc.2",
  "@deepseek-ai/dsh-session-persistence": "0.2.0-rc.2",
  "@deepseek-ai/dsh-session-persistence-jsonl": "0.2.0-rc.2",
  "@deepseek-ai/dsh-agent-preset-registry": "0.2.0-rc.2",
  "@deepseek-ai/dsh-tools": "0.2.0-rc.2",
  "@deepseek-ai/dsh-plan-mode": "0.2.0-rc.2",
  "@deepseek-ai/dsh-compaction-basic": "0.2.0-rc.2",
  "@deepseek-ai/dsh-command-compact": "0.2.0-rc.2",
  "@deepseek-ai/dsh-compaction-tool-result-pruner": "0.2.0-rc.2",
  "@deepseek-ai/dsh-tool-ask-user": "0.2.0-rc.2",
  "@deepseek-ai/dsh-tool-todo": "0.2.0-rc.2",
  "@deepseek-ai/dsh-tool-subagent": "0.2.0-rc.2",
  "@deepseek-ai/dsh-subagent": "0.2.0-rc.2",
  "@deepseek-ai/dsh-tool-fs": "0.2.0-rc.2",
  "@deepseek-ai/dsh-tool-fs-search": "0.2.0-rc.2",
  "@deepseek-ai/dsh-tool-web": "0.2.0-rc.2",
  "@deepseek-ai/dsh-tool-bash": "0.2.0-rc.2",
  "@deepseek-ai/dsh-tool-pwsh": "0.2.0-rc.2",
  "@deepseek-ai/dsh-tool-jobs": "0.2.0-rc.2",
  "@deepseek-ai/dsh-skill-filesystem": "0.2.0-rc.2",
  "@deepseek-ai/dsh-tool-skill": "0.2.0-rc.2",
  "@deepseek-ai/dsh-persona": "0.2.0-rc.2",
  "@deepseek-ai/dsh-agent-instructions": "0.2.0-rc.2"
};
expectedPeers[OFFICIAL_RUNTIME_PACKAGES_031.registry] = DSH_POLICY.peerVersion;
expectedPeers["@deepseek-ai/dsh-http-proxy"] = DSH_POLICY.peerVersion;
expectedPeers["@deepseek-ai/dsh-web"] = DSH_POLICY.peerVersion;
expectedPeers["@deepseek-ai/dsh-jobs"] = DSH_POLICY.peerVersion;
delete expectedPeers["@deepseek-ai/dsh-invariants"];
for (const name of Object.keys(expectedPeers)) if (name.startsWith("@deepseek-ai/dsh-")) expectedPeers[name] = DSH_POLICY.peerVersion;

const expectedScripts = {
  "build": "node scripts/materialize-frontend.mjs --check && tsc -p tsconfig.json && node scripts/build-client.mjs",
  "build:client": "node scripts/build-client.mjs",
  "check:release": "node scripts/check-release-readiness.mjs",
  "sync:source": "node --experimental-strip-types scripts/sync-source-assets.mjs",
  "generate:roles": "node scripts/generate-role-assets.mjs",
  "check:source": "node --experimental-strip-types scripts/check-source-assets.mjs",
  "sync:frontend": "node scripts/materialize-frontend.mjs --sync",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "typecheck:test": "pnpm run build && tsc -p tsconfig.test.json --noEmit",
  "test": "pnpm run build && node --test --experimental-strip-types --import ./test/prompt-source-loader.mjs --test-concurrency=1 test/*.test.ts",
  "smoke:docker:build": `docker build --build-arg DSH_PACKAGE=@deepseek-ai/dsh@${DSH_POLICY.runtimeVersion} -f docker/Dockerfile.smoke -t dsmm-dsh-smoke:0.2 ..`,
  "smoke:docker:run": "docker run --rm dsmm-dsh-smoke:0.2",
  "smoke:docker": "node scripts/docker-smoke.mjs"
};

class CliError extends Error {}

function compareBytewise(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function sortedErrors(errors) {
  return [...new Set(errors)].sort(compareBytewise);
}

function createReceipt({ name = null, version = null, fileCount = 0, packedSize = 0, unpackedSize = 0, requiredSurfaceCount = 0, forbiddenSurfaceCount = 0, outcome = "failed", errors = [] } = {}) {
  return {
    name,
    version,
    fileCount,
    packedSize,
    unpackedSize,
    requiredSurfaceCount,
    forbiddenSurfaceCount,
    outcome,
    errors: sortedErrors(errors)
  };
}

function failReceipt(error) {
  return createReceipt({ errors: [error] });
}

function parseArguments(args) {
  if (args.length === 0) return defaultPackageRoot;
  if (args.length !== 2 || args[0] !== "--package-root" || args[1].length === 0 || args[1].startsWith("-")) {
    throw new CliError("invalid command-line arguments");
  }
  return resolve(args[1]);
}

function npmEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key, value]) => value !== undefined && !/(?:token|credential|password|secret|_auth)/iu.test(key))
  );
}

// npm's dry-run is a metadata-only size/inventory diagnostic. Actual release
// packing and publication use pnpm; this preview is not frozen-artifact proof.
function runPack(packageRoot) {
  const isWindows = process.platform === "win32";
  if (isWindows && /[&|<>^%!\r\n]/u.test(packageRoot)) {
    throw new Error("package root cannot be safely passed to npm");
  }
  const command = isWindows ? process.env.ComSpec ?? "cmd.exe" : "npm";
  const args = isWindows
    ? ["/d", "/s", "/c", "npm.cmd pack %DSMM_RELEASE_PACKAGE_ROOT% --dry-run --json --ignore-scripts"]
    : ["pack", packageRoot, "--dry-run", "--json", "--ignore-scripts"];
  const environment = npmEnvironment();
  if (isWindows) environment.DSMM_RELEASE_PACKAGE_ROOT = `"${packageRoot}"`;
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: environment,
    shell: false,
    windowsHide: true
  });

  if (result.error !== undefined || result.status !== 0) {
    throw new Error("npm pack could not complete");
  }

  let output;
  try {
    output = JSON.parse(result.stdout);
  } catch {
    throw new Error("npm pack returned invalid JSON");
  }

  if (!Array.isArray(output) || output.length !== 1 || output[0] === null || typeof output[0] !== "object") {
    throw new Error("npm pack returned an invalid receipt");
  }

  const entry = output[0];
  if (typeof entry.name !== "string" || typeof entry.version !== "string" || !Number.isFinite(entry.size) || entry.size < 0 || !Number.isFinite(entry.unpackedSize) || entry.unpackedSize < 0 || !Array.isArray(entry.files)) {
    throw new Error("npm pack returned an invalid receipt");
  }

  return entry;
}

function normalizePackedPath(path) {
  return path.replaceAll("\\", "/").replace(/^(?:\.\/)+/u, "");
}

function inspectPackedFiles(files, errors) {
  const paths = new Set();
  for (const file of files) {
    if (file === null || typeof file !== "object" || typeof file.path !== "string" || !Number.isFinite(file.size) || file.size < 0) {
      errors.push("npm pack receipt contains an invalid file entry");
      continue;
    }

    const path = normalizePackedPath(file.path);
    if (path.length === 0) {
      errors.push("npm pack receipt contains an invalid file entry");
    } else if (paths.has(path)) {
      errors.push(`duplicate packed path: ${path}`);
    } else {
      paths.add(path);
    }
  }
  return paths;
}

function requiredTreeFiles(packageRoot, tree, current = resolve(packageRoot, tree)) {
  const paths = [];
  const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) => compareBytewise(left.name, right.name));
  for (const entry of entries) {
    if ([".gitignore", ".npmignore"].includes(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;
    const entryPath = resolve(current, entry.name);
    if (entry.isFile()) {
      paths.push(normalizePackedPath(relative(packageRoot, entryPath)));
    } else if (entry.isDirectory()) {
      paths.push(...requiredTreeFiles(packageRoot, tree, entryPath));
    }
  }
  return paths;
}

function requiredPathsFor(packageRoot) {
  return new Set([...requiredExact, ...requiredTrees.flatMap((tree) => requiredTreeFiles(packageRoot, tree))]);
}

function validateFilesPolicy(files, errors) {
  if (!Array.isArray(files) || files.some((entry) => typeof entry !== "string") || new Set(files).size !== files.length) {
    errors.push("manifest.files must be a unique string list");
    return;
  }
  for (const required of requiredFileSelectors) if (!files.includes(required)) errors.push(`manifest.files must include ${required}`);
  for (const entry of files) {
    const allowed = requiredFileSelectors.includes(entry) || [...retiredCompatibilityFiles].some((path) => entry === `!${path}`)
      || /^docs\/[a-z0-9-]+\.md$/u.test(entry);
    if (!allowed) errors.push(`manifest.files contains an unsupported selector: ${entry}`);
  }
}

function validateManifest(manifest, errors) {
  const expectedMetadata = {
    name: "@dsmm/dsmm",
    version: RELEASE_VERSION,
    author: "Hugefiver",
    license: "LicenseRef-AAAPL",
    repository: "https://github.com/hugefiver/ocmm",
    homepage: "https://github.com/hugefiver/ocmm/tree/master/dsmm",
    bugs: "https://github.com/hugefiver/ocmm/issues"
  };
  for (const [field, expected] of Object.entries(expectedMetadata)) {
    if (manifest[field] !== expected) errors.push(`manifest.${field} must equal ${expected}`);
  }
  if (Object.hasOwn(manifest, "private")) errors.push("manifest.private must be absent");
  if (!isDeepStrictEqual(manifest.keywords, ["deepseek-harness", "dsh", "dsh-plugin", "deepwork", "agentic-workflows", "cordis"])) {
    errors.push("manifest.keywords must equal the release keyword policy");
  }
  if (!isDeepStrictEqual(manifest.publishConfig, { registry: "https://registry.npmjs.org/", access: "public" })) {
    errors.push("manifest.publishConfig must equal the public npm policy");
  }
  validateFilesPolicy(manifest.files, errors);
  if (manifest.type !== "module") errors.push("manifest.type must equal module");
  if (manifest.main !== "./lib/index.js") errors.push("manifest.main must equal ./lib/index.js");
  if (manifest.types !== "./lib/index.d.ts") errors.push("manifest.types must equal ./lib/index.d.ts");
  try { validatePublicExports031(manifest.exports); }
  catch { errors.push("manifest.exports must contain only resolvable 0.3.1 public entries and resources"); }
  if (!isDeepStrictEqual(manifest.engines, DSH_POLICY.engines)) errors.push("manifest.engines must equal the release runtime policy");
  if (!isDeepStrictEqual(manifest.dependencies, expectedDependencies)) errors.push("manifest.dependencies must preserve release ranges");
  if (!isDeepStrictEqual(manifest.peerDependencies, expectedPeers)) errors.push("manifest.peerDependencies must preserve release ranges");
  for (const [name, version] of Object.entries(manifest.devDependencies ?? {})) {
    if (name.startsWith("@deepseek-ai/dsh-") && version !== DSH_POLICY.sdkVersion) errors.push(`manifest.devDependencies must target the release SDK: ${name}`);
  }
  for (const name of Object.values(OFFICIAL_RUNTIME_PACKAGES_031)) {
    if (manifest.peerDependencies?.[name] !== DSH_POLICY.peerVersion || manifest.devDependencies?.[name] !== DSH_POLICY.sdkVersion) {
      errors.push(`manifest must use the official 0.3.1 runtime package: ${name}`);
    }
  }
  if (!isDeepStrictEqual(manifest.dsh, { client: { platform: "web", inject: ["@deepseek-ai/dsh-api-gateway", "@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-renderer"], external: [] }, bundle: { patch: "./cordis.patch.yml" } })) {
    errors.push("manifest.dsh must equal the native web client and bundle policy");
  }
  if (!isDeepStrictEqual(manifest.scripts, expectedScripts)) {
    errors.push("manifest.scripts must exactly equal the release script policy");
  }
}

function preflightManifest(packageRoot) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
  } catch {
    return { errors: ["manifest must be readable JSON"] };
  }
  if (manifest === null || Array.isArray(manifest) || typeof manifest !== "object") {
    return { errors: ["manifest must be an object"] };
  }

  const errors = [];
  validateManifest(manifest, errors);
  return { errors };
}

function validateRequiredSurface(paths, requiredPaths, errors) {
  for (const requiredPath of requiredPaths) {
    if (requiredPath !== "LICENSE" && !paths.has(requiredPath)) {
      errors.push(`missing required package surface: ${requiredPath}`);
    }
  }
}

function validatePackedModuleClosure(packageRoot, paths, errors) {
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'()]*?\s+from\s*)?["'](\.[^"']+)["']/gu,
    /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/gu
  ];
  for (const path of paths) {
    if (!/^lib\/.*\.(?:js|d\.ts)$/u.test(path)) continue;
    const source = readFileSync(resolve(packageRoot, path), "utf8");
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1].replace(/[?#].*$/u, "");
        const resolved = normalizePackedPath(relative(packageRoot, resolve(packageRoot, dirname(path), specifier)));
        const target = path.endsWith(".d.ts") && resolved.endsWith(".js") ? `${resolved.slice(0, -3)}.d.ts` : resolved;
        if (!paths.has(target)) errors.push(`packed module closure missing target: ${path} -> ${target}`);
      }
    }
  }
}

function isForbiddenPath(path, sourceResources) {
  const basename = path.slice(path.lastIndexOf("/") + 1);
  const segments = path.split("/");
  const skillResource = sourceResources.has(path);
  const forbiddenScript = segments.some((segment) => segment.toLowerCase() === "scripts")
    && !operatorScripts.includes(path) && !skillResource;
  const forbiddenMetadataResource = /^locale\//iu.test(path) && !metadataResources.includes(path);
  return retiredCompatibilityFiles.has(path)
    || segments.some((segment) => ["src", "build", "tmp", "temp", "test-home", "test-homes", "node_modules", "__pycache__"].includes(segment.toLowerCase()))
    || (!skillResource && (segments.some((segment) => ["test", "tests"].includes(segment.toLowerCase())) || /\.(?:test|spec)\.[^/]+$/u.test(path)))
    || forbiddenScript || forbiddenMetadataResource || path.endsWith(".map") || path.endsWith(".tgz") || path.endsWith(".pyc") || /^docs\/implementation-plan-[^/]+\.md$/u.test(path) || segments.some((segment) => segment.toLowerCase() === "superpowers") || basename === ".npmrc" || basename === ".env" || basename.startsWith(".env.") || basename.toLowerCase().startsWith("credentials") || basename.toLowerCase().startsWith("secrets") || /\.(?:pem|key|p12|pfx)$/iu.test(basename);
}

function validatePluginMetadata(packageRoot, paths, errors) {
  for (const resource of metadataResources) {
    if (!paths.has(resource)) continue;
    try {
      const value = JSON.parse(readFileSync(resolve(packageRoot, resource), "utf8"));
      if (value === null || Array.isArray(value) || typeof value !== "object"
        || !isDeepStrictEqual(Object.keys(value), ["meta"])
        || value.meta === null || Array.isArray(value.meta) || typeof value.meta !== "object"
        || !isDeepStrictEqual(Object.keys(value.meta).sort(compareBytewise), ["description", "title"])
        || value.meta.title !== "DSMM" || typeof value.meta.description !== "string" || value.meta.description.trim().length === 0) {
        throw new Error("invalid plugin metadata");
      }
    } catch {
      errors.push(`plugin metadata resource must contain exactly DSMM title and nonempty description: ${resource}`);
    }
  }
}

function validateNativeClient(packageRoot, paths, errors) {
  if (!paths.has("lib/client.js")) return;
  const source = readFileSync(resolve(packageRoot, "lib/client.js"), "utf8");
  if (/(?:["']node:|require\(["'](?:fs|path|os|crypto|child_process|worker_threads|net|http|https|process|module)(?:\/|["']))/u.test(source)
    || /(?:[A-Za-z]:[\\/](?:Users|home)[\\/]|\/Users\/|\/home\/|react-grab|react-scan|react-doctor|localhost:\d+|127\.0\.0\.1:\d+)/iu.test(source)) {
    errors.push("native client bundle must not contain Node, user-path, or development-tool leakage");
  }
  try {
    const registrations = [];
    const sandbox = { window: { __ModuleLoader__: { load: (registration) => { registrations.push(registration); } } } };
    runInNewContext(source, sandbox, { timeout: 1000 });
    if (registrations.length !== 1 || registrations[0]?.id !== "@dsmm/dsmm" || typeof registrations[0]?.factory !== "function") {
      throw new Error("invalid registration");
    }
    const allowedImports = new Set(["react", "react/jsx-runtime", "@deepseek-ai/dsh-client-connection", "@deepseek-ai/dsh-client-ui-slots", "@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-primitives", "@deepseek-ai/dsh-client-ui-settings", "@deepseek-ai/dsh-typert-protocol", "@deepseek-ai/dsh-api-session-controller", "@deepseek-ai/dsh-client-ui-session", "@deepseek-ai/dsh-client-ui-conversation"]);
    sandbox.registration = registrations[0];
    sandbox.require = (id) => { if (!allowedImports.has(id)) throw new Error("unsupported client import"); return {}; };
    runInNewContext("clientExports = registration.factory(require)", sandbox, { timeout: 1000 });
    const client = sandbox.clientExports;
    if (typeof client?.apply !== "function" || !Array.isArray(client?.inject)
      || !isDeepStrictEqual(Array.from(client.inject), ["slots", "locale", "remote"])
       || typeof client.ProfilesController !== "function" || typeof client.ProfilesSection !== "function"
       || typeof client.ChildrenController !== "function" || typeof client.ChildrenPanel !== "function"
       || client.ROLE_CONTROL_REMOTE?.package !== "@dsmm/dsmm-children"
       || !Array.isArray(client.ROLE_CONTROL_REMOTE?.descriptors)
       || !isDeepStrictEqual(Array.from(client.ROLE_CONTROL_REMOTE.descriptors, (descriptor) => descriptor.id),
          ["describe", "descendants", "prompt", "interrupt"].map((method) => `@dsmm/dsmm-children#dsmmChildren/${method}`))
      || client.TYPERT_REMOTE?.package !== "@dsmm/dsmm"
      || !Array.isArray(client.TYPERT_REMOTE?.descriptors)
      || !isDeepStrictEqual(Array.from(client.TYPERT_REMOTE.descriptors, (descriptor) => descriptor.id), [
        "@dsmm/dsmm#dsmmConfig/describe", "@dsmm/dsmm#dsmmConfig/save", "@dsmm/dsmm#dsmmConfig/describeModules", "@dsmm/dsmm#dsmmConfig/describeSettings",
        ...["selectMode", "describe", "read", "save", "select", "describeSession", "selectSession"].map((method) => `@dsmm/dsmm#dsmmProfiles/${method}`)
      ])) {
      throw new Error("invalid exports");
    }
  } catch {
    errors.push("native client bundle must lazily register @dsmm/dsmm with apply and inject exports");
  }
}

function validateProfileDeploymentBoundary(packageRoot, errors) {
  const patch = readFileSync(resolve(packageRoot, "cordis.patch.yml"), "utf8");
  if (/^\s*(?:profiles|runtimeProfiles|selectedProfile|profileDefinitions):/mu.test(patch)) {
    errors.push("cordis.patch.yml must not embed runtime profile definitions or selection");
  }
}

function validateLicense(paths, errors) {
  if (!paths.has("LICENSE")) {
    errors.push("package LICENSE is missing");
  }
}

function check(packageRoot) {
  const { errors: manifestErrors } = preflightManifest(packageRoot);
  if (manifestErrors.length > 0) return createReceipt({ errors: manifestErrors });
  const frontend = checkFrontendAssets(packageRoot);
  if (frontend.outcome !== "ready") return createReceipt({ errors: frontend.errors });

  const entry = runPack(packageRoot);
  const errors = [];
  const paths = inspectPackedFiles(entry.files, errors);
  const requiredPaths = requiredPathsFor(packageRoot);

  if (entry.name !== "@dsmm/dsmm") errors.push("npm pack receipt name must equal @dsmm/dsmm");
  if (entry.version !== RELEASE_VERSION) errors.push(`npm pack receipt version must equal ${RELEASE_VERSION}`);
  validateRequiredSurface(paths, requiredPaths, errors);
  try { validatePublicExports031(JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")).exports, (path) => paths.has(path)); }
  catch { errors.push("packed public entry or resource is not resolvable"); }
  validatePackedModuleClosure(packageRoot, paths, errors);
  validateLicense(paths, errors);
  validatePluginMetadata(packageRoot, paths, errors);
  validateNativeClient(packageRoot, paths, errors);
  validateProfileDeploymentBoundary(packageRoot, errors);

  const sourceManifestPath = resolve(packageRoot, "prompts/source/manifest.json");
  const sourceResources = new Set(JSON.parse(readFileSync(sourceManifestPath, "utf8")).files
    .map((row) => row.artifact).filter((path) => /^skills\/[a-z0-9-]+\//u.test(path)));
  const forbiddenPaths = [...paths].filter((path) => isForbiddenPath(path, sourceResources)).sort(compareBytewise);
  for (const path of forbiddenPaths) errors.push(`forbidden package surface: ${path}`);

  const sorted = sortedErrors(errors);
  return createReceipt({
    name: entry.name,
    version: entry.version,
    fileCount: entry.files.length,
    packedSize: entry.size,
    unpackedSize: entry.unpackedSize,
    requiredSurfaceCount: requiredPaths.size,
    forbiddenSurfaceCount: forbiddenPaths.length,
    outcome: sorted.length === 0 ? "ready" : "failed",
    errors: sorted
  });
}

let receipt;
try {
  receipt = check(parseArguments(process.argv.slice(2)));
} catch (error) {
  receipt = error instanceof CliError ? failReceipt("invalid command-line arguments") : failReceipt("release readiness check could not complete");
}

process.stdout.write(`${JSON.stringify(receipt)}\n`);
if (receipt.outcome !== "ready") process.exitCode = 1;
