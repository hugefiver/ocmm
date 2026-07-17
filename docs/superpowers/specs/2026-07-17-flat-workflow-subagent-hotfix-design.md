# Flat Workflow Subagent Hotfix Design

## Goal

Prevent workflow agents from recursively handing control, planning, or review to other workflow agents while retaining bounded delegation to small utility agents. Treat `deep` and `complex` as local coordinators that may also delegate selected specialist execution work when delegation is necessary.

## Current Problem

- `planner` is registered with task permission and its role prompt tells it to call `code-search`, `doc-search`, `reviewer`, and eventually `plan-critic`.
- `coding`, `normal-task`, `complex`, and `deep` are subagents but currently receive broad task permission.
- GPT-5.6 calibration permits nested delegation whenever each level has a distinct deliverable, which is too permissive for this workflow.
- The v1 implementer template requires self-review but does not explicitly return ownership of plan review and final review to the orchestrator.
- The v1 review skill assumes a committed `BASE_SHA..HEAD_SHA` range, which conflicts with implementation subagents returning uncommitted changes for orchestrator-owned review and commit handling.
- OpenCode, v1, and generated Codex prompts can therefore disagree about who owns follow-up dispatch and acceptance review.

## Delegation Policy

### Primary coordinators

`orchestrator` and `builder` remain primary agents. They retain their existing broad task permission. GPT-5.6 must still prefer direct tools and delegate only when a separate bounded deliverable, specialist capability, or material context saving makes delegation necessary. Multiple steps, routine confirmation, or a desire for another opinion are not sufficient by themselves.

### Utility leaf agents

The utility allowlist is:

- `quick`
- `code-search`
- `explore`
- `doc-search`
- `research`
- `media-reader`

These agents are terminal leaves. They never dispatch another agent and always return their result to their caller.

### Standard workflow subagents

`coding`, `normal-task`, `frontend`, `creative`, `hard-reasoning`, and `documenting` may call only utility leaf agents, and only when direct tools are insufficient or delegation produces a clearly independent bounded result. They must not call planning, review, coordination, or other implementation workflow agents. After local verification they return evidence and status to their caller; the orchestrator owns final acceptance review.

### Read-only workflow subagents

`planner`, `reviewer`, `oracle`, `oracle-high`, `clarifier`, and `plan-critic` may call only read-only utility agents:

- `code-search`
- `explore`
- `doc-search`
- `research`
- `media-reader`

They may not call `quick`, because doing so would allow a read-only role to modify work by proxy. `planner` writes the plan and returns it to the orchestrator. The orchestrator, not planner, owns the `plan-critic` loop. Review agents return findings and never launch another review.

### Local coordinators

`deep` and `complex` may call:

- every utility leaf agent; and
- `coding`, `frontend`, `hard-reasoning`, `creative`, and `documenting`.

They use specialist execution agents only when the child owns a distinct bounded deliverable that materially improves completion. They must not call `orchestrator`, `builder`, `planner`, `clarifier`, `plan-critic`, `reviewer`, `oracle`, `oracle-high`, `normal-task`, `deep`, or `complex`. They integrate child results, verify the assigned work, and return to their parent. Formal plan review and final acceptance review remain orchestrator-owned.

## Effective Prompt Contract

The config prompt-composition layer will append one authoritative contract according to the registered agent/category name:

1. Primary coordinator calibration for `orchestrator` and `builder` remains role-driven.
2. Local coordinator contract for `deep` and `complex` lists their exact allowed targets and necessity test.
3. Standard workflow contract lists only the utility targets allowed for that role.
4. Utility leaf contract explicitly prohibits all further dispatch.

If a loaded skill asks a non-primary agent to invoke `plan-critic`, reviewer/oracle, or another disallowed workflow agent, the role contract wins: the agent reports the needed handoff to its caller instead of dispatching it.

Planner role prompts in `prompts/{omo,v1,codex}/agents/planner.md` will remove direct reviewer and plan-critic ownership. GPT-5.6 calibration in all three workflows will replace the current permissive nested-delegation sentence with the role-aware policy and a strict necessity test. The v1 subagent-driven skill and implementer template will explicitly tell implementation children to use only permitted utility agents, avoid Git writes, and return to the orchestrator rather than launching review agents. The v1 review skill and subagent-driven final review instructions will support both committed range review and orchestrator-owned working-tree diff review so child agents do not need to commit just to make final review possible.

## Permission Backstop

Use OpenCode's granular `permission.task` object syntax. Each non-primary built-in agent receives a deny-all rule followed by exact allows for its permitted targets. Denied targets are omitted from the Task tool description, reducing both accidental attempts and prompt noise.

Utility leaves receive `task: "deny"`. Primary agents retain broad task permission. Existing explicit user permission overrides remain authoritative because defaults are merged only when the corresponding permission is absent.

The existing `subagent.maxDepth` guard remains unchanged. The target allowlists, rather than depth alone, terminate the graph: utility agents cannot create another child.

## Files and Synchronization

Expected source changes:

- `src/hooks/config.ts`
- `src/hooks/config.test.ts`
- `src/hooks/config.category.test.ts`
- `src/intent/prompt-loader.test.ts`
- `prompts/{omo,v1,codex}/agents/planner.md`
- `prompts/{omo,v1,codex}/deepwork/gpt-5.6.md`
- `skills/v1/subagent-driven-development/SKILL.md`
- `skills/v1/subagent-driven-development/implementer-prompt.md`
- `skills/v1/requesting-code-review/SKILL.md`
- `skills/v1/requesting-code-review/code-reviewer.md`
- `docs/v1-maintenance.md`
- `docs/prompt-sync.md`

After prompt changes, regenerate the Codex bundle with `pnpm run build:ts` and `pnpm run gen:codex-plugin`, including the resulting `.agents/plugins/marketplace.json`, `.codex/agents/**`, and `plugins/deepwork/**` changes required to keep generated artifacts synchronized.

## Verification

Tests must prove:

1. `orchestrator` and `builder` retain primary task capability.
2. Utility leaves have no callable subagents.
3. Standard workflow subagents see only their utility allowlist.
4. Read-only workflow agents cannot call `quick` or any workflow/review agent.
5. `deep` and `complex` see exactly the utility and selected specialist execution allowlists.
6. Effective prompts state that planner returns plans, implementation children return results, and review ownership stays with orchestrator.
7. GPT-5.6 prompts in omo, v1, and Codex contain the role-aware necessity threshold and no longer authorize arbitrary distinct-deliverable nesting.
8. The v1 review flow can review either a commit range or an uncommitted working-tree diff without requiring implementation subagents to commit.
9. Generated Codex profiles and generated v1 skills contain the same contracts, allowing for Codex-only skill frontmatter renaming and compatibility sections.

Run targeted prompt/config/generator tests, `pnpm run typecheck`, `pnpm test`, `pnpm run build`, and a deterministic second Codex generation check. Clear and restore ambient `OCMM_PROFILE` and `OCMM_NO_PROFILE` around tests and generation.

## Non-Goals

- Do not remove orchestrator-owned plan-critic or final acceptance review workflows.
- Do not require implementation subagents to create commits solely to enable final review.
- Do not change `subagent.maxDepth`.
- Do not rewrite OpenCode's Task tool or add a runtime dispatch hook.
- Do not impose these built-in defaults on arbitrary user-defined custom agents.
- Do not modify unrelated untracked design or plan documents.
