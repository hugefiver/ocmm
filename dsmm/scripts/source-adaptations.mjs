import { DSH_RESOURCE_GUIDANCE } from "./source-inventory.mjs";

export const ADAPTATION_RULES = {
  "native-skill-load": "Replace automatic/fulltext/slash-command skill assumptions with triggered native lazy skill loading.",
  "native-dispatch": "Adapt OpenCode Task/team schemas to assignment text and actual per-role or parameterized DSH inventory; preserve target/caller/read-only/depth authority.",
  "source-role-authority": "Preserve full role/category content and source terminal policies, with DSH capability conditions; no provider/model defaults copied.",
  "dsh-common-scope": "Keep complete default common workflow inside effective mode; planner/family layers are additive and subordinate to persistent persona/terminal policy, explicit off withdraws common/skills only.",
  "bounded-cleanup": "Retain all source cleanup categories and passing evidence for final valid requirements/committed contracts; use session coordination, bounded useful delegation and task-owned corrections, not text locks, mechanical fan-out or LOC quotas.",
  "native-profile-selection": "Keep canonical role identity and ordinary root native model authority; only observed configured invocation levels and deployment-gated route overrides are usable, never inferred from source tiers.",
  "native-lifecycle": "Use observed unique startup binding and wired controls only; same-run handoff, native jobs and same-ID continuable delivery retain ownership/capacity/depth/cancellation and conservative legacy evidence boundaries.",
  "native-locale": "Shared visible-language priority covers every role/category; the exact Agent assembler adds immutable captured locale without Root preference, reasoning-language or host/project-locale claims.",
  "authorization": "Resource commands never authorize installation, login, Git writes, private state access or destructive operations.",
  "frontend-capabilities": "Authored React/Open Design routing inspects actual existing capabilities first; installation requires separate authorization and unverified surfaces are reported, not silently passed.",
  "frontend-cli-context": "Verbatim UI/UX upstream commands are superseded by authored absolute resourceBase script paths, target-project cwd and explicit authorized output-dir; no ruleset-cwd persistence or assumed tool cwd API.",
  "resource-base": "Recursive resources ship at native skill resourceBase; source examples are shell-translated and permission-conditioned, not automatic execution."
};

const uiuxInvocation = `## DSH UI/UX resource use and output domain

The upstream README remains verbatim reference material. Its skills/ui-ux-pro-max/scripts/search.py path and host setup examples are not DSH invocation paths. Resolve the actual script from the native skill's absolute directory resourceBase: references/ui-ux-db/scripts/search.py. Data resolves relative to that script, not the shell cwd.

Before any authorized invocation, confirm that the active shell/session already has the target project as cwd. Do not run from the installed ruleset, invent a tool cwd/workdir field, or use shell cd/Set-Location to silently change context. If the host cannot provide the target project context, return that limitation without invoking the script. Use only an already available Python interpreter; installing one or dependencies requires separate authorization.

PowerShell example for an explicitly authorized persistence request: skillResourceBase is the native returned absolute directory; targetProject and approvedOutputDir are the actual approved project/output paths, not defaults inferred from a resource directory. Inspect output path ownership/links and host permission before writing. The pinned parser exposes --persist and --output-dir (-o); persist writes under that output root's design-system/<project>/, never the installed skill tree.

\`\`\`powershell
$searchScript = Join-Path $skillResourceBase "references/ui-ux-db/scripts/search.py"
if (-not [IO.Path]::IsPathRooted($skillResourceBase) -or -not (Test-Path -LiteralPath $searchScript -PathType Leaf)) { throw 'Missing absolute native skill script; do not use a fallback path' }
$projectRoot = (Resolve-Path -LiteralPath $targetProject).Path.TrimEnd([IO.Path]::DirectorySeparatorChar)
if ($PWD.Path.TrimEnd([IO.Path]::DirectorySeparatorChar) -ne $projectRoot) { throw 'Target project cwd is not active; do not invoke from the resource directory' }
if (-not [IO.Path]::IsPathRooted($approvedOutputDir)) { throw 'An explicitly approved absolute output directory is required' }
$outputRoot = [IO.Path]::GetFullPath($approvedOutputDir).TrimEnd([IO.Path]::DirectorySeparatorChar)
$resourceRoot = (Resolve-Path -LiteralPath $skillResourceBase).Path.TrimEnd([IO.Path]::DirectorySeparatorChar)
if ($outputRoot -eq $resourceRoot -or $outputRoot.StartsWith($resourceRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Persistence must not write the installed skill tree' }
if ($outputRoot -ne $projectRoot -and -not $outputRoot.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Output directory must belong to the approved target project' }
python3 "$searchScript" "<query>" --design-system --persist --output-dir "$outputRoot" -p "Project"
\`\`\`

For non-writing lookup, use the same resolved script and confirmed project context with --domain/--stack or --design-system but omit --persist. Current fixed-pin domains: style/color/chart/landing/product/ux/typography/icons/react/web/google-fonts; stacks are those in the shipped core.py STACK_CONFIG. If any declared resource is missing, stop with the exact missing path; existing browser/tool fallbacks do not conceal an incomplete resource tree.
`;

