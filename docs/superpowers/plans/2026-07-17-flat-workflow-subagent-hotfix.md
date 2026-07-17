# Flat Workflow Subagent Hotfix Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce a flat, role-aware subagent graph in OpenCode permissions and effective prompts, keep formal planning/review ownership with the orchestrator, and publish the same contract in the generated Codex bundle.

**Architecture:** `src/hooks/config.ts` is the single policy source: ordered `permission.task` objects provide the runtime backstop, while a tagged delegation contract is appended last to every non-primary built-in prompt. Source planner/GPT-5.6 prompts and the v1 implementer template align model behavior with that policy; the Codex adapter explicitly treats its dispatch compatibility layer as subordinate and regenerates all profiles from the same composed prompts. Existing user permissions win atomically at the `permission.task` key, custom agents remain untouched, and `subagent.maxDepth` remains an independent unchanged guard.

**Tech Stack:** TypeScript 6, Node.js 22+ built-in test runner, Zod-backed ocmm config, Markdown prompt/skill sources, Codex TOML/profile generator, pnpm, Rust/Cargo verification, PowerShell 7.

**Approved spec:** `docs/superpowers/specs/2026-07-17-flat-workflow-subagent-hotfix-design.md`

---

## Global Constraints

1. The utility-leaf set is exactly `quick`, `code-search`, `explore`, `doc-search`, `research`, and `media-reader`. Every utility leaf has scalar `task: "deny"` and never dispatches.
2. Read-only workflow agents are exactly `planner`, `reviewer`, `oracle`, `oracle-high`, `clarifier`, and `plan-critic`. Their task allowlist is exactly `code-search`, `explore`, `doc-search`, `research`, and `media-reader`; `quick` is excluded because a read-only role must not modify work by proxy.
3. Standard workflow subagents are exactly `coding`, `normal-task`, `frontend`, `creative`, `hard-reasoning`, and `documenting`. They may call only the six utility leaves.
4. Local coordinators `deep` and `complex` may call the six utility leaves plus exactly `coding`, `frontend`, `hard-reasoning`, `creative`, and `documenting`. They may not call `normal-task`, either primary, either local coordinator, or any planning/review role.
5. `orchestrator` and `builder` remain primary agents with broad task capability. Formal planner dispatch, the `plan-critic` receipt loop, review dispatch, and final acceptance review remain orchestrator-owned.
6. Delegation requires direct tools to be insufficient or a separate bounded deliverable to materially improve completion. Multiple steps, routine confirmation, or wanting another opinion are not sufficient.
7. Preserve explicit user permission overrides. A default is installed only when the corresponding permission key is absent; an existing scalar or granular `permission.task` value is never merged into or replaced.
8. Do not change `subagent.maxDepth`, `src/permissions/index.ts`, the subagent-depth schema/default, or `schema.json`. Do not add a runtime dispatch hook or change OpenCode's Task tool.
9. Do not apply built-in role defaults to arbitrary user-defined agents.
10. Do not modify the approved spec or these unrelated untracked documents:
    - `docs/superpowers/plans/2026-07-15-oracle-priority-variants-subagent-recovery.md`
    - `docs/superpowers/plans/2026-07-17-fast-model-routing-profile-alias.md`
    - `docs/superpowers/specs/2026-07-15-oracle-priority-variants-subagent-recovery-design.md`
    - `docs/superpowers/specs/2026-07-17-fast-model-routing-profile-alias-design.md`
11. Do not perform a Git write without separate explicit user authorization. The synchronization rules require prompt sources, maintenance docs, tests, and generated Codex artifacts to remain one atomic review/commit boundary.
12. Every test/build/generation command must save whether `OCMM_PROFILE` and `OCMM_NO_PROFILE` existed, clear both variables, and restore their exact prior state in `finally`.
13. Generated files are never hand-edited. Change sources/tests first, run `pnpm run build:ts`, then run `pnpm run gen:codex-plugin`.
14. The planner returns the completed plan to the orchestrator with receipt status `waiting for receipt`; the planner does not dispatch `plan-critic` or any reviewer.
15. Implementation subagents never commit merely to create reviewable SHAs. Orchestrator-owned final review must support both committed `BASE_SHA..HEAD_SHA` ranges and uncommitted working-tree diffs.

## File Map

### Source and test files

- Modify `src/hooks/config.ts:16-18,31-37,50-83,109-122,155-180,230-317,330-347,349-365` — define role sets, granular task rules, authoritative prompt suffixes, user-override-preserving merges, and alias handling.
- Modify `src/hooks/config.test.ts:14-203` — prove primary, utility, read-only, explicit override, custom-agent, and built-in-agent prompt behavior.
- Modify `src/hooks/config.category.test.ts:14-129` — prove standard/local/category-leaf task rules and effective prompt contracts.
- Modify `src/intent/prompt-loader.test.ts:96-317` — prove all three planner/GPT-5.6 source sets and the v1 implementer/maintenance contract stay synchronized.
- Modify `src/codex/plugin-generator.ts:547-579` — make Codex dispatch compatibility explicitly subordinate to the effective role contract.
- Modify `src/codex/plugin-generator.test.ts:133-179,277-435` — prove in-memory and written Codex profiles carry exact contracts and cannot widen them.
- Modify `prompts/omo/agents/planner.md` — remove planner-owned reviewer/critic dispatch and return the plan to the orchestrator.
- Modify `prompts/v1/agents/planner.md` — make utility-only discovery and orchestrator-owned plan review authoritative in the skill-driven workflow.
- Modify `prompts/codex/agents/planner.md` — mirror planner ownership with Codex utility-profile names.
- Modify `prompts/omo/deepwork/gpt-5.6.md` — replace permissive distinct-deliverable nesting with the role-aware necessity policy.
- Modify `prompts/v1/deepwork/gpt-5.6.md` — mirror the same policy inside the `<deepwork-mode>` envelope.
- Modify `prompts/codex/deepwork/gpt-5.6.md` — mirror the same policy for generated Codex profiles.
- Modify `skills/v1/subagent-driven-development/SKILL.md` — remove implementer/subagent commit instructions and document that commits remain orchestrator-owned after explicit user authorization.
- Modify `skills/v1/subagent-driven-development/implementer-prompt.md` — constrain implementation children to permitted utility leaves and return review ownership to the orchestrator.
- Modify `skills/v1/requesting-code-review/SKILL.md` — document working-tree diff review as the path for uncommitted subagent work and keep commit-range review as an option only after an orchestrator-owned commit exists.
- Modify `skills/v1/requesting-code-review/code-reviewer.md` — accept supplied diff commands/output for either commit-range or working-tree review without requiring child-owned commits.
- Modify `docs/v1-maintenance.md` — record v1 planner, GPT-5.6, implementer-template, and Codex synchronization adjustments dated 2026-07-17.
- Modify `docs/prompt-sync.md` — record the cross-workflow flat delegation policy and prompt provenance.

### Generated Codex surfaces

- Regenerate `.agents/plugins/marketplace.json`; it may remain byte-identical but must be included in the deterministic generation check.
- Regenerate each of the following 22 names in both `.codex/agents/` and `plugins/deepwork/agents/`: `dw-builder.toml`, `dw-clarifier.toml`, `dw-code-search.toml`, `dw-coding.toml`, `dw-complex.toml`, `dw-creative.toml`, `dw-deep.toml`, `dw-doc-search.toml`, `dw-documenting.toml`, `dw-explore.toml`, `dw-frontend.toml`, `dw-hard-reasoning.toml`, `dw-media-reader.toml`, `dw-normal-task.toml`, `dw-oracle-high.toml`, `dw-oracle.toml`, `dw-orchestrator.toml`, `dw-plan-critic.toml`, `dw-planner.toml`, `dw-quick.toml`, `dw-research.toml`, and `dw-reviewer.toml`.
- Regenerate `plugins/deepwork/skills/deepwork-subagent-driven-development/SKILL.md` and `plugins/deepwork/skills/deepwork-subagent-driven-development/implementer-prompt.md` from the v1 source skill directory.
- Regenerate `plugins/deepwork/skills/deepwork-requesting-code-review/SKILL.md` and `plugins/deepwork/skills/deepwork-requesting-code-review/code-reviewer.md` from the v1 source skill directory.
- Regenerate the remainder of `plugins/deepwork/**` through the generator and retain only deterministic source-derived changes; do not manually normalize generated files.

## Execution and Review Boundaries

1. Tasks 1-3 establish the runtime permission graph and effective prompt composition.
2. Tasks 4-5 synchronize source prompts, the v1 subagent-driven skill/template, and maintenance records.
3. Tasks 6-7 validate Codex precedence, regenerate the bundle, and prove deterministic output.
4. Task 8 is the integrated acceptance gate. Do not create an intermediate commit because v1/omo prompt maintenance and generated-bundle invariants require one synchronized change set. If the user later authorizes a commit, the suggested semantic title is `fix: constrain workflow subagent delegation`.

---

### Task 1: Establish a clean, profile-neutral baseline

**Files:**
- Read only: `package.json`
- Read only: current Git status
- Test: `src/hooks/config.test.ts`
- Test: `src/hooks/config.category.test.ts`
- Test: `src/intent/prompt-loader.test.ts`
- Test: `src/codex/plugin-generator.test.ts`

**Interfaces:**
- Consumes: the current unmodified implementation and ambient process environment.
- Produces: baseline test evidence without changing project files or ambient profile variables.

- [ ] **Step 1: Confirm the protected worktree state without opening unrelated documents**

Run:

```powershell
git status --short
```

Expected: the four protected unrelated documents, the approved flat-workflow spec, and this plan are present as untracked files; there are no pre-existing tracked source changes. Do not open the four unrelated documents.

- [ ] **Step 2: Run the targeted baseline with both profile variables temporarily absent**

Run:

```powershell
& {
  $profileWasPresent = Test-Path Env:OCMM_PROFILE
  $profileBefore = $env:OCMM_PROFILE
  $noProfileWasPresent = Test-Path Env:OCMM_NO_PROFILE
  $noProfileBefore = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue
    node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/hooks/config.category.test.ts src/intent/prompt-loader.test.ts src/codex/plugin-generator.test.ts
    if ($LASTEXITCODE -ne 0) { throw "targeted baseline failed with exit code $LASTEXITCODE" }
  } finally {
    if ($profileWasPresent) { $env:OCMM_PROFILE = $profileBefore } else { Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue }
    if ($noProfileWasPresent) { $env:OCMM_NO_PROFILE = $noProfileBefore } else { Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue }
  }
}
```

