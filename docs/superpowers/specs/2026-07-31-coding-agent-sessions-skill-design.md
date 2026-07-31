# Coding-Agent-Sessions Shared Skill Port Design

## Status and Decision Record

This design is approved by the user's full-session delegation. The baseline is ocmm `d202e7b030fa005df82065a370e3a372a63af310` (`d202e7b`, `feat: add category availability diagnostics`), which was clean before this document was added. The user authorized one commit after the complete feature is finished, but this subagent must not stage, commit, push, tag, or otherwise write Git state. The parent may make the single final commit after reviewing the completed feature, with the suggested message `feat: add coding agent session search skill`.

No software installation is permitted. The port adds no dependency, version bump, schema, model, routing, category, release-checker, prompt, or `prompts/v1/` change. It must never default-scan a developer's real session stores or make provider or model requests.

## Context and Provenance

The source is the ignored checkout at `omo/packages/shared-skills/skills/coding-agent-sessions/`, pinned to upstream `f2872273d6866026a2262315e54dbf21760154d3`. The initial implementation is `dff394666c766a1e683e71f4d68a2f6b66986eea`, `feat(shared-skills): add coding agent sessions`. The port also includes the Aside work introduced by:

- `f2a1d761b93c4e75e7a1aec20a0a97c51667f645`, `feat(shared-skills): add Aside browser-agent session scanner`
- `aaaba202bcf2cd8ed84020f9dda31ef7ab309cc2`, `test(shared-skills): cover Aside scanner parsing and platform registration`
- `cb8d15136bb395af7368cc8ce2528f12ac277c5e`, `docs(shared-skills): document the Aside session store and linkage`

The upstream skill is Python 3.11 or later and standard-library-only at runtime. It has one finder plus 16 production Python modules, while `pytest` appears only in six development test files containing 35 test functions. The local interpreter is Python 3.11.2. `pytest` is not installed; `uv` exists but must not be used to install or download it. Preserve upstream tests, but record the retained pytest suite as not executed unless pytest is already installed at implementation time. Local mandatory acceptance must instead use no-install standard-library syntax compilation and real CLI fixture tests.

The existing integration points establish the intended architecture:

- `src/intent/skill-loader.ts` `loadSharedSkills` discovers top-level directories with `SKILL.md`, excludes only `skills/v1`, and turns each discovered shared skill into an OpenCode slash command.
- `src/intent/skill-loader.test.ts` already proves top-level discovery and the exclusion of `v1`.
- `src/codex/plugin-generator.ts` `writeCodexSkills` currently calls `copySkillDirectory`, which is a whole-tree `cpSync`, then applies the Codex `SKILL.md` suffix through `normalizeSkillForCodex`.
- `src/codex/plugin-generator.test.ts` contains source-to-generated shared-skill inventory and byte checks.
- `package.json` already includes `skills` in the root npm package `files` list.
- `docs/v1-maintenance.md` records shared-skill provenance even though this skill is not a v1 skill.

## Goals

1. Port the complete upstream coding-agent-sessions source tree, its development tests, and its license/provenance record into `skills/coding-agent-sessions/`.
2. Make it an auto-discovered OpenCode shared skill and slash command without adding it to `skills/v1` or injecting it into the system prompt.
3. Keep the source tree complete for development while distributing only runtime files to the generated Codex skill tree and package outputs.
4. Prove finder behavior against synthetic, sanitized fixtures rather than real agent data or provider services.
5. Preserve the upstream license for the imported subtree without changing the root ocmm AAAPL license for unrelated code.

## Non-goals

- Rewriting the finder, changing scanner semantics, or adapting upstream prose merely for local style.
- Adding `pytest`, any Python package, a runtime dependency, a network request, or an evaluation workspace product file.
- Changing schemas, agents, models, routing, categories, release workflow, release checker, or versioning.
- Default scanning, reading, printing, or retaining real user session data, credentials, or home-directory configuration.
- Deleting generated files belonging to existing skills while refreshing the Codex bundle.

## Considered Approaches

### A. Complete source tree, development tests, and runtime distribution filtering

Selected. Copy the upstream source inventory and test suite intact into the shared-skill source. A generic generator filter selects the runtime subset only when a normalized `.npmignore` has the complete coding-agent-sessions marker signature. This retains upstream maintainability and reproducible fixture coverage while ensuring the Codex bundle and published package do not carry development metadata or caches.

