import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test } from "node:test"
import { gzipSync } from "node:zlib"

import {
  COMPILED_FILES, DSH_VERSION, LOCALE_FILES, PACKAGE_NAME, PNPM_VERSION, PUBLIC_EXPORTS, REGISTRY, REQUIRED_CHECKS,
  cleanupOwnedRoot, createIsolatedEnvironment, createOwnedRoot, inspectTarball, isInside, lifecycleCommands,
  main, parseArgs, publicExportsForVersion, readInstalledPluginMetadata, requiredChecksForVersion, requiresDeepworkMetadata,
  runInstallProbe, validateInstallReceipt, validateLocaleResources, verifyInstalledPackage, verifyNativePluginList,
} from "../scripts/dsmm-registry-install-probe.mjs"

const hash = (bytes: string | Buffer, algorithm = "sha256", encoding: "hex" | "base64" = "hex") =>
  createHash(algorithm).update(bytes).digest(encoding)
const SHA = "a".repeat(64)
const PNPM_INTEGRITY = "sha512-vWgtXQP+Ul73yf1ngMaITR51asTJyf4AxTh4KCQxDc+Q493E9Tg18G3669UIXkGFXgvLs7YN4qxburieUDbwOw=="
const DSH_INTEGRITY = "sha512-EAJ3gPNcVt/uv8X19PMm9NkVhWgT7xXNMk0UKCVm+IQ5rpSQOcsMUa0HWlnYYVybKMsccjcRB21vVVsaXQ6IdA=="
const PROFILE = `dsmm-registry-${"b".repeat(32)}`

function manifest(version = "0.1.2") {
  return { name: PACKAGE_NAME, version, type: "module", exports: Object.fromEntries(
    Object.entries(publicExportsForVersion(version)).map(([name, path]) => [name, name === "./package.json" || name.startsWith("./locale/") ? `./${path}` : { default: `./${path}` }]),
  ) }
}

function packageFiles(version = "0.1.2") {
  const localeBytes = (path: string) => Buffer.from(JSON.stringify({ meta: { title: "Deepwork",
    description: path === "locale/en.json" ? "Deepwork bundle for DeepSeek Harness." : "DeepSeek Harness 的 Deepwork 工作流。" } }))
  return new Map<string, { bytes: Buffer; mode: number }>([
    ["package.json", { bytes: Buffer.from(JSON.stringify(manifest(version))), mode: 0o644 }],
    ...[...new Set([...Object.values(publicExportsForVersion(version)), ...COMPILED_FILES])].filter((path) => path !== "package.json")
      .map((path) => [path, { bytes: path.startsWith("locale/") ? localeBytes(path) : Buffer.from(`export const fixture = ${JSON.stringify(path)}\n`), mode: 0o644 }] as const),
  ])
}

function installedFixture(owner: ReturnType<typeof createOwnedRoot>, version = "0.1.3") {
  const profileRoot = join(owner.root, "profile")
  const profilePackage = join(profileRoot, "package.json")
  const packageRoot = join(profileRoot, "node_modules", "@dsmm", "dsmm")
  const expected = packageFiles(version)
  mkdirSync(packageRoot, { recursive: true })
  writeFileSync(profilePackage, JSON.stringify({ private: true, dependencies: { [PACKAGE_NAME]: version } }))
  for (const [path, entry] of expected) {
    mkdirSync(join(packageRoot, path, ".."), { recursive: true })
    writeFileSync(join(packageRoot, path), entry.bytes)
  }
  return { profileRoot, profilePackage, packageRoot, expected }
}

function tarball(entries: { name: string; bytes?: Buffer; type?: string; link?: string }[]) {
  const chunks: Buffer[] = []
  for (const entry of entries) {
    const header = Buffer.alloc(512)
    const bytes = entry.bytes ?? Buffer.alloc(0)
    header.write(entry.name, 0, 100)
    header.write("0000644\0", 100, 8)
    header.write("0000000\0", 108, 8)
    header.write("0000000\0", 116, 8)
    header.write(bytes.length.toString(8).padStart(11, "0") + "\0", 124, 12)
    header.write("00000000000\0", 136, 12)
    header.fill(32, 148, 156)
    header.write(entry.type ?? "0", 156, 1)
    if (entry.link) header.write(entry.link, 157, 100)
    header.write("ustar\0", 257, 6)
    header.write("00", 263, 2)
    header.write(header.reduce((sum, value) => sum + value, 0).toString(8).padStart(6, "0") + "\0 ", 148, 8)
    chunks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512))
  }
  chunks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(chunks))
}