Expected: all existing targeted tests pass and the two environment variables have exactly their pre-command state afterward.

- [ ] **Step 3: Record the no-write boundary**

Run:

```powershell
git diff --exit-code
```

Expected: no tracked diff before implementation begins.

---

### Task 2: Install the exact `permission.task` graph with TDD

**Files:**
- Modify: `src/hooks/config.test.ts:169-203`
- Modify: `src/hooks/config.category.test.ts:14-69`
- Modify: `src/hooks/config.ts:16-18,115-122,330-347`

**Interfaces:**
- Consumes: registered built-in agent/category names and any existing per-agent permission object.
- Produces: `permission.task` as either a primary scalar, a terminal scalar deny, or an ordered `{ "*": "deny", <exact-name>: "allow" }` object.
- Invariant: `mergePermission(..., false)` treats an existing `task` value atomically, preserving both user scalars and user granular objects.

- [ ] **Step 1: Add exact permission fixtures and failing assertions**

Add these fixtures near the top of `src/hooks/config.test.ts`, after `loadAllPrompts(...)`:

```typescript
const UTILITY_TASK_RULES = {
  "*": "deny",
  quick: "allow",
  "code-search": "allow",
  explore: "allow",
  "doc-search": "allow",
  research: "allow",
  "media-reader": "allow",
} as const

const READ_ONLY_TASK_RULES = {
  "*": "deny",
  "code-search": "allow",
  explore: "allow",
  "doc-search": "allow",
  research: "allow",
  "media-reader": "allow",
} as const

const LOCAL_COORDINATOR_TASK_RULES = {
  ...UTILITY_TASK_RULES,
  coding: "allow",
  frontend: "allow",
  "hard-reasoning": "allow",
  creative: "allow",
  documenting: "allow",
} as const

function agentPermission(agentMap: Record<string, unknown>, name: string): Record<string, unknown> {
  const entry = agentMap[name] as Record<string, unknown>
  const permission = entry.permission
  assert.ok(permission && typeof permission === "object" && !Array.isArray(permission), `missing permission for ${name}`)
  return permission as Record<string, unknown>
}

function assertExactTaskRules(actual: unknown, expected: Record<string, string>, label: string): void {
  assert.ok(actual && typeof actual === "object" && !Array.isArray(actual), `${label} task rules must be granular`)
  assert.deepEqual(Object.entries(actual as Record<string, unknown>), Object.entries(expected), `${label} task rule order`)
}
```

Replace the current default-permission test with:

```typescript
test("config applies the exact flat-workflow task permission graph", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown>; permission?: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  assert.deepEqual(cfg.permission, { webfetch: "allow", external_directory: "allow", task: "deny" })
  for (const name of ["orchestrator", "builder"]) {
    assert.equal(agentPermission(cfg.agent, name).task, "allow", `${name} must remain primary-capable`)
  }
  for (const name of ["quick", "code-search", "explore", "doc-search", "research", "media-reader"]) {
    assert.equal(agentPermission(cfg.agent, name).task, "deny", `${name} must be a terminal leaf`)
  }
  for (const name of ["coding", "normal-task", "frontend", "creative", "hard-reasoning", "documenting"]) {
    assertExactTaskRules(agentPermission(cfg.agent, name).task, UTILITY_TASK_RULES, `${name} utility allowlist`)
  }
  for (const name of ["planner", "reviewer", "oracle", "oracle-high", "clarifier", "plan-critic"]) {
    assertExactTaskRules(agentPermission(cfg.agent, name).task, READ_ONLY_TASK_RULES, `${name} read-only allowlist`)
    assert.equal(agentPermission(cfg.agent, name)["task_*"], undefined, `${name} must not retain a broad task wildcard`)
  }
  for (const name of ["deep", "complex"]) {
    assertExactTaskRules(agentPermission(cfg.agent, name).task, LOCAL_COORDINATOR_TASK_RULES, `${name} local-coordinator allowlist`)
  }
  assert.equal(agentPermission(cfg.agent, "doc-search")["grep_app_*"], "allow")
})
```

Extend the explicit-override test with a host granular object and add a custom-agent regression:

```typescript
test("config preserves scalar and granular explicit permission overrides", async () => {
  const configured = {
    ...defaultConfig(),
    agents: {
      orchestrator: { permission: { task: "deny" as const, custom: "allow" as const } },
      reviewer: { tools: { task: true } },
    },
  }
  const hostTaskOverride = { "*": "allow" as const, planner: "allow" as const }
  const handler = createConfigHandler({ getConfig: () => configured })
  const cfg: { agent: Record<string, unknown>; permission?: Record<string, unknown> } = {
    agent: { coding: { permission: { task: hostTaskOverride } } },
    permission: { webfetch: "deny" },
  }
  await handler(cfg, undefined)

  assert.equal(cfg.permission?.webfetch, "deny")
  assert.equal(cfg.permission?.external_directory, "allow")
  assert.equal(agentPermission(cfg.agent, "orchestrator").task, "deny")
  assert.equal(agentPermission(cfg.agent, "orchestrator").custom, "allow")
  assert.equal(agentPermission(cfg.agent, "reviewer").task, "allow")
  assertExactTaskRules(agentPermission(cfg.agent, "coding").task, hostTaskOverride, "host granular override")
})

test("config does not impose built-in task defaults on custom agents", async () => {
  const configured = {
    ...defaultConfig(),
    agents: { "custom-worker": { model: "openai/gpt-5.5" } },
  }
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => configured })(cfg, undefined)

  assert.ok(cfg.agent["custom-worker"])
  assert.equal((cfg.agent["custom-worker"] as Record<string, unknown>).permission, undefined)
})
```

In `src/hooks/config.category.test.ts`, add these independent fixtures after `loadAllPrompts(...)`:

```typescript
const UTILITY_TASK_RULES = {
  "*": "deny",
  quick: "allow",
  "code-search": "allow",
  explore: "allow",
  "doc-search": "allow",
  research: "allow",
  "media-reader": "allow",
} as const

const LOCAL_COORDINATOR_TASK_RULES = {
  ...UTILITY_TASK_RULES,
  coding: "allow",
  frontend: "allow",
  "hard-reasoning": "allow",
  creative: "allow",
  documenting: "allow",
} as const

function assertExactTaskRules(actual: unknown, expected: Record<string, string>, label: string): void {
  assert.ok(actual && typeof actual === "object" && !Array.isArray(actual), `${label} task rules must be granular`)
  assert.deepEqual(Object.entries(actual as Record<string, unknown>), Object.entries(expected), `${label} task rule order`)
}
```

Then add the category-level assertion:

```typescript
test("category task permissions distinguish leaves, workflow roles, and local coordinators", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  const taskFor = (name: string): unknown => {
    const entry = cfg.agent[name] as Record<string, unknown>
    const permission = entry.permission as Record<string, unknown> | undefined
    return permission?.task
  }

  assert.equal(taskFor("quick"), "deny")
  assert.equal(taskFor("research"), "deny")
  assertExactTaskRules(taskFor("frontend"), UTILITY_TASK_RULES, "frontend")
  assertExactTaskRules(taskFor("normal-task"), UTILITY_TASK_RULES, "normal-task")
  assertExactTaskRules(taskFor("deep"), LOCAL_COORDINATOR_TASK_RULES, "deep")
  assertExactTaskRules(taskFor("complex"), LOCAL_COORDINATOR_TASK_RULES, "complex")
})
```

- [ ] **Step 2: Run the RED permission tests**

Run:

```powershell
& {
  $profileWasPresent = Test-Path Env:OCMM_PROFILE
  $profileBefore = $env:OCMM_PROFILE
  $noProfileWasPresent = Test-Path Env:OCMM_NO_PROFILE
  $noProfileBefore = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue
    node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/hooks/config.category.test.ts
    if ($LASTEXITCODE -eq 0) { throw "permission RED unexpectedly passed" }
  } finally {
    if ($profileWasPresent) { $env:OCMM_PROFILE = $profileBefore } else { Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue }
    if ($noProfileWasPresent) { $env:OCMM_NO_PROFILE = $noProfileBefore } else { Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue }
  }
}
```

Expected: failure because `planner`, `coding`, `deep`, and `complex` currently receive broad scalar task permission, category roles such as `frontend` lack the granular allowlist, and utility category `research` is not yet a terminal leaf.

- [ ] **Step 3: Add role constants and permission value types in `src/hooks/config.ts`**

Insert after `COMPAT_AGENT_ALIASES`:

```typescript
type PermissionAction = "ask" | "allow" | "deny"
type GranularPermission = Record<string, PermissionAction>
type PermissionDefault = PermissionAction | GranularPermission
type PermissionDefaults = Record<string, PermissionDefault>

const PRIMARY_COORDINATORS = ["orchestrator", "builder"] as const
const UTILITY_LEAF_AGENTS = [
  "quick",
  "code-search",
  "explore",
  "doc-search",
  "research",
  "media-reader",
] as const
const READ_ONLY_UTILITY_AGENTS = [
  "code-search",
  "explore",
  "doc-search",
  "research",
  "media-reader",
] as const
const STANDARD_WORKFLOW_SUBAGENTS = [
  "coding",
  "normal-task",
  "frontend",
  "creative",
  "hard-reasoning",
  "documenting",
] as const
const READ_ONLY_WORKFLOW_AGENTS = [
  "planner",
  "reviewer",
  "oracle",
  "oracle-high",
  "clarifier",
  "plan-critic",
] as const
const LOCAL_COORDINATORS = ["deep", "complex"] as const
const SPECIALIST_EXECUTION_AGENTS = [
  "coding",
  "frontend",
  "hard-reasoning",
  "creative",
  "documenting",
] as const
const QUESTION_ENABLED_WORKFLOW_AGENTS = ["planner", "deep", "complex", "coding", "normal-task"] as const

function taskAllowlist(allowed: readonly string[]): GranularPermission {
  const rules: GranularPermission = { "*": "deny" }
  for (const name of allowed) rules[name] = "allow"
  return rules
}
```

The insertion order is security-significant: OpenCode evaluates matching rules with the last match winning, so `"*": "deny"` must be created before exact allows.

- [ ] **Step 4: Broaden only the internal merge value type, not the user schema**

Replace `mergePermission` with:

```typescript
function mergePermission(entry: Record<string, unknown>, permission: PermissionDefaults, overwrite: boolean): void {
  const existing = isRecord(entry.permission) ? entry.permission : {}
  const merged: Record<string, unknown> = { ...existing }
  for (const [name, value] of Object.entries(permission)) {
    if (overwrite || merged[name] === undefined) merged[name] = value
  }
  entry.permission = merged
}
```

Do not modify `src/config/schema.ts`: ocmm's user shorthand remains scalar, while the host's already-materialized agent config and built-in defaults may carry OpenCode's granular object syntax.

- [ ] **Step 5: Replace broad non-primary defaults with exact role rules**

Replace `registerDefaultPermissions` with:

```typescript
function registerDefaultPermissions(target: Record<string, unknown>, agentMap: Record<string, unknown>): void {
  const topLevel = isRecord(target.permission) ? target.permission : {}
  target.permission = topLevel
  mergePermission(target, { webfetch: "allow", external_directory: "allow", task: "deny" }, false)

  for (const name of PRIMARY_COORDINATORS) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { task: "allow", question: "allow", "task_*": "allow" }, false)
  }

  for (const name of STANDARD_WORKFLOW_SUBAGENTS) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { task: taskAllowlist(UTILITY_LEAF_AGENTS) }, false)
  }

  for (const name of READ_ONLY_WORKFLOW_AGENTS) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { task: taskAllowlist(READ_ONLY_UTILITY_AGENTS) }, false)
  }

  for (const name of LOCAL_COORDINATORS) {
    const entry = agentMap[name]
    if (isRecord(entry)) {
      mergePermission(entry, {
        task: taskAllowlist([...UTILITY_LEAF_AGENTS, ...SPECIALIST_EXECUTION_AGENTS]),
      }, false)
    }
  }

  for (const name of UTILITY_LEAF_AGENTS) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { task: "deny" }, false)
  }

  for (const name of QUESTION_ENABLED_WORKFLOW_AGENTS) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { question: "allow" }, false)
  }

  const docSearch = agentMap["doc-search"]
  if (isRecord(docSearch)) mergePermission(docSearch, { "grep_app_*": "allow" }, false)
}
```

This retains the existing question permission where it already existed, removes broad `task_*` defaults from non-primary roles, and leaves explicit permission values untouched because every default merge uses `overwrite: false`.

- [ ] **Step 6: Run the GREEN permission tests**

Run:

```powershell
& {
  $profileWasPresent = Test-Path Env:OCMM_PROFILE
  $profileBefore = $env:OCMM_PROFILE
  $noProfileWasPresent = Test-Path Env:OCMM_NO_PROFILE
  $noProfileBefore = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue
    node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/hooks/config.category.test.ts
    if ($LASTEXITCODE -ne 0) { throw "permission GREEN failed with exit code $LASTEXITCODE" }
  } finally {
    if ($profileWasPresent) { $env:OCMM_PROFILE = $profileBefore } else { Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue }
    if ($noProfileWasPresent) { $env:OCMM_NO_PROFILE = $noProfileBefore } else { Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue }
  }
}
```

Expected: both config test files pass; the exact object equality assertions prove no extra callable target was introduced.

---

### Task 3: Append an authoritative effective prompt contract with TDD

**Files:**
- Modify: `src/hooks/config.test.ts:100-167`
- Modify: `src/hooks/config.category.test.ts:71-129`
- Modify: `src/hooks/config.ts:20-24,31-37,68-83,109-180,230-317,349-365`

**Interfaces:**
- Consumes: a built-in source name and the final prompt already selected from host override or role/model composition.
- Produces: at most one terminal `<ocmm-delegation-contract>` block; primary and custom agents receive no appended block.
- Invariant: the suffix is appended after locale/role/model content and is re-applied idempotently, so a host custom prompt cannot bypass the role boundary.

- [ ] **Step 1: Add failing effective-contract tests for functional agents**

Add this helper to `src/hooks/config.test.ts`:

```typescript
function delegationContract(agentMap: Record<string, unknown>, name: string): string {
  const prompt = String((agentMap[name] as Record<string, unknown>).prompt)
  const match = prompt.match(/<ocmm-delegation-contract>([\s\S]*?)<\/ocmm-delegation-contract>/)
  assert.ok(match, `missing delegation contract for ${name}`)
  return match[1]!
}
```

Add these tests:

```typescript
test("config appends authoritative contracts to non-primary builtin agents", async () => {
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  await handler(cfg, undefined)

  for (const name of ["orchestrator", "builder"]) {
    assert.doesNotMatch(String((cfg.agent[name] as Record<string, unknown>).prompt), /ocmm-delegation-contract/)
  }

  assert.match(delegationContract(cfg.agent, "code-search"), /utility leaf agent/i)
  assert.match(delegationContract(cfg.agent, "code-search"), /Do not dispatch any subagent/)

  const planner = delegationContract(cfg.agent, "planner")
  assert.match(planner, /Allowed utility targets: `code-search`, `explore`, `doc-search`, `research`, `media-reader`\./)
  assert.match(planner, /`quick` is forbidden/)
  assert.match(planner, /Return the completed plan or findings to the caller/)
  assert.match(planner, /plan-critic.*orchestrator-owned/i)
})

test("config appends one terminal contract to an existing host prompt", async () => {
  const cfg = { agent: { planner: { prompt: "Host planner prompt." } } }
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  await handler(cfg, undefined)
  await handler(cfg, undefined)

  const prompt = String((cfg.agent.planner as Record<string, unknown>).prompt)
  assert.match(prompt, /Host planner prompt\./)
  assert.equal(prompt.match(/<ocmm-delegation-contract>/g)?.length, 1)
  assert.match(prompt, /<\/ocmm-delegation-contract>\s*$/)
})
```

- [ ] **Step 2: Add failing category contract tests**

Add this test to `src/hooks/config.category.test.ts`:

```typescript
test("category prompts receive role-specific terminal delegation contracts", async () => {
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => defaultConfig() })(cfg, undefined)

  const contractFor = (name: string): string => {
    const prompt = String((cfg.agent[name] as Record<string, unknown>).prompt)
    const match = prompt.match(/<ocmm-delegation-contract>([\s\S]*?)<\/ocmm-delegation-contract>/)
    assert.ok(match, `missing delegation contract for ${name}`)
    assert.match(prompt, /<\/ocmm-delegation-contract>\s*$/)
    return match[1]!
  }

  assert.match(contractFor("quick"), /utility leaf agent/i)
  assert.match(
    contractFor("coding"),
    /Allowed utility targets: `quick`, `code-search`, `explore`, `doc-search`, `research`, `media-reader`\./,
  )
  const deep = contractFor("deep")
  assert.match(deep, /Allowed specialist targets: `coding`, `frontend`, `hard-reasoning`, `creative`, `documenting`\./)
  assert.match(deep, /Multiple steps, routine confirmation, or wanting another opinion are not sufficient/)
  assert.match(deep, /Do not call `orchestrator`, `builder`, `planner`, `clarifier`, `plan-critic`, `reviewer`, `oracle`, `oracle-high`, `normal-task`, `deep`, or `complex`/)
})
```

- [ ] **Step 3: Run the RED prompt-composition tests**

Run:

```powershell
& {
  $profileWasPresent = Test-Path Env:OCMM_PROFILE
  $profileBefore = $env:OCMM_PROFILE
  $noProfileWasPresent = Test-Path Env:OCMM_NO_PROFILE
  $noProfileBefore = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue
    node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/hooks/config.category.test.ts
    if ($LASTEXITCODE -eq 0) { throw "prompt-contract RED unexpectedly passed" }
  } finally {
    if ($profileWasPresent) { $env:OCMM_PROFILE = $profileBefore } else { Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue }
    if ($noProfileWasPresent) { $env:OCMM_NO_PROFILE = $noProfileBefore } else { Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue }
  }
}
```

Expected: failures report missing `<ocmm-delegation-contract>` blocks.

- [ ] **Step 4: Add suffix support and an idempotent tagged block**

Extend `AgentExtras` and add the block helpers in `src/hooks/config.ts`:

```typescript
type AgentExtras = {
  mode?: string
  prompt?: string
  promptPrefix?: string
  promptSuffix?: string
  /** Catalog-confirmed runtime upgrade; never overrides an explicit user model. */
  model?: string
}

const DELEGATION_CONTRACT_TAG = "ocmm-delegation-contract"
const DELEGATION_CONTRACT_BLOCK = new RegExp(
  `(?:\\n\\n---\\n\\n)?<${DELEGATION_CONTRACT_TAG}>[\\s\\S]*?<\\/${DELEGATION_CONTRACT_TAG}>\\s*`,
  "g",
)

function appendPromptSuffix(prompt: string, suffix: string): string {
  const body = prompt.replace(DELEGATION_CONTRACT_BLOCK, "").trim()
  const cleanSuffix = suffix.trim()
  return body ? `${body}\n\n---\n\n${cleanSuffix}` : cleanSuffix
}
```

In `applyAgentEntry`, append the suffix after the existing prefix logic:

```typescript
  if (extras?.promptPrefix && typeof existing.prompt === "string") {
    existing.prompt = prependPromptPrefix(existing.prompt, extras.promptPrefix)
  }
  if (extras?.promptSuffix) {
    const basePrompt = typeof existing.prompt === "string" ? existing.prompt : ""
    existing.prompt = appendPromptSuffix(basePrompt, extras.promptSuffix)
  }
```

- [ ] **Step 5: Implement the exact role-aware contract builder**

Add below `appendPromptSuffix`:

```typescript
const UTILITY_LEAF_AGENT_SET: ReadonlySet<string> = new Set(UTILITY_LEAF_AGENTS)
const STANDARD_WORKFLOW_SUBAGENT_SET: ReadonlySet<string> = new Set(STANDARD_WORKFLOW_SUBAGENTS)
const READ_ONLY_WORKFLOW_AGENT_SET: ReadonlySet<string> = new Set(READ_ONLY_WORKFLOW_AGENTS)
const LOCAL_COORDINATOR_SET: ReadonlySet<string> = new Set(LOCAL_COORDINATORS)

function formatTargets(names: readonly string[]): string {
  return names.map((name) => `\`${name}\``).join(", ")
}

function wrapDelegationContract(lines: readonly string[]): string {
  return [
    `<${DELEGATION_CONTRACT_TAG}>`,
    "## Delegation Contract (Authoritative)",
    ...lines,
    "This contract overrides any skill, model calibration, generated-adapter compatibility text, or other prompt layer that suggests broader delegation.",
    `</${DELEGATION_CONTRACT_TAG}>`,
  ].join("\n")
}