function replaceRequired(text, before, after, source) {
  if (!text.includes(before)) throw new Error(`adaptation anchor drift: ${source}: ${before.slice(0, 100)}`);
  return text.replaceAll(before, after);
}

export function adaptLocale(input) {
  let text = replaceRequired(input, "No locale is configured.", "This shared resource supplies no configured locale; preserve this exact Agent's captured locale and applicable host/user language guidance when supplied.", "src/hooks/config.ts: buildLocaleGuidance");
  return replaceRequired(text, "Infer the user's preferred language from their latest message and conversation context, then prefer that language for your thinking process, visible planning, and conversation.", "When neither captured locale nor applicable host/user language guidance is supplied, infer the preferred visible-output language from the current request and conversation context. This does not configure reasoning language or the host/project locale.", "src/hooks/config.ts: buildLocaleGuidance");
}

export function adaptTerminal(source, input, { reviewSession = false } = {}) {
  if (!reviewSession) return input;
  if (!input.includes("<ocmm-review-session-efficiency-policy>")) throw new Error(`adaptation anchor drift: ${source}: review session policy`);
  return replaceRequired(input, "Continue the same reviewer or plan-critic `task_id` for corrections and rechecks inside that stage.", "Continue the same reviewer or plan-critic child only when it was started in native continuable mode, its returned child ID is valid, and the exposed send_message surface permits that follow-up. A one-shot result has no continuation handle: start a fresh permitted focused child with the correction context. Never send task_id, resume or retry fields. Native message acceptance is not review completion.", source);
}

export function section(text, start, end, source) {
  const from = text.indexOf(start), to = text.indexOf(end, from + start.length);
  if (from < 0 || to < 0 || text.indexOf(start, from + start.length) >= 0) throw new Error(`section anchor drift: ${source}: ${start}`);
  return text.slice(from, to);
}