function completedReceipt(version = "0.1.2") {
  const files = packageFiles(version)
  const locales = validateLocaleResources(new Map([...files].filter(([path]) => path.startsWith("locale/")).map(([path, entry]) => [path, entry.bytes])), version)
  return {
    schemaVersion: 1, outcome: "COMPLETED", packageName: PACKAGE_NAME, version, sha256: SHA,
    startedAt: "2026-10-05T00:00:00.000Z", finishedAt: "2026-10-05T00:01:00.000Z",
    registry: { url: REGISTRY, tarball: `${REGISTRY}@dsmm/dsmm/-/dsmm-${version}.tgz`, integrity: `sha512-${"A".repeat(86)}==`,
      sha1: "c".repeat(40), sha256: SHA, sha512: `${"A".repeat(86)}==`, size: 245_837 },
    packageManager: { name: "pnpm", version: PNPM_VERSION, integrity: PNPM_INTEGRITY },
    native: { version: DSH_VERSION, integrity: DSH_INTEGRITY, binSha256: SHA, profile: PROFILE,
      headless: true, profileList: true, dumpConfig: true,
      commands: lifecycleCommands(PROFILE, version).map((command: object) => ({ ...command, status: 0, stdoutSha256: SHA, stderrSha256: SHA })) },
    exports: Object.fromEntries(Object.entries(publicExportsForVersion(version)).map(([name, path]) => [name, { path, sha256: path.startsWith("locale/") ? hash(files.get(path)!.bytes) : SHA }])),
    compiledFiles: Object.fromEntries(COMPILED_FILES.map((path: string) => [path, { path, sha256: SHA }])),
    checks: Object.fromEntries(requiredChecksForVersion(version).map((key: string) => [key, true])),
    ...(requiresDeepworkMetadata(version) ? { nativeMetadata: {
      reader: "@deepseek-ai/dsh-app-boot/readPluginMeta", readerVersion: DSH_VERSION, readerSha256: SHA,
      packageName: PACKAGE_NAME, version, source: "profile-owned-installed-package", locales,
      execution: { status: 0, stdoutSha256: SHA, stderrSha256: SHA },
    } } : {}),
    temporaryRootRemoved: true, cleanup: { outcome: "COMPLETED" },
    nonClaims: { paidModelCall: false, realLogin: false, authenticatedDesktop: false, uiAcceptance: false },
  }
}

test("registry probe CLI accepts only a stable exact version, lowercase SHA256, and one new receipt path", () => {
  const valid = ["--version", "0.1.2", "--sha256", SHA, "--receipt", "probe-receipt.json"]
  assert.deepEqual(parseArgs(valid), { version: "0.1.2", sha256: SHA, receipt: resolve("probe-receipt.json") })
  for (const version of ["v0.1.2", "01.1.2", "0.1.2-rc.1", "0.1.2+build", "latest", "^0.1.2", "0.1.2;echo secret", "9007199254740992.1.2"]) {
    assert.throws(() => parseArgs(["--version", version, ...valid.slice(2)]))
  }
  for (const sha of [SHA.toUpperCase(), "a".repeat(63), "g".repeat(64), `${SHA}\n`]) {
    assert.throws(() => parseArgs([...valid.slice(0, 3), sha, ...valid.slice(4)]))
  }
  for (const argv of [valid.slice(0, 4), [...valid, "--version", "0.1.3"], [...valid, "--unknown", "yes"],
    [...valid, "extra"], [...valid.slice(0, 5), ""], [...valid.slice(0, 5), "receipt\nsecret"]]) {
    assert.throws(() => parseArgs(argv))
  }
})

