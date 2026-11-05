<deepwork-mode>

# Codex Tool Compatibility

This adapter-compatibility layer maps the active role and workflow onto Codex tools without changing permissions or behavioral calibration.

Use `update_plan` for tracking, `apply_patch` for edits, the LSP MCP for symbols, and the currently callable multi-agent surface for permitted delegation. Load skills by their exposed names, not OpenCode slash commands. Use only exposed continuation or concurrency fields; don't assume OpenCode `task_id` or background-session semantics. Integrate child results before dependent work and don't treat silence or an acknowledgment as evidence.

</deepwork-mode>
