# DSMM Safety Remediation Design

Date: 2026-08-24

## Purpose

Close the confirmed findings in `dsmm/docs/review-2026-08-24-safety-guards.md` without discarding or overwriting the concurrent DSMM v0.5 MCP/LSP working-tree changes. The remediation covers the safety boundary, preset ownership, Cordis lifecycle, skill visibility, DSH dependency compatibility, packaging, and live runtime evidence.

## Scope

The implementation closes:

- CR-1: known Git write operations bypass approval through executable paths, `.exe`, wrappers, global options, multiline input, or shell continuations.
- CR-2: initial DSMM preset sessions do not activate guards from `session.header.agentPreset`.
- IM-1: preset materialization can claim or remove user-owned directories and follow links.
- IM-2: a local `ask` decision skips downstream pre-execute policy.
- IM-3: deferred settings attachment leaves settings-dependent registrations on base values.
- IM-4: mode-event append failure rejects an already accepted model step.
- IM-5: model-invocable DSMM skills leak through the host-global registry.
- IM-6: DSMM dependency declarations and smoke testing use incompatible DSH release lines.
- MI-1: plan validation can be bypassed through equivalent paths, case, or fragment-only edits.
- MI-2: shell safety checks mishandle quoting, casing, whitespace, wrappers, and continuations.
- MI-3: packaged documentation links must remain valid; the concurrent v0.5 working tree already contains the product correction and it must be preserved and verified.
- MI-4: the outer Docker smoke path leaks an unused temporary home.
- The evidence gap: no pinned packaged-artifact smoke currently traverses the real DSH session and tool pipeline.

Unrelated refactoring and new DSMM features are out of scope.

## User Decisions

1. Git classification protects known write operations. Credible but unknown Git aliases or subcommands are not automatically treated as writes.
2. Generic `/deepwork` sessions receive enabled skill bodies through the active prompt. DSMM role presets receive model-invocable skills through their preset scope.
3. A pinned, network- and Docker-dependent packaged DSH smoke is a mandatory completion gate, separate from offline unit tests.
4. No Git commit is authorized by this design approval; implementation remains in the working tree unless separately authorized.

The first decision intentionally replaces the review report's stricter recommendation to fail closed for every unclassifiable Git invocation. Tests and final review must evaluate the implementation against this approved known-write contract rather than claim universal Git classification.

## Considered Approaches

### Selected: focused safety modules with incremental integration

Extract shell/Git classification and plan-document validation from `guards.ts`, keep existing public guard/controller/settings entry points, and make targeted lifecycle and ownership corrections. Merge shared-file edits into the current v0.5 working tree only after re-reading each file.

This approach creates independently testable boundaries and minimizes conflict with v0.5.

### Rejected: migrate the whole plugin to DSH native types

Replacing the structural DSH adapter, settings lifecycle, filesystem access, and all registration surfaces would provide stronger long-term coupling to DSH 0.1, but it would overlap most v0.5 work and exceed the confirmed remediation scope.

### Rejected: extend the existing regular expressions

Adding more regular expressions to `guards.ts` would preserve three divergent command interpretations and leave quoting and continuation behavior unprovable. The file is already too large for another independent parser.

## Architecture

### 1. Shell and Git classification

Create `dsmm/src/shell-command.ts` with a bounded parser for the shell forms DSMM explicitly supports:

- POSIX single/double quotes, backslash escapes, backslash-newline continuation, command separators, pipelines, and leading environment assignments.
- PowerShell single/double quotes, backtick escapes, backtick-newline continuation, command separators, pipelines, and case-insensitive command names.
- Wrapper normalization for `env` plus its options and assignments.
- Executable normalization by basename so quoted or absolute `git`, `git.exe`, and platform path forms are recognized.

The parser returns command segments and unquoted words. It does not execute commands or claim universal shell compatibility.

Git classification skips valid Git global options and classifies a maintained set of known mutating subcommands and argument-sensitive forms. This set includes existing operations plus known omitted mutations such as write-form `config`, `notes`, `replace`, `update-ref`, and mutating `symbolic-ref`. Read-form `status`, `log`, `diff`, `show`, `rev-parse`, and query-form `config` remain allowed. Unknown aliases/subcommands remain unclassified by explicit user decision.

`shellSafetyDecision()` consumes the same parsed segments so quoted prose is not treated as executable syntax and command-position casing, whitespace, wrappers, and continuations are handled consistently.

### 2. Session scope and middleware composition

Extend the structural session header with `cwd?: string` and `agentPreset?: string`.

Resolve the active preset by scanning `agent-preset/selected` events from newest to oldest, accepting only a structurally valid string value. If no valid selection event exists, fall back to `session.header.agentPreset`.

Compose `tools/pre-execute` decisions monotonically:

- local `deny` short-circuits;
- no local decision delegates directly;
- local `ask` calls downstream;
- downstream `deny` or `ask` wins;
- downstream `allow` yields the local `ask`.

### 3. Plan resulting-document validation

Create `dsmm/src/plan-validation.ts`.

Resolve paths against `session.header.cwd`, falling back to `process.cwd()`. Normalize separators and dot segments, reject paths outside the session cwd, and compare plan directory and `.md` extension case-insensitively.

- `write`: validate the complete `content` payload.
- `edit`: read the current UTF-8 file, validate `old_string`, `new_string`, and `replace_all`, enforce DSH's unique-match default, reconstruct the exact final document, then validate it.
- If a recognized plan edit cannot be read or reconstructed, return `deny` with an actionable reason rather than guessing.

The implementation validates the final checklist shape after the mutation, so a fragment that changes `- [ ]` to `- []` is rejected.

### 4. Preset ownership and atomic publication

Replace marker-existence ownership with an exact versioned marker bound to the role. Before every update or removal:

- use `lstat` for the root, role directory, marker, and managed files;
- reject symbolic links, junction-like linked paths, non-directories, and linked target files;
- resolve canonical paths and prove the role path remains beneath the canonical root;
- require exact marker contents for current ownership.

An existing unmarked role directory is foreign and causes a descriptive error before any write.

Create a new managed role directory in a private sibling temporary directory, write both generated files and the marker, then atomically rename it to the absent final path. Always clean the temporary directory after failure.

Legacy marker migration is allowed only when the role directory contains exactly the legacy marker and the two expected generated files, all as regular non-linked files. Any extra entry makes the directory foreign and prevents update or removal.

### 5. Settings readiness and mode durability

`registerSettings()` gains a readiness installer that runs inside the Cordis injected child context after the settings service is available. The getter is updated before the installer executes. Settings-dependent prompt, command, materialization, and skill-related registrations occur through that child context so replacement and disposal follow Cordis lifecycle semantics.

When no settings service or injection API exists, the installer runs once against the root context and resolved base configuration.

Safety hooks continue to read settings through the getter at execution time.

At `agent/pre-step`, mode-event append failure is caught and logged through `ctx.logger.warn`. The accepted downstream decision is returned unchanged and the pending intent remains for retry. Pending state is deleted only after a successful append.

### 6. Skill visibility

Remove host-global model-invocable DSMM skill registration.

Add an exported `dsmm/preset-skills` Cordis plugin entry. Generated and checked-in DSMM role presets load this entry inside their standing preset scope with the enabled skill names, making model invocation available only to agents joined to that preset.

For a generic active `/deepwork` session, `registerDeepworkPrompt()` appends the enabled bundled skill bodies to the active prompt. If the active preset is a DSMM role, prompt injection omits the bodies because the preset-scoped registry already supplies them.

Inactive ordinary sessions receive neither DSMM skill bodies nor model-invocable global registrations.

### 7. Dependency, package, and live-smoke alignment

Align all declared DSH component peer/dev dependencies to the `0.1.1-rc.2` release generation and keep Cordis on the compatible `^4.0.1` line. Pin Docker and package scripts to `@deepseek-ai/dsh@0.1.1-rc.2`; never use `latest` in acceptance evidence.

Preserve the v0.5 package `files` additions that include README-linked documentation. Add the `preset-skills` export and generated output to the packed artifact.

Move temporary-home creation into the Docker inner branch and clean every temporary profile, tarball, workspace, context, and fixture in `finally`.

The Docker smoke builds DSMM, creates a tarball, installs that tarball into an isolated DSH profile, and exercises the real DSH context/session/tool pipeline. Existing v0.5 LSP diagnostics remain part of the same smoke and must not be removed.

## Concurrency and Working-Tree Safety

The current v0.5 work modifies `dsmm/src/index.ts`, `dsmm/src/settings.ts`, `dsmm/package.json`, `dsmm/docker/Dockerfile.smoke`, `dsmm/scripts/docker-smoke.mjs`, related tests, generated `lib` files, README, and roadmap documentation.

Implementation order is conflict-aware:

1. Complete tests and source changes in non-overlapping safety files.
2. Re-read every shared file immediately before editing and merge only the required hunks.
3. Never stash, reset, checkout, or overwrite the concurrent work.
4. Build generated `dsmm/lib/**` only after source integration is complete.
5. Compare generated diffs to ensure v0.5 LSP exports and settings output remain present.

## Verification Scenarios

### Scenario A: Git and shell matrix

Known writes launched through `git.exe`, absolute paths, `env`, assignments, global options, multiline input, and both supported continuation styles produce the configured `ask` or `deny`. Known reads and unknown subcommands do not. Quoted shell-like prose does not trigger dialect checks, while command-position invalid syntax does.

### Scenario B: scope and decision composition

A header-only DSMM preset activates guards. A later valid selection event can switch into or out of DSMM scope. Local ask never hides downstream deny or ask.

### Scenario C: filesystem ownership

Foreign directories, extra user files, links, malformed markers, and containment escapes remain untouched. New directories publish atomically. Safe legacy directories migrate without deleting unexpected content because unexpected content prevents migration.

### Scenario D: state and settings lifecycle

Deferred settings produce the effective prompt order. Append failure logs, preserves pending intent, and does not reject an accepted step. A later successful boundary commits the pending state.

### Scenario E: skill isolation

An inactive ordinary session has no DSMM model skill exposure or bodies. Generic `/deepwork` contains each enabled body once. DSMM preset sessions see preset-scoped skills and do not duplicate bodies in the system prompt.

### Scenario F: plan mutation

Uppercase extensions and equivalent normalized paths are recognized. Full writes and reconstructed unique or replace-all edits reject malformed final checklists and allow well-formed results. Unreadable or ambiguous plan edits fail closed.

### Scenario G: packaged live runtime

The pinned Docker environment installs the DSMM tarball, creates a real session/context, verifies ordinary/deepwork skill isolation, header preset scope, downstream-deny precedence, and post-execute truncation through `ctx.tools.execute`, and retains the v0.5 LSP diagnostic smoke. Cleanup leaves no temporary host or container artifacts.

## Required Gates

- Targeted failing-first tests for each finding, followed by passing results.
- `pnpm --filter dsmm test`
- `pnpm --filter dsmm typecheck:test`
- `pnpm --filter dsmm build`
- Root `pnpm run typecheck`
- Root `pnpm test`
- Root `pnpm run build`
- `git diff --check`
- `pnpm --filter dsmm smoke:docker`
- Final identity-bound `oracle` and `reviewer` high-rigor approval against the same current working-tree artifact.

Completion is blocked if the mandatory Docker packaged-runtime smoke cannot run or fails. No test helper result substitutes for the live pipeline evidence.
