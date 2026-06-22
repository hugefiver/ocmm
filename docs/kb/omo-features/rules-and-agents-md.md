# rules-engine + agents-md-core + omo-opencode Integration

> **Source**: `omo/packages/rules-engine/`, `omo/packages/agents-md-core/`, `omo/packages/omo-opencode/src/hooks/rules-injector/`, `omo/packages/omo-opencode/src/hooks/directory-agents-injector/`
> **Status**: Not migrated. HIGH migration value.
> **Principle**: omo-own → reimplement (matching + discovery logic)
> **Note**: `omo/` refers to the gitignored reference implementation at `C:\Users\hugefiver\source\ocmm\omo\` (omo monorepo, npm `oh-my-opencode`). Paths in this doc are relative to that location.

## Architecture

Two packages + omo-opencode integration layer:

```
@oh-my-opencode/rules-engine      → Rule discovery + matching (picomatch)
@oh-my-opencode/agents-md-core    → Thin wrapper for AGENTS.md walk-up
omo-opencode/hooks/rules-injector/ → 19-file subsystem: persistence, cache, hydration
omo-opencode/hooks/directory-agents-injector/ → 7 files: AGENTS.md on Read
```

## rules-engine — Two API Surfaces

### Simple API (`src/index.ts`)

| Function | Purpose |
|----------|---------|
| `findRuleFiles(input)` | Walks UP from target file, scans rule subdirs |
| `shouldApplyRule(rule, filePath)` | Picomatch-based matching |
| `findAgentsMdUp(input)` | Walk-up AGENTS.md discovery |
| `createRuleScanCache()` | Per-session candidate cache |
| `createAgentsMdCache()` | Global AGENTS.md cache |

### Engine API (`src/engine/index.ts`)

Stateful `createEngine()` with:
- Static + dynamic rule loading
- Per-session dedup
- Truncation budgets (see below)
- `findRuleCandidates()` + `findPluginBundledCandidates()`

## Rule Discovery Logic

Walks **UP** from target file's directory toward project root, scanning:

```typescript
PROJECT_RULE_SUBDIRS = [
  [".omo", "rules"],           // priority 0 (highest)
  [".claude", "rules"],        // priority 1
  [".cursor", "rules"],       // priority 2
  [".github", "instructions"],// priority 3
  [".sisyphus", "rules"],     // priority 5 (deprecated)
]
PROJECT_RULE_FILES = [".github/copilot-instructions.md"]  // priority 4

