import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { transpileModule } from "typescript";
import { BUILTIN_AGENTS } from "../../src/data/agents.ts";
import { BUILTIN_CATEGORIES } from "../../src/data/categories.ts";
import { BASE_ROLES, CATEGORIES, DSH_TOOL_CONTRACT, EXCLUSIONS, SKILL_SOURCES, SOURCE_BASELINE, WORKFLOW_VARIANTS } from "./source-inventory.mjs";
import { ADAPTATION_RULES, adaptPrompt, adaptSkill, section } from "./source-adaptations.mjs";
import { FRONTEND_PINS, frontendAttribution, frontendRecipe } from "./frontend-recipe.mjs";
import { checkFrontendAssets } from "./materialize-frontend.mjs";

const dsmmRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dsmmRoot);
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const slash = (value) => value.replaceAll("\\", "/");
const readSource = (path) => readFileSync(join(repoRoot, path), "utf8").replaceAll("\r\n", "\n");

export function sourceOutputs() {
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
    add(`prompts/source/deepwork/${variant}.md`, adaptPrompt(source, readSource(source)), source, "src/prompts.ts: buildDeepworkPrompt", ["native-skill-load", "native-dispatch", "source-role-authority", "dsh-common-scope"]);
  }
  for (const role of ["orchestrator", "reviewer", "planner", "clarifier", "plan-critic"]) {
    const source = `prompts/v1/agents/${role}.md`;
    add(`prompts/source/agents/${role}.md`, adaptPrompt(source, readSource(source)), source, "src/roles.ts: DSMM_ROLES.persona", ["source-role-authority", "native-dispatch"]);
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
  const locale = runInNewContext(`${transpileModule(localeSource, {}).outputText}\nbuildLocaleGuidance(undefined)`)
    .replace("No locale is configured.", "No DSMM locale override is configured; preserve the host's explicit locale if supplied.");
  add("prompts/source/shared/locale.md", `${locale}\n`, "src/hooks/config.ts: buildLocaleGuidance(default)", "src/prompt-content.ts: primary/all persona prefix", ["source-role-authority"]);
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
    let terminal = policies({ name, includeCompressionPolicy: !primary, includeReviewSessionEfficiency: name === "orchestrator" });
    terminal = terminal.replaceAll("`task_id`", "native child identity (only if continuation is exposed)");
    if (primary) terminal += `\n\n<dsmm-delegation-contract>\nA trusted root/stage-owner ${name} coordinates authorized work and owns formal planning, criticism, review dispatch and final acceptance. Root Builder is not a bounded worker. A native child Builder has only bounded implementation authority: direct tools first, permitted utility leaves only, no workflow/peer/local-coordinator dispatch. Do not self-promote from a persona or root preset name. Missing/conflicting trusted identity fails closed. Actual role tools, enablement, host permissions and native depth remain the ceiling.\n</dsmm-delegation-contract>`;
    else terminal += "\n\nThe source delegation allowance is conditional on actual native callability and the caller's inherited authority; formal workflow stages belong to the trusted root/stage owner. No static text grants a tool or overrides an execution restriction.\n";
    const terminalArtifact = `prompts/source/terminal/${name}.md`;
    add(terminalArtifact, `${terminal.trim()}\n`, "src/hooks/config.ts: terminalPromptSuffixFor/delegationContractFor; plan §3.4 DSH identity adaptation", "src/roles.ts: persona", ["source-role-authority", "native-dispatch"]);
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
    for (const file of sourceFiles(join(repoRoot, source))) {
      const path = slash(relative(join(repoRoot, source), file));
      if ([".gitignore", ".npmignore"].includes(path)) continue;
      if (name === "frontend" && ["ATTRIBUTION.md", "LICENSE-Apache-2.0.txt"].includes(path)) continue;
      const input = readFileSync(file);
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
  const frontend = checkFrontendAssets(dsmmRoot);
  for (const row of frontend.files.length === 0 ? frontendRecipe(dsmmRoot) : frontend.files) trace.push({ source: `${FRONTEND_PINS[row.upstream].repository}@${FRONTEND_PINS[row.upstream].commit}/${row.source}`, artifact: `skills/frontend/${row.target}`, consumer: "frontend native resourceBase; verbatim read/reference/Python resource (no build execution)", rules: ["verbatim fixed-pin bytes; path mapping only"], ...(row.blob === undefined ? {} : { blob: row.blob }), test: "test/source-sync.test.ts; test/frontend-materialization.test.ts; packed inventory gate" });
  trace.push({ source: "scripts/frontend-recipe.mjs immutable path/blob provenance", artifact: "skills/frontend/.frontend-materialized.json", consumer: "offline completeness/integrity and package gate", rules: ["explicit-only network synchronization"] });
  const skillsSource = readFileSync(join(dsmmRoot, "src/skills.ts"), "utf8");
  const begin = "// BEGIN SOURCE SKILL METADATA", end = "// END SOURCE SKILL METADATA";
  const metadata = `export const DSMM_SKILL_DESCRIPTIONS: Record<DsmmAvailableSkillName, string> = ${JSON.stringify(descriptions, null, 2)};\n`;
  outputs.set("src/skills.ts", Buffer.from(skillsSource.replace(section(skillsSource, begin, end, "src/skills.ts"), `${begin}\n${metadata}`)));
  add("prompts/source/manifest.json", json({ sourceBaseline: SOURCE_BASELINE, host: "DSH 0.2.0-rc.2", license: "LicenseRef-AAAPL; full package LICENSE applies to OCMM-derived modifications; original third-party notices retained per skill", attribution: "OCMM Hugefiver; v1 workflow forks retain obra/superpowers lineage; standalone notices/licenses copied recursively", rules: ADAPTATION_RULES, anchors, roles: rows.map(({ id, sourceId, catalogSource, promptSource, promptArtifact, terminalArtifact }) => ({ id, sourceId, catalogSource, promptSource, promptArtifact, terminalArtifact, consumer: "src/roles.ts persona + active src/prompts.ts calibration", test: "test/source-sync.test.ts; test/prompts.test.ts; test/roles.test.ts" })), skills: SKILL_SOURCES, exclusions: EXCLUSIONS, files: trace }), "scripts/source-inventory.mjs and actual recursive source inventory", "maintenance sync/check; test/source-sync.test.ts");
  return outputs;
}

function sourceFiles(directory) {
  return readdirSync(directory).sort().flatMap((name) => {
    if (["__pycache__", "node_modules", ".git"].includes(name) || name.endsWith(".pyc")) return [];
    const path = join(directory, name), stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`source resource link requires explicit mapping: ${path}`);
    return stat.isDirectory() ? sourceFiles(path) : [path];
  });
}

export function syncSourceAssets({ check = false, root = dsmmRoot } = {}) {
  const outputs = sourceOutputs(), differences = [];
  for (const [artifact, content] of outputs) {
    const path = join(root, artifact);
    if (existsSync(path) && readFileSync(path).equals(content)) continue;
    differences.push(artifact);
    if (!check) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
  }
  return { outputs: outputs.size, differences };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  if (process.argv.slice(2).some((argument) => argument !== "--check")) throw new Error("usage: sync-source-assets.mjs [--check]");
  const result = syncSourceAssets({ check });
  console.log(json({ mode: check ? "check" : "sync", ...result }).trim());
  if (check && result.differences.length > 0) process.exitCode = 1;
}
