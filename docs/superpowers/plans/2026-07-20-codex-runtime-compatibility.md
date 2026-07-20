# Codex Runtime Compatibility Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify callable-schema-authoritative Codex runtime guidance across the generated workflow skill, every agent's developer instructions, and every normalized skill, using one `GOAL`/`STOP WHEN`/`EVIDENCE` generic envelope.

**Architecture:** Add one private generic-envelope renderer and one private shared callable-dispatch renderer in `src/codex/plugin-generator.ts`. Embed the shared section through `renderWorkflowSkill()`, `codexAgentInstructions()`, and `normalizeSkillForCodex()`, then prove actual generated workflow, agent TOMLs, and normalized skills contain byte-identical contracts with explicit fork and legacy-contract negative assertions.

**Tech Stack:** TypeScript 6 ESM, Node.js 22 built-in test runner, Markdown/TOML generation, pnpm, PowerShell 7, existing Codex plugin generator.

**Global Constraints:**

- The reviewed design is `docs/superpowers/specs/2026-07-20-codex-runtime-compatibility-design.md`.
- The callable schema is authoritative for tool availability and every argument; omit hidden fields.
- Route order is exact profile, complete direct composition, V1/V2 generic-flat dispatch, then local execution. Direct composition is complete only when the current callable schema exposes every role-required model field, the schema-exact `reasoning` or `reasoning_effort` field when required, the role's full system/developer instructions, and all required skills; report it as composition, never exact-profile selection.
- The canonical generic envelope is exactly `GOAL`, `STOP WHEN`, and `EVIDENCE`; do not preserve a second mandatory legacy label vocabulary.
- The default V1 call contains neither `fork_context` nor `fork_turns`. Optional V1 profile/model/reasoning/fork fields are used only when exposed by the callable V1 schema.
- V2 is normally flat, has no stable namespace guarantee, and never receives `fork_context`.
- Use `fork_turns: none` only when the callable schema exposes `fork_turns`; if hidden, omit it.
- `task_name` never selects a profile.
- Call `create_goal` only when a user, system, or developer instruction explicitly requests runtime goal creation.
- Prompt guidance may degrade safely but must not guarantee feature, profile, model, skill, or context activation.
- Do not modify any file under `prompts/**` or source `skills/**`; `docs/v1-maintenance.md` remains unchanged under the repository's reciprocal v1 sync rule because this task changes neither source prompts nor source skills. Do not add prompt validation or review-cadence policy.
- Do not modify OpenCode routing, hooks, config, schema, `schema.json`, package dependencies, or generator entry scripts.
- Generated files are never hand-edited. Run `pnpm run build:ts` and then `pnpm run gen:codex-plugin`.
- Do not install or upgrade software.
- Do not perform a Git write without separate explicit user authorization.
- Preserve all unrelated dirty paths and never stage them. The task-owned change is exactly 62 paths: four source/test/spec/plan artifacts plus 58 generated files.

**Approved spec:** `docs/superpowers/specs/2026-07-20-codex-runtime-compatibility-design.md`

---

## File Map

### Authoritative source, test, and documentation

| File | Action | Responsibility |
|---|---|---|
| `src/codex/plugin-generator.ts:458-739` | Modify | Add shared renderers and integrate workflow, agent, and normalized-skill compatibility surfaces |
| `src/codex/plugin-generator.test.ts:79-164,275-361,534-784` | Modify | Parse actual generated TOMLs, inspect every generated surface, reject legacy contracts, and update stale assertions |
| `docs/superpowers/specs/2026-07-20-codex-runtime-compatibility-design.md` | Modify | Reviewed design authority |
| `docs/superpowers/plans/2026-07-20-codex-runtime-compatibility.md` | Modify | Executable implementation authority |

### Generated agent profiles

Regenerate each of these 22 names in both `.codex/agents/` and `plugins/deepwork/agents/`, for 44 files:

```text
dw-builder
dw-clarifier
dw-code-search
dw-coding
dw-complex
dw-creative
dw-deep
dw-doc-search
dw-documenting
dw-explore
dw-frontend
dw-hard-reasoning
dw-media-reader
dw-normal-task
dw-oracle
dw-oracle-2nd
dw-orchestrator
dw-plan-critic
dw-planner
dw-quick
dw-research
dw-reviewer
```

Each TOML changes only because `developer_instructions` receives the shared callable-dispatch contract. Matching project and plugin TOMLs must remain byte-identical.

### Generated skills

Regenerate these 14 files:

```text
plugins/deepwork/skills/ast-grep/SKILL.md
plugins/deepwork/skills/debugging/SKILL.md
plugins/deepwork/skills/deepwork-brainstorming/SKILL.md
plugins/deepwork/skills/deepwork-dispatching-parallel-agents/SKILL.md
plugins/deepwork/skills/deepwork-receiving-code-review/SKILL.md
plugins/deepwork/skills/deepwork-requesting-code-review/SKILL.md
plugins/deepwork/skills/deepwork-subagent-driven-development/SKILL.md
plugins/deepwork/skills/deepwork-writing-plans/SKILL.md
plugins/deepwork/skills/frontend/SKILL.md
plugins/deepwork/skills/git-master/SKILL.md
plugins/deepwork/skills/init-deep/SKILL.md
plugins/deepwork/skills/remove-ai-slops/SKILL.md
plugins/deepwork/skills/using-git-worktrees/SKILL.md
plugins/deepwork/skills/deepwork/SKILL.md
```

