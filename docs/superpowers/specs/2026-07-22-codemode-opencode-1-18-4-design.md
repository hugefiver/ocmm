# CodeMode OpenCode 1.18.4 Baseline Design

## Goal and Scope

The evidence-only CodeMode harness supports exact OpenCode `1.18.4`. Preserve fail-closed classification, no-install provider validation, process ownership, cleanup, and sanitized evidence without changing ocmm product runtime behavior.

The runner, behavioral tests, and three executable CodeMode fixtures implement the probe. Sanitized results are runtime output, not a checked-in PASS snapshot. No provider/model is prescribed, and no installation or upgrade is part of the contract.

## Host Source and Provider Boundary

The source baseline is OpenCode tag `v1.18.4`, commit `49c69c5ed3ccf706b61b3febb43c8aaff7f8325e`:

- `packages/opencode/src/cli/cmd/run.ts` defines JSONL event envelopes.
- `packages/opencode/src/provider/provider.ts` defines bundled provider SDK routes.
- `packages/opencode/src/tool/code-mode.ts` defines execute metadata and nested-tool behavior.

`SUPPORTED_OPENCODE_VERSION` is `1.18.4`. Both parent and attempt-local barriers reject all other versions before later host/model commands. `OPENCODE_1_18_4_BUNDLED_PROVIDER_NPM_IDS` owns the exact 24-route no-install allowlist listed in the [compatibility design](2026-07-20-codemode-execute-compatibility-design.md). Validate every effective provider-level and per-model SDK route before any host command. Dynamic package and `file://` routes can't reach SDK installation or import.

Source-defined structure doesn't replace real host observations. A compatibility PASS applies only to the configuration actually tested, not to untested versions or models.

## JSONL Contract

The public parser is `parseOpenCodeRunJsonl(text): OpenCodeRunJsonlFacts | null`; the event type is `OpenCodeRunJsonlEventType`. Accepted event types are:

- `tool_use`, `step_start`, `step_finish`, `text`, and `reasoning`, each with record-valued `part`;
- `error`, with an `error` property.

Every row must be a JSON object with finite numeric `timestamp` and non-empty string `sessionID`. Empty output, malformed lines, unknown types, and invalid shapes return `null`. Retain only aggregate event types and counts, not raw payloads or IDs.

PASS requires non-null facts, positive `eventCount`, `eventTypes.length === eventCount`, `nonErrorPartCount + errorEventCount === eventCount`, `errorEventCount === 0`, and `nonErrorPartCount === eventCount`. A violation is `FAIL/provider-run-jsonl-invalid`, regardless of favorable output markers. Don't require a fixed historical event count or sequence.

Keep version, path, config, and MCP barriers at `OCMM_DEBUG=1`. Only provider `run` receives a copied environment with `OCMM_DEBUG=0` to keep plugin diagnostics out of strict JSONL stdout. Don't relax the parser or filter invalid output into validity.

## Hook and Metadata Contract

`REQUIRED_NESTED_TOOLS` contains exactly `lsp_status`, `codemode_probe_identity`, and `codemode_probe_json_error`. Each must have exactly one before and one after hook.

`REQUIRED_COMPLETED_METADATA_TOOLS` contains exactly `$codemode_search` plus those same three tools. `$codemode_search` is metadata-only and must not be invented as a nested plugin hook. Missing, duplicate, or extra entries in either multiset produce `FAIL/nested-hook-count-invalid`.

Exact-code attestation belongs only to outer `execute.before`; safe result markers belong only to outer `execute.after`. Nested rows can't supply outer PASS evidence. Direct native LSP smoke requires the strict JSON-RPC envelope and exact eight-tool multiset, with no extras or duplicates.

## Isolation, Output, and Safety

Provider/model validation precedes host execution. Exact-version, XDG, isolated-project config, and MCP registration barriers precede the model call. Use the exact probe program and retry only once after a clean isolated refusal, as defined in the shared design.

Create unique task-owned run state and default sanitized output under the system temporary directory. Don't require a pre-existing `LOCALAPPDATA/Temp/opencode` directory. Keep output separate from disposable run state and preserve explicit `--fixture-out`. No tracked JSON refresh or snapshot-locking test is required.

Cleanup precedes finalization. Signal attempt-owned services, reap through owned direct child handles, and observe recorded PIDs without historical-PID termination. Incomplete ownership evidence, surviving/unobservable processes, or deletion errors fail closed. Delete only exact task-owned resources after process absence is proved.

Serialize only whitelisted safe facts. Credentials, raw logs, argument values, session/call IDs, and absolute paths don't enter evidence content. On write failure, use a safe task-owned temp fallback and report only the actual destination; if none succeeds, don't fabricate a path-bearing receipt.

## Acceptance

Behavioral coverage verifies exact host and SDK boundaries, JSONL structure and consistency, hook/metadata multisets, direct-LSP protocol, isolation, output routing, and cleanup. It doesn't preserve machine-specific revisions, binary digests, model identities, or historical PASS data.

Only an actually observed run satisfying every functional and safety requirement may be PASS. Preserve precise FAIL/SKIP/DEFER outcomes and current verification limits. Unit-test success and model prose aren't live compatibility evidence.