### B. Runtime-only source copy

Rejected. Omitting upstream development tests, type configuration, and source-control metadata from the repository would make future upstream comparisons and no-install local validation weaker. It would also split the development source from the expected upstream tree without an actual compatibility reason.

### C. Local rewrite of finder and scanners

Rejected. A rewrite would expand implementation risk across many storage formats, destroy byte-level provenance, and duplicate a proven standard-library implementation. Runtime and reference bodies remain byte-for-byte upstream unless a specific ocmm compatibility defect is demonstrated with a failing fixture.

## Architecture

### Source skill tree

Add `skills/coding-agent-sessions/` as a complete upstream-derived tree. Its source inventory is:

| Path | Role |
| --- | --- |
| `SKILL.md` | Upstream router, frontmatter, activation contract, references, CLI guidance, and JSON output contract. |
| `agents/openai.yaml` | Upstream agent metadata. |
| `references/all-platforms.md`, `references/claude.md`, `references/codex.md`, `references/opencode.md`, `references/senpi.md` | Platform-specific storage and search guidance. |
| `scripts/find-agent-sessions.py` | Finder entry point. |
| `scripts/agent_sessions/__init__.py`, `aside_scanner.py`, `claude.py`, `cli.py`, `codex.py`, `file_scanners.py`, `jsonio.py`, `kiro_scanner.py`, `opencode.py`, `pi_family.py`, `scanners.py`, `sqlite_optional_scanners.py`, `sqlite_scanners.py`, `timeparse.py`, `transcript.py`, `types.py` | The 16 production support modules. |
| `.gitignore`, `.npmignore`, `pyrightconfig.json` | Upstream development and packaging metadata. |
| `scripts/tests/test_agent_sessions.py`, `test_aside_scanner.py`, `test_cli_contract.py`, `test_extended_scanners.py`, `test_optional_sqlite_scanners.py`, `test_pi_family_scanners.py` | The six retained upstream pytest test files. |
| `LICENSE-UPSTREAM.md` | Exact copy of `omo/LICENSE.md`, the Sustainable Use License 1.0. |
| `NOTICE.md` | Local provenance and modified-distribution notice. |

`LICENSE-UPSTREAM.md` must reproduce `omo/LICENSE.md` exactly. `NOTICE.md` must name the source path, pinned revision, initial and Aside commits, upstream copyright attribution, a prominent notice that ocmm modified the distribution by porting and filtering it, and this explicit license boundary: this skill subtree remains under the upstream Sustainable Use License 1.0 while all other ocmm code remains under the root AAAPL. No imported file may be relabeled as AAAPL.

### OpenCode discovery

No loader implementation change is necessary. Once `skills/coding-agent-sessions/SKILL.md` exists, the existing top-level discovery in `loadSharedSkills` makes it available as the `coding-agent-sessions` shared skill and slash command. Tests must prove it is discovered from `skills/`, remains outside `skills/v1`, is absent from `V1_INJECTED_SKILLS` and `V1_COMMAND_SKILLS`, and retains valid frontmatter and reference links.

### Codex runtime filtering

Replace the generator's unconditional `cpSync` behavior for shared skills with a generic runtime-copy helper. The helper first normalizes the source `.npmignore` rules and activates only when all four coding-agent-sessions marker rules are present: `.gitignore`, `pyrightconfig.json`, `scripts/tests/`, and `*.py[cod]`. A `.npmignore` alone is not sufficient. Skills without that complete signature retain whole-tree copying, including `skills/frontend/.npmignore`, which is a packaging and materialization marker, and `ast-grep`.

For this skill, the filter must exclude the manifest's development and source-control artifacts:

- `.gitignore`, `.npmignore`, and `pyrightconfig.json`
- `scripts/tests/**`
- cache directories, including `__pycache__`, `.mypy_cache`, `.pytest_cache`, and `.ruff_cache`
- `*.py[cod]`

It must retain `SKILL.md`, runtime Python files, `references/**`, `agents/**`, `LICENSE-UPSTREAM.md`, and `NOTICE.md`. After copying, the existing normalization remains responsible for adding the Codex compatibility and callable-dispatch suffix to the generated `SKILL.md`. The generated `plugins/deepwork/skills/coding-agent-sessions/` must therefore contain only runtime files plus that Codex suffix. Update generator inventory helpers and tests to compare this skill against the filtered runtime inventory, rather than the complete source inventory. Existing generated artifacts for other skills must not be deleted as a side effect.