The first 13 receive the contract through `normalizeSkillForCodex()`; the last is rendered by `renderWorkflowSkill()`.

`.agents/plugins/marketplace.json`, plugin manifests, package metadata, plugin README, skill auxiliary files, and tracked runtime files are regenerated verification surfaces but must remain byte-identical.

## New and Modified Interfaces

```typescript
// New, module-private: exact three-line generic envelope.
function renderCodexGenericDelegationEnvelope(): string

// New, module-private: shared section embedded byte-for-byte in all three surfaces.
function renderCodexDispatchCompatibility(): string

// New, module-private: workflow wrapper around the shared section.
function renderCodexRuntimeCompatibility(): string

// Existing, modified to consume renderCodexRuntimeCompatibility().
function renderWorkflowSkill(config: OcmmConfig, agents: readonly CodexAgentSpec[]): string

// Existing, modified to consume renderCodexDispatchCompatibility().
function codexAgentInstructions(args: {
  sourceName: string
  prompt: string
  workflow: OcmmConfig["workflow"]
  preferredChain: readonly string[]
  brainstormingSkill: string
}): string

// Existing, modified to ensure the shared section exists exactly once.
function normalizeSkillForCodex(skillDir: string, name?: string): void
```

No exported API changes.

## Requirement Coverage

| Requirement | Plan evidence |
|---|---|
| Three generator surfaces | Task 1 reads actual workflow, all agent TOMLs, and all normalized skills; Task 2 integrates all three functions |
| One canonical envelope | Task 1 equality/negative assertions; Task 2 shared renderer |
| Complete direct composition and composition-only reporting | Task 1 positive completeness/reporting assertions; Task 2 exact shared prose |
| V1 `model` and exact `reasoning`/`reasoning_effort` are schema-gated | Task 1 positive field-gate assertions plus default/example negative assertions; Task 2 exact shared prose |
| V2 maps four flat tools without invented namespace/parameters | Task 1 mapping/schema assertions plus namespace/parameter negative assertions; Task 2 exact shared prose |
| Conditional `fork_turns: none` | Task 1 positive conditional and no-call assertions; Task 2 exact prose |
| No old generic conflict | Tasks 1 and 3 reject exact legacy sequences and remove stale tests |
| `create_goal` explicit only | Tasks 1-2 shared-contract assertion/text |
| Generated diff and one commit | Tasks 3-4 verify 58 generated and 62 total paths |
| No prompt cadence changes | Global constraints and Task 4 scope audit |

## Execution and Commit Boundaries

1. Task 1 adds one actual-bundle RED test and its parsing/assertion helpers.
2. Task 2 implements the shared contract in all three generator paths and turns the new test GREEN.
3. Task 3 removes stale acceptance assertions, regenerates exactly 58 files, and proves deterministic output.
4. Task 4 runs repository-wide acceptance and prepares one exact 62-path commit only after separate authorization.
5. No intermediate commit is permitted because any partial change leaves generated runtime surfaces contradictory.

---

### Task 1: Add an actual generated-bundle RED contract test

**Files:**
- Modify: `src/codex/plugin-generator.test.ts:79-164`, after `assertCompactGpt56Calibration`
- Modify: `src/codex/plugin-generator.test.ts`, after the existing self-contained bundle test
- Test: `src/codex/plugin-generator.test.ts`

**Interfaces:**
- Consumes: `generateCodexPlugin(options)`, generated TOML strings created by `tomlString()`, and generated `SKILL.md` files.
- Produces: parsing helpers plus one test named `generated Codex bundle shares one callable-schema contract across workflow, agents, and normalized skills`.

- [ ] **Step 1: Confirm no task-owned implementation path has a pre-existing change**

Run:

```powershell
git status --short
```

Expected: the reviewed spec and plan may be untracked or modified, and unrelated concurrent documents may exist, but `src/codex/plugin-generator.ts`, `src/codex/plugin-generator.test.ts`, `.codex/agents/**`, and `plugins/deepwork/**` are clean. If any implementation/generated path already changed, stop and reconcile ownership. Record and preserve every unrelated dirty path.

- [ ] **Step 2: Import directory enumeration and add exact test helpers**

Add `readdirSync` to the existing `node:fs` import. After `assertCompactGpt56Calibration`, add:

