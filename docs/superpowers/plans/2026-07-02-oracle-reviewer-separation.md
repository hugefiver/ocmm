# Oracle/Reviewer Separation Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate oracle (self-supervision, cross-gen) from reviewer (external review, flagship) via a generic `alias` config field, and add a final acceptance review loop to the v1 workflow.

**Architecture:** Oracle promoted to independent builtin agent with `promptSource: 'reviewer'` and `defaultAlias: 'reviewer'`. Generic `alias` field on agent/category entries inherits requirement only. Acceptance review loop dispatches oracle (simple default) or oracle+reviewer (complex) after task completion.

**Tech Stack:** TypeScript (Node 22+, strict), Zod schemas, node --test, Rust (ocmm-lsp unchanged).

**Spec:** `docs/superpowers/specs/2026-07-02-oracle-reviewer-separation-design.md`

---

## Task 1: Extend Agent type with promptSource and defaultAlias

**Files:**
- Modify: `src/shared/types.ts:78-83`

- [ ] **Step 1: Add optional fields to Agent type**

```typescript
export type Agent = {
  name: string
  /** Free-text role description (used in registered agent prompts). */
  description?: string
  requirement: ModelRequirement
  /** When set, load the prompt from this agent name instead of `name`. */
  promptSource?: string
  /** When set, inject `alias = defaultAlias` if the user config has no model config and no alias. */
  defaultAlias?: string
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS (no usages of the new fields yet)

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "refactor(types): add promptSource/defaultAlias to Agent type"
```

---

## Task 2: Add oracle builtin agent with cross-gen requirement

**Files:**
- Modify: `src/data/agents.ts:21-143`
- Modify: `src/data/agents.ts:1-17` (doc comment)
- Modify: `src/routing/resolver.ts:34-37` (AGENT_ALIASES)
- Modify: `src/codex/plugin-generator.ts:48-51` (AGENT_ALIASES)

- [ ] **Step 1: Update doc comment to list 10 built-in agents**

Add `oracle` to the doc comment block (lines 7-16), after `reviewer`:
```
 *   oracle         - self-supervision reviewer for work the agent itself produced
```

- [ ] **Step 2: Add oracle entry to BUILTIN_AGENTS array**

Insert after the `reviewer` entry (after line 63), before `doc-search`:

```typescript
  {
    name: "oracle",
    description:
      "Self-supervision reviewer for work the agent itself produced. Cross-gen model by default to avoid self-confirmation bias.",
    promptSource: "reviewer",
    defaultAlias: "reviewer",
    requirement: {
      variant: "high",
      fallbackChain: [
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "high" },
        { providers: ["openai", "github-copilot"], model: "gpt-5", variant: "high" },
        { providers: ["zhipu"], model: "glm-5.1" },
      ],
    },
  },
```

Rationale for chain order: cross-gen = different families from reviewer's gpt-first chain. Lead with claude (reviewer has gpt first), so default auto-selection picks a different family.

- [ ] **Step 3: Remove oracle from AGENT_ALIASES in resolver.ts**

Critical: if `oracle→reviewer` stays in `AGENT_ALIASES`, then `canonicalAgentName("oracle")` returns `"reviewer"`, and `BUILTIN_AGENT_INDEX.get("reviewer")` is used instead of oracle's own builtin entry — making oracle's cross-gen requirement dead code.

```typescript
const AGENT_ALIASES = new Map([
  ["explore", "code-search"],
])
```

Keep `explore→code-search` (explore is still a pure alias for code-search). Oracle is now a real builtin, not an alias.

- [ ] **Step 4: Remove oracle from AGENT_ALIASES in plugin-generator.ts**

```typescript
const AGENT_ALIASES = new Map([
  ["explore", "code-search"],
])
```

Same rationale as Step 3. Without this, `requirementForName("oracle")` canonicalizes to `"reviewer"` and oracle's builtin requirement is never consulted.