test("native lifecycle initializes ordinary headless, installs the exact public spec with no scripts, then lists and dumps", () => {
  const commands = lifecycleCommands(PROFILE, "0.1.2")
  assert.deepEqual(commands.map((command: { args: string[] }) => command.args), [
    ["--profile", PROFILE, "--from-default-profile", "headless", "--dump-config"],
    ["plugin", "--profile", PROFILE, "add", "@dsmm/dsmm@0.1.2", "--save-exact", "--ignore-scripts", "--registry=https://registry.npmjs.org/"],
    ["plugin", "--profile", PROFILE, "list", "--depth=0", "--json"],
    ["--profile", PROFILE, "--dump-config"],
  ])
  for (const profile of ["desktop", "headless", "web", "../outside", "dsmm-registry-not-unique"]) {
    assert.throws(() => lifecycleCommands(profile, "0.1.2"))
  }
  assert.equal(JSON.stringify(commands).includes("login"), false)
})

test("fresh child environment is an allowlist and redirects every state/config/cache home without credentials", () => {
  const root = resolve("owned-probe")
  const env = createIsolatedEnvironment(root, {
    PATH: "C:/private-global-bin", HOME: "C:/private-real-home", USERPROFILE: "C:/private-real-home",
    DSH_HOME: "C:/private-desktop", NODE_OPTIONS: "--import=private.mjs", NODE_PATH: "C:/private-node-modules",
    NPM_TOKEN: "secret-npm", NODE_AUTH_TOKEN: "secret-auth", GITHUB_TOKEN: "secret-github",
    NPM_CONFIG_USERCONFIG: "C:/private-npmrc", DSH_DEEPSEEK_API_KEY: "secret-provider", HTTP_PROXY: "http://private-proxy",
    SystemRoot: process.env.SystemRoot ?? "C:\\Windows", LANG: "C.UTF-8",
  })
  for (const key of ["NODE_OPTIONS", "NODE_PATH", "NPM_TOKEN", "NODE_AUTH_TOKEN", "GITHUB_TOKEN", "NPM_CONFIG_USERCONFIG", "DSH_DEEPSEEK_API_KEY", "HTTP_PROXY"]) {
    assert.equal(env[key], undefined)
  }
  for (const key of ["HOME", "USERPROFILE", "DSH_HOME", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME",
    "XDG_CACHE_HOME", "TEMP", "TMP", "TMPDIR", "PNPM_HOME", "npm_config_userconfig", "npm_config_globalconfig", "npm_config_store_dir", "npm_config_cache", "npm_config_cache_dir", "npm_config_state_dir"]) {
    assert.equal(isInside(env[key], root), true, key)
  }
  assert.equal(env.PATH.includes("private-global-bin"), false)
  assert.equal(JSON.stringify(env).includes("secret-"), false)
  assert.equal(env.npm_config_ignore_scripts, "true")
  assert.equal(env.npm_config_manage_package_manager_versions, "false")
  assert.equal(env.npm_config_registry, REGISTRY)
})

test("native list JSON must include the exact installed registry package, not merely a successful empty profile row", () => {
  const owner = createOwnedRoot()
  try {
    const profileRoot = join(owner.root, "profile")
    mkdirSync(profileRoot)
    const row = { name: "dsh-profile-owned", path: profileRoot, private: true, dependencies: { [PACKAGE_NAME]: { version: "0.1.2" } } }
    assert.equal(verifyNativePluginList(JSON.stringify([row]), profileRoot, "0.1.2"), true)
    // Actual Windows/pnpm 11.9 carrier evidence: exit 0, JSON profile row, but no dependencies.
    assert.throws(() => verifyNativePluginList(JSON.stringify([{ name: row.name, path: profileRoot, private: true }]), profileRoot, "0.1.2"), /UNPROVED/u)
    for (const output of ["", "[]", "{}", JSON.stringify([{ ...row, path: owner.root }]),
      JSON.stringify([{ ...row, dependencies: { [PACKAGE_NAME]: { version: "0.1.1" } } }]), JSON.stringify([row, row])]) {
      assert.throws(() => verifyNativePluginList(output, profileRoot, "0.1.2"))
    }
  } finally { cleanupOwnedRoot(owner) }
})

