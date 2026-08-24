# dsmm MCP/LSP Integration Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement dsmm v0.5 by shipping an opt-in dsh MCP bridge for the existing `ocmm-lsp mcp` server, with docs, settings, tests, and smoke verification.

**Architecture:** The default dsmm bundle remains prompt/skill/guard-only and does not insert an MCP client row. A new `dsmm/src/lsp.ts` module owns disabled-by-default LSP settings, dsh MCP patch rendering, public tool-name derivation, and direct MCP smoke helpers. An example patch and Docker smoke prove the dsh-native `@deepseek-ai/dsh-mcp-client` row shape and the `ocmm-lsp mcp` tool surface without depending on OpenCode `.mcp.json`.

**Tech Stack:** TypeScript ESM, Node.js 22 `node:test`, pnpm workspace, Rust `ocmm-lsp` stdio MCP server, dsh `@deepseek-ai/dsh-mcp-client` Cordis patch shape, Docker smoke.

**Spec:** `docs/superpowers/specs/2026-08-24-dsmm-mcp-lsp-design.md`

**Global Constraints:**
- Do not make MCP/LSP part of the default `dsmm/cordis.patch.yml`.
- Do not replace ocmm-lsp with a dsh-native LSP service in v0.5.
- Do not depend on OpenCode `.mcp.json` shape or OpenCode MCP runtime behavior.
- Do not require global dsh config mutation; examples and smoke must use disposable profile/patch files.
- Do not add publishing or release packaging changes beyond dsmm-local package assets.
- `lsp.enabled` defaults to `false`; users can keep MCP/LSP disabled while using only dsmm prompts.
- The dsh MCP server name must match `[A-Za-z0-9_-]{1,32}` and defaults to `dsmm_lsp`.
- `ocmm-lsp mcp` must expose the eight expected LSP tools: `status`, `diagnostics`, `goto_definition`, `find_references`, `find_symbol_related`, `symbols`, `prepare_rename`, `rename`.

---

## File Structure

### DSMM LSP configuration and tests

- Create: `dsmm/src/lsp.ts`
  Owns default LSP settings, validation, public dsh MCP tool names, dsh MCP row rendering, and direct MCP `tools/list` smoke helpers.

- Modify: `dsmm/src/settings.ts`
  Adds `lsp` settings under the dsmm namespace, still disabled by default.

- Modify: `dsmm/src/index.ts`
  Re-exports LSP helper functions and types; does not register MCP rows at runtime.

- Create: `dsmm/test/lsp.test.ts`
  Covers defaults, validation, settings merge, patch rendering, public tool names, and direct smoke command parsing behavior.

### Patch/docs/package assets

- Create: `dsmm/patches/ocmm-lsp-mcp.example.cordis.patch.yml`
  Copyable opt-in dsh patch inserting one `@deepseek-ai/dsh-mcp-client` row.

- Create: `dsmm/docs/lsp.md`
  Documents enabling, expected tool names, command override patterns, smoke checks, and diagnostic smoke coverage.

- Modify: `dsmm/README.md`
  Adds v0.5 summary and links the LSP docs and plan.

- Modify: `dsmm/docs/roadmap.md`
  Marks v0.5 implemented after the implementation task completes.

- Modify: `dsmm/package.json`
  Ensures `docs` are included in `files` so LSP docs ship with the dsmm package.

- Modify: `dsmm/test/package.test.ts` and `dsmm/test/docker-smoke-assets.test.ts`
  Verify packaged/docs/patch/smoke assets.

### Smoke scripts

- Create: `dsmm/scripts/lsp-smoke-fixture.mjs`
  Creates a temporary diagnostic-emitting LSP fixture and matching `OCMM_LSP_PROJECT_CONFIG` for deterministic smoke tests.

- Create: `dsmm/scripts/lsp-mcp-smoke.mjs`
  Spawns an `ocmm-lsp mcp` command over stdio JSON-RPC line mode, asserts `tools/list` includes the eight expected tools, and calls `diagnostics` against the temporary fixture.

- Modify: `dsmm/scripts/docker-smoke.mjs`
  Runs the direct LSP MCP smoke, writes an opt-in MCP patch for the Docker binary path, checks `dsh --dump-config --patch`, and programmatically mounts dsh MCP client + tools to call `mcp__dsmm_lsp__diagnostics` against the temporary fixture.

- Modify: `dsmm/docker/Dockerfile.smoke`
  Adds a Rust builder stage for `crates/ocmm-lsp` and copies the Linux `ocmm-lsp` binary into the Node smoke image at `/usr/local/bin/ocmm-lsp`.

- Create: `dsmm/docs/implementation-plan-v0.5.md`
  Byte-for-byte copy of this approved plan after plan-critic approval.

---

## Task 1: LSP settings and patch-rendering helpers

**Files:**
- Create: `dsmm/src/lsp.ts`
- Modify: `dsmm/src/settings.ts`
- Modify: `dsmm/src/index.ts`
- Create: `dsmm/test/lsp.test.ts`
- Modify: `dsmm/test/settings.test.ts`

