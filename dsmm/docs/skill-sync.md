# DSMM source-content synchronization

The source baseline is OCMM `89ca14b`, with DSH fixed to **0.2.0-rc.2**. This is full-content adaptation, not short personas. The maintenance inventory lives in `scripts/source-inventory.mjs`; generated `prompts/source/manifest.json` records actual source → artifact → consumer, source anchors, adaptation rules, canonical role/skill inventories, attribution and exclusions. Runtime uses package-relative assets only; it never requires an OCMM checkout, global SDK path or maintenance compiler.

## Inventories and assembly

Primary/all personas also retain the actual source default `buildLocaleGuidance` prefix: infer the user's language, preserve identifiers/quotes, and respect any explicit host locale. This introduces no DSMM locale setting or private host-config lookup.

The 11 base roles come from `src/data/agents.ts`; the 11 categories come from `src/data/categories.ts`. Oracle slots reuse the full reviewer source. Builder/code-search/doc-search/media-reader have no standalone source role Markdown: their actual catalog responsibilities, source workflow and terminal TS policy are consumed, not invented personas. Existing `dsmm-creative` remains the one creative category. All 22 have stable metadata and templates; cross-cutting alone defaults off. File existence is never callable evidence.

`src/prompt-content.ts` is a content-only package loader; it avoids a roles → prompt/model-routing initialization cycle. Role/category bodies and source `terminalPromptSuffixFor` policies are assembled into persona once. Category `<model-calibration>` blocks are removed from persistent persona and selected separately. The active common section preserves the full default workflow; model guidance is additive and subordinate to persona, permissions and output contract. Planner adds its source doctrine; Opus 5/5.5 calibration is orchestrator-only; GPT/Codex gets the shared GPT layer once; Gemini/GLM, exact Kimi Code aliases and SWE-2 retain their applicable full source guidance. The v1 Codex variant is adapted tool compatibility, not a separate Codex host or adapter behavior stack.

The fourteen skills are brainstorming, writing-plans, requesting-code-review, receiving-code-review, subagent-driven-development, dispatching-parallel-agents, remove-ai-slops, debugging, frontend, git-master, ast-grep, coding-agent-sessions, init-deep, and using-git-worktrees. **Actual canonical remove-ai-slops is `skills/remove-ai-slops`**, not a nonexistent v1 copy or generated Codex/DSMM summary. Its ten cleanup categories and green regression protection remain; arbitrary batches, LOC splitting, redundant tests, forced status tokens and unauthorized Git restore are adapted to bounded evidence-led cleanup.

## Lazy native resources

All fourteen share deployment toggles and one Agent-scoped native metadata provider. No skill body is injected, including brainstorming. Ordinary presets require active Deepwork; DW roles default on, but explicit off wins while retaining persona/access. Metadata discovery does zero body I/O. Native `get` alone reads the cancellable SKILL body; relative references/scripts/assets resolve from its directory resourceBase.

The Stage A ancestor snapshot/precedence, incomplete-observation refusal, invocation policy and cancellation/generation/parent fencing remain unchanged. rc.2 broadcasts `skills/change` across registries but owns revision/cache per registry; broadcasts fence in-flight work, never permanently invalidate cached locators. No body/ancestor cache, notification reflection or fallback fulltext injection is added. Generated presets now compose native skill discovery/loading tools without a standing `preset-skills` provider.

The published 0.1.9 `./preset-skills` export retains its minimal Config/name/inject/apply compatibility shape; apply itself registers nothing. Its module is not dead: the main entry still calls the actual `registerAgentSkills` there, with unchanged registration/lifecycle. Likewise, `renderAgentCordis` and the shared renderer retain their ignored optional skills argument in its original second position so existing enabledRoles/roleRouting callers do not shift. Native Agent configuration controls visibility. This is a bounded public compatibility ruling, not a future provider/wrapper or remaining removal blocker; no module/function has been moved to another helper.

## Reproduce and check (maintainer checkout only)

Use existing Node/TypeScript/pnpm. A new checkout first needs explicit fixed-pin frontend materialization; this fetches only approved documentation/CSV/Python/license bytes and executes no third-party code or installer:

```powershell
pnpm run sync:source
pnpm run sync:frontend   # explicit network operation; no HEAD/alternate pin fallback
pnpm run sync:source     # records validated frontend provenance in the manifest
pnpm run build
pnpm run generate:roles
pnpm run check:source
```

During development use direct targeted Node tests and typecheck. `sync:source -- --check` compares source-adapted results without writing; `generate:roles -- --check` checks renderer output without writing. Sync writes changed artifacts only; a second run must report no differences. An anchor mismatch fails before artifacts are written; do not silently accept changed source assembly. Update the baseline, mapping/rules and useful regressions together after reviewing a source change. Do not hand-edit generated prompt/source assets, skills or presets.

