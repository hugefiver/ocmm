import { test } from "node:test";
import { runLegacyReadScenario } from "./legacy-read-test-helper.ts";

for (const [scenario, requirement] of [
  ["generation", "close synchronously rejects new leases and waits for child finalization plus audit before generation publication"],
  ["owner-generation", "only process-local owners and current checked generations can publish; released leases cannot be reused"],
  ["epoch", "parent epoch revoked during actual async target resolution never dispatches a body"],
  ["child-lifetime", "child lifetime revoked during async target resolution never dispatches a body"],
  ["caller", "caller cancellation during async target resolution never dispatches a body"],
  ["dispose-cutoff", "public dispose start revokes before native drain and prevents pending body entry"],
  ["public-dispose", "optional Host disposal drains revoked direct native calls before removing their completion scopes"],
  ["parent-await-cutoff", "epoch revocation at a real awaited parent around boundary reaches the native final body cutoff"],
  ["success-wins", "a real read success is not relabeled or retried after later parent epoch revocation"],
  ["standing", "removing the proxy retains child standing denial until actual child disposal"],
  ["child-pre-late-deny", "native child pre terminal denial survives parent revocation with its actual audit"],
  ["child-pre-late-cancel", "native child pre terminal cancellation survives parent revocation with its actual audit"],
  ["child-pre-throw", "native child pre exception keeps the native final-error path and actual audit"],
  ["acquisition-lease-revoke", "owner acquisition consumes lease revocation without replacing native caller signal or cancelling the accepted task"],
  ["acquisition-caller-revoke", "owner acquisition consumes caller cancellation and finishes its actual child-only outcome"],
  ["child-pre-await-revoke", "local pre fences reject revoked read after an awaited child policy without cancelling the accepted task"],
] as const) test(requirement, () => runLegacyReadScenario(scenario));
