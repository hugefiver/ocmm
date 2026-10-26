# OpenCode CodeMode `execute` Compatibility Design

## Goal and Scope

Provide a reproducible, isolated live-host probe of CodeMode `execute`, ocmm MCP visibility, permission filtering, nested hook delivery, and result propagation. Produce an explicit PASS, FAIL, SKIP, or DEFER without changing ocmm product behavior. `execute` isn't bash, a general JavaScript runtime, or a task/subagent dispatcher; it must remain outside subagent-depth accounting.

The runner is `scripts/codemode-execute-compatibility.ts`, with behavioral tests in `scripts/codemode-execute-compatibility.test.ts`. The executable fixtures are `codemode-execute-probe-mcp.mjs`, `codemode-execute-hook-trace-plugin.mjs`, and `codemode-execute-process-wrapper.mjs` under `scripts/fixtures/`. They supply deterministic MCP tools, safe hook traces, and owned native-LSP process management. Result JSON is runtime output, not a tracked historical PASS fixture.

## Supported Host and No-Install Boundary

The supported host is exact OpenCode `1.18.4`, upstream tag `v1.18.4`, commit `49c69c5ed3ccf706b61b3febb43c8aaff7f8325e`. Its `code-mode.ts`, `runtime-flags.ts`, provider implementation, and run-command implementation define the expected host contract. Source evidence doesn't replace a real isolated observation.

Set `OPENCODE_EXPERIMENTAL_CODE_MODE=true` and `OPENCODE_EXPERIMENTAL=false`. CodeMode's outer tool ID is `execute`, taking `{ code: string }`. Nested MCP hooks use flattened IDs such as `lsp_status`, while the program calls namespaced paths such as `tools.lsp.status({})`.

OpenCode `1.18.4` may install a selected SDK unless its effective `model.provider.npm ?? provider.npm` belongs to the bundled provider map. `OPENCODE_1_18_4_BUNDLED_PROVIDER_NPM_IDS` contains exactly:

```text
@ai-sdk/amazon-bedrock
@ai-sdk/amazon-bedrock/mantle
@ai-sdk/anthropic
@ai-sdk/azure
@ai-sdk/google
@ai-sdk/google-vertex
@ai-sdk/google-vertex/anthropic
@ai-sdk/openai
@ai-sdk/openai-compatible
@openrouter/ai-sdk-provider
@ai-sdk/xai
@ai-sdk/mistral
@ai-sdk/groq
@ai-sdk/deepinfra
@ai-sdk/cerebras
@ai-sdk/cohere
@ai-sdk/gateway
@ai-sdk/togetherai
@ai-sdk/perplexity
@ai-sdk/vercel
@ai-sdk/alibaba
gitlab-ai-provider
@ai-sdk/github-copilot
venice-ai-sdk-provider
```

Validate every provider-level and per-model effective SDK route before any host command. Missing explicit SDK identities, dynamic package names, and `file://` routes fail the prerequisite gate. Don't install or provision a provider SDK, package, or OpenCode version.

## Inputs, Isolation, and Barriers

Support `--provider-config`, `--model`, `--fixture-out`, `--opencode`, and `--timeout-ms`. A provider file must be readable, regular, strict JSON, absolute, outside the repository, and contain a non-empty provider object with the selected `provider/model` explicitly declared. Missing, malformed, truncated, empty, array-shaped, undeclared, or unsafe provider input produces `SKIP/provider-config-unavailable` before host execution. Missing/invalid model produces `SKIP/model-unavailable`; provider failure takes precedence.

Create unique task-owned state under the system temporary directory. Don't depend on an existing `LOCALAPPDATA/Temp/opencode` parent. A parent root contains preflight raw state and one or two independent attempt roots; each attempt has private config, XDG, managed-config, raw, PID-ledger, and stop-signal locations. Raw state never becomes repository evidence.