Source Markdown is kept in full, with precise anchored changes and an explicit DSH resource/authority boundary. Native read/glob/grep, web_search/web_fetch, write/edit, bash/pwsh and skill invocation are the tools mapped here. Question, LSP, image, browser, tracking, background and continuation behavior is conditional on the actual catalog/provider. No Task, todowrite, compress or Context7 MCP interface is invented. Template fields describe an assignment, not callable parameters. Native delegation groups preserve root/stage-owner Builder versus bounded child Builder, strict-leaf research, read-only utility restrictions and local-coordinator specialists; Stage C must enforce those policies on real execution paths.

Authored frontend router/tooling text overrides install-by-default/implicit latest behavior: inspect existing capabilities, require separate setup authorization, and report unverified evidence without hiding incomplete declared resources. Verbatim UI/UX README paths/cwd examples are superseded by the authored DSH entry: resolve the absolute native resourceBase script, require the already-active target project context, and supply an explicitly approved project-owned output-dir for persistence. The installed skill tree is never an output target; no tool cwd field or shell cd is invented. Public renderer inputs retain the old object shape with optional source metadata; only the canonical catalog requires those trusted source fields.

## Recursive resources, notices and exclusions

Every actual canonical skill tree is copied recursively, including meaningful fixtures/tests, scripts, licenses and notices. Python caches/pyc, node_modules and VCS state are excluded. Source `.gitignore`/`.npmignore` are not runtime resources and would hide meaningful packaged resources; the DSMM distribution uses its own package file inventory instead. Frontend's legacy lighthouse helper remains a reference but is not an executable QA entry point, as the canonical source itself requires. Installation, login, Git/destructive operations are not authorized by reference commands.

OCMM-derived modifications remain under the full package `LICENSE` (LicenseRef-AAAPL, not MIT-only). V1 fork comments preserve obra/superpowers lineage. Ast-grep and session tools retain their original LICENSE/SOURCE/NOTICE files; frontend ATTRIBUTION and Apache license are retained. Third-party resource attribution/pins are not replaced with project licensing.

`publish` is excluded because OCMM release identities/authority are not DSMM operations; `customize-opencode` configures another host. OpenCode-specific debugger team JSON is replaced with independent evidence responsibilities and permitted actual DSH tools, not declared N/A. Session-format references to OpenCode/Codex remain real product data, not a global name replacement.

### Fixed-pin frontend completeness and distribution gate

`scripts/frontend-recipe.mjs` maps every actual brand-table path (except project-original aside), all twelve taste resources plus the Stitch example, the UI/UX README/scripts/data and actual Python dependencies. Pins are Open Design `6afe7eae156bfa29251a51fd0636649c257f7444`, taste-skill `06d6028b5c623016c59ce8536f578e5a1127b499`, and UI/UX Pro Max `f32d6a61cdf0bfd57404c45854583fd19ff95088`. It never uses OMO's different pin or modifies a root/submodule checkout. Initial synchronization validates each exact Git-tree path and blob; missing paths fail explicitly. Verbatim core.py also needs app-interface, google-fonts and threejs/angular/laravel stacks: these same-pin dependencies ship alongside the source-declared web-interface mapping. Imports/data references are inspected statically, not executed.

Body/data/Python resources and `.frontend-materialized.json` are gitignored. Actual fixed-pin Apache/MIT license files, copyright/attribution and the recipe are committed. Frontend `.npmignore` overrides its `.gitignore` so every materialized runtime resource and its provenance inventory packs. Project-original aside/design/perfection files remain tracked and cannot be overwritten by a vendor path. Source hashes are content-integrity checks against Git blobs, not a runtime receipt framework or a substitute for per-path dependency/packing checks.

`node scripts/materialize-frontend.mjs` defaults to read-only/offline check. `pnpm run build`, `check:source` and `check:release` refuse incomplete/drifted materialization without downloading. Explicit `sync:frontend` reuses complete validated content with zero requests/writes; no arbitrary destination CLI is accepted. Runtime distribution needs only package-relative resources, never an upstream checkout or network materialization.

**E/CI handoff:** after installing the already-authorized build toolchain, run `sync:source`, explicit `sync:frontend`, `sync:source`, then build/generate/check/pack. A Git checkout alone does not contain the ignored bodies. Materialize before a source Docker build context is created; frozen tarballs must already carry the entire library. Do not insert network fetching into default build or use a compiled/ignored local tree as proof that CI packed it. Full packed inventory and missing-resource refusal remain separate evidence from native C/D capability/permission/lifecycle completion.
