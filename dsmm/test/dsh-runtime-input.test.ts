import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
// @ts-expect-error Source-only release input helper is deliberately not published.
import { dshTarballUrlForVersion, prepareDshRuntimeInput, verifySha512Integrity } from "../scripts/prepare-dsh-runtime-input.mjs";

test("versioned DSH runtime input selects the trusted historical and 030 tarball identities", () => {
  assert.equal(dshTarballUrlForVersion("0.2.2"), "https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.2.0-rc.2.tgz");
  assert.equal(dshTarballUrlForVersion("0.3.0"), "https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.2.1-rc.1.tgz");
});

test("SHA512 verification binds exact bytes and failed preparation removes only its fresh destination", async () => {
  const bytes = Buffer.from("trusted fixture bytes");
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  assert.deepEqual(verifySha512Integrity(bytes, integrity), {
    integrity,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
  });
  assert.throws(() => verifySha512Integrity(Buffer.from("changed"), integrity));

  const parent = await mkdtemp(join(tmpdir(), "dsmm-runtime-input-test-"));
  const destination = join(parent, "input");
  try {
    for (const packageVersion of ["0.3.0", "0.3.1"]) {
      let requested = false;
      await assert.rejects(prepareDshRuntimeInput({ packageVersion, destination }, async (url: string) => {
        requested = true;
        assert.equal(url, dshTarballUrlForVersion(packageVersion));
        return new Response(bytes, { status: 200 });
      }), /integrity mismatch/u);
      assert.equal(requested, true);
      assert.equal(existsSync(destination), false);
    }
    assert.equal(existsSync(parent), true);
  } finally {
    await rm(parent, { recursive: true, force: false });
  }
});