**Interfaces:**
- Consumes: existing `resolveConfig(config?: DsmmPluginConfig): DsmmSettings` from `dsmm/src/settings.ts`.
- Produces:
  - `export const DSMM_LSP_SERVER_NAME = "dsmm_lsp"`
  - `export const DSMM_LSP_TOOL_NAMES: readonly [...]`
  - `export type DsmmLspToolName`
  - `export interface DsmmLspSettings`
  - `export interface DshMcpStdioConfig`
  - `export const DEFAULT_DSMM_LSP_SETTINGS: DsmmLspSettings`
  - `export function resolveLspSettings(input?: Partial<DsmmLspSettings>): DsmmLspSettings`
  - `export function toDshMcpClientConfig(input?: Partial<DsmmLspSettings>): DshMcpStdioConfig`
  - `export function publicLspToolName(rawName: DsmmLspToolName, serverName?: string): string`
  - `export function renderLspMcpPatch(input?: Partial<DsmmLspSettings>): string`
  - `export function parseLspSmokeCommand(raw: string | undefined, fallback: readonly string[]): string[]`

- [ ] **Step 1: Write failing LSP helper tests**

Create `dsmm/test/lsp.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_DSMM_LSP_SETTINGS,
  DSMM_LSP_SERVER_NAME,
  DSMM_LSP_TOOL_NAMES,
  parseLspSmokeCommand,
  publicLspToolName,
  renderLspMcpPatch,
  resolveLspSettings,
  toDshMcpClientConfig
} from "../lib/lsp.js";

test("LSP settings default to disabled ocmm-lsp MCP bridge", () => {
  assert.deepEqual(DEFAULT_DSMM_LSP_SETTINGS, {
    enabled: false,
    serverName: "dsmm_lsp",
    command: "ocmm-lsp",
    args: ["mcp"],
    cwd: "",
    env: {},
    toolCallTimeoutMs: 60000,
    failOnStartupError: true
  });
});

test("publicLspToolName derives dsh mcp-client public names", () => {
  assert.equal(publicLspToolName("diagnostics"), "mcp__dsmm_lsp__diagnostics");
  assert.equal(publicLspToolName("rename", "custom_lsp"), "mcp__custom_lsp__rename");
  assert.deepEqual(DSMM_LSP_TOOL_NAMES, [
    "status",
    "diagnostics",
    "goto_definition",
    "find_references",
    "find_symbol_related",
    "symbols",
    "prepare_rename",
    "rename"
  ]);
});

test("resolveLspSettings validates dsh serverName and normalizes timeout", () => {
  assert.equal(resolveLspSettings({ serverName: "my_lsp", toolCallTimeoutMs: 42.8 }).toolCallTimeoutMs, 42);
  assert.equal(resolveLspSettings({ toolCallTimeoutMs: 0 }).toolCallTimeoutMs, 60000);
  assert.throws(() => resolveLspSettings({ serverName: "bad.name" }), /serverName/);
  assert.throws(() => resolveLspSettings({ command: "" }), /command/);
});

test("renderLspMcpPatch renders opt-in dsh mcp-client row", () => {
  const patch = renderLspMcpPatch({ enabled: true, command: "/usr/local/bin/ocmm-lsp" });

  assert.match(patch, /Example only: opt-in dsmm LSP MCP bridge/);
  assert.match(patch, /id: dsmm-lsp-mcp/);
  assert.match(patch, /name: '@deepseek-ai\/dsh-mcp-client'/);
  assert.match(patch, /transport: stdio/);
  assert.match(patch, /serverName: dsmm_lsp/);
  assert.match(patch, /command: \/usr\/local\/bin\/ocmm-lsp/);
  assert.match(patch, /- mcp/);
  assert.match(patch, /failOnStartupError: true/);
});

test("toDshMcpClientConfig drops dsmm-only enabled flag", () => {
  assert.deepEqual(toDshMcpClientConfig({ enabled: true }), {
    transport: "stdio",
    serverName: "dsmm_lsp",
    command: "ocmm-lsp",
    args: ["mcp"],
    cwd: "",
    env: {},
    toolCallTimeoutMs: 60000,
    failOnStartupError: true
  });
});

test("parseLspSmokeCommand accepts JSON arrays and plain command overrides", () => {
  assert.deepEqual(parseLspSmokeCommand(undefined, ["ocmm-lsp", "mcp"]), ["ocmm-lsp", "mcp"]);
  assert.deepEqual(parseLspSmokeCommand("node", ["ocmm-lsp", "mcp"]), ["node", "mcp"]);
  assert.deepEqual(parseLspSmokeCommand('["node","dist/cli/ocmm-lsp.js","mcp"]', ["ocmm-lsp", "mcp"]), ["node", "dist/cli/ocmm-lsp.js", "mcp"]);
  assert.throws(() => parseLspSmokeCommand("[]", ["ocmm-lsp", "mcp"]), /non-empty string array/);
});
```

Update `dsmm/test/settings.test.ts` with assertions on `DEFAULT_DSMM_SETTINGS.lsp`, `resolveConfig({ lsp: { enabled: true, serverName: "custom_lsp" } })`, and invalid numeric fallback for `toolCallTimeoutMs`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
pnpm --filter dsmm test test/lsp.test.ts
```

Expected before implementation: FAIL with missing `../src/lsp.ts`.

Run:

```powershell
pnpm --filter dsmm test test/settings.test.ts
```

Expected before implementation: FAIL because settings do not expose `lsp`.

- [ ] **Step 3: Implement `dsmm/src/lsp.ts`**

Create `dsmm/src/lsp.ts`:

```ts
export const DSMM_LSP_SERVER_NAME = "dsmm_lsp";
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/u;

