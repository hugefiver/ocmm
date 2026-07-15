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
- Optional supplemental high-effort review: `[@dw-oracle-high](subagent://dw-oracle-high)` or `multi_agent_v1.spawn_agent(agent_type="dw-oracle-high", fork_context=false, message="<supplemental high-effort review task>")` — only when explicitly configured by user/profile, available in the current catalog/dispatch surface, and not disabled

When Codex exposes MultiAgentV2 flat tools, map Deepwork delegation to the available flat tool names instead of forcing V1 syntax: use `spawn_agent` to create a bounded agent, `wait_agent` to wait for completion, `followup_task` to continue an existing agent, `interrupt_agent` to stop a runaway agent, and `fork_turns` only for explicit branch-style exploration. If those names are not callable in the current thread, fall back to the route order below.

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

| Codex agent | Profile effort | Deepwork source |
|---|---|---|
| dw-builder | high | builder |
| dw-clarifier | high | clarifier |
| dw-code-search | high | code-search |
| dw-coding | high | coding |
| dw-complex | high | complex |
| dw-creative | high | creative |
| dw-deep | xhigh | deep |
| dw-doc-search | high | doc-search |
| dw-documenting | high | documenting |
| dw-explore | high | explore |
| dw-frontend | high | frontend |
| dw-hard-reasoning | xhigh | hard-reasoning |
| dw-media-reader | high | media-reader |
| dw-normal-task | high | normal-task |
| dw-oracle | xhigh | oracle |
| dw-oracle-high | xhigh | oracle-high |
| dw-orchestrator | high | orchestrator |
| dw-plan-critic | xhigh | plan-critic |
| dw-planner | xhigh | planner |
| dw-quick | high | quick |
| dw-research | high | research |
| dw-reviewer | xhigh | reviewer |

Generated profile defaults are installation metadata, not mandatory choices. Actual delegation must preserve explicit user configuration and select overrides only from the currently available model catalog.

## Runtime Model Selection

For an exact profile, omit `model` and `reasoning_effort` by default so Codex can apply the selected `dw-*` profile. For direct composition, select the tier model below only when the current tool exposes `model`, preserve the profile's existing reasoning effort as the baseline, and load the selected role's developer instructions and required skills. For generic/flat dispatch with no model field, do not invent an override: the child inherits its native/default model while the role and skills are carried in `message`. An explicit user-selected model always wins.

### Runtime model upgrades (only when directly selectable)

Apply this section only when the current dispatch surface exposes a `model` field or an exact profile route that also accepts a model override. An explicit user-selected model always wins. Determine availability from the current callable surface or active model catalog; model names in examples are references only and never prove availability. When no suitable model in a lane is available, omit the override and preserve the generated profile's existing model and reasoning behavior unchanged.

| Role lane | Selection principle | Reasoning effort | Roles |
|---|---|---|---|
| Flagship | Best available primary reasoning model in the user's catalog | `xhigh` minimum for planning, deep implementation, hard reasoning, architecture, algorithmic, security, or high-risk work; use native `max` on GPT-5.6 when maximum reasoning is requested, and use the family-supported maximum elsewhere. `high` remains acceptable for coordination, implementation, or clarification roles below that threshold. | dw-orchestrator, dw-planner, dw-builder, dw-clarifier, dw-deep, dw-hard-reasoning |
| External review | Same primary reasoning lane as flagship work, selected from available models | `xhigh` minimum; use native `max` on GPT-5.6 for complex, cross-module, security, performance, high-risk, or final-gate review | dw-reviewer |
| Supplemental high-effort review | Optional third review lane, only when explicitly configured, available, and not disabled | `xhigh` minimum; use native `max` on GPT-5.6 for complex or high-risk final verification | dw-oracle-high |
| Plan review | Same primary reasoning lane when directly configurable | `xhigh` minimum; local `max` only by explicit local configuration | dw-plan-critic |
| Cross-check | Prefer a configured heterogeneous or otherwise non-identical review lane before any supplemental same-lane fallback | `xhigh` minimum; use native `max` on max-capable supplemental checks when maximum verification is requested | dw-oracle |
| Mid | Best available mid-tier model; if none exists, use the primary reasoning model at a lower effort | Preserve the profile baseline unless task complexity requires more | dw-complex, dw-normal-task, dw-coding, dw-research, dw-frontend, dw-creative, dw-documenting, dw-media-reader, dw-doc-search |
| Mini | Best available lightweight model for mechanical, search, or fast lookup work | `high` for accuracy unless the user explicitly configures otherwise | dw-quick, dw-code-search, dw-explore |