export function adaptPrompt(source, input) {
  let text = input.replaceAll("\r\n", "\n");
  if (source.endsWith("agents/orchestrator.md")) {
    text = replaceRequired(text, "## Native OpenCode Background Subagents", "## Native DSH Subagents", source);
    text = replaceRequired(text, "Use `background: true` only when the currently callable `task` schema exposes `background` and the parent has useful independent work; otherwise omit the field. Keep result-gated work in the foreground. The host notifies completion or error, so do not poll or invent result-retrieval APIs. `task_id` only continues the child session; it is not a polling job ID. Background work is process-local, not restart-durable.", "Keep result-gated work foreground. Use run_in_background only when the actual admitted role/category tool exposes it and useful independent parent work remains. Native jobs own permitted one-shot background; a managed continuable configuration can default background, while explicit false creates a non-reusable one-shot. Reuse only an existing permitted continuable child through actual controls, retaining the same durable ID and original capture. When a wired user foreground handoff is observed, it transfers the existing run to native jobs, never starts another run. Capability/ownership/depth/capacity/cancel gates remain mandatory; do not invent task_id, polling or unconnected RPCs.", source);
    text = text.replaceAll("The orchestrator alone", "The trusted root/stage owner alone").replaceAll("with the orchestrator", "with the trusted root/stage owner");
    text = replaceRequired(text, "Before dispatching `planner` or `plan-critic`, inspect current callable or registered profile availability. The unsuffixed normal profiles are the baseline. Complex cross-module work may use configured high, otherwise normal; security, performance, data-loss, release-safety, or runtime-safety work may use configured max, otherwise configured high, otherwise normal. Use low only for an explicit cost or latency request. Never invent or synthesize a missing profile. `plan-critic-low` changes model cost or latency, not review effort; it retains the xhigh floor.", "Before dispatching planner or plan-critic, inspect actual admitted role tools, target enums and configured invocation levels. Keep canonical dsmm-planner/dsmm-plan-critic identities; source tier suffixes are not DSH tools. Omitted/normal preserves the default route. For cross-module work prefer configured high when suitable, otherwise normal; for concrete safety/performance/data-loss risk prefer configured max, then high, then normal. Use low only for explicit cost/latency intent. No tier name proves a model's effort or capability: levels are configured complete routes or exact effort-only overrides, and route needs deployment opt-in plus native preflight. Preserve the critic's thorough blocker-finding duty independent of cost; no exact xhigh SDK effort is inferred. Report a required unavailable planning capability to the stage owner.", source);
    text = replaceRequired(text, "`oracle`, `oracle-2nd`, then configured later slots", "`oracle`, then `oracle-2nd` only when actually enabled and permitted; no later slot is supplied by this inventory", source);
  }
  if (source.endsWith("agents/planner.md")) {
    text = replaceRequired(text, "- Read, search, and analyze. Write a product plan artifact when durable coordination is useful or the user asks for one; non-product coordination and reports stay in conversation unless explicitly requested as deliverables. Do not edit source, tests, configuration, or product documentation.", "- Read, search, and analyze. Return a complete Markdown product plan when durable coordination is useful or requested; the authorized coordinator persists it if an artifact is needed. This native planner is read-only, including plan files: do not use shell, write/edit or a child proxy to persist one. Non-product coordination and reports stay in conversation unless explicitly requested as deliverables. Do not edit source, tests, configuration, or product documentation.", source);
    text = replaceRequired(text, "with its location when one was written", "with an authorized coordinator's artifact location when provided", source);
  }
  if (source.endsWith("agents/clarifier.md")) {
    text = replaceRequired(text, "Ask at most three questions, and only for material ambiguity that changes the deliverable.", "Ask only the smallest useful set of questions for material ambiguity that changes the deliverable; do not impose a fixed question quota.", source);
    text = replaceRequired(text, "At most three material questions.", "Only material questions that direct evidence cannot resolve.", source);
  }
  if (source.endsWith("deepwork/codex.md")) {
    text = replaceRequired(text, "# OpenCode Tool Compatibility for Codex Models", "# DSH Tool Compatibility for Codex-family Models", source);
    text = replaceRequired(text, "Use OpenCode's currently callable task schema for permitted delegation and its available todo/notepad surface for tracking. `task_id` continues only the same child session; use background fields only when exposed and independent parent work remains. Rely on host notifications rather than polling or invented retrieval APIs. Use the exposed editing tools and LSP tools, not Codex-only tool names. Load matching skills through the host's available skill surface.", "Use the currently observed DSH per-role or parameterized role/category tools for permitted delegation, an available native tracking surface or authorized plan for coordination, and exposed editing/LSP tools rather than Codex-only names. Level/route/background and same-ID continuation depend on captured admission and actual schemas, never on templates. Do not send task_id or invent a control RPC. Load matching skills through native skill invocation.", source);
  }
   if (source.endsWith("deepwork/default.md")) {
     text = replaceRequired(text, "Other deepwork skills are available as slash commands — load them on demand when the trigger matches.", "Deepwork skills are discoverable as native metadata — load their bodies on demand when the trigger matches.", source);
     text = replaceRequired(text, "`planner`: writes structured implementation plans; never implements product code.", "`planner`: returns complete structured Markdown plans for authorized coordinator persistence; native read-only access never writes product code or plan files.", source);
   }
  if (source.endsWith("deepwork/planner.md")) text = replaceRequired(text, "- Stay in planner scope. Read, search, analyze, and write planning artifacts only.", "- Stay in native read-only planner scope. Read, search, analyze, and return a complete Markdown plan only; an authorized coordinator persists any required artifact. Do not write through shell, file tools or a proxy.", source);
  if (/deepwork\/(?:gemini|glm)\.md$/u.test(source)) text = replaceRequired(text, "`brainstorming` is the only always-injected skill", "`brainstorming` is a triggered, lazily loaded native skill", source);
   if (source.endsWith("deepwork/glm.md")) text = replaceRequired(text, "Delegate explore in background, then keep working on non-overlapping tasks.", "Use the observed permitted entry for dsmm-code-search: its per-role tool or dsmm_role with the admitted role enum. Request run_in_background only when exposed and useful independent work remains; otherwise keep result-gated lookup foreground.", source);
  text = text.replaceAll("Other deepwork skills are available as slash commands — load them on demand when the trigger matches.", "Deepwork skills are discoverable as native metadata — load their bodies on demand when the trigger matches.")
    .replaceAll("The injected `writing-plans` skill", "The on-demand native `writing-plans` skill")
    .replaceAll("path-backed `writing-plans` skill", "native `writing-plans` skill")
    .replaceAll("`brainstorming` is the only always-injected skill", "`brainstorming` is a triggered, lazily loaded native skill")
    .replaceAll("Other skills are on-demand slash commands:", "Other skills are on-demand native skills:")
    .replaceAll("always loaded; scale", "load when triggered; scale")
    .replaceAll("| automatic |", "| native skill load when triggered |")
    .replaceAll("the current callable task schema", "the current admitted native role/category schema")
    .replaceAll("injected skills", "applicable loaded skills")
    .replaceAll("Oversized functions (>50 lines) or modules (>250 pure LOC) — split by responsibility, not by line count", "Mixed-responsibility functions or modules — split only when it improves ownership and clarity, never to satisfy line-count quotas");
  text = text.replace(/\/(brainstorming|writing-plans|subagent-driven-development|requesting-code-review|receiving-code-review|dispatching-parallel-agents|remove-ai-slops)\b/gu, "$1");
  return text;
}

