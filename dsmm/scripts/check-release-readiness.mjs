import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultPackageRoot = resolve(scriptDirectory, "..");
const repositoryLicensePath = resolve(scriptDirectory, "..", "..", "LICENSE");

const requiredExact = [
  "LICENSE", "README.md", "package.json", "cordis.patch.yml",
  "lib/index.js", "lib/index.d.ts", "lib/preset-skills.js", "lib/preset-skills.d.ts",
  "docs/agent-presets.md", "docs/compatibility.md", "docs/design.md", "docs/lsp.md",
  "docs/migration-from-ocmm.md", "docs/model-routing.md", "docs/releasing.md",
  "docs/roadmap.md", "docs/runtime-recovery.md", "docs/safety-guards.md",
  "docs/settings-status.md", "docs/skill-sync.md"
];

const requiredTrees = ["agent-presets", "docs/research", "patches", "prompts", "skills"];

const expectedFiles = [
  "lib/**/*.js",
  "lib/**/*.d.ts",
  "agent-presets",
  "docs/agent-presets.md",
  "docs/compatibility.md",
  "docs/design.md",
  "docs/lsp.md",
  "docs/migration-from-ocmm.md",
  "docs/model-routing.md",
  "docs/releasing.md",
  "docs/research",
  "docs/roadmap.md",
  "docs/runtime-recovery.md",
  "docs/safety-guards.md",
  "docs/settings-status.md",
  "docs/skill-sync.md",
  "patches",
  "prompts",
  "skills",
  "cordis.patch.yml",
  "LICENSE",
  "README.md"
];

const expectedExports = {
  ".": { types: "./lib/index.d.ts", default: "./lib/index.js" },
  "./preset-skills": { types: "./lib/preset-skills.d.ts", default: "./lib/preset-skills.js" },
  "./package.json": "./package.json"
};

const expectedDependencies = {
  "@deepseek-ai/schemastery": "^3.18.1"
};

const expectedPeers = {
  "@deepseek-ai/cordis": "^4.0.1",
  "@deepseek-ai/dsh-attachment": "^0.1.1-rc.2",
  "@deepseek-ai/dsh-brand": "^0.1.1-rc.2",
  "@deepseek-ai/dsh-invariants": "^0.1.1-rc.2",
  "@deepseek-ai/dsh-llm": "^0.1.1-rc.2",
  "@deepseek-ai/dsh-timeout": "^0.1.1-rc.2"
};

const expectedDevDependencies = {
  ...expectedPeers,
  "@types/node": "^26.0.0",
  "typescript": "^6.0.3"
};

const expectedScripts = {
  "build": "tsc -p tsconfig.json",
  "check:release": "node scripts/check-release-readiness.mjs",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "typecheck:test": "pnpm run build && tsc -p tsconfig.test.json --noEmit",
  "test": "pnpm run build && node --test --experimental-strip-types test/*.test.ts",
  "smoke:docker:build": "docker build --build-arg DSH_PACKAGE=@deepseek-ai/dsh@0.1.1-rc.2 -f docker/Dockerfile.smoke -t dsmm-dsh-smoke:0.1 ..",
  "smoke:docker:run": "docker run --rm dsmm-dsh-smoke:0.1",
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

function compiledOutputPaths(packageRoot) {
  const sourceEntries = readdirSync(resolve(packageRoot, "src"), { withFileTypes: true }).sort((left, right) => compareBytewise(left.name, right.name));
  const paths = [];
  for (const entry of sourceEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    const base = entry.name.slice(0, -3);
    paths.push(`lib/${base}.js`, `lib/${base}.d.ts`);
  }
  return paths;
}

function requiredTreeFiles(packageRoot, tree, current = resolve(packageRoot, tree)) {
  const paths = [];
  const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) => compareBytewise(left.name, right.name));
  for (const entry of entries) {
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
  return new Set([...requiredExact, ...compiledOutputPaths(packageRoot), ...requiredTrees.flatMap((tree) => requiredTreeFiles(packageRoot, tree))]);
}

function validateManifest(manifest, errors) {
  const expectedMetadata = {
    name: "dsmm",
    version: "1.0.0",
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
  if (!isDeepStrictEqual(manifest.files, expectedFiles)) errors.push("manifest.files must exactly equal the release files policy");
  if (manifest.type !== "module") errors.push("manifest.type must equal module");
  if (manifest.main !== "./lib/index.js") errors.push("manifest.main must equal ./lib/index.js");
  if (manifest.types !== "./lib/index.d.ts") errors.push("manifest.types must equal ./lib/index.d.ts");
  if (!isDeepStrictEqual(manifest.exports, expectedExports)) errors.push("manifest.exports must exactly equal the three public exports");
  if (!isDeepStrictEqual(manifest.engines, { node: ">=22" })) errors.push("manifest.engines must equal the Node 22 policy");
  if (!isDeepStrictEqual(manifest.dependencies, expectedDependencies)) errors.push("manifest.dependencies must preserve release ranges");
  if (!isDeepStrictEqual(manifest.peerDependencies, expectedPeers)) errors.push("manifest.peerDependencies must preserve release ranges");
  if (!isDeepStrictEqual(manifest.devDependencies, expectedDevDependencies)) errors.push("manifest.devDependencies must preserve release ranges");
  if (!isDeepStrictEqual(manifest.dsh, { bundle: { patch: "./cordis.patch.yml" } })) {
    errors.push("manifest.dsh.bundle.patch must equal ./cordis.patch.yml");
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

function isForbiddenPath(path) {
  const basename = path.slice(path.lastIndexOf("/") + 1);
  const segments = path.split("/");
  return segments.some((segment) => ["src", "test", "tests"].includes(segment.toLowerCase())) || /\.(?:test|spec)\.[^/]+$/u.test(path) || path.endsWith(".map") || path.endsWith(".tgz") || /^docs\/implementation-plan-[^/]+\.md$/u.test(path) || segments.some((segment) => segment.toLowerCase() === "superpowers") || basename === ".npmrc" || basename === ".env" || basename.startsWith(".env.") || basename.toLowerCase().startsWith("credentials") || basename.toLowerCase().startsWith("secrets") || /\.(?:pem|key|p12|pfx)$/iu.test(basename);
}

function validateLicense(packageRoot, paths, errors) {
  if (!paths.has("LICENSE")) {
    errors.push("package LICENSE must be byte-identical to repository LICENSE");
    return;
  }
  try {
    if (!readFileSync(resolve(packageRoot, "LICENSE")).equals(readFileSync(repositoryLicensePath))) {
      errors.push("package LICENSE must be byte-identical to repository LICENSE");
    }
  } catch {
    errors.push("package LICENSE must be byte-identical to repository LICENSE");
  }
}

function check(packageRoot) {
  const { errors: manifestErrors } = preflightManifest(packageRoot);
  if (manifestErrors.length > 0) return createReceipt({ errors: manifestErrors });

  const entry = runPack(packageRoot);
  const errors = [];
  const paths = inspectPackedFiles(entry.files, errors);
  const requiredPaths = requiredPathsFor(packageRoot);

  if (entry.name !== "dsmm") errors.push("npm pack receipt name must equal dsmm");
  if (entry.version !== "1.0.0") errors.push("npm pack receipt version must equal 1.0.0");
  validateRequiredSurface(paths, requiredPaths, errors);
  validateLicense(packageRoot, paths, errors);

  const forbiddenPaths = [...paths].filter(isForbiddenPath).sort(compareBytewise);
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