function delegationContractFor(name: string): string {
  if (UTILITY_LEAF_AGENT_SET.has(name)) {
    return wrapDelegationContract([
      "This role is a utility leaf agent. Do not dispatch any subagent.",
      "Complete the bounded assignment with direct tools and return the result to the caller.",
    ])
  }

  if (READ_ONLY_WORKFLOW_AGENT_SET.has(name)) {
    return wrapDelegationContract([
      "Use direct tools first. Delegate only when direct tools are insufficient and a separate bounded research result materially improves completion.",
      `Allowed utility targets: ${formatTargets(READ_ONLY_UTILITY_AGENTS)}.`,
      "`quick` is forbidden because this read-only role must not modify work by proxy. Planning, review, coordination, and implementation workflow agents are also forbidden.",
      "Return the completed plan or findings to the caller. Formal planner dispatch, the `plan-critic` loop, review dispatch, and final acceptance review are orchestrator-owned.",
    ])
  }

  if (STANDARD_WORKFLOW_SUBAGENT_SET.has(name)) {
    return wrapDelegationContract([
      "Use direct tools first. Delegate only when direct tools are insufficient or a separate bounded utility result materially improves completion.",
      `Allowed utility targets: ${formatTargets(UTILITY_LEAF_AGENTS)}.`,
      "Do not dispatch planning, review, coordination, or implementation workflow agents.",
      "After local verification, return status and evidence to the caller. Formal planner dispatch, the `plan-critic` loop, review dispatch, and final acceptance review are orchestrator-owned.",
    ])
  }

  if (LOCAL_COORDINATOR_SET.has(name)) {
    return wrapDelegationContract([
      "Use direct tools first. Delegate only when the child owns a distinct bounded deliverable that materially improves completion.",
      "Multiple steps, routine confirmation, or wanting another opinion are not sufficient.",
      `Allowed utility targets: ${formatTargets(UTILITY_LEAF_AGENTS)}.`,
      `Allowed specialist targets: ${formatTargets(SPECIALIST_EXECUTION_AGENTS)}.`,
      "Do not call `orchestrator`, `builder`, `planner`, `clarifier`, `plan-critic`, `reviewer`, `oracle`, `oracle-high`, `normal-task`, `deep`, or `complex`.",
      "Integrate and verify child results, then return to the parent. Formal planner dispatch, the `plan-critic` loop, review dispatch, and final acceptance review are orchestrator-owned.",
    ])
  }

  return ""
}
```

- [ ] **Step 6: Attach contracts to built-ins, categories, and the `explore` alias**

In both registration loops, set `extras.promptSuffix` before `applyAgentEntry`:

```typescript
      const contract = delegationContractFor(a.name)
      if (contract) extras.promptSuffix = contract
      applyAgentEntry(agentMap, a, norm, extras)
```

```typescript
      const contract = delegationContractFor(c.name)
      if (contract) extras.promptSuffix = contract
      applyAgentEntry(agentMap, baseAgent, merged, extras)
```

In `registerCompatAgentAliases`, preserve the leaf contract even when a host supplied an `explore` prompt:

```typescript
    const contract = delegationContractFor(alias)
    if (contract) {
      const basePrompt = typeof aliasEntry.prompt === "string" ? aliasEntry.prompt : ""
      aliasEntry.prompt = appendPromptSuffix(basePrompt, contract)
    }
```

Place this immediately before `agentMap[alias] = aliasEntry`.

- [ ] **Step 7: Run the GREEN prompt-composition tests**

Run:

```powershell
& {
  $profileWasPresent = Test-Path Env:OCMM_PROFILE
  $profileBefore = $env:OCMM_PROFILE
  $noProfileWasPresent = Test-Path Env:OCMM_NO_PROFILE
  $noProfileBefore = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue
    node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/hooks/config.category.test.ts
    if ($LASTEXITCODE -ne 0) { throw "prompt-contract GREEN failed with exit code $LASTEXITCODE" }
  } finally {
    if ($profileWasPresent) { $env:OCMM_PROFILE = $profileBefore } else { Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue }
    if ($noProfileWasPresent) { $env:OCMM_NO_PROFILE = $noProfileBefore } else { Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue }
  }
}
```

Expected: config and category tests pass; custom host prompts contain exactly one terminal contract, primaries contain none, and every non-primary built-in has the role-specific text.

---

### Task 4: Synchronize planner and GPT-5.6 source prompts with TDD

**Files:**
- Modify: `src/intent/prompt-loader.test.ts:177-190,255-317`
- Modify: `prompts/omo/agents/planner.md:14-19,46-49`
- Modify: `prompts/v1/agents/planner.md:17-23,31-41,69-80`
- Modify: `prompts/codex/agents/planner.md:17-23,31-41,69-80`
- Modify: `prompts/omo/deepwork/gpt-5.6.md:33-39`
- Modify: `prompts/v1/deepwork/gpt-5.6.md:35-41`
- Modify: `prompts/codex/deepwork/gpt-5.6.md:35-41`

**Interfaces:**
- Consumes: workflow-specific planner role text and GPT-5.6 model calibration.
- Produces: three semantically aligned prompt sets in which role permissions outrank model guidance and planners return plans without launching review.

- [ ] **Step 1: Add the cross-workflow RED contract test**

Add to `src/intent/prompt-loader.test.ts`:

```typescript
test("planner and GPT-5.6 prompts keep delegation and review ownership flat", () => {
  const root = join(process.cwd(), "prompts")
  try {
    for (const workflow of ["omo", "v1", "codex"] as const) {
      loadAllPrompts(root, workflow)
      const planner = getAgentPrompt("planner")
      assert.match(planner, /Use direct tools first/)
      assert.match(planner, /Return the completed plan to the orchestrator/)
      assert.match(planner, /Do not dispatch `plan-critic`, `reviewer`, `oracle`, or `oracle-high`/)
      assert.doesNotMatch(planner, /Use `reviewer`|Consult `reviewer`|Submit the complete current plan to `plan-critic`/)

      const gpt56 = getDeepworkPrompt("gpt-5.6")
      assert.match(gpt56, /Multiple steps, routine confirmation, or wanting another opinion are not sufficient/)
      assert.match(gpt56, /Utility leaf agents never dispatch/)
      assert.match(gpt56, /Read-only workflow agents never call `quick`/)
      assert.match(gpt56, /Formal planner dispatch, the `plan-critic` loop, review dispatch, and final acceptance review remain orchestrator-owned/)
      assert.doesNotMatch(gpt56, /Nested subagent calls require a distinct deliverable/)
    }
  } finally {
    loadAllPrompts(root, "omo")
  }
})
```

- [ ] **Step 2: Run the RED prompt-source test**

Run:

```powershell
& {
  $profileWasPresent = Test-Path Env:OCMM_PROFILE
  $profileBefore = $env:OCMM_PROFILE
  $noProfileWasPresent = Test-Path Env:OCMM_NO_PROFILE
  $noProfileBefore = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue
    node --test --experimental-strip-types --test-reporter=spec src/intent/prompt-loader.test.ts
    if ($LASTEXITCODE -eq 0) { throw "source-prompt RED unexpectedly passed" }
  } finally {
    if ($profileWasPresent) { $env:OCMM_PROFILE = $profileBefore } else { Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue }
    if ($noProfileWasPresent) { $env:OCMM_NO_PROFILE = $noProfileBefore } else { Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue }
  }
}
```

Expected: failure on the old planner reviewer/critic ownership and the old GPT-5.6 nested-deliverable sentence.

- [ ] **Step 3: Replace the OMO planner dispatch and handoff sections**

Use this complete `First Action` body in `prompts/omo/agents/planner.md`:

```markdown
## First Action

Identify whether the request is clear enough to plan. If not, ask the smallest blocking question. If yes, gather missing codebase context before writing tasks.

Use direct tools first. When direct tools are insufficient and a separate bounded lookup materially improves the plan, use only the read-only utility agents exposed by the current Task tool: `code-search`, `explore`, `doc-search`, `research`, and `media-reader`. Do not use `quick`, implementation/coordinator agents, or planning/review agents.
```

Use this complete `Handoff` section:

```markdown
## Handoff

Return the completed plan to the orchestrator. Do not dispatch `plan-critic`, `reviewer`, `oracle`, or `oracle-high`; the orchestrator owns the current-revision critic loop and all formal review dispatch.

Report the plan path, intended execution order, receipt status `waiting for receipt`, and any risks or assumptions that still matter.
```

- [ ] **Step 4: Replace the v1 planner utility, parallel-dispatch, and handoff wording**

In `prompts/v1/agents/planner.md`, replace the direct-agent guidance with:

```markdown
Use direct tools first. When direct tools are insufficient and a separate bounded lookup materially improves the plan, use only `code-search`, `explore`, `doc-search`, `research`, or `media-reader`. Do not use `quick`, implementation/coordinator agents, or planning/review agents.
```

Keep the direct tool-selection list, but delete both reviewer-consultation sentences. Replace `Parallel Task Dispatch` with:

```markdown
## Parallel Utility Dispatch

When gathering context for a plan, batch independent calls only to permitted read-only utility agents. Dispatch sequentially when one lookup's result is another's input. Never dispatch an implementation worker or a reviewer from the planner role.
```

Replace `Handoff` with:

```markdown
## Handoff

Return the completed plan to the orchestrator. Do not dispatch `plan-critic`, `reviewer`, `oracle`, or `oracle-high`; the orchestrator owns the current-revision critic loop, receipt tracking, and all formal review dispatch.

Report the plan path, intended execution order, receipt status `waiting for receipt`, and any risks or assumptions that still matter.
```

- [ ] **Step 5: Replace the Codex planner utility, parallel-dispatch, and handoff wording**

In `prompts/codex/agents/planner.md`, replace the direct-agent guidance with:

```markdown
Use direct tools first. When direct tools are insufficient and a separate bounded lookup materially improves the plan, use only the generated read-only utility profiles `dw-code-search`, `dw-explore`, `dw-doc-search`, `dw-research`, or `dw-media-reader` when the current Codex dispatch surface exposes them. Do not use `dw-quick`, implementation/coordinator profiles, or planning/review profiles.
```

Keep the Codex direct tool-selection list, but delete both reviewer-consultation sentences. Replace `Parallel Task Dispatch` with:

```markdown
## Parallel Utility Dispatch