test("safe tar inspection checks member bytes and rejects traversal, links, duplicate files, and corrupt headers", () => {
  const entry = { name: "package/package.json", bytes: Buffer.from(JSON.stringify(manifest())) }
  assert.deepEqual(inspectTarball(tarball([entry])).get("package.json")?.bytes, entry.bytes)
  for (const bad of ["package/../outside", "/outside", "package/C:/outside", "package/a\\outside", "package/con.js", "package/directory./file"]) {
    assert.throws(() => inspectTarball(tarball([entry, { name: bad }])), /UNSAFE_ARCHIVE_PATH/u)
  }
  for (const type of ["1", "2", "3", "4", "g", "L"]) {
    assert.throws(() => inspectTarball(tarball([entry, { name: "package/unsafe", type, link: "../outside" }])), /UNSAFE_ARCHIVE_TYPE/u)
  }
  assert.throws(() => inspectTarball(tarball([entry, entry])), /DUPLICATE_ARCHIVE_MEMBER/u)
  assert.throws(() => inspectTarball(Buffer.from("not gzip")), /INVALID_ARCHIVE_GZIP/u)
})

test("all five public exports and compiled profile/client files must resolve inside the profile-owned installed package with expected bytes", () => {
  const owner = createOwnedRoot()
  try {
    const profileRoot = join(owner.root, "profile")
    const profilePackage = join(profileRoot, "package.json")
    const packageRoot = join(profileRoot, "node_modules", "@dsmm", "dsmm")
    const expected = packageFiles()
    mkdirSync(packageRoot, { recursive: true })
    writeFileSync(profilePackage, JSON.stringify({ private: true, dependencies: { [PACKAGE_NAME]: "0.1.2" } }))
    for (const [path, entry] of expected) {
      mkdirSync(join(packageRoot, path, ".."), { recursive: true })
      writeFileSync(join(packageRoot, path), entry.bytes)
    }
    const installed = verifyInstalledPackage(profilePackage, profileRoot, expected, "0.1.2")
    assert.deepEqual(Object.keys(installed.exports), Object.keys(PUBLIC_EXPORTS))
    for (const [name, path] of Object.entries(PUBLIC_EXPORTS)) {
      assert.deepEqual(installed.exports[name], { path, sha256: hash(expected.get(path)!.bytes) })
    }
    assert.deepEqual(Object.keys(installed.compiledFiles), COMPILED_FILES)
    assert.throws(() => verifyInstalledPackage(profilePackage, profileRoot, expected, "0.1.3"), /IDENTITY_MISMATCH/u)
    writeFileSync(join(packageRoot, "lib", "client.js"), "changed compiled client")
    assert.throws(() => verifyInstalledPackage(profilePackage, profileRoot, expected, "0.1.2"), /BYTES_MISMATCH/u)
    writeFileSync(join(packageRoot, "lib", "client.js"), expected.get("lib/client.js")!.bytes)
    const altered = manifest()
    altered.exports["./client"] = { default: "./lib/index.js" }
    writeFileSync(join(packageRoot, "package.json"), JSON.stringify(altered))
    assert.throws(() => verifyInstalledPackage(profilePackage, profileRoot, expected, "0.1.2"), /BYTES_MISMATCH|EXPORT_TARGET_MISMATCH/u)
  } finally { cleanupOwnedRoot(owner) }
})

test("version policy preserves 0.1.1/0.1.2 and selects the exact seven-export metadata contract from 0.1.3", () => {
  for (const version of ["0.1.1", "0.1.2"]) {
    assert.equal(requiresDeepworkMetadata(version), false)
    assert.deepEqual(publicExportsForVersion(version), PUBLIC_EXPORTS)
    assert.deepEqual(requiredChecksForVersion(version), REQUIRED_CHECKS)
    assert.doesNotThrow(() => validateInstallReceipt(completedReceipt(version), { version, sha256: SHA }))
  }
  for (const version of ["0.1.3", "0.1.4", "0.2.0", "1.0.0"]) {
    assert.equal(requiresDeepworkMetadata(version), true)
    assert.deepEqual(Object.keys(publicExportsForVersion(version)), [...Object.keys(PUBLIC_EXPORTS), "./locale/en.json", "./locale/zh.json"])
    assert.deepEqual(requiredChecksForVersion(version), [...REQUIRED_CHECKS, "localeResources", "nativePluginMetadata"])
  }
  for (const version of ["0.0.9", "0.1.0", "0.1.3-rc.1", "01.1.3", "latest"]) assert.throws(() => publicExportsForVersion(version))
})