### Packaging and documentation

The nested `.npmignore` keeps source-only development files out of `npm pack`; the Codex generator filter independently keeps its release tree runtime-only. Package dry-run or staging assertions must require the exact canonical 26-file runtime inventory beneath both `skills/coding-agent-sessions/` and `plugins/deepwork/skills/coding-agent-sessions/`: `SKILL.md`, `agents/openai.yaml`, five references, `scripts/find-agent-sessions.py`, 16 `scripts/agent_sessions` modules, `LICENSE-UPSTREAM.md`, and `NOTICE.md`. The two inventories may differ only in the generated Codex `SKILL.md` body. Missing or extra files fail, as do tests, `pyrightconfig.json`, caches, or bytecode. Do not change `.github/workflows/release.yml` unless a failing existing contract proves it is necessary.

Update the root `README.md` shared-skills list and provide one safe usage example that uses an explicit exported fixture root and a platform filter. Update `docs/v1-maintenance.md` with this shared-skill's upstream path, revision, commits, license boundary, complete-source/runtime-filter distinction, OpenCode discovery, and Codex distribution behavior. This is shared-skill provenance maintenance, not a v1 prompt or skill change.

## Data Flow

1. A user asks to find, read, list, search, inspect, export, or reconstruct coding-agent session history. This is the only activation class.
2. OpenCode discovers `skills/coding-agent-sessions/SKILL.md` as a top-level shared skill and exposes the slash command. It is neither injected nor loaded through `skills/v1`.
3. The skill directs the agent to select the relevant platform reference, then invoke `scripts/find-agent-sessions.py` with explicit roots and filters when local session evidence is requested.
4. The finder reads only the explicitly supplied synthetic fixture roots during verification. Its JSON output carries normalized sessions, match reasons, details, and child-session linkage.
5. Codex generation normalizes the source `.npmignore` rules. Because coding-agent-sessions has all four marker rules, it copies the skill through the runtime filter, normalizes only the generated `SKILL.md`, and stages the runtime-only tree in `plugins/deepwork/skills/coding-agent-sessions/`. Frontend and ast-grep do not have the complete marker signature, so they retain current whole-tree copy behavior.
6. npm package staging includes the complete source tree subject to its nested `.npmignore`; the generated Codex plugin includes the filtered runtime tree. Both carry the upstream license and notice.

## Safety, Privacy, and Error Handling

The finder can reach sensitive local transcripts, SQLite state, prompt text, paths, and token or cost clues. Activation is limited to user session-history requests. Neither normal feature behavior nor QA may perform a default scan of the real home directory.

