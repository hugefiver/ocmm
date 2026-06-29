# ocmm Codex Plugin

Generated from the ocmm source tree. Do not edit generated files by hand; run `pnpm run gen:codex-plugin` from the repository root.

- Workflow: `v1`
- Generated agents: 21
- Skills are copied from `skills/` plus flattened `skills/v1/` deepwork skills.
- MCP servers are generated from the ocmm `mcp` config namespace.
- The default `lsp` MCP uses the plugin-local `ocmm-lsp` wrapper and bundled GitHub Release binary.
- Workflow skill: `deepwork`.
- Generated Codex agent profiles use the `dw-*` prefix, including functional agents such as `dw-oracle` and `dw-creative`.

The OpenCode plugin remains `dist/index.js`; this directory is the Codex adapter bundle.