test("historical 0.1.1 installed package remains accepted without locale resources", () => {
  const owner = createOwnedRoot()
  try {
    const { profilePackage, profileRoot, expected } = installedFixture(owner, "0.1.1")
    const installed = verifyInstalledPackage(profilePackage, profileRoot, expected, "0.1.1")
    assert.deepEqual(Object.keys(installed.exports), Object.keys(PUBLIC_EXPORTS))
    assert.deepEqual(Object.keys(installed.compiledFiles), COMPILED_FILES)
  } finally { cleanupOwnedRoot(owner) }
})

test("new installed package resolves and hashes both locales without calling JSON executable compiled files", () => {
  const owner = createOwnedRoot()
  try {
    const { profilePackage, profileRoot, packageRoot, expected } = installedFixture(owner)
    const installed = verifyInstalledPackage(profilePackage, profileRoot, expected, "0.1.3")
    assert.deepEqual(Object.keys(installed.exports), Object.keys(publicExportsForVersion("0.1.3")))
    assert.deepEqual(Object.keys(installed.compiledFiles), COMPILED_FILES)
    for (const path of LOCALE_FILES) assert.deepEqual(installed.exports[`./${path}`], { path, sha256: hash(expected.get(path)!.bytes) })
    writeFileSync(join(packageRoot, "locale", "en.json"), JSON.stringify({ meta: { title: "DSMM", description: "changed" } }))
    assert.throws(() => verifyInstalledPackage(profilePackage, profileRoot, expected, "0.1.3"), /BYTES_MISMATCH/u)
    writeFileSync(join(packageRoot, "locale", "en.json"), expected.get("locale/en.json")!.bytes)
    writeFileSync(join(packageRoot, "locale", "fr.json"), expected.get("locale/en.json")!.bytes)
    assert.throws(() => verifyInstalledPackage(profilePackage, profileRoot, expected, "0.1.3"), /LOCALE_INVENTORY_MISMATCH/u)
  } finally { cleanupOwnedRoot(owner) }
})

test("installed resource export inventory and expected metadata bytes cannot silently change", () => {
  const mutations: ((fixture: ReturnType<typeof installedFixture>) => void)[] = [
    ({ packageRoot }) => {
      const changed = manifest("0.1.3")
      delete changed.exports["./locale/zh.json"]
      writeFileSync(join(packageRoot, "package.json"), JSON.stringify(changed))
    },
    ({ packageRoot }) => {
      const changed = manifest("0.1.3")
      changed.exports["./locale/en.json"] = "./locale/zh.json"
      writeFileSync(join(packageRoot, "package.json"), JSON.stringify(changed))
    },
    ({ packageRoot, expected }) => {
      const path = "locale/en.json", bytes = Buffer.from("{")
      expected.set(path, { bytes, mode: 0o644 })
      writeFileSync(join(packageRoot, path), bytes)
    },
    ({ packageRoot, expected }) => {
      const path = "locale/zh.json", bytes = Buffer.from(JSON.stringify({ meta: { title: "Deepwork", description: " " } }))
      expected.set(path, { bytes, mode: 0o644 })
      writeFileSync(join(packageRoot, path), bytes)
    },
  ]
  for (const mutate of mutations) {
    const owner = createOwnedRoot()
    try {
      const fixture = installedFixture(owner); mutate(fixture)
      assert.throws(() => verifyInstalledPackage(fixture.profilePackage, fixture.profileRoot, fixture.expected, "0.1.3"))
    } finally { cleanupOwnedRoot(owner) }
  }
})

