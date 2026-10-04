---
name: dispatching-parallel-agents
description: Use in dsmm deepwork mode when two or more tasks can run independently without shared state or sequential dependencies.
---

# Dispatching Parallel Agents

Use this skill only when parallel work is genuinely independent.

1. Split work by non-overlapping files, data, or decisions. If tasks may edit the same area or depend on each other's outcome, run them sequentially.
2. Give every dispatched agent a narrow scope, acceptance criteria, forbidden areas, and the evidence it must return.
3. Keep shared decisions in the coordinator; do not ask parallel agents to make incompatible architecture or API choices.
4. When agents return, compare their outputs against the plan, inspect changed files, and check for merge conflicts, duplicated work, or inconsistent assumptions.
5. Verify the combined result, not just each agent's isolated evidence, before continuing. Use only currently callable DSH tools and obey the host's depth and permission decisions; no child may enlarge Git authority or independently dispatch a conflicting role.
