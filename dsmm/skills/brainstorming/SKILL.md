---
name: brainstorming
description: "Use before creative or materially ambiguous work to clarify outcomes, constraints, risks, and an appropriate implementation direction."
---

## DSH resource and authority contract

This is a full OCMM source adaptation for DSH 0.2.0-rc.2, not an OpenCode or Codex runtime. Source product names in transcript formats, examples, paths and attribution remain descriptive; they are not a host switch.

- Load this skill through the native skill tool only when its trigger matches. Resolve every relative reference/script/asset from the directory resourceBase returned with this skill, not from the project cwd or an OCMM checkout. Use available read/glob/grep to inspect resources; use write/edit and the active bash or pwsh only within the actual role and host permissions.
- External documentation uses actual web_search/web_fetch or an available documentation service. Context7, GitHub MCP, browser, image and LSP tools are optional catalog capabilities, not bundled calls. Use a real available equivalent or report unavailable evidence; never invent an MCP, Task, todo or compression API.
- Source role names are logical assignments: code-search/explore maps to dsmm-code-search, and other canonical roles/categories map to dsmm-<name>. Dispatch only through the actual role-specific native subagent tool in the current catalog, within the caller's effective policy, depth and authority. No generated file, metadata row or template proves callability. A missing permitted role is a blocker for a required formal stage, not permission to invent it or bypass planning.
- Templates describe assignment content, not a callable argument schema. Native continuation, background, message/interrupt and result handling are used only when actually exposed and supported; do not send task_id, subagent_type or guessed timeout fields. Otherwise perform permitted direct work or return the dependency to the stage owner.
- Use a concise response or an authorized project plan for tracking when no native tracking tool is exposed. Compression is unavailable unless a real tool is exposed; do not simulate it. Role responsibilities, explicit-off common/skill visibility, and the terminal delegation contract override broader examples in a resource.
- Installation, package-manager bootstrap, downloads, authentication/login, credential/profile access, Git writes and destructive actions require explicit authorization for the exact action. Reference commands are not automatic operations. Worktree consent does not authorize dependency installation or later branch deletion. Read before changing an existing file; preserve unrelated user work. Never silently restore/reset a working tree to repair a failed cleanup.
- Browser/debug QA uses run-owned isolated state, no imported credentials or browser profile, and only already available software unless separately authorized. Keep commands in the active shell dialect. Report unverified surfaces honestly.

<!-- v1 fork of superpowers/brainstorming.
     Upstream: obra/superpowers v6.3.0.
     Adjustments: removed visual-companion and excluded-skill references;
     discovery and design now scale with actual uncertainty and risk. A clear,
     authorized task does not require a separate design gate, rigid checklist,
     fixed option count, or repeated approval loop; complex implementation still
     follows the workflow planning policy. See docs/v1-maintenance.md
     for sync rules. -->

# Brainstorming Outcomes Into Designs

Use discovery and design to remove material uncertainty before implementation. The durable objective is a shared understanding of the goal, constraints, acceptance criteria, interfaces, risks, and ideal end state—not completion of a prescribed ceremony.

## Authorization and Intent

Start from the user's request and current project evidence:

- Identify the requested goal and ideal end state.
- Preserve stated constraints, permissions, exclusions, and acceptance criteria.
- Treat a materially clear imperative as authorization to implement that stated scope. Do not require a separate design presentation or reapproval merely because implementation follows discovery.
- Honor an explicit request for a strict process, design review, approval checkpoint, artifact, or verification step.
- Ask or obtain specific authorization when a decision changes the requested scope or acceptance, weakens security or data guarantees, changes a public API/protocol, expands permissions, triggers an irreversible/destructive action, or causes an external side effect that requires consent.

An instruction to design, investigate, implement, or fix does not authorize unrelated work. Git authorization is operation-specific: implement/fix is not commit; commit is not push, tag, rebase, or release. A clear request for an exact Git operation authorizes that operation without a redundant confirmation, but never expands to another operation, repository, branch, or release action.

## Choose Proportional Discovery

Choose and revise the path based on actual uncertainty, coordination, and risk. Path labels are planning aids, not gates, and may become lighter or heavier as evidence resolves or reveals complexity.

