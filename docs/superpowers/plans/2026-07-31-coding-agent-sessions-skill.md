# Coding-Agent-Sessions Shared Skill Port Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the pinned upstream `coding-agent-sessions` skill into ocmm, prove its finder only against isolated synthetic stores, and distribute a license-complete runtime-only Codex/npm form without changing v1 injection or any release, schema, routing, model, category, dependency, or version surface.

**Architecture:** Keep the 33 upstream files byte-identical in `skills/coding-agent-sessions/`, add only the exact upstream license and a local modification notice, and rely on existing top-level shared-skill discovery. Add a generic `.npmignore`-marker copy boundary to Codex generation, preserve whole-tree copying for unmarked skills, and prove source, CLI, generated, and packed inventories with deterministic Node/Python fixtures.

**Tech Stack:** TypeScript 6 ESM, Node 22+ `node:test`, Node `spawnSync`, Python 3.11.2 standard library (`sqlite3`, no pytest dependency), pnpm 11.9.0, OpenCode debug CLI, PowerShell 7, Git read-only gates until the final parent boundary.

**Global Constraints:**
- Baseline HEAD is `d202e7b030fa005df82065a370e3a372a63af310`; every implementation task before the final parent boundary is a non-Git checkpoint.
- The user delegated design/plan approval and authorized one parent-owned final commit only after the complete feature and all acceptance gates pass.
- No implementation subagent may stage, commit, push, tag, or otherwise write Git state.
- No software installation or download is permitted; do not invoke `uv` to obtain pytest and do not add a dependency.
- Python runtime is 3.11 or later and standard-library-only; local Python is 3.11.2, pytest is currently absent, and the six upstream pytest files with 35 test functions remain retained source.
- Source is pinned to ignored checkout `omo@f2872273d6866026a2262315e54dbf21760154d3`; initial commit is `dff394666c766a1e683e71f4d68a2f6b66986eea`; Aside commits are `f2a1d761b93c4e75e7a1aec20a0a97c51667f645`, `aaaba202bcf2cd8ed84020f9dda31ef7ab309cc2`, and `cb8d15136bb395af7368cc8ce2528f12ac277c5e`.
- Preserve all 33 upstream files byte-for-byte; add exactly `LICENSE-UPSTREAM.md` and `NOTICE.md` to the source skill subtree, for 35 source files total.
- `LICENSE-UPSTREAM.md` is an exact byte copy of `omo/LICENSE.md`; the imported subtree remains under Sustainable Use License 1.0 and unrelated ocmm code remains under the root AAAPL.
- Never default-scan a real home, application-data, Codex, OpenCode, or XDG store; every finder invocation supplies an explicit temporary `--root` and `--platform`.
- Every relevant child process sanitizes `HOME`, `USERPROFILE`, `APPDATA`, all four XDG roots, `CODEX_HOME`, `OPENCODE_HOME`, `OPENCODE_CONFIG`, and `OPENCODE_CONFIG_DIR`, removes `OPENCODE_CONFIG_CONTENT`, and removes credential-shaped environment variables case-insensitively.
- Treat `OPENCODE_CONFIG_CONTENT` and `OPENCODE_CONFIG_DIR` as independent OpenCode configuration-precedence escape routes: the former must be absent and the latter must resolve beneath the active temporary sandbox before any `opencode debug` command starts.
- Do not run `opencode run`, Codex, a provider command, a network service, a model request, or any subjective LLM A/B evaluation.
- Objective standard-library fixture evaluation replaces the skill-creator LLM/baseline/viewer loop; do not create `evals/`, an evaluation workspace, benchmark files, or viewer output.
- The Codex runtime filter activates only for a skill source containing `.npmignore`; it excludes `.gitignore`, `.npmignore`, `pyrightconfig.json`, `scripts/tests/**`, `__pycache__`, `.mypy_cache`, `.pytest_cache`, `.ruff_cache`, and `*.py[cod]`.
- Treat `.npmignore` as a source/runtime marker only when its normalized rules declare `.gitignore`, `pyrightconfig.json`, `scripts/tests/`, and `*.py[cod]`; the existing `skills/frontend/.npmignore` is a packaging-only materialization marker and its generated tree must remain unchanged.
- The runtime filter retains `SKILL.md`, `agents/**`, `references/**`, `scripts/find-agent-sessions.py`, `scripts/agent_sessions/**`, `LICENSE-UPSTREAM.md`, and `NOTICE.md`; unmarked skills retain whole-tree copy behavior.
- Regenerate `plugins/deepwork` only through `pnpm run gen:codex-plugin`; never hand-edit generated files and never delete existing generated skill content as a side effect.
- Add no `skills/v1/`, `prompts/v1/`, prompt, config-schema, agent, model, routing, category, version, dependency, release-workflow, or release-checker change.
- Do not change `.github/workflows/release.yml` unless an actual RED contract proves it necessary; this plan contains no such change.

---

## File Map

### Create

- `skills/coding-agent-sessions/` — complete 33-file upstream source plus two legal/provenance files.
- `skills/coding-agent-sessions/LICENSE-UPSTREAM.md` — exact bytes from `omo/LICENSE.md`.
- `skills/coding-agent-sessions/NOTICE.md` — source revision, initial/Aside commits, copyright, modified-distribution notice, and license boundary.
- `src/coding-agent-sessions.test.ts` — immutable source/hash/legal contract, no-install compile checks, sanitized Node-to-Python fixtures, alias/output coverage, and no-real-home guards.
- `plugins/deepwork/skills/coding-agent-sessions/` — generated 26-file runtime/legal tree; only generated `SKILL.md` differs from source by the existing Codex compatibility/callable-dispatch suffix.
- `docs/superpowers/plans/2026-07-31-coding-agent-sessions-skill.md` — this execution plan; included in the final parent-owned commit.

### Modify

- `src/intent/skill-loader.test.ts` — real top-level discovery, slash-command, frontmatter/reference-link, and v1 exclusion contract.
- `src/codex/plugin-generator.ts` — generic `.npmignore`-marker runtime-copy filter next to `copySkillDirectory`.
- `src/codex/plugin-generator.test.ts` — complete/incomplete normalized marker-signature fixtures, marked runtime inventory, retained/excluded files, generated suffix, determinism, and unchanged frontend/ast-grep behavior.
- `src/release-package.test.ts` — sanitized actual `pnpm pack --dry-run --json` equality against the exact canonical 26-file inventories without publishing.
- `README.md` — shared-skill tree/list and safe explicit-root, explicit-platform usage.
- `docs/v1-maintenance.md` — upstream revision/commits, license boundary, source/runtime distinction, discovery, and Codex/npm provenance.

### Read but do not modify

- `docs/superpowers/specs/2026-07-31-coding-agent-sessions-skill-design.md` — approved specification; include unchanged in the final parent-owned commit.
- `src/intent/skill-loader.ts` — existing `loadSharedSkills`, `buildSkillCommand`, `V1_INJECTED_SKILLS`, and `V1_COMMAND_SKILLS`; no production loader change is needed.
- `scripts/normalize-ocmm-package.ts`, `package.json`, `.github/workflows/release.yml`, and `schema.json` — inspect/verify only.
- `omo/packages/shared-skills/skills/coding-agent-sessions/**` and `omo/LICENSE.md` — authoritative ignored upstream bytes.

## Exact Source Manifest

The copy has these 33 upstream-relative files, no more and no fewer, before the two legal files are added:

```text
.gitignore
.npmignore
SKILL.md
agents/openai.yaml
pyrightconfig.json
references/all-platforms.md
references/claude.md
references/codex.md
references/opencode.md
references/senpi.md
scripts/agent_sessions/__init__.py
scripts/agent_sessions/aside_scanner.py
scripts/agent_sessions/claude.py
scripts/agent_sessions/cli.py
scripts/agent_sessions/codex.py
scripts/agent_sessions/file_scanners.py
scripts/agent_sessions/jsonio.py
scripts/agent_sessions/kiro_scanner.py
scripts/agent_sessions/opencode.py
scripts/agent_sessions/pi_family.py
scripts/agent_sessions/scanners.py
scripts/agent_sessions/sqlite_optional_scanners.py
scripts/agent_sessions/sqlite_scanners.py
scripts/agent_sessions/timeparse.py
scripts/agent_sessions/transcript.py
scripts/agent_sessions/types.py
scripts/find-agent-sessions.py
scripts/tests/test_agent_sessions.py
scripts/tests/test_aside_scanner.py
scripts/tests/test_cli_contract.py
scripts/tests/test_extended_scanners.py
scripts/tests/test_optional_sqlite_scanners.py
scripts/tests/test_pi_family_scanners.py
```

The 26-file generated runtime inventory is `SKILL.md`, `agents/openai.yaml`, all five references, the finder, all 16 production modules, `LICENSE-UPSTREAM.md`, and `NOTICE.md`.

### Task 1: Port and lock the authoritative source, license, notice, and Python syntax

**Files:**
- Create: `skills/coding-agent-sessions/**` (the exact 35-file source inventory)
- Create: `src/coding-agent-sessions.test.ts`
- Read: `omo/packages/shared-skills/skills/coding-agent-sessions/**`
- Read: `omo/LICENSE.md`

**Interfaces:**
- Consumes: ignored upstream checkout at exact revision `f2872273d6866026a2262315e54dbf21760154d3` and Python executable `python` version 3.11.2.
- Produces: `UPSTREAM_SHA256: Readonly<Record<string, string>>`, `SOURCE_SKILL_ROOT`, `FINDER`, `assertSandboxedChildEnv(sandbox: string, env: NodeJS.ProcessEnv): void`, and `sanitizedChildEnv(sandbox: string, base?: NodeJS.ProcessEnv): NodeJS.ProcessEnv` in `src/coding-agent-sessions.test.ts`; exact 35-file source tree for Tasks 2-4.

- [ ] **Step 1: Verify the ignored checkout, provenance commits, license, and exact upstream inventory without writing Git state**

Run from repository root:

```powershell
git rev-parse HEAD
git -C "omo" rev-parse HEAD
git -C "omo" log --format='%H %s' -1 dff394666c766a1e683e71f4d68a2f6b66986eea
git -C "omo" log --format='%H %s' -1 f2a1d761b93c4e75e7a1aec20a0a97c51667f645
git -C "omo" log --format='%H %s' -1 aaaba202bcf2cd8ed84020f9dda31ef7ab309cc2
git -C "omo" log --format='%H %s' -1 cb8d15136bb395af7368cc8ce2528f12ac277c5e
git -C "omo" ls-tree -r --name-only f2872273d6866026a2262315e54dbf21760154d3 -- "packages/shared-skills/skills/coding-agent-sessions"
```

Expected: root HEAD is `d202e7b030fa005df82065a370e3a372a63af310`; ignored checkout HEAD is `f2872273d6866026a2262315e54dbf21760154d3`; commit subjects exactly match the approved spec; `ls-tree` emits the 33 paths in the Exact Source Manifest.

- [ ] **Step 2: Write the RED source, hash, license, notice, retained-test, and in-memory compile contract**

Create `src/coding-agent-sessions.test.ts` with Node built-ins only. The committed hash map must contain these exact SHA-256 values (computed from the pinned checkout), and `NOTICE_TEXT` is the exact local notice body to write in Step 4:

