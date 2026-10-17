import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { dshPolicyForVersion } from "./release-contract.mjs";

const REGISTRY = "https://registry.npmjs.org";

export function verifySha512Integrity(bytes, expectedIntegrity) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length > 0, "DSH tarball bytes are required");
  assert.match(expectedIntegrity, /^sha512-[A-Za-z0-9+/]{86}==$/u, "trusted DSH integrity is invalid");
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  assert.equal(integrity, expectedIntegrity, "downloaded DSH tarball integrity mismatch");
  return { integrity, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
}

export function dshTarballUrlForVersion(packageVersion) {
  const { runtimeVersion } = dshPolicyForVersion(packageVersion);
  return `${REGISTRY}/@deepseek-ai/dsh/-/dsh-${encodeURIComponent(runtimeVersion)}.tgz`;
}

export async function prepareDshRuntimeInput({ packageVersion, destination }, fetcher = fetch) {
  const policy = dshPolicyForVersion(packageVersion);
  assert.ok(isAbsolute(destination), "DSH runtime input destination must be absolute");
  const parent = realpathSync(dirname(destination));
  assert.equal(existsSync(destination), false, "DSH runtime input destination must be fresh");
  mkdirSync(destination, { mode: 0o700 });
  let complete = false;
  try {
    assert.equal(realpathSync(dirname(destination)), parent, "DSH runtime input parent changed");
    const url = dshTarballUrlForVersion(packageVersion);
    const response = await fetcher(url, { redirect: "error", headers: { accept: "application/octet-stream" } });
    assert.equal(response.status, 200, "trusted DSH tarball download failed");
    const bytes = Buffer.from(await response.arrayBuffer());
    const digests = verifySha512Integrity(bytes, policy.integrity);
    const tarball = join(destination, "dsh.tgz");
    writeFileSync(tarball, bytes, { flag: "wx", mode: 0o600 });
    const receipt = { outcome: "VERIFIED", packageVersion, dshVersion: policy.runtimeVersion, url, ...digests, tarball };
    writeFileSync(join(destination, "receipt.json"), `${JSON.stringify(receipt)}\n`, { flag: "wx", mode: 0o600 });
    assert.deepEqual(readdirSync(destination).sort(), ["dsh.tgz", "receipt.json"]);
    assert.equal(lstatSync(tarball).isFile(), true);
    assert.deepEqual(verifySha512Integrity(readFileSync(tarball), policy.integrity), digests);
    complete = true;
    return receipt;
  } finally {
    if (!complete && existsSync(destination)) rmSync(destination, { recursive: true, force: false });
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { version: { type: "string" }, destination: { type: "string" } } });
  assert.ok(values.version && values.destination, "--version and --destination are required");
  console.log(JSON.stringify(await prepareDshRuntimeInput({ packageVersion: values.version, destination: resolve(values.destination) })));
}
