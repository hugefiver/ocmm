import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sha256 = "8aa093408b7831defdbe780e73a82c05ee75a270aada3e5700d1f1f6cf815a4c";

export async function verifyPublishedLegacyArtifact(path) {
  const bytes = await readFile(path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), sha256);
  const manifest = spawnSync("tar", ["-xOf", path, "package/package.json"], { encoding: "utf8" });
  assert.equal(manifest.error, undefined);
  assert.equal(manifest.status, 0, manifest.stderr);
  const metadata = JSON.parse(manifest.stdout);
  assert.equal(metadata.name, "@dsmm/dsmm");
  assert.equal(metadata.version, "0.2.0");
  return { artifact: resolve(path), name: metadata.name, version: metadata.version, sha256, bytes: bytes.length };
}

export async function downloadPublishedLegacyArtifact(path) {
  const response = await fetch("https://registry.npmjs.org/@dsmm%2fdsmm/0.2.0", { redirect: "error" });
  assert.equal(response.ok, true);
  const metadata = await response.json();
  assert.equal(metadata.name, "@dsmm/dsmm");
  assert.equal(metadata.version, "0.2.0");
  assert.equal(metadata.dist.tarball, "https://registry.npmjs.org/@dsmm/dsmm/-/dsmm-0.2.0.tgz");
  assert.match(metadata.dist.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/u);
  const archive = await fetch(metadata.dist.tarball, { redirect: "error" });
  assert.equal(archive.ok, true);
  const bytes = Buffer.from(await archive.arrayBuffer());
  assert.equal(`sha512-${createHash("sha512").update(bytes).digest("base64")}`, metadata.dist.integrity);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), sha256);
  await writeFile(path, bytes, { flag: "wx" });
  return { ...await verifyPublishedLegacyArtifact(path), integrity: metadata.dist.integrity, registry: "https://registry.npmjs.org/" };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [phase, path] = process.argv.slice(2);
  assert.equal(phase, "download-artifact");
  assert.ok(path);
  console.log(JSON.stringify(await downloadPublishedLegacyArtifact(path)));
}
