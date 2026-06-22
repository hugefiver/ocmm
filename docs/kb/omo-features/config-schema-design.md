# ocmm Config Schema Design for Feature Migration

> **Status**: Design document (self-designed)
> **Goal**: Extend ocmm's `OcmmConfigSchema` to support progressive migration of omo features, each independently toggleable.
> **Principle**: Each feature gets its own config namespace with an `enabled` flag. Unknown keys still rejected (`.strict()`). Backward-compatible — all new fields optional with defaults.

## Design Constraints

1. **Backward compatible** — existing `ocmm.jsonc` configs must work unchanged. All new fields optional with sensible defaults.
2. **Feature-isolated** — each migrated feature gets its own namespace. No cross-feature coupling in config.
3. **Uniform gating** — adopt omo's `disabled_hooks: string[]` pattern for uniform hook enable/disable.
4. **Strict schema** — unknown keys rejected (`.strict()` preserved). Forces explicit config, catches typos.
5. **Profile-compatible** — new fields must work with the existing `profiles` overlay system.
6. **Progressive** — fields can be added one-at-a-time as features migrate. No big-bang schema change.

## Current Schema (baseline)

```typescript
// src/config/schema.ts (current, 177 lines)
OcmmConfigSchema = {
  categories, agents, disabledAgents, fallbackModels, systemDefaultModel,
  workflow: "omo" | "v1",       // default "omo"
  intent: { enabled, skipAgents },
  runtimeFallback: { enabled, dispatch, maxAttempts, cooldownSeconds, retryOnStatusCodes, retryOnPatterns },
  profiles: Record<string, ProfileEntry>,
  activeProfile: string?,
  registerBuiltinAgents: boolean,  // default true
  promptsRoot: string?,
  debug: boolean,                  // default false
}
```

## Proposed Schema Extensions

### Phase 1: Feature Gating Foundation

Add uniform gating arrays (omo pattern). These are the **only** schema changes needed before any feature migration — they provide the toggle mechanism.

```typescript
// New root-level fields
disabledHooks: z.array(z.string()).optional(),       // hook names to disable
disabledTools: z.array(z.string()).optional(),        // tool names to disable
disabledSkills: z.array(z.string()).optional(),       // skill names to disable
disabledCommands: z.array(z.string()).optional(),     // command names to disable
disabledMcps: z.array(z.string()).optional(),         // MCP names to disable
```

**Why no `disabledAgents`?** — ocmm already has `disabledAgents`. No duplicate.

**Why no `disabledProviders`?** — OpenCode's own `opencode.json` handles provider disabling. ocmm shouldn't duplicate.

**Profile compatibility**: Add these arrays to `ProfileEntrySchema` too. Profile overlay **replaces** arrays (not unions) — consistent with existing `disabledAgents` behavior in profiles.

### Phase 2: Per-Feature Config Namespaces

Each migrated feature gets a namespace. All follow the same pattern: `{ enabled: boolean, ...featureSpecificFields }`.

```typescript
// Hashline (edit reliability)
hashline: z.object({
  enabled: z.boolean().default(false),
}).default({ enabled: false }),

// Rules engine (workspace rule injection)
rules: z.object({
  enabled: z.boolean().default(false),
  skipClaudeUserRules: z.boolean().default(false),
}).default({ enabled: false, skipClaudeUserRules: false }),

// MCP infrastructure
mcp: z.object({
  // disabledMcps lives at root level (see Phase 1) for uniformity
  envAllowlist: z.array(z.string()).default([]),  // user-only, security
  websearch: z.object({
    provider: z.enum(["exa", "tavily"]).default("exa"),
  }).default({ provider: "exa" }),
  // codegraph, lsp, context7, grep_app are auto-configured, no user toggle needed
}).default({ envAllowlist: [] }),

// Background agents (task delegation)
backgroundTask: z.object({
  defaultConcurrency: z.number().int().min(1).default(5),
  providerConcurrency: z.record(z.string(), z.number().int().min(0)).default({}),
  modelConcurrency: z.record(z.string(), z.number().int().min(0)).default({}),
  maxDepth: z.number().int().min(1).default(5),
  staleTimeoutMs: z.number().int().min(60000).default(180000),
  taskTtlMs: z.number().int().min(300000).default(1800000),
  maxToolCalls: z.number().int().min(10).default(4000),
  circuitBreaker: z.object({
    enabled: z.boolean().default(true),
    consecutiveThreshold: z.number().int().min(5).default(20),
  }).default({ enabled: true, consecutiveThreshold: 20 }),
}).default({}),

// Skills (shared-skills loading)
skills: z.object({
  sources: z.array(z.union([
    z.string(),
    z.object({ path: z.string(), recursive: z.boolean().default(true), glob: z.string().optional() }),
  ])).default([]),
  enable: z.array(z.string()).default([]),
  disable: z.array(z.string()).default([]),
}).default({}),

// Comment checker (AI slop detection)
commentChecker: z.object({
  enabled: z.boolean().default(false),
  customPrompt: z.string().optional(),
}).default({ enabled: false }),

// Team mode (parallel multi-agent)
teamMode: z.object({
  enabled: z.boolean().default(false),
  maxParallelMembers: z.number().int().min(1).max(8).default(4),
  maxMembers: z.number().int().min(1).max(8).default(8),
  maxMessagesPerRun: z.number().int().min(1).default(10000),
  maxWallClockMinutes: z.number().int().min(1).default(120),
}).default({ enabled: false }),

// Ralph Loop (autonomous continuation — Phase 8a)
ralphLoop: z.object({
  enabled: z.boolean().default(false),
  defaultMaxIterations: z.number().int().min(1).max(1000).default(100),
  defaultStrategy: z.enum(["continue", "reset"]).default("continue"),
  stateDir: z.string().optional(),
}).default({ enabled: false, defaultMaxIterations: 100, defaultStrategy: "continue" }),
```

