import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const { runSessionHistorySmoke } = await import(new URL("../scripts/session-history-smoke.mjs", import.meta.url).href);

async function fixture(version: string, expectedPackage: unknown, name = "@dsmm/dsmm") {
  const ownedRoot = await mkdtemp(join(tmpdir(), "dsmm-history-identity-"));
  try {
    const artifact = join(ownedRoot, "candidate.tgz"), operatorPackageRoot = join(ownedRoot, "installed");
    const bytes = Buffer.from("synthetic identity boundary, not an install or native history proof");
    await writeFile(artifact, bytes);
    await mkdir(operatorPackageRoot);
    await writeFile(join(operatorPackageRoot, "package.json"), JSON.stringify({ name, version }));
    let nativeLoads = 0;
    const boundary = new Error("REACHED_NATIVE_HISTORY_BOUNDARY");
    const operatorRequire = { resolve() { nativeLoads++; throw boundary; } };
    try {
      await runSessionHistorySmoke({ artifact, sha256: createHash("sha256").update(bytes).digest("hex"),
        ownedRoot, operatorPackageRoot, operatorRequire, expectedPackage });
      assert.fail("the boundary sentinel must stop the native history operation");
    } catch (error) { return { error, nativeLoads, boundary }; }
  } finally { await rm(ownedRoot, { recursive: true, force: false }); }
}

test("packed history accepts current frozen 0.1.4 identity instead of the obsolete 0.1.2 literal", async () => {
  const result = await fixture("0.1.4", { name: "@dsmm/dsmm", version: "0.1.4" });
  assert.equal(result.error, result.boundary);
  assert.equal(result.nativeLoads, 1);
});

test("packed history retains legacy frozen identity without requiring the current release version", async () => {
  const result = await fixture("0.1.2", { name: "@dsmm/dsmm", version: "0.1.2" });
  assert.equal(result.error, result.boundary);
});

test("packed history rejects absent, invalid, or mismatched frozen identity before native operations", async () => {
  for (const expected of [undefined, { name: "other", version: "0.1.4" },
    { name: "@dsmm/dsmm", version: "0.1.4-next" }, { name: "@dsmm/dsmm", version: "0.1.2" }]) {
    const result = await fixture("0.1.4", expected);
    assert.ok(result.error instanceof assert.AssertionError);
    assert.equal(result.nativeLoads, 0);
  }
  const wrongName = await fixture("0.1.4", { name: "@dsmm/dsmm", version: "0.1.4" }, "dsmm");
  assert.ok(wrongName.error instanceof assert.AssertionError);
  assert.equal(wrongName.nativeLoads, 0);
});
