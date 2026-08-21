# dsmm dsh Migration Design

Date: 2026-08-21

## Goal

Build `dsmm` as a dsh-native subtree project that brings ocmm's deepwork workflow, role prompts, skills, model calibration, and safety conventions to DeepSeek Harness without globally enabling them for every session.

The first deliverable is an MVP dsh bundle that installs into a profile, registers a `deepwork` mode through dsmm's own Host plugin, and makes the mode's behavior configurable. Later versions add full role/category coverage, guard hooks, MCP/LSP integration, model routing, and runtime recovery.

## Non-goals

- Do not load the existing ocmm OpenCode plugin inside dsh.
- Do not emulate OpenCode's `config`, `chat.params`, `system.transform`, or `tool.execute.*` hook ABI.
- Do not globally replace the user's dsh persona or every session's system prompt.
- Do not make DeepSeek V4 Pro-specific prompt tuning mandatory for non-DeepSeek models.
- Do not include UI skins, desktop shell features, or plugin-marketplace functionality in the MVP.

## Source references

The design is based on:

- dsh's Cordis architecture: plugin rows, reversible effects, profile bundles, and services such as `ctx.systemPrompt`, `ctx.tools`, `ctx.agents`, `ctx.llm`, and `ctx.sessions`.
- dsh's current plan-mode package: logged per-agent mode state, prompt-section activation, `/plan`, and `exit_plan_mode`. Current public docs expose `@deepseek-ai/dsh-plan-mode`, not a generic arbitrary named `dsh-mode` package.
- `hust-open-atom-club/oh-dsh`: profile/bundle composition, Host/Client separation, surface contracts, settings seam, and archived mode notes.
- ocmm's existing feature surface: deepwork prompts, v1 workflow skills, role/category metadata, model-family routing, MCP/LSP integration, runtime fallback, and safety guards.
- DeepSeek API and DeepSeek V4 Pro public documentation: thinking mode, `reasoning_effort`, tool-call reasoning-content retention, and max-reasoning prompt implications.

## Architectural choice

`dsmm` should be a dsh-native bundle package, not a compatibility shim.

The package should eventually declare:

```json
{
  "name": "dsmm",
  "type": "module",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

The bundle patch should layer dsmm above normal dsh base/web/headless profiles. It should insert dsmm plugin rows and mode configuration, while leaving users free to override rows in their profile-level `cordis.patch.yml`.

## Subtree layout

The planned project boundary is:

```text
dsmm/
  README.md
  package.json
  cordis.patch.yml
  src/
    index.ts
    config/
    mode/
    prompt/
    skills/
    agents/
    routing/
    guards/
    mcp/
  docs/
    design.md
    roadmap.md
    research/
  tests/
```

The initial commit intentionally contains only documentation. Package files and source code come after the MVP implementation plan is reviewed.

## dsh integration model

### Composition plane

The composition plane is `cordis.patch.yml` and profile bundle ordering. It decides which plugins exist and how dsh services are wired.

MVP composition rows should cover:

- a dsmm Host plugin row;
- dsmm's own `deepwork` mode registration, modelled on dsh plan-mode semantics but not limited to planning;
- optional prompt/skill provider rows if dsh expects separate providers;
- default disabled rows for features that are not active in MVP.

This follows oh-dsh's pattern: shipped bundles own default composition, while profile patch layers own user overrides.

### Settings plane

The settings plane is for user-editable behavior. dsmm should expose one namespace, tentatively `dsmm`, with settings such as:

```yaml
dsmm:
  mode:
    name: deepwork
    enabled: true
    autoEnter: false
  workflow:
    approvalGate: conditional
    usePlanCritic: true
    finalReview: simple-oracle-complex-reviewer
  prompts:
    locale: zh-Hans
    deepseekV4ProCalibration: auto
    verbosity: concise
  skills:
    brainstorming: true
    writingPlans: true
    requestingCodeReview: true
    receivingCodeReview: true
  models:
    defaultReasoningEffort: high
    maxReasoningForArchitecturalWork: true
  guards:
    shellSafety: true
    gitWriteGuard: true
    toolOutputTruncation: true
```

Composition config should define availability. Settings should define preferences and toggles that a user could reasonably edit in a settings page.

## Deepwork as a custom mode

The central requirement is that deepwork must be opt-in.

MVP uses dsh mode semantics instead of global system-prompt injection. Current public dsh docs expose a concrete `@deepseek-ai/dsh-plan-mode` package rather than a generic arbitrary-mode package. Therefore dsmm should implement a small Host plugin, `dsmm-deepwork-mode`, that follows the same dsh-native principles: mode state is session-scoped, prompt contribution is active only while the mode is active, and command/tool affordances are stable enough not to surprise the model.

The default custom mode name is `deepwork`. Entering the mode should add a model-visible section that explains the deepwork routing, brainstorming gate, planning workflow, review gates, and scope discipline. Leaving the mode should restore ordinary dsh behavior.

Conceptual dsh patch:

```yaml
- id: dsmm-deepwork-mode
  name: 'dsmm'
  config:
    modeName: deepwork
    section: |
      You are in dsmm deepwork mode. Use the dsmm workflow only for this session mode.
      Classify the user's intent, use dsh tools deliberately, keep implementation scope exact,
      and follow the configured design, plan, implementation, and review gates.
