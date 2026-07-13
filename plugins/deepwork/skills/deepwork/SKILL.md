---
name: deepwork
description: "MUST USE when the user asks for deepwork-style planning, multi-agent execution, code review, research, or workflow routing inside Codex."
---

# Deepwork

This is the Codex adapter skill for deepwork. Use it to apply Deepwork's autonomous workflow semantics inside Codex while leaving the OpenCode plugin untouched.

## Runtime Mapping

- Use Codex `update_plan` for TodoWrite-style planning.
- Use the current callable Codex subagent-dispatch tool when delegation is useful and available. Match its actual schema: prefer exact profile selection, then complete model-plus-role composition, then generic/flat dispatch with a self-contained role-and-skills message.
- Use Codex MCP tools exposed by this plugin for docs/search/context where available.
- Use Codex `apply_patch` for manual edits; use shell commands for read-only inspection and project verification.
- Use generated `dw-*` agent TOML files from this plugin bundle's `agents/` directory as installable profiles when you want Deepwork role prompts as Codex agents. Resolve the directory relative to the installed plugin root, not a source checkout path.

## Workflow

Configured workflow: `codex`

1. Classify the request into quick, normal-task, coding, complex, deep, research, frontend, hard-reasoning, creative, or documenting.
2. Select the matching Deepwork role or generated `dw-*` Codex agent.
3. Load task-relevant skills explicitly before doing specialized work.
4. Verify with the repository's own commands before reporting completion.

## Delegation

When a Deepwork role maps to a generated agent, use the exact Codex agent type when the current dispatch tool can select it. A generic or flat subagent does not load the generated profile; when that is the only callable route, follow the generic fallback below and state the role, skills, and task explicitly in its message.

- Plan review: `[@dw-plan-critic](subagent://dw-plan-critic)` or `multi_agent_v1.spawn_agent(agent_type="dw-plan-critic", fork_context=false, message="Review the plan at <path>.")`
- Code/work review: `[@dw-reviewer](subagent://dw-reviewer)` or `multi_agent_v1.spawn_agent(agent_type="dw-reviewer", fork_context=false, message="<bounded review task>")`
- Self-supervision: `[@dw-oracle](subagent://dw-oracle)` or `multi_agent_v1.spawn_agent(agent_type="dw-oracle", fork_context=false, message="<specific verification task>")`

The `dw-*` agent profile is the preferred selector. When a current native dispatch tool can select that profile directly, use it before any generic route.

Do not pass `dw-*.toml` files as `items`, `skill` attachments, or prompt context to a generic subagent. TOML files are installation artifacts for Codex's agent registry, not runtime skills.

The current callable dispatch-tool schema is the only availability signal. MultiAgent V1/V2 names are useful hints but not a contract: use any current or future native dispatch surface only according to the parameters it actually exposes. Do not inspect unrelated or deferred tools for a hidden profile selector. An `[@dw-*](subagent://dw-*)` link does not spawn an agent, and a `task_name` does not select a profile.

Use the first available native route in this order:

1. **Exact profile** — a tool field such as `agent_type`, `agent_path`, or `agent_nickname` only when the current tool schema or its documentation explicitly guarantees that it selects the generated `dw-*` profile.
2. **Direct composition** — a native dispatch tool that can choose the required model and supply the role's actual system or developer instructions plus skills. Select the matching model from the role tier below, supply the selected role's generated developer-instruction content (not its TOML wrapper), and attach or load the workflow skill and task-relevant `SKILL.md` artifacts through the fields the tool actually exposes. State that this is a generic fallback, not an exact-profile invocation.
3. **Generic or flat dispatch** — when a callable subagent tool can only accept a task identity and message (for example `task_name`, `message`, and `fork_turns`), still delegate. Put this self-contained envelope in `message`:

   `TASK:` <imperative, bounded assignment>
   `ROLE:` <Deepwork role and purpose>
   `DELIVERABLE:` <concrete expected output>
   `SCOPE:` <files, context, and boundaries>
   `VERIFY:` <test, evidence, or observable result>
   `REQUIRED SKILLS:` <workflow skill and task-relevant skills>
   `CONTEXT:` <minimal information the child needs>
   `CONSTRAINTS:` <permissions and non-goals>

   Use any real skill-loading field only when it is exposed. Do not claim that this loaded the `dw-*` profile; the child uses its inherited/default model and follows the role and skill guidance in the message.
4. **Local execution** — use only when no callable native subagent-dispatch route is available.

If an exact `dw-*` invocation returns `unknown agent_type`, continue at route 2 when it is complete enough, otherwise use route 3. A tool limited to `task_name`, `message`, and `fork_turns` cannot select a model or load the profile payload, but it is still a valid generic/flat dispatch route. Install the generated TOML files into project `.codex/agents/` or personal `~/.codex/agents/` and restart or refresh the Codex thread only when restoring exact-profile delegation is itself in scope.

## Generated Agents

| Codex agent | Model | Effort | Deepwork source |
|---|---|---|---|
| dw-builder | gpt-5.5 | high | builder |
| dw-clarifier | gpt-5.5 | high | clarifier |
| dw-code-search | gpt-5.4-mini-fast | high | code-search |
| dw-coding | gpt-5.5 | high | coding |
| dw-complex | gpt-5.5 | high | complex |
| dw-creative | gpt-5.5 | high | creative |
| dw-deep | gpt-5.5 | high | deep |
| dw-doc-search | gpt-5.4-mini-fast | high | doc-search |
| dw-documenting | gpt-5.5 | high | documenting |
| dw-explore | gpt-5.4-mini-fast | high | explore |
| dw-frontend | gpt-5.5 | high | frontend |
| dw-hard-reasoning | gpt-5.5 | xhigh | hard-reasoning |
| dw-media-reader | gpt-5.5 | high | media-reader |
| dw-normal-task | gpt-5.5 | high | normal-task |
| dw-oracle | gpt-5 | xhigh | oracle |
| dw-orchestrator | gpt-5.5 | high | orchestrator |
| dw-plan-critic | gpt-5.5 | xhigh | plan-critic |
| dw-planner | gpt-5.5 | high | planner |
| dw-quick | gpt-5.4-mini | high | quick |
| dw-research | gpt-5.5 | high | research |
| dw-reviewer | gpt-5.5 | xhigh | reviewer |

