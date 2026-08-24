# DSMM Safety Guards Code Review

Date: 2026-08-24

## Review scope

This report records the review of the DSMM implementation through v0.4 before the safety-guard working tree was committed.

- Committed range: `eb4d90852da9fffeb14893b51b08ca77375c9b50..f7054bbb3eb81468959dfe4184ae9f161a0b32bf`
- Working-tree artifact identity: `sha256:247cf36a8190127699ef2ad45c054da455dbd2fddb03f570d3c9adb2c19074d9`
- Included surfaces: DSMM v0.1-v0.3 commits plus the then-uncommitted v0.4 safety guards, generated `dsmm/lib` output, tests, plans, smoke assets, and documentation.
- Review lanes: `oracle-high` and `reviewer-high`
- Verdict: **rejected**

The review was read-only. The reproduction probes used disposable OS temporary directories and removed them before completion.

## Executive summary

The implementation compiled and all 91 DSMM unit tests passed, but the tests did not cover several runtime and adversarial boundaries. Two defects defeated the default safety boundary entirely: common Git invocation forms bypassed approval, and a newly created DSMM preset session did not activate guards because the implementation ignored `session.header.agentPreset`. Six additional issues affected data ownership, middleware composition, settings lifecycle, mode durability, opt-in scoping, and dependency compatibility.

The safety-guard increment should not be treated as accepted until the Critical and Important findings below are fixed and verified against a live, pinned DSH runtime.

## Verification performed

The following checks passed against the reviewed artifact:

```text
pnpm --filter dsmm test            91 passed, 0 failed
pnpm --filter dsmm typecheck:test  passed
pnpm --filter dsmm build           passed
git diff --check                   no errors; CRLF conversion warnings only
```

The Docker live smoke was not run. The checked-in smoke script installed and dumped configuration, discovered presets, and called guard helpers directly, but did not create a real session, invoke `/deepwork`, or send a tool call through the live `tools/pre-execute` and `tools/post-execute` pipeline.

## Findings summary

| ID | Severity | Area | Summary |
|---|---|---|---|
| CR-1 | Critical | Git guard | Standard Git executable, option, wrapper, and multiline forms bypass approval |
| CR-2 | Critical | Guard scope | Initial DSMM preset sessions do not activate guards |
| IM-1 | Important | Preset materializer | Existing unmarked directories can be claimed and later recursively deleted |
| IM-2 | Important | Tool middleware | A DSMM `ask` decision skips downstream pre-execute policies |
| IM-3 | Important | Settings lifecycle | Effective `promptOrder` is ignored after deferred Cordis settings attachment |
| IM-4 | Important | Mode state | A failed mode-event append rejects an otherwise accepted model step |
| IM-5 | Important | Skill scoping | DSMM workflow skills are registered globally outside deepwork mode |
| IM-6 | Important | Compatibility | DSMM peer versions do not match the DSH release exercised by smoke testing |
| MI-1 | Minor | Plan guard | Case, equivalent paths, and partial edits bypass plan validation |
| MI-2 | Minor | Shell guard | Line boundaries, wrappers, casing, and quoting are handled inconsistently |
| MI-3 | Minor | Packaging | Packaged README links point to documentation excluded from `files` |
| MI-4 | Minor | Smoke cleanup | The outer Docker smoke path leaks a temporary directory |

## Critical findings

### CR-1: Standard Git write forms bypass approval

**Location:** `dsmm/src/guards.ts:147-170`

**Requirement:** Git writes must request explicit host approval by default and fail closed when approval is unavailable.

**Reproduction:** In an active deepwork session, `decidePreToolExecution()` returned no decision for each command below:

```text
git -C repo reset --hard HEAD
git.exe push origin main
env git tag v1
echo ok\ngit clean -fd
```

The plain form `git commit -m x` returned `ask`, proving that scope and settings were otherwise active.