```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join, relative } from "node:path"
import { spawnSync } from "node:child_process"

const SOURCE_SKILL_ROOT = join(process.cwd(), "skills", "coding-agent-sessions")
const FINDER = join(SOURCE_SKILL_ROOT, "scripts", "find-agent-sessions.py")
const UPSTREAM_LICENSE_SHA256 = "b61ac928f152d13517328263e6bee9175b928f9ab696a2d2ca2b6cfd961ddc32"
const UPSTREAM_SHA256: Readonly<Record<string, string>> = {
  ".gitignore": "a7279f1e3541835bbcbce42791210e0829eae00d3597e4c91b6ffc74863f78a6",
  ".npmignore": "c97d9bc630afec0c407f6fb4ee122a031f63516419d15a26f602bedc4c47e594",
  "SKILL.md": "c60bc47a3108a6682ee687ad83850076a25e613cb25194fd401f11975e469035",
  "agents/openai.yaml": "29eb958fa13f5a2d7c4b9eef23cc6009ed48f3fcaf930f5189e68c3357868ee1",
  "pyrightconfig.json": "d0ea39475b86bbc7b9f742e12fe2f7e42c71fb92539f71f31590001c93e11983",
  "references/all-platforms.md": "bb0dfa72fe060b6a3bfb46f246f1cd31a472ae6cf67c528bb726623f00c37cd8",
  "references/claude.md": "46bf09894224e25ccbea950f7d96dde0205958547011d870fcf4e42f12cf0156",
  "references/codex.md": "23d43c81556182d7faa9a6eb96a553fca6fd55005c1b2a8bcd0110c7ff100f2e",
  "references/opencode.md": "60528f9e7eb8eb3f385941c72221447eb8e0f476e0c0a4313b7b594eff6e36a7",
  "references/senpi.md": "aab9b9544c51e515e1a6fa9dd57a9523d6b1ad15194782fb73ba9d794c184fbb",
  "scripts/agent_sessions/__init__.py": "5384bfdb2df380b6557cc7a71d16891415bccaa87699406e236f752c6415389f",
  "scripts/agent_sessions/aside_scanner.py": "5f8569c83682b85c3a654d9e042ebc77f8d111f29465ba335537acfdf1a90a54",
  "scripts/agent_sessions/claude.py": "71eaafa18752ab93aa3ee731f6cff501ce97bfa58589912c923511097a1c96a2",
  "scripts/agent_sessions/cli.py": "34142c2430e20ade47559e9b48ebe192f9717994972749911e2a2b5a6ae0d0c3",
  "scripts/agent_sessions/codex.py": "b71613b07cc03fdc043d43aa9ba3910bb523fcb60908061eb4900c115a76793a",
  "scripts/agent_sessions/file_scanners.py": "cf496ddf6e0696c6613afb708c948f1b464acebd43db804ffa4342922343520d",
  "scripts/agent_sessions/jsonio.py": "ac944438ccae9d732065a303a2263211659d27ba6256292a573f51a58b6f2ad4",
  "scripts/agent_sessions/kiro_scanner.py": "45003791d9845d61abc6927c4fdad923850a5c4c3cfd47b565ae235e9bd6949a",
  "scripts/agent_sessions/opencode.py": "690edd01415cbc87e92fd4f3a4e344ce63cfcec5ba814f6fcc36baa595194c84",
  "scripts/agent_sessions/pi_family.py": "78940f0a00ad552582b2db5f24d6d9bd25a71bfc27d0e3336164ebe41599d77e",
  "scripts/agent_sessions/scanners.py": "c75fcaf2f8831cefbe211a46c7e88a56d25f2647f14d8242f8e1f76681b6e0df",
  "scripts/agent_sessions/sqlite_optional_scanners.py": "9905a6e1c1a961e105f1b149649274b867a0ad16ba41caae35a84b73c459123e",
  "scripts/agent_sessions/sqlite_scanners.py": "5e4c276684f3c0fe2d3d56d9b4ec3936114f10812061b22b327270533b759759",
  "scripts/agent_sessions/timeparse.py": "a206e8fe38b7c247e1e62d7a9c2357bb84c60b681a3ea1ae7c81af032fd2d4b4",
  "scripts/agent_sessions/transcript.py": "9912c277ff4c723fe7882f0dcb953c51cf05892347dc6878aa708ed7440ecc92",
  "scripts/agent_sessions/types.py": "050410f1f9ff6697274ecee9ccebff141c31b0eff1364e1ac3c5da0724b22f8c",
  "scripts/find-agent-sessions.py": "ee7b58fbf028cca4f2462458cde61abe0a0b16a711c63eda325e78c2c5f51c92",
  "scripts/tests/test_agent_sessions.py": "0bc0ab88b1dbe01f20b813d028d403ebf4fb288c7b5c2b1c6c0fc29fea95098d",
  "scripts/tests/test_aside_scanner.py": "c6bb1fe79044cff1973aa6d3865373bac42c055be1569f5450c3aa109c33b2cf",
  "scripts/tests/test_cli_contract.py": "c508650732d496779c2246748a0d98ec77022f6d1b02cfc706c61bb3db28f59c",
  "scripts/tests/test_extended_scanners.py": "980a90e16a7fa1fc8a256eee93a961f4b095ff7e183d795bdffaf38f7f1b9cd2",
  "scripts/tests/test_optional_sqlite_scanners.py": "779916758797b8f146f9d517a503f0b00e6b987a382dde8fabb08cc5a059d366",
  "scripts/tests/test_pi_family_scanners.py": "e3f74109e0c6164c369cdabbae3ebdb1bc3140ec8219bf32067c23c227790c84",
}
const NOTICE_TEXT = `# Coding Agent Sessions Upstream Notice

This subtree ports \`packages/shared-skills/skills/coding-agent-sessions/\` from \`code-yeongyu/oh-my-opencode\`, using the ignored local source path \`omo/packages/shared-skills/skills/coding-agent-sessions/\` pinned at revision \`f2872273d6866026a2262315e54dbf21760154d3\`.

Initial implementation: \`dff394666c766a1e683e71f4d68a2f6b66986eea\` (\`feat(shared-skills): add coding agent sessions\`). Aside support is included from \`f2a1d761b93c4e75e7a1aec20a0a97c51667f645\` (\`feat(shared-skills): add Aside browser-agent session scanner\`), \`aaaba202bcf2cd8ed84020f9dda31ef7ab309cc2\` (\`test(shared-skills): cover Aside scanner parsing and platform registration\`), and \`cb8d15136bb395af7368cc8ce2528f12ac277c5e\` (\`docs(shared-skills): document the Aside session store and linkage\`).

Copyright (c) Yeongyu Kim and contributors.

ocmm modified this distribution by porting the upstream source into its shared-skill tree and filtering development-only files from generated Codex and packed runtime distributions. Runtime and reference bodies remain byte-for-byte upstream.

License boundary: this \`skills/coding-agent-sessions/\` subtree remains licensed under the Sustainable Use License 1.0 reproduced in \`LICENSE-UPSTREAM.md\`. All other ocmm code remains under the root AAAPL; no imported file is relabeled as AAAPL.
`
const CREDENTIAL_ENV = /(?:^|_)(?:API_KEY|ACCESS_KEY|PRIVATE_KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?|AUTH(?:ORIZATION)?)(?:_|$)/i
const SANDBOX_ENV_KEYS = [
  "HOME", "USERPROFILE", "APPDATA", "XDG_CONFIG_HOME", "XDG_DATA_HOME",
  "XDG_STATE_HOME", "XDG_CACHE_HOME", "CODEX_HOME", "OPENCODE_HOME", "OPENCODE_CONFIG", "OPENCODE_CONFIG_DIR",
] as const

function listRelativeFiles(root: string): string[] {
  const visit = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(dir, entry.name)
    return entry.isDirectory() ? visit(absolute) : [relative(root, absolute).replaceAll("\\", "/")]
  })
  return visit(root).sort()
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function assertSandboxedChildEnv(sandbox: string, env: NodeJS.ProcessEnv): void {
  assert.equal(env.OPENCODE_CONFIG_CONTENT, undefined)
  for (const key of SANDBOX_ENV_KEYS) {
    const value = env[key]
    assert.ok(value, `${key} must be set`)
    const delta = relative(sandbox, value)
    assert.equal(delta === "" || (!delta.startsWith("..") && !isAbsolute(delta)), true, `${key} escaped sandbox`)
  }
}

function sanitizedChildEnv(sandbox: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(base)) {
    if (key !== "OPENCODE_CONFIG_CONTENT" && value !== undefined && !CREDENTIAL_ENV.test(key)) env[key] = value
  }
  for (const key of SANDBOX_ENV_KEYS) {
    const path = key === "OPENCODE_CONFIG" ? join(sandbox, "opencode.json") : join(sandbox, key.toLowerCase())
    mkdirSync(key === "OPENCODE_CONFIG" ? sandbox : path, { recursive: true })
    env[key] = path
  }
  const processTemp = join(sandbox, "process-temp")
  mkdirSync(processTemp, { recursive: true })
  env.TEMP = processTemp
  env.TMP = processTemp
  env.PYTHONDONTWRITEBYTECODE = "1"
  env.PYTHONNOUSERSITE = "1"
  delete env.OPENCODE_CONFIG_CONTENT
  assertSandboxedChildEnv(sandbox, env)
  return env
}

test("coding-agent-sessions source inventory and bytes match the pinned upstream manifest", () => {
  const expected = [...Object.keys(UPSTREAM_SHA256), "LICENSE-UPSTREAM.md", "NOTICE.md"].sort()
  assert.deepEqual(listRelativeFiles(SOURCE_SKILL_ROOT), expected)
  for (const [path, digest] of Object.entries(UPSTREAM_SHA256)) {
    assert.equal(sha256(join(SOURCE_SKILL_ROOT, path)), digest, path)
  }
})

test("coding-agent-sessions carries the exact upstream license and explicit modification boundary", () => {
  assert.equal(sha256(join(SOURCE_SKILL_ROOT, "LICENSE-UPSTREAM.md")), UPSTREAM_LICENSE_SHA256)
  assert.equal(readFileSync(join(SOURCE_SKILL_ROOT, "NOTICE.md"), "utf8"), NOTICE_TEXT)
})