## Runtime Model Selection

For an exact profile, omit `model` and `reasoning_effort` by default so Codex can apply the selected `dw-*` profile. For direct composition, select the tier model below only when the current tool exposes `model`, preserve the profile's existing reasoning effort as the baseline, and load the selected role's developer instructions and required skills. For generic/flat dispatch with no model field, do not invent an override: the child inherits its native/default model while the role and skills are carried in `message`. An explicit user-selected model always wins.

### GPT runtime upgrades (only when directly selectable)

Apply this section only when the current dispatch surface exposes a `model` field or an exact profile route that also accepts a model override. An explicit user-selected model always wins. Determine availability from the current callable surface or active model catalog; do not assume a model exists from its name. When no GPT-5.6 model is available, omit the override and preserve the generated profile's existing model and reasoning behavior unchanged.

| Role lane | Preferred GPT-5.6 model | Reasoning effort | Roles |
|---|---|---|---|
| Flagship | `gpt-5.6-sol` | `high` by default; `xhigh` for deep, architecture, algorithmic, security, or high-risk reasoning | dw-orchestrator, dw-planner, dw-builder, dw-clarifier, dw-deep, dw-hard-reasoning |
| External review | `gpt-5.6-sol` | `xhigh` minimum; local `max` for complex, cross-module, security, performance, high-risk, or final-gate review (mapped to the target maximum) | dw-reviewer |
| Plan review | `gpt-5.6-sol` | fixed `xhigh` | dw-plan-critic |
| Cross-check | `gpt-5.6-terra` | `xhigh` minimum; local `max` for complex or high-risk verification (mapped to the target maximum) | dw-oracle |
| Mid | `gpt-5.6-terra` | Preserve the profile baseline unless task complexity requires more | dw-complex, dw-normal-task, dw-coding, dw-research, dw-frontend, dw-creative, dw-documenting, dw-media-reader, dw-doc-search |
| Mini | `gpt-5.6-luna` | `high` | dw-quick, dw-code-search, dw-explore |

When a newer GPT family is explicitly available, select a demonstrably better model in the same capability lane instead of pinning the 5.6 name: newest flagship for Flagship and External review, and a strong non-identical mid-tier or flagship for Cross-check. Keep the role's high/xhigh complexity rule, never override an explicit user model, and fall back to the generated profile default when availability or capability evidence is absent.

For reviewer and oracle GPT/Codex routes, `xhigh` is the minimum reasoning effort. For complex or high-risk review or verification, request local `max`; the adapter maps it to the target's maximum supported effort (currently `xhigh` for GPT/Codex).

The plan-critic profile remains fixed `xhigh`; its receipt-focused plan review does not use the reviewer/oracle local-effort escalation policy.

### Tier assignments

| Tier | Agents | Model | Effort |
|---|---|---|---|
| Flagship | dw-orchestrator, dw-planner, dw-builder, dw-clarifier, dw-deep, dw-hard-reasoning | Latest-gen flagship | high or xhigh by complexity |
| External review | dw-reviewer | Latest-gen flagship | xhigh minimum; local max for complex or high-risk review |
| Plan review | dw-plan-critic | Latest-gen flagship | fixed xhigh |
| Cross-check | dw-oracle | Latest available Terra-lane model; otherwise a strong non-identical mid-tier or flagship | xhigh minimum; local max for complex or high-risk verification |
| Mid | dw-complex, dw-normal-task, dw-coding, dw-research, dw-frontend, dw-creative, dw-documenting, dw-media-reader, dw-doc-search | Latest-gen mid-tier at max, else flagship at high | max or high |
| Mini | dw-quick, dw-code-search, dw-explore | Latest-gen mini | high |

### Model tier definitions

- **Flagship**: the most capable model of the latest generation (e.g., gpt-5.5 in the 5.x gen).
- **Mid-tier**: a lighter-but-capable model within the latest generation. If the latest gen has no mid-tier, use the flagship at `high` effort instead.
- **Mini**: the smallest/cheapest model of the latest generation (e.g., `-mini` variants).
- **Strong non-identical cross-check**: a capable available model that differs from the primary lane when possible; model diversity is useful, but not a reason to bypass the newer-model policy.

### Independent review rule

dw-oracle provides self-supervision through the Cross-check lane (GPT-5.6 Terra or a newer Terra-lane successor when directly available), while dw-reviewer provides external review through the External review lane. Preserve an independent review perspective with a non-identical capable model when available, but never downgrade or leave the Terra lane merely to force diversity.

dw-plan-critic provides receipt-focused plan review through the Plan review lane at fixed `xhigh`.

If only one capable model is available, keep the reviewer/oracle GPT/Codex `xhigh` floor and use local `max` for complex or high-risk review or verification.

### Example (GPT-5.6 generation — verify against your available models)

| Tier | Example model | Effort |
|---|---|---|
| Flagship | gpt-5.6-sol | high or xhigh |
| External review | gpt-5.6-sol | xhigh minimum; local max for complex/high-risk work |
| Cross-check | gpt-5.6-terra | xhigh minimum; local max for complex/high-risk work |
| Mid | gpt-5.6-terra | high or max |
| Mini | gpt-5.6-luna | high |