**Root cause:** `gitWriteOperation()` uses one regular expression that requires the literal token `git` at the command boundary followed immediately by a protected verb. It does not account for executable suffixes or paths, Git global options, environment wrappers, assignments, quoted executables, or newline command boundaries.

**Impact:** Destructive operations including `reset --hard`, `push`, `tag`, `rebase`, and `clean` can execute without the documented approval boundary.

**Required correction:** Parse shell command boundaries and tokens for the supported shell dialects. Recognize executable paths and `git.exe`, unwrap known environment launch forms, skip valid Git global options such as `-C`, `-c`, and `--git-dir`, then classify the first Git subcommand. If a command appears to invoke Git but cannot be parsed safely, the guard must fail closed.

**Regression coverage:** Add a table-driven matrix for PowerShell and POSIX shells covering paths, suffixes, quoting, wrappers, assignments, newlines, chains, global options, protected verbs, and read-only verbs.

### CR-2: Initial DSMM preset sessions are outside guard scope

**Location:** `dsmm/src/dsh-types.ts:15-18`; `dsmm/src/guards.ts:38-47,102-107`

**Requirement:** The default `deepwork-or-dsmm-agent` scope must apply to active deepwork sessions and DSMM-managed agent presets.

**Reproduction:** A session with the following state returned `false` from `isSafetyScopeActive()`:

```ts
{
  header: { agentPreset: "dsmm-reviewer" },
  events: []
}
```

Current DSH stores the resolved initial preset in `session.header.agentPreset`. The `agent-preset/selected` event represents a later selection change and need not exist for a newly created preset session.

**Root cause:** The structural `DshSession` type omits `header`, and scope detection inspects only selection events.

**Impact:** Every safety guard, including Git approval, is disabled by default for ordinary sessions created directly with a DSMM preset.

**Required correction:** Add the relevant header shape and resolve the active preset using DSH precedence: the newest valid `agent-preset/selected` event, falling back to `session.header.agentPreset` when no selection event exists.

**Regression coverage:** Cover initial header-only selection, switching into a DSMM preset, switching away from one, malformed events, and deepwork-mode precedence.

## Important findings

### IM-1: Preset materialization can claim and delete user-owned directories

**Location:** `dsmm/src/preset-materializer.ts:40-50,64-74`

**Reproduction:** A disposable root was prepared with an unmarked `dsmm-reviewer/user.txt`. Enabling materialization wrote DSMM files and `.dsmm-managed-preset` into that existing directory. Disabling the reviewer then recursively deleted the whole directory, including `user.txt`.

**Root cause:** Enabled roles call recursive `mkdirSync()` and write the ownership marker after writing into the target. Removal trusts only the presence of a regular marker reached through `statSync()`. Existing ownership, symbolic links, junctions, marker contents, target-file links, and canonical containment are not validated.

**Impact:** Opt-in materialization can overwrite, claim, and later delete content not created by DSMM. Linked paths can redirect writes or deletion outside the intended managed root.

**Required correction:** Use `lstat`, reject links and non-directories, refuse existing unmarked role directories, validate exact marker ownership before every update or removal, verify canonical containment, reject linked target files, and create new role directories through a temporary sibling plus atomic rename.

### IM-2: `ask` short-circuits downstream pre-execute policy

**Location:** `dsmm/src/guards.ts:303-307`; behavior asserted by `dsmm/test/guards.test.ts:194-211`

**Reproduction:** The prepended listener returned DSMM's `ask` for `git commit`. A supplied downstream `next()` returning `{ kind: "deny" }` was never called.

**Root cause:** The listener returns `decision ?? next()`. Every local decision, including `ask`, terminates the reorderable `tools/pre-execute` waterfall.

**Impact:** After a user approves DSMM's prompt, downstream permission or sandbox listeners that would have denied the operation may never run. Monotonic `ctx.tools.guard()` policies still execute, but ordinary downstream pre-execute policy is skipped.

