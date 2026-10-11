import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
// @ts-expect-error Source-only SDK transport is deliberately not published.
import { extractRuntimeSdk, SOURCE_SDK_INPUTS } from "../scripts/extract-runtime-sdk.mjs";

test("native source SDK transport copies exact existing runtime bytes, never starts or installs, and cleans only its own container", () => {
  const root = mkdtempSync(join(tmpdir(), "dsmm-source-sdk-test-"));
  const image = `sha256:${"a".repeat(64)}`, container = "b".repeat(64);
  try {
    const createSdk = (directory: string, version = "0.2.0-rc.2") => {
      mkdirSync(directory); writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "@deepseek-ai/dsh", version }));
      for (const name of SOURCE_SDK_INPUTS) {
        const module = join(directory, "node_modules", "@deepseek-ai", `dsh-${name}`);
        mkdirSync(module, { recursive: true }); writeFileSync(join(module, "package.json"), JSON.stringify({ name: `@deepseek-ai/dsh-${name}`, main: "index.js" }));
        writeFileSync(join(module, "index.js"), "// Synthetic input resolver fixture, never imported.\n");
      }
    };
    const calls: string[][] = [], destination = join(root, "sdk");
    const execute = (args: string[]) => { calls.push(args); if (args[0] === "create") return container; if (args[0] === "cp") createSdk(args[2]); return ""; };
    const result = extractRuntimeSdk({ image, destination }, execute);
    assert.equal(result.manifest, join(destination, "dsh", "package.json")); assert.equal(result.sourceOnly, true);
    assert.deepEqual(calls, [["create", "--pull=never", "--network", "none", image], ["cp", `${container}:/usr/local/lib/node_modules/@deepseek-ai/dsh`, join(destination, "dsh")], ["rm", container]]);
    assert.throws(() => extractRuntimeSdk({ image, destination }, execute));
    assert.throws(() => extractRuntimeSdk({ image: "untrusted:latest", destination: join(root, "tag-refused") }, execute));
    const mismatched: string[][] = [];
    assert.throws(() => extractRuntimeSdk({ image, destination: join(root, "wrong-version") }, (args: string[]) => {
      mismatched.push(args); if (args[0] === "create") return container; if (args[0] === "cp") createSdk(args[2], "0.2.1"); return "";
    }));
    assert.deepEqual(mismatched.at(-1), ["rm", container]);
    const primary = Error("copy failed"), cleanup = Error("cleanup failed");
    assert.throws(() => extractRuntimeSdk({ image, destination: join(root, "both-failed") }, (args: string[]) => {
      if (args[0] === "create") return container; if (args[0] === "cp") throw primary; throw cleanup;
    }), (error: any) => error instanceof AggregateError && error.errors[0] === primary && error.errors[1] === cleanup);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