```

The real implementation should keep the default full prompt in source files and allow `section` or overlay settings to replace it. If dsh later exposes a generic mode package, dsmm can replace this plugin with configuration rows while preserving the public settings shape.

## Prompt architecture

Prompt content should be split by responsibility:

- `mode/deepwork`: mode activation text and workflow contract.
- `prompt/orchestrator`: intent routing and dsh tool-use policy.
- `prompt/model/deepseek-v4-pro`: DeepSeek V4 Pro calibration overlay.
- `prompt/safety`: shell, git, Docker, and scope safety.
- `prompt/review`: final review and evidence requirements.

The MVP should register only the mode prompt and the minimal orchestrator/safety sections needed for useful behavior. Later versions can add scoped role prompts for planner, reviewer, and specialized agents.

## DeepSeek V4 Pro calibration policy

The user's field observation is that DeepSeek V4 Pro can under-activate unless prompted carefully. Public sources do not establish a formal vendor statement that the model is "overfit" in that sense. Official/public documentation does establish several relevant facts:

- `deepseek-v4-pro` supports thinking mode through `reasoning_effort` and `extra_body: { thinking: { type: "enabled" } }`.
- Thinking mode with tools requires reasoning content to be preserved across subsequent tool-calling turns, otherwise API-compatible integrations can fail or lose continuity.
- Thinking mode ignores sampling controls such as `temperature` and `top_p` in the official API path.
- DeepSeek V4 Pro has explicit non-think, think-high, and think-max operating modes; max reasoning uses an additional prompt prefix in the model encoding.

dsmm should therefore treat "DeepSeek V4 Pro calibration" as a model-family overlay, not as a universal prompt. The overlay should:

1. ask for deliberate decomposition before tool use on architectural, debugging, migration, and multi-file tasks;
2. state that tools are part of the reasoning loop and must be used for repository-specific claims;
3. avoid vague encouragement such as "be smart" and instead encode concrete trigger/action rules;
4. preserve concise final answers while allowing deeper private reasoning through the provider's thinking controls;
5. recommend `reasoning_effort: high` for normal deepwork tasks and `max` only for architecture, review, migration, runtime-safety, or hard-reasoning work;
6. avoid the unsupported `developer` role for general DeepSeek API usage.

## MVP scope

MVP v0.1 builds a minimal, installable dsh bundle with:

- `deepwork` custom mode implemented by dsmm, disabled outside explicit mode activation;
- dsmm settings namespace with documented defaults;
- core deepwork prompt section;
- four workflow skills: brainstorming, writing-plans, requesting-code-review, receiving-code-review;
- minimal role definitions for orchestrator, planner, reviewer, code-search, and doc-search if dsh agent presets are available in the target profile;
- DeepSeek V4 Pro calibration overlay gated by model/settings.

MVP excludes:

- complete ocmm category matrix;
- OpenCode runtime fallback and idle continuation;
- MCP/LSP server packaging;
- tool guard parity;
- web/client UI panels;
- Docker-based dsh integration tests beyond a smoke harness.

## Configuration strategy

Every dsmm feature should have a clear control surface:

| Feature | Default | Control surface |
|---|---:|---|
| `deepwork` mode registration | on | composition config |
| auto-enter deepwork | off | settings |
| DeepSeek V4 Pro calibration | auto | settings + model detection |
| workflow skills | on for MVP set | settings |
| role presets | on when dsh agent presets available | composition config |
| safety guards | staged, mostly off until implemented | settings |
| MCP/LSP | off until v0.5 | composition config + settings |

## Docker debugging strategy

Docker is allowed for dsh debugging, but dsmm should keep it as a verification surface rather than a runtime assumption.

Planned checks:

1. build dsmm package;
2. start a disposable dsh profile inside Docker;
3. install dsmm into that profile using a local path or packed tarball;
4. verify the profile includes the dsmm bundle;
5. run a headless prompt that enters `deepwork` mode and confirms dsmm prompt sections are active;
6. remove the container and disposable profile artifacts.

Docker checks must not require publishing dsmm or writing to user-level dsh config.

## Risks

- dsh mode APIs may differ from the archived oh-dsh notes; implementation must verify against the current dsh package version.
- DeepSeek V4 Pro calibration is partly based on user observation and community experience; official claims are limited to thinking/tool-call behavior and model modes.
- Some ocmm features are OpenCode-specific and must be redesigned instead of ported line by line.
- Full reviewer/oracle semantics may require dsh-native agent routing work before parity is possible.

## Acceptance criteria for this design phase

- `dsmm/` contains all current dsmm project materials.
- The MVP explicitly uses dsh custom mode rather than global prompt injection.
- The roadmap separates MVP from parity features.
- DeepSeek V4 Pro tuning is documented as a configurable overlay, not a universal assumption.
- The first commit contains only dsmm project documentation and no runtime code.
