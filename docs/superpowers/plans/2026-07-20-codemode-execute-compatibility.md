# OpenCode CodeMode `execute` Compatibility Plan

## Goal and Scope

Provide an isolated, sanitized probe of the exact OpenCode `1.18.4` CodeMode contract without changing ocmm product behavior. The runner and behavioral tests live in `scripts/codemode-execute-compatibility.ts` and `scripts/codemode-execute-compatibility.test.ts`; the three executable fixtures provide MCP tools, hook tracing, and owned native-LSP process management.

The [compatibility design](../specs/2026-07-20-codemode-execute-compatibility-design.md) defines the protocol and safety requirements. The [OpenCode 1.18.4 design](../specs/2026-07-22-codemode-opencode-1-18-4-design.md) defines the host-specific envelope and metadata contract. No software installation or product-code repair belongs to this probe.

## Runner and Output

Support `--provider-config`, `--model`, `--fixture-out`, `--opencode`, and `--timeout-ms`. Provider input must be a readable absolute strict-JSON file outside the repository, with the selected `provider/model` explicitly declared. Validate every effective provider SDK route against the exact OpenCode `1.18.4` bundled allowlist before any host command. Missing or unsafe provider input produces `SKIP/provider-config-unavailable`; missing or invalid model produces `SKIP/model-unavailable`, with provider failure taking precedence.

Create unique task-owned run and default output locations under the system temporary directory. Don't depend on a pre-existing `LOCALAPPDATA/Temp/opencode` directory. Keep the sanitized default output separate from disposable run state so successful cleanup doesn't remove the reported result. Preserve explicit `--fixture-out` as the caller-selected destination; no repository fixture refresh or commit is required.

Finalize output only after cleanup and whitelist sanitization. A primary write failure becomes `DEFER/fixture-write-failed` unless an existing `FAIL` takes precedence. Try a safe task-owned system-temp fallback and report its actual resolved path. If no destination can be written, emit no false path-bearing result; use only `OCMM_CODEMODE_FIXTURE_UNAVAILABLE=<status>:<reason>` on stderr and preserve the classified exit.

The single successful finalization line is:

```text
OCMM_CODEMODE_RESULT=<PASS|FAIL|SKIP|DEFER>:<reason-code>:<resolved-fixture-path>
```

Exit mappings are `PASS=0`, `FAIL=2`, `SKIP=3`, and `DEFER=4`. Only PASS is GO. Unit-test success, model prose, SKIP, and DEFER aren't live compatibility PASS evidence.

## Isolation and Execution

1. Gate live attempts on exact host version `1.18.4`, required build artifacts, and strict direct-native LSP `tools/list` smoke. Another host version runs no model attempt.
2. Construct attempt-local config from the validated provider-only allowlist. Disable sharing and updates; discard inherited plugins, MCPs, instructions, agents, commands, and permissions. Use only the built ocmm plugin, trace plugin, local probe MCP, and the specified permission map.
3. Copy the child environment without mutating the caller. Replace home, test-home, managed-config, explicit config, XDG, and OpenCode/ocmm routing controls with isolated values. Keep provider credential variables without logging them.
4. Enforce attempt barriers in order: exact version, isolated `debug paths`, exactly one correct isolated-project ocmm config marker with no user config, then exactly one connected row for each required MCP. A failed barrier stops later commands.
5. Keep barrier commands at `OCMM_DEBUG=1`; give only provider `run` a copied environment with `OCMM_DEBUG=0` so stdout remains strict JSONL. Don't filter malformed output into validity.
6. Request one exact `execute` program. Permit a second fresh attempt only after a clean, classifiable, fully isolated refusal with zero outer execute events and no timeout, permission, unsupported, or activation-ambiguity signal. There is no third attempt.

## Evidence and Safety

PASS requires exact-code attestation from outer `execute.before`, result markers from outer `execute.after`, exactly one outer hook pair, the required three nested MCP hook pairs, and the separate four-tool completed metadata multiset. `$codemode_search` is metadata-only. Require internally consistent, positive, error-free JSONL facts, exact MCP argument delivery, denied-tool invisibility and no denied call, registration, isolation, sanitized output, and complete cleanup.

Use role-separated host/wrapper/fixture/native ownership ledgers. `runCommand()` owns its direct `Child` until `close`, with bounded output and timeout handling. On timeout, signal the attempt-local stop file first; terminate only its still-unexited direct child through the owned handle. Never kill after `exit` or use a historical PID for termination. The wrapper stops and reaps only its owned native child.

Outer cleanup refreshes all valid ledger rows, marks malformed or unreadable ledgers incomplete, signals owned services, and observes recorded PIDs. Only `ESRCH` proves absence. Incomplete ownership or a surviving/unobservable process prevents deletion. Delete only exact task-owned roots after all recorded processes are gone; any incomplete ledger, removal failure, or residue is `FAIL/cleanup-incomplete`.

## Behavioral Verification

Cover status precedence, strict host/provider barriers, environment isolation, exact CodeMode search and hook payloads, phase-specific marker authority, JSONL structural validation, separate hook/metadata multisets, direct-LSP protocol validation, secret rejection, retry eligibility, and truthful output/exit routing.

Process checks must exercise stop/reap ordering, inherited output draining, no kill after direct-child exit, malformed ownership evidence, unrelated-PID survival, and deletion failures. Output checks must exercise default system-temp delivery, explicit `--fixture-out`, safe fallback, and total write failure through behavior. Don't lock local environment details or a historical PASS snapshot.

For live verification, use authorized provider/model input and available no-install build artifacts. Inspect only sanitized results for retained evidence; raw config, logs, credentials, PID files, and session state remain disposable. Report only what was actually observed, including non-passing outcomes and cleanup failures.
