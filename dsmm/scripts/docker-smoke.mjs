import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const home = process.env.DSH_HOME || mkdtempSync(join(tmpdir(), "dsmm-dsh-"));
const patch = join(root, "cordis.patch.yml");

function requireSuccess(result, description) {
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error(`${description} failed with status ${String(result.status)}`);
}

if (!existsSync(patch)) throw new Error(`missing ${patch}`);
if (!readFileSync(patch, "utf8").includes("id: dsmm")) throw new Error("cordis patch does not register dsmm");

if (process.env.DSMM_DOCKER_INNER !== "1") {
  const build = spawnSync("docker", [
    "build",
    "--build-arg",
    "DSH_PACKAGE=@deepseek-ai/dsh@latest",
    "-f",
    "docker/Dockerfile.smoke",
    "-t",
    "dsmm-dsh-smoke:0.1",
    ".."
  ], { cwd: root, stdio: "inherit" });
  requireSuccess(build, "docker build");

  const run = spawnSync("docker", ["run", "--rm", "dsmm-dsh-smoke:0.1"], { stdio: "inherit" });
  requireSuccess(run, "docker run");
  process.exit(0);
}

const install = spawnSync("dsh", ["plugin", "--profile", "dsmm-smoke", "add", root], {
  env: { ...process.env, DSH_HOME: home },
  stdio: "inherit"
});
requireSuccess(install, "dsh plugin add");

const dump = spawnSync("dsh", ["--profile", "dsmm-smoke", "--dump-config"], {
  env: { ...process.env, DSH_HOME: home },
  encoding: "utf8"
});
requireSuccess(dump, "dsh --dump-config");
if (!dump.stdout.includes("id: dsmm")) throw new Error("dumped dsh config did not include dsmm row");
