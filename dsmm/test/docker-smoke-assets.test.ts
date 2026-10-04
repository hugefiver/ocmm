import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("Docker cleanup preserves the primary failure and all cleanup failures", async () => {
  const { throwAfterCleanup } = await import(pathToFileURL(join(packageRoot, "scripts", "docker-cleanup-errors.mjs")).href);
  assert.doesNotThrow(() => throwAfterCleanup(undefined, [], "cleanup failed"));
  const primary = new Error("primary");
  const cleanup = new Error("cleanup");
  assert.throws(() => throwAfterCleanup(primary, [], "cleanup failed"), (error) => error === primary);
  assert.throws(() => throwAfterCleanup(undefined, [cleanup], "cleanup failed"), (error) => error instanceof AggregateError && error.errors[0] === cleanup);
  assert.throws(() => throwAfterCleanup(primary, [cleanup], "cleanup failed"), (error) =>
    error instanceof AggregateError && error.cause === primary && error.errors[0] === primary && error.errors[1] === cleanup);
});

test("Docker builds pinned latest DSH and an actual native ocmm-lsp binary", () => {
  const dockerfile = readFileSync(join(packageRoot, "docker", "Dockerfile.smoke"), "utf8");
  const dockerignore = readFileSync(join(packageRoot, "docker", "Dockerfile.smoke.dockerignore"), "utf8");
  const smoke = readFileSync(join(packageRoot, "scripts", "docker-smoke.mjs"), "utf8");
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  assert.match(dockerfile, /^FROM rust:.* AS lsp-builder$/mu);
  assert.match(dockerfile, /cargo build --release -p ocmm-lsp/u);
  assert.match(dockerfile, /COPY --from=lsp-builder .*\/ocmm-lsp \/usr\/local\/bin\/ocmm-lsp/u);
  assert.match(dockerfile, /^FROM node:22-bookworm-slim$/mu);
  assert.match(dockerfile, /ARG DSH_PACKAGE=@deepseek-ai\/dsh@0\.2\.0-rc\.2/u);
  assert.match(dockerfile, /npm install -g \$\{DSH_PACKAGE\}/u);
  assert.match(dockerfile, /COPY dsmm \.\/dsmm/u);
  assert.match(dockerfile, /^COPY LICENSE \.\/LICENSE$/mu);
  assert.match(dockerfile, /corepack enable/u);
  assert.match(dockerfile, /corepack prepare pnpm@12\.8\.1 --activate/u);
  assert.doesNotMatch(dockerfile, /pnpm@11\.9\.0/u);
  assert.match(dockerfile, /autoInstallPeers: true/u);
  assert.match(dockerfile, /ENV DSMM_DOCKER_INNER=1/u);
  assert.match(dockerfile, /CMD \["node", "dsmm\/scripts\/docker-smoke\.mjs"\]/u);
  assert.match(dockerignore, /^\*$/mu);
  assert.match(dockerignore, /^!crates\/ocmm-lsp\/\*\*$/mu);
  assert.match(dockerignore, /^!dsmm\/\*\*$/mu);
  assert.match(dockerignore, /^dsmm\/node_modules\/\*\*$/mu);
  assert.equal(pkg.scripts["smoke:docker:build"].includes("@deepseek-ai/dsh@0.2.0-rc.2"), true);
  assert.doesNotMatch(smoke + dockerfile, /@deepseek-ai\/dsh@latest|DSH_PACKAGE=@deepseek-ai\/dsh@0\.1\.1-rc\.2/u);
});

