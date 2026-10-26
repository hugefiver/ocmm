# CodeMode OpenCode 1.18.4 Compatibility Plan

## Goal and Boundary

Validate the evidence-only CodeMode harness against exact OpenCode `1.18.4`, preserving fail-closed classification, no-install provider checks, isolated execution, process ownership, and sanitized output. Don't change ocmm product behavior or install OpenCode, packages, or SDKs.

The source baseline is upstream tag `v1.18.4`, commit `49c69c5ed3ccf706b61b3febb43c8aaff7f8325e`. The host-specific requirements are in the [baseline design](../specs/2026-07-22-codemode-opencode-1-18-4-design.md), with shared safety rules in the [compatibility design](../specs/2026-07-20-codemode-execute-compatibility-design.md).

## Host Contract

Both parent and attempt-local version barriers require exactly `1.18.4`. A different version stops before subsequent host/model work and can't produce a compatibility PASS. Validate provider-level and per-model effective SDK routes against `OPENCODE_1_18_4_BUNDLED_PROVIDER_NPM_IDS` before any host command; dynamic package and `file://` routes aren't permitted.

`parseOpenCodeRunJsonl(text)` returns safe aggregate facts or `null`. Accept only the six official event types with finite numeric `timestamp` and non-empty `sessionID`. Non-error events require record-valued `part`; `error` requires an `error` property. PASS requires positive, internally consistent event counts and zero errors. Don't turn model prose or filtered malformed output into host evidence.

Require exactly one before/after pair for each of `lsp_status`, `codemode_probe_identity`, and `codemode_probe_json_error`. Completed metadata must contain exactly those tools plus `$codemode_search`, each once. Search metadata isn't a nested plugin hook. Either multiset defect is `FAIL/nested-hook-count-invalid`.

Keep registration barriers debug-enabled. Only the provider `run` receives a copied environment with `OCMM_DEBUG=0`; its strict JSONL parser and raw capture remain intact.

## Isolated Live Verification

Use a caller-supplied provider/model, not a fixed personal configuration. Validate strict JSON and SDK routes before starting the host. Keep provider input outside the repository and never print credentials, endpoint details, or credential-bearing environment values.

Create unique task-owned resources under the system temporary directory without requiring a pre-existing `LOCALAPPDATA/Temp/opencode` directory. Use available build artifacts or a separately authorized isolated no-install build. Temporary source/build locations aren't persistent requirements or retained evidence.

Run the direct native LSP smoke with JSON-RPC `2.0`, request ID `1`, and `tools/list`. Require the exact eight canonical tools once each, rejecting extras, duplicates, error envelopes, and malformed entries. Then enforce isolated XDG, exact project config selection, and both MCP connections before a provider call.

Validate the actual sanitized result and its exit agreement. PASS requires exact execute code, phase-authoritative markers, the required hooks and metadata, valid JSONL aggregates, denied-tool hiding/no call, and complete process/root cleanup. Any missing observation remains non-passing; don't fabricate PASS or reinterpret SKIP/DEFER.

## Output and Cleanup

Default sanitized output goes to a task-owned system-temp location outside disposable run state. Preserve explicit `--fixture-out` and validate the actual emitted path before reading output. There is no tracked result JSON to refresh, copy, commit, or preserve as a historical PASS snapshot.

Use whitelist serialization and reject secrets, raw payloads, session/call IDs, and absolute paths from evidence content. A result line may identify the actual output destination. Write failure uses a safe task-owned temp fallback without weakening an existing FAIL; if all writes fail, don't print a path-bearing success receipt.

Always signal and reap owned services through their stop protocol and direct child handles. Observe recorded PIDs without terminating historical or unrelated processes. Incomplete ledgers, surviving/unobservable PIDs, deletion failures, or residual roots are `FAIL/cleanup-incomplete`. Remove only verified task-owned resources; preserve roots when ownership or process absence is unproved. Restore any environment values changed by an enclosing verification transaction, and don't recursively delete dependency-link targets.

## Acceptance Evidence

Behavioral tests cover strict host/provider gates, JSONL validity and aggregate consistency, separate hook/metadata sets, exact direct-LSP tools, isolated environments, output delivery/fallback, and cleanup safety. They don't assert a recorded model, binary digest, worktree state, event sequence, or local-run PASS snapshot.

A live compatibility claim needs actual host, hook, MCP, protocol, and cleanup observations. Test success alone isn't live evidence. Keep current verification limits and non-passing results explicit without retaining a machine-specific run history in these documents.