- **Direct/bounded:** The goal, affected flow, constraints, and acceptance are materially clear. Read enough local context to match patterns, state any consequential assumption, and proceed without a separate design approval.
- **Spike:** Feasibility or missing facts determine the path. Use the cheapest valid investigation and return a recommendation; exploratory code is throwaway unless the user authorizes implementation.
- **Architectural:** Boundaries, interfaces, dependencies, or consequential trade-offs remain unresolved. Explore enough to make those decisions explicit, then present the useful design or choices before implementation when user input is materially required.

Do not default upward merely because work is multi-file, creative, or unfamiliar. Do not default downward when concrete security, data-loss, compatibility, protocol/API, migration, release, or irreversible-operation risks require additional care.

These paths size discovery and design; they do not replace workflow planning policy. Complex business or behavior implementation defaults to `planner` → `plan-critic` → implementation even when requirements are clear and evidence is strong. Planning or criticism may be skipped only for a limited, simple, low-risk, clearly bounded change, or when the user explicitly requests the skip; record the short reason. An explicit skip never permits an unapproved security, data, API/protocol, permission, or irreversible-action decision.

## Discovery

Inspect only enough project context to resolve material questions:

- current behavior and relevant local patterns;
- affected boundaries, dependencies, and interfaces;
- constraints and acceptance evidence;
- plausible failure, rollback, compatibility, security, data, and operational risks;
- independent work that can form separate waves.

Use a clarifier or ask the user only when missing information would change the deliverable, create material rework, or cross an escalation boundary. Ask the smallest useful question in the clearest form; there is no required question count, option count, or multiple-choice format.

## Explore Approaches When They Matter

Present alternatives only when there is a real decision with meaningful trade-offs. Give as many viable approaches as the decision warrants, including one when the evidence supports a single clear path. Explain the recommendation using project evidence, constraints, reversibility, risk, and cost.

Do not manufacture alternatives, architecture, or refactoring to make the process appear thorough. Follow established patterns and apply YAGNI.

## Outcome-Oriented Design

Scale the design artifact to the work. It may be a concise statement in chat, a contextual task outline, or a durable spec when coordination and risk justify one. A useful design makes the following discoverable without requiring fixed sections or order:

- goal and ideal end state;
- scope, exclusions, constraints, permissions, and acceptance criteria;
- current state and proposed approach;
- dependencies, interfaces, data/error flow, and ownership boundaries;
- material risks, rollback or safeguards where relevant;
- wave goals and useful acceptance evidence.

Organize waves by independently meaningful outcomes and dependency order. For each wave, state what becomes true and what evidence would demonstrate it. Do not require a task list, tiny sequential steps, or completion in a fixed order when work can safely proceed directly or in parallel.

## Bounded Rulings and Escalation

Resolve non-material ambiguity from the approved goal and repository evidence. Choose the smallest safe, reversible option that preserves the user's goal, constraints, permissions, and acceptance criteria.

Record significant rulings and assumptions in the active tracking surface or final report with:

- the decision or assumption;
- the evidence or reason;
- the cost if wrong.

Escalate rather than guess when a choice changes scope or acceptance, weakens security or data guarantees, changes a public API/protocol, expands permissions, creates an irreversible effect, conflicts with a specific user mandate, or has no evidence-based path. Strict process is otherwise justified only by an explicit user request or concrete risk.

## Review and Approval

Self-review a material design for requirement coverage, internal consistency, interfaces, risks, and acceptance evidence. Fix clear issues directly.

Request user review or approval only when their decision is needed, they explicitly requested the checkpoint, or a governing high-risk boundary requires it. Do not require approval section-by-section, repeat review because wording changed, or restart a design loop after a non-substantive edit. If substantive inputs change, revisit only the affected decisions and evidence.

A saved spec is not mandatory for a clear bounded change. Create one when the user requests it or durable coordination materially benefits from it. Do not create a separate design/spec commit by default.

## Implementation Handoff

Once the goal is authorized and material uncertainty is resolved, proceed through the applicable implementation workflow without asking for a second design approval. Hand off the goal, ideal end state, constraints, acceptance criteria, dependencies/interfaces, material risks, useful evidence, and recorded rulings. Use a file-backed plan when complex work needs the default planner/critic sequence or durable coordination; delegated workers remain conditional on execution value.