When a newer family is explicitly available, select a demonstrably better model in the same capability lane instead of pinning an example name. For Cross-check, prefer a configured heterogeneous or otherwise non-identical oracle model first, then a supplemental same-lane option only when no better independent configured model is available. Keep the role's high/xhigh/max complexity rule, never override an explicit user model, and fall back to the generated profile default when availability or capability evidence is absent.

Reviewer, oracle, and oracle-high routes use an `xhigh`-equivalent minimum when the selected model family exposes that control; otherwise they use the highest supported review effort for that family. GPT-5.6 supports native `max`, so complex or high-risk review/verification on a GPT-5.6 selected model may request `max` directly. Other families use `max` only when their cataloged controls support it. oracle-high preserves local `max` for GPT-5.6 and other max-capable models.

The plan-critic profile uses `xhigh` minimum; raise it only through explicit local configuration.

### Tier assignments

| Tier | Agents | Model | Effort |
|---|---|---|---|
| Flagship | dw-orchestrator, dw-planner, dw-builder, dw-clarifier, dw-deep, dw-hard-reasoning | Primary reasoning model from the user's available catalog | xhigh minimum for planner/deep/hard-reasoning; native max for GPT-5.6 maximum-reasoning work. high only for coordination, implementation, or clarification roles below that threshold |
| External review | dw-reviewer | Primary reasoning lane | xhigh-equivalent minimum when supported; native max for GPT-5.6 complex or high-risk review |
| Supplemental high-effort review | dw-oracle-high | Only when explicitly configured, available, and not disabled; otherwise omit | xhigh-equivalent minimum when supported; native max for GPT-5.6 complex or high-risk final verification |
| Plan review | dw-plan-critic | Primary reasoning lane | xhigh minimum unless local config raises it |
| Cross-check | dw-oracle | Configured heterogeneous or otherwise non-identical capable model; supplemental same-lane fallback only when needed | xhigh-equivalent minimum when supported; native max for max-capable maximum verification |
| Mid | dw-complex, dw-normal-task, dw-coding, dw-research, dw-frontend, dw-creative, dw-documenting, dw-media-reader, dw-doc-search | Available mid-tier model, else primary reasoning model at lower effort | max or high by task shape |
| Mini | dw-quick, dw-code-search, dw-explore | Available lightweight model | high |

### Model tier definitions

- **Flagship**: the most capable primary reasoning model available to the user.
- **Mid-tier**: a lighter-but-capable configured model. If no mid-tier lane is available, use the primary reasoning lane at `high` effort instead.
- **Mini**: the smallest/cheapest model available for fast mechanical or lookup tasks.
- **Strong non-identical cross-check**: a capable available model that differs from the primary lane when possible; model diversity is useful, but not a reason to bypass the newer-model policy.

### Independent review rule

dw-oracle provides self-supervision through the Cross-check lane, while dw-reviewer provides external review through the External review lane. Prefer oracle diversity from a configured heterogeneous or otherwise non-identical capable model; use a supplemental same-lane option only if the diverse option is unavailable or explicitly configured. The default complex/large review set is dw-oracle + dw-reviewer. Add dw-oracle-high only when it is explicitly configured by user/profile, available in the current catalog/dispatch surface, and not disabled. Built-in, default, or generated-profile existence alone must not force three-review dispatch. Do not force multi-review for ordinary work.

dw-plan-critic provides receipt-focused plan review through the Plan review lane at `xhigh` minimum.

Reviewer, oracle, and oracle-high routes use an `xhigh`-equivalent minimum when the selected model family exposes that control; otherwise they use the highest supported review effort for that family. GPT-5.6 supports native `max`; for other families, request `max` only when the selected model and catalog expose a maximum-effort control.

### Example names

Concrete model names in docs, tests, or generated profile comments are examples and compatibility references only. Select from the user's currently available model catalog and explicit local configuration; never require a specific example name or provider channel.