When gathering context for a plan, batch independent calls only to permitted read-only utility profiles. Dispatch sequentially when one lookup's result is another's input. Never dispatch an implementation worker or a reviewer from the planner role.
```

Replace `Handoff` with:

```markdown
## Handoff

Return the completed plan to the orchestrator. Do not dispatch `plan-critic`, `reviewer`, `oracle`, or `oracle-high`; the orchestrator owns the current-revision critic loop, receipt tracking, and all formal review dispatch.

Report the plan path, intended execution order, receipt status `waiting for receipt`, and any risks or assumptions that still matter.
```

- [ ] **Step 6: Replace the GPT-5.6 delegation section in all three workflows**

Replace `## Retrieval and delegation thresholds` in each GPT-5.6 file with this exact block, retaining the existing workflow-specific envelope and all surrounding sections:

```markdown
## Retrieval and delegation thresholds

- Use direct tools by default. Multiple steps, routine confirmation, or wanting another opinion are not sufficient reasons to delegate.
- `orchestrator` and `builder` retain broad delegation, but only when a separate bounded deliverable, specialist capability, or material context saving makes delegation necessary.
- `deep` and `complex` may use only utility leaves (`quick`, `code-search`, `explore`, `doc-search`, `research`, `media-reader`) and specialist execution roles (`coding`, `frontend`, `hard-reasoning`, `creative`, `documenting`). A distinct deliverable is necessary but not sufficient; the child must materially improve completion.
- Standard workflow subagents may use only the utility leaves allowed by their effective delegation contract. Read-only workflow agents never call `quick` and may use only read-only utility leaves.
- Utility leaf agents never dispatch. Every non-primary role must return its result to its caller after local verification.
- Formal planner dispatch, the `plan-critic` loop, review dispatch, and final acceptance review remain orchestrator-owned. A planner or reviewer reports the required handoff instead of launching another workflow agent.
- Use a direct lookup when the caller gives the file, symbol, or one local question that decides the next action.
- Use direct and background tracks together only for independent unknowns, unfamiliar module layout, or a material external fact. Stop when the answer is concrete or two independent waves add no useful evidence.
- Every permitted delegated task must state its outcome, relevant scope, expected deliverable, verification evidence, and non-goals. A timeout, acknowledgement, or partial report is not completion.
```

- [ ] **Step 7: Run the GREEN prompt-source tests**

Run:

```powershell
& {
  $profileWasPresent = Test-Path Env:OCMM_PROFILE
  $profileBefore = $env:OCMM_PROFILE
  $noProfileWasPresent = Test-Path Env:OCMM_NO_PROFILE
  $noProfileBefore = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue
    node --test --experimental-strip-types --test-reporter=spec src/intent/prompt-loader.test.ts
    if ($LASTEXITCODE -ne 0) { throw "source-prompt GREEN failed with exit code $LASTEXITCODE" }
  } finally {
    if ($profileWasPresent) { $env:OCMM_PROFILE = $profileBefore } else { Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue }
    if ($noProfileWasPresent) { $env:OCMM_NO_PROFILE = $noProfileBefore } else { Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue }
  }
}
```

Expected: `src/intent/prompt-loader.test.ts` passes for omo, v1, and Codex; the deprecated nested-deliverable sentence is absent from all three GPT-5.6 files.

---

### Task 5: Constrain v1 subagent execution and review ownership, then synchronize maintenance records

**Files:**
- Modify: `src/intent/prompt-loader.test.ts:319-363`
- Modify: `skills/v1/subagent-driven-development/SKILL.md:48-56,78-88,154-155,223-233`
- Modify: `skills/v1/subagent-driven-development/implementer-prompt.md:29-43`
- Modify: `skills/v1/requesting-code-review/SKILL.md:33-50,78-82,90-116`
- Modify: `skills/v1/requesting-code-review/code-reviewer.md:23-31`
- Modify: `docs/v1-maintenance.md:13,28-48,56,63,77-94`
- Modify: `docs/prompt-sync.md:18-40,42-57,65-75`

**Interfaces:**
- Consumes: an implementation task handed down by the orchestrator and a final review request over either committed or uncommitted work.
- Produces: locally verified implementation evidence returned to the caller without child-owned planning/review dispatch, plus a review skill/template that can review working-tree diffs without requiring child-owned commits.
- Documentation output: dated source-of-truth records for every modified v1/omo prompt or skill file.

- [ ] **Step 1: Add failing template and maintenance assertions**

Add to `src/intent/prompt-loader.test.ts`:

```typescript
test("v1 implementer template and maintenance docs record flat workflow ownership", () => {
  const skill = readFileSync(
    join(process.cwd(), "skills", "v1", "subagent-driven-development", "SKILL.md"),
    "utf8",
  )
  assert.match(skill, /Subagents do not commit, stage, push, or run any Git write command/)
  assert.match(skill, /return changed files and a suggested commit message to the orchestrator/i)
  assert.match(skill, /working-tree\/staged diff/i)
  assert.match(skill, /Do not require implementation subagents to commit/i)
  assert.doesNotMatch(skill, /c\. Implementer implements, tests, commits, self-reviews/)
  assert.doesNotMatch(skill, /Pass the full change range:\s*- `BASE_SHA`/s)

  const implementer = readFileSync(
    join(process.cwd(), "skills", "v1", "subagent-driven-development", "implementer-prompt.md"),
    "utf8",
  )
  assert.match(implementer, /## Delegation Boundary/)
  assert.match(implementer, /`quick`, `code-search`, `explore`, `doc-search`, `research`, and `media-reader`/)
  assert.match(implementer, /Do not launch `planner`, `plan-critic`, `reviewer`, `oracle`, or `oracle-high`/)
  assert.match(implementer, /orchestrator owns formal plan review and final acceptance review/i)
  assert.doesNotMatch(implementer, /Commit your work/)

  const requestingReview = readFileSync(
    join(process.cwd(), "skills", "v1", "requesting-code-review", "SKILL.md"),
    "utf8",
  )
  const reviewerTemplate = readFileSync(
    join(process.cwd(), "skills", "v1", "requesting-code-review", "code-reviewer.md"),
    "utf8",
  )
  assert.match(requestingReview, /Working-tree diff review/i)
  assert.match(requestingReview, /git diff --stat\s+git diff/s)
  assert.match(requestingReview, /Do not require implementation subagents to commit/i)
  assert.match(reviewerTemplate, /Git Range or Working-Tree Diff to Review/)
  assert.match(reviewerTemplate, /git diff --stat\s+git diff/s)

  const v1Maintenance = readFileSync(join(process.cwd(), "docs", "v1-maintenance.md"), "utf8")
  const promptSync = readFileSync(join(process.cwd(), "docs", "prompt-sync.md"), "utf8")
  for (const source of [v1Maintenance, promptSync]) {
    assert.match(source, /Flat Workflow Subagent Policy \(2026-07-17\)/)
    assert.match(source, /read-only workflow agents exclude `quick`/i)
    assert.match(source, /formal plan review and final acceptance review remain orchestrator-owned/)
  }
})
```

- [ ] **Step 2: Run the RED template/doc test**

Run:

```powershell
& {
  $profileWasPresent = Test-Path Env:OCMM_PROFILE
  $profileBefore = $env:OCMM_PROFILE
  $noProfileWasPresent = Test-Path Env:OCMM_NO_PROFILE
  $noProfileBefore = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue
    node --test --experimental-strip-types --test-reporter=spec src/intent/prompt-loader.test.ts
    if ($LASTEXITCODE -eq 0) { throw "implementer-template RED unexpectedly passed" }
  } finally {
    if ($profileWasPresent) { $env:OCMM_PROFILE = $profileBefore } else { Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue }
    if ($noProfileWasPresent) { $env:OCMM_NO_PROFILE = $noProfileBefore } else { Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue }
  }
}
```

Expected: failure because the skill still asks implementers to commit and its Final Acceptance Review section still assumes a committed SHA range, the template has no delegation boundary and still says `Commit your work`, the requesting-code-review skill/template do not document working-tree diff review, and neither maintenance document has the dated policy section.

- [ ] **Step 3: Remove commit ownership from the v1 skill**

In `skills/v1/subagent-driven-development/SKILL.md`, make these edits:

1. In the numbered process, replace `c. Implementer implements, tests, commits, self-reviews` with `c. Implementer implements, tests, self-reviews, and reports changed files plus a suggested commit message. Subagents do not commit, stage, push, or run any Git write command.`
2. In the `DONE` status handling, add: `If the work needs a commit, the implementer reports the intended files and message; the orchestrator handles any Git write only after explicit user authorization.`
3. In `If subagent fails task`, replace `Dispatch fix subagent with specific instructions` with `Dispatch a fix subagent with specific instructions; the fix subagent also reports changes instead of committing.`
4. In `Final Acceptance Review`, replace the `Pass the full change range` bullet list with:

```markdown
Use the `requesting-code-review` skill. Pass either a committed range or an uncommitted working-tree/staged diff:
- committed range: `BASE_SHA`, `HEAD_SHA`, `DESCRIPTION`, and `PLAN_OR_REQUIREMENTS` when the orchestrator has already created a user-authorized commit;
- working-tree/staged diff: `git diff --stat`, `git diff`, `git diff --cached --stat`, `git diff --cached`, `DESCRIPTION`, and `PLAN_OR_REQUIREMENTS` when implementation subagents returned uncommitted changes.

Do not require implementation subagents to commit, stage, or push merely to create review SHAs. The orchestrator owns any Git write and performs it only after explicit user authorization.
```

5. Replace `each with the same SHAs and context` with `each with the same review input and context`.
6. Add this paragraph after the process list:

```markdown
**Git ownership:** Subagents do not commit, stage, push, or run any Git write command. They return changed files, verification evidence, and a suggested commit message to the orchestrator. The orchestrator performs any Git write only after explicit user authorization.
```

- [ ] **Step 4: Add the implementation-child boundary to the v1 template**

In `skills/v1/subagent-driven-development/implementer-prompt.md`, replace the numbered `Your Job` list with:

```markdown
    Once you're clear on requirements:
    1. Implement exactly what the task specifies
    2. Write tests (following TDD if task says to)
    3. Verify implementation works
    4. Self-review (see below)
    5. Report back with changed files, verification evidence, and a suggested commit message if a commit is needed
```

Then insert after that list and before `Work from:`:

```markdown
    ## Delegation Boundary

    Use direct tools first. If direct tools are insufficient and a separate bounded utility result materially improves this task, you may call only utility leaves permitted by your effective Task tool: `quick`, `code-search`, `explore`, `doc-search`, `research`, and `media-reader`. If the Task tool exposes fewer targets, use only the exposed subset.

    Do not launch `planner`, `plan-critic`, `reviewer`, `oracle`, or `oracle-high`. Do not launch another implementation or coordination workflow agent. If a skill requests a disallowed review or handoff, report that need to the orchestrator instead of dispatching it.

    After local verification, return status, changed files, commands, and evidence to the orchestrator. The orchestrator owns formal plan review and final acceptance review. It also owns planner, plan-critic, and review dispatch.
```

- [ ] **Step 5: Add working-tree diff review to the v1 review skill**

In `skills/v1/requesting-code-review/SKILL.md`, make these edits:

1. Replace `**1. Get git SHAs:**` with `**1. Choose the review input:**` and use this exact block:

````markdown
Use a committed range only when an orchestrator-owned, user-authorized commit already exists:

```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
git diff --stat $BASE_SHA..$HEAD_SHA
git diff $BASE_SHA..$HEAD_SHA
```

Working-tree diff review (use this when implementation subagents returned uncommitted changes):

```bash
git diff --stat
git diff
git diff --cached --stat
git diff --cached
```

Do not require implementation subagents to commit, stage, or push merely to create a review range. The orchestrator owns any Git write and performs it only after explicit user authorization.
````

2. Replace placeholders `{BASE_SHA}` and `{HEAD_SHA}` with `{REVIEW_INPUT}` in the placeholder list, described as `Commit range plus commands, or working-tree/staged diff commands and output`.
3. In `How to dispatch`, say the reviewer receives `code-reviewer.md` with the actual diff context and command output, not necessarily SHAs.
4. In the example, show the working-tree path with `git diff --stat` and `git diff` before dispatch, not a mandatory commit range.

In `skills/v1/requesting-code-review/code-reviewer.md`, replace the `## Git Range to Review` section with:

```markdown
## Git Range or Working-Tree Diff to Review

{REVIEW_INPUT}

If this is a committed range, inspect it with the provided `git diff <base>..<head>` commands. If this is uncommitted work, inspect the supplied working-tree/staged diff commands:

```bash
git diff --stat
git diff
git diff --cached --stat
git diff --cached
```

Do not request that an implementation subagent create a commit; ask the orchestrator for missing diff evidence instead.
```

- [ ] **Step 6: Update `docs/v1-maintenance.md` with exact dated adjustments**

Make all of these source-mapping updates:

1. Append to the `subagent-driven-development` skill row: `**2026-07-17 flat-workflow adjustment:** the skill and implementer template now forbid subagent Git writes, permit only effective utility-leaf delegation for implementation children, forbid planner/critic/reviewer and peer implementation dispatch, and return formal plan/final acceptance review ownership to the orchestrator. Its final acceptance review instructions now accept either committed ranges or working-tree/staged diffs.`
2. Append to the `requesting-code-review` skill row: `**2026-07-17 flat-workflow adjustment:** final review can consume either an orchestrator-owned committed range or an uncommitted working-tree/staged diff; implementation subagents do not commit merely to make review possible.`
3. Change the `requesting-code-review/code-reviewer.md` row's adjustment cell from `none (copied verbatim)` or its current text to `local flat-workflow review input: accepts committed ranges or working-tree/staged diffs and must ask the orchestrator for missing diff evidence instead of asking implementation subagents to commit`.
4. Change the implementer template table's adjustment cell from `none (copied verbatim)` to `local flat-workflow boundary: direct tools first; only permitted utility leaves; no planner/reviewer/peer implementation dispatch; no subagent Git writes; verified evidence returns to the orchestrator`.
5. Append to the `deepwork/gpt-5.6.md` row: `**2026-07-17 flat-workflow adjustment:** replaced distinct-deliverable nesting with role-aware utility/specialist allowlists, a strict necessity threshold, utility-leaf termination, and orchestrator-owned planning/review.`
6. Append to the `agents/planner.md` row: `**2026-07-17 flat-workflow adjustment:** planner discovery may use only read-only utility leaves; completed plans return to the orchestrator; planner no longer dispatches reviewers or plan-critic.`
7. Add this section before `## Shared Characteristics`:

```markdown
## Flat Workflow Subagent Policy (2026-07-17)

- Utility leaves are `quick`, `code-search`, `explore`, `doc-search`, `research`, and `media-reader`; they never dispatch.
- Standard workflow subagents may call only utility leaves. Read-only workflow agents exclude `quick` and may call only read-only utility leaves.
- `deep` and `complex` may additionally call only `coding`, `frontend`, `hard-reasoning`, `creative`, and `documenting` for materially useful bounded deliverables.
- Planner and reviewer roles return plans/findings to their caller. Formal planner dispatch, the plan-critic loop, formal plan review and final acceptance review remain orchestrator-owned.
- Final review accepts either an orchestrator-owned committed range or an uncommitted working-tree/staged diff; implementation subagents do not create commits merely to make review possible.
- `prompts/v1/agents/planner.md`, `prompts/v1/deepwork/gpt-5.6.md`, `skills/v1/subagent-driven-development/SKILL.md`, `skills/v1/subagent-driven-development/implementer-prompt.md`, and `skills/v1/requesting-code-review/SKILL.md` carry the source contract; Codex generated profiles and copied skills are refreshed from those sources.
```

8. Add a shared-characteristics item: `**Flat delegation graph**: effective prompt contracts and granular task permissions terminate at utility leaves and never transfer formal review ownership away from the orchestrator.`

- [ ] **Step 7: Update `docs/prompt-sync.md` with the cross-workflow contract**

Update the planner mapping and GPT-5.6 notes to mention the 2026-07-17 flat-workflow adjustment, then add this section before `## Observation-Only Upstream Items`:

```markdown
## Flat Workflow Subagent Policy (2026-07-17)

- The utility-leaf set is `quick`, `code-search`, `explore`, `doc-search`, `research`, and `media-reader`; utility leaves never dispatch.
- Standard workflow agents may call only utility leaves. Read-only workflow agents exclude `quick` and may call only `code-search`, `explore`, `doc-search`, `research`, and `media-reader`.
- Local coordinators `deep` and `complex` may additionally call only `coding`, `frontend`, `hard-reasoning`, `creative`, and `documenting`, and only for materially useful bounded deliverables.
- `prompts/{omo,v1,codex}/agents/planner.md` return completed plans to the orchestrator rather than launching reviewers or plan-critic.
- `prompts/{omo,v1,codex}/deepwork/gpt-5.6.md` use the same role-aware necessity threshold and no longer authorize arbitrary distinct-deliverable nesting.
- Effective config prompt contracts override broader skill/model/adapter wording. Formal planner dispatch, the plan-critic loop, formal plan review and final acceptance review remain orchestrator-owned.
- Final review may consume either a committed range or a working-tree/staged diff; implementation subagents report changes and do not create commits merely to create review SHAs.
```

- [ ] **Step 8: Run the GREEN template/doc tests**

Run:

```powershell
& {
  $profileWasPresent = Test-Path Env:OCMM_PROFILE
  $profileBefore = $env:OCMM_PROFILE
  $noProfileWasPresent = Test-Path Env:OCMM_NO_PROFILE
  $noProfileBefore = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue
    node --test --experimental-strip-types --test-reporter=spec src/intent/prompt-loader.test.ts
    if ($LASTEXITCODE -ne 0) { throw "implementer-template GREEN failed with exit code $LASTEXITCODE" }
  } finally {
    if ($profileWasPresent) { $env:OCMM_PROFILE = $profileBefore } else { Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue }
    if ($noProfileWasPresent) { $env:OCMM_NO_PROFILE = $noProfileBefore } else { Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue }
  }
}
```

Expected: prompt-loader tests pass and both maintenance records contain the exact dated policy language.

---

### Task 6: Make Codex adapter precedence explicit with TDD

**Files:**
- Modify: `src/codex/plugin-generator.test.ts:133-179,277-435`
- Modify: `src/codex/plugin-generator.ts:547-579`

**Interfaces:**
- Consumes: the contract-bearing prompt produced by `createConfigHandler` inside `buildCodexAgents`.
- Produces: `CodexAgentSpec.developerInstructions` in which generic dispatch-route compatibility cannot add targets or change review ownership.

- [ ] **Step 1: Add a contract extractor and in-memory profile assertions**

Add after the imports in `src/codex/plugin-generator.test.ts`:

```typescript
function extractDelegationContract(instructions: string): string {
  const match = instructions.match(/<ocmm-delegation-contract>([\s\S]*?)<\/ocmm-delegation-contract>/)
  assert.ok(match, "generated instructions are missing the delegation contract")
  return match[1]!
}
```

Extend `Codex agents are generated from Deepwork prompts and Codex-compatible fallback models` to locate `coding`, `quick`, and `plan-critic`, then add:

```typescript
  const coding = agents.find((agent) => agent.sourceName === "coding")
  const quick = agents.find((agent) => agent.sourceName === "quick")
  const planCritic = agents.find((agent) => agent.sourceName === "plan-critic")

  assert.ok(coding)
  assert.ok(quick)
  assert.ok(planCritic)
  assert.doesNotMatch(orchestrator.developerInstructions, /ocmm-delegation-contract/)
  assert.match(extractDelegationContract(quick.developerInstructions), /Do not dispatch any subagent/)
  assert.match(
    extractDelegationContract(coding.developerInstructions),
    /Allowed utility targets: `quick`, `code-search`, `explore`, `doc-search`, `research`, `media-reader`\./,
  )
  assert.match(extractDelegationContract(planner.developerInstructions), /`quick` is forbidden/)
  assert.match(extractDelegationContract(planCritic.developerInstructions), /plan-critic.*orchestrator-owned/i)
  assert.match(
    deep.developerInstructions,
    /Allowed specialist targets: `coding`, `frontend`, `hard-reasoning`, `creative`, `documenting`\./,
  )
  assert.match(
    planner.developerInstructions,
    /Compatibility routing applies only after the effective delegation contract permits delegation/,
  )
```

- [ ] **Step 2: Extend the written-bundle test**

In `generateCodexPlugin writes a self-contained bundle`, read these files:

```typescript
    const planner = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-planner.toml`), "utf8")
    const coding = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-coding.toml`), "utf8")
    const quick = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-quick.toml`), "utf8")
    const deep = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-deep.toml`), "utf8")
```

