# V1-Only Workflow and Upstream Sync Design

## Goal

Remove the maintained `omo` workflow, keep `v1` as the OpenCode workflow and
`codex` as the generated adapter workflow, and selectively absorb the reviewed
upstream improvements without importing OMO/Senpi runtime architecture.

## Global constraints

- Keep ocmm a thin OpenCode plugin; do not add a task manager, ledger, daemon,
  team runtime, memory runtime, or polling service.
- Remove `workflow: "omo"` directly from the public schema, loaders, prompts,
  tests, and current documentation. Do not add an alias, migration helper,
  compatibility warning, or legacy normalization path.
- Preserve `.omo/rules`, `.omo/plans`, `.omo/notepads`, the ignored `./omo`
  upstream checkout, and `--keep-omo`; these are compatibility surfaces, not
  the removed workflow.
- Git writes require user authorization. Authorization may be implicit only
  when the requested outcome necessarily entails the specific Git operation.
  Implementation does not imply commit, and specs/plans are not committed
  separately unless requested.
- Do not compute hashes for routine plans, tasks, files, evidence, checkpoints,
  or reviews. Keep checksums only where an external integrity or release
  protocol requires them, including release assets and existing commit IDs.
- Modify authoring sources, then regenerate schema and Codex artifacts. Do not
  hand-edit generated files.
- Remove tests that only pin deleted behavior, duplicate generated text, or
  implementation details such as an exact hash/prose shape. A failing test that
  still represents a valid product contract must be fixed, not deleted. When an
  obsolete test is removed, retain or add an outcome-focused test for the new
  contract where regression risk remains.
- Do not require a failing-first RED gate. Tests and reviews prove observable
  behavior, interface clarity, and meaningful regression protection; they do not
  exist to enforce prose fragments, implementation order, or workflow ceremony.

## Considered approaches

### Directly remove OMO

This is the selected approach. Runtime types, schema, prompt loading, tests, and
current documentation expose only `v1` and `codex`; `prompts/omo/` is deleted.
Legacy `omo` values receive no special treatment beyond the generic invalid
configuration behavior already provided by the loader.

### Keep OMO as a deprecated alias in the workflow schema

This preserves compatibility but keeps OMO in the public contract and invites
continued maintenance. It conflicts with the requested removal.

### Normalize old OMO input to v1

Rejected. A migration path would retain product logic and tests for a workflow
that is no longer maintained.

## Workflow and prompt contract

### Discovery tools

Remove CodeGraph-first instructions from active authoring sources. LSP owns
symbol, reference, diagnostic, and rename questions; Grep/Read/Glob own text and
file discovery; ast-grep is an explicit escalation for exact syntax-tree shapes
or deterministic codemods.

### Background delegation

OpenCode background delegation is capability-gated by the current callable
`task` schema. Use `background: true` only when exposed and when the parent has
independent work. Foreground is used when the result gates the next action.
Never invent polling tools. Codex uses only its current callable multi-agent
surface; OpenCode and Codex parameter names are not mixed.

### Deep-agent rulings

The deep agent may make the smallest evidence-backed ruling when a plan is
ambiguous or deviates from reality only if the ruling preserves the approved
goal, global constraints, permissions, and final acceptance criteria. It records
the decision, rationale, and cost if wrong, then continues. It stops when the
choice changes the goal or user-visible scope, weakens acceptance, affects a
security/data/API contract, requires an irreversible action, or leaves every
path as a guess.

Task outcomes may be described as `completed`, `failed`, `blocked`, or
`inconclusive`, but these labels are informative rather than a rigid receipt
protocol. An acknowledgement alone is not evidence, while an optional or
redundant child cannot block a result already proven through the real interface.
Every execution wave states its goal and useful acceptance evidence; later waves
may adapt from observed results instead of mechanically following stale steps.

### Flexible planning and acceptance

Plans explain the intended route, dependencies, interfaces, and risks. They are
guidance toward the approved outcome, not a hard execution script. Implementers
may adjust ordering or implementation details when the approved goal and final
acceptance remain intact. Plan review is advisory by default; unresolved concrete
security, data-loss, external-contract, or irreversible-action risks still require
resolution or a user decision.