const metadataRuntimeRoot = resolve("output_test/dsmm012-operator-runtime")
const metadataRuntimePackage = join(metadataRuntimeRoot, "node_modules", "@deepseek-ai", "dsh", "package.json")
test("genuine pinned public native readPluginMeta consumes both locales from a fresh profile-owned installation", {
  skip: existsSync(metadataRuntimePackage) ? false : "task-owned public SDK fixture unavailable; genuine CI installation remains required",
}, async () => {
  const owner = createOwnedRoot()
  try {
    const { profilePackage, profileRoot, expected } = installedFixture(owner)
    const metadata = await readInstalledPluginMetadata(profilePackage, profileRoot, metadataRuntimePackage, metadataRuntimeRoot, "0.1.3")
    const nativeRequire = createRequire(realpathSync(metadataRuntimePackage))
    assert.equal(metadata.reader, "@deepseek-ai/dsh-app-boot/readPluginMeta")
    assert.equal(metadata.readerVersion, DSH_VERSION)
    assert.equal(metadata.readerSha256, hash(readFileSync(nativeRequire.resolve("@deepseek-ai/dsh-app-boot"))))
    assert.equal(metadata.source, "profile-owned-installed-package")
    assert.deepEqual(metadata.locales, validateLocaleResources(new Map(LOCALE_FILES.map((path: string) => [path, expected.get(path)!.bytes])), "0.1.3"))
    assert.notEqual(metadata.locales.en.description, metadata.locales.zh.description)
    await assert.rejects(() => readInstalledPluginMetadata(profilePackage, profileRoot, metadataRuntimePackage, join(owner.root, "wrong-native-owner"), "0.1.3"))
    await assert.rejects(() => readInstalledPluginMetadata(profilePackage, profileRoot, metadataRuntimePackage, metadataRuntimeRoot, "0.1.2"), /LEGACY_METADATA_NOT_REQUIRED/u)
  } finally { cleanupOwnedRoot(owner) }
})

test("profile-owned package resolution rejects symlinks into an unrelated checkout or sibling runtime", () => {
  const owner = createOwnedRoot()
  try {
    const profileRoot = join(owner.root, "profile")
    const unrelated = join(owner.root, "unrelated-checkout")
    mkdirSync(join(profileRoot, "node_modules", "@dsmm"), { recursive: true })
    mkdirSync(unrelated)
    const expected = packageFiles()
    writeFileSync(join(unrelated, "package.json"), expected.get("package.json")!.bytes)
    const profilePackage = join(profileRoot, "package.json")
    writeFileSync(profilePackage, "{}")
    symlinkSync(unrelated, join(profileRoot, "node_modules", "@dsmm", "dsmm"), process.platform === "win32" ? "junction" : "dir")
    assert.throws(() => verifyInstalledPackage(profilePackage, profileRoot, expected, "0.1.2"), /NOT_PROFILE_OWNED/u)
  } finally { cleanupOwnedRoot(owner) }
})

test("receipt acceptance requires every identity, file hash, native command, check, cleanup, and explicit nonclaim", () => {
  const receipt = completedReceipt()
  assert.equal(validateInstallReceipt(receipt, { version: "0.1.2", sha256: SHA }), receipt)
  const mutations: ((item: ReturnType<typeof completedReceipt>) => void)[] = [
    (item) => { item.outcome = "FAILED" }, (item) => { item.version = "0.1.1" },
    (item) => { item.registry.sha256 = "d".repeat(64) }, (item) => { item.registry.size = 0 },
    (item) => { item.registry.tarball = "https://private.example/package.tgz" },
    (item) => { item.packageManager.version = "12.8.1" }, (item) => { item.packageManager.integrity = "not pinned" },
    (item) => { item.native.version = "0.2.0-rc.1" }, (item) => { item.native.headless = false },
    (item) => { item.native.profileList = false }, (item) => { item.native.dumpConfig = false },
    (item) => { item.native.commands.pop() }, (item) => { item.native.commands[1]!.args[4] = "@dsmm/dsmm@latest" },
    (item) => { item.exports["./client"]!.path = "../checkout/lib/client.js" },
    (item) => { item.exports["./client"]!.sha256 = "no actual hash" },
    (item) => { delete item.compiledFiles["lib/profiles.js"] },
    (item) => { item.temporaryRootRemoved = false }, (item) => { item.cleanup.outcome = "FAILED" },
    (item) => { item.nonClaims.realLogin = true }, (item) => { item.finishedAt = "invalid" },
    ...REQUIRED_CHECKS.map((key: string) => (item: ReturnType<typeof completedReceipt>) => { item.checks[key] = false }),
  ]
  for (const mutate of mutations) {
    const bad = structuredClone(receipt)
    mutate(bad)
    assert.throws(() => validateInstallReceipt(bad, { version: "0.1.2", sha256: SHA }))
  }
})

