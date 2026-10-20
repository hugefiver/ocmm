import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";
import { BASE_ROLES, CATEGORIES, DSH_TOOL_CONTRACT, EXCLUSIONS, SKILL_SOURCES, SOURCE_INPUT_FILES, WORKFLOW_VARIANTS, excludedSourceResource } from "./source-inventory.mjs";
import { ADAPTATION_RULES, adaptLocale, adaptPrompt, adaptSkill, adaptTerminal, section } from "./source-adaptations.mjs";
import { FRONTEND_PINS, frontendAttribution, frontendRecipe } from "./frontend-recipe.mjs";
import { checkFrontendAssets } from "./materialize-frontend.mjs";
import { skillResourceProblems } from "./source-input-resources.mjs";

const dsmmRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dsmmRoot);
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function regularSourcePath(root, path, directory = false) {
  const base = resolve(root), target = resolve(base, path);
  if (target !== base && !target.startsWith(`${base}${sep}`)) throw new Error(`source input escapes repository root: ${path}`);
  for (let current = target; ; current = dirname(current)) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !(current === target && !directory ? stat.isFile() : stat.isDirectory())) throw new Error(`linked or non-regular source input: ${path}`);
    if (current === base) break;
  }
  return target;
}

function loadRepositoryInputs(root) {
  const files = new Map(SOURCE_INPUT_FILES.map((path) => [path, readFileSync(regularSourcePath(root, path))]));
  for (const source of Object.values(SKILL_SOURCES)) {
    const directory = regularSourcePath(root, source, true);
    const resources = (current, prefix = "") => readdirSync(current).sort().flatMap((name) => {
      const path = `${prefix}${name}`;
      if (excludedSourceResource(source, path)) return [];
      const target = join(current, name), stat = lstatSync(target);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error(`linked or non-regular source input: ${source}/${path}`);
      return stat.isDirectory() ? resources(target, `${path}/`) : [`${source}/${path}`];
    });
    for (const path of resources(directory)) files.set(path, readFileSync(join(root, path)));
  }
  return files;
}