- [ ] **Step 5: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/data/agents.ts src/routing/resolver.ts src/codex/plugin-generator.ts
git commit -m "feat(agents): add oracle builtin + remove oracle alias mapping"
```

---

## Task 3: Add alias field to config schema

**Files:**
- Modify: `src/config/schema.ts:49-55` (ShorthandFields)
- Modify: `src/config/schema.ts:103-123` (AGENT_NAMES)
- Regenerate: `schema.json`

- [ ] **Step 1: Add alias to ShorthandFields**

`ShorthandFields` (schema.ts:49-55) is a plain object literal (NOT a `z.object`), spread into `AgentEntrySchema`/`CategoryEntrySchema` which call `.strict()`. Add the `alias` field to the object literal:

```typescript
const ShorthandFields = {
  description: z.string().optional(),
  alias: z.string().optional(),
  variant: VariantEnum.optional(),
  model: z.string().optional(),
  fallbackModels: z.array(ModelStringOrEntrySchema).optional(),
  requirement: ModelRequirementSchema.optional(),
}
```

Note: the real identifiers are `VariantEnum` (not `VariantSchema`), `ModelStringOrEntrySchema` (not `FallbackEntryConfig`), and `ModelRequirementSchema` (not `ModelRequirementConfig`). Do NOT rewrite the object as `z.object(...)`.

- [ ] **Step 2: Add 'oracle' to AGENT_NAMES array**

Add `"oracle"` to the AGENT_NAMES tuple (after `"reviewer"`).

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Regenerate schema.json**

Run: `pnpm run gen-schema`
Expected: `schema.json` updated with `alias` field in agent/category schemas and `oracle` in agent names enum.

- [ ] **Step 5: Verify schema.json diff**

Run: `git diff schema.json`
Expected: shows `alias` added to ShorthandFields-derived objects and `oracle` in the AGENT_NAMES enum.

- [ ] **Step 6: Commit**

```bash
git add src/config/schema.ts schema.json
git commit -m "feat(schema): add alias field and oracle agent name"
```

---

## Task 4: Implement alias resolution with cycle detection in normalize.ts

**Files:**
- Modify: `src/config/normalize.ts:46-79`
- Create: `src/config/normalize.test.ts`

- [ ] **Step 1: Write failing test for alias resolution**

Create `src/config/normalize.test.ts`:

```typescript
import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeShorthand } from "./normalize.ts"

test("normalizeShorthand resolves alias target requirement", () => {
  const target = { model: "openai/gpt-5.5", variant: "high" as const }
  const aliasEntry = { alias: "reviewer" }
  const resolveAlias = (name: string) =>
    name === "reviewer" ? normalizeShorthand(target) : undefined
  const result = normalizeShorthand(aliasEntry, { resolveAlias, selfName: "oracle" })
  assert.ok(result?.requirement)
  assert.equal(result.requirement!.fallbackChain[0]!.model, "gpt-5.5")
})

test("normalizeShorthand direct config overrides alias", () => {
  const aliasEntry = { alias: "reviewer", model: "zhipu/glm-5.1" }
  const resolveAlias = (name: string) =>
    name === "reviewer" ? normalizeShorthand({ model: "openai/gpt-5.5" }) : undefined
  const result = normalizeShorthand(aliasEntry, { resolveAlias, selfName: "oracle" })
  assert.equal(result!.requirement!.fallbackChain[0]!.model, "glm-5.1")
})

test("normalizeShorthand detects circular alias", () => {
  const resolveAlias = (name: string) =>
    name === "a" ? normalizeShorthand({ alias: "b" }, { resolveAlias, selfName: "a", visited: new Set(["a"]) }) as any
      : name === "b" ? normalizeShorthand({ alias: "a" }, { resolveAlias, selfName: "b", visited: new Set(["a", "b"]) }) as any
        : undefined
  assert.throws(
    () => normalizeShorthand({ alias: "a" }, { resolveAlias, selfName: "self", visited: new Set(["self"]) }),
    /circular alias/i,
  )
})

test("normalizeShorthand transitive alias A->B->C", () => {
  const resolveAlias = (name: string) => {
    if (name === "a") return normalizeShorthand({ alias: "b" }, { resolveAlias, selfName: "a", visited: new Set(["self", "a"]) })
    if (name === "b") return normalizeShorthand({ alias: "c" }, { resolveAlias, selfName: "b", visited: new Set(["self", "a", "b"]) })
    if (name === "c") return normalizeShorthand({ model: "zhipu/glm-5.1" })
    return undefined
  }
  const result = normalizeShorthand({ alias: "a" }, { resolveAlias, selfName: "self", visited: new Set(["self"]) })
  assert.equal(result!.requirement!.fallbackChain[0]!.model, "glm-5.1")
})