Preflight gates live attempts on a successful non-timeout exact `1.18.4` version, resolved executable provenance, valid revision evidence, required built ocmm/LSP artifacts, and strict direct-native LSP smoke. Resolve a Scoop shim to its absolute regular-file target before hashing; an invalid existing shim fails closed without hashing shim bytes instead. A different host version stops before later preflight work and creates no attempt. Provenance is runtime evidence, not a pinned local binary digest or dirty revision in documentation or snapshot tests.

Construct a new attempt config from only valid `$schema`, validated `provider`, and valid string-array `enabled_providers` / `disabled_providers`. Force `share: "disabled"` and `autoupdate: false`. Install only the built ocmm file plugin, trace file plugin, and local probe MCP; ocmm registers LSP. Discard inherited plugins, MCPs, instructions, skills, references, agents, commands, and arbitrary top-level fields. Replace permissions with this ordered map:

```text
task: deny
bash: deny
execute: allow
lsp_*: allow
codemode_probe_*: allow
codemode_probe_denied: deny
```

Build child environments as copies. Remove inherited `HOME`, `USERPROFILE`, `OPENCODE_CONFIG`, `OPENCODE_CONFIG_CONTENT`, `OPENCODE_CONFIG_DIR`, `OPENCODE_PERMISSION`, `OPENCODE_DISABLE_PROJECT_CONFIG`, `OPENCODE_PURE`, `OPENCODE_PLUGIN_META_FILE`, `OPENCODE_AUTO_SHARE`, `OPENCODE_TEST_HOME`, `OPENCODE_TEST_MANAGED_CONFIG_DIR`, `OCMM_FAST`, `OCMM_PROFILE`, and `OCMM_NO_PROFILE` with case-insensitive key comparison. Set HOME, USERPROFILE, and test-home to the attempt root; managed-config to its pre-created empty directory; explicit config to its `opencode.json`; project-config disable to `1`; and all four XDG roots inside the attempt. Config-content/config-dir overrides remain absent. Retain provider credential variables without logging them. These controls block ancestor/home and Windows managed-config injection without mutating the caller environment.

Each attempt enforces these barriers in order:

1. `opencode --version`: exit `0`, no timeout, one strict semantic version exactly equal to `1.18.4`. Reject malformed identifiers and numeric leading zeroes.
2. `opencode debug paths`: all seven dynamic labels (data, bin, log, repos, cache, config, state) appear exactly once inside the attempt root. Unknown or escaped XDG stops later work.
3. `opencode debug config`: exactly one ocmm config-loaded marker identifies that attempt's `.opencode/ocmm.jsonc` with `user=<none>`. Missing, duplicate, mixed, split, malformed, or wrong-root markers fail.
4. `opencode mcp list`: exactly one connected row for each of `lsp` and `codemode_probe`, after ANSI/glyph-prefix normalization. Reject duplicate, negative, mixed, cross-line, same-line multi-status, or trailing-junk rows.
5. Only then invoke `opencode run --format json` with the supplied model.

Barrier commands use `OCMM_DEBUG=1`. Only provider `run` gets a copied environment with `OCMM_DEBUG=0` to keep plugin diagnostics out of strict JSONL stdout. Keep raw capture and parser rules intact; don't filter invalid output into validity.

## Probe and Evidence Contract

The local MCP exposes `identity`, `json_error`, and hard-denied `denied`. `identity` accepts only the fixed marker below; missing or wrong values return JSON-RPC `-32602` without a success marker. `json_error` returns fixed text containing `OCMM_CODEMODE_HOOK_SENTINEL`. Events retain only safe labels, never arbitrary arguments.

Request exactly one outer execute call with this program:

```js
const denied = await tools.$codemode.search({ query: "codemode_probe.denied", limit: 50 })
const [lsp, identity, hookPayload] = await Promise.all([
  tools.lsp.status({}),
  tools.codemode_probe.identity({ marker: "OCMM_CODEMODE_EXECUTE_PROBE" }),
  tools.codemode_probe.json_error({}),
])
return {
  marker: "OCMM_CODEMODE_EXECUTE_PROBE",
  deniedVisible: denied.items.some((item) => item.path === "tools.codemode_probe.denied"),
  lspOk: Boolean(lsp),
  identityOk: String(identity).includes("OCMM_CODEMODE_EXECUTE_PROBE"),
  hookPayloadOk: String(hookPayload).includes("OCMM_CODEMODE_HOOK_SENTINEL"),
}
```