Default acceptance asks whether the requested functionality is complete, the
interfaces are clear and usable, meaningful regressions are covered, and the
evidence matches the actual surface. It does not require RED/GREEN transcripts,
fixed receipt fields, exact-string prompt assertions, every optional child to
finish, or unconditional reviewer approval. Users may explicitly request a
stricter process. GPT-5.6 and later calibrations prioritize delivery and clear
interfaces over procedural checkpoints, duplicate reviews, hashes, or test
ceremony.

### Goal-based final review

Remove the custom working-tree SHA-256 identity algorithm and identity echo
protocol from workflow skills and prompts. A review packet contains:

- `GOAL`
- `ACCEPTANCE_CRITERIA`
- `REVIEW_INPUT`
- `VERIFICATION_EVIDENCE`
- `GLOBAL_CONSTRAINTS`

The reviewer evaluates the current provided diff/range and evidence against the
goal. If implementation input changes after a verdict, the orchestrator reruns
the affected review lane with the updated packet. No routine digest is created.

GPT, GPT-5.6, and GPT-6 Astra calibrations explicitly prohibit inventing hashes
for planning, coordination, evidence, files, or review checkpoints. A hash is
used only when an external integrity, release, or protocol contract explicitly
requires one.

### Git authorization

Brainstorming and planning no longer require commits. A request such as
“commit these changes” authorizes that commit; a request such as “implement the
change” does not. Push, tag, rebase, and release operations require authorization
that necessarily covers that exact operation. Authorization never expands to an
unrelated Git write.

## Runtime reliability changes

### Tuple-style OpenCode plugin entries

The shim accepts plugin entries as either strings or `[name, options]` tuples.
Filtering the external `oh-my-openagent` plugin compares the normalized name,
preserves unrelated tuple options, and leaves `--keep-omo` behavior intact.

### UTF-8 BOM handling

Strip one leading UTF-8 BOM at text parsing boundaries for ocmm JSON/JSONC,
profile configuration, rule Markdown frontmatter, skill MCP frontmatter, and MCP
JSON. Ordinary content is unchanged.

### Unknown-key diagnostics

Retain tolerant layered parsing and valid siblings. Collect removed unknown
field paths and emit bounded structured warnings through the existing logger.
Unsafe prototype keys remain fail-closed and are never converted into tolerated
unknown fields.

## Documentation, generation, and CI

- Current docs state that `v1` is the OpenCode default and `codex` is the
  generated adapter workflow.
- `docs/prompt-sync.md` is removed as an active OMO maintenance contract. Useful
  upstream provenance moves into `docs/v1-maintenance.md`; historical specs stay
  unchanged.
- `schema.json` is regenerated from `src/config/schema.ts`.
- Codex plugin artifacts are regenerated once after all authoring-source edits.
- CI regenerates `schema.json` and fails when the committed artifact differs.

## Verification

1. Public schema and direct configuration parsing permit only `v1` and `codex`;
   no code recognizes or migrates the legacy `omo` literal.
2. No runtime code, current docs, tests, or active prompts load `prompts/omo`.
3. `.omo/*` compatibility paths, `--keep-omo`, and the ignored upstream checkout
   remain intact.
4. Active prompts contain no `codegraph_*`, invented background polling tools,
   routine review hash protocol, or unconditional Git commit instruction.
5. Deep-agent behavior demonstrates safe autonomous rulings and escalation for
   material user-owned or safety-sensitive choices without exact-string tests.
6. Tuple plugin entries, BOM inputs, and unknown-key diagnostics have focused
   regression tests.
7. Obsolete OMO/hash/prose-shape tests are removed rather than mechanically
   rewritten; retained tests assert current outcomes rather than deleted internals.
8. No active workflow mandates RED/GREEN transcripts, exact prose matching,
   fixed receipt shapes, or unconditional final-review approval as default.
9. Typecheck, full TypeScript/Rust tests, build, schema freshness, generated
   bundle checks, and an isolated config-load surface check pass.

## Deferred independent work

Skill-description slimming, LSP URI alias tests, npm propagation retries,
browser-render research rules, and `allowed-tools` support remain separate work.
They do not block this change.