```typescript
const LEGACY_CODEX_GENERIC_CONTRACTS = [
  /TASK, ROLE, DELIVERABLE, SCOPE, VERIFY, REQUIRED SKILLS, CONTEXT, and CONSTRAINTS/,
  /`TASK`, `ROLE`, `DELIVERABLE`, `SCOPE`, `VERIFY`, `REQUIRED SKILLS`, `CONTEXT`, and `CONSTRAINTS`/,
  /`TASK:`.*imperative, bounded assignment/,
  /`DELIVERABLE:`.*concrete expected output/,
  /`VERIFY:`.*test, evidence, or observable result/,
] as const

function parseGeneratedDeveloperInstructions(toml: string, label: string): string {
  const match = toml.match(/^developer_instructions = (".*")$/m)
  assert.ok(match, `${label} is missing developer_instructions`)
  const parsed = JSON.parse(match[1]!) as unknown
  assert.equal(typeof parsed, "string", `${label} developer_instructions must decode to a string`)
  return parsed as string
}

function extractCallableDispatchContract(text: string, label: string): string {
  const marker = "### Callable Dispatch Contract"
  const start = text.indexOf(marker)
  assert.notEqual(start, -1, `${label} is missing ${marker}`)
  const possibleEnds = [
    text.indexOf("\n## ", start + marker.length),
    text.indexOf("\n### Generated profile references", start + marker.length),
    text.indexOf("\nOrdered Oracle review semantics:", start + marker.length),
  ].filter((index) => index !== -1)
  const end = possibleEnds.length > 0 ? Math.min(...possibleEnds) : text.length
  return text.slice(start, end).trimEnd()
}

function assertCanonicalCodexDispatchContract(contract: string, label: string): void {
  assert.match(contract, /current callable dispatch-tool schema is the only authority/i, `${label} schema authority`)
  assert.match(contract, /Only call `create_goal`.*user, system, or developer.*explicitly requests/is, `${label} create_goal gate`)
  assert.match(
    contract,
    /1\. \*\*Exact profile\*\*[\s\S]*2\. \*\*Direct composition\*\*[\s\S]*3\. \*\*V1\/V2 generic or flat dispatch\*\*[\s\S]*4\. \*\*Local execution\*\*/,
    `${label} route order`,
  )
  assert.match(
    contract,
    /2\. \*\*Direct composition\*\* — use only when the current callable schema exposes every model field required by the role, the schema-exact `reasoning` or `reasoning_effort` field when the role requires reasoning, the role's full system\/developer instructions, and all required skills/,
    `${label} direct-composition completeness`,
  )
  assert.match(
    contract,
    /Report this route as composition, not exact-profile selection/,
    `${label} direct-composition reporting`,
  )

  const v1Default = contract.match(/multi_agent_v1\.spawn_agent\(agent_type="dw-plan-critic", message="Review the saved implementation plan and return one current-revision verdict\."\)/)
  assert.ok(v1Default, `${label} is missing the default V1 exact-profile call`)
  assert.doesNotMatch(v1Default[0], /model|reasoning|fork_context|fork_turns/, `${label} default V1 call must omit optional fields`)
  assert.doesNotMatch(
    contract,
    /multi_agent_v1\.spawn_agent\([^)]*(?:model|reasoning|fork_context|fork_turns)/,
    `${label} contains a V1 example with unproven optional fields`,
  )
  assert.match(contract, /V1 may send `model` only when the current callable schema exposes `model`/, `${label} V1 model gate`)
  assert.match(
    contract,
    /V1 may send exactly the schema-named `reasoning` or `reasoning_effort` field only when that exact field is exposed/,
    `${label} V1 reasoning gate`,
  )
  assert.match(contract, /If either field is hidden, omit it; never send both reasoning spellings/, `${label} V1 hidden optional fields`)
  assert.match(contract, /V1 may add `fork_context` only when the callable V1 schema exposes it/is, `${label} V1 fork gate`)

  assert.match(
    contract,
    /V2-style flat dispatch uses `spawn_agent` to create, `wait_agent` to await, `followup_task` to continue, and `interrupt_agent` to stop/,
    `${label} V2 flat tool mapping`,
  )
  assert.match(
    contract,
    /Use each flat tool only when it is present in the current callable schema and pass only parameters exposed by that tool's schema/,
    `${label} V2 callable-schema gate`,
  )
  assert.match(contract, /V2-style flat tools never receive `fork_context`/, `${label} V2 fork prohibition`)
  assert.doesNotMatch(contract, /multi_agent_v2\.(?:spawn_agent|wait_agent|followup_task|interrupt_agent)/, `${label} stable V2 namespace claim`)
  assert.doesNotMatch(
    contract,
    /(?<!multi_agent_v1\.)(?:multi_agent_v2\.)?(?:spawn_agent|wait_agent|followup_task|interrupt_agent)\([^)]*(?:agent_type|model|reasoning|fork_context|fork_turns)/,
    `${label} contains a V2-flat example with invented parameters`,
  )
  assert.match(contract, /Never synthesize a namespace, copy parameters between tools, or add hidden parameters/, `${label} V2 hidden-parameter prohibition`)
  assert.match(contract, /Only when the callable schema exposes `fork_turns` may the agent use `fork_turns: none`/is, `${label} fork_turns gate`)
  assert.match(contract, /If `fork_turns` is hidden, omit it/, `${label} hidden fork_turns`)
  assert.doesNotMatch(contract, /spawn_agent\([^)]*fork_turns/, `${label} unconditional fork_turns call`)

  for (const field of ["GOAL", "STOP WHEN", "EVIDENCE"]) {
    assert.match(contract, new RegExp("`" + field + ":`"), `${label} generic envelope is missing ${field}`)
  }
  for (const legacy of LEGACY_CODEX_GENERIC_CONTRACTS) {
    assert.doesNotMatch(contract, legacy, `${label} retains ${legacy}`)
  }
  assert.match(contract, /`task_name`.*not a profile selector/is, `${label} task_name disclaimer`)
  assert.match(contract, /does not load a profile, select a model, attach a skill, or enable a missing feature/, `${label} generic disclaimer`)
}
```

- [ ] **Step 3: Add the failing actual-bundle consistency test**

Add:

```typescript
test("generated Codex bundle shares one callable-schema contract across workflow, agents, and normalized skills", async () => {
  const root = mkdtempSync(join(tmpdir(), "deepwork-codex-runtime-contract-"))
  try {
    const result = await generateCodexPlugin({
      projectRoot: process.cwd(),
      pluginRoot: join(root, "plugins", "deepwork"),
      marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
      projectAgentsRoot: join(root, CODEX_PROJECT_AGENTS_DIR),
      config: { ...defaultConfig(), workflow: "codex" },
      packageVersion: "9.9.9",
    })

    const workflowSkill = readFileSync(
      join(result.pluginRoot, "skills", CODEX_WORKFLOW_SKILL_NAME, "SKILL.md"),
      "utf8",
    )
    const canonical = extractCallableDispatchContract(workflowSkill, "workflow skill")
    assertCanonicalCodexDispatchContract(canonical, "workflow skill")

    const projectAgentsRoot = result.projectAgentsRoot
    assert.ok(projectAgentsRoot)
    const bundledAgentsRoot = join(result.pluginRoot, "agents")
    const agentFiles = readdirSync(bundledAgentsRoot).filter((name) => name.endsWith(".toml")).sort()
    assert.equal(agentFiles.length, result.agentCount)
    for (const file of agentFiles) {
      const bundled = readFileSync(join(bundledAgentsRoot, file), "utf8")
      const project = readFileSync(join(projectAgentsRoot, file), "utf8")
      assert.equal(project, bundled, `${file} project/plugin copies differ`)
      const instructions = parseGeneratedDeveloperInstructions(bundled, file)
      const contract = extractCallableDispatchContract(instructions, file)
      assert.equal(contract, canonical, `${file} dispatch contract differs from workflow skill`)
      for (const legacy of LEGACY_CODEX_GENERIC_CONTRACTS) {
        assert.doesNotMatch(instructions, legacy, `${file} retains ${legacy}`)
      }
    }

    const skillsRoot = join(result.pluginRoot, "skills")
    const normalizedSkillNames = readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== CODEX_WORKFLOW_SKILL_NAME)
      .map((entry) => entry.name)
      .sort()
    assert.equal(normalizedSkillNames.length, result.skillCount - 1)
    for (const name of normalizedSkillNames) {
      const skill = readFileSync(join(skillsRoot, name, "SKILL.md"), "utf8")
      assert.match(skill, /## Codex Compatibility/, `${name} compatibility heading`)
      const contract = extractCallableDispatchContract(skill, `${name} normalized skill`)
      assert.equal(contract, canonical, `${name} dispatch contract differs from workflow skill`)
      for (const legacy of LEGACY_CODEX_GENERIC_CONTRACTS) {
        assert.doesNotMatch(skill, legacy, `${name} retains ${legacy}`)
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 4: Run the named test and verify RED**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="generated Codex bundle shares one callable-schema contract" src/codex/plugin-generator.test.ts
```

Expected: non-zero exit because no generated surface contains `### Callable Dispatch Contract`, and current agent/normalized-skill output still contains the legacy envelope.

---

### Task 2: Implement one shared contract across all three generator paths

**Files:**
- Modify: `src/codex/plugin-generator.ts:458-506,509-552,623-664,726-741`
- Test: `src/codex/plugin-generator.test.ts`

**Interfaces:**
- Consumes: `CODEX_AGENT_PREFIX`, existing workflow composition, existing agent prompt composition, and copied skill text.
- Produces: the three new private renderers and byte-identical shared sections in every generated compatibility surface.

- [ ] **Step 1: Add the canonical envelope and shared dispatch renderer before `renderWorkflowSkill()`**

Add:

```typescript
function renderCodexGenericDelegationEnvelope(): string {
  return [
    "`GOAL:` State one imperative, bounded outcome, including the role, scope, constraints, and required work.",
    "`STOP WHEN:` State the exact completion condition and non-goal boundary.",
    "`EVIDENCE:` State the paths, commands, outputs, or observations that prove completion.",
  ].join("\n")
}

function renderCodexDispatchCompatibility(): string {
  return `### Callable Dispatch Contract

The current callable dispatch-tool schema is the only authority for tool availability and accepted fields. Names and examples are compatibility hints, not proof that a feature exists. Omit every field hidden by the current schema.

Compatibility routing never widens the active role's delegation permissions, target allowlist, or workflow ownership.

- Only call \`create_goal\` when a user, system, or developer instruction explicitly requests runtime goal creation. Ordinary workflow activation, planning, delegation, or a \`GOAL:\` message line does not request a \`create_goal\` call.
- Use the first complete callable route:
  1. **Exact profile** — use \`agent_type\`, \`agent_path\`, \`agent_nickname\`, or another selector only when the callable schema explicitly guarantees that it selects the generated \`${CODEX_AGENT_PREFIX}-*\` profile.
  2. **Direct composition** — use only when the current callable schema exposes every model field required by the role, the schema-exact \`reasoning\` or \`reasoning_effort\` field when the role requires reasoning, the role's full system/developer instructions, and all required skills. Report this route as composition, not exact-profile selection.
  3. **V1/V2 generic or flat dispatch** — send the canonical envelope below through the actual message field. The child keeps inherited/default runtime behavior unless a valid override is exposed.
  4. **Local execution** — use only when no callable native subagent-dispatch route exists.
- The default V1 exact-profile example is \`multi_agent_v1.spawn_agent(agent_type="${CODEX_AGENT_PREFIX}-plan-critic", message="Review the saved implementation plan and return one current-revision verdict.")\`. V1 may send \`model\` only when the current callable schema exposes \`model\`. V1 may send exactly the schema-named \`reasoning\` or \`reasoning_effort\` field only when that exact field is exposed. If either field is hidden, omit it; never send both reasoning spellings. V1 may add \`fork_context\` only when the callable V1 schema exposes it and an explicit context-inheritance decision requires it.
- V2-style flat dispatch uses \`spawn_agent\` to create, \`wait_agent\` to await, \`followup_task\` to continue, and \`interrupt_agent\` to stop. Use each flat tool only when it is present in the current callable schema and pass only parameters exposed by that tool's schema. V2-style flat tools never receive \`fork_context\`. There is no stable \`multi_agent_v2\` namespace contract. Never synthesize a namespace, copy parameters between tools, or add hidden parameters.
- Only when the callable schema exposes \`fork_turns\` may the agent use \`fork_turns: none\` for no context. If \`fork_turns\` is hidden, omit it. Use another documented value only for explicit branch-style exploration.
- A \`task_name\` is task identity, not a profile selector. Do not pass \`${CODEX_AGENT_PREFIX}-*.toml\` registry artifacts as prompt, item, or skill attachments.
- Canonical generic envelope:

${renderCodexGenericDelegationEnvelope()}

This envelope carries instructions only; it does not load a profile, select a model, attach a skill, or enable a missing feature.`
}