Add assertions:

```typescript
    assert.match(planner, /ocmm-delegation-contract/)
    assert.match(planner, /`quick` is forbidden/)
    assert.match(planner, /Return the completed plan to the orchestrator/)
    assert.match(coding, /Allowed utility targets: `quick`, `code-search`, `explore`, `doc-search`, `research`, `media-reader`/)
    assert.match(quick, /Do not dispatch any subagent/)
    assert.match(deep, /Allowed specialist targets: `coding`, `frontend`, `hard-reasoning`, `creative`, `documenting`/)
    assert.match(planner, /Compatibility routing applies only after the effective delegation contract permits delegation/)
```

- [ ] **Step 3: Run the RED Codex test**

Run:

```powershell
& {
  $profileWasPresent = Test-Path Env:OCMM_PROFILE
  $profileBefore = $env:OCMM_PROFILE
  $noProfileWasPresent = Test-Path Env:OCMM_NO_PROFILE
  $noProfileBefore = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue
    node --test --experimental-strip-types --test-reporter=spec src/codex/plugin-generator.test.ts
    if ($LASTEXITCODE -eq 0) { throw "Codex precedence RED unexpectedly passed" }
  } finally {
    if ($profileWasPresent) { $env:OCMM_PROFILE = $profileBefore } else { Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue }
    if ($noProfileWasPresent) { $env:OCMM_NO_PROFILE = $noProfileBefore } else { Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue }
  }
}
```

Expected: the profile contract assertions added by Task 3 pass, but the new compatibility-precedence assertion fails because the adapter currently says a callable generic route should still delegate without first deferring to the role contract.

- [ ] **Step 4: Make Codex compatibility subordinate to the role contract**

In `codexAgentInstructions`, insert this line immediately after the `Subagent Dispatch Compatibility (HARD-GATE)` introduction:

```typescript
    "Compatibility routing applies only after the effective delegation contract permits delegation. It never expands the role's target allowlist, permits a utility leaf to dispatch, or transfers planning/review ownership away from the orchestrator.",
```

Replace the next generic-routing sentence with:

```typescript
    "When delegation is permitted, use agent_type, agent_path, or agent_nickname as an exact profile selector only when the current tool schema or documentation explicitly guarantees that behavior. Otherwise use direct composition only when the tool can select the model and carry system/developer instructions plus skills. Otherwise, if the effective delegation contract permits delegation and a generic or flat dispatch tool is callable, use a self-contained message labeled TASK, ROLE, DELIVERABLE, SCOPE, VERIFY, REQUIRED SKILLS, CONTEXT, and CONSTRAINTS. Do not claim that a generic message loaded a dw-* profile, and do not pass a dw-*.toml installation artifact as a skill or prompt attachment. Use local execution when delegation is forbidden or no native dispatch tool is callable.",
```

- [ ] **Step 5: Run the GREEN Codex test**

Run:

```powershell
& {
  $profileWasPresent = Test-Path Env:OCMM_PROFILE
  $profileBefore = $env:OCMM_PROFILE
  $noProfileWasPresent = Test-Path Env:OCMM_NO_PROFILE
  $noProfileBefore = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue
    node --test --experimental-strip-types --test-reporter=spec src/codex/plugin-generator.test.ts
    if ($LASTEXITCODE -ne 0) { throw "Codex precedence GREEN failed with exit code $LASTEXITCODE" }
  } finally {
    if ($profileWasPresent) { $env:OCMM_PROFILE = $profileBefore } else { Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue }
    if ($noProfileWasPresent) { $env:OCMM_NO_PROFILE = $noProfileBefore } else { Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue }
  }
}
```

Expected: all generator tests pass; both in-memory specs and temp-written TOML profiles contain the role contract and the compatibility deference sentence.

---

### Task 7: Regenerate and prove the Codex bundle is deterministic

**Files:**
- Generate: `.agents/plugins/marketplace.json`
- Generate: `.codex/agents/*.toml` (the 22 exact files in the File Map)
- Generate: `plugins/deepwork/agents/*.toml` (the same 22 exact files)
- Generate: `plugins/deepwork/skills/deepwork-subagent-driven-development/SKILL.md`
- Generate: `plugins/deepwork/skills/deepwork-subagent-driven-development/implementer-prompt.md`
- Generate: `plugins/deepwork/skills/deepwork-requesting-code-review/SKILL.md`
- Generate: `plugins/deepwork/skills/deepwork-requesting-code-review/code-reviewer.md`
- Generate: remaining `plugins/deepwork/**` outputs from the existing generator

**Interfaces:**
- Consumes: compiled TypeScript, `prompts/codex/**`, v1/shared skills, and project-default config with both profile environment overrides absent.
- Produces: 22 Codex profiles in each profile directory, 14 generated skills, four MCP registrations, and a byte-stable second generation.

- [ ] **Step 1: Build TypeScript, generate twice, and compare complete tracked manifests**

Run:

```powershell
& {
  $profileWasPresent = Test-Path Env:OCMM_PROFILE
  $profileBefore = $env:OCMM_PROFILE
  $noProfileWasPresent = Test-Path Env:OCMM_NO_PROFILE
  $noProfileBefore = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue

    pnpm run build:ts
    if ($LASTEXITCODE -ne 0) { throw "build:ts failed with exit code $LASTEXITCODE" }
    pnpm run gen:codex-plugin
    if ($LASTEXITCODE -ne 0) { throw "first Codex generation failed with exit code $LASTEXITCODE" }

    function Get-GeneratedManifest {
      $paths = @(git ls-files -- ".agents/plugins/marketplace.json" ".codex/agents/**" "plugins/deepwork/**")
      if ($LASTEXITCODE -ne 0) { throw "git ls-files failed with exit code $LASTEXITCODE" }
      return @($paths | Sort-Object | ForEach-Object {
        $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_).Hash
        "$hash`t$_"
      })
    }

    $firstManifest = Get-GeneratedManifest
    pnpm run gen:codex-plugin
    if ($LASTEXITCODE -ne 0) { throw "second Codex generation failed with exit code $LASTEXITCODE" }
    $secondManifest = Get-GeneratedManifest
    $manifestDelta = @(Compare-Object -ReferenceObject $firstManifest -DifferenceObject $secondManifest)
    if ($manifestDelta.Count -ne 0) {
      $manifestDelta | Format-Table
      throw "second Codex generation changed tracked generated content"
    }
  } finally {
    if ($profileWasPresent) { $env:OCMM_PROFILE = $profileBefore } else { Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue }
    if ($noProfileWasPresent) { $env:OCMM_NO_PROFILE = $noProfileBefore } else { Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue }
  }
}
```

Expected generation output includes `22 agents, 14 skills, 4 MCP servers; config=opencode`, writes `.codex/agents` with 22 profiles, and writes `.agents/plugins/marketplace.json`. The second manifest comparison is empty.

- [ ] **Step 2: Verify generated contract coverage and source-copy fidelity**

Run:

```powershell
$contractProfiles = @(rg --hidden --files-with-matches "ocmm-delegation-contract" ".codex/agents" "plugins/deepwork/agents")
if ($contractProfiles.Count -ne 40) { throw "expected 40 non-primary generated contract profiles, found $($contractProfiles.Count)" }

$gpt56Profiles = @(rg --hidden --files-with-matches "Multiple steps, routine confirmation, or wanting another opinion are not sufficient" ".codex/agents" "plugins/deepwork/agents")
if ($gpt56Profiles.Count -ne 44) { throw "expected role-aware GPT-5.6 calibration in 44 generated profiles, found $($gpt56Profiles.Count)" }

function Normalize-CodexSkillMarkdown([string] $text) {
  $normalized = $text -replace '(?s)^\s*<!--.*?-->\s*(?=---\s*\r?\n)', ''
  $normalized = $normalized -replace '(?m)^name:\s+deepwork-', 'name: '
  $normalized = $normalized -replace '(?s)\r?\n## Codex Compatibility\r?\n\r?\n- When this skill mentions TodoWrite,[\s\S]*$', ''
  return $normalized.TrimEnd()
}

function Assert-NormalizedGeneratedSkill([string] $sourcePath, [string] $generatedPath) {
  $source = Normalize-CodexSkillMarkdown (Get-Content -LiteralPath $sourcePath -Raw)
  $generated = Normalize-CodexSkillMarkdown (Get-Content -LiteralPath $generatedPath -Raw)
  if ($source -ne $generated) { throw "generated skill body differs from source after Codex normalization: $generatedPath" }
  $generatedRaw = Get-Content -LiteralPath $generatedPath -Raw
  if ($generatedRaw -notmatch '(?m)^name:\s+deepwork-') { throw "generated skill is missing deepwork-* frontmatter rename: $generatedPath" }
  if ($generatedRaw -notmatch '## Codex Compatibility') { throw "generated skill is missing Codex Compatibility section: $generatedPath" }
}

git diff --no-index -- "skills/v1/subagent-driven-development/implementer-prompt.md" "plugins/deepwork/skills/deepwork-subagent-driven-development/implementer-prompt.md"
if ($LASTEXITCODE -ne 0) { throw "generated implementer template differs from its source" }

git diff --no-index -- "skills/v1/requesting-code-review/code-reviewer.md" "plugins/deepwork/skills/deepwork-requesting-code-review/code-reviewer.md"
if ($LASTEXITCODE -ne 0) { throw "generated code-reviewer template differs from its source" }

Assert-NormalizedGeneratedSkill "skills/v1/subagent-driven-development/SKILL.md" "plugins/deepwork/skills/deepwork-subagent-driven-development/SKILL.md"
Assert-NormalizedGeneratedSkill "skills/v1/requesting-code-review/SKILL.md" "plugins/deepwork/skills/deepwork-requesting-code-review/SKILL.md"

