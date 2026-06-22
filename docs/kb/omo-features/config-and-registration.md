# omo Config Schema & Plugin Registration Architecture

> **Source**: `omo/packages/omo-opencode/src/config/schema/`, `omo/packages/omo-opencode/src/testing/create-plugin-module.ts`
> **Status**: Not migrated. Reference for ocmm's config design.
> **Principle**: omo-own — reimplement selectively (take patterns, not the full 37-field schema)
> **Note**: `omo/` refers to the gitignored reference implementation at `C:\Users\hugefiver\source\ocmm\omo\` (omo monorepo, npm `oh-my-opencode`). Paths in this doc are relative to that location.
> **Agent list caveat**: omo has 14 named agents (below). ocmm has its own 10 builtin agents — this doc is reference material for omo's schema, NOT a migration target.

## Config Schema Overview

**Root schema**: `OhMyOpenCodeConfigSchema` (Zod v4) — **37 root-level fields** across **32 schema files**.
**Config basename**: `oh-my-openagent.jsonc` (legacy: `oh-my-opencode.jsonc`)
**Re-exports barrel**: `omo/packages/omo-opencode/src/config/schema.ts`

### Root Config Fields (37)

| Field | Type | Default | Area |
|---|---|---|---|
| `$schema` | string? | undefined | Meta |
| `new_task_system_enabled` | boolean? | false | Task System |
| `default_run_agent` | string? | undefined | CLI |
| `agent_order` | string[]? (max 64) | undefined | Agent ordering |
| `agent_definitions` | string[]? | undefined | External agent files |
| `disabled_mcps` | AnyMcpName[]? | undefined | MCP gating |
| `disabled_agents` | string[]? | undefined | Agent gating |
| `disabled_skills` | string[]? | undefined | Skill gating |
| `disabled_hooks` | string[]? (56 names) | undefined | Hook gating |
| `disabled_commands` | BuiltinCommandName[]? | undefined | Command gating |
| `disabled_tools` | string[]? | undefined | Tool gating |
| `disabled_providers` | string[]? | undefined | Provider gating |
| `mcp_env_allowlist` | string[]? | undefined | MCP security (user-only) |
| `hashline_edit` | boolean? | false | Hashline |
| `model_fallback` | boolean? | false | Model fallback |
| `agents` | AgentOverridesSchema? | undefined | Agent overrides (15 named + catchall) |
| `categories` | CategoriesConfigSchema? | undefined | 8 built-in + custom |
| `claude_code` | ClaudeCodeConfigSchema? | undefined | CC compat |
| `sisyphus_agent` | SisyphusAgentConfigSchema? | undefined | Sisyphus orchestrator |
| `comment_checker` | CommentCheckerConfigSchema? | undefined | AI comment detection |
| `experimental` | ExperimentalConfigSchema? | undefined | 12 experimental flags |
| `auto_update` | boolean? | undefined | Auto-update |
| `skills` | SkillsConfigSchema? | undefined | Skill loading |
| `ralph_loop` | RalphLoopConfigSchema | `{enabled:false, default_max_iterations:100, default_strategy:"continue"}` | Ralph Loop |
| `runtime_fallback` | boolean \| RuntimeFallbackConfigSchema? | false | Reactive fallback |
| `background_task` | BackgroundTaskConfigSchema? | undefined | Background agents |
| `notification` | NotificationConfigSchema? | undefined | OS notifications |
| `model_capabilities` | ModelCapabilitiesConfigSchema? | undefined | Model cap cache |
| `openclaw` | OpenClawConfigSchema? | undefined | Discord/Telegram/HTTP |
| `i18n` | I18nConfigSchema? | undefined | i18n |
| `monitor` | MonitorConfigSchema | `{enabled:false, ...}` | Monitor system |
| `codegraph` | CodegraphConfigSchema | `{auto_provision:true, enabled:true}` | Codegraph |
| `team_mode` | TeamModeConfigSchema? | undefined | Team Mode |
| `keyword_detector` | KeywordDetectorConfigSchema? | undefined | Intent keywords |
| `babysitting` | BabysittingConfigSchema | `{timeout_ms:120000}` | Unstable agent monitoring |
| `git_master` | GitMasterConfigSchema | `{commit_footer:true, ...}` | Git master skill |
| `browser_automation_engine` | BrowserAutomationConfigSchema | `{provider:"playwright"}` | Browser |
| `websearch` | WebsearchConfigSchema? | undefined | Web search |
| `tmux` | TmuxConfigSchema | `{enabled:false, ...}` | Tmux |
| `tui` | TuiConfigSchema | `{sidebar:{enabled:true}}` | TUI sidebar |
| `sisyphus` | SisyphusConfigSchema? | undefined | Sisyphus task system |
| `start_work` | StartWorkConfigSchema | `{auto_commit:true}` | Start-work |
| `default_mode` | DefaultModeConfigSchema | `{ultrawork:false, ralph_loop:false}` | Default mode |
| `_migrations` | string[]? | undefined | Migration tracking |

### Agent Override Fields (21 per agent)

`AgentOverrideConfigSchema`: `model`, `fallback_models`, `variant`, `category`, `skills`, `temperature`, `top_p`, `prompt`, `prompt_append`, `tools`, `disable`, `description`, `mode`, `color`, `displayName`, `permission`, `maxTokens`, `thinking`, `reasoningEffort`, `textVerbosity`, `providerOptions`, `ultrawork`, `compaction`.

**Named agents**: build, plan, sisyphus, hephaestus, sisyphus-junior, OpenCode-Builder, prometheus, metis, momus, oracle, librarian, explore, multimodal-looker, atlas, + `.catchall()`.

**Built-in categories** (8): visual-engineering, ultrabrain, deep, artistry, quick, unspecified-low, unspecified-high, writing.

### Config Merge Semantics

- `agents`, `categories`, `team_mode`, `claude_code`: **deep merged** (depth ≤50, prototype-pollution safe)
- `disabled_*` arrays: **Set union** (concat + dedup)
- `disabled_providers`: **case-insensitive Set union**
- `mcp_env_allowlist`: **user-only** — walked configs cannot extend it (security)
- `agent_definitions`: **Set union**
- All other fields: **override replaces**

**Layers** (closest wins): User config → walked project configs (pwd up to $HOME).

## Plugin Registration (22-step init)

**Entry**: `createPluginModule()` in `testing/create-plugin-module.ts` → returns `{ id, server }`.

```
 1. installAgentSortShim()                # Patches Array.prototype.toSorted/sort
 2. initConfigContext("opencode", null)   # Detect opencode vs openagent layout
 3. logLegacyPluginStartupWarning()
 4. migrateLegacyWorkspaceDirectory()     # .sisyphus/ → .omo/
 5. detectDuplicateOmoPlugin()
 6. detectExternalSkillPlugin()
 7. injectServerAuthIntoClient()
 8. loadPluginConfig()                     # JSONC parse → merge → Zod validate → migrate
 9. selectRuntimeSecuritySkills()
