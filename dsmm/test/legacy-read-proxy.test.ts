import { test } from "node:test";
import { runLegacyReadScenario } from "./legacy-read-test-helper.ts";

for (const [scenario, requirement] of [
  ["ordinary", "useful native read once with real nested token/root attribution and independent audit append"],
  ["deny-parent-pre", "parent early policy denies without FS body"], ["deny-parent-around", "parent later policy denies without FS body"],
  ["deny-child-pre", "child early policy denies without FS body"], ["deny-child-around", "child later policy denies without FS body"],
  ["post-parent", "parent post-next denial remains authoritative after one read"], ["post-child", "child post-next denial remains authoritative after one read"],
  ["transform-child", "final child content transformation survives result restoration"], ["later-transform", "different downstream failure cannot be restored over"],
  ["finalize-child", "actual child last-mile finalization stays authoritative and reaches call audit unchanged"],
  ["failure", "real native failure retains the actual parent's final structured outcome"],
  ["arguments", "credentials, escalation fields and arguments outside native read caps never reach FS"],
  ["target", "opaque target mismatch fails before stat/read"], ["provenance", "unknown native implementation provenance fails before stat/read"],
  ["definition-replaced", "same-name newly mounted native read cannot replace the attested exact source definition"],
  ["captured-evidence", "an original capture cannot be relabeled as trusted physical-old evidence"],
  ["lineage-filter", "wrong direct lineage or original read filter cannot acquire an operation lease"],
  ["transport-fidelity", "bounded failure fidelity restores the final actual result without claiming intermediate raw-reason transparency"],
  ["content-contexts", "parent content is projected before child post policy and both native contexts survive without duplication"],
  ["alias", "different child/parent cwd and symlink alias read the same native file identity and bytes"],
  ["concurrency", "concurrent independent calls each execute exactly one native body"],
  ["after-next-caller-abort", "caller abort selected before project keeps native ABORTED content rather than parent success content"],
] as const) test(requirement, () => runLegacyReadScenario(scenario));