test("packed profile lifecycle remains isolated, reversible, and release-checked", () => {
  const smoke = readFileSync(join(packageRoot, "scripts", "docker-smoke.mjs"), "utf8");
  const ordered = [
    '"pack", "--pack-destination", workspace',
    '"plugin", "--profile", PROFILE, "add", tarball',
    '"plugin", "--profile", PROFILE, "list"',
    '"plugin", "--profile", PROFILE, "remove", "dsmm"',
    '"plugin", "--profile", PROFILE, "add", tarball'
  ];
  let offset = 0;
  for (const step of ordered) {
    const next = smoke.indexOf(step, offset);
    assert.ok(next >= offset, `missing packed lifecycle step: ${step}`);
    offset = next + step.length;
  }
  assert.match(smoke, /const PROFILE = "dsmm-v1-smoke"/u);
  assert.match(smoke, /"--from-default-profile", "headless", "--dump-config"/u);
  assert.match(smoke, /assertInstalled\(profilePackage, false\)/u);
  assert.match(smoke, /stdio: \["ignore", "pipe", "pipe"\]/u);
  assert.match(smoke, /args\.includes\("remove"\) \? 90_000 : 300_000/u);
  assert.match(smoke, /result\.error\?\.code === "ETIMEDOUT"/u);
  assert.match(smoke, /assertInstalled\(profilePackage, true\)/u);
  assert.match(smoke, /assertInstalled\(profilePackage, false\)/u);
  assert.equal(smoke.split("assertDump(env, true)").length - 1, 2);
  assert.match(smoke, /assertPackedExports\(profilePackage, home\)/u);
  assert.match(smoke, /profileRequire\.resolve\(`@deepseek-ai\/\$\{name\}`\)/u);
  assert.match(smoke, /join\(root, "scripts", "check-release-readiness\.mjs"\)/u);
  assert.match(smoke, /receipt\.outcome !== "ready" \|\| receipt\.forbiddenSurfaceCount !== 0/u);
  assert.match(smoke, /const globalPatch = join\(home, "cordis\.patch\.yml"\)/u);
  assert.match(smoke, /const siblingPackage = join\(siblingDir, "package\.json"\)/u);
  assert.match(smoke, /const siblingPatch = join\(siblingDir, "cordis\.patch\.yml"\)/u);
  assert.equal(smoke.split("assertSentinels(sentinels, snapshots)").length - 1, 3);
  assert.match(smoke, /DSMM_PACKAGED_RUNTIME_SMOKE_OK/u);
  assert.match(smoke, /rmSync\(dir, \{ recursive: true, force: true, maxRetries: 5/u);
  assert.match(smoke, /throwAfterCleanup\(primaryError, cleanupErrors/u);
  assert.match(smoke, /randomUUID\(\)/u);
  assert.deepEqual([...smoke.matchAll(/spawnSync\("docker", \["image", "rm", ([^\]]+)\]/gu)].map((match) => match[1]), ["imageTag"]);
  assert.doesNotMatch(smoke, /spawnSync\("docker", \["(?:stop|kill|image", "prune)"/u);
});

test("latest runtime smoke covers each behavior domain and refuses headless preset-discovery inference", () => {
  const smoke = readFileSync(join(packageRoot, "scripts", "docker-smoke.mjs"), "utf8");
  for (const domain of [
    "MODEL_ROUTING", "RUNTIME_RECOVERY", "STATUS_COMMAND", "CORE_PROMPT_SKILLS", "SAFETY_GUARDS", "NATIVE_ROLE_COMPOSITION", "NATIVE_HOST_CONTRACT", "ROLE_SUBAGENTS", "NATIVE_PRESET_SECURITY"
  ]) assert.ok(smoke.includes(`"${domain}"`), `${domain} is part of the Docker runtime gate`);
  for (const file of [
    "native-model-routing.test.ts", "runtime-recovery.test.ts", "status.test.ts", "mode.test.ts", "skills.test.ts",
    "prompts.test.ts", "guards.test.ts", "preset-registry.test.ts", "roles.test.ts", "native-runtime-contract.test.ts", "role-subagents.test.ts", "native-preset-security.test.ts"
  ]) assert.ok(smoke.includes(file), `${file} runs in the pinned container`);
  assert.match(smoke, /DSMM_LSP_DIAGNOSTIC_FORMAT_OK/u);
  assert.match(smoke, /lsp-mcp-smoke\.mjs/u);
  assert.match(smoke, /mcp__|publicLspToolName\("diagnostics"\)/u);
  assert.match(smoke, /publicLspToolName\("format"\)/u);
  assert.match(smoke, /ctx\.tools\.execute\(/u);
  assert.match(smoke, /readFileSync\(fixture\.subject, "utf8"\)/u);
  assert.doesNotMatch(smoke, /dsh-agent-presets|roots:|includeUserRoot:|headless.*composedPreset/iu);
  assert.doesNotMatch(smoke, /(?:OPENAI|ANTHROPIC|DEEPSEEK|GOOGLE)_API_KEY|NPM_TOKEN|Authorization:\s*Bearer|sk-[A-Za-z0-9]/u);
  for (const asset of ["lsp-mcp-smoke.mjs", "lsp-smoke-fixture.mjs", "check-release-readiness.mjs", "docker-cleanup-errors.mjs"]) {
    assert.equal(existsSync(join(packageRoot, "scripts", asset)), true);
  }
});