function renderCodexRuntimeCompatibility(): string {
  return `## Runtime Controls

${renderCodexDispatchCompatibility()}

### Generated profile references

- \`[@${CODEX_AGENT_PREFIX}-*](subagent://${CODEX_AGENT_PREFIX}-*)\` is a profile reference, not a spawn action.
- Plan review profile: \`[@${CODEX_AGENT_PREFIX}-plan-critic](subagent://${CODEX_AGENT_PREFIX}-plan-critic)\`.
- Code/work review profile: \`[@${CODEX_AGENT_PREFIX}-reviewer](subagent://${CODEX_AGENT_PREFIX}-reviewer)\`.
- Ordered Oracle review profiles: \`[@${CODEX_AGENT_PREFIX}-oracle](subagent://${CODEX_AGENT_PREFIX}-oracle)\` first, then \`[@${CODEX_AGENT_PREFIX}-oracle-2nd](subagent://${CODEX_AGENT_PREFIX}-oracle-2nd)\` through configured later slots only when additional independent evidence is explicitly needed.

If an exact selector returns \`unknown agent_type\`, use complete direct composition when available, otherwise generic dispatch. If no native route is callable, execute locally within the active role's permissions.`
}
```

- [ ] **Step 2: Replace the workflow skill's standalone legacy delegation block**

In `renderWorkflowSkill()`, keep `## Runtime Mapping`, `## Workflow`, `## Generated Agents`, runtime model selection, and review guidance. Delete the existing block from `## Delegation` through the paragraph ending with “restoring exact-profile delegation is itself in scope.” Immediately after workflow step 4, interpolate:

```typescript
${renderCodexRuntimeCompatibility()}

## Generated Agents
```

The resulting workflow output must contain the shared `### Callable Dispatch Contract` exactly once.

- [ ] **Step 3: Replace the agent hard-gate's duplicated legacy contract**

In the array returned by `codexAgentInstructions(args)`, replace the three strings beginning with `The current callable dispatch-tool schema is authoritative`, `Compatibility routing applies`, and `When delegation is permitted` with:

```typescript
    renderCodexDispatchCompatibility(),
```

Keep `## Subagent Dispatch Compatibility (HARD-GATE)` immediately before it and `Ordered Oracle review semantics:` immediately after it. This placement keeps the shared compatibility section later than `Original Deepwork prompt`, so it governs stale examples without modifying source prompts.

- [ ] **Step 4: Make normalized skills ensure the shared section exactly once**

Replace the current `if (!text.includes("## Codex Compatibility"))` block in `normalizeSkillForCodex()` with:

```typescript
  if (!text.includes("## Codex Compatibility")) {
    text = `${text.trimEnd()}\n\n## Codex Compatibility\n\n- When this skill mentions TodoWrite, use Codex \`update_plan\`.\n- When this skill mentions OpenCode \`task(...)\`, preserve the task contract and use only a callable Codex dispatch route.\n- When this skill mentions OpenCode-specific tool names, choose the nearest callable Codex tool with the same intent.\n`
  }
  if (!text.includes("### Callable Dispatch Contract")) {
    text = `${text.trimEnd()}\n\n${renderCodexDispatchCompatibility()}\n`
  }
```

Do not change frontmatter cleanup, optional skill renaming, metadata sanitization, or source skill files.

- [ ] **Step 5: Run the actual-bundle test and verify GREEN**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="generated Codex bundle shares one callable-schema contract" src/codex/plugin-generator.test.ts
```

Expected: the named test passes for the actual workflow skill, all generated agent instructions, and every normalized skill.

- [ ] **Step 6: Run the complete generator test file to expose stale assertions**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/codex/plugin-generator.test.ts
```

Expected: the new consistency test passes. Any remaining failures are limited to existing assertions that still require old compatibility wording; Task 3 replaces those assertions before regeneration.

---

### Task 3: Correct stale assertions and regenerate 58 files

**Files:**
- Modify: `src/codex/plugin-generator.test.ts:275-361,534-784`
- Regenerate: 44 agent TOMLs and 14 generated `SKILL.md` files listed in the File Map
- Regenerate and verify unchanged: all other generator-owned tracked outputs

**Interfaces:**
- Consumes: the shared renderer from Task 2 and existing bundle tests.
- Produces: no test that accepts the legacy canonical envelope and an exact deterministic 58-file generated delta.

- [ ] **Step 1: Update the in-memory generated-agent assertions**

In `Codex agents are generated from Deepwork prompts and Codex-compatible fallback models`, after `assert.ok(orchestrator)`, add:

```typescript
  const orchestratorContract = extractCallableDispatchContract(
    orchestrator.developerInstructions,
    "in-memory orchestrator",
  )
  assertCanonicalCodexDispatchContract(orchestratorContract, "in-memory orchestrator")
  for (const legacy of LEGACY_CODEX_GENERIC_CONTRACTS) {
    assert.doesNotMatch(orchestrator.developerInstructions, legacy, `in-memory orchestrator retains ${legacy}`)
  }
