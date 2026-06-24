---
name: lsp-setup
description: "Configure a Language Server (LSP) for a specific language so editor/agent tooling — diagnostics, go-to-definition, find-references, rename — works. Use when you need to: configure LSP, lsp setup, set up or install a language server, fix 'no LSP server configured' / 'server not installed', choose between servers (basedpyright vs pyright vs ty vs ruff), or wire .codex/lsp-client.json / .opencode/lsp.json. 언어서버 설정. Routes by file extension to references/<language>/README.md for the exact builtin server, per-OS install commands (macOS/Linux/Windows), config snippets for both config files, initialization options, alternatives, and troubleshooting. Ships scripts: detect-lsp.ts (scan a project for languages + each server's install/config status) and verify-lsp.ts (run a real diagnostics roundtrip). Covers typescript, python, go, rust, c/c++, java, kotlin, c#/razor, swift, ruby, php, dart, elixir, zig, lua, bash, yaml, terraform, haskell, julia."
---

# LSP Setup

Configure the right Language Server for a project so the `lsp` MCP tools
(`diagnostics`, `goto_definition`, `find_references`, `symbols`, `rename`)
actually work. This skill is an index: detect what a project needs, install the
server, write the config, then verify with a real roundtrip.

Local ocmm note: ocmm registers the `lsp` MCP server through the project-owned
`ocmm-lsp mcp` by default. The per-language references mirror upstream omo LSP
server definitions, but the real source of truth in this install is what the
current `lsp` MCP exposes. Check available MCP/tool names first, then use these
references for install commands and config snippets.

---

## PHASE 0 — LANGUAGE GATE (run first)

Identify the language from the file extension, then **read the matching
reference before installing or configuring anything**.

| Extension(s) | Reference |
|---|---|
| `.ts .tsx .js .jsx .mjs .cjs .mts .cts .vue .svelte .astro` | `references/typescript/README.md` |
| `.py .pyi` | `references/python/README.md` |
| `.go` | `references/go/README.md` |
| `.rs` | `references/rust/README.md` |
| `.c .cpp .cc .cxx .h .hpp .hh .hxx` | `references/c-cpp/README.md` |
| `.java` | `references/java/README.md` |
| `.kt .kts` | `references/kotlin/README.md` |
| `.cs .razor .cshtml` | `references/csharp/README.md` |
| `.swift` | `references/swift/README.md` |
| `.rb .rake .gemspec .ru` | `references/ruby/README.md` |
| `.php` | `references/php/README.md` |
| `.dart` | `references/dart/README.md` |
| `.ex .exs` | `references/elixir/README.md` |
| `.zig .zon` | `references/zig/README.md` |
| `.lua` | `references/lua/README.md` |
| `.sh .bash .zsh .ksh` | `references/bash/README.md` |
| `.yaml .yml` | `references/yaml/README.md` |
| `.tf .tfvars` | `references/terraform/README.md` |
| `.hs .lhs` | `references/haskell/README.md` |
| `.jl` | `references/julia/README.md` |

---

## WORKFLOW — detect → install → configure → verify

### 1. Detect

Scan the project to see which languages are present and whether each server is
installed and configured:

```bash
bun scripts/detect-lsp.ts <projectDir>      # human report (default: cwd)
bun scripts/detect-lsp.ts <projectDir> --json
```

For each detected language it prints the builtin server id, the executable it
needs on `PATH`, whether that executable is installed, an install hint, and
whether a project config file already references it.

### 2. Install

Open `references/<language>/README.md` and run the install command for your OS.
Then confirm the executable resolves:

```bash
command -v <server-executable>   # e.g. typescript-language-server, gopls, rust-analyzer
```

### 3. Configure

Most builtin servers need **no config** — they are resolved automatically by
file extension. Write config only to: pick between competing servers, set a
`priority`, pass `initialization` options, override `extensions`, set `env`, or
`disable` a server.

Project-scoped config files, **identical JSON shape**:

- Preferred ocmm/OpenCode path -> `.opencode/ocmm-lsp.json`
- OpenCode/ocmm compatibility path -> `.opencode/lsp.json`
- Codex harness compatibility path -> `.codex/lsp-client.json`

The user-scoped ocmm config path is `~/.config/opencode/ocmm-lsp.json`, or the
path set by `OCMM_LSP_USER_CONFIG`.

```jsonc
{
  "lsp": {
    "<server-id>": {
      "command": ["<bin>", "<args>"],   // optional for builtin ids (supplied automatically)
      "extensions": [".ext"],            // optional override
      "priority": 100,                    // higher wins when several servers match an extension
      "initialization": { },              // server-specific initializationOptions
      "env": { "KEY": "value" },          // optional
      "disabled": false                   // set true to turn a server off
    }
  }
}
```

Rules enforced by `ocmm-lsp`:

- Builtin server ids inherit `command` and `extensions` automatically; override
  only the fields you need (`priority`, `initialization`, `env`, etc.).
- Custom server ids are allowed in project or user config when both `command`
  and `extensions` are provided.
- Project entries win over user entries; both win over builtin defaults.
- `disabled: true` suppresses that server id.

Each language reference gives a ready-to-paste snippet.

### 4. Verify

Prefer a real diagnostics roundtrip through the current OpenCode/ocmm `lsp` MCP
tools if they are available. To smoke-test the packaged MCP surface directly:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n' | ocmm-lsp mcp
```

If this checkout also contains upstream omo's `packages/lsp-tools-mcp/src`, the
bundled script can perform the same kind of roundtrip:

```bash
bun scripts/verify-lsp.ts <path/to/file.ext>
bun scripts/verify-lsp.ts <file> --timeout=90000
```

`OK` = the server started and answered. `FAIL: language server not installed`
= go back to step 2. Other `FAIL` text carries the server/startup error.
`SKIP` = the upstream engine source could not be located; in a plain ocmm
checkout, call the OpenCode `lsp` MCP diagnostics tool or `ocmm-lsp mcp`
directly instead.

---

## Scripts

| Script | Purpose |
|---|---|
| `scripts/detect-lsp.ts` | Scan a directory; per detected language report server id, install status, install hint, config status. `--json` for machine output. |
| `scripts/verify-lsp.ts` | Real LSP diagnostics roundtrip for one file via the `lsp-tools-mcp` engine; `OK`/`FAIL`/`SKIP` + exit code 0/1/3. |
| `scripts/lsp-server-table.ts` | Embedded snapshot of the primary builtin server per language (mirrors `server-definitions.ts`). |

Run with [Bun](https://bun.sh): `curl -fsSL https://bun.sh/install | bash`.