export const DSMM_LSP_TOOL_NAMES = [
  "status",
  "diagnostics",
  "goto_definition",
  "find_references",
  "find_symbol_related",
  "symbols",
  "prepare_rename",
  "rename"
] as const;

export type DsmmLspToolName = (typeof DSMM_LSP_TOOL_NAMES)[number];

export interface DsmmLspSettings {
  enabled: boolean;
  serverName: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  toolCallTimeoutMs: number;
  failOnStartupError: boolean;
}

export interface DshMcpStdioConfig {
  transport: "stdio";
  serverName: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  toolCallTimeoutMs: number;
  failOnStartupError: boolean;
}

export const DEFAULT_DSMM_LSP_SETTINGS: DsmmLspSettings = {
  enabled: false,
  serverName: DSMM_LSP_SERVER_NAME,
  command: "ocmm-lsp",
  args: ["mcp"],
  cwd: "",
  env: {},
  toolCallTimeoutMs: 60000,
  failOnStartupError: true
};

export function resolveLspSettings(input: Partial<DsmmLspSettings> = {}): DsmmLspSettings {
  const serverName = input.serverName ?? DEFAULT_DSMM_LSP_SETTINGS.serverName;
  if (!SERVER_NAME_PATTERN.test(serverName)) {
    throw new Error(`dsmm lsp serverName must match ${SERVER_NAME_PATTERN.source}`);
  }

  const command = input.command ?? DEFAULT_DSMM_LSP_SETTINGS.command;
  if (command.trim().length === 0) throw new Error("dsmm lsp command must be non-empty");

  const args = input.args ?? DEFAULT_DSMM_LSP_SETTINGS.args;
  if (!Array.isArray(args) || !args.every((arg) => typeof arg === "string")) {
    throw new Error("dsmm lsp args must be a string array");
  }

  return {
    enabled: input.enabled ?? DEFAULT_DSMM_LSP_SETTINGS.enabled,
    serverName,
    command,
    args: [...args],
    cwd: input.cwd ?? DEFAULT_DSMM_LSP_SETTINGS.cwd,
    env: { ...DEFAULT_DSMM_LSP_SETTINGS.env, ...input.env },
    toolCallTimeoutMs: positiveInteger(input.toolCallTimeoutMs, DEFAULT_DSMM_LSP_SETTINGS.toolCallTimeoutMs),
    failOnStartupError: input.failOnStartupError ?? DEFAULT_DSMM_LSP_SETTINGS.failOnStartupError
  };
}

export function publicLspToolName(rawName: DsmmLspToolName, serverName = DSMM_LSP_SERVER_NAME): string {
  if (!SERVER_NAME_PATTERN.test(serverName)) throw new Error(`dsmm lsp serverName must match ${SERVER_NAME_PATTERN.source}`);
  return `mcp__${serverName}__${rawName}`;
}

export function toDshMcpClientConfig(input: Partial<DsmmLspSettings> = {}): DshMcpStdioConfig {
  const settings = resolveLspSettings(input);
  return {
    transport: "stdio",
    serverName: settings.serverName,
    command: settings.command,
    args: settings.args,
    env: settings.env,
    cwd: settings.cwd,
    toolCallTimeoutMs: settings.toolCallTimeoutMs,
    failOnStartupError: settings.failOnStartupError
  };
}

export function renderLspMcpPatch(input: Partial<DsmmLspSettings> = {}): string {
  const settings = resolveLspSettings({ ...input, enabled: true });
  const args = settings.args.length === 0
    ? "        args: []"
    : ["        args:", ...settings.args.map((arg) => `          - ${yamlScalar(arg)}`)].join("\n");
  const env = Object.keys(settings.env).length === 0
    ? "        env: {}"
    : ["        env:", ...Object.entries(settings.env).map(([key, value]) => `          ${yamlScalar(key)}: ${yamlScalar(value)}`)].join("\n");

  return [
    "# Example only: opt-in dsmm LSP MCP bridge.",
    "# Requires ocmm-lsp to be on PATH or command to be replaced with an absolute wrapper path.",
    "- insert:",
    "    - id: dsmm-lsp-mcp",
    "      name: '@deepseek-ai/dsh-mcp-client'",
    "      config:",
    "        transport: stdio",
    `        serverName: ${settings.serverName}`,
    `        command: ${yamlScalar(settings.command)}`,
    args,
    env,
    `        cwd: ${yamlScalar(settings.cwd)}`,
    `        toolCallTimeoutMs: ${settings.toolCallTimeoutMs}`,
    `        failOnStartupError: ${settings.failOnStartupError}`,
    ""
  ].join("\n");
}