**Required correction:** A DSMM `deny` may short-circuit. For DSMM `ask`, evaluate downstream policy and preserve downstream `deny` or `ask`; return the DSMM `ask` only when the remainder allows the call.

### IM-3: Deferred settings attachment leaves `promptOrder` stale

**Location:** `dsmm/src/settings.ts:286-301`; `dsmm/src/index.ts:26-38`; `dsmm/src/mode.ts:19-22`

**Reproduction:** A structural Cordis host deferred the `settings` injection and later supplied effective `promptOrder: 77`. The already registered prompt section retained order `50`.

**Root cause:** `registerSettings()` returns the base getter immediately, while Cordis injected plugin execution begins after a microtask. `registerDeepworkPrompt()` synchronously snapshots `getSettings().promptOrder` into an immutable section registration before the settings child attaches.

**Impact:** A documented restart-scoped setting is silently ignored. Prompt composition order can differ from the effective configuration.

**Required correction:** Register settings-dependent resources only after settings readiness, or dispose and re-register the prompt section when the effective restart-scoped settings attach. Preserve the service-absent fallback explicitly.

### IM-4: Mode-event persistence failure blocks the model step

**Location:** `dsmm/src/state.ts:36-44,63-66`

**Reproduction:** With a pending selection during an open turn, downstream pre-step returned an accepted decision. When `session.append()` threw `append failed`, the entire pre-step listener rejected.

**Root cause:** The boundary listener awaits `commit()` without handling append failure.

**Impact:** Failure to persist an advisory mode event aborts an otherwise valid model step. This differs from the DSH plan-mode behavior DSMM follows, where append failure is logged, cannot block the turn, and leaves the pending intent retryable.

**Required correction:** Catch and log boundary append failures, retain the pending intent, and return the original downstream decision. Delete pending state only after a successful append.

### IM-5: Workflow skills are globally visible outside deepwork mode

**Location:** `dsmm/src/index.ts:38`; `dsmm/src/skills.ts:39-50`

**Requirement:** DSMM deepwork behavior remains opt-in, and an ordinary session outside the mode does not receive DSMM workflow instructions.

**Evidence:** The host-level plugin registers all enabled skills with `{ modelInvocable: true, userInvocable: true }`. DSH places registrations from an unscoped host context into the global skill layer, making their names and descriptions visible to all model scopes and allowing the full bodies to be loaded outside deepwork mode.

**Impact:** Brainstorming, planning, review, and cleanup workflows can activate in ordinary sessions despite deepwork being off.

**Required correction:** Register skills in a DSMM preset scope, provide a mode-aware visibility layer, or make global entries non-model-invocable and expose them through an explicitly scoped mechanism.

### IM-6: Dependency declarations target a different DSH generation than smoke testing

**Location:** `dsmm/package.json:40-56`; `dsmm/docker/Dockerfile.smoke:3,11-12`; root `pnpm-lock.yaml`

**Evidence:** DSMM declares and develops against `@deepseek-ai/dsh-*` `^0.0.1-rc.1` packages. The Docker smoke installs `@deepseek-ai/dsh@latest`, observed as `0.1.1-rc.2`, whose runtime graph uses `@deepseek-ai/dsh-*` `^0.1.1-rc.2` packages. The old and new `createUserMessage()` helpers were structurally compatible at review time, but the declared peer ranges remain incompatible.

**Impact:** Strict peer installation can fail, while permissive installation can produce two DSH component generations. The smoke does not prove the dependency graph consumers are asked to install.

**Required correction:** Choose one supported DSH release line, align peer/dev dependencies and lockfile to it, pin the Docker smoke to the same release, and test a packed DSMM artifact in a clean profile.

## Minor findings

### MI-1: Plan-format validation has path and edit gaps

**Location:** `dsmm/src/guards.ts:172-200`

