import { test } from "node:test";
import { runLegacyReadScenario } from "./legacy-read-test-helper.ts";

for (const [scenario, requirement] of [
  ["owner-methods", "process-local owner and call-lease methods preserve their native callback receiver"],
  ["unknown", "unknown startup chain stays off; it is not a wire boolean attestation"],
  ["incompatible", "metadata-dependent native chain is unavailable instead of silently losing fidelity"],
  ["incompatible-retry", "detached retry composition cannot become ready"],
  ["incompatible-double", "actual multiple-next policy is unavailable before either read body can run"],
  ["incompatible-failure-content", "intermediate custom-failure-content consumers cannot become ready"],
  ["incompatible-context", "intermediate context-dependent consumers cannot become ready"],
  ["incompatible-transform", "ambiguous same-shape result transforms cannot become ready"],
  ["incompatible-unknown", "an unknown actual policy reference cannot become ready"],
  ["audit-unavailable", "missing real audit route is unavailable before read body"],
  ["audit-fault", "audit operational failure closes future leases without retrying or relabeling the actual success"],
  ["approval-idle", "an asking branch cannot invent an open parent turn while native parent is idle"],
  ["approval-allow", "actual open parent turn and native approval grant read once with a real turn-enclosed audit pair"],
  ["approval-reject", "normal native approval rejection prevents body entry and retains its real audit"],
  ["approval-cutoff", "coordinated turn closing revokes an awaiting native approval before body entry"],
  ["two-children", "independent legacy children publish on one Host and each perform one useful native read"],
  ["child-pre-denial-audit", "audit covers child pre denial without requiring proxy body entry"],
  ["child-around-denial-audit", "audit covers child around denial without requiring proxy body entry"],
  ["child-ask-never", "child approval is unavailable before prompting when the operation lease is never-ask"],
  ["approval-child-uncontrolled", "uncontrolled child ask stays unavailable before approval even with real coordinated turn leases"],
  ["pre-signal-readonly", "read-only native pre signal remains the original caller signal and permits one useful read"],
] as const) test(requirement, () => runLegacyReadScenario(scenario));