10. initI18n(pluginConfig.i18n?.locale)
11. setAgentSortOrder(pluginConfig.agent_order)
12. initializeOpenClaw(pluginConfig.openclaw)
13. checkTeamModeDependencies()             # If team_mode.enabled
14. isTmuxIntegrationEnabled() → startTmuxCheck()
15. createFirstMessageVariantGate()
16. createManagers()                        # ConfigHandler, Tmux, Background, SkillMcp
17. createTools()                           # SkillContext + Categories + ToolRegistry
18. createHooks()                           # 5-tier hook composition
19. createPluginInterface()                 # 12 OpenCode hook handlers
20. createPluginDispose()
21. Add compacting + autocontinue hooks
22. Return { ...pluginInterface, ...compactingHooks, dispose }
```

### 14 OpenCode Hooks

| Hook | Purpose |
|---|---|
| `config` | 6-phase pipeline: provider → plugin-components → agents → tools → MCPs → commands |
| `tool` | 20-39 registered tools (config-gated) |
| `tool.definition` | Per-tool definition transform |
| `chat.message` | First-message variant, session setup, keyword detection |
| `chat.params` | Anthropic effort, think mode, runtime fallback override |
| `chat.headers` | Copilot `x-initiator` header |
| `command.execute.before` | Pre-command guards |
| `event` | Session lifecycle, openclaw, runtime fallback |
| `tool.execute.before` | 17 pre-tool guards |
| `tool.execute.after` | 19 post-tool hooks |
| `experimental.chat.messages.transform` | Context injection, thinking-block validation |
| `experimental.chat.system.transform` | System-message transforms |
| `experimental.session.compacting` | Context + todo preservation |
| `experimental.compaction.autocontinue` | Auto-resume after compaction |

### 5-Tier Hook Composition

1. **Core**: Session(22) + ToolGuard(17-18) + Transform(4-6)
2. **Continuation** (7): stop guard, compaction context, todo preserver, todo enforcer, babysitter, background notification, atlas
3. **Skill** (2): category skill reminder, auto-slash command

Total: **53 base, 60 with team_mode**. Gated via `disabled_hooks: string[]`.

## Config Migration System

**Location**: `omo/packages/utils/src/migration/` (core) + `omo/packages/omo-opencode/src/shared/migration/` (shims).

### What Gets Migrated

1. **Agent names** — legacy display names → canonical kebab-case (~20 entries)
2. **Hook names** — old → new; `null` removes obsolete hooks
3. **Model versions** — retired → current (e.g., `claude-opus-4-4` → `claude-opus-4-7`)
4. **Agent category** — legacy model strings → semantic category names (LEGACY, will be removed)
5. **Config key removals** — `omo_agent` → `sisyphus_agent`, `experimental.hashline_edit` → top-level `hashline_edit`

### Idempotency: Sidecar + In-Config Field

**Problem**: Users who reverted auto-migrated values and deleted `_migrations` triggered infinite migration loops.

**Solution** (from issue #3263): Two-layer tracking:

1. **Sidecar** (new, source of truth): `<configPath>.migrations.json` with `{appliedMigrations: [...]}`
2. **In-config `_migrations`** (legacy fallback): `z.array(z.string()).optional()`

On startup: read BOTH, union, skip already-applied, write new keys to sidecar AND strip `_migrations` from config body.

### Backup System

Timestamped backups: `<configPath>.bak.<ISO-timestamp>`. Only created when content actually changes. Migration proceeds even if backup/write fails — in-memory copy is always applied.

## Agent Sort Shim

**File**: `omo/packages/omo-opencode/src/shared/agent-sort-shim.ts`

**Why**: OpenCode 1.4.x ignores agent `order` field (sst/opencode#19127) and sorts by `agent.name` alphabetically, inverting intended sisyphus → hephaestus → prometheus → atlas order.

**What**: Patches `Array.prototype.toSorted` and `Array.prototype.sort` to inject a custom comparator for agent arrays:

1. **Detection** (`isAgentArray`): ≥2 elements, all objects with `name` property, ≥2 names match `AGENT_ARRAY_SENTINELS`.
2. **Ranking**: `agentRank` map from `DEFAULT_AGENT_ORDER` or user's `agent_order`. Unknown agents get `MAX_SAFE_INTEGER`.
3. **Patch**: `Object.defineProperty` (configurable, writable). Installed once via `installAgentSortShim()`.

**Safety guards**: Rejects null/non-object/non-string-name elements; requires ≥2 ranked agents to activate; `configurable: true` so tests can undo. Can be removed once OpenCode honors agent `order` field.

## i18n

**Config**: `I18nConfigSchema = z.object({ locale: z.string().optional() })`
**Locales**: `en` (source of truth), `zh` (spreads `en`, overrides 16 keys)
**Keys** (16, all toast domain): `toast.new_background_task`, `toast.task_completed`, `toast.task_completion_message`, `toast.fallback_prefix`, `toast.concurrency_info`, etc.

**Runtime** (`shared/i18n.ts`):
- `initI18n({ locale?, fallback? })` — called during plugin init
- `t(key, params?)` — `{{var}}` interpolation
- Locale priority: config `locale` → `process.env.LANG` → "en"

## Telemetry (PostHog)

**Core**: `omo/packages/telemetry-core/` (harness-neutral)
**Plugin shim**: `omo/packages/omo-opencode/src/shared/posthog.ts`

- **Event**: `omo_daily_active` (once per UTC day per machine)
- **Identity**: `sha256("oh-my-opencode:" + hostname)` — never raw hostname
- **Person profiles**: `$process_person_profile: false` — none created
- **Activity state**: `$XDG_DATA_HOME/oh-my-opencode/posthog-activity.json` → `{ lastActiveDayUTC }`
- **Opt-out**: `OMO_DISABLE_POSTHOG=1` or `OMO_SEND_ANONYMOUS_TELEMETRY=0`
- **Transport**: `posthog-node` SDK, `flushAt: 1` (immediate), host `https://us.i.posthog.com`