// Engine-only additions:
PROJECT_SINGLE_FILES = [".github/copilot-instructions.md", "CONTEXT.md"]
BUNDLED_RULE_SUBDIR = "bundled-rules"
SCANNER_EXCLUDED_DIRS = ["node_modules", ".git", "dist", "build", ".turbo", ".next", "coverage"]
```

User home dirs (lowest priority, `GLOBAL_DISTANCE = 9999`):
```typescript
OPENCODE_USER_RULE_DIRS = [".omo/rules", ".opencode/rules", ".sisyphus/rules"]
USER_RULE_DIR = ".claude/rules"  // skipClaudeUserRules flag can disable
```

## Rule Format (YAML Frontmatter)

Files are `.md` or `.mdc` with optional YAML frontmatter:

```typescript
interface RuleMetadata {
  description?: string;
  globs?: string | string[];     // picomatch globs (primary)
  paths?: string | string[];     // Claude Code alias → normalized to globs
  applyTo?: string | string[];   // Copilot alias → normalized to globs
  alwaysApply?: boolean;         // Bypass matching entirely
}
```

## Matching (`src/matcher.ts`)

- Uses `picomatch` with `{ dot: true, bash: true }`
- Matches against: relative path from project root + basename
- Negative globs (prefixed with `!`) excluded
- LRU cache (256 entries)
- `alwaysApply: true` skips matching

## Injection Hooks

### A) `rulesInjector` — Tool Guard Tier (`tool.execute.after`)

- **Fires on**: `["read", "write", "edit", "multiedit"]` tool completion
- **Input**: `{ tool, sessionID, callID }`
- **Output (mutated)**: `{ title, output, metadata }`
- **Behavior**: Extracts filePath from `output.title` → finds rule files → parses frontmatter → matches globs → appends matched rules to `output.output`
- **Output format**:
  ```
  [Rule: .github/instructions/typescript.instructions.md]
  [Match: glob: **/*.ts]
  rule content here...
  [Note: Content was truncated...]
  ```
- **Session lifecycle**: Clears caches on `session.deleted` and `session.compacted`
- **Persistence**: `OPENCODE_STORAGE/rules-injector/{sessionID}.json`
- **Transcript hydration**: Re-hydrates previously injected rules from session transcript

### B) `directoryAgentsInjector` — Tool Guard Tier (`tool.execute.after`)

- **Fires on**: `"read"` tool completion only
- **Behavior**: Calls `findAgentsMdUp()` → reads AGENTS.md files → truncates → appends as `[Directory Context: ...]` blocks
- **Auto-disables** when OpenCode has native AGENTS.md injection (version check)
- **Per-session cache**: Set of injected directories

### C) `hephaestusAgentsMdInjector` — Session Tier (`chat.message`)

- Separate hook for Hephaestus agent: injects ALL AGENTS.md files from root at session start
- Only fires once per session

## Precedence/Ordering

| Source | Priority |
|--------|----------|
| `.omo/rules` | 0 (highest) |
| `.claude/rules` | 1 |
| `.cursor/rules` | 2 |
| `.github/instructions` | 3 |
| `.github/copilot-instructions.md` | 4 |
| `.sisyphus/rules` | 5 (deprecated) |
| `CONTEXT.md` | 7 (engine only) |
| `~/.omo/rules` | 100 |
| `~/.opencode/rules` | 101 |
| `~/.claude/rules` | 102 |
| `plugin-bundled` | 200 (engine only) |

Within same source: closest distance (0 = same dir) wins. Same-distance tie: all injected.

## Caching

| Cache | Type | Scope |
|-------|------|-------|
| `RuleScanCache` | In-memory Map | Per-session (candidate + directory scan) |
| `AgentsMdCache` | In-memory Map | Global (keyed by startDir+rootDir+skipRoot) |
| Match decision cache | In-memory Map | Per-file stat fingerprint → match reason |
| Parsed rule cache | In-memory Map | Global (keyed by realPath, evicted on stat change) |
| Matcher LRU cache | In-memory Map | 256 entries, LRU eviction |
| Session injected paths | JSON file | `{OPENCODE_STORAGE}/rules-injector/{sessionID}.json` |

## Char Budgets (Engine API)

| Mode | Per-rule cap | Total cap |
|------|-------------|-----------|
| Static (default) | 12,000 | 40,000 |
| Dynamic (mid-session) | 4,000 | 10,000 |
| Post-compaction | 3,500 | 4,000 |
| Prompt-time | 6,000 | 16,000 |

## External Dependencies

| Package | Dependencies |
|---------|-------------|
| `@oh-my-opencode/rules-engine` | `@oh-my-opencode/utils` (workspace), `picomatch` (^4.0.4) |
| `@oh-my-opencode/agents-md-core` | `@oh-my-opencode/rules-engine` (workspace) |
| omo-opencode integration | Both workspace packages + `@opencode-ai/plugin` (SDK types) |

## Test Coverage

- rules-engine: 5 test files (index, distance, frontmatter-corpus, security-boundary, project-root)
- agents-md-core: 2 test files (constants, injector)
- omo-opencode integration: 15 test files covering storage, cache, finder, matcher, parser, parsed-rule-cache, match-decision-cache, output-path, rule-scan-cache, project-root-finder, transcript-hydration, rule-match-reason, injector-facade, test-isolation, directory-agents-injector

## Migration Assessment

**Verdict**: PORT with adaptation

**What to port**:
1. `rules-engine` simple API (`findRuleFiles`, `shouldApplyRule`, `findAgentsMdUp`) — pure functions, picomatch dependency
2. `agents-md-core` — thin wrapper, depends on rules-engine
3. Injection hook logic — adapt from `tool.execute.after` to `experimental.chat.system.transform` (ocmm's injection point) or keep as `tool.execute.after` if ocmm supports it

**What to simplify**:
1. Engine API with truncation budgets — start with simple API, add budgets later
2. Transcript hydration — defer until ocmm has compaction
3. `hephaestusAgentsMdInjector` — omo-specific agent, skip

**Config fields**:
- `disabled_hooks: ["rules-injector", "directory-agents-injector"]` — already in ocmm's schema
- `skipClaudeUserRules` — add if needed

**Effort**: MEDIUM (~15 src files + ~5 test files for core; +10 files for full engine)
**Priority**: HIGH — context quality is fundamental