### Phase 3: Agent Override Extensions

Extend `AgentEntrySchema` with optional fields for richer agent configuration (omo parity):

```typescript
// Extend ShorthandFields in AgentEntrySchema
const ShorthandFields = {
  // ... existing fields ...
  description: z.string().optional(),
  variant: VariantEnum.optional(),
  model: z.string().optional(),
  fallbackModels: z.array(ModelStringOrEntrySchema).optional(),
  requirement: ModelRequirementSchema.optional(),
  
  // NEW: per-agent tool gating
  tools: z.record(z.string(), z.boolean()).optional(),
  // NEW: per-agent skill injection
  skills: z.array(z.string()).optional(),
  // NEW: per-agent prompt append (supports file:// URIs)
  promptAppend: z.string().optional(),
  // NEW: model params overrides
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().positive().optional(),
  thinking: z.object({
    type: z.enum(["enabled", "disabled"]),
    budgetTokens: z.number().int().positive().optional(),
  }).optional(),
  reasoningEffort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]).optional(),
}
```

**Why add these?** — Some omo features (team mode, background agents) need per-agent tool gating and skill injection. Without these, the features can't be fully configured.

## Full Proposed Schema (target state)

```typescript
OcmmConfigSchema = {
  // ===== Existing (unchanged) =====
  categories: Record<string, CategoryEntry>?,
  agents: Record<string, AgentEntry>?,           // extended (see Phase 3)
  disabledAgents: string[]?,
  fallbackModels: string[]?,                      // reserved
  systemDefaultModel: string?,                    // reserved
  workflow: "omo" | "v1",                         // default "omo"
  intent: { enabled, skipAgents },
  runtimeFallback: { enabled, dispatch, maxAttempts, cooldownSeconds, retryOnStatusCodes, retryOnPatterns },
  profiles: Record<string, ProfileEntry>,
  activeProfile: string?,
  registerBuiltinAgents: boolean,                  // default true
  promptsRoot: string?,
  debug: boolean,                                  // default false

  // ===== Phase 1: Feature Gating =====
  disabledHooks: string[]?,
  disabledTools: string[]?,
  disabledSkills: string[]?,
  disabledCommands: string[]?,
  disabledMcps: string[]?,

  // ===== Phase 2: Feature Namespaces =====
  hashline: { enabled },
  rules: { enabled, skipClaudeUserRules },
  mcp: { envAllowlist, websearch: { provider } },
  backgroundTask: { defaultConcurrency, providerConcurrency, modelConcurrency, maxDepth, staleTimeoutMs, taskTtlMs, maxToolCalls, circuitBreaker: { enabled, consecutiveThreshold } },
  skills: { sources, enable, disable },
  commentChecker: { enabled, customPrompt? },
  teamMode: { enabled, maxParallelMembers, maxMembers, maxMessagesPerRun, maxWallClockMinutes },
}
```

## Design Decisions

### 1. Namespace vs Flat

**Decision**: Namespace (e.g., `hashline: { enabled }`) over flat (e.g., `hashlineEnabled: boolean`).

