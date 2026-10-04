---
name: debugging
description: Use on demand for real runtime failures, flaky tests and DAP-assisted investigation; this is not one of the seven automatically injected core workflow skills.
---

# Debugging

Investigate the observed runtime behavior in the actual DSH environment. Form several plausible hypotheses, collect distinguishing evidence, and capture a failing case before applying a minimal fix. Verify that same case afterward and exercise the real affected surface. Clean up only task-owned artifacts after inspecting exact targets.

Read the relevant runtime and methodology guides in `references/` as needed. For a DAP-capable debugger, read `references/tools/dap.md` and use the bundled zero-dependency `references/scripts/dap.mjs` through a currently available shell tool; do not invent a DSH debugger API or install an adapter without authorization. Keep debugger target directories and credentials isolated. The DAP client does not grant permissions beyond the current DSH sandbox, shell and user approval policy.

The coordinator chooses any genuinely useful independent investigation through currently callable role-specific DSH tools. Do not assume OpenCode/Codex tool names, session errors or retry ownership. Never stage, commit, push, tag, rebase or release as an incidental debugging step.