test("0.1.3 native install receipt requires genuine-reader identity, execution, exact resources and both new checks", () => {
  const receipt = completedReceipt("0.1.3")
  assert.equal(validateInstallReceipt(receipt, { version: "0.1.3", sha256: SHA }), receipt)
  const mutations: ((item: ReturnType<typeof completedReceipt>) => void)[] = [
    (item) => { delete item.nativeMetadata },
    (item) => { item.nativeMetadata!.reader = "invented-displayName-reader" },
    (item) => { item.nativeMetadata!.readerVersion = "0.2.0-rc.1" },
    (item) => { item.nativeMetadata!.readerSha256 = "not a hash" },
    (item) => { item.nativeMetadata!.source = "checkout" },
    (item) => { item.nativeMetadata!.version = "0.1.2" },
    (item) => { item.nativeMetadata!.execution.status = 1 },
    (item) => { item.nativeMetadata!.execution.stdoutSha256 = "" },
    (item) => { item.nativeMetadata!.execution.stderrSha256 = "" },
    (item) => { delete item.nativeMetadata!.locales.zh },
    (item) => { item.nativeMetadata!.locales.fr = item.nativeMetadata!.locales.en },
    (item) => { item.nativeMetadata!.locales.en.title = "DSMM" },
    (item) => { item.nativeMetadata!.locales.zh.description = " \n" },
    (item) => { item.nativeMetadata!.locales.en.path = "lib/index.js" },
    (item) => { item.nativeMetadata!.locales.zh.sha256 = "d".repeat(64) },
    (item) => { delete item.exports["./locale/en.json"] },
    (item) => { item.checks.localeResources = false },
    (item) => { item.checks.nativePluginMetadata = false },
  ]
  for (const mutate of mutations) {
    const changed = structuredClone(receipt); mutate(changed)
    assert.throws(() => validateInstallReceipt(changed, { version: "0.1.3", sha256: SHA }))
  }
})

test("unsupported metadata policy cannot create or leak an owned native probe root", async () => {
  let ownedRoots = 0
  await assert.rejects(() => runInstallProbe({ version: "0.1.0", sha256: SHA }, { createOwnedRoot: () => { ownedRoots++; return createOwnedRoot() } }), /UNSUPPORTED_METADATA_POLICY_VERSION/u)
  assert.equal(ownedRoots, 0)
})

test("owned cleanup refuses replacement markers and roots, and never reports a remaining root as removed", () => {
  const owner = createOwnedRoot()
  try {
    writeFileSync(join(owner.root, ".dsmm-registry-probe-owner"), "replaced owner")
    let removed = false
    assert.throws(() => cleanupOwnedRoot(owner, () => { removed = true }), /OWNERSHIP_INVALID/u)
    assert.equal(removed, false)
    writeFileSync(join(owner.root, ".dsmm-registry-probe-owner"), owner.token)
    assert.throws(() => cleanupOwnedRoot({ ...owner, root: owner.parent }), /TARGET_INVALID/u)
    assert.throws(() => cleanupOwnedRoot(owner, () => {}), /ROOT_REMAINS/u)
    assert.equal(existsSync(owner.root), true)
  } finally { cleanupOwnedRoot(owner) }
  assert.equal(existsSync(owner.root), false)
})