$generatedSubagentSkill = Get-Content -LiteralPath "plugins/deepwork/skills/deepwork-subagent-driven-development/SKILL.md" -Raw
if ($generatedSubagentSkill -notmatch 'Subagents do not commit, stage, push, or run any Git write command') { throw "generated subagent-driven-development skill lost Git ownership text" }
if ($generatedSubagentSkill -notmatch 'working-tree/staged diff') { throw "generated subagent-driven-development skill lost working-tree review path" }
$generatedReviewSkill = Get-Content -LiteralPath "plugins/deepwork/skills/deepwork-requesting-code-review/SKILL.md" -Raw
if ($generatedReviewSkill -notmatch 'Working-tree diff review') { throw "generated requesting-code-review skill lost working-tree review text" }
```

Expected: 40 contract-bearing profiles (all except two primaries across two directories), all 44 profiles carry the updated guarded GPT-5.6 layer, auxiliary copied prompt files are byte-identical, and generated `SKILL.md` files match their sources after stripping the known Codex-only frontmatter rename and compatibility section.

- [ ] **Step 3: Inspect generated changes without hand-editing them**

Run:

```powershell
git diff --stat -- ".agents/plugins/marketplace.json" ".codex/agents" "plugins/deepwork"
git diff --name-only -- ".agents/plugins/marketplace.json" ".codex/agents" "plugins/deepwork"
```

Expected: changed TOMLs are confined to the two generated agent directories, the v1 implementer/review skill copies change under generated skills, and any additional generated changes are source-derived. The marketplace manifest may have no textual diff.

---

### Task 8: Run integrated verification and produce the handoff receipt

**Files:**
- Verify: every source, test, documentation, and generated path in this plan
- Protect: `src/config/schema.ts`, `schema.json`, `src/permissions/index.ts`, the approved spec, and the four unrelated untracked documents

**Interfaces:**
- Consumes: the complete synchronized change set.
- Produces: targeted/full test evidence, build artifacts, scope checks, and a planner handoff with receipt status `waiting for receipt`.

- [ ] **Step 1: Run targeted tests, typecheck, full tests, and full build with profile restoration**

Run:

```powershell
& {
  $profileWasPresent = Test-Path Env:OCMM_PROFILE
  $profileBefore = $env:OCMM_PROFILE
  $noProfileWasPresent = Test-Path Env:OCMM_NO_PROFILE
  $noProfileBefore = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue

    node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/hooks/config.category.test.ts src/intent/prompt-loader.test.ts src/codex/plugin-generator.test.ts
    if ($LASTEXITCODE -ne 0) { throw "targeted tests failed with exit code $LASTEXITCODE" }
    pnpm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "typecheck failed with exit code $LASTEXITCODE" }
    pnpm test
    if ($LASTEXITCODE -ne 0) { throw "full test suite failed with exit code $LASTEXITCODE" }
    pnpm run build
    if ($LASTEXITCODE -ne 0) { throw "full build failed with exit code $LASTEXITCODE" }
  } finally {
    if ($profileWasPresent) { $env:OCMM_PROFILE = $profileBefore } else { Remove-Item Env:OCMM_PROFILE -ErrorAction SilentlyContinue }
    if ($noProfileWasPresent) { $env:OCMM_NO_PROFILE = $noProfileBefore } else { Remove-Item Env:OCMM_NO_PROFILE -ErrorAction SilentlyContinue }
  }
}
```

Expected: targeted tests pass with zero failures; `tsc --noEmit` exits zero; TypeScript and Cargo tests pass; TypeScript and release LSP builds complete successfully.

- [ ] **Step 2: Verify formatting, unchanged guards, and allowed scope**

Run:

```powershell
git diff --check
if ($LASTEXITCODE -ne 0) { throw "git diff --check found whitespace errors" }

git diff --exit-code -- "src/config/schema.ts" "schema.json" "src/permissions/index.ts"
if ($LASTEXITCODE -ne 0) { throw "maxDepth/schema/permission guard files changed" }

$allowedExact = @(
  "src/hooks/config.ts",
  "src/hooks/config.test.ts",
  "src/hooks/config.category.test.ts",
  "src/intent/prompt-loader.test.ts",
  "src/codex/plugin-generator.ts",
  "src/codex/plugin-generator.test.ts",
  "prompts/omo/agents/planner.md",
  "prompts/v1/agents/planner.md",
  "prompts/codex/agents/planner.md",
  "prompts/omo/deepwork/gpt-5.6.md",
  "prompts/v1/deepwork/gpt-5.6.md",
  "prompts/codex/deepwork/gpt-5.6.md",
  "skills/v1/subagent-driven-development/SKILL.md",
  "skills/v1/subagent-driven-development/implementer-prompt.md",
  "skills/v1/requesting-code-review/SKILL.md",
  "skills/v1/requesting-code-review/code-reviewer.md",
  "docs/v1-maintenance.md",
  "docs/prompt-sync.md",
  ".agents/plugins/marketplace.json"
)
$unexpected = @(git diff --name-only | Where-Object {
  $_ -notin $allowedExact -and
  $_ -notlike ".codex/agents/*.toml" -and
  $_ -notlike "plugins/deepwork/*"
})
if ($unexpected.Count -ne 0) {
  $unexpected
  throw "unexpected tracked files changed"
}
```

Expected: no whitespace errors, no diff in max-depth/schema guard files, and no tracked source outside the explicit file map.

- [ ] **Step 3: Verify prompt and permission invariants directly from the diff**

Run:

```powershell
rg -n "Nested subagent calls require a distinct deliverable" "prompts/omo/deepwork/gpt-5.6.md" "prompts/v1/deepwork/gpt-5.6.md" "prompts/codex/deepwork/gpt-5.6.md"
if ($LASTEXITCODE -eq 0) { throw "obsolete nested-delegation sentence remains" }

rg -n 'Submit the complete current plan to `plan-critic`|Use `reviewer`|Consult `reviewer`' "prompts/omo/agents/planner.md" "prompts/v1/agents/planner.md" "prompts/codex/agents/planner.md"
if ($LASTEXITCODE -eq 0) { throw "planner-owned review dispatch remains" }

rg -n "Allowed utility targets|Allowed specialist targets|Do not dispatch any subagent" "src/hooks/config.ts"
if ($LASTEXITCODE -ne 0) { throw "effective prompt contracts are missing" }
```

Expected: both prohibited searches have no matches; the config contract search finds all three contract shapes.

- [ ] **Step 4: Confirm protected untracked documents remain present and unstaged**

Run:

```powershell
$protectedDocs = @(
  "docs/superpowers/plans/2026-07-15-oracle-priority-variants-subagent-recovery.md",
  "docs/superpowers/plans/2026-07-17-fast-model-routing-profile-alias.md",
  "docs/superpowers/specs/2026-07-15-oracle-priority-variants-subagent-recovery-design.md",
  "docs/superpowers/specs/2026-07-17-fast-model-routing-profile-alias-design.md"
)
git status --short -- $protectedDocs
```

Expected: four `??` entries, proving the files remain untracked and were not staged. Do not open them.

- [ ] **Step 5: Review the complete synchronized diff without writing Git state**

Run:

```powershell
git status --short
git diff --stat
git diff
```

Expected: only planned tracked files and generated artifacts differ; the approved spec and unrelated untracked documents remain outside the diff. Do not stage or commit.

- [ ] **Step 6: Return the implementation handoff to the orchestrator**

Report all of the following:

- permission graph evidence for primaries, six utility leaves, six standard roles, six read-only roles, and two local coordinators;
- effective prompt contract evidence, including custom-prompt idempotence and explicit user-permission preservation;
- source prompt/template/doc synchronization evidence;
- Codex profile counts, auxiliary template equality, normalized generated-skill checks, and second-generation manifest equality;
- exact targeted/full verification commands and results;
- changed-file list and any residual risk;
- receipt status `waiting for receipt` so the orchestrator—not the planner or implementer—decides whether and when to dispatch `plan-critic` or final reviewers.

## Spec Coverage Matrix

| Approved requirement | Implemented by | Proof |
|---|---|---|
| Primaries retain broad task capability | Task 2 | exact scalar assertions for `orchestrator` and `builder` |
| Utility leaves terminate the graph | Tasks 2-3 | scalar deny tests plus leaf prompt contract |
| Standard workflow roles see only utility leaves | Tasks 2-3 | exact object equality and category contract tests |
| Read-only roles exclude `quick` and workflow/review agents | Tasks 2-4 | exact object equality, planner contract, synchronized planner/GPT tests |
| `deep`/`complex` get only utilities plus five specialists | Tasks 2-4 | exact object equality and local-coordinator prompt assertions |
| User permission overrides remain authoritative | Task 2 | scalar and host granular object regression tests |
| OpenCode last-match-wins rule order remains correct | Task 2 | `Object.entries(...)` exact-order assertions for every granular task object |
| Effective prompts override broader skills/calibration | Tasks 3 and 6 | terminal tagged block and Codex compatibility-deference tests |
| Planner returns plans; orchestrator owns critic/review | Tasks 3-5 | config, source prompt, implementer, and maintenance assertions |
| Three GPT-5.6 workflows reject arbitrary nesting | Task 4 | cross-workflow positive/negative prompt test |
| v1 implementer uses only permitted utilities | Task 5 | source-template test and generated-copy checks |
| implementation subagents never commit | Task 5 and Task 7 | skill/template source assertions plus normalized generated-skill checks |
| Final review works before or after an orchestrator-owned commit | Task 5 and Task 7 | requesting-code-review working-tree/range assertions plus normalized generated-skill checks |
| Prompt maintenance docs stay synchronized | Task 5 | dated source-of-truth assertions |
| Generated Codex profiles contain the same contracts | Tasks 6-7 | in-memory/TOML tests and 40/44 profile counts |
| `subagent.maxDepth` is unchanged | Task 8 | zero-diff guard on schema and runtime depth files |
| Profile environment cannot contaminate tests/generation | Tasks 1-2, 4-8 | save/clear/restore wrappers with `finally` |
| Generated bundle is deterministic | Task 7 | SHA-256 manifest equality across a second generation |
| Unrelated untracked docs remain untouched | Tasks 1 and 8 | scope constraint and final untracked-status check |

## Residual Risks

1. OpenCode granular task rules are order-sensitive; object construction must retain catch-all deny first and exact allows afterward. Exact `Object.entries(...)` assertions lock that order and membership.
2. Codex does not enforce OpenCode's `permission.task` object. Its generated profiles rely on the tagged prompt contract plus the adapter's explicit compatibility-deference sentence; tests therefore validate both layers.
3. Host-provided custom prompts can replace role text, so suffix application must remain independent from `extras.prompt` installation and idempotently append the contract to existing strings.
4. `explore` is a compatibility alias copied after built-in registration; its prompt needs explicit suffix reapplication and its permission must remain scalar deny.
5. Generation rewrites broad directories. The full tracked-file hash manifest and second generation catch accidental nondeterminism or source-copy drift.
6. No plan-critic receipt is created by this plan. Receipt status remains `waiting for receipt` until the orchestrator explicitly owns that next step.
