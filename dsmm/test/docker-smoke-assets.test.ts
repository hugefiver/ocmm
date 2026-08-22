import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("Docker smoke assets are documented and isolated", () => {
  const dockerfile = join(packageRoot, "docker", "Dockerfile.smoke");
  const script = join(packageRoot, "scripts", "docker-smoke.mjs");
  const localPlan = join(packageRoot, "docs", "implementation-plan-v0.1.md");
  const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
  const dockerfileText = readFileSync(dockerfile, "utf8");
  const scriptText = readFileSync(script, "utf8");

  assert.equal(existsSync(dockerfile), true);
  assert.equal(existsSync(script), true);
  assert.equal(existsSync(localPlan), true);
  assert.match(dockerfileText, /FROM node:22-bookworm-slim/);
  assert.match(dockerfileText, /ARG DSH_PACKAGE=@deepseek-ai\/dsh@latest/);
  assert.match(dockerfileText, /COPY dsmm \.\/dsmm/);
  assert.match(dockerfileText, /ENV npm_config_auto_install_peers=false/);
  assert.match(dockerfileText, /corepack enable/);
  assert.match(dockerfileText, /autoInstallPeers: false/);
  assert.match(dockerfileText, /pnpm run build/);
  assert.match(dockerfileText, /npm install -g \$\{DSH_PACKAGE\}/);
  assert.match(dockerfileText, /ENV DSH_HOME=\/tmp\/dsmm-dsh-home/);
  assert.match(dockerfileText, /ENV DSMM_DOCKER_INNER=1/);
  assert.match(dockerfileText, /CMD \["node", "dsmm\/scripts\/docker-smoke\.mjs"\]/);
  assert.match(scriptText, /fileURLToPath\(new URL\("\.\.", import\.meta\.url\)\)/);
  assert.match(scriptText, /DSMM_DOCKER_INNER/);
  assert.match(scriptText, /spawnSync\("docker"/);
  assert.match(scriptText, /"plugin", "--profile", "dsmm-smoke", "add"/);
  assert.match(scriptText, /--dump-config/);
  assert.match(scriptText, /id: dsmm/);
  assert.match(readme, /pnpm --filter dsmm smoke:docker/);
});