**Rationale**: Namespaces scale — a feature may grow from 1 field to 5+ fields. Flat fields pollute the root. Namespaces also make `disabled_hooks` cleaner: `"hashline-read-enhancer"` vs `"hashlineReadEnhancer"`.

### 2. `disabled_hooks` vs per-feature `enabled`

**Decision**: Both, with clear separation:
- `disabled_hooks: string[]` — disable individual hook handlers by name (fine-grained)
- `feature.enabled: boolean` — master switch for the entire feature (coarse-grained)

**Rationale**: A feature may have multiple hooks. `feature.enabled = false` disables all of them. `disabled_hooks: ["hashline-read-enhancer"]` disables just one hook within the feature. This matches omo's pattern.

### 3. Profile Overlay Semantics

**Decision**: Feature namespaces deep-merge in profiles (like `agents`/`categories`). Gating arrays (`disabledHooks`, etc.) **replace** in profiles (like existing `disabledAgents`).

**Rationale**: Deep-merge lets a profile override just `teamMode.maxParallelMembers` without redefining the whole `teamMode` object. Replace semantics for gating arrays matches existing `disabledAgents` behavior — a profile is a mode switch, not a patch.

### 4. What NOT to Add

| Field | Why Skip |
|---|---|
| `agent_order: string[]` | ocmm has fewer agents; ordering not critical. Can add if needed. |
| `agent_definitions: string[]` | External agent definition files — complex, low value for ocmm. |
| `i18n: { locale }` | 16 toast keys, low value. Add when ocmm has real i18n needs. |
| Telemetry config | Privacy concern, ocmm is small. Skip. |
| `ralph_loop`, `openclaw`, `tmux`, `tui`, `monitor`, `babysitting` | Out of scope for ocmm. These are omo-specific features. |
| `keyword_detector` | ocmm already has `intent` with keyword detection. Don't duplicate. |
| `experimental` flags bag | ocmm should be explicit about experimental features, not hide them in a bag. |
| `claude_code` compat | ocmm is OpenCode-native, not a Claude Code compat layer. |
| Config migration system | ocmm has no legacy config to migrate from. Add only if breaking changes happen. |
| Agent Sort Shim | Hack for OpenCode 1.4.x bug. Skip unless needed. |

### 5. Migration Path for Config Changes

Each schema extension ships independently:
1. Add the new field(s) to `OcmmConfigSchema` (all optional, with defaults)
2. Add to `ProfileEntrySchema` if profile-overlay is needed
3. Implement the feature that consumes the field
4. No migration needed — all new fields are optional with defaults

**No sidecar migration system needed** (unlike omo) because ocmm has no legacy config basename and no breaking field renames. If a breaking change ever happens, add the sidecar pattern then.

## Hook Name Registry

When features migrate, their hooks must be registered in a central name list for `disabledHooks` validation. Proposed naming convention: `<feature>-<action>`.

```
// Hashline
"hashline-read-enhancer"

// Rules engine
"rules-injector"
"directory-agents-injector"
"directory-readme-injector"

// Permission guards (safety)
"write-existing-file-guard"
"bash-file-read-guard"
"notepad-write-guard"
"webfetch-redirect-guard"
"fsync-skip-warning"
"comment-checker"

// Permission guards (quality)
"empty-task-response-detector"
"tool-output-truncator"
"question-label-truncator"
"plan-format-validator"
"json-error-recovery"

// Permission guards (compatibility)
"read-image-resizer"

// Team mode (conditional)
"team-tool-gating"
```

This list grows as features migrate. The `disabledHooks` field accepts any string (no enum validation) to avoid coupling schema changes to feature migration. Runtime warns on unknown hook names.

## Implementation Order

Schema changes should land **before** feature implementations, in small PRs:

1. **PR 1**: Add `disabledHooks`, `disabledTools`, `disabledSkills`, `disabledCommands`, `disabledMcps` (Phase 1). No behavior change — just schema fields that accept values but nothing reads them yet.

2. **PR 2**: Extend `AgentEntrySchema` with `tools`, `skills`, `promptAppend`, `temperature`, `topP`, `maxTokens`, `thinking`, `reasoningEffort` (Phase 3). No behavior change — fields parsed but not consumed.

3. **PR 3+**: For each migrating feature, add its namespace (e.g., `hashline: { enabled }`) in the same PR as the feature implementation. The config field and its consumer land together.

This avoids a big-bang schema change and lets each feature migration be self-contained.