## Migration Assessment for ocmm

### Patterns to Adopt

| Pattern | Why | Effort |
|---|---|---|
| `disabled_*` gating arrays | Uniform enable/disable mechanism across agents/skills/hooks/commands/tools/mcps/providers | Low — schema only |
| Agent override schema (21 fields) | Rich per-agent config (model, variant, category, fallback, tools, permission, thinking, reasoningEffort) | Medium — extend ocmm's `ProfileEntrySchema` |
| Deep-merge config layering | User + project config merge without clobbering nested objects | Low — `deepMerge` util |
| Sidecar migration tracking | Avoid infinite migration loops; idempotent | Medium |
| Feature-gating via config flags | No central registry — features self-register conditionally | Low — pattern, not code |

### Patterns to Skip

| Pattern | Why Skip |
|---|---|
| Agent Sort Shim | Hack for OpenCode 1.4.x bug; may be fixed upstream by the time ocmm needs it |
| Telemetry (PostHog) | ocmm is a small plugin; opt-in telemetry adds complexity and privacy concerns |
| i18n (16 toast keys) | Low value for ocmm's scope; can add later if needed |
| Config basename migration | ocmm uses `ocmm.jsonc` already; no legacy basename to migrate from |
| 37-field root schema | ocmm doesn't need most of these (ralph_loop, openclaw, tmux, tui, monitor, babysitting, etc.) — select only what's needed |