test("coding-agent-sessions retains six pytest files and 35 tests while production Python compiles in memory", () => {
  const pytestFiles = Object.keys(UPSTREAM_SHA256).filter((path) => path.startsWith("scripts/tests/") && path.endsWith(".py"))
  assert.equal(pytestFiles.length, 6)
  const functionCount = pytestFiles.reduce((count, path) => count + (readFileSync(join(SOURCE_SKILL_ROOT, path), "utf8").match(/^def test_/gm)?.length ?? 0), 0)
  assert.equal(functionCount, 35)
  const production = Object.keys(UPSTREAM_SHA256).filter((path) => path === "scripts/find-agent-sessions.py" || (path.startsWith("scripts/agent_sessions/") && path.endsWith(".py")))
  assert.equal(production.length, 17)
  const sandbox = mkdtempSync(join(tmpdir(), "ocmm-agent-sessions-compile-"))
  try {
    const script = "import pathlib,sys\nfor raw in sys.argv[1:]:\n p=pathlib.Path(raw)\n compile(p.read_bytes(), str(p), 'exec', dont_inherit=True)\n"
    const result = spawnSync("python", ["-B", "-c", script, ...production.map((path) => join(SOURCE_SKILL_ROOT, path))], {
      env: sanitizedChildEnv(sandbox), encoding: "utf8", windowsHide: true,
    })
    assert.equal(result.status, 0, result.stderr)
    const env = sanitizedChildEnv(sandbox)
    const probe = spawnSync("python", ["-B", "-c", "import importlib.util; print('present' if importlib.util.find_spec('pytest') else 'absent')"], {
      env, encoding: "utf8", windowsHide: true,
    })
    assert.equal(probe.status, 0, probe.stderr)
    if (probe.stdout.trim() === "present") {
      const suite = spawnSync("python", ["-B", "-m", "pytest", join(SOURCE_SKILL_ROOT, "scripts", "tests"), "-q", "-p", "no:cacheprovider", "--basetemp", join(sandbox, "pytest-temp")], {
        cwd: SOURCE_SKILL_ROOT, env, encoding: "utf8", windowsHide: true,
      })
      assert.equal(suite.status, 0, suite.stderr || suite.stdout)
    } else {
      assert.equal(probe.stdout.trim(), "absent")
    }
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})
```

- [ ] **Step 3: Run the source contract and observe RED before the port exists**

Run:

```powershell
node --test --experimental-strip-types src/coding-agent-sessions.test.ts
```

Expected RED: the inventory test fails because `skills/coding-agent-sessions/` does not exist; no Python process scans any store.

- [ ] **Step 4: Copy the exact upstream tree and license, then write the exact notice**

Use Node byte-copy operations so hidden files are included and no source body is reserialized:

```powershell
node --input-type=module -e "import { cpSync, existsSync } from 'node:fs'; const source='omo/packages/shared-skills/skills/coding-agent-sessions'; const target='skills/coding-agent-sessions'; if(existsSync(target)) throw new Error('target already exists'); cpSync(source,target,{recursive:true,errorOnExist:true}); cpSync('omo/LICENSE.md',target+'/LICENSE-UPSTREAM.md',{errorOnExist:true});"
```

Write `skills/coding-agent-sessions/NOTICE.md` with the exact `NOTICE_TEXT` body from Step 2. Do not edit any copied upstream file.

- [ ] **Step 5: Run the source/hash/legal/compile contract and observe GREEN**

Run:

```powershell
node --test --experimental-strip-types src/coding-agent-sessions.test.ts
```

Expected GREEN: `3` tests pass; source inventory is exactly `35`; all 33 upstream hashes, the license hash, notice body, six-file/35-function pytest disposition, and 17-file in-memory Python compile pass; no `__pycache__` is created. With the stated absent pytest the suite is retained-not-executed; an already-present pytest is executed in the same sanitized sandbox without installation.

- [ ] **Step 6: Record the no-install pytest disposition**

Run:

```powershell
$pytest = python -c "import importlib.util; print('present' if importlib.util.find_spec('pytest') else 'absent')"
if ($pytest -eq 'present') {
  "EXECUTED_BY_NODE_GATE: 6 pytest files / 35 test functions in the sanitized sandbox; no install attempted"
} else {
  "RETAINED_NOT_EXECUTED: 6 pytest files / 35 test functions; pytest absent; no install attempted"
}
```

Expected in the stated environment: the explicit `RETAINED_NOT_EXECUTED` line. If pytest is already present at implementation time, the preceding Node gate executes all six files inside its sanitized sandbox and this step emits `EXECUTED_BY_NODE_GATE`. Do not invoke `uv`.

- [ ] **Step 7: Stop at a non-Git Task 1 checkpoint**

Run `git status --short` only. Expected: the approved spec/plan, `skills/coding-agent-sessions/**`, and `src/coding-agent-sessions.test.ts` are untracked or modified as expected; there is no staged entry and HEAD remains `d202e7b`.

### Task 2: Prove isolated CLI behavior and OpenCode shared-skill discovery

**Files:**
- Modify: `src/coding-agent-sessions.test.ts`
- Modify: `src/intent/skill-loader.test.ts`
- Read: `src/intent/skill-loader.ts`
- Read: copied upstream `scripts/agent_sessions/{cli,aside_scanner,opencode,scanners}.py`

**Interfaces:**
- Consumes: `sanitizedChildEnv`, `FINDER`, and the exact source tree from Task 1; existing `loadSharedSkills`, `buildSkillCommand`, `V1_INJECTED_SKILLS`, and `V1_COMMAND_SKILLS`.
- Produces: test-only `runPythonInline(sandbox: string, script: string, args: string[]): void`, `runFinder(sandbox: string, root: string, platform: string, args: string[]): JsonMap`, `runFinderFailure(sandbox: string, root: string, platform: string, args: string[]): { status: number; stderr: string }`, and deterministic Aside/Claude/OpenCode fixture builders; no product API and no evaluation workspace.

- [ ] **Step 1: Add RED loader and CLI contracts before defining the fixture runner**

In `src/intent/skill-loader.test.ts`, add `existsSync` to the `node:fs` import and add this real-tree contract:

```ts
test("shared coding-agent-sessions skill is discovered as a command outside v1 with valid references", () => {
  const skills = loadSharedSkills()
  const skill = skills.find((item) => item.name === "coding-agent-sessions")
  assert.ok(skill, "shared coding-agent-sessions skill must be discovered")
  assert.equal(relative(join(process.cwd(), "skills", "v1"), skill.path).startsWith(".."), true)
  assert.equal((V1_INJECTED_SKILLS as readonly string[]).includes(skill.name), false)
  assert.equal((V1_COMMAND_SKILLS as readonly string[]).includes(skill.name), false)

  const source = readFileSync(join(skill.path, "SKILL.md"), "utf8")
  assert.match(source, /^---\r?\nname: coding-agent-sessions\r?\ndescription: .+\r?\n---/)
  const references = [...new Set([...source.matchAll(/\]\((references\/[^)#\s]+\.md)(?:#[^)]*)?\)/g)].map((match) => match[1]))]
  assert.ok(references.length > 0)
  for (const reference of references) assert.equal(existsSync(join(skill.path, reference!)), true, reference)

  const command = buildSkillCommand(skill)
  assert.equal(command?.name, "coding-agent-sessions")
  assert.match(command?.description ?? "", /^\(ocmm - Skill\)/)
  assert.match(command?.template ?? "", /<skill-instruction>/)
  assert.match(command?.template ?? "", /<user-request>\n\$ARGUMENTS\n<\/user-request>/)
})
```

In `src/coding-agent-sessions.test.ts`, add four tests named exactly:

```ts
test("sanitized coding-agent child environments stay inside the sandbox and omit credential-shaped keys", () => {})
test("Aside CLI fixtures cover state.db joining, transcript fallback, and list/find/search/read/get aliases", () => {})
test("Claude file fixtures expose safe list/search/read output through explicit roots", () => {})
test("OpenCode storage fixtures preserve parent-child linkage without invoking opencode", () => {})
```

Fill the assertions now, calling `runFinder(...)` and `runPythonInline(...)`, but leave those two helpers undefined for the RED run. Use only safe fixture strings such as `ambassador benefits`, `fallback prompt`, `claude review notes`, and `explore docs`; never place a credential value in fixture content.

- [ ] **Step 2: Run the two-file contract and observe RED**

Run:

```powershell
node --test --experimental-strip-types src/coding-agent-sessions.test.ts src/intent/skill-loader.test.ts
```

Expected RED: CLI fixture tests fail with a `ReferenceError` for the intentionally undefined fixture/runner helpers such as `writeJsonl`, `runFinder`, or `runPythonInline`; existing source/hash tests and the new loader contract pass.

- [ ] **Step 3: Implement the sanitized runner and exact standard-library fixtures**

Add these test helpers and fixture shapes to `src/coding-agent-sessions.test.ts`:

```ts
type JsonMap = Record<string, unknown>

function parsePayload(stdout: string): JsonMap {
  const value: unknown = JSON.parse(stdout)
  assert.ok(value && typeof value === "object" && !Array.isArray(value))
  return value as JsonMap
}

function runPythonInline(sandbox: string, script: string, args: string[]): void {
  const result = spawnSync("python", ["-B", "-c", script, ...args], {
    env: sanitizedChildEnv(sandbox), encoding: "utf8", windowsHide: true,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, "")
}

function runFinder(sandbox: string, root: string, platform: string, args: string[]): JsonMap {
  const result = spawnSync("python", ["-B", FINDER, ...args, "--root", root, "--platform", platform], {
    cwd: SOURCE_SKILL_ROOT,
    env: sanitizedChildEnv(sandbox),
    encoding: "utf8",
    windowsHide: true,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(result.stdout, /api[_-]?key|bearer\s|password|credential/i)
  return parsePayload(result.stdout)
}

function runFinderFailure(sandbox: string, root: string, platform: string, args: string[]): { status: number; stderr: string } {
  const result = spawnSync("python", ["-B", FINDER, ...args, "--root", root, "--platform", platform], {
    cwd: SOURCE_SKILL_ROOT,
    env: sanitizedChildEnv(sandbox),
    encoding: "utf8",
    windowsHide: true,
  })
  assert.notEqual(result.status, 0)
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /bearer\s+[a-z0-9._-]{20,}|api[_-]?key\s*[:=]/i)
  return { status: result.status ?? -1, stderr: result.stderr }
}

const ASIDE_DB_SCRIPT = `
import sqlite3,sys
db,parent,child=sys.argv[1:4]
model='{"provider":"fixture-provider","modelId":"fixture-model"}'
with sqlite3.connect(db) as conn:
 conn.execute('CREATE TABLE sessions (id TEXT PRIMARY KEY, parent_id TEXT, title TEXT NOT NULL, cwd TEXT NOT NULL, model TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)')
 conn.executemany('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)', [
  (parent,None,'Ambassador research','C:/fixture/aside',model,1785295598,1785377046),
  (child,parent,'Check settings context','C:/fixture/aside',model,1785295600,1785295700),
 ])
`

function jsonMap(value: unknown): JsonMap {
  assert.ok(value && typeof value === "object" && !Array.isArray(value))
  return value as JsonMap
}

function rows(payload: JsonMap, key = "results"): JsonMap[] {
  const value = payload[key]
  assert.ok(Array.isArray(value))
  return value.map(jsonMap)
}

function writeJsonl(path: string, values: JsonMap[]): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`)
}

function writeJson(path: string, value: JsonMap): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value)}\n`)
}

test("sanitized coding-agent child environments stay inside the sandbox and omit credential-shaped keys", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "ocmm-agent-sessions-env-"))
  try {
    const env = sanitizedChildEnv(sandbox, {
      PATH: process.env.PATH,
      HOME: "C:/real-home-must-not-survive",
      OPENCODE_CONFIG_CONTENT: '{"plugin":["C:/escape/plugin.js"]}',
      OPENCODE_CONFIG_DIR: "C:/escape/opencode-config",
      OPENAI_API_KEY: "fixture-value",
      AWS_ACCESS_KEY_ID: "fixture-value",
      GITHUB_TOKEN: "fixture-value",
      SAFE_FIXTURE_FLAG: "retained",
    })
    assertSandboxedChildEnv(sandbox, env)
    assert.equal(env.OPENCODE_CONFIG_CONTENT, undefined)
    assert.equal(env.OPENCODE_CONFIG_DIR, join(sandbox, "opencode_config_dir"))
    assert.equal(env.OPENAI_API_KEY, undefined)
    assert.equal(env.AWS_ACCESS_KEY_ID, undefined)
    assert.equal(env.GITHUB_TOKEN, undefined)
    assert.equal(env.SAFE_FIXTURE_FLAG, "retained")
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test("Aside CLI fixtures cover state.db joining, transcript fallback, and list/find/search/read/get aliases", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "ocmm-agent-sessions-aside-"))
  try {
    const indexedRoot = join(sandbox, "aside-indexed")
    const mainTranscript = join(indexedRoot, "sessions", "2026-07-29_main1", "messages.jsonl")
    const childTranscript = join(indexedRoot, "sessions", "2026-07-29_child1", "messages.jsonl")
    writeJsonl(mainTranscript, [
      { role: "user", content: "find the ambassador benefits", timestamp: 1785295598204 },
      { role: "assistant", content: [{ type: "text", text: "fixture response" }], provider: "fixture-provider", model: "fixture-model", usage: { input: 5, output: 3, totalTokens: 8 }, timestamp: 1785295598449 },
      { role: "user", content: "summarize the benefits", timestamp: 1785295599000 },
    ])
    writeJsonl(childTranscript, [{ role: "user", content: "verify the settings context", timestamp: 1785295600000 }])
    runPythonInline(sandbox, ASIDE_DB_SCRIPT, [join(indexedRoot, "state.db"), "main1", "child1"])

    const listed = rows(runFinder(sandbox, indexedRoot, "aside", ["list"]))
    assert.deepEqual(listed.map((item) => item.id), ["main1"])
    assert.equal(listed[0]?.subagent_count, 1)
    assert.equal(listed[0]?.cwd, "C:/fixture/aside")
    assert.equal(listed[0]?.provider, "fixture-provider")
    assert.equal(listed[0]?.model, "fixture-model")
    assert.equal(listed[0]?.path, mainTranscript)

    const found = runFinder(sandbox, indexedRoot, "aside", ["find", "ambassador"])
    const searched = runFinder(sandbox, indexedRoot, "aside", ["search", "ambassador"])
    assert.deepEqual(found, searched)
    assert.equal(rows(found).length, 1)
    assert.equal(rows(rows(found)[0]!, "match_reasons")[0]?.query, "ambassador")
    const repeated = runFinder(sandbox, indexedRoot, "aside", ["search", "--query", "ambassador", "--query", "benefits", "--platform", "aside"])
    assert.deepEqual(rows(repeated, "queries").map((item) => item.query).sort(), ["ambassador", "benefits"])

    const read = runFinder(sandbox, indexedRoot, "aside", ["read", "main1"])
    const get = runFinder(sandbox, indexedRoot, "aside", ["get", "main1"])
    assert.deepEqual(read, get)
    const detail = rows(read)[0]!
    const prompts = jsonMap(detail.prompts)
    assert.equal(prompts.first_user_message, "find the ambassador benefits")
    assert.equal(prompts.last_user_message, "summarize the benefits")
    assert.ok(Array.isArray(detail.events))
    const children = detail.subagents as unknown[]
    assert.ok(Array.isArray(children))
    assert.equal(jsonMap(children[0]).parent_id, "main1")
    assert.equal(jsonMap(children[0]).agent, "Check settings context")

    const fallbackRoot = join(sandbox, "aside-fallback")
    const fallbackTranscript = join(fallbackRoot, "sessions", "2026-07-30_solo1", "messages.jsonl")
    mkdirSync(dirname(fallbackTranscript), { recursive: true })
    writeFileSync(fallbackTranscript, `{\n${JSON.stringify({ role: "user", content: "fallback prompt", timestamp: 1785295598204 })}\n${JSON.stringify({ role: "assistant", content: [{ type: "text", text: "fixture response" }], provider: "fixture-provider", model: "fixture-model", timestamp: 1785295598449 })}\n`)
    const fallback = rows(runFinder(sandbox, fallbackRoot, "aside", ["list"]))
    assert.equal(fallback[0]?.id, "solo1")
    assert.equal(fallback[0]?.path, fallbackTranscript)
    assert.equal(fallback[0]?.first_user_message, "fallback prompt")
    assert.deepEqual(rows(runFinder(sandbox, join(sandbox, "absent-root"), "aside", ["list"])), [])
    const invalid = runFinderFailure(sandbox, indexedRoot, "aside", ["search", "ambassador", "--platform", "aside,claude"])
    assert.match(invalid.stderr, /Use repeated --platform flags/)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test("Claude file fixtures expose safe list/search/read output through explicit roots", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "ocmm-agent-sessions-claude-"))
  try {
    const root = join(sandbox, "claude-export")
    const transcript = join(root, "transcripts", "claude-beta.jsonl")
    writeJsonl(transcript, [
      { sessionId: "claude-beta", type: "user", timestamp: "2026-06-10T00:00:00Z", cwd: "C:/fixture/claude", content: "unrelated fixture prompt" },
      { sessionId: "claude-beta", type: "user", timestamp: "2026-06-10T00:00:03Z", cwd: "C:/fixture/claude", content: "claude review notes" },
    ])
    const listed = rows(runFinder(sandbox, root, "claude", ["list"]))
    assert.equal(listed[0]?.id, "claude-beta")
    assert.equal(listed[0]?.path, transcript)
    const searched = rows(runFinder(sandbox, root, "claude", ["search", "review notes"]))
    assert.equal(searched[0]?.platform, "claude")
    const detail = rows(runFinder(sandbox, root, "claude", ["get", "claude-beta"]))[0]!
    assert.deepEqual(jsonMap(detail.prompts), {
      first_user_message: "unrelated fixture prompt",
      last_user_message: "claude review notes",
    })
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test("OpenCode storage fixtures preserve parent-child linkage without invoking opencode", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "ocmm-agent-sessions-opencode-"))
  try {
    const root = join(sandbox, "opencode-export")
    const store = join(root, "storage", "session", "hash1")
    writeJson(join(store, "ses_main.json"), { id: "ses_main", title: "main fixture", directory: "C:/fixture/opencode", time: { created: 1000, updated: 2000 } })
    writeJson(join(store, "ses_child.json"), { id: "ses_child", parentID: "ses_main", title: "explore docs", agent: "explore", directory: "C:/fixture/opencode", time: { created: 1100, updated: 1900 } })
    const listed = rows(runFinder(sandbox, root, "opencode", ["list"]))
    assert.deepEqual(listed.map((item) => item.id), ["ses_main"])
    assert.equal(listed[0]?.subagent_count, 1)
    const detail = rows(runFinder(sandbox, root, "opencode", ["get", "ses_main"]))[0]!
    const children = detail.subagents as unknown[]
    assert.ok(Array.isArray(children))
    assert.equal(jsonMap(children[0]).id, "ses_child")
    assert.equal(jsonMap(children[0]).parent_id, "ses_main")
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})
```

These bodies make every path with `join`, compare returned paths without POSIX assumptions, and never include transcript bodies in assertion messages. SQLite creation is the only inline Python fixture setup; all file fixtures are written by Node.

- [ ] **Step 4: Run isolated fixture and loader contracts and observe GREEN**

Run:

```powershell
node --test --experimental-strip-types src/coding-agent-sessions.test.ts src/intent/skill-loader.test.ts
```

Expected GREEN: `18` tests pass (`7` coding-agent tests plus `11` loader tests); every Python call includes `-B` and a sanitized environment with `OPENCODE_CONFIG_CONTENT` absent and `OPENCODE_CONFIG_DIR` beneath the sandbox, every finder call additionally includes explicit `--root` and `--platform`, and the temporary sandboxes are removed in `finally`.

- [ ] **Step 5: Confirm the objective skill-creator evaluation boundary**

Run:

```powershell
$unexpected = @(git status --short | rg '(evals/|workspace/iteration-|benchmark\.json|feedback\.json|generate_review)' )
if ($unexpected.Count -ne 0) { throw "subjective evaluation artifacts were created: $unexpected" }
"OBJECTIVE_EVAL_ONLY: sanitized deterministic CLI fixtures; no LLM A/B or eval workspace"
```

Expected: `OBJECTIVE_EVAL_ONLY: sanitized deterministic CLI fixtures; no LLM A/B or eval workspace`; no product evaluation file exists.

- [ ] **Step 6: Stop at a non-Git Task 2 checkpoint**

Run `git diff --check` and `git status --short` only. Expected: no whitespace error, no staged entry, no real-session/cache artifact, and HEAD remains `d202e7b`.

### Task 3: Add the generic marked-skill runtime filter and regenerate Codex output

**Files:**
- Modify: `src/codex/plugin-generator.ts`
- Modify: `src/codex/plugin-generator.test.ts`
- Generate: `plugins/deepwork/skills/coding-agent-sessions/**`
- Verify unchanged: existing `plugins/deepwork/skills/**`, `.agents/plugins/marketplace.json`, `.codex/agents/**`

**Interfaces:**
- Consumes: `copySkillDirectory(source: string, target: string): void`, `normalizeSkillForCodex(skillDir: string, name?: string): void`, and `listRelativeFiles(root: string): string[]` test helper.
- Produces: private `hasMarkedSkillRuntimePolicy(source: string): boolean`, `shouldCopyMarkedSkillPath(relativePath: string): boolean`, and `copyMarkedSkillRuntime(source: string, target: string, skillRoot: string): void`; updated test helpers `hasExpectedRuntimePolicy(sourceRoot: string): boolean` and `expectedSharedSkillFiles(sourceRoot: string): string[]`; synthetic one-, two-, every three-, and four-rule generator fixtures; generated 26-file runtime tree.

- [ ] **Step 1: Write RED marked/unmarked inventory and normalization assertions**

Add `dirname` to the existing `node:path` import. Change `assertGeneratedSharedSkillTree` so it computes `sourceFiles` and `expectedFiles = expectedSharedSkillFiles(sourceRoot)`, compares the temporary inventory to `expectedFiles` before it reads `trackedRoot`, then compares the tracked inventory to `expectedFiles` and bytes only for retained files. This ordering makes the first RED failure prove the fresh generator still copies development files even though the new tracked skill does not yet exist. Define the expected-path predicate in the test independently of production:

```ts
const MARKED_SKILL_EXCLUDED_NAMES = new Set([
  ".gitignore", ".npmignore", "pyrightconfig.json", "__pycache__",
  ".mypy_cache", ".pytest_cache", ".ruff_cache",
])
const REQUIRED_RUNTIME_RULES = [".gitignore", "pyrightconfig.json", "scripts/tests/", "*.py[cod]"] as const

function hasExpectedRuntimePolicy(sourceRoot: string): boolean {
  const marker = join(sourceRoot, ".npmignore")
  if (!existsSync(marker)) return false
  const rules = new Set(readFileSync(marker, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#")))
  return REQUIRED_RUNTIME_RULES.every((rule) => rules.has(rule))
}

function isRuntimeSkillPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/")
  const parts = normalized.split("/")
  if (parts.some((part) => MARKED_SKILL_EXCLUDED_NAMES.has(part))) return false
  if (normalized === "scripts/tests" || normalized.startsWith("scripts/tests/")) return false
  return !/\.py[cod]$/i.test(parts.at(-1) ?? "")
}

function expectedSharedSkillFiles(sourceRoot: string): string[] {
  const files = listRelativeFiles(sourceRoot)
  return hasExpectedRuntimePolicy(sourceRoot) ? files.filter(isRuntimeSkillPath) : files
}
```

Rename the real-tree test to `Codex generated shared skill trees preserve non-runtime policies and filter marked runtime files`, retain full-copy assertions for unmarked `ast-grep`, `debugging`, and `publish`, retain full-copy behavior for frontend's existing packaging-only `.npmignore`, and add `coding-agent-sessions`. Assert frontend does not satisfy `hasExpectedRuntimePolicy`, coding-agent-sessions does, coding-agent-sessions source count is `35`, generated count is `26`, all declared runtime/legal paths exist, every declared development/cache/bytecode path is absent, non-`SKILL.md` retained bytes match source, and generated `SKILL.md` has the existing canonical Codex suffix exactly once.

Add this real generator fixture test. It covers representative one- and two-rule signatures, every possible three-of-four signature by omitting each rule, and the normalized all-four signature:

```ts
test("Codex runtime filtering requires the complete normalized four-rule marker signature", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codex-marker-signatures-"))
  try {
    const sourcesRoot = join(root, "sources")
    const markerRules = [".gitignore", "pyrightconfig.json", "scripts/tests/", "*.py[cod]"] as const
    const incompleteCases = [
      { name: "marker-one", rules: [markerRules[0]] },
      { name: "marker-two", rules: [markerRules[0], markerRules[1]] },
      ...markerRules.map((omitted, index) => ({
        name: `marker-three-missing-${index + 1}`,
        rules: markerRules.filter((rule) => rule !== omitted),
      })),
    ]
    const cases = [...incompleteCases, { name: "marker-complete", rules: [...markerRules] }]

    for (const fixture of cases) {
      const source = join(sourcesRoot, fixture.name)
      const files: Record<string, string> = {
        "SKILL.md": `---\nname: ${fixture.name}\ndescription: Marker fixture ${fixture.name}\n---\n# ${fixture.name}\n`,
        ".gitignore": "ignored-source-metadata\n",
        "pyrightconfig.json": "{}\n",
        "scripts/tests/test_fixture.py": "def test_fixture():\n    assert True\n",
        "scripts/runtime.py": "VALUE = 1\n",
        "scripts/__pycache__/runtime.pyc": "fixture-bytecode\n",
        "references/runtime.md": "# Runtime reference\n",
        "LICENSE-UPSTREAM.md": "fixture license\n",
        "NOTICE.md": "fixture notice\n",
        ".npmignore": ["# normalized marker fixture", ...fixture.rules.map((rule) => `  ${rule}  `), ""].join("\r\n"),
      }
      for (const [path, body] of Object.entries(files)) {
        const destination = join(source, path)
        mkdirSync(dirname(destination), { recursive: true })
        writeFileSync(destination, body)
      }
    }

    const config = defaultConfig()
    config.skills = {
      ...config.skills,
      sources: [{ path: sourcesRoot, recursive: true, glob: "marker-*" }],
      enable: cases.map((fixture) => fixture.name),
      disable: [],
    }
    const pluginRoot = join(root, "plugins", "deepwork")
    await generateCodexPlugin({
      projectRoot: process.cwd(),
      pluginRoot,
      marketplacePath: join(root, "marketplace.json"),
      projectAgentsRoot: false,
      config,
    })

    for (const fixture of incompleteCases) {
      assert.deepEqual(
        listRelativeFiles(join(pluginRoot, "skills", fixture.name)),
        listRelativeFiles(join(sourcesRoot, fixture.name)),
        `${fixture.name} must retain whole-tree copying`,
      )
    }
    assert.deepEqual(listRelativeFiles(join(pluginRoot, "skills", "marker-complete")), [
      "LICENSE-UPSTREAM.md",
      "NOTICE.md",
      "SKILL.md",
      "references/runtime.md",
      "scripts/runtime.py",
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run the focused generator test and observe RED**

Run:

```powershell
node --test --experimental-strip-types --test-name-pattern="Codex runtime filtering requires the complete normalized four-rule marker signature|Codex generated shared skill trees preserve non-runtime policies and filter marked runtime files" src/codex/plugin-generator.test.ts
```

Expected RED: the normalized all-four synthetic fixture and temporary `coding-agent-sessions` tree still contain `.gitignore`, `.npmignore`, `pyrightconfig.json`, `scripts/tests/**`, cache, and bytecode files under the current whole-tree copy; the one-, two-, and all four three-rule incomplete fixtures already retain whole-tree inventories.

- [ ] **Step 3: Implement the generic marker-triggered recursive runtime copy**

In `src/codex/plugin-generator.ts`, retain the current `cpSync` branch byte-for-byte for sources without a qualifying source/runtime policy, including the existing frontend packaging-only `.npmignore`; use explicit path rules for qualifying marked sources and no skill-name condition:

```ts
const MARKED_SKILL_EXCLUDED_NAMES = new Set([
  ".gitignore",
  ".npmignore",
  "pyrightconfig.json",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
])
const REQUIRED_RUNTIME_RULES = [".gitignore", "pyrightconfig.json", "scripts/tests/", "*.py[cod]"] as const

function hasMarkedSkillRuntimePolicy(source: string): boolean {
  const marker = join(source, ".npmignore")
  if (!existsSync(marker)) return false
  const rules = new Set(readFileSync(marker, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#")))
  return REQUIRED_RUNTIME_RULES.every((rule) => rules.has(rule))
}

function shouldCopyMarkedSkillPath(relativePath: string): boolean {
  const normalized = relativePath.replaceAll("\\", "/")
  const parts = normalized.split("/")
  if (parts.some((part) => MARKED_SKILL_EXCLUDED_NAMES.has(part))) return false
  if (normalized === "scripts/tests" || normalized.startsWith("scripts/tests/")) return false
  return !/\.py[cod]$/i.test(parts.at(-1) ?? "")
}

function copyMarkedSkillRuntime(source: string, target: string, skillRoot: string): void {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name)
    const relativePath = relative(skillRoot, sourcePath)
    if (!shouldCopyMarkedSkillPath(relativePath)) continue
    const targetPath = join(target, entry.name)
    if (entry.isDirectory()) {
      mkdirSync(targetPath, { recursive: true })
      copyMarkedSkillRuntime(sourcePath, targetPath, skillRoot)
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      mkdirSync(dirname(targetPath), { recursive: true })
      cpSync(sourcePath, targetPath, { force: true })
    }
  }
}

function copySkillDirectory(source: string, target: string): void {
  rmSync(target, { recursive: true, force: true })
  if (!hasMarkedSkillRuntimePolicy(source)) {
    cpSync(source, target, { recursive: true })
    return
  }
  mkdirSync(target, { recursive: true })
  copyMarkedSkillRuntime(source, target, source)
}
```

Leave `normalizeSkillForCodex` unchanged and call it after copying as today.

- [ ] **Step 4: Regenerate official Codex artifacts with profile variables saved, cleared, and restored**

Run this PowerShell block; restoration occurs even if generation fails:

```powershell
$profileKeys = @('OCMM_PROFILE', 'OCMM_NO_PROFILE', 'OCMM_FAST')
$sandboxPathKeys = @('HOME', 'USERPROFILE', 'APPDATA', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME', 'CODEX_HOME', 'OPENCODE_HOME', 'OPENCODE_CONFIG', 'OPENCODE_CONFIG_DIR')
$credentialPattern = [regex]'(?i)(?:^|_)(?:API_KEY|ACCESS_KEY|PRIVATE_KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?|AUTH(?:ORIZATION)?)(?:_|$)'
$credentialKeys = @([Environment]::GetEnvironmentVariables('Process').Keys | Where-Object { $credentialPattern.IsMatch([string]$_) })
$keys = @($profileKeys + $sandboxPathKeys + @('OPENCODE_CONFIG_CONTENT') + $credentialKeys | Sort-Object -Unique)
$saved = @{}
foreach ($key in $keys) {
  $saved[$key] = [pscustomobject]@{
    Present = Test-Path "Env:$key"
    Value = [Environment]::GetEnvironmentVariable($key, 'Process')
  }
}
$sandbox = Join-Path ([IO.Path]::GetTempPath()) "ocmm-codex-generator-$PID"
try {
  [IO.Directory]::CreateDirectory($sandbox) | Out-Null
  foreach ($key in $sandboxPathKeys) {
    $path = if ($key -eq 'OPENCODE_CONFIG') { Join-Path $sandbox 'opencode.json' } else { Join-Path $sandbox $key.ToLowerInvariant() }
    if ($key -ne 'OPENCODE_CONFIG') { [IO.Directory]::CreateDirectory($path) | Out-Null }
    [Environment]::SetEnvironmentVariable($key, $path, 'Process')
  }
  foreach ($key in @($profileKeys + @('OPENCODE_CONFIG_CONTENT') + $credentialKeys)) { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
  if (Test-Path 'Env:OPENCODE_CONFIG_CONTENT') { throw 'OPENCODE_CONFIG_CONTENT escaped generator isolation' }
  $rootPrefix = [IO.Path]::GetFullPath($sandbox + [IO.Path]::DirectorySeparatorChar)
  foreach ($key in $sandboxPathKeys) {
    $resolved = [IO.Path]::GetFullPath([Environment]::GetEnvironmentVariable($key, 'Process'))
    if (-not $resolved.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "$key escaped generator isolation: $resolved" }
  }
  pnpm run gen:codex-plugin
  if ($LASTEXITCODE -ne 0) { throw "Codex generation failed" }
} finally {
  foreach ($key in $keys) {
    if ($saved[$key].Present) { [Environment]::SetEnvironmentVariable($key, $saved[$key].Value, 'Process') }
    else { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
  }
  if (Test-Path -LiteralPath $sandbox) { [IO.Directory]::Delete($sandbox, $true) }
}
```

Expected: official generation runs with all user/config roots beneath the sandbox, with `OPENCODE_CONFIG_CONTENT` absent and `OPENCODE_CONFIG_DIR` inside the sandbox, then restores every original environment value and creates `plugins/deepwork/skills/coding-agent-sessions/` through the generator.

- [ ] **Step 5: Run focused generator tests and observe GREEN**

Run:

```powershell
node --test --experimental-strip-types --test-name-pattern="Codex runtime filtering requires the complete normalized four-rule marker signature|Codex generated shared skill trees preserve non-runtime policies and filter marked runtime files|generated Codex bundle shares one callable-schema contract" src/codex/plugin-generator.test.ts
```

Expected GREEN: the one-, two-, and every three-rule fixture retains its complete source inventory; only the whitespace/comment-normalized all-four fixture filters to its exact five runtime/legal files; the real marked skill is exactly 26 files; unmarked `ast-grep`, `debugging`, and `publish` plus packaging-only-marker `frontend` retain complete source inventories; all normalized routers retain the canonical suffix/dispatch contract.

- [ ] **Step 6: Verify generated inclusion, exclusion, bytes, suffix, and no unrelated deletion**

Run:

```powershell
node --test --experimental-strip-types --test-name-pattern="Codex runtime filtering requires the complete normalized four-rule marker signature|Codex generated shared skill trees preserve non-runtime policies and filter marked runtime files|generated Codex bundle shares one callable-schema contract" src/codex/plugin-generator.test.ts
git diff --name-status -- plugins/deepwork .agents/plugins/marketplace.json .codex/agents
```

Expected: tests pass; generated diff adds only `plugins/deepwork/skills/coding-agent-sessions/**`; no existing generated skill is deleted or changed; generated legal/runtime files are present and development files are absent.

- [ ] **Step 7: Stop at a non-Git Task 3 checkpoint**

Run `git diff --check` and `git status --short` only. Expected: no staged entry, no hand-edited generated file, and HEAD remains `d202e7b`.

### Task 4: Prove packed runtime/legal inventory and document discovery/provenance

**Files:**
- Modify: `src/release-package.test.ts`
- Modify: `README.md`
- Modify: `docs/v1-maintenance.md`
- Read only: `package.json`, `scripts/normalize-ocmm-package.ts`, `.github/workflows/release.yml`

**Interfaces:**
- Consumes: root `package.json.files`, nested source `.npmignore`, generated runtime tree from Task 3, and local pnpm 11.9.0.
- Produces: test-only `CODING_AGENT_RUNTIME_FILES: readonly string[]`, `inventoryUnderPrefix(files: readonly string[], prefix: string): string[]`, `sanitizedPackEnv(sandbox: string, base?: NodeJS.ProcessEnv): NodeJS.ProcessEnv`, and `runPnpmPackDryRun(root: string, sandbox: string): string[]`; user-facing explicit-root usage; durable upstream/license/runtime-filter provenance.

- [ ] **Step 1: Add the RED exact 26-file actual-pack inventory test before its runner exists**

In `src/release-package.test.ts`, add `delimiter`, `isAbsolute`, and `relative` to the `node:path` import, add `spawnSync` from `node:child_process`, and add this exact canonical inventory contract. It rejects any missing or extra path beneath either emitted prefix rather than sampling required/forbidden paths:

```ts
const CODING_AGENT_RUNTIME_FILES = [
  "LICENSE-UPSTREAM.md",
  "NOTICE.md",
  "SKILL.md",
  "agents/openai.yaml",
  "references/all-platforms.md",
  "references/claude.md",
  "references/codex.md",
  "references/opencode.md",
  "references/senpi.md",
  "scripts/agent_sessions/__init__.py",
  "scripts/agent_sessions/aside_scanner.py",
  "scripts/agent_sessions/claude.py",
  "scripts/agent_sessions/cli.py",
  "scripts/agent_sessions/codex.py",
  "scripts/agent_sessions/file_scanners.py",
  "scripts/agent_sessions/jsonio.py",
  "scripts/agent_sessions/kiro_scanner.py",
  "scripts/agent_sessions/opencode.py",
  "scripts/agent_sessions/pi_family.py",
  "scripts/agent_sessions/scanners.py",
  "scripts/agent_sessions/sqlite_optional_scanners.py",
  "scripts/agent_sessions/sqlite_scanners.py",
  "scripts/agent_sessions/timeparse.py",
  "scripts/agent_sessions/transcript.py",
  "scripts/agent_sessions/types.py",
  "scripts/find-agent-sessions.py",
] as const

function inventoryUnderPrefix(files: readonly string[], prefix: string): string[] {
  const start = `${prefix}/`
  return files.filter((path) => path.startsWith(start)).map((path) => path.slice(start.length)).sort()
}

test("pnpm pack dry-run emits exact canonical coding-agent inventories", () => {
  assert.equal(CODING_AGENT_RUNTIME_FILES.length, 26)
  const sandbox = mkdtempSync(join(tmpdir(), "ocmm-pack-coding-agent-"))
  try {
    const files = runPnpmPackDryRun(process.cwd(), sandbox)
    const expected = [...CODING_AGENT_RUNTIME_FILES].sort()
    assert.deepEqual(inventoryUnderPrefix(files, "skills/coding-agent-sessions"), expected)
    assert.deepEqual(inventoryUnderPrefix(files, "plugins/deepwork/skills/coding-agent-sessions"), expected)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})
```

This package contract compares exact relative path sets. It intentionally does not require source/generated `SKILL.md` bytes to match; Task 3 separately proves that only the generated router body gains the canonical Codex suffix.

- [ ] **Step 2: Run the named package test and observe RED**

Run:

```powershell
node --test --experimental-strip-types --test-name-pattern="pnpm pack dry-run emits exact canonical coding-agent inventories" src/release-package.test.ts
```

Expected RED: `ReferenceError: runPnpmPackDryRun is not defined`; no tarball is written and no publish occurs.

- [ ] **Step 3: Implement the cross-platform pnpm dry-run runner and observe GREEN**

Using the imports added in Step 1, implement the helper with the repository's proven Windows `.cmd` dispatch shape:

```ts
type PackDryRun = { files: Array<{ path: string }> }
const PACK_CREDENTIAL_ENV = /(?:^|_)(?:API_KEY|ACCESS_KEY|PRIVATE_KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?|AUTH(?:ORIZATION)?)(?:_|$)/i
const PACK_SANDBOX_ENV_KEYS = [
  "HOME", "USERPROFILE", "APPDATA", "XDG_CONFIG_HOME", "XDG_DATA_HOME",
  "XDG_STATE_HOME", "XDG_CACHE_HOME", "CODEX_HOME", "OPENCODE_HOME", "OPENCODE_CONFIG", "OPENCODE_CONFIG_DIR",
] as const

function assertPackEnvIsSandboxed(sandbox: string, env: NodeJS.ProcessEnv): void {
  assert.equal(env.OPENCODE_CONFIG_CONTENT, undefined)
  for (const key of PACK_SANDBOX_ENV_KEYS) {
    const value = env[key]
    assert.ok(value, `${key} must be set`)
    const delta = relative(sandbox, value)
    assert.equal(delta === "" || (!delta.startsWith("..") && !isAbsolute(delta)), true, `${key} escaped sandbox`)
  }
}

function sanitizedPackEnv(sandbox: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(base)) {
    if (key !== "OPENCODE_CONFIG_CONTENT" && value !== undefined && !PACK_CREDENTIAL_ENV.test(key)) env[key] = value
  }
  for (const key of PACK_SANDBOX_ENV_KEYS) {
    const path = key === "OPENCODE_CONFIG" ? join(sandbox, "opencode.json") : join(sandbox, key.toLowerCase())
    mkdirSync(key === "OPENCODE_CONFIG" ? sandbox : path, { recursive: true })
    env[key] = path
  }
  const processTemp = join(sandbox, "process-temp")
  env.TEMP = processTemp
  env.TMP = processTemp
  mkdirSync(processTemp, { recursive: true })
  delete env.OPENCODE_CONFIG_CONTENT
  assertPackEnvIsSandboxed(sandbox, env)
  return env
}

function resolvePnpm(): string {
  if (process.platform !== "win32") return "pnpm"
  for (const directory of (process.env.PATH ?? process.env.Path ?? "").split(delimiter)) {
    for (const name of ["pnpm.cmd", "pnpm.exe"]) {
      const candidate = join(directory, name)
      if (existsSync(candidate)) return candidate
    }
  }
  throw new Error("pnpm executable is not available on PATH")
}

function runPnpmPackDryRun(root: string, sandbox: string): string[] {
  const pnpm = resolvePnpm()
  const args = ["pack", "--dry-run", "--json"]
  const env = sanitizedPackEnv(sandbox)
  const result = process.platform === "win32" && pnpm.endsWith(".cmd")
    ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", pnpm, ...args], { cwd: root, env, encoding: "utf8", windowsHide: true })
    : spawnSync(pnpm, args, { cwd: root, env, encoding: "utf8", windowsHide: true })
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout) as PackDryRun
  assert.ok(Array.isArray(payload.files))
  return payload.files.map((item) => item.path.replaceAll("\\", "/")).sort()
}
```

Run the named test again. Expected GREEN: actual sanitized `pnpm pack --dry-run --json` reports exactly the canonical 26 relative files beneath each source/generated prefix, with no missing or extra file; `OPENCODE_CONFIG_CONTENT` is absent, `OPENCODE_CONFIG_DIR` is sandboxed, no `.tgz` is created, and no publish occurs.

- [ ] **Step 4: Update README shared-skill discovery and safe usage**

Add `coding-agent-sessions/` to the shared `skills/` tree and `coding-agent-sessions` to the default shared slash-command list. Add one concise subsection that states the finder is for explicit user-requested session-history work, and show a safe PowerShell example with both restrictions:

```powershell
$fixtureRoot = "C:\exports\coding-agent-session-fixture"
python skills/coding-agent-sessions/scripts/find-agent-sessions.py find "ambassador" --root "$fixtureRoot" --platform aside
```

State that repository QA never omits `--root` or `--platform` and never points either value at a real home/session store.

- [ ] **Step 5: Record complete shared-skill provenance in `docs/v1-maintenance.md`**

Add a `Shared skill (not v1)` entry containing all of these facts in one durable record: source path; pinned `f2872273d6866026a2262315e54dbf21760154d3` revision; initial and three Aside commits; Yeongyu Kim and contributors copyright; Sustainable Use License 1.0 subtree/root-AAAPL boundary; 33 upstream files plus local license/notice; six retained pytest files/35 functions with no-install Node/Python acceptance; `loadSharedSkills`/slash-command discovery; absence from v1 injection/commands; normalized all-four `.npmignore` marker semantics and incomplete-signature whole-copy behavior; 35-file source versus exact canonical 26-file source/generated package inventories; both OpenCode configuration-precedence escape-route protections; official Codex normalization; and npm dry-run evidence. Do not modify `skills/v1/` or `prompts/v1/`.

- [ ] **Step 6: Run Task 4 GREEN gates and stop at a non-Git checkpoint**

Run:

```powershell
node --test --experimental-strip-types src/release-package.test.ts
git diff --check
git status --short
```

Expected: release-package tests pass, including exact equality with the canonical 26-file relative inventory beneath both emitted prefixes and sandboxed OpenCode configuration precedence; documentation has no whitespace errors; no staged entry exists; HEAD remains `d202e7b`.

### Task 5: Run full isolated acceptance, exact-scope review, and the single parent Git boundary

**Files:**
- Verify all files in the File Map.
- Stage/commit only in Steps 9-10, by the parent after all prior steps pass.

**Interfaces:**
- Consumes: completed Tasks 1-4, local Python/pnpm/Cargo/OpenCode toolchain, and unchanged baseline HEAD.
- Produces: one green acceptance record, one exact staged diff, and one parent-owned commit titled `feat: add coding agent session search skill`; plan-critic receipt remains parent-owned.

- [ ] **Step 1: Establish the pre-gate baseline and exact unstaged scope**

Run:

```powershell
git rev-parse HEAD
git status --short
git diff --check
```

Expected: HEAD is still `d202e7b030fa005df82065a370e3a372a63af310`; nothing is staged; no whitespace error exists.

- [ ] **Step 2: Run targeted source, loader, CLI, generator, and package gates**

Run:

```powershell
node --input-type=module -e "import { readFileSync,readdirSync } from 'node:fs'; import { join,relative } from 'node:path'; const upstream='omo/packages/shared-skills/skills/coding-agent-sessions'; const local='skills/coding-agent-sessions'; const walk=(root,dir=root)=>readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>entry.isDirectory()?walk(root,join(dir,entry.name)):[relative(root,join(dir,entry.name)).replaceAll('\\','/')]).sort(); const files=walk(upstream); if(files.length!==33) throw new Error('expected 33 upstream files, got '+files.length); for(const path of files){ if(!readFileSync(join(upstream,path)).equals(readFileSync(join(local,path)))) throw new Error('source byte mismatch: '+path); } if(!readFileSync('omo/LICENSE.md').equals(readFileSync(join(local,'LICENSE-UPSTREAM.md')))) throw new Error('license byte mismatch'); console.log('UPSTREAM_BYTES_OK: 33 source files plus license');"
node --test --experimental-strip-types src/coding-agent-sessions.test.ts src/intent/skill-loader.test.ts
node --test --experimental-strip-types --test-name-pattern="Codex runtime filtering requires the complete normalized four-rule marker signature|Codex generated shared skill trees preserve non-runtime policies and filter marked runtime files|generated Codex bundle shares one callable-schema contract" src/codex/plugin-generator.test.ts
node --test --experimental-strip-types src/release-package.test.ts
python --version
python -c "import importlib.util; print('pytest=present' if importlib.util.find_spec('pytest') else 'pytest=absent; retained-not-executed=6-files/35-functions')"
```

Expected: direct comparison prints `UPSTREAM_BYTES_OK` for all 33 files and the license; all targeted Node tests pass, including every incomplete marker-signature fixture and both exact canonical 26-file pack inventories; Python reports 3.11.2; current environment reports pytest absent and the retained-not-executed count. The Node fixture suite is the mandatory real CLI acceptance, proves both OpenCode configuration-precedence escape routes are blocked, and performs in-memory compile without repository bytecode.

- [ ] **Step 3: Run official generation twice under cleared profile variables and compare robust raw-byte manifests**

Run this PowerShell block:

```powershell
$profileKeys = @('OCMM_PROFILE', 'OCMM_NO_PROFILE', 'OCMM_FAST')
$sandboxPathKeys = @('HOME', 'USERPROFILE', 'APPDATA', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME', 'CODEX_HOME', 'OPENCODE_HOME', 'OPENCODE_CONFIG', 'OPENCODE_CONFIG_DIR')
$credentialPattern = [regex]'(?i)(?:^|_)(?:API_KEY|ACCESS_KEY|PRIVATE_KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?|AUTH(?:ORIZATION)?)(?:_|$)'
$credentialKeys = @([Environment]::GetEnvironmentVariables('Process').Keys | Where-Object { $credentialPattern.IsMatch([string]$_) })
$keys = @($profileKeys + $sandboxPathKeys + @('OPENCODE_CONFIG_CONTENT') + $credentialKeys | Sort-Object -Unique)
$saved = @{}
foreach ($key in $keys) {
  $saved[$key] = [pscustomobject]@{ Present = Test-Path "Env:$key"; Value = [Environment]::GetEnvironmentVariable($key, 'Process') }
}
$sandbox = Join-Path ([IO.Path]::GetTempPath()) "ocmm-codex-determinism-$PID"
$manifestScript = @'
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
const root = process.argv[1];
function files(dir) { return readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{ const path=join(dir,entry.name); return entry.isDirectory()?files(path):[path]; }); }
const rows = files(root).map((path)=>{ const bytes=readFileSync(path); return { path:relative(root,path).replaceAll("\\","/"), size:bytes.length, sha256:createHash("sha256").update(bytes).digest("hex") }; }).sort((a,b)=>a.path.localeCompare(b.path));
process.stdout.write(JSON.stringify(rows));
'@
try {
  [IO.Directory]::CreateDirectory($sandbox) | Out-Null
  foreach ($key in $sandboxPathKeys) {
    $path = if ($key -eq 'OPENCODE_CONFIG') { Join-Path $sandbox 'opencode.json' } else { Join-Path $sandbox $key.ToLowerInvariant() }
    if ($key -ne 'OPENCODE_CONFIG') { [IO.Directory]::CreateDirectory($path) | Out-Null }
    [Environment]::SetEnvironmentVariable($key, $path, 'Process')
  }
  foreach ($key in @($profileKeys + @('OPENCODE_CONFIG_CONTENT') + $credentialKeys)) { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
  if (Test-Path 'Env:OPENCODE_CONFIG_CONTENT') { throw 'OPENCODE_CONFIG_CONTENT escaped generator isolation' }
  $rootPrefix = [IO.Path]::GetFullPath($sandbox + [IO.Path]::DirectorySeparatorChar)
  foreach ($key in $sandboxPathKeys) {
    $resolved = [IO.Path]::GetFullPath([Environment]::GetEnvironmentVariable($key, 'Process'))
    if (-not $resolved.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "$key escaped generator isolation: $resolved" }
  }
  pnpm run gen:codex-plugin
  if ($LASTEXITCODE -ne 0) { throw "first generator run failed" }
  $first = & node --input-type=module -e $manifestScript "plugins/deepwork"
  if ($LASTEXITCODE -ne 0) { throw "first raw-byte manifest failed" }
  pnpm run gen:codex-plugin
  if ($LASTEXITCODE -ne 0) { throw "second generator run failed" }
  $second = & node --input-type=module -e $manifestScript "plugins/deepwork"
  if ($LASTEXITCODE -ne 0) { throw "second raw-byte manifest failed" }
  if ($first -cne $second) { throw "Codex generation is not byte-deterministic" }
  "CODEX_DETERMINISTIC: identical path/size/SHA-256 manifests"
} finally {
  foreach ($key in $keys) {
    if ($saved[$key].Present) { [Environment]::SetEnvironmentVariable($key, $saved[$key].Value, 'Process') }
    else { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
  }
  if (Test-Path -LiteralPath $sandbox) { [IO.Directory]::Delete($sandbox, $true) }
}
```

Expected: both generator runs use sandboxed home/XDG/Codex/OpenCode roots, `OPENCODE_CONFIG_CONTENT` is absent, `OPENCODE_CONFIG_DIR` is sandboxed, `CODEX_DETERMINISTIC: identical path/size/SHA-256 manifests` is emitted, every original environment value is restored, and the generated coding-agent tree remains exactly 26 runtime/legal files.

- [ ] **Step 4: Run changed-TypeScript diagnostics, using Compiler API fallback when LSP is unavailable**

If the callable LSP diagnostic service is available, request diagnostics for the five changed TypeScript files. If it is unavailable, run this exact fallback:

```powershell
node --input-type=module -e "import path from 'node:path'; import ts from 'typescript'; const files=['src/codex/plugin-generator.ts','src/codex/plugin-generator.test.ts','src/intent/skill-loader.test.ts','src/coding-agent-sessions.test.ts','src/release-package.test.ts'].map((file)=>path.resolve(file)); const configPath=ts.findConfigFile('.',ts.sys.fileExists,'tsconfig.json'); if(!configPath) throw new Error('tsconfig.json not found'); const loaded=ts.readConfigFile(configPath,ts.sys.readFile); if(loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText,'\n')); const parsed=ts.parseJsonConfigFileContent(loaded.config,ts.sys,path.dirname(configPath),undefined,configPath); const targets=new Set(files.map((file)=>file.toLowerCase())); const rootNames=[...new Set([...parsed.fileNames.map((file)=>path.resolve(file)),...files])]; const program=ts.createProgram({rootNames,options:{...parsed.options,noEmit:true}}); const missing=files.filter((file)=>program.getSourceFile(file)===undefined); if(missing.length) throw new Error('diagnostic targets missing: '+missing.join(', ')); const diagnostics=ts.getPreEmitDiagnostics(program).filter((item)=>item.file===undefined||targets.has(path.resolve(item.file.fileName).toLowerCase())); for(const item of diagnostics){ const where=item.file&&item.start!==undefined?item.file.fileName+':'+(item.file.getLineAndCharacterOfPosition(item.start).line+1)+': ':''; console.error(where+ts.flattenDiagnosticMessageText(item.messageText,'\n')); } process.exitCode=diagnostics.length===0?0:1"
if ($LASTEXITCODE -ne 0) { throw "changed-file Compiler API diagnostics failed" }
```

Expected: zero diagnostics. This fallback is supplementary; it never replaces the full typecheck in Step 5.

- [ ] **Step 5: Verify no schema drift, then run typecheck, full tests, and build**

Run in order:

```powershell
git diff --exit-code -- schema.json
pnpm run typecheck
pnpm test
pnpm run build
```

Expected: `schema.json` has no diff (schema regeneration is irrelevant because no schema input changed); typecheck passes; Node plus Cargo tests pass; TypeScript plus Rust release build passes.

- [ ] **Step 6: Re-run actual package dry-run as a real surface gate**

Run:

```powershell
$sandboxPathKeys = @('HOME', 'USERPROFILE', 'APPDATA', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME', 'CODEX_HOME', 'OPENCODE_HOME', 'OPENCODE_CONFIG', 'OPENCODE_CONFIG_DIR')
$credentialPattern = [regex]'(?i)(?:^|_)(?:API_KEY|ACCESS_KEY|PRIVATE_KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?|AUTH(?:ORIZATION)?)(?:_|$)'
$credentialKeys = @([Environment]::GetEnvironmentVariables('Process').Keys | Where-Object { $credentialPattern.IsMatch([string]$_) })
$keys = @($sandboxPathKeys + @('OPENCODE_CONFIG_CONTENT') + $credentialKeys | Sort-Object -Unique)
$saved = @{}
foreach ($key in $keys) {
  $saved[$key] = [pscustomobject]@{ Present = Test-Path "Env:$key"; Value = [Environment]::GetEnvironmentVariable($key, 'Process') }
}
$sandbox = Join-Path ([IO.Path]::GetTempPath()) "ocmm-pack-dry-run-$PID"
$inventoryScript = @'
let text = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) text += chunk;
const data = JSON.parse(text);
const files = data.files.map((item) => item.path.replaceAll("\\", "/"));
const canonical = [
  "LICENSE-UPSTREAM.md", "NOTICE.md", "SKILL.md", "agents/openai.yaml",
  "references/all-platforms.md", "references/claude.md", "references/codex.md", "references/opencode.md", "references/senpi.md",
  "scripts/agent_sessions/__init__.py", "scripts/agent_sessions/aside_scanner.py", "scripts/agent_sessions/claude.py",
  "scripts/agent_sessions/cli.py", "scripts/agent_sessions/codex.py", "scripts/agent_sessions/file_scanners.py",
  "scripts/agent_sessions/jsonio.py", "scripts/agent_sessions/kiro_scanner.py", "scripts/agent_sessions/opencode.py",
  "scripts/agent_sessions/pi_family.py", "scripts/agent_sessions/scanners.py", "scripts/agent_sessions/sqlite_optional_scanners.py",
  "scripts/agent_sessions/sqlite_scanners.py", "scripts/agent_sessions/timeparse.py", "scripts/agent_sessions/transcript.py",
  "scripts/agent_sessions/types.py", "scripts/find-agent-sessions.py",
].sort();
if (canonical.length !== 26) throw new Error(`canonical inventory has ${canonical.length} files`);
function inventory(prefix) {
  const start = `${prefix}/`;
  return files.filter((path) => path.startsWith(start)).map((path) => path.slice(start.length)).sort();
}
for (const prefix of ["skills/coding-agent-sessions", "plugins/deepwork/skills/coding-agent-sessions"]) {
  const actual = inventory(prefix);
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
    console.error(JSON.stringify({ prefix, expected: canonical, actual }, null, 2));
    process.exit(1);
  }
}
console.log("PACKAGE_RUNTIME_EXACT_26_OK");
'@
try {
  [IO.Directory]::CreateDirectory($sandbox) | Out-Null
  foreach ($key in $sandboxPathKeys) {
    $path = if ($key -eq 'OPENCODE_CONFIG') { Join-Path $sandbox 'opencode.json' } else { Join-Path $sandbox $key.ToLowerInvariant() }
    if ($key -ne 'OPENCODE_CONFIG') { [IO.Directory]::CreateDirectory($path) | Out-Null }
    [Environment]::SetEnvironmentVariable($key, $path, 'Process')
  }
  foreach ($key in (@('OPENCODE_CONFIG_CONTENT') + $credentialKeys)) { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
  if (Test-Path 'Env:OPENCODE_CONFIG_CONTENT') { throw 'OPENCODE_CONFIG_CONTENT escaped package isolation' }
  $rootPrefix = [IO.Path]::GetFullPath($sandbox + [IO.Path]::DirectorySeparatorChar)
  foreach ($key in $sandboxPathKeys) {
    $resolved = [IO.Path]::GetFullPath([Environment]::GetEnvironmentVariable($key, 'Process'))
    if (-not $resolved.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "$key escaped package isolation: $resolved" }
  }
  $packJson = & pnpm pack --dry-run --json
  if ($LASTEXITCODE -ne 0) { throw 'pnpm pack dry-run failed' }
  $packJson | & node --input-type=module -e $inventoryScript
  if ($LASTEXITCODE -ne 0) { throw 'exact package inventory check failed' }
} finally {
  foreach ($key in $keys) {
    if ($saved[$key].Present) { [Environment]::SetEnvironmentVariable($key, $saved[$key].Value, 'Process') }
    else { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
  }
  if (Test-Path -LiteralPath $sandbox) { [IO.Directory]::Delete($sandbox, $true) }
}
```

Expected: before packing, `OPENCODE_CONFIG_CONTENT` is absent and every configured root including `OPENCODE_CONFIG_DIR` is beneath the sandbox; `PACKAGE_RUNTIME_EXACT_26_OK` proves each emitted prefix equals the canonical 26-file relative inventory with no missing or extra path; original environment values are restored; no tarball and no publish.

- [ ] **Step 7: Prove isolated OpenCode discovery without a model request**

Run after the build. This probe creates only a temporary sandbox, passes a sanitized child environment through `ProcessStartInfo`, and calls `opencode debug paths` plus `opencode debug config` (never `opencode run`):

```powershell
$testDir = Join-Path $env:LOCALAPPDATA "Temp\opencode\ocmm-coding-agent-sessions-$PID"
$plugin = (Resolve-Path "dist\index.js").Path
$opencodeCommand = Get-Command opencode
$opencodePath = $opencodeCommand.Source
$opencodeExtension = [IO.Path]::GetExtension($opencodePath).ToLowerInvariant()
if ($opencodeExtension -eq '.ps1') {
  $opencodeFile = (Get-Command pwsh).Source
  $opencodePrefix = @('-NoProfile', '-File', $opencodePath)
} elseif ($opencodeExtension -in @('.cmd', '.bat')) {
  $opencodeFile = $env:ComSpec ?? 'cmd.exe'
  $opencodePrefix = @('/d', '/s', '/c', $opencodePath)
} else {
  $opencodeFile = $opencodePath
  $opencodePrefix = @()
}
$credentialName = [regex]'(?i)(?:^|_)(?:API_KEY|ACCESS_KEY|PRIVATE_KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?|AUTH(?:ORIZATION)?)(?:_|$)'
function Invoke-Captured([string]$File, [string[]]$Arguments, [string]$WorkingDirectory, [hashtable]$Environment) {
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $File
  $psi.WorkingDirectory = $WorkingDirectory
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  foreach ($argument in $Arguments) { [void]$psi.ArgumentList.Add($argument) }
  $psi.Environment.Clear()
  foreach ($entry in $Environment.GetEnumerator()) { $psi.Environment[$entry.Key] = [string]$entry.Value }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $psi
  [void]$process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  if ($process.ExitCode -ne 0) { throw "$File failed ($($process.ExitCode)): $stderr" }
  return "$stdout`n$stderr"
}
try {
  foreach ($dir in @('', '.opencode', 'xdg-config', 'xdg-data', 'xdg-state', 'xdg-cache', 'home', 'appdata', 'codex-home', 'opencode-home', 'opencode-config-dir')) {
    [IO.Directory]::CreateDirectory((Join-Path $testDir $dir)) | Out-Null
  }
  $opencodeConfig = @{ plugin = @($plugin); disabled_providers = @('opencode','openrouter','github-copilot','openai') } | ConvertTo-Json -Depth 5
  [IO.File]::WriteAllText((Join-Path $testDir 'opencode.json'), $opencodeConfig)
  [IO.File]::WriteAllText((Join-Path $testDir '.opencode\ocmm.jsonc'), '{"workflow":"omo","debug":true}')
  $childEnv = @{}
  foreach ($entry in [Environment]::GetEnvironmentVariables('Process').GetEnumerator()) {
    if ([string]$entry.Key -ne 'OPENCODE_CONFIG_CONTENT' -and -not $credentialName.IsMatch([string]$entry.Key)) { $childEnv[[string]$entry.Key] = [string]$entry.Value }
  }
  $childEnv['HOME'] = Join-Path $testDir 'home'
  $childEnv['USERPROFILE'] = Join-Path $testDir 'home'
  $childEnv['APPDATA'] = Join-Path $testDir 'appdata'
  $childEnv['XDG_CONFIG_HOME'] = Join-Path $testDir 'xdg-config'
  $childEnv['XDG_DATA_HOME'] = Join-Path $testDir 'xdg-data'
  $childEnv['XDG_STATE_HOME'] = Join-Path $testDir 'xdg-state'
  $childEnv['XDG_CACHE_HOME'] = Join-Path $testDir 'xdg-cache'
  $childEnv['CODEX_HOME'] = Join-Path $testDir 'codex-home'
  $childEnv['OPENCODE_HOME'] = Join-Path $testDir 'opencode-home'
  $childEnv['OPENCODE_CONFIG'] = Join-Path $testDir 'opencode.json'
  $childEnv['OPENCODE_CONFIG_DIR'] = Join-Path $testDir 'opencode-config-dir'
  [void]$childEnv.Remove('OPENCODE_CONFIG_CONTENT')
  $childEnv['OCMM_DEBUG'] = '1'
  if ($childEnv.ContainsKey('OPENCODE_CONFIG_CONTENT')) { throw 'OPENCODE_CONFIG_CONTENT escaped OpenCode isolation' }
  $rootPrefix = [IO.Path]::GetFullPath($testDir + [IO.Path]::DirectorySeparatorChar)
  foreach ($key in @('HOME','USERPROFILE','APPDATA','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_STATE_HOME','XDG_CACHE_HOME','CODEX_HOME','OPENCODE_HOME','OPENCODE_CONFIG','OPENCODE_CONFIG_DIR')) {
    $resolved = [IO.Path]::GetFullPath([string]$childEnv[$key])
    if (-not $resolved.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "$key escaped OpenCode isolation: $resolved" }
  }
  $paths = Invoke-Captured $opencodeFile (@($opencodePrefix) + @('debug','paths')) $testDir $childEnv
  foreach ($key in @('XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_STATE_HOME','XDG_CACHE_HOME')) {
    if ($paths -notmatch [regex]::Escape([string]$childEnv[$key])) { throw "OpenCode path output did not use isolated $key" }
  }
  $config = Invoke-Captured $opencodeFile (@($opencodePrefix) + @('debug','config','--print-logs','--log-level','DEBUG')) $testDir $childEnv
  if ($config -notmatch '"coding-agent-sessions"\s*:') { throw 'coding-agent-sessions command was not discovered' }
  if ($config -notmatch '\[ocmm\] config loaded: project=.*ocmm\.jsonc, user=<none>') { throw 'isolated ocmm config marker missing' }
  'OPENCODE_DISCOVERY_OK: debug-only, no model request'
} finally {
  if (Test-Path -LiteralPath $testDir) { [IO.Directory]::Delete($testDir, $true) }
}
```

Expected: before either debug invocation, all path roots including `OPENCODE_CONFIG_DIR` are proven beneath the sandbox and `OPENCODE_CONFIG_CONTENT` is proven absent; then `OPENCODE_DISCOVERY_OK: debug-only, no model request` is emitted, the command key is present, no provider/model call occurs, and the sandbox is deleted.

- [ ] **Step 8: Scrub artifacts and enforce exact changed scope, privacy, credentials, and cache exclusion**

Run:

```powershell
$tracked = @(git diff --name-only)
$untracked = @(git ls-files --others --exclude-standard)
$changed = @($tracked + $untracked | Sort-Object -Unique)
$exact = @(
  'README.md',
  'docs/v1-maintenance.md',
  'docs/superpowers/specs/2026-07-31-coding-agent-sessions-skill-design.md',
  'docs/superpowers/plans/2026-07-31-coding-agent-sessions-skill.md',
  'src/codex/plugin-generator.ts',
  'src/codex/plugin-generator.test.ts',
  'src/intent/skill-loader.test.ts',
  'src/coding-agent-sessions.test.ts',
  'src/release-package.test.ts'
)
$unexpected = @($changed | Where-Object {
  ($_ -notin $exact) -and
  (-not $_.StartsWith('skills/coding-agent-sessions/')) -and
  (-not $_.StartsWith('plugins/deepwork/skills/coding-agent-sessions/'))
})
if ($unexpected.Count -ne 0) { throw "unexpected changed scope: $($unexpected -join ', ')" }
if ($changed -match '(^|/)(opencode\.db|state_[^/]*\.sqlite|messages\.jsonl|__pycache__|\.mypy_cache|\.pytest_cache|\.ruff_cache)(/|$)|\.py[cod]$') { throw 'real-session/cache/bytecode artifact in changed scope' }
git diff --check
rg -n --hidden -g '!omo/**' -g '!pnpm-lock.yaml' '(sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._-]{20,})' README.md docs/v1-maintenance.md docs/superpowers/specs/2026-07-31-coding-agent-sessions-skill-design.md docs/superpowers/plans/2026-07-31-coding-agent-sessions-skill.md src/codex/plugin-generator.ts src/codex/plugin-generator.test.ts src/intent/skill-loader.test.ts src/coding-agent-sessions.test.ts src/release-package.test.ts skills/coding-agent-sessions plugins/deepwork/skills/coding-agent-sessions
if ($LASTEXITCODE -eq 0) { throw 'credential-shaped high-entropy content found' }
$artifacts = @(fd -HI '(__pycache__|\.mypy_cache|\.pytest_cache|\.ruff_cache|.*\.py[co])' skills/coding-agent-sessions plugins/deepwork/skills/coding-agent-sessions)
if ($artifacts.Count -ne 0) { throw "cache or bytecode artifact found: $($artifacts -join ', ')" }
git diff --name-status
git status --short
```

Expected: only the exact allowlist plus the two declared subtrees is changed; no schema/package/version/release/prompt/v1/routing/category file appears; credential and cache scans find nothing; no real-session artifact exists; nothing is staged.

- [ ] **Step 9: Enter the one final parent-only Git boundary and review the staged diff**

This step and Step 10 are one contiguous parent-only Git boundary. Implementation subagents stop before it. After the parent confirms Steps 1-8, the parent alone runs:

```powershell
git add -- README.md docs/v1-maintenance.md docs/superpowers/specs/2026-07-31-coding-agent-sessions-skill-design.md docs/superpowers/plans/2026-07-31-coding-agent-sessions-skill.md src/codex/plugin-generator.ts src/codex/plugin-generator.test.ts src/intent/skill-loader.test.ts src/coding-agent-sessions.test.ts src/release-package.test.ts skills/coding-agent-sessions plugins/deepwork/skills/coding-agent-sessions
git diff --cached --check
git diff --cached --name-status
git status --short
```

Expected: staged scope is exactly the reviewed feature/spec/plan; unstaged scope is empty; no forbidden file is staged. If any difference exists, unstage and return to Step 8 rather than committing.

- [ ] **Step 10: Create the single authorized parent commit**

Only after the staged diff and every gate remain green, the parent runs exactly one commit:

```powershell
git commit -m "feat: add coding agent session search skill" -m "Port the upstream finder, add isolated fixture and package coverage, and ship runtime-only Codex artifacts with license provenance."
```

Expected: one commit, no footer/trailer/AI attribution, clean worktree, and no push or tag. Do not amend, create a second commit, or perform any remote Git write.

## Self-Review and Coverage Map

- Task 1 covers the pinned revision, exact 33-file upstream inventory, exact upstream license, notice/legal boundary, all source hashes, six retained pytest files/35 functions, Python 3.11 standard-library-only compile, no-install disposition, and the shared assertion that removes `OPENCODE_CONFIG_CONTENT` while sandboxing `OPENCODE_CONFIG_DIR`.
- Task 2 covers shared discovery/slash command, valid frontmatter/reference links, v1 exclusion, both OpenCode configuration-precedence escape-route assertions, all other sanitized child roots, explicit roots/platforms, Aside fallback and SQLite join, malformed-record and absent-root behavior, Claude file scanning, OpenCode parent-child linkage, all five CLI names/aliases, repeated query/platform options, comma-platform rejection, JSON output, Windows paths, no raw sensitive output, and objective non-LLM evaluation.
- Task 3 covers normalized marker detection with one-, two-, every three-, and all-four-rule real generator fixtures, every exclusion, every retained runtime/legal class, unchanged unmarked skills, unchanged frontend/ast-grep behavior, canonical Codex suffix, sandboxed official regeneration, and no unrelated generated deletion.
- Task 4 covers sanitized actual pnpm pack emission, exact canonical 26-file equality beneath both source/generated prefixes, automatic rejection of every missing/extra development/cache/bytecode path, shared-skill README use, and complete provenance documentation without v1 prompt/skill changes.
- Task 5 covers targeted/full gates, source/Python/CLI checks, two-run raw-byte generator determinism with full environment restoration, LSP/Compiler API diagnostics, no schema drift, typecheck/tests/build, exact package dry-run, pre-debug OpenCode escape-route assertions, model-free isolated OpenCode discovery, cleanup, exact scope/privacy/credential/cache review, staged diff review, and the one parent commit boundary.
- Task count: `5` serial tasks. Checkbox step count: `36` (`7 + 6 + 7 + 6 + 10`).
- Placeholder/consistency review: every path, command, test name, helper signature, one-/two-/three-/four-rule marker case, both exact 26-file inventories, both OpenCode precedence variables, expected RED/GREEN result, source count (`35`), runtime count (`26`), retained pytest count (`6/35`), and final commit title is explicit and internally consistent.
- Remaining receipt status: `waiting for receipt` for this revised plan (all prior receipts are invalidated; the parent owns plan-critic dispatch and current-revision receipt tracking).