export function parseLspSmokeCommand(raw: string | undefined, fallback: readonly string[]): string[] {
  const trimmed = raw?.trim();
  if (!trimmed) return [...fallback];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) => typeof item === "string" && item.length > 0)) return [...parsed];
    throw new Error("DSMM_LSP_COMMAND_JSON must be a non-empty string array");
  } catch (error) {
    if (trimmed.startsWith("[")) throw error;
    return [trimmed, "mcp"];
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function yamlScalar(value: string): string {
  if (value === "") return "''";
  if (/^[A-Za-z0-9_./:-]+$/u.test(value)) return value;
  return `'${value.replaceAll("'", "''")}'`;
}
```

- [ ] **Step 4: Extend settings and exports**

Modify `dsmm/src/settings.ts`:

```ts
import { DEFAULT_DSMM_LSP_SETTINGS, resolveLspSettings } from "./lsp.js";
import type { DsmmLspSettings } from "./lsp.js";

export interface DsmmPluginConfig {
  // existing fields...
  lsp?: Partial<DsmmLspSettings>;
}

export interface DsmmSettings {
  // existing fields...
  lsp: DsmmLspSettings;
}
```

Add `lsp: DEFAULT_DSMM_LSP_SETTINGS` to `DEFAULT_DSMM_SETTINGS`, a `LSP_SCHEMA` object containing `enabled`, `serverName`, `command`, `args`, `cwd`, `env`, `toolCallTimeoutMs`, and `failOnStartupError`, then add `lsp: LSP_SCHEMA` to `DSMM_CONFIG_SCHEMA` and `DSMM_SETTINGS_SCHEMA`. Keep `resolveConfig()` using `lsp: resolveLspSettings(config.lsp)`.

Modify `dsmm/src/index.ts` to re-export:

```ts
export { DEFAULT_DSMM_LSP_SETTINGS, DSMM_LSP_SERVER_NAME, DSMM_LSP_TOOL_NAMES, parseLspSmokeCommand, publicLspToolName, renderLspMcpPatch, resolveLspSettings, toDshMcpClientConfig } from "./lsp.js";
export type { DshMcpStdioConfig, DsmmLspSettings, DsmmLspToolName } from "./lsp.js";
```

- [ ] **Step 5: Verify helper task**

Run:

```powershell
pnpm --filter dsmm test test/lsp.test.ts
pnpm --filter dsmm test test/settings.test.ts
pnpm --filter dsmm typecheck:test
pnpm --filter dsmm build
```

Expected: all commands PASS. Generated `dsmm/lib/lsp.*`, `dsmm/lib/settings.*`, and `dsmm/lib/index.*` are updated.

---

## Task 2: Opt-in patch, docs, and package assets

**Files:**
- Create: `dsmm/patches/ocmm-lsp-mcp.example.cordis.patch.yml`
- Create: `dsmm/docs/lsp.md`
- Modify: `dsmm/README.md`
- Modify: `dsmm/docs/roadmap.md`
- Modify: `dsmm/package.json`
- Modify: `dsmm/test/lsp.test.ts`
- Modify: `dsmm/test/package.test.ts`
- Modify: `dsmm/test/docker-smoke-assets.test.ts`

**Interfaces:**
- Consumes: `renderLspMcpPatch()`, `DSMM_LSP_TOOL_NAMES`, and `publicLspToolName()` from Task 1.
- Produces: copyable opt-in patch and user-facing LSP docs.

- [ ] **Step 1: Add failing asset/doc tests**

Append to `dsmm/test/lsp.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("example LSP MCP patch matches renderer output", () => {
  const patchPath = join(packageRoot, "patches", "ocmm-lsp-mcp.example.cordis.patch.yml");
  assert.equal(readFileSync(patchPath, "utf8"), renderLspMcpPatch({ enabled: true }));
});

test("LSP docs name every model-facing dsh MCP tool", () => {
  const docs = readFileSync(join(packageRoot, "docs", "lsp.md"), "utf8");
  for (const tool of DSMM_LSP_TOOL_NAMES) assert.match(docs, new RegExp(publicLspToolName(tool)));
  assert.match(docs, /disabled by default/i);
  assert.match(docs, /@deepseek-ai\/dsh-mcp-client/);
});
```

Update `dsmm/test/package.test.ts` to assert `pkg.files.includes("docs")` and `pkg.files.includes("patches")`.

Update `dsmm/test/docker-smoke-assets.test.ts` to assert the new patch/doc files exist, the patch includes `@deepseek-ai/dsh-mcp-client`, and README links `docs/lsp.md`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
pnpm --filter dsmm test test/lsp.test.ts test/package.test.ts test/docker-smoke-assets.test.ts
```

Expected before implementation: FAIL because `docs/lsp.md` and the example patch do not exist and `package.json` lacks `docs` in `files`.

- [ ] **Step 3: Add patch and docs**

Create `dsmm/patches/ocmm-lsp-mcp.example.cordis.patch.yml` with the exact output of `renderLspMcpPatch({ enabled: true })`.

Create `dsmm/docs/lsp.md` with these sections:

```md
# dsmm LSP MCP Integration

dsmm v0.5 keeps LSP disabled by default. Enable it by adding the opt-in patch `patches/ocmm-lsp-mcp.example.cordis.patch.yml` to a disposable or user-owned dsh profile.

## dsh patch

The patch inserts one `@deepseek-ai/dsh-mcp-client` row named `dsmm-lsp-mcp`. It starts `ocmm-lsp mcp` over stdio with `serverName: dsmm_lsp` and `failOnStartupError: true`.

## Tools exposed to dsh

- `mcp__dsmm_lsp__status`
- `mcp__dsmm_lsp__diagnostics`
- `mcp__dsmm_lsp__goto_definition`
- `mcp__dsmm_lsp__find_references`
- `mcp__dsmm_lsp__find_symbol_related`
- `mcp__dsmm_lsp__symbols`
- `mcp__dsmm_lsp__prepare_rename`
- `mcp__dsmm_lsp__rename`

## Verification

Run `pnpm run build` at the repository root, then run `pnpm --filter dsmm test` and `pnpm --filter dsmm smoke:docker`. The direct MCP smoke asserts `tools/list` and calls `diagnostics` against a temporary diagnostic-emitting LSP fixture. The dsh MCP smoke mounts `@deepseek-ai/dsh-mcp-client` and calls `mcp__dsmm_lsp__diagnostics` against the same fixture when dsh exposes the required packages.
```

Modify `dsmm/README.md` with a v0.5 summary linking `docs/lsp.md`. Modify `dsmm/docs/roadmap.md` to mark v0.5 implemented after code is complete. Add `"docs"` to `dsmm/package.json` `files`.

- [ ] **Step 4: Verify asset/docs task**

Run:

```powershell
pnpm --filter dsmm test test/lsp.test.ts test/package.test.ts test/docker-smoke-assets.test.ts
pnpm --filter dsmm pack --dry-run
```

Expected: tests PASS and pack output includes `docs/lsp.md` plus `patches/ocmm-lsp-mcp.example.cordis.patch.yml`.

---

## Task 3: Direct and Docker MCP smoke

**Files:**
- Create: `dsmm/scripts/lsp-smoke-fixture.mjs`
- Create: `dsmm/scripts/lsp-mcp-smoke.mjs`
- Modify: `dsmm/scripts/docker-smoke.mjs`
- Modify: `dsmm/docker/Dockerfile.smoke`
- Modify: `dsmm/test/docker-smoke-assets.test.ts`

**Interfaces:**
- Consumes: `DSMM_LSP_TOOL_NAMES`, `parseLspSmokeCommand()`, `publicLspToolName()`, `renderLspMcpPatch()`, and `resolveLspSettings()` from Task 1.
- Produces: direct `ocmm-lsp mcp` smoke and Docker dsh MCP client smoke coverage.

- [ ] **Step 1: Write failing smoke asset tests**

Update `dsmm/test/docker-smoke-assets.test.ts` to assert:

```ts
const lspSmoke = join(packageRoot, "scripts", "lsp-mcp-smoke.mjs");
const lspSmokeText = readFileSync(lspSmoke, "utf8");

assert.equal(existsSync(lspSmoke), true);
assert.match(dockerfileText, /FROM rust:.* AS lsp-builder/);
assert.match(dockerfileText, /cargo build --release -p ocmm-lsp/);
assert.match(dockerfileText, /COPY --from=lsp-builder .*\/ocmm-lsp \/usr\/local\/bin\/ocmm-lsp/);
assert.match(scriptText, /lsp-mcp-smoke\.mjs/);
assert.match(scriptText, /@deepseek-ai\/dsh-mcp-client/);
assert.match(scriptText, /mcp__dsmm_lsp__diagnostics/);
assert.match(lspSmokeText, /tools\/list/);
assert.match(lspSmokeText, /diagnostics/);
assert.match(lspSmokeText, /tools\/call/);
assert.match(readFileSync(join(packageRoot, "scripts", "lsp-smoke-fixture.mjs"), "utf8"), /textDocument\/publishDiagnostics/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm --filter dsmm test test/docker-smoke-assets.test.ts
```

Expected before implementation: FAIL because `scripts/lsp-smoke-fixture.mjs`, `scripts/lsp-mcp-smoke.mjs`, and Dockerfile LSP builder stage do not exist.

- [ ] **Step 3: Add diagnostic fixture and direct MCP smoke script**

Create `dsmm/scripts/lsp-smoke-fixture.mjs`. This file is both an importable fixture helper and the LSP server child process. The server must speak LSP Content-Length framing because `ocmm-lsp` speaks LSP to configured language servers that way.

```js
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fixturePath = fileURLToPath(import.meta.url);

export function createDiagnosticWorkspace(prefix = "dsmm-lsp-smoke-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const subject = join(root, "subject.ts");
  const trace = join(root, "trace.jsonl");
  const projectConfig = join(root, "ocmm-lsp.json");
  const missingUserConfig = join(root, "missing-user-ocmm-lsp.json");
  writeFileSync(subject, "const value: number = 'wrong';\n", "utf8");
  writeFileSync(trace, "", "utf8");
  writeFileSync(projectConfig, JSON.stringify({
    lsp: {
      "dsmm-smoke": {
        command: [process.execPath, fixturePath],
        extensions: [".ts"],
        priority: 10000,
        env: { DSMM_LSP_SMOKE_TRACE: trace }
      }
    }
  }, null, 2), "utf8");

  return {
    root,
    subject,
    projectConfig,
    missingUserConfig,
    env: {
      OCMM_LSP_PROJECT_CONFIG: projectConfig,
      OCMM_LSP_USER_CONFIG: missingUserConfig
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

if (process.argv[1] === fixturePath) runServer();

function runServer() {
  const tracePath = process.env.DSMM_LSP_SMOKE_TRACE;
  let buffer = Buffer.alloc(0);

  process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    drain();
  });

  function drain() {
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const headers = buffer.subarray(0, headerEnd).toString("utf8");
      const match = /(?:^|\r\n)Content-Length:\s*(\d+)/iu.exec(headers);
      if (!match) throw new Error("missing Content-Length header");
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + Number(match[1]);
      if (buffer.length < bodyEnd) return;
      const message = JSON.parse(buffer.subarray(bodyStart, bodyEnd).toString("utf8"));
      buffer = buffer.subarray(bodyEnd);
      handle(message);
    }
  }

  function send(payload) {
    const body = Buffer.from(JSON.stringify(payload));
    process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
    process.stdout.write(body);
  }

  function trace(message) {
    if (tracePath) writeFileSync(tracePath, `${JSON.stringify(message)}\n`, { flag: "a" });
  }

  function handle(message) {
    trace(message);
    if (message.method === "initialize") {
      send({ jsonrpc: "2.0", id: message.id, result: { capabilities: { textDocumentSync: 1 } } });
      return;
    }
    if (message.method === "textDocument/didOpen") {
      const uri = message.params.textDocument.uri;
      send({
        jsonrpc: "2.0",
        method: "textDocument/publishDiagnostics",
        params: {
          uri,
          diagnostics: [{
            range: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } },
            severity: 1,
            source: "dsmm-smoke",
            message: "dsmm smoke diagnostic"
          }]
        }
      });
      return;
    }
    if (message.method === "shutdown") {
      send({ jsonrpc: "2.0", id: message.id, result: null });
      return;
    }
    if (message.method === "exit") process.exit(0);
  }
}
```

Create `dsmm/scripts/lsp-mcp-smoke.mjs`:

```js
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDiagnosticWorkspace } from "./lsp-smoke-fixture.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = resolve(root, "..");
const dsmm = await import(pathToFileURL(join(root, "lib", "index.js")).href);
const wrapper = join(repoRoot, "dist", "cli", "ocmm-lsp.js");
const fallback = existsSync(wrapper) ? [process.execPath, wrapper, "mcp"] : ["ocmm-lsp", "mcp"];
const command = dsmm.parseLspSmokeCommand(process.env.DSMM_LSP_COMMAND_JSON ?? process.env.DSMM_LSP_COMMAND, fallback);
const fixture = createDiagnosticWorkspace();

function request(child, message) {
  return new Promise((resolveRequest, reject) => {
    const onData = (chunk) => {
      const line = chunk.toString("utf8").split(/\r?\n/u).find((item) => item.trim().length > 0);
      if (!line) return;
      child.stdout.off("data", onData);
      try {
        resolveRequest(JSON.parse(line));
      } catch (error) {
        reject(error);
      }
    };
    child.stdout.on("data", onData);
    child.stdin.write(`${JSON.stringify(message)}\n`);
  });
}

const child = spawn(command[0], command.slice(1), {
  cwd: fixture.root,
  env: { ...process.env, ...fixture.env },
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true
});
const stderr = [];
child.stderr.on("data", (chunk) => stderr.push(chunk));

try {
  await request(child, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } });
  const listed = await request(child, { jsonrpc: "2.0", id: 2, method: "tools/list" });
  const names = listed.result.tools.map((tool) => tool.name);
  for (const name of dsmm.DSMM_LSP_TOOL_NAMES) {
    if (!names.includes(name)) throw new Error(`ocmm-lsp tools/list missing ${name}`);
  }

  const diagnostics = await request(child, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "diagnostics", arguments: { filePath: fixture.subject, severity: "all" } }
  });
  if (diagnostics.result?.isError !== false) throw new Error(`ocmm-lsp diagnostics failed: ${JSON.stringify(diagnostics)}`);
  const diagnosticText = diagnostics.result.content?.[0]?.text ?? "";
  if (!diagnosticText.includes("dsmm smoke diagnostic")) throw new Error(`ocmm-lsp diagnostics response missing smoke diagnostic: ${diagnosticText}`);
} finally {
  child.kill();
  fixture.cleanup();
}

console.log(`ocmm-lsp MCP smoke passed with ${command.join(" ")}`);
```

If line buffering proves too naive during implementation, replace `request()` with a buffered queue that preserves multiple stdout lines. Keep the public behavior and assertions unchanged.

- [ ] **Step 4: Extend Dockerfile with Rust builder stage**

Modify `dsmm/docker/Dockerfile.smoke`:

```dockerfile
FROM rust:1-bookworm AS lsp-builder
WORKDIR /workspace
COPY Cargo.toml Cargo.lock ./
COPY crates/ocmm-lsp ./crates/ocmm-lsp
RUN cargo build --release -p ocmm-lsp

FROM node:22-bookworm-slim

ARG DSH_PACKAGE=@deepseek-ai/dsh@latest
WORKDIR /workspace

COPY --from=lsp-builder /workspace/target/release/ocmm-lsp /usr/local/bin/ocmm-lsp
COPY dsmm ./dsmm
```

Keep existing pnpm/dsh setup and environment variables after these lines.

- [ ] **Step 5: Extend Docker smoke script**

Modify `dsmm/scripts/docker-smoke.mjs`:

1. Generalize the existing `importDshAgentPresets()` resolver into `importDshPackage(packageName)`.
2. Add `import { createDiagnosticWorkspace } from "./lsp-smoke-fixture.mjs";` at the top of the file.
3. Run the direct smoke:

```js
const lspSmoke = spawnSync(process.execPath, [join(root, "scripts", "lsp-mcp-smoke.mjs")], {
  env: { ...process.env, DSMM_LSP_COMMAND: "/usr/local/bin/ocmm-lsp" },
  stdio: "inherit"
});
requireSuccess(lspSmoke, "ocmm-lsp MCP diagnostics smoke");
```

4. Write a Docker-local LSP patch:

```js
const lspPatch = join(home, "ocmm-lsp-mcp.cordis.patch.yml");
writeFileSync(lspPatch, dsmm.renderLspMcpPatch({ enabled: true, command: "/usr/local/bin/ocmm-lsp" }), "utf8");
```

5. Verify dsh config sees the MCP client row:

```js
const dumpWithLsp = spawnSync("dsh", ["--profile", "web", "--patch", lspPatch, "--dump-config"], {
  env: { ...process.env, DSH_HOME: home },
  encoding: "utf8"
});
requireSuccess(dumpWithLsp, "dsh --dump-config with dsmm LSP MCP patch");
assertContains(dumpWithLsp.stdout, "@deepseek-ai/dsh-mcp-client", "dumped dsh config");
assertContains(dumpWithLsp.stdout, "serverName: dsmm_lsp", "dumped dsh config");
```

6. Programmatically mount dsh MCP client and call diagnostics through the MCP bridge:

```js
async function smokeDshMcpClient() {
  const cordis = await importDshPackage("@deepseek-ai/cordis");
  const systemPrompt = await importDshPackage("@deepseek-ai/dsh-system-prompt");
  const toolsRuntime = await importDshPackage("@deepseek-ai/dsh-tools");
  const mcpClient = await importDshPackage("@deepseek-ai/dsh-mcp-client");
  const llm = await importDshPackage("@deepseek-ai/dsh-llm");
  const fixture = createDiagnosticWorkspace("dsmm-dsh-mcp-smoke-");
  const ctx = new cordis.Context();
  try {
    await ctx.plugin(systemPrompt.default ?? systemPrompt);
    await ctx.plugin(toolsRuntime.default ?? toolsRuntime);
    await mcpClient.apply(ctx, dsmm.toDshMcpClientConfig({ enabled: true, command: "/usr/local/bin/ocmm-lsp", env: fixture.env }));
    const publicDiagnostics = dsmm.publicLspToolName("diagnostics");
    if (!ctx.tools.schemas().some((schema) => schema.name === publicDiagnostics)) throw new Error(`${publicDiagnostics} not exposed by dsh MCP client`);
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: typeof llm.CallId === "function" ? llm.CallId("dsmm-lsp-smoke-1") : "dsmm-lsp-smoke-1",
      name: publicDiagnostics,
      arguments: { filePath: fixture.subject, severity: "all" }
    });
    if (result.isError !== false) throw new Error(`${publicDiagnostics} returned error`);
    const text = result.content?.[0]?.text ?? "";
    if (!text.includes("dsmm smoke diagnostic")) throw new Error(`${publicDiagnostics} response missing smoke diagnostic: ${text}`);
  } finally {
    await ctx.fiber.dispose();
    fixture.cleanup();
  }
}
await smokeDshMcpClient();
```

If the installed dsh package exports differ, stop with a clear error instead of silently skipping this check.

- [ ] **Step 6: Verify smoke task**

Run:

```powershell
pnpm --filter dsmm test test/docker-smoke-assets.test.ts
pnpm --filter dsmm test test/lsp.test.ts
pnpm --filter dsmm build
node dsmm/scripts/lsp-mcp-smoke.mjs
pnpm --filter dsmm smoke:docker
```

Expected: all commands PASS. If `node dsmm/scripts/lsp-mcp-smoke.mjs` fails because the root `ocmm-lsp` wrapper has no binary, run `pnpm run build:lsp` and then re-run the smoke.

---

## Task 4: Final docs, plan copy, and verification

**Files:**
- Modify: `dsmm/README.md`
- Modify: `dsmm/docs/roadmap.md`
- Create: `dsmm/docs/implementation-plan-v0.5.md`
- Modify: `dsmm/test/docker-smoke-assets.test.ts`

**Interfaces:**
- Consumes: completed Tasks 1-3 and source plan `docs/superpowers/plans/2026-08-24-dsmm-mcp-lsp.md`.
- Produces: dsmm-local plan copy and final verification evidence.

- [ ] **Step 1: Add final doc assertions**

Ensure `dsmm/test/docker-smoke-assets.test.ts` asserts:

```ts
const v05Plan = join(packageRoot, "docs", "implementation-plan-v0.5.md");
assert.equal(existsSync(v05Plan), true);
assert.match(readme, /v0\.5 MCP and LSP integration/);
assert.match(readme, /docs\/lsp\.md/);
```

- [ ] **Step 2: Update docs and plan copy**

Update `dsmm/README.md` implementation plan list:

```md
- `docs/implementation-plan-v0.5.md` is the dsmm-local copy of the approved v0.5 MCP/LSP implementation plan.
- `../docs/superpowers/plans/2026-08-24-dsmm-mcp-lsp.md` remains the workflow-reviewed source plan artifact for v0.5.
```

Update `dsmm/docs/roadmap.md` v0.5 section to start with:

```md
Status: implemented in the v0.5 implementation. dsmm now ships disabled-by-default LSP settings, an opt-in `@deepseek-ai/dsh-mcp-client` patch, LSP tool documentation, direct `ocmm-lsp mcp` smoke, and Docker smoke coverage for the dsh MCP bridge.
```

Copy the current plan file byte-for-byte:

```powershell
Copy-Item -LiteralPath "docs/superpowers/plans/2026-08-24-dsmm-mcp-lsp.md" -Destination "dsmm/docs/implementation-plan-v0.5.md"
$sourceHash = (Get-FileHash -Algorithm SHA256 "docs/superpowers/plans/2026-08-24-dsmm-mcp-lsp.md").Hash
$destHash = (Get-FileHash -Algorithm SHA256 "dsmm/docs/implementation-plan-v0.5.md").Hash
if ($sourceHash -ne $destHash) { throw "v0.5 plan copy hash mismatch" }
```

- [ ] **Step 3: Run final implementation verification**

Run:

```powershell
pnpm --filter dsmm test
pnpm --filter dsmm typecheck:test
pnpm --filter dsmm build
node dsmm/scripts/lsp-mcp-smoke.mjs
pnpm --filter dsmm smoke:docker
pnpm --filter dsmm pack --dry-run
git diff --check
pnpm run typecheck
pnpm run build
pnpm run test:lsp
$pythonReady = $false
$resolvedPython = @(Get-Command python.exe -ErrorAction SilentlyContinue)
if ($resolvedPython.Count -gt 0 -and $resolvedPython[0].Source -notmatch '\\WindowsApps\\') { $pythonReady = $true }
if (-not $pythonReady) {
  $uvPythonLines = @(uv python list --only-installed 2>$null)
  foreach ($line in $uvPythonLines) {
    if ($line -match '\s+(.+?python\.exe)$') {
      $env:PATH = "$(Split-Path -Parent $Matches[1])$([IO.Path]::PathSeparator)$env:PATH"
      $pythonReady = $true
      break
    }
  }
}
if (-not $pythonReady) { throw "root pnpm test requires a direct python.exe; WindowsApps aliases are not sufficient" }
$env:OCMM_PROFILE = $null; $env:OPENCODE_CONFIG_CONTENT = $null; pnpm test
```

Expected:
- dsmm tests/typecheck/build/direct smoke/Docker smoke/pack PASS.
- root typecheck/build/test:lsp PASS.
- root `pnpm test` PASS. If no already-installed direct Python is available, stop before final review/commit and report the environment prerequisite; do not install Python and do not commit with a failing repository test gate.

- [ ] **Step 4: Final acceptance review and commit**

After every verification command above passes, request final code review with both `oracle` and `reviewer` because v0.5 is cross-module integration work involving external dsh MCP behavior. Use a current working-tree identity packet and include verification evidence.

If both required lanes approve the same current artifact identity, inspect:

```powershell
git status --short
git diff --stat
git diff -- docs/superpowers/plans/2026-08-24-dsmm-mcp-lsp.md dsmm
git log --oneline -10
```

Then stage only v0.5 files and commit, using the user's authorized stage-commit convention:

```powershell
git add docs/superpowers/specs/2026-08-24-dsmm-mcp-lsp-design.md docs/superpowers/plans/2026-08-24-dsmm-mcp-lsp.md dsmm
git commit -m "feat(dsmm): add MCP LSP integration" -m "Add opt-in dsh MCP bridge assets, LSP settings, docs, and smoke coverage for ocmm-lsp."
git status --short
git log -1 --oneline
```

Do not push or tag.

---

## Self-Review

**Spec coverage:** Task 1 implements disabled-by-default settings and helper interfaces. Task 2 ships the opt-in dsh MCP patch and LSP docs. Task 3 verifies direct MCP `tools/list`, dsh patch config, and dsh MCP client `diagnostics` call in Docker. Task 4 covers plan copy, final verification, review, and authorized stage commit only after root `pnpm test` passes.

**Placeholder scan:** No TBD/TODO/implement-later placeholders remain. The plan explicitly resolves the diagnostics requirement by requiring a deterministic diagnostic-emitting fixture and `diagnostics` calls through both direct MCP and the dsh MCP client bridge.

**Type consistency:** `DsmmLspSettings`, `resolveLspSettings()`, `renderLspMcpPatch()`, `publicLspToolName()`, and `parseLspSmokeCommand()` are consistently named across tasks and tests. Settings import from `./lsp.js` follows existing dsmm NodeNext source style.