export function adaptSkill(source, relative, input) {
  let text = input.replaceAll("\r\n", "\n");
  if (relative === "SKILL.md") {
    const end = text.indexOf("\n---", 4);
    if (end < 0) throw new Error(`skill frontmatter drift: ${source}`);
    text = `${text.slice(0, end + 4)}\n\n${DSH_RESOURCE_GUIDANCE}\n${text.slice(end + 4).trimStart()}`;
  } else if (!/(?:LICENSE|ATTRIBUTION|NOTICE)/u.test(relative)) {
    text = `> DSH adapter boundary: resolve this resource from the loaded skill's directory resourceBase. Examples are not authority: installation/download/login, private state, Git writes and destructive operations need exact explicit authorization. Use only tools and native roles actually exposed in the current catalog and allowed by the caller; otherwise use a real direct fallback or report the limitation. Translate shell examples to the active runtime.\n\n${text}`;
  }
  if (source === "skills/remove-ai-slops" && relative === "SKILL.md") {
    text = replaceRequired(text, "then runs categorized cleanup via parallel task agents in batches of 5", "then runs categorized cleanup with bounded permitted work", source);
    text = replaceRequired(text, "10. **Oversized modules** — Files over 250 pure LOC. Must execute full modular refactoring (not just flagging): list violations, split by responsibility, name files by concept (no utils/helpers catch-alls), show the split plan, extract clean modules, verify. Opt-out: `// SIZE_OK` or `# SIZE_OK` comment.", "10. **Mixed-responsibility modules** — Identify ownership/cohesion problems, not a LOC quota. Split by responsibility only when necessary for the approved cleanup; do not manufacture helpers, interfaces, comments or opt-out markers to satisfy a counter. Verify preserved behavior at the affected seam.", source);
    text = replaceRequired(text, "Use session-level coordination only when it helps.", "Use session-level coordination only when it helps. An exposed native todo_write tool can track the owning Agent's complete content/status list under its actual parallel policy; otherwise use a concise response. No TodoWrite, workspace ledger or automatic plan file is assumed.", source);
    text = replaceRequired(text, "### Phase 4: Parallel slop removal via task agents (batches of 5)", "### Phase 4: Bounded slop removal", source);
    text = replaceRequired(text, "For product code cleanup, process files via `task(description=..., subagent_type=..., prompt=...)`. Resolvable non-product docs or maintenance cleanup runs directly; use a bounded worker only when it materially helps. When delegating, batch up to 5 independent files concurrently; pass `background: true` only when the current callable schema exposes `background` and the parent has independent work. Otherwise omit it and keep the batch foreground; integrate every result before starting the next batch.", "Use direct edits for resolvable non-product docs or maintenance cleanup. Delegate independent product cleanup only when an actually callable permitted native role owns a useful bounded deliverable; respect file ownership, inherited authority and depth. Choose concurrency from actual dependencies and capacity, not a batch quota. Pass run_in_background only when the admitted schema exposes it and useful independent parent work remains; otherwise keep result-gated cleanup foreground. Integrate results before dependent work.", source);
    text = replaceRequired(text, "Batch failure handling: a wait timeout is not a failure. Require sub-agents to report WORKING or BLOCKED.", "An acknowledgment, partial output or wait timeout is not completion evidence. Inspect the actual result, failed checks and unresolved blockers; do not require status tokens or invented polling APIs.", source);
    text = replaceRequired(text, "3. Use a patch to correct only this task's problematic hunk; never discard existing user edits or perform unauthorized Git writes.", "3. Inspect the current diff and use an exposed authorized edit tool to correct only this task's problematic hunk; never discard existing user edits or perform unauthorized Git writes. A destructive Git restore requires separate exact authorization.", source);
    text = replaceRequired(text, "If the same file fails 3 times, STOP and escalate to the user.", "Stop and escalate when evidence exposes a material blocker, unsafe equivalence, or an authorization decision; do not impose an arbitrary attempt quota.", source);
    text = replaceRequired(text, "- **Batch only useful independent work**: When delegation is warranted, use up to 5 concurrent files; don't dispatch extra workers to fill a batch or for resolvable non-product cleanup.", "- **Useful concurrency only**: Choose concurrency from actual independence, ownership and native capacity; don't fill a batch or delegate resolvable non-product cleanup. Passing evidence protects final valid requirements and committed contracts, not uncommitted transition behavior or descriptive text.", source);
    text = replaceRequired(text, "Select the meaningful gates for the changed surface and concrete risk; reuse sufficient unchanged evidence rather than repeating all gates after each correction:", "Select the meaningful available gates for the changed surface and concrete risk; reuse sufficient unchanged evidence rather than repeating all gates after each correction. Report necessary unavailable tooling/evidence instead of installing it implicitly or claiming a pass:", source);
  }
  if (source === "skills/v1/requesting-code-review" && relative === "SKILL.md") {
    text = replaceRequired(text, "- Oracle slots are external-model cross-check choices in configured priority order: `oracle`, `oracle-2nd`, then later configured slots.", "- Oracle roles are cross-check choices in order: dsmm-oracle, then dsmm-oracle-2nd only when enabled, permitted and useful. Verify different actual native routes before claiming external-model independence; this inventory supplies no later slots.", source);
     text = replaceRequired(text, "- Logical tiers are `low`, unsuffixed `normal`, `high`, and `max`, subject to actual configuration and model support.", "- Keep one canonical native role identity. Omitted/normal preserves its default route; low/high/max can be selected only when listed in the actual target's configured roleRouting levels and exposed schema. Levels are complete routes or exact supported effort-only choices, never suffix tools or guaranteed model effort. Arbitrary route overrides need deployment opt-in, exposed parameters and exact preflight. All levels retain review rigor and authority ceilings.", source);
    text = replaceRequired(text, "See template at: `requesting-code-review/code-reviewer.md`", "See template at: `./code-reviewer.md`", source);
  }
  if (source === "skills/v1/brainstorming" && relative === "SKILL.md") {
    text = replaceRequired(text, "Automatically injected final-state policy and proportional discovery.", "Triggered native final-state policy and proportional discovery.", source);
    text = replaceRequired(text, "These rules apply to every task, including agents and categories that receive this skill through automatic injection or packaging.", "These rules apply when this triggered native skill is loaded. Shared workflow and role policies remain effective without injecting the skill body; packaging is not automatic skill execution or authority.", source);
  }
  if (source === "skills/v1/writing-plans" && relative === "SKILL.md") text = replaceRequired(text, "Write an implementation plan that lets a capable engineer reach the approved outcome without rediscovering important context.", "Produce an implementation plan that lets a capable engineer reach the approved outcome without rediscovering important context. A native read-only planner returns complete Markdown; an authorized coordinator writes any required artifact within its own permissions.", source);
  if (relative.endsWith("-prompt.md") || relative === "code-reviewer.md") {
    text = text.replaceAll("Task tool (general-purpose):", "Assignment content (not a tool-call schema; send through a permitted callable native role tool):")
      .replaceAll("your effective Task policy", "your effective native delegation policy");
  }
  if (source === "skills/debugging") {
    if (relative === "SKILL.md") {
      text = replaceRequired(text, "team mode `debug-squad` when enabled, async subagents otherwise", "independent direct probes or permitted callable native roles", source);
      text = replaceRequired(text, "Commits belong to `/git-master` after the user confirms the fix.", "Load the native git-master skill only for an exact user-authorized Git operation that the current role policy permits; confirming a fix is not commit authorization.", source);
    }
    if (relative === "references/methodology/02-investigate.md") {
      const original = section(text, "## Phase 3 — Parallel Investigation", "## Evidence capture discipline", source);
      text = replaceRequired(text, original, `## Phase 3 — Independent Evidence Investigation\n\nUse independent direct probes first. If the current role policy and actual DSH catalog permit delegation, assign distinct bounded evidence to available roles; otherwise investigate sequentially. DSH does not provide the OpenCode team registry or debug-squad configuration. Do not write host-private team configuration or invent task calls.\n\nRetain the source responsibilities: inspect observed runtime state; correlate logs/timing; minimize a reproducible input; cross-link observations into a causal chain and identify the next falsifying query. Read-only lookup roles may inspect evidence but cannot create instrumentation/reproduction files by proxy. The lead keeps exact task-owned resource/cleanup identities in session or disposable investigation state before creation, approves authorized edits, integrates evidence, and owns cancellation/cleanup via actual host controls; no repository journal or per-file ledger is created. Reviewer/Oracle remain implementation-acceptance roles, not debugging consultants. After two failed evidence rounds, return a genuinely difficult decision to the stage owner for optional hard-reasoning, subject to the caller's permitted targets.\n\n---\n\n`, source);
    }
    text = text.replace(/task\(description="Reframe root-cause investigation", subagent_type="hard-reasoning",/u, 'Native assignment content for a permitted callable hard-reasoning role (otherwise return to stage owner):')
      .replace(/task\(description="Verify non-debug artifact claims", subagent_type="research",/u, 'Native assignment content for a permitted callable research role (otherwise verify directly):');
    if (["references/methodology/04-hard-reasoning-escalation.md", "references/methodology/partial-runtime-evidence.md"].includes(relative)) text = text.replaceAll('""")', '"""');
    if (relative === "references/tools/dap.md") text = replaceRequired(text, 'Join-Path $PWD "skills\\debugging\\references\\scripts\\dap.mjs"', 'Join-Path $skillResourceBase "references\\scripts\\dap.mjs" # resourceBase from native skill load', source);
  }
  if (source === "skills/using-git-worktrees" && relative === "SKILL.md") text = replaceRequired(text, "OpenCode has no native worktree tool. Use `git worktree add` directly.", "Use `git worktree add` only after explicit worktree authorization, through an actually permitted native shell. No DSH worktree service is assumed.", source);
  if (source === "skills/frontend" && relative === "SKILL.md") {
    text = replaceRequired(text, "and the React Dev Tooling Gate (react-grab / react-scan / react-doctor installed by default)", "and the React Dev Tooling Gate (inspect already available react-grab / react-scan / react-doctor; installation requires separate authorization)", source);
    text = replaceRequired(text, "`open-design` skill — the local nexu-io/open-design library (137+ design skills, 150+ design systems)", "Use open-design only if actually exposed in the native skill catalog; otherwise use a fitting bundled taste/brand reference or available direct research. Do not assume a local external checkout.", source);
    text = replaceRequired(text, "`agent-browser` skill", "Use an actually exposed browser skill/tool or already available, authorized isolated Playwright; if unavailable, report the browser QA blocker.", source);
    text = replaceRequired(text, "`programming` skill alone — this skill adds nothing there", "Use a fitting actual implementation role; an additional programming skill is optional only if exposed. This frontend skill adds nothing to nonvisual logic.", source);
    text = replaceRequired(text, section(text, "`README.md` documents the search CLI", "## Quick routes", source), `${uiuxInvocation}\n`, source);
  }
  if (source === "skills/frontend" && relative === "references/design/README.md") {
    text = replaceRequired(text, "For broader brand/style coverage, load the `open-design` skill — the local `nexu-io/open-design` library (150+ design systems).", "The declared curated fixed-pin resources are bundled and must be complete. For broader coverage, use open-design only if it is actually exposed in the current native skill catalog; no external local checkout is assumed. If unavailable, use fitting complete bundled references or actual permitted research and state the coverage limit. Missing bundled resources are a blocker, never a hidden fallback.", source);
    text = replaceRequired(text, "Use the `open-design` skill when", "When actually available, use the `open-design` skill when", source);
    const gate = section(text, "## Phase 0.5 — React Dev Tooling Gate", "## Routing decision flow", source);
    text = replaceRequired(text, gate, `## Phase 0.5 — React Dev Tooling Capability Gate\n\nFor React projects, inspect package.json, existing scripts/binaries and entry wiring for react-grab/react-scan/react-doctor before implementation. Reuse already available tools; no install/init/agent-skill setup happens by default. Software/dependency/CDN loading and installer changes require separate explicit authorization. A reference command is not that authorization.\n\nIf tools are absent and installation is not authorized, use existing project/browser/static evidence and identify the missing render/static-scan coverage. Never claim a tool or audit ran, never weaken UX for a score, and never disguise missing declared skill resources as a tooling fallback. Non-React/library/legacy projects use only applicable existing capabilities.\n\nFor already wired runtime tools, inspect development-only gates (NODE_ENV/import.meta.env.DEV) and production leakage. Correct project code only within the authorized assignment. Read react-dev-tooling-skill.md for already-installed usage or separately authorized setup examples; do not run npx @latest or bootstrap a tool implicitly.\n\n${uiuxInvocation}\n\n`, source);
    text = replaceRequired(text, "If missing, output the install command first.", "If missing, do not install implicitly; use available evidence or return a material capability/authorization limitation. Any install command is conditional on separate authorization.", source);
  }
  if (source === "skills/frontend" && relative === "references/design/react-dev-tooling-skill.md") {
    text = replaceRequired(text, "# React Dev Tooling Defaults", "# React Dev Tooling — Capability and Authorization", source);
    text = replaceRequired(text, "When setting up or working on a React project, install three dev-only tools by default unless the user explicitly opts out. They make every coding agent's frontend work measurably faster and the resulting code measurably better.", "Inspect actual project dependencies, scripts/binaries and entry wiring first. Reuse already available dev tools; missing tooling does not authorize installation, agent-skill setup or CDN execution. Only separately authorized setup may change dependencies. Otherwise use existing browser/static evidence and identify the unverified render/scan coverage.", source);
    text = replaceRequired(text, "Why it's a default", "Why consider it when available", source);
    text = replaceRequired(text, "## Default install for a React project", "## Separately authorized setup for a React project", source);
    text = replaceRequired(text, "Run from project root. This is the canonical setup. Skip ONLY if the user says \"no extra dev tools\" or the project README explicitly forbids them.", "Only after explicit authorization for the exact setup changes, use already present project-local CLIs from the confirmed project context. The following examples prohibit implicit package fetching; if a binary is unavailable, stop and describe the capability gap rather than installing or using latest automatically.", source);
    text = replaceRequired(text, "npx grab@latest init", "npx --no-install grab init", source);
    text = replaceRequired(text, "npx react-doctor@latest", "npx --no-install react-doctor", source);
    text = replaceRequired(text, "npx react-scan@latest init", "npx --no-install react-scan init", source);
    text = replaceRequired(text, "If the CLI fails or the project uses a non-standard setup, fall back to the manual snippets below.", "If the CLI fails or does not fit, manual snippets below remain conditional on the same explicit authorization; CDN script examples also require approval of that network/code load. Do not bootstrap a replacement tool.", source);
    text = replaceRequired(text, "Wire it in three places:", "Use an already available scanner within the authorized task. Agent-skill installation, pre-commit changes and CI setup below require separate approval; they are examples, not required automatic steps:", source);
    text = replaceRequired(text, "Detects Claude Code / OpenCode / Cursor / Codex automatically and writes the skill into the right location.", "This optional upstream installer targets other hosts; do not assume DSH support or write their private configuration. Use only an actually available native skill/capability.", source);
    text = replaceRequired(text, "millionco/react-doctor@main", "millionco/react-doctor@<approved-fixed-revision>", source);
    text = replaceRequired(text, "## Feature flag — opt-out without surgery", "## Feature flag — disable existing runtime instrumentation", source);
    text = replaceRequired(text, "only run react-doctor's static scan (it's framework-tolerant).", "use its static scan only if already available and applicable, otherwise report that evidence limitation.", source);
    text = replaceRequired(text, "The static scan still applies.", "An already available applicable static scan can still be used; do not install it implicitly.", source);
    text = replaceRequired(text, "then this gate (dev tooling must be installed).", "then inspect existing tooling and its development gate; absent tooling is a reported coverage limitation, not installation authority.", source);
    text = replaceRequired(text, "- For **debugging an in-flight React bug**, see `../../debugging/references/tools/react-devtools.md` — runtime/static use during a bug hunt rather than initial setup.", "- For **debugging an in-flight React bug**, load the native debugging skill when available and resolve its actual references/runtimes/node.md and references/tools/playwright-cli.md from that skill's returned resourceBase. Use already available React/browser tooling; no cross-skill relative path or unbundled react-devtools resource is assumed. If debugging is unavailable, report that limitation.", source);
    text = replaceRequired(text, "**Every React project the agent sets up gets these three tools wired with dev-only gates by default. The user opts out, not in.**", "**Inspect real capabilities first. Keep existing tools dev-only; install/change tooling only when explicitly authorized. State exactly which evidence is unavailable.**", source);
  }
  if (source === "skills/frontend" && relative === "references/design/_INDEX.md") {
    text = replaceRequired(text, "From [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md), based on", "Historical OCMM index lineage: [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md). DSMM's actual mapped brand bodies come from the fixed [Open Design](https://github.com/nexu-io/open-design) commit recorded in ../../ATTRIBUTION.md; aside.md remains project-original. The index format was based on", source);
  }
  if (source === "skills/init-deep" && relative === "SKILL.md") text = replaceRequired(text, "Read(filePath=file)", "Read the file through the currently exposed native read schema", source);
  return text;
}