```

Retain model, reasoning, role-prompt, compression, and delegation-boundary assertions.

Replace the stale planner assertion for `Compatibility routing applies only after the effective delegation contract permits delegation` with:

```typescript
  assert.match(
    planner.developerInstructions,
    /Compatibility routing never widens the active role's delegation permissions, target allowlist, or workflow ownership/,
  )
```

- [ ] **Step 2: Replace old actual-bundle assertions rather than preserving them**

In `generateCodexPlugin writes a self-contained bundle`:

1. Delete the `orchestrator` assertion requiring `TASK, ROLE, DELIVERABLE, SCOPE, VERIFY, REQUIRED SKILLS, CONTEXT, and CONSTRAINTS`.
2. Delete the `orchestrator` assertion requiring `MultiAgent V1/V2 names and examples elsewhere are lower-priority compatibility examples`; schema authority is asserted by the canonical-contract helper instead.
3. Delete the contiguous `workflowSkill` compatibility assertion block beginning with `Do not pass \`dw-*\.toml\` files` and ending with `generic or flat subagent does not load the generated profile`. Keep the preceding profile-link/Oracle assertions and the following GPT-5.6/model/review assertions.
4. Replace the final generated `planner` assertion for `Compatibility routing applies only after the effective delegation contract permits delegation` with:

```typescript
    assert.match(
      planner,
      /Compatibility routing never widens the active role's delegation permissions, target allowlist, or workflow ownership/,
    )
```

5. Add this exact group after reading generated files:

```typescript
    const generatedAgentInstructions = parseGeneratedDeveloperInstructions(orchestrator, "generated orchestrator TOML")
    const agentContract = extractCallableDispatchContract(generatedAgentInstructions, "generated orchestrator TOML")
    const workflowContract = extractCallableDispatchContract(workflowSkill, "generated workflow skill")
    const normalizedWritingPlanContract = extractCallableDispatchContract(deepworkSkill, "normalized writing-plans skill")
    const normalizedFrontendContract = extractCallableDispatchContract(frontendSkill, "normalized frontend skill")

    for (const [label, contract] of [
      ["generated workflow skill", workflowContract],
      ["generated orchestrator TOML", agentContract],
      ["normalized writing-plans skill", normalizedWritingPlanContract],
      ["normalized frontend skill", normalizedFrontendContract],
    ] as const) {
      assert.equal(contract, workflowContract, `${label} compatibility drift`)
      assertCanonicalCodexDispatchContract(contract, label)
    }
    for (const [label, surface] of [
      ["generated workflow skill", workflowSkill],
      ["generated orchestrator TOML", generatedAgentInstructions],
      ["normalized writing-plans skill", deepworkSkill],
      ["normalized frontend skill", frontendSkill],
    ] as const) {
      for (const legacy of LEGACY_CODEX_GENERIC_CONTRACTS) {
        assert.doesNotMatch(surface, legacy, `${label} retains ${legacy}`)
      }
    }
```

Keep unrelated generated-agent, Oracle ordering, model selection, copied skill content, MCP, frontmatter, and metadata assertions.