On Windows, `.MD` bypasses the case-sensitive suffix check. Equivalent paths containing `..` are not normalized. A partial edit can transform a valid checkbox into `- []` without placing a complete malformed line in `new_string`, so validating only the edit fragment is insufficient.

Normalize and contain paths using platform semantics. For edit operations, validate the resulting document or explicitly document that only complete writes are protected.

### MI-2: Shell-dialect detection is not shell-aware

**Location:** `dsmm/src/guards.ts:109-143`

The expressions do not consistently handle newlines, leading whitespace, casing, executable wrappers, or quoted text. This produces both false negatives and possible false positives. Reuse the command tokenizer introduced for CR-1 rather than adding more independent regular expressions.

### MI-3: Packaged README links target omitted files

**Location:** `dsmm/package.json:16-23`; `dsmm/README.md:21,39,85-92`

The package `files` list omits `docs`, while README links reference `docs/agent-presets.md` and `docs/safety-guards.md`. A packed artifact therefore contains broken documentation links. The implementation-plan list also omits v0.2.

### MI-4: Outer Docker smoke leaks its temporary home

**Location:** `dsmm/scripts/docker-smoke.mjs:8-9,63-79`

When `DSH_HOME` is absent, the script creates `dsmm-dsh-*` before branching to the outer Docker build/run path. That directory is not used or removed. Create it only inside the container branch that needs it, or remove it in `finally`.

## Required live verification

After correcting the findings, run a pinned packaged-artifact smoke that proves the real integration rather than helper behavior alone:

1. Pack DSMM and install it into an isolated DSH profile using the same DSH versions declared by the package.
2. Create one ordinary session and prove the DSMM prompt and model-invocable skills are absent.
3. Enter `/deepwork`, prove the prompt appears, and run a harmless guarded command through the real tool pipeline.
4. Create a session directly with a DSMM preset and prove guard scope is active from the initial header.
5. Exercise an approval request with a downstream deny policy and prove deny wins.
6. Exercise a large successful text result and prove post-execute truncation preserves success.
7. Remove the disposable profile, container, and temporary directories.

## Recommended remediation order

1. Fix CR-1 and CR-2 and add adversarial regression matrices.
2. Fix IM-1 before enabling materialization anywhere containing user data.
3. Correct middleware composition and mode append failure semantics.
4. Resolve settings readiness and global skill scoping.
5. Align the DSH dependency generation and add the packaged live smoke.
6. Close the plan, packaging, and cleanup gaps.

## Review receipts

```text
role/profile lane: oracle-high
task_id or session receipt: ses_fcf5775d1ffeCM46RvaGd1wEgO
artifact identity: sha256:247cf36a8190127699ef2ad45c054da455dbd2fddb03f570d3c9adb2c19074d9
verdict: rejected
report artifact/source: task result

role/profile lane: reviewer-high
task_id or session receipt: ses_fcf5775adffeCcm6YtIJezZpAF
artifact identity: sha256:247cf36a8190127699ef2ad45c054da455dbd2fddb03f570d3c9adb2c19074d9
verdict: rejected
report artifact/source: task result
```

## Follow-up boundary

Commit `ab9c983f0f54b96f3bf315e8def92a7938e2dde6` was created after this baseline review and is reviewed as a separate current-revision artifact. This report intentionally preserves the original findings and evidence so remediation can be checked finding by finding without rewriting the historical review result.

## Follow-up review: `ab9c983`

### Artifact and verdict

- Commit: `ab9c983f0f54b96f3bf315e8def92a7938e2dde6` (`feat(dsmm): add safety guards`)
- Parent: `f7054bbb3eb81468959dfe4184ae9f161a0b32bf`
- Artifact identity: `committed-range:BASE_SHA=f7054bbb3eb81468959dfe4184ae9f161a0b32bf;HEAD_SHA=ab9c983f0f54b96f3bf315e8def92a7938e2dde6`
- Verdict: **rejected**

