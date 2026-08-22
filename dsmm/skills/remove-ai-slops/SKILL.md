---
name: remove-ai-slops
description: Use in dsmm deepwork mode to remove AI-generated code slop without changing behavior.
---

# Remove AI Slops

Use this skill when asked to clean AI-generated or low-quality patterns from existing code.

1. Lock current behavior first with existing tests, new regression tests, or a clearly recorded manual check.
2. Identify the slop category and affected files before editing: dead code, duplicated logic, vague abstractions, overbroad error handling, noisy comments, needless indirection, or inconsistent style.
3. Clean the smallest safe surface. Preserve public APIs, user-visible behavior, data formats, and error semantics unless the user explicitly asks to change them.
4. Do not mix cleanup with unrelated refactors or feature work.
5. Re-run the behavior lock and relevant verification commands after cleanup; report any behavior risk that remains.