test("normalizeShorthand no alias and no model returns undefined requirement", () => {
  const result = normalizeShorthand({ description: "just a desc" })
  assert.equal(result!.requirement, undefined)
  assert.equal(result!.description, "just a desc")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:ts -- --test-name "alias"`
Expected: FAIL (normalizeShorthand does not accept options yet)

- [ ] **Step 3: Extend normalizeShorthand signature and add alias logic**

```typescript
export function normalizeShorthand(
  entry: AgentEntry | CategoryEntry | undefined,
  options?: {
    resolveAlias?: (name: string) => NormalizedShorthand | undefined
    visited?: Set<string>
    selfName?: string
  },
): NormalizedShorthand | undefined {
  if (!entry) return undefined
  const out: NormalizedShorthand = {}
  if (entry.description) out.description = entry.description
  if ("disabled" in entry && entry.disabled) out.disabled = true
  if ("tools" in entry && entry.tools) {
    out.permission = Object.fromEntries(
      Object.entries(entry.tools).map(([name, enabled]) => [name, enabled ? "allow" : "deny"]),
    ) as Record<string, PermissionValue>
  }
  if ("permission" in entry && entry.permission) {
    out.permission = { ...(out.permission ?? {}), ...entry.permission }
  }

  if (entry.requirement) {
    out.requirement = normalizeRequirementConfig(entry.requirement)
    return out
  }

  const chain: FallbackEntry[] = []
  if (entry.model) chain.push(parseModelString(entry.model, entry.variant))
  if (entry.fallbackModels) {
    for (const m of entry.fallbackModels) chain.push(normalizeFallbackEntryConfig(m))
  }
  if (chain.length > 0) {
    const req: ModelRequirement = { fallbackChain: chain }
    if (entry.variant) req.variant = entry.variant
    out.requirement = req
    return out
  }

  // alias resolution (only when no direct model config)
  if ("alias" in entry && typeof entry.alias === "string" && entry.alias) {
    const visited = options?.visited ?? new Set<string>()
    const selfName = options?.selfName ?? entry.alias
    if (visited.has(entry.alias)) {
      const path = [...visited, entry.alias].join(" -> ")
      throw new Error(`circular alias: ${path}`)
    }
    const resolveAlias = options?.resolveAlias
    if (resolveAlias) {
      const target = resolveAlias(entry.alias)
      if (target?.requirement) {
        out.requirement = target.requirement
      }
    }
  }

  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test:ts -- --test-name "alias"`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Run full typecheck**

Run: `pnpm run typecheck`
Expected: PASS (callers not passing options still work since options is optional)

- [ ] **Step 6: Commit**

```bash
git add src/config/normalize.ts src/config/normalize.test.ts
git commit -m "feat(normalize): resolve alias field with cycle detection"
```

---

## Task 5: Wire alias resolution into config hook

**Files:**
- Modify: `src/hooks/config.ts:15-18` (COMPAT_AGENT_ALIASES)
- Modify: `src/hooks/config.ts:31-65` (applyAgentEntry)
- Modify: `src/hooks/config.ts:126-132` (promptForBuiltinAgent)
- Modify: `src/hooks/config.ts:180-196` (builtin registration loop)
- Modify: `src/hooks/config.ts:257-273` (registerCompatAgentAliases)
- Modify: `src/hooks/config.test.ts`

- [ ] **Step 1: Remove oracle from COMPAT_AGENT_ALIASES**

```typescript
const COMPAT_AGENT_ALIASES = [
  { alias: "explore", target: "code-search" },
] as const
```

- [ ] **Step 2: Update promptForBuiltinAgent to use promptSource**

```typescript
function promptForBuiltinAgent(agent: Agent, override: NormalizedShorthand | undefined, workflow: string): string {
  const promptName = agent.promptSource ?? agent.name
  const rolePrompt = getAgentPrompt(promptName).trim()
  const modelPrompt = deepworkPromptForAgent(agent, override, workflow).trim()
  if (!rolePrompt) return modelPrompt
  if (!modelPrompt) return rolePrompt
  return `${rolePrompt}\n\n---\n\n<workflow-model-calibration>\nThe role prompt above is authoritative for this agent's scope, permissions, and output contract. Use the workflow/model guidance below only for reliability, model-family calibration, and general execution discipline when it does not conflict with the role prompt.\n\n${modelPrompt}\n</workflow-model-calibration>`
}
```

- [ ] **Step 3: Update builtin registration loop to handle defaultAlias**

In the loop at L180-196, before calling normalizeShorthand, inject defaultAlias:

```typescript
    for (const a of BUILTIN_AGENTS) {
      if (disabled.has(a.name)) continue
      const userEntry = cfg.agents?.[a.name]
      const effectiveEntry = injectDefaultAlias(userEntry, a)
      const norm = normalizeShorthand(effectiveEntry, {
        resolveAlias: (targetName: string) => normalizeShorthand(cfg.agents?.[targetName], {
          resolveAlias: (t2: string) => normalizeShorthand(cfg.agents?.[t2]),
          selfName: targetName,
          visited: new Set([a.name, targetName]),
        }),
        selfName: a.name,
        visited: new Set([a.name]),
      })
      const prompt = promptForBuiltinAgent(a, norm, cfg.workflow)
      // ... rest unchanged
    }
```

Add helper function `injectDefaultAlias`:

```typescript
function injectDefaultAlias(
  userEntry: unknown,
  agent: Agent,
): Record<string, unknown> | undefined {
  if (!isRecord(userEntry)) {
    // No user config; if agent has defaultAlias, create a minimal entry
    if (agent.defaultAlias) return { alias: agent.defaultAlias }
    return undefined
  }
  const hasDirectModel = userEntry.model || userEntry.fallbackModels || userEntry.requirement
  const hasAlias = userEntry.alias
  if (!hasDirectModel && !hasAlias && agent.defaultAlias) {
    return { ...userEntry, alias: agent.defaultAlias }
  }
  return userEntry as Record<string, unknown>
}
```

- [ ] **Step 4: Update applyAgentEntry to pass through alias-resolved requirement**

`applyAgentEntry` already uses `override?.requirement?.fallbackChain` if present (L42-44). Since normalizeShorthand now resolves alias into `requirement`, no change needed to applyAgentEntry itself. Verify this is correct by reading the function.

- [ ] **Step 5: Update registerCompatAgentAliases — no oracle change needed**

Oracle is now a builtin, registered in the main loop. `registerCompatAgentAliases` only handles `explore`. No code change beyond Step 1 (removing oracle from the array).

- [ ] **Step 6: Update test — oracle is now independent**

In `src/hooks/config.test.ts`, find tests that assert `cfg.agent.oracle === cfg.agent.reviewer` (L153) and update:

```typescript
// oracle is now an independent builtin with cross-gen requirement
assert.notEqual(cfg.agent.oracle, cfg.agent.reviewer)
assert.equal(cfg.agent.oracle?.model, "anthropic/claude-opus-4-7") // cross-gen head
assert.equal(cfg.agent.reviewer?.model, "openai/gpt-5.5") // flagship head
```

Find any test that disables oracle and verify it still works (disabling oracle no longer affects reviewer).

- [ ] **Step 7: Add test for alias field on user agents**

```typescript
test("user agent with alias inherits target requirement", () => {
  const cfg = parseConfig({
    agents: {
      reviewer: { model: "openai/gpt-5.5", variant: "high" },
      "my-reviewer": { alias: "reviewer" },
    },
  })
  const handler = createConfigHandler({ getConfig: () => cfg })
  // ... invoke handler, assert my-reviewer.model === "openai/gpt-5.5"
})
```

- [ ] **Step 8: Run typecheck and tests**

Run: `pnpm run typecheck && pnpm run test:ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/hooks/config.ts src/hooks/config.test.ts
git commit -m "feat(config): oracle independent builtin + alias field wiring"
```

---

## Task 6: Update resolver to handle alias in user config

**Files:**
- Modify: `src/routing/resolver.ts:140-155`
- Modify: `src/routing/resolver.ts:84-88` (userAgentRequirement)
- Modify: `src/routing/resolver.test.ts` (if exists)

- [ ] **Step 1: Check if resolver.test.ts exists**

Run: `Test-Path src/routing/resolver.test.ts`
If absent, create minimal test file.

- [ ] **Step 2: Update userAgentRequirement to resolve alias**

```typescript
function userAgentRequirement(
  entry: AgentEntry | CategoryEntry | undefined,
  allAgents?: Record<string, AgentEntry | CategoryEntry>,
  visited?: Set<string>,
): ModelRequirement | undefined {
  const norm = normalizeShorthand(entry, {
    resolveAlias: (target: string) => normalizeShorthand(allAgents?.[target], {
      resolveAlias: (t2: string) => normalizeShorthand(allAgents?.[t2], {
        // depth-limited recursion via visited
        visited: new Set([...(visited ?? []), target, t2]),
      }),
      selfName: target,
      visited: new Set([...(visited ?? []), target]),
    }),
    selfName: entry?.alias ?? "unknown",
    visited: visited ?? new Set(),
  })
  return norm?.requirement
}
```

- [ ] **Step 3: Update resolveModelRouting to pass agentsConfig to userAgentRequirement**

At L144-155, pass `agentsConfig` as the second arg:

```typescript
  if (agentName) {
    const canonicalUserReq = canonicalName && canonicalName !== agentName
      ? userAgentRequirement(agentsConfig?.[canonicalName], agentsConfig)
      : null
    const userReq =
      userAgentRequirement(agentsConfig?.[agentName], agentsConfig) ??
      canonicalUserReq
    if (userReq) {
      const r = resolveAgainstRequirement(userReq, modelID, inputVariant, "user-config")
      if (r) return applyCategoryVariantPolicy(r, agentName, inputVariant)
    }
  }
```

- [ ] **Step 4: Write resolver test for alias**

```typescript
test("resolveModelRouting resolves alias target", () => {
  const agentsConfig = {
    reviewer: { model: "openai/gpt-5.5", variant: "high" },
    oracle: { alias: "reviewer" },
  }
  const r = resolveModelRouting({
    agentName: "oracle",
    modelID: "gpt-5.5",
    providerID: "openai",
    agentsConfig,
  })
  assert.ok(r)
  assert.equal(r!.entry.model, "gpt-5.5")
})
```

- [ ] **Step 5: Run typecheck and tests**

Run: `pnpm run typecheck && pnpm run test:ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/routing/resolver.ts src/routing/resolver.test.ts
git commit -m "feat(resolver): resolve alias field in user agent config"
```

---

## Task 7: Update Codex plugin-generator for oracle tier and alias

**Files:**
- Modify: `src/codex/plugin-generator.ts:446-473` (tier table)
- Modify: `src/codex/plugin-generator.ts:507-520` (requirementForName)
- Modify: `src/codex/plugin-generator.test.ts`

- [ ] **Step 1: Update tier table — reviewer to Flagship, oracle to Cross-gen**

L448 Flagship row: add `${CODEX_AGENT_PREFIX}-reviewer`.
L451 Cross-gen review row: replace `${CODEX_AGENT_PREFIX}-reviewer` with `${CODEX_AGENT_PREFIX}-oracle`.

```typescript
| Flagship | ${CODEX_AGENT_PREFIX}-orchestrator, ${CODEX_AGENT_PREFIX}-planner, ${CODEX_AGENT_PREFIX}-builder, ${CODEX_AGENT_PREFIX}-clarifier, ${CODEX_AGENT_PREFIX}-deep, ${CODEX_AGENT_PREFIX}-hard-reasoning, ${CODEX_AGENT_PREFIX}-reviewer | Latest-gen flagship | xhigh |
| Mid | ... | ... |
| Mini | ... | ... |
| Cross-gen review | ${CODEX_AGENT_PREFIX}-oracle, ${CODEX_AGENT_PREFIX}-plan-critic | Previous-gen flagship | xhigh |
```

- [ ] **Step 2: Update cross-gen rule text (L462)**

Replace `${CODEX_AGENT_PREFIX}-reviewer and ${CODEX_AGENT_PREFIX}-plan-critic` with `${CODEX_AGENT_PREFIX}-oracle and ${CODEX_AGENT_PREFIX}-plan-critic`.

- [ ] **Step 3: Update requirementForName to resolve alias**

```typescript
function requirementForName(name: string, config: OcmmConfig): ModelRequirement | null {
  const canonical = AGENT_ALIASES.get(name) ?? name
  const resolveAlias = (target: string, visited: Set<string>): ModelRequirement | undefined => {
    if (visited.has(target)) {
      throw new Error(`circular alias: ${[...visited, target].join(" -> ")}`)
    }
    const nextVisited = new Set([...visited, target])
    const targetEntry = config.agents?.[target]
    const targetNorm = normalizeShorthand(targetEntry, {
      resolveAlias: (t2: string) => {
        const r = resolveAlias(t2, nextVisited)
        return r ? { requirement: r } : undefined
      },
      selfName: target,
      visited: nextVisited,
    })
    return targetNorm?.requirement
  }

  const agentOverride = normalizeShorthand(config.agents?.[name], {
    resolveAlias: (t: string) => {
      const r = resolveAlias(t, new Set([name]))
      return r ? { requirement: r } : undefined
    },
    selfName: name,
    visited: new Set([name]),
  }) ?? normalizeShorthand(config.agents?.[canonical])
  if (agentOverride?.disabled) return null
  if (agentOverride?.requirement) return agentOverride.requirement

  const builtinAgent = BUILTIN_AGENT_INDEX.get(canonical)
  if (builtinAgent) return builtinAgent.requirement

  const categoryOverride = normalizeShorthand(config.categories?.[name])
  if (categoryOverride?.requirement) return categoryOverride.requirement

  return BUILTIN_CATEGORY_INDEX.get(name)?.requirement ?? null
}
```

- [ ] **Step 4: Add test asserting oracle and reviewer have different Codex models**

`requirementForName` and `selectCodexModel` are module-private (not exported). Test via the exported `buildCodexAgents` instead, which returns `CodexAgentSpec[]` with a `model` field per agent.

In `src/codex/plugin-generator.test.ts`:

```typescript
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildCodexAgents } from "./plugin-generator.ts"
import { parseConfig } from "../config/schema.ts"

test("oracle and reviewer select different Codex models by default", async () => {
  const config = parseConfig({})
  const agents = await buildCodexAgents({ config, cwd: process.cwd() })
  const oracle = agents.find((a) => a.sourceName === "oracle")
  const reviewer = agents.find((a) => a.sourceName === "reviewer")
  assert.ok(oracle, "oracle agent should be generated")
  assert.ok(reviewer, "reviewer agent should be generated")
  assert.notEqual(oracle!.model, reviewer!.model,
    "oracle (cross-gen) and reviewer (flagship) must differ by default")
})
```

Note: the exact model strings depend on `selectCodexModel`'s provider-compatibility logic against the test environment's available providers. The assertion checks they differ, not specific values. If the test environment has no Codex-compatible provider, both may fall back to `systemDefaultModel`; in that case relax to `assert.ok(oracle && reviewer)` and assert on `preferredChain` head difference instead.

- [ ] **Step 5: Run typecheck and tests**

Run: `pnpm run typecheck && pnpm run test:ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/codex/plugin-generator.ts src/codex/plugin-generator.test.ts
git commit -m "feat(codex): oracle cross-gen tier + alias resolution"
```

---

## Task 8: Extend requesting-code-review skill with reviewer selection

**Files:**
- Modify: `skills/v1/requesting-code-review/SKILL.md`
- Modify: `skills/v1/requesting-code-review/code-reviewer.md` (if it references a single reviewer)

- [ ] **Step 1: Add Reviewer Selection section to skill**

After the "When to Request Review" section, insert:

```markdown
## Reviewer Selection

Dispatch the code reviewer subagent(s) based on task complexity:

| Task shape | Reviewer(s) | Rationale |
|---|---|---|
| Simple / single-stage (1-2 tasks, single module, no architectural change) | `oracle` | Self-supervision; plan-critic already reviewed the plan |
| Complex / large (3+ tasks, cross-module, architectural change, security/perf sensitive) | `oracle` + `reviewer` (both, in parallel) | Cross-gen self-supervision + external review |
| User habit override | user-specified | User may prefer reviewer for all cases |

**Default:** `oracle` for simple tasks. When in doubt, dispatch both.

**Parallel dispatch:** For complex tasks, dispatch oracle and reviewer as two separate subagents in the same message. Merge their feedback before acting.
```

- [ ] **Step 2: Update the "How to Request" section to pass reviewer name**

Update step 2 to accept a `reviewer` parameter:

```markdown
**2. Dispatch code reviewer subagent:**

Use Task tool with the appropriate reviewer agent type (`oracle` or `reviewer`), fill template at `code-reviewer.md`
```

- [ ] **Step 3: Run typecheck (no code change, just sanity)**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add skills/v1/requesting-code-review/
git commit -m "feat(skills): reviewer selection (oracle/reviewer/both) in requesting-code-review"
```

---

## Task 9: Add Final Acceptance Review stage to subagent-driven-development

**Files:**
- Modify: `skills/v1/subagent-driven-development/SKILL.md:135-140` (Integration section)
- Modify: `skills/v1/subagent-driven-development/SKILL.md` (add new section before Integration)

- [ ] **Step 1: Add Final Acceptance Review section**

Before the "Integration" section, insert:

```markdown
## Final Acceptance Review

After all tasks are marked complete, before declaring the work done:

1. **Assess complexity:**
   - Simple (1-2 tasks, single module, no architectural change) → one reviewer (`oracle` default).
   - Complex (3+ tasks, cross-module, architectural change, security/perf sensitive) → both `oracle` and `reviewer` in parallel.

2. **Dispatch acceptance review** via the requesting-code-review skill, passing `reviewer: oracle | reviewer | both` based on step 1.

3. **Process feedback** via the receiving-code-review skill. Verify each item against the codebase before implementing.

4. **If reviewer requests changes:** fix, re-review, loop. Do not declare done with open Critical/Important issues.

5. **Declare done** only when reviewer(s) approve.
```

- [ ] **Step 2: Update Integration section to note the acceptance stage**

```markdown
**Required workflow skills:**
- **writing-plans** - Creates the plan this skill executes
- **requesting-code-review** - Code review template; also used for final acceptance review
- **receiving-code-review** - How to handle reviewer feedback
```

- [ ] **Step 3: Commit**

```bash
git add skills/v1/subagent-driven-development/SKILL.md
git commit -m "feat(skills): final acceptance review stage in subagent-driven-development"
```

---

## Task 10: Update orchestrator and deepwork prompts

**Files:**
- Modify: `prompts/v1/agents/orchestrator.md`
- Modify: `prompts/v1/deepwork/default.md`
- Modify: `prompts/v1/deepwork/gpt.md`
- Modify: `prompts/v1/deepwork/glm.md`
- Modify: `prompts/v1/deepwork/gemini.md`
- Modify: `prompts/v1/deepwork/codex.md`
- Modify: `prompts/codex/agents/orchestrator.md`
- Modify: `prompts/codex/deepwork/default.md`
- Modify: `prompts/codex/deepwork/gpt.md`
- Modify: `prompts/codex/deepwork/glm.md`
- Modify: `prompts/codex/deepwork/gemini.md`
- Modify: `prompts/codex/deepwork/codex.md`

- [ ] **Step 1: Update orchestrator Delegation Table**

Split the reviewer row into two:

```markdown
| `oracle` | Self-supervision review (work the agent itself produced) |
| `reviewer` | External review (code not produced by the current agent) |
```

- [ ] **Step 2: Update orchestrator Injected Skill Utilization table**

requesting-code-review row obligation:
```markdown
| `requesting-code-review` | A task or major feature completes, or before merge to main | Dispatch reviewer subagent(s): `oracle` for simple self-supervision, both `oracle`+`reviewer` for complex/large tasks |
```

- [ ] **Step 3: Update deepwork REVIEWER GATE section (all 5 v1 + 5 codex files)**

Add oracle/reviewer duality:

```markdown
## REVIEWER GATE

Use a high-rigor reviewer when the task touches 3+ files, changes
security/performance/migration behavior, lasts 30+ minutes, or the user asks
for strict review. For final acceptance: `oracle` (self-supervision, cross-gen)
by default for simple tasks; both `oracle` and `reviewer` for complex/large
tasks. Reviewer verdict is binding. Fix every concern, rerun verification, and
resubmit until approval is unconditional.
```

- [ ] **Step 4: Commit**

```bash
git add prompts/v1/ prompts/codex/
git commit -m "feat(prompts): oracle/reviewer semantic split + acceptance review gate"
```

---

## Task 11: Sync docs and regenerate Codex bundle

**Files:**
- Modify: `docs/v1-maintenance.md`
- Modify: `docs/prompt-sync.md`
- Modify: `AGENTS.md`
- Regenerate: `plugins/ocmm/**`, `.agents/plugins/marketplace.json`

- [ ] **Step 1: Update v1-maintenance.md**

Add entries for:
- oracle promoted to independent builtin (promptSource=reviewer, defaultAlias=reviewer, cross-gen requirement)
- alias field added to ShorthandFields schema
- requesting-code-review extended with reviewer selection
- subagent-driven-development: Final Acceptance Review stage added
- Update Last synced date to 2026-07-02

- [ ] **Step 2: Update prompt-sync.md**

Add section "Oracle/Reviewer Separation (2026-07-02)":
- Codex tier: reviewer→Flagship, oracle→Cross-gen
- requirementForName resolves alias field
- Acceptance review loop synced to codex prompts

- [ ] **Step 3: Update AGENTS.md**

In the "Codex bundle should expose" section, add note:
```
The Codex bundle should expose the workflow skill as `deepwork` and generated agent profiles with the `dw-*` prefix, including `dw-oracle` (cross-gen default, separate from `dw-reviewer` which is flagship default) and `dw-creative`.
```

- [ ] **Step 4: Build TS and regenerate Codex bundle**

Run: `pnpm run build:ts && pnpm run gen:codex-plugin`
Expected: `wrote plugins/ocmm (22 agents, 13 skills, 4 MCP servers; config=opencode)` — agent count increases from 21 to 22 (oracle added).

- [ ] **Step 5: Verify dw-oracle.toml differs from dw-reviewer.toml**

Run: `git diff plugins/ocmm/agents/dw-oracle.toml plugins/ocmm/agents/dw-reviewer.toml`
Expected: different model values (oracle = claude/gemini cross-gen, reviewer = gpt flagship).

- [ ] **Step 6: Verify bundle idempotency**

Run: `pnpm run gen:codex-plugin` again; `git diff --exit-code`
Expected: no diff (idempotent).

- [ ] **Step 7: Commit**

```bash
git add docs/ AGENTS.md plugins/ocmm/ .agents/plugins/marketplace.json
git commit -m "docs+chore: sync oracle/reviewer separation + regenerate codex bundle"
```

---

## Task 12: Final verification

- [ ] **Step 1: Full typecheck**

Run: `pnpm run typecheck`
Expected: PASS, zero errors

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: all TS tests pass (650+ existing + new alias/cycle/oracle tests), all Rust LSP tests pass (9)

- [ ] **Step 3: Schema regeneration check**

Run: `pnpm run gen-schema && git diff --exit-code schema.json`
Expected: no diff (schema already regenerated in Task 3)

- [ ] **Step 4: Codex bundle idempotency**

Run: `pnpm run gen:codex-plugin && git diff --exit-code`
Expected: no diff

- [ ] **Step 5: Manual spot-check**

Inspect `plugins/ocmm/agents/dw-oracle.toml` and confirm:
- `model` is a cross-gen model (e.g., `claude-opus-4-7` or `gemini-3.1-pro`), NOT `gpt-5.5`
- `developer_instructions` contains reviewer.md prompt text (promptSource=reviewer)

Inspect `plugins/ocmm/agents/dw-reviewer.toml` and confirm:
- `model` is `gpt-5.5` (flagship)
- `developer_instructions` contains reviewer.md prompt text

- [ ] **Step 6: No commit needed if all green**

All prior task commits already in place. This task is verification only.