Search returns `{ items, remaining, next }`, not an array. Visibility uses exact `items[].path`, including the `tools.` prefix.

Before hooks accept official first-argument identity plus second-argument `{ args }`, with first-argument `args` as compatibility fallback. Second-argument args take precedence. Record only normalized tool identity, phase, ID-presence booleans, sorted argument-key names, nested statuses, and safe markers. Null identity remains classifiable but can't satisfy PASS.

`buildProbeCode()` supplies exact program bytes to the prompt and child-only `OCMM_CODEMODE_EXPECTED_CODE_SHA256`. The trace plugin compares the received code digest and retains only `safeMarkers.exactCode`, never code, digest, or argument values. Only outer `execute.before` can establish exact code; only outer `execute.after` can establish `executeProbe`, `deniedHidden`, `lspOk`, `identityOk`, and `hookPayloadOk`. Nested markers can't forge outer evidence.

PASS requires one outer before/after pair, one before/after pair for each of `lsp_status`, `codemode_probe_identity`, and `codemode_probe_json_error`, and the separate completed metadata multiset `$codemode_search` plus those three tools, each once. `$codemode_search` is metadata-only. Any hook/metadata multiset defect is `FAIL/nested-hook-count-invalid`. MCP events must prove identity and json-error calls exactly once and no denied call. Denied catalog visibility must be false and all result markers must succeed.

Provider-run JSONL accepts only `tool_use`, `step_start`, `step_finish`, `text`, `reasoning`, and `error`, each with finite numeric `timestamp` and non-empty `sessionID`. Non-error rows need record-valued `part`; error rows need an `error` property. Empty, malformed, unknown, or wrong-shape output is unclassifiable. PASS independently requires positive, internally consistent event counts with zero errors, or fails as `provider-run-jsonl-invalid`. Don't lock a historical event count or sequence.

Model prose isn't host evidence. Trusted permission, unsupported, or activation signals come only from structured error events or recognizable host stderr. Unsupported evidence must identify execute itself, such as `unknown tool: execute`, `tool execute is unsupported`, or `execute tool is not available`; nested-child failures don't establish host feature absence. Trusted stderr-only signals may preserve precise non-passing outcomes despite nonzero exit and empty stdout. Non-empty malformed stdout remains unclassifiable.

Direct LSP smoke invokes the resolved native executable with `mcp` and a `tools/list` JSON-RPC request, not the TypeScript wrapper. Accept only one object with `jsonrpc: "2.0"`, ID `1`, no error, and the exact tool multiset `status`, `diagnostics`, `goto_definition`, `find_references`, `find_symbol_related`, `symbols`, `prepare_rename`, and `rename`, each once. Reject malformed entries, wrong envelopes, extras, and duplicates.

A second fresh attempt is allowed only after isolated XDG, exact isolated registration, both MCP connections, classifiable output, no timeout/permission/unsupported/activation signal, and zero outer execute before/after events. There is no third attempt. Two such refusals yield DEFER, never inferred PASS.

## Process Ownership and Cleanup

`runCommand()` owns its direct `Child`, bounds stdout/stderr to 16 MiB each, applies a hard timeout, caches exit status on `exit`, and waits for `close` to drain inherited output. Spawn errors also await close; a bounded fallback handles missing close. On timeout, write the attempt-local stop signal first, briefly allow cooperative shutdown, then terminate only the still-unexited direct child through its owned handle. Never kill after `exit`, launch a tree-kill helper, or terminate by recorded PID.