### ocmm's Current Config (for comparison)

ocmm currently has:
- `workflow: "omo" | "v1"` (default "omo")
- `agents`, `categories` (with `ProfileEntrySchema`: model, variant, fallbackModels, requirement, disabled, description)
- `runtimeFallback` (enabled, dispatch, maxAttempts, cooldownSeconds, retryOnStatusCodes, retryOnPatterns)
- `intent` (enabled, skipAgents)
- `fallbackModels`, `systemDefaultModel` (reserved)
- `registerBuiltinAgents`, `debug`
- `profiles`, `activeProfile` (named overlays)

ocmm is missing: `disabled_*` arrays, per-agent `tools`/`permission`/`thinking`/`reasoningEffort` overrides, `mcp_env_allowlist`, skill sources config, config migration system.

### Recommended ocmm Config Extensions

1. **Add `disabled_hooks: string[]`** — uniform hook gating (needed for permission guards migration)
2. **Extend `ProfileEntrySchema`** with optional `tools`, `permission`, `thinking`, `reasoningEffort` fields (for agent override parity)
3. **Add `mcp` config section** — `disabled_mcps[]`, `mcp_env_allowlist[]`, built-in MCP toggles (for MCP migration)
4. **Add `hashline` config** — `{ enabled: boolean }` (for hashline migration)
5. **Add `rules` config** — `{ enabled: boolean, skipClaudeUserRules: boolean }` (for rules-engine migration)
6. **Add `ralph_loop` config** — `{ enabled, max_iterations, strategy }` (for loops migration, Phase 8a)
7. **Add `background_task` config** — concurrency, circuit breaker. **OPTIONAL** — OpenCode already provides `task`, `background_output`, `background_cancel` as built-in tools. Only needed if Phase 7 (task enhancement) is pursued. See design spec Phase 7.
8. **Skip**: telemetry, i18n, agent sort shim, config basename migration, openclaw/tmux/tui/monitor configs (out of scope for ocmm)