export function sourceOutputs({ packageRoot = dsmmRoot, sourceRoot = repositoryRoot } = {}) {
  const inputs = loadRepositoryInputs(sourceRoot);
  const consumed = new Set();
  const readInput = (path) => {
    const bytes = inputs.get(path);
    if (bytes === undefined) throw new Error(`missing source input: ${path}`);
    consumed.add(path);
    return bytes;
  };
  const readSource = (path) => readInput(path).toString("utf8").replaceAll("\r\n", "\n");
  const catalog = (path, name) => {
    const exports = {};
    const compiled = transpileModule(readSource(path), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
    runInNewContext(compiled, { exports }, { timeout: 1000 });
    if (!Array.isArray(exports[name])) throw new Error(`source catalog anchor drift: ${path}: ${name}`);
    return exports[name];
  };
  const BUILTIN_AGENTS = catalog("src/data/agents.ts", "BUILTIN_AGENTS");
  const BUILTIN_CATEGORIES = catalog("src/data/categories.ts", "BUILTIN_CATEGORIES");
  if (json(BUILTIN_AGENTS.map((role) => role.name)) !== json(BASE_ROLES) || json(BUILTIN_CATEGORIES.map((role) => role.name)) !== json(CATEGORIES)) throw new Error("source catalog anchor drift: review canonical inventory before syncing");
  const outputs = new Map(), trace = [], anchors = [];
  const add = (artifact, content, source, consumer, rules = []) => {
    if (outputs.has(artifact)) throw new Error(`duplicate source artifact: ${artifact}`);
    outputs.set(artifact, typeof content === "string" ? Buffer.from(content) : content);
    trace.push({ source, artifact, consumer, rules, test: artifact.startsWith("skills/") ? "test/skills.test.ts; test/source-sync.test.ts; test/native-runtime-contract.test.ts" : "test/prompts.test.ts; test/roles.test.ts; test/source-sync.test.ts" });
  };
  const requireAnchor = (source, anchor) => {
    if (!readSource(source).includes(anchor)) throw new Error(`source anchor drift: ${source}: ${anchor}`);
    anchors.push({ source, anchor });
  };
  requireAnchor("src/hooks/config.ts", 'const LOCAL_COORDINATORS = ["deep", "complex", "cross-cutting"] as const');
  requireAnchor("src/hooks/config.ts", "The role prompt above is authoritative for this agent's scope, permissions, and output contract.");
  requireAnchor("src/hooks/config.ts", "The category role prompt above is authoritative for this agent's scope, permissions, and output contract.");
  requireAnchor("src/intent/prompt-loader.ts", 'if (isPlannerAgent(opts.agentName)) return "planner"');
  requireAnchor("src/intent/prompt-loader.ts", 'if (family === "gpt" || family === "codex") return ["gpt"]');
  requireAnchor("src/intent/model-family.ts", 'name === "kimi-for-coding-highspeed"');
  for (const variant of WORKFLOW_VARIANTS) {
    const source = `prompts/v1/deepwork/${variant}.md`;
    add(`prompts/source/deepwork/${variant}.md`, adaptPrompt(source, readSource(source)), source, "src/prompts.ts: buildDeepworkPrompt", ["native-skill-load", "native-dispatch", "source-role-authority", "dsh-common-scope", "native-lifecycle"]);
  }
  for (const role of ["orchestrator", "reviewer", "planner", "clarifier", "plan-critic"]) {
    const source = `prompts/v1/agents/${role}.md`;
    add(`prompts/source/agents/${role}.md`, adaptPrompt(source, readSource(source)), source, "src/roles.ts: DSMM_ROLES.persona", ["source-role-authority", "native-dispatch", "native-profile-selection", "native-lifecycle"]);
  }
  for (const category of CATEGORIES) {
    const source = `prompts/v1/category/${category}.md`;
    add(`prompts/source/category/${category}.md`, adaptPrompt(source, readSource(source)), source, "src/roles.ts: persona; src/prompts.ts: category calibration", ["source-role-authority"]);
  }
  add("prompts/source/shared/shell-safety.md", readSource("prompts/shared/shell-safety.md"), "prompts/shared/shell-safety.md", "src/prompts.ts: common; source terminal role policies");
  add("prompts/source/shared/dsh-host-contract.md", `${DSH_TOOL_CONTRACT}\n`, "scripts/source-inventory.mjs: DSH_TOOL_CONTRACT", "src/roles.ts: persona; src/prompts.ts: common", ["native-dispatch", "authorization", "resource-base"]);

  // Evaluate only trusted, pure source policy functions at maintenance time.
  // No root OCMM import or compiler is needed by a distributed runtime.
  const configSource = readSource("src/hooks/config.ts");
  const localeSource = [
    section(configSource, "const LOCALE_GUIDANCE_TAG", "function fmtModel", "src/hooks/config.ts"),
    section(configSource, "function buildLocaleGuidance", "function prependPromptPrefix", "src/hooks/config.ts")
  ].join("\n");
  const locale = adaptLocale(runInNewContext(`${transpileModule(localeSource, {}).outputText}\nbuildLocaleGuidance(undefined)`));
  add("prompts/source/shared/locale.md", `${locale}\n`, "src/hooks/config.ts: buildLocaleGuidance(default)", "src/prompt-content.ts: all role/category persona prefix; src/prompts.ts: exact Agent captured locale", ["source-role-authority", "native-locale"]);
  const policySource = [
    section(configSource, "const PRIMARY_COORDINATORS", "function taskAllowlist", "src/hooks/config.ts"),
    section(configSource, "const DELEGATION_CONTRACT_TAG", "function appendPromptSuffix", "src/hooks/config.ts"),
    section(configSource, "const UTILITY_LEAF_AGENT_SET", "function mergePermission", "src/hooks/config.ts")
  ].join("\n");
  const policies = runInNewContext(`${transpileModule(policySource, {}).outputText}\nterminalPromptSuffixFor`, {
    getShellSafetyPrompt: () => readSource("prompts/shared/shell-safety.md"),
    isReviewAgentName: (name) => /^(?:reviewer|oracle)(?:-|$)/u.test(name),
    parsePlanningAgentName: (name) => name === "planner" || name === "plan-critic" ? { role: name } : null
  });
  const utility = ["quick", "code-search", "doc-search", "research", "media-reader"];
  const readOnlyUtility = utility.filter((name) => name !== "quick");
  const specialists = ["coding", "frontend", "hard-reasoning", "creative", "documenting"];
  const oldOrder = ["orchestrator", "planner", "plan-critic", "builder", "reviewer", "oracle", "oracle-2nd", "creative", "code-search", "doc-search", "clarifier", "media-reader"];
  const ordered = [...oldOrder, ...CATEGORIES.filter((name) => !oldOrder.includes(name))];
  const rows = ordered.map((name, index) => {
    const source = BUILTIN_AGENTS.find((role) => role.name === name) ?? BUILTIN_CATEGORIES.find((role) => role.name === name);
    const kind = BASE_ROLES.includes(name) ? "role" : "category";
    const primary = name === "orchestrator" || name === "builder";
    const mode = primary ? "primary" : name === "planner" ? "all" : "subagent";
    const readOnly = ["planner", "plan-critic", "reviewer", "oracle", "oracle-2nd", "clarifier", "code-search", "doc-search", "media-reader"].includes(name);
    const group = primary ? "primary-coordinator" : utility.includes(name) ? "utility-leaf" : readOnly ? "read-only-workflow" : ["deep", "complex", "cross-cutting"].includes(name) ? "local-coordinator" : "standard-workflow";
    const allowedChildren = group === "primary-coordinator" ? ordered.filter((target) => target !== "orchestrator") : group === "utility-leaf" ? [] : group === "read-only-workflow" ? readOnlyUtility : group === "local-coordinator" ? [...utility, ...specialists] : utility;
    let terminal = adaptTerminal(`src/hooks/config.ts: terminalPromptSuffixFor(${name})`, policies({ name, includeCompressionPolicy: !primary, includeReviewSessionEfficiency: name === "orchestrator" }), { reviewSession: name === "orchestrator" });
    if (primary) terminal += `\n\n<dsmm-delegation-contract>\nA trusted root/stage-owner ${name} coordinates authorized work and owns formal planning, criticism, review dispatch and final acceptance. Root Builder is not a bounded worker. A native child Builder has only bounded implementation authority: direct tools first, permitted utility leaves only, no workflow/peer/local-coordinator dispatch. Do not self-promote from a persona or root preset name. Missing/conflicting trusted identity fails closed. Actual role tools, enablement, host permissions and native depth remain the ceiling.\n</dsmm-delegation-contract>`;
    else terminal += "\n\nThe source delegation allowance is conditional on actual native callability and the caller's inherited authority; formal workflow stages belong to the trusted root/stage owner. No static text grants a tool or overrides an execution restriction.\n";
    const terminalArtifact = `prompts/source/terminal/${name}.md`;
    add(terminalArtifact, `${terminal.trim()}\n`, "src/hooks/config.ts: terminalPromptSuffixFor/delegationContractFor; scripts/sync-source-assets.mjs: DSH identity adaptation", "src/roles.ts: persona", ["source-role-authority", "native-dispatch", "native-lifecycle"]);
    const promptSource = kind === "category" ? `prompts/v1/category/${name}.md` : source.promptSource ? `prompts/v1/agents/${source.promptSource}.md` : ["orchestrator", "planner", "clarifier", "plan-critic"].includes(name) ? `prompts/v1/agents/${name}.md` : name === "reviewer" ? "prompts/v1/agents/reviewer.md" : null;
    return {
      id: `dsmm-${name}`, sourceId: name, kind,
      name: `DW ${name.split("-").map((word) => word === "2nd" ? "2nd" : word[0].toUpperCase() + word.slice(1)).join(" ")}`,
      description: source.description, order: (index + 1) * 10, mode,
      enabledByDefault: source.optIn !== true, access: readOnly ? "read-only" : "write",
      delegation: group, allowedChildren: allowedChildren.map((target) => `dsmm-${target}`),
      childBuilderAllowedChildren: name === "builder" ? utility.map((target) => `dsmm-${target}`) : undefined,
      promptSource, promptArtifact: promptSource === null ? null : promptSource.replace("prompts/v1/", "prompts/source/"), terminalArtifact,
      catalogSource: kind === "role" ? "src/data/agents.ts" : "src/data/categories.ts",
      routing: "native picker/inheritance unless explicit catalog-valid configuration"
    };
  });
  add("prompts/source/catalog.json", json(rows), "src/data/{agents,categories}.ts; src/hooks/config.ts assembly", "src/roles.ts: canonical metadata, persona, settings/profile role keys", ["source-role-authority"]);

  const descriptions = {};
  for (const [name, source] of Object.entries(SKILL_SOURCES)) {
    for (const file of [...inputs.keys()].filter((path) => path.startsWith(`${source}/`)).sort()) {
      const path = file.slice(source.length + 1);
      const input = readInput(file);
      const content = extname(file) === ".md" ? adaptSkill(source, path, input.toString("utf8")) : input;
      add(`skills/${name}/${path}`, content, `${source}/${path}`, "src/skills.ts: metadata, readBundledSkill resourceBase; native read/shell resources", ["resource-base", "authorization", ...(extname(file) === ".md" ? ["native-dispatch"] : [])]);
      if (path === "SKILL.md") {
        const line = /^description:\s*(.+)$/mu.exec(content)?.[1];
        if (line === undefined) throw new Error(`description anchor drift: ${source}`);
        descriptions[name] = line.startsWith('"') ? JSON.parse(line) : line.replace(/^'|'$/gu, "");
      }
    }
  }
  add("skills/frontend/ATTRIBUTION.md", frontendAttribution(), "skills/frontend/ATTRIBUTION.md + scripts/frontend-recipe.mjs fixed-pin adaptation", "frontend distribution notices; test/source-sync.test.ts", ["authorization", "resource-base"]);
  add("skills/frontend/.gitignore", "# Explicit fixed-pin materialization; project-original design resources remain tracked.\nreferences/design/*.md\n!references/design/_INDEX.md\n!references/design/README.md\n!references/design/aside.md\n!references/design/clone-from-url.md\n!references/design/design-system-architecture.md\n!references/design/interaction-skill.md\n!references/design/react-dev-tooling-skill.md\nreferences/ui-ux-db/\n.frontend-materialized.json\n", "scripts/frontend-recipe.mjs: third-party body distribution policy", "Git source hygiene; materialized bodies are never committed");
  add("skills/frontend/.npmignore", "# Override .gitignore: every fixed-pin materialized body/data/script/inventory must pack.\n__pycache__/\n**/__pycache__/\n*.pyc\nnode_modules/\n.DS_Store\n", "scripts/frontend-recipe.mjs: full resource distribution policy", "npm package files; no missing materialized references allowed");
  const index = outputs.get("skills/frontend/references/design/_INDEX.md");
  if (index === undefined) throw new Error("missing generated frontend index");
  const recipe = frontendRecipe(packageRoot, index.toString("utf8"));
  const frontend = checkFrontendAssets(packageRoot, recipe);
  if (frontend.outcome !== "ready") throw new Error(`frontend resource closure drift: ${frontend.errors.join("; ")}`);
  const collisions = recipe.filter((row) => outputs.has(`skills/frontend/${row.target}`));
  if (collisions.length) throw new Error(`source/frontend resource collision: ${collisions.map((row) => row.target).join(",")}`);
  for (const row of frontend.files) trace.push({ source: `${FRONTEND_PINS[row.upstream].repository}@${FRONTEND_PINS[row.upstream].commit}/${row.source}`, artifact: `skills/frontend/${row.target}`, consumer: "frontend native resourceBase; verbatim read/reference/Python resource (no build execution)", rules: ["verbatim fixed-pin bytes; path mapping only"], ...(row.blob === undefined ? {} : { blob: row.blob }), test: "test/source-sync.test.ts; test/frontend-materialization.test.ts; packed inventory gate" });
  trace.push({ source: "scripts/frontend-recipe.mjs immutable path/blob provenance", artifact: "skills/frontend/.frontend-materialized.json", consumer: "offline completeness/integrity and package gate", rules: ["explicit-only network synchronization"] });
  const skillsSource = readFileSync(join(packageRoot, "src/skills.ts"), "utf8").replaceAll("\r\n", "\n");
  const begin = "// BEGIN SOURCE SKILL METADATA", end = "// END SOURCE SKILL METADATA";
  const metadata = `export const DSMM_SKILL_DESCRIPTIONS: Record<DsmmAvailableSkillName, string> = ${JSON.stringify(descriptions, null, 2)};\n`;
  outputs.set("src/skills.ts", Buffer.from(skillsSource.replace(section(skillsSource, begin, end, "src/skills.ts"), `${begin}\n${metadata}`)));
  const unused = [...inputs.keys()].filter((path) => !consumed.has(path));
  if (unused.length) throw new Error(`unused source inputs outside generator closure: ${unused.join(",")}`);
  const resources = skillResourceProblems(packageRoot, outputs);
  if (resources.length) throw new Error(`source resource closure drift: ${JSON.stringify(resources)}`);
  add("prompts/source/manifest.json", json({ sourceRoot: "..", sourceInventory: "scripts/source-inventory.mjs", host: "DSH 0.2.1-rc.2", license: "LicenseRef-AAAPL; full package LICENSE applies to OCMM-derived modifications; original third-party notices retained per skill", attribution: "OCMM Hugefiver; v1 workflow forks retain obra/superpowers lineage; standalone notices/licenses copied recursively", rules: ADAPTATION_RULES, anchors, roles: rows.map(({ id, sourceId, catalogSource, promptSource, promptArtifact, terminalArtifact }) => ({ id, sourceId, catalogSource, promptSource, promptArtifact, terminalArtifact, consumer: "src/roles.ts persona + active src/prompts.ts calibration", test: "test/source-sync.test.ts; test/prompts.test.ts; test/roles.test.ts" })), skills: SKILL_SOURCES, exclusions: EXCLUSIONS, files: trace }), "repository root inputs declared by scripts/source-inventory.mjs", "maintenance sync/check; test/source-sync.test.ts");
  return outputs;
}

export function syncSourceAssets({ check = false, root = dsmmRoot, packageRoot = dsmmRoot, sourceRoot = repositoryRoot } = {}) {
  const outputs = sourceOutputs({ packageRoot, sourceRoot }), differences = [];
  const frontend = frontendRecipe(packageRoot, outputs.get("skills/frontend/references/design/_INDEX.md").toString("utf8")).map((row) => `skills/frontend/${row.target}`);
  const allowed = new Set([...outputs.keys(), ...frontend, "skills/frontend/.frontend-materialized.json"]);
  for (const directory of ["prompts/source", ...Object.keys(SKILL_SOURCES).map((name) => `skills/${name}`)]) {
    if (!existsSync(join(root, directory))) continue;
    for (const path of artifactFiles(root, directory)) if (!allowed.has(path)) differences.push(path);
  }
  if (!check && differences.length) throw new Error(`unexpected prepared source resources; review/remove explicitly before sync: ${differences.join(",")}`);
  for (const [artifact, content] of outputs) {
    const path = join(root, artifact);
    if (existsSync(path) && (check || readFileSync(path).equals(content))) continue;
    differences.push(artifact);
    if (!check) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
  }
  return { outputs: outputs.size, differences };
}

function artifactFiles(root, directory) {
  if (lstatSync(join(root, directory)).isSymbolicLink()) throw new Error(`linked prepared source directory: ${directory}`);
  return readdirSync(join(root, directory)).sort().flatMap((name) => {
    if (["__pycache__", "node_modules", ".git"].includes(name) || name.endsWith(".pyc")) return [];
    const path = `${directory}/${name}`, stat = lstatSync(join(root, path));
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error(`linked or non-regular prepared source resource: ${path}`);
    return stat.isDirectory() ? artifactFiles(root, path) : [path];
  });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  if (process.argv.slice(2).some((argument) => argument !== "--check")) throw new Error("usage: sync-source-assets.mjs [--check]");
  const result = syncSourceAssets({ check });
  console.log(json({ mode: check ? "check" : "sync", ...result }).trim());
  if (check && result.differences.length > 0) process.exitCode = 1;
}
