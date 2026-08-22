---
name: subagent-driven-development
description: Use in dsmm deepwork mode to execute an approved plan task-by-task with safe subagent delegation and review gates.
---

# Subagent-Driven Development

Use this skill after an approved implementation plan exists.

1. Work through the plan one task at a time; do not start later tasks until the current task is integrated and checked.
2. Delegate only bounded, independent implementation or investigation work to subagents. Give each subagent the task, relevant files, acceptance criteria, and verification command.
3. Require subagents to avoid git writes. Staging, committing, tagging, pushing, rebasing, or history edits stay with the user-approved coordinator.
4. After each subagent returns, inspect the changed files, resolve conflicts or mismatches, and run the task's verification before marking it complete.
5. When all tasks are complete, run the plan's final verification and request final review according to the active workflow policy.