- [ ] **Step 3: Run the complete generator test file and verify GREEN**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/codex/plugin-generator.test.ts
```

Expected: every test passes; no assertion accepts the old generic envelope.

- [ ] **Step 4: Build TypeScript and generate the bundle**

Run:

```powershell
pnpm run build:ts
pnpm run gen:codex-plugin
```

Expected: TypeScript compilation succeeds, then the generator prints the plugin, project-agent, and marketplace output paths.

- [ ] **Step 5: Prove the generated delta is exactly the expected 58 files**

Run this PowerShell block from the repository root:

```powershell
& {
  $agentNames = @(
    "dw-builder", "dw-clarifier", "dw-code-search", "dw-coding", "dw-complex", "dw-creative",
    "dw-deep", "dw-doc-search", "dw-documenting", "dw-explore", "dw-frontend", "dw-hard-reasoning",
    "dw-media-reader", "dw-normal-task", "dw-oracle", "dw-oracle-2nd", "dw-orchestrator",
    "dw-plan-critic", "dw-planner", "dw-quick", "dw-research", "dw-reviewer"
  )
  $skillPaths = @(
    "plugins/deepwork/skills/ast-grep/SKILL.md",
    "plugins/deepwork/skills/debugging/SKILL.md",
    "plugins/deepwork/skills/deepwork-brainstorming/SKILL.md",
    "plugins/deepwork/skills/deepwork-dispatching-parallel-agents/SKILL.md",
    "plugins/deepwork/skills/deepwork-receiving-code-review/SKILL.md",
    "plugins/deepwork/skills/deepwork-requesting-code-review/SKILL.md",
    "plugins/deepwork/skills/deepwork-subagent-driven-development/SKILL.md",
    "plugins/deepwork/skills/deepwork-writing-plans/SKILL.md",
    "plugins/deepwork/skills/frontend/SKILL.md",
    "plugins/deepwork/skills/git-master/SKILL.md",
    "plugins/deepwork/skills/init-deep/SKILL.md",
    "plugins/deepwork/skills/remove-ai-slops/SKILL.md",
    "plugins/deepwork/skills/using-git-worktrees/SKILL.md",
    "plugins/deepwork/skills/deepwork/SKILL.md"
  )
  $expected = @($agentNames | ForEach-Object { ".codex/agents/$_.toml" }) +
    @($agentNames | ForEach-Object { "plugins/deepwork/agents/$_.toml" }) + $skillPaths
  $actual = @(git diff --name-only -- .codex/agents plugins/deepwork)
  if ($LASTEXITCODE -ne 0) { throw "generated diff query failed with exit code $LASTEXITCODE" }
  $difference = Compare-Object ($expected | Sort-Object) ($actual | Sort-Object)
  if ($difference) { throw ($difference | Format-Table | Out-String) }
  if ($actual.Count -ne 58) { throw "expected 58 generated files, found $($actual.Count)" }
}
```

Expected: no comparison output and an actual generated-file count of 58. Any extra or missing path is a blocker; do not hand-edit generated files.

- [ ] **Step 6: Prove deterministic regeneration across all 58 files**

Run:

```powershell
& {
  $generated = @(git diff --name-only -- .codex/agents plugins/deepwork)
  if ($LASTEXITCODE -ne 0) { throw "generated path query failed with exit code $LASTEXITCODE" }
  $before = @{}
  foreach ($path in $generated) { $before[$path] = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash }
  pnpm run gen:codex-plugin
  if ($LASTEXITCODE -ne 0) { throw "second Codex generation failed with exit code $LASTEXITCODE" }
  foreach ($path in $generated) {
    $after = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash
    if ($before[$path] -ne $after) { throw "non-deterministic generated file: $path" }
  }
}
```

Expected: second generation exits zero and every generated SHA-256 remains unchanged.

---

### Task 4: Run full acceptance and prepare the exact 62-path single-commit handoff

**Files:**
- Verify: all 62 task-owned paths
- Inspect only: repository status, diff, generated artifacts, and source prompt/skill roots

**Interfaces:**
- Consumes: green source/test/doc/generated work from Tasks 1-3.
- Produces: complete verification evidence, a 62-path staging allowlist, and receipt status `waiting for receipt`.

- [ ] **Step 1: Run targeted tests, typecheck, full tests, and build**

Run each command separately and stop on the first failure:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/codex/plugin-generator.test.ts
pnpm run typecheck
pnpm test
pnpm run build
```

Expected:

- all Codex generator tests pass;
- `tsc --noEmit` reports no diagnostics;
- all Node and Cargo tests pass;
- TypeScript and Rust release builds succeed.

- [ ] **Step 2: Regenerate after the final build and rerun the actual-surface test**

Run:

```powershell
pnpm run gen:codex-plugin
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="generated Codex bundle shares one callable-schema contract" src/codex/plugin-generator.test.ts
```

Expected: generation succeeds and the actual generated-surface test passes after the final build.

- [ ] **Step 3: Probe all three real generated surfaces**

Run:

```powershell
rg -l '### Callable Dispatch Contract' "plugins/deepwork/skills/deepwork/SKILL.md" "plugins/deepwork/agents" ".codex/agents" "plugins/deepwork/skills"
rg -n 'Direct composition.*every model field required by the role.*schema-exact `reasoning` or `reasoning_effort`.*full system/developer instructions.*all required skills|Report this route as composition, not exact-profile selection|multi_agent_v1\.spawn_agent\(agent_type="dw-plan-critic", message=|V1 may send `model` only when|schema-named `reasoning` or `reasoning_effort`|`spawn_agent` to create.*`wait_agent` to await.*`followup_task` to continue.*`interrupt_agent` to stop|V2-style flat tools never receive `fork_context`|Only when the callable schema exposes `fork_turns`|`GOAL:`|`STOP WHEN:`|`EVIDENCE:`' "plugins/deepwork/skills/deepwork/SKILL.md"
```

Expected: the contract marker appears in the workflow skill, all 44 generated agent TOMLs, and all 13 normalized skills; the workflow probe prints every required runtime anchor. These are generated-artifact checks, not claims that a live runtime exposes the tools.

- [ ] **Step 4: Reject legacy generated compatibility contracts**

Run:

```powershell
rg -n 'TASK, ROLE, DELIVERABLE, SCOPE, VERIFY, REQUIRED SKILLS, CONTEXT, and CONSTRAINTS|`TASK`, `ROLE`, `DELIVERABLE`, `SCOPE`, `VERIFY`, `REQUIRED SKILLS`, `CONTEXT`, and `CONSTRAINTS`|`TASK:`.*imperative, bounded assignment|`DELIVERABLE:`.*concrete expected output|`VERIFY:`.*test, evidence, or observable result' "plugins/deepwork/skills/deepwork/SKILL.md" "plugins/deepwork/agents" ".codex/agents" "plugins/deepwork/skills"
```

Expected: no matches. If a source prompt later contains unrelated task-format prose, narrow the inspection to the generated `### Callable Dispatch Contract` block and verify the later hard-gate remains canonical; do not edit source prompts as part of this task.

- [ ] **Step 5: Audit scope and document completeness**

Run:

```powershell
git status --short
git diff --check
git diff --name-only -- prompts skills schema.json package.json docs/v1-maintenance.md
rg -n "T[B]D|T[O]DO|implement[ ]later|similar[ ]to[ ]above" "docs/superpowers/specs/2026-07-20-codex-runtime-compatibility-design.md" "docs/superpowers/plans/2026-07-20-codex-runtime-compatibility.md"
```

Expected:

- `git diff --check` exits zero;
- no tracked file under `prompts/**`, source `skills/**`, `schema.json`, or `package.json` changed;
- the placeholder search returns no matches;
- unrelated dirty paths retain their baseline status and remain unstaged.

- [ ] **Step 6: Prepare the exact 62-path commit boundary without executing it**

Only after explicit user authorization, construct and verify the staging list with:

```powershell
& {
  $agentNames = @(
    "dw-builder", "dw-clarifier", "dw-code-search", "dw-coding", "dw-complex", "dw-creative",
    "dw-deep", "dw-doc-search", "dw-documenting", "dw-explore", "dw-frontend", "dw-hard-reasoning",
    "dw-media-reader", "dw-normal-task", "dw-oracle", "dw-oracle-2nd", "dw-orchestrator",
    "dw-plan-critic", "dw-planner", "dw-quick", "dw-research", "dw-reviewer"
  )
  $skillPaths = @(
    "plugins/deepwork/skills/ast-grep/SKILL.md",
    "plugins/deepwork/skills/debugging/SKILL.md",
    "plugins/deepwork/skills/deepwork-brainstorming/SKILL.md",
    "plugins/deepwork/skills/deepwork-dispatching-parallel-agents/SKILL.md",
    "plugins/deepwork/skills/deepwork-receiving-code-review/SKILL.md",
    "plugins/deepwork/skills/deepwork-requesting-code-review/SKILL.md",
    "plugins/deepwork/skills/deepwork-subagent-driven-development/SKILL.md",
    "plugins/deepwork/skills/deepwork-writing-plans/SKILL.md",
    "plugins/deepwork/skills/frontend/SKILL.md",
    "plugins/deepwork/skills/git-master/SKILL.md",
    "plugins/deepwork/skills/init-deep/SKILL.md",
    "plugins/deepwork/skills/remove-ai-slops/SKILL.md",
    "plugins/deepwork/skills/using-git-worktrees/SKILL.md",
    "plugins/deepwork/skills/deepwork/SKILL.md"
  )
  $paths = @(
    "docs/superpowers/specs/2026-07-20-codex-runtime-compatibility-design.md",
    "docs/superpowers/plans/2026-07-20-codex-runtime-compatibility.md",
    "src/codex/plugin-generator.ts",
    "src/codex/plugin-generator.test.ts"
  ) + @($agentNames | ForEach-Object { ".codex/agents/$_.toml" }) +
    @($agentNames | ForEach-Object { "plugins/deepwork/agents/$_.toml" }) + $skillPaths
  if ($paths.Count -ne 62) { throw "expected 62 task-owned paths, found $($paths.Count)" }
  git add -- $paths
  if ($LASTEXITCODE -ne 0) { throw "staging failed with exit code $LASTEXITCODE" }
  $staged = @(git diff --staged --name-only)
  if ($LASTEXITCODE -ne 0) { throw "staged path query failed with exit code $LASTEXITCODE" }
  $difference = Compare-Object ($paths | Sort-Object) ($staged | Sort-Object)
  if ($difference) { throw ($difference | Format-Table | Out-String) }
  git diff --staged --check
  if ($LASTEXITCODE -ne 0) { throw "staged whitespace check failed with exit code $LASTEXITCODE" }
  git diff --staged --stat
}
```

After that audit, the authorized commit command is:

```powershell
git commit -m "fix(codex): unify runtime delegation compatibility" -m "Share one callable-schema contract across generated workflow, agent, and normalized-skill surfaces. Replace the legacy generic envelope, gate fork parameters, and add actual-bundle consistency tests."
```

Expected after authorization: one semantic commit containing exactly 62 paths. Without authorization, leave every task file uncommitted.

## Self-Review Record

- Spec coverage: both plan-critic blockers map to Tasks 1-3 and generated-output verification.
- Placeholder scan: no incomplete requirement or implementation placeholder remains.
- Type consistency: all three existing generator functions consume the same private `renderCodexDispatchCompatibility(): string` output.
- Surface consistency: tests read actual generated workflow, decoded TOML developer instructions, project/bundle TOML copies, and every normalized skill.
- Negative coverage: tests reject V1 default/example optional fields without schema proof, V2 invented namespaces/parameters and `fork_context`, unconditional `fork_turns`, and exact legacy generic contracts.
- Scope consistency: source prompts/skills, prompt cadence, config, schema, hooks, dependencies, and entry scripts remain untouched.
- Generated accounting: 44 agent TOMLs + 14 skill files = 58 generated files; with four source/test/spec/plan artifacts, the atomic change is 62 paths. `docs/v1-maintenance.md` remains unchanged under the reciprocal v1 sync rule.
- Git policy: the plan defines but does not authorize or execute staging or commit commands.

## Handoff

- Execution order: Task 1 → Task 2 → Task 3 → Task 4.
- Formal plan-review receipt: `waiting for receipt`; the prior receipt was invalidated by this revision.
- Residual risk: future source skills may add their own Codex compatibility section. `normalizeSkillForCodex()` therefore checks the shared contract marker independently of the section heading and appends the shared block exactly once.