The MCP fixture watches its private stop signal and exits. The wrapper installs ownership handlers before ledger append, watches the same signal, and terminates/reaps only its owned native child. Spawn or ledger-write failure must not orphan that child.

Keep host PIDs in memory and append fixture and wrapper/native ownership rows to attempt-local ledgers. Parse all valid rows even after malformed input, deduplicate PIDs, and mark malformed/unreadable evidence incomplete. Once MCP startup is attempted, missing fixture or LSP ownership rows are incomplete; pre-MCP exits may have no such rows.

Outer cleanup refreshes every ledger, writes each stop signal, and observes the union of recorded PIDs until a bounded deadline. Only `ESRCH` proves absence; permission and unknown errors mean alive/unobservable. Never send termination signals to historical PIDs, even if they now identify an unrelated process. If ownership is incomplete or any PID remains, preserve roots. Otherwise delete exact task-owned attempt roots before the parent, preserving every deletion failure in the outcome. Incomplete ledgers, surviving/unobservable PIDs, deletion errors, or residual roots are `FAIL/cleanup-incomplete`.

## Output and Classification

Default sanitized output belongs to a unique task-owned system-temp location outside disposable run state. Explicit `--fixture-out` remains the caller-selected destination. No repository JSON refresh, copy, commit, or historical PASS lock is required.

Serialize a new whitelist object after cleanup, never a regex-redacted raw object. Reject credentials, raw outputs, argument values, session/call IDs, provider paths, absolute paths, and secret prefixes including `sk-`, `ghp_`, `AKIA`, and Slack `xoxb-`/`xoxp-`/`xoxa-`/`xoxr-`/`xoxs-`. The approved `deniedCalled` key isn't a leak. Rejected string values become `redacted`, `secretsAbsent` becomes false, and the outcome is `FAIL/sanitized-evidence-leak`.

Output finalization failure must not expose raw exceptions or print a premature receipt. Preserve existing FAIL precedence; otherwise classify `DEFER/fixture-write-failed` and try a safe task-owned system-temp fallback. Print the actual successful destination only in the result line. If all writes fail, leave stdout empty and emit only `OCMM_CODEMODE_FIXTURE_UNAVAILABLE=<status>:<reason>` on stderr, preserving the classified exit.

```text
OCMM_CODEMODE_RESULT=<PASS|FAIL|SKIP|DEFER>:<reason-code>:<resolved-fixture-path>
```

| Exit | Status | Meaning |
|---:|---|---|
| `0` | PASS | Every functional and safety requirement was observed; GO only for the tested configuration. |
| `2` | FAIL | An actual contract or safety violation; NO-GO. |
| `3` | SKIP | Missing prerequisite or precisely established unsupported execute; NO DECISION. |
| `4` | DEFER | Timeout, permission blockage, unclassifiable output, unknown XDG, activation ambiguity, two clean refusals, or output-write failure; NO DECISION. |

Cleanup failure takes precedence, followed by actually observed XDG escape. Unknown XDG doesn't invent an escape or plugin defect: preserve precise prerequisite/preflight/timeout/permission/unclassifiable reasons, then use `DEFER/xdg-unobserved` before registration classification. Internal exceptions after run-root creation still pass through cleanup, sanitization, and structured finalization. Never serialize raw exceptions.

## Verification and Product Boundary

Behavioral tests cover the protocol, status precedence, isolation barriers, sanitization, owned-process lifecycle, retry predicates, and output routing/fallback. Don't pin local model identities, binary digests, worktree state, temp paths, or a historical PASS fixture. Live verification uses an authorized provider/model and available no-install artifacts, retaining only sanitized observations and reporting missing coverage honestly. Unit-test success, source inspection, and model prose aren't live compatibility PASS.

A live failure doesn't authorize speculative product changes. Product remediation is separate and requires reproducible isolated failure, an ocmm-owned failing boundary, and replayable evidence for a focused test. Cleanup failure, host feature absence, provider nondeterminism, and fixture defects aren't proof of an ocmm product defect. Never add execute to subagent-depth accounting.