The follow-up review used the immutable commit range rather than the current working tree. Concurrent v0.5 MCP/LSP work and this report were excluded from the artifact.

### Follow-up verification

```text
pnpm --filter dsmm test            95 passed, 0 failed
pnpm --filter dsmm typecheck:test  passed
pnpm --filter dsmm build           passed
```

`git diff --check f7054bb..ab9c983` also found trailing whitespace in the duplicated v0.4 implementation-plan file lists. This is a documentation hygiene issue, not a runtime blocker.

### Improvements confirmed

The committed Git parser introduced shell segmentation, tokenization, a broader write-command set, and Git global-option handling. Two baseline cases are fixed:

- `git -C repo reset --hard HEAD` now returns `ask`.
- `echo ok\ngit clean -fd` now returns `ask`.

PowerShell `export` and `source` checks also recognize ordinary newline command boundaries. These changes improve CR-1 and MI-2 but do not close either finding.

### Finding disposition

| ID | Status in `ab9c983` | Evidence |
|---|---|---|
| CR-1 | **Partial** | `git -C` and ordinary newline forms are guarded; `git.exe`, executable paths, wrappers, continuations, aliases, and omitted write verbs remain bypasses |
| CR-2 | **Unfixed** | Header-only `dsmm-reviewer` session still yields inactive scope |
| IM-1 | **Unfixed** | Unmarked role directory is still marked, claimed, and recursively deleted |
| IM-2 | **Unfixed** | A local `ask` still returns without calling downstream `next()` |
| IM-3 | **Unfixed** | Effective `promptOrder: 77` still leaves the registered section at `50` |
| IM-4 | **Unfixed** | Failed mode-event append still rejects the accepted pre-step |
| IM-5 | **Unfixed** | Seven model/user-invocable skills are still registered in the host-global layer |
| IM-6 | **Unfixed** | DSMM remains on `0.0.1-rc.1` peers while smoke installs unpinned latest DSH |
| MI-1 | **Unfixed** | Uppercase `.MD`, equivalent paths, and fragment-only edits bypass validation |
| MI-2 | **Partial** | Ordinary newlines improved; wrappers, continuations, casing, leading whitespace, and quote semantics remain incomplete |
| MI-3 | **Unfixed** | `docs` remains absent from package `files` |
| MI-4 | **Unfixed** | Outer smoke still creates and leaks an unused temporary home |

### Additional CR-1 reproduction against the committed parser

The following commands still returned no guard decision:

```text
git.exe push origin main
env git tag v1
/usr/bin/git rebase main
git config user.name example
```

The parser requires the first recognized executable token to be exactly `git`. It also uses an enumerated write-subcommand set rather than proving a command is read-only. The durable correction should therefore normalize supported executable launch forms and use a strict read-only allowlist; any recognized or ambiguous Git invocation outside that allowlist should request approval.

### Follow-up evidence gap

The additional unit tests cover Git global options and ordinary newline boundaries, but the Docker smoke still calls helpers directly. No live proof exercises a real preset session, approval waterfall, `/deepwork` command, or tool call through the hosted DSH pipeline. This remains an Important evidence blocker after product corrections.

### Follow-up receipts

```text
role/profile lane: oracle-high
task_id or session receipt: ses_fcd802764ffemFOsY9J9K5V6BD
artifact identity: committed-range:BASE_SHA=f7054bbb3eb81468959dfe4184ae9f161a0b32bf;HEAD_SHA=ab9c983f0f54b96f3bf315e8def92a7938e2dde6
verdict: rejected
report artifact/source: task result

role/profile lane: reviewer-high
task_id or session receipt: ses_fcd802746ffe1GzUdFDCilYBKe
artifact identity: committed-range:BASE_SHA=f7054bbb3eb81468959dfe4184ae9f161a0b32bf;HEAD_SHA=ab9c983f0f54b96f3bf315e8def92a7938e2dde6
verdict: rejected
report artifact/source: task result
```