Every relevant child process in fixture QA, generator verification, package verification, and isolated CLI verification must receive a sanitized environment and explicit temporary `--root` paths. Set `HOME`, `USERPROFILE`, `APPDATA`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME`, `CODEX_HOME`, `OPENCODE_HOME`, `OPENCODE_CONFIG`, and `OPENCODE_CONFIG_DIR` to paths beneath one temporary sandbox. Remove `OPENCODE_CONFIG_CONTENT` before spawning. `OPENCODE_CONFIG_CONTENT` and `OPENCODE_CONFIG_DIR` are both precedence escape routes, so removing the first and sandboxing the second is mandatory even when `OPENCODE_CONFIG` already names a sandbox path. Remove credential-shaped environment variables with an allow-list or a case-insensitive name filter for keys such as `*_API_KEY`, `*_TOKEN`, `*_SECRET`, `*_PASSWORD`, `*_CREDENTIAL*`, and provider-specific authorization variables. Do not log an environment dump or raw fixtures containing secrets.

Fixture invocations must constrain platforms with explicit `--platform` flags and use `--root <temporary-fixture-root>`. They must not call `opencode`, `codex`, network services, model APIs, or provider APIs. Test output asserts structural JSON fields and sanitized fixture values only. Cleanup removes the whole temporary sandbox in `finally`, including fixture databases and generated child stores.

Missing optional platform stores, unavailable optional SQLite metadata, invalid input, malformed records, and absent roots must be represented through the finder's documented structured behavior without falling back to broad home scans. On Windows, tests must verify path handling through `path.join`-constructed temporary paths, never assume POSIX separators.

## Implementation Plan

1. Read the pinned upstream tree and `omo/LICENSE.md`, record a source inventory, and copy it into `skills/coding-agent-sessions/` without changing runtime or reference bodies. Add the exact upstream license and a standalone notice as specified above.
2. Extend shared-skill loader tests to prove the new skill's top-level discovery, frontmatter, reference-link validity, slash-command construction, and absence from v1 injection and v1 command lists.
3. Add a generic normalized-`.npmignore` signature detector and runtime-copy filter near `copySkillDirectory` in `src/codex/plugin-generator.ts`. Activate only when `.gitignore`, `pyrightconfig.json`, `scripts/tests/`, and `*.py[cod]` are all declared. Keep every nonmatching path byte-for-byte equivalent to the current recursive copy. Use explicit, tested path rules for the declared development exclusions rather than a special case keyed to this skill's name.
4. Update `src/codex/plugin-generator.test.ts` inventory assertions so `coding-agent-sessions` compares the filtered source inventory, verifies retained files and excluded files, and proves generated `SKILL.md` has the usual Codex suffix. Create synthetic marked-skill fixtures for every incomplete signature class, at minimum one, two, and three of the four rules, or a loop omitting each individual rule. Assert each incomplete fixture retains the complete source tree. Only all four normalized rules may activate filtering. Preserve existing whole-tree copy expectations for frontend, `ast-grep`, and every other nonmatching skill.
5. Add fixture-based Node tests that invoke the copied Python finder with `python` from a sanitized temporary environment. The child environment must remove `OPENCODE_CONFIG_CONTENT` and sandbox `OPENCODE_CONFIG_DIR` as well as the existing home, XDG, and OpenCode variables. Use standard-library fixture construction and JSON parsing, not subjective LLM evaluation, A/B prompting, a viewer, or product evaluation workspaces.
6. Cover the command aliases and options JSON contract, including `list`, `find` or `search`, and `read` or `get` as applicable. Include a temporary Aside fallback and `state.db` join, one other file-based platform, and OpenCode child linkage if practical from the retained upstream fixture formats. Assert Windows-compatible temporary paths.
7. Update `README.md` and `docs/v1-maintenance.md`, regenerate the Codex plugin through the normal generator, and update only generated files caused by this skill and the filter. Do not hand-edit generated content.
8. Add package dry-run or staging checks. They must inspect the actual emitted package and Codex staging inventory rather than infer behavior solely from ignore rules. Each emitted prefix must have the exact canonical 26-file inventory, with no missing or extra paths; only the generated Codex `SKILL.md` body may differ from the source package version.

## Verification Plan

### Source and Python checks

- Compare required runtime and reference source bodies byte-for-byte against `omo/packages/shared-skills/skills/coding-agent-sessions/`, excluding the intentionally added `LICENSE-UPSTREAM.md` and `NOTICE.md` and any proven compatibility fix.
- Run a no-install standard-library syntax compilation of the finder and every production module in memory or in a disposable temp location. Do not create repository `__pycache__` directories.
- Detect whether an already-installed pytest is available without downloading it. If absent, report the six upstream files and 35 test functions as retained but not executed. If present, run the retained suite only in the sanitized temporary environment.

### Targeted behavioral checks

- Run targeted Node tests for skill loading, generator filtering, package staging, and isolated CLI fixtures.
- Build sanitized temporary fixture roots for Aside fallback records plus `state.db` joins, at least one additional file-based platform, and OpenCode parent-child linkage when practical.
- Invoke the finder with explicit `--root` and `--platform` arguments. Validate JSON stdout, aliases, repeated options, error behavior, child linkage, and Windows-path behavior. Never print raw transcript bodies or credential-shaped strings.
- Confirm no actual home, application-data, Codex, OpenCode, or XDG user directory was read or written by checking every corresponding environment value, including `OPENCODE_CONFIG_DIR`, points inside the temporary sandbox and `OPENCODE_CONFIG_CONTENT` is absent. This blocks both OpenCode configuration precedence escape routes.

### Generator, package, and repository gates

- Run `pnpm run gen:codex-plugin` twice. Save, clear, and restore any profile environment used by the generator so each run uses the intended default profile state; compare the second generated inventory and bytes with the first.
- Verify the fresh tracked Codex bundle contains `plugins/deepwork/skills/coding-agent-sessions/` with the filtered runtime inventory, upstream license, notice, and Codex `SKILL.md` suffix.
- Test normalized marker-signature detection directly with synthetic marked skills. Cover every incomplete signature class with representative one-, two-, and three-rule fixtures, or loop over every omitted rule, and assert each preserves its whole tree. Only the complete four-rule signature may filter coding-agent-sessions. Confirm frontend and ast-grep generated inventories remain unchanged.
- Run package dry-run or staging assertions that require the exact canonical 26-file inventories under both `skills/coding-agent-sessions/` and `plugins/deepwork/skills/coding-agent-sessions/`. Permit only the generated Codex `SKILL.md` body difference, and fail any missing or extra path.
- Run `pnpm run typecheck`, targeted Node tests, `pnpm test`, and `pnpm run build` after relevant inputs are final.
- If the LSP diagnostic service is unavailable, run TypeScript Compiler API changed-file diagnostics for modified TypeScript files instead of treating unavailable LSP as a skipped type check.
- Perform exact-scope review: inspect `git diff --check`, `git diff --name-only`, and a credential-pattern scan of changed files. The final changed set may contain only the planned source skill, targeted implementation/tests, documentation, and generated Codex outputs. It must exclude real-session artifacts, caches, credentials, unrelated generated-skill deletion, and forbidden scope changes.

## Acceptance Criteria

1. `skills/coding-agent-sessions/` contains the complete declared upstream source tree, six test files, exact upstream license, and a notice with the required source, commit, copyright, modified-distribution, and license-boundary statements.
2. Runtime and reference bodies are byte-for-byte upstream except for a fixture-proven compatibility fix.
3. OpenCode auto-discovers the skill and its slash command from the top-level directory; it is not a v1 skill and is not injected.
4. The generic runtime filter activates only for a normalized `.npmignore` containing all four marker rules: `.gitignore`, `pyrightconfig.json`, `scripts/tests/`, and `*.py[cod]`. Synthetic marked-skill fixtures prove every incomplete signature class retains whole-tree copy behavior. Only the complete signature filters coding-agent-sessions, excludes every listed development artifact, and preserves the declared runtime and legal files. Frontend and ast-grep remain whole-tree copies.
5. The generated Codex skill is runtime-only, has its Codex suffix, and remains deterministic across two generator runs.
6. Root package staging under `skills/coding-agent-sessions/` and Codex staging under `plugins/deepwork/skills/coding-agent-sessions/` each contain the exact canonical 26-file inventory. The only permitted byte difference is the generated Codex `SKILL.md` body. Both include the required license, notice, router, references, metadata, and runtime Python while excluding tests, pyright configuration, caches, and bytecode.
7. No-install Python syntax compilation and fixture CLI tests pass without touching real user stores, calling a provider, or exposing a credential. Every relevant child environment removes `OPENCODE_CONFIG_CONTENT` and sandboxes `OPENCODE_CONFIG_DIR`, blocking both configuration precedence escape routes. The retained pytest suite has an explicit executed or retained-not-executed result.
8. Aside fallback and `state.db` joining, another file-based platform, the CLI JSON and alias contract, Windows paths, and OpenCode child linkage when practical have deterministic fixture coverage.
9. README and shared-skill provenance documentation describe discovery, safe explicit-root use, upstream revision, license boundary, and runtime filtering. No `prompts/v1/` content changes.
10. Targeted tests, typecheck, full tests, build, package checks, isolated CLI QA, compiler fallback if needed, diff check, scope audit, and credential scan pass before the parent considers the single authorized final commit.

## Self-review

- Placeholder scan: no incomplete requirement or deferred decision remains.
- Internal consistency: the full source tree, nested npm filtering, and Codex runtime filter have distinct responsibilities; the Codex filter requires the complete normalized four-rule marker signature, so frontend's packaging `.npmignore` does not change its generated tree; both emitted prefixes require the same canonical 26-file inventory except for the generated Codex `SKILL.md` body; legal files are required in both distributions.
- Scope: the design is limited to a shared-skill port, its loader and generator support, documentation, fixtures, package checks, and generated output. It excludes dependencies, release changes, prompts, schemas, models, routing, categories, default scans, and version changes.
- Ambiguity: the upstream revision, source inventory, normalized four-rule filter trigger and every incomplete-signature test class, nonmatching frontend and ast-grep behavior, exact 26-file package inventories, license boundary, safety isolation including both OpenCode configuration precedence escape routes, retained pytest decision, deterministic fixture coverage, final gates, and parent-only commit responsibility are explicit.