test("public registry failures produce sanitized honest receipts, with cleanup failure overriding completion evidence", async () => {
  const owners: ReturnType<typeof createOwnedRoot>[] = []
  const makeRoot = () => { const owner = createOwnedRoot(); owners.push(owner); return owner }
  const fetchUnavailable = async () => { throw new Error("SECRET_RAW_NETWORK_ERROR") }
  const unresolved = await runInstallProbe({ version: "0.1.2", sha256: SHA }, { createOwnedRoot: makeRoot, fetch: fetchUnavailable })
  assert.equal(unresolved.outcome, "UNRESOLVED")
  assert.deepEqual(unresolved.failure, { stage: "registry-package", code: "PUBLIC_REGISTRY_UNAVAILABLE" })
  assert.equal(unresolved.temporaryRootRemoved, true)
  assert.equal(existsSync(owners[0]!.root), false)
  assert.equal(JSON.stringify(unresolved).includes("SECRET_RAW"), false)
  const failed = await runInstallProbe({ version: "0.1.2", sha256: SHA }, {
    createOwnedRoot: makeRoot, fetch: fetchUnavailable, cleanupOwnedRoot: () => { throw new Error("SECRET_CLEANUP_ERROR") },
  })
  try {
    assert.equal(failed.outcome, "FAILED")
    assert.equal(failed.temporaryRootRemoved, false)
    assert.deepEqual(failed.cleanup, { outcome: "FAILED", code: "OWNED_ROOT_CLEANUP_FAILED" })
    assert.equal(JSON.stringify(failed).includes("SECRET_"), false)
  } finally { cleanupOwnedRoot(owners[1]!) }
  const remaining = await runInstallProbe({ version: "0.1.2", sha256: SHA }, {
    createOwnedRoot: makeRoot, fetch: fetchUnavailable, cleanupOwnedRoot: () => {},
  })
  try {
    assert.equal(remaining.outcome, "FAILED")
    assert.equal(remaining.temporaryRootRemoved, false)
    assert.equal(remaining.checks.cleanup, false)
  } finally { cleanupOwnedRoot(owners[2]!) }
})

test("metadata success and wrong tarball bytes cannot start provisioning or establish native installation", async () => {
  const bytes = tarball([...packageFiles()].map(([path, entry]) => ({ name: `package/${path}`, bytes: entry.bytes })))
  const metadata = { name: PACKAGE_NAME, version: "0.1.2", dist: {
    tarball: `${REGISTRY}@dsmm/dsmm/-/dsmm-0.1.2.tgz`, shasum: hash(bytes, "sha1"), integrity: `sha512-${hash(bytes, "sha512", "base64")}`,
  } }
  let executions = 0
  const fetched: string[] = []
  const result = await runInstallProbe({ version: "0.1.2", sha256: SHA }, {
    fetch: async (url: string, options: { redirect: string }) => {
      assert.equal(options.redirect, "error")
      fetched.push(url)
      return new Response(url === metadata.dist.tarball ? bytes : JSON.stringify(metadata), { status: 200 })
    },
    execute: async () => { executions++; throw new Error("must never provision") },
  })
  assert.equal(result.outcome, "FAILED")
  assert.deepEqual(result.failure, { stage: "registry-package", code: "REGISTRY_DIGEST_MISMATCH" })
  assert.equal(executions, 0)
  assert.equal(result.checks.registryBytes, false)
  assert.equal(result.native.headless, false)
  assert.equal(result.temporaryRootRemoved, true)
  assert.deepEqual(fetched, [`${REGISTRY}%40dsmm%2Fdsmm/0.1.2`, metadata.dist.tarball])
})

test("CLI preserves existing receipts and retains new failure receipts outside the removed temporary root", async () => {
  const parent = mkdtempSync(join(tmpdir(), "dsmm-registry-receipt-test-"))
  try {
    const path = join(parent, "receipt.json")
    writeFileSync(path, "existing immutable receipt")
    const output: string[] = []
    let fetchCalls = 0
    const runtime = { writeStdout: (value: string) => { output.push(value) }, fetch: async () => { fetchCalls++; throw new Error("SECRET") } }
    const argv = ["--version", "0.1.2", "--sha256", SHA, "--receipt", path]
    assert.equal(await main(argv, runtime), 1)
    assert.equal(readFileSync(path, "utf8"), "existing immutable receipt")
    assert.equal(fetchCalls, 0)
    const freshPath = join(parent, "new-receipt.json")
    assert.equal(await main([...argv.slice(0, 5), freshPath], runtime), 2)
    const receipt = JSON.parse(readFileSync(freshPath, "utf8"))
    assert.equal(receipt.outcome, "UNRESOLVED")
    assert.equal(receipt.temporaryRootRemoved, true)
    assert.equal(fetchCalls, 1)
    assert.equal(output.join("").includes("SECRET"), false)
    assert.equal(output.join("").includes(parent), false)
  } finally { rmSync(parent, { recursive: true, force: true }) }
})
