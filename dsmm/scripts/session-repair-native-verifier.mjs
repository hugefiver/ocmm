import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, readlink, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { auditSessionLog } from "./repair-session-log.mjs";

const PINNED_VERSION = "0.2.0-rc.2";
const MAX_BYTES = 256 * 1024 * 1024;
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const pathKey = path => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);

/** Diagnostics never retain native/parser errors, paths, or message payloads. */
export class NativeSessionVerificationError extends Error {
  constructor(code) {
    super(`Native session verification refused: ${code}`);
    this.name = "NativeSessionVerificationError";
    this.code = code;
  }
}
const refuse = code => { throw new NativeSessionVerificationError(code); };
const safeError = (error, code) => error instanceof NativeSessionVerificationError ? error : new NativeSessionVerificationError(code);

const SEMAPHORE_SCRIPT = `
$ErrorActionPreference = 'Stop'
$sem = $null
$held = $false
try {
  $sem = [System.Threading.Semaphore]::new(1, 1, $env:DSMM_REPAIR_SEMAPHORE)
  $held = $sem.WaitOne(0)
  if (-not $held) { [Console]::Out.WriteLine('BUSY'); exit 3 }
  [Console]::Out.WriteLine('HELD')
  [Console]::Out.Flush()
  $null = [Console]::In.ReadLine()
} catch { [Console]::Out.WriteLine('FAILED'); exit 4 }
finally {
  if ($held) { $null = $sem.Release() }
  if ($null -ne $sem) { $sem.Dispose() }
}
`;

const QUIESCENCE_SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
  $p = $env:DSMM_REPAIR_PARAMETERS | ConvertFrom-Json
  $busy = $false
  foreach ($entry in (Get-CimInstance -ClassName Win32_Process -Property Name,ExecutablePath)) {
    if ($p.names -contains $entry.Name.ToLowerInvariant()) { $busy = $true; break }
    if ($p.executable -and $entry.ExecutablePath -and $entry.ExecutablePath.ToLowerInvariant() -eq $p.executable) { $busy = $true; break }
  }
  if ($busy) { [Console]::Out.WriteLine('NO') } else { [Console]::Out.WriteLine('YES') }
} catch { [Console]::Out.WriteLine('FAILED'); exit 4 }
`;

const PRIVACY_SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
  $p = $env:DSMM_REPAIR_PARAMETERS | ConvertFrom-Json
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $trusted = @($identity, 'S-1-5-18', 'S-1-5-32-544')
  $source = [System.IO.File]::GetAccessControl($p.source)
  $directory = [System.IO.Directory]::GetAccessControl($p.directory)
  foreach ($acl in @($source, $directory)) {
    $descriptor = [System.Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
    if ($null -eq $descriptor.DiscretionaryAcl) { [Console]::Out.WriteLine('NO'); exit 0 }
  }
  $owner = $directory.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
  if ($trusted -notcontains $owner) { [Console]::Out.WriteLine('NO'); exit 0 }
  $sourceRights = @{}
  foreach ($rule in $source.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -eq 'Deny') { [Console]::Out.WriteLine('NO'); exit 0 }
    if ($rule.AccessControlType -eq 'Allow') {
      $sid = $rule.IdentityReference.Value
      $sourceRights[$sid] = ([long]$sourceRights[$sid]) -bor ([long]$rule.FileSystemRights)
    }
  }
  foreach ($rule in $directory.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -ne 'Allow') { continue }
    $sid = $rule.IdentityReference.Value
    if ($sid -eq 'S-1-3-0') { $sid = $identity }
    if ($trusted -contains $sid) { continue }
    $rights = [long]$rule.FileSystemRights
    if (-not $sourceRights.ContainsKey($sid) -or (($rights -band $sourceRights[$sid]) -ne $rights)) { [Console]::Out.WriteLine('NO'); exit 0 }
  }
  [Console]::Out.WriteLine('YES')
} catch { [Console]::Out.WriteLine('FAILED'); exit 4 }
`;

const PRIVATE_ROOT_SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
  $p = $env:DSMM_REPAIR_PARAMETERS | ConvertFrom-Json
  $acl = [System.Security.AccessControl.DirectorySecurity]::new()
  $acl.SetAccessRuleProtection($true, $false)
  $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl.SetOwner($user)
  foreach ($sid in @($user, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'), [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))) {
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
  }
  [System.IO.Directory]::SetAccessControl($p.directory, $acl)
  [Console]::Out.WriteLine('YES')
} catch { [Console]::Out.WriteLine('FAILED'); exit 4 }
`;

function powershell(script, parameters = {}) {
  const executable = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return spawn(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
    windowsHide: true, stdio: ["pipe", "pipe", "ignore"],
    env: { ...process.env, DSMM_REPAIR_PARAMETERS: JSON.stringify(parameters), DSMM_REPAIR_SEMAPHORE: parameters.semaphore ?? "" }
  });
}

function probeWindows(script, parameters, code) {
  return new Promise((resolveProbe, reject) => {
    const child = powershell(script, parameters);
    let output = "";
    const timer = setTimeout(() => { child.kill(); reject(new NativeSessionVerificationError(code)); }, 15000);
    child.stdout.on("data", chunk => {
      output += chunk.toString("utf8");
      if (output.length > 64) child.kill();
    });
    child.once("error", () => { clearTimeout(timer); reject(new NativeSessionVerificationError(code)); });
    child.once("exit", exitCode => {
      clearTimeout(timer);
      if (exitCode === 0 && output.trim() === "YES") resolveProbe(true);
      else reject(new NativeSessionVerificationError(code));
    });
    child.stdin.end();
  });
}

async function acquireWindowsLease(lockPath) {
  const semaphore = `Local\\dsh-session-lock-${digest(resolve(lockPath).toLowerCase())}`;
  const child = powershell(SEMAPHORE_SCRIPT, { semaphore });
  let exited = false;
  const completion = new Promise(resolveExit => { child.once("close", () => { exited = true; resolveExit(); }); });
  try {
    await new Promise((resolveHeld, reject) => {
      let output = "";
      const timer = setTimeout(() => { child.kill(); reject(new NativeSessionVerificationError("LEASE_UNAVAILABLE")); }, 15000);
      const finish = error => { clearTimeout(timer); child.stdout.removeListener("data", onData); error ? reject(error) : resolveHeld(); };
      const onData = chunk => {
        output += chunk.toString("utf8");
        if (!output.includes("\n") && output.length < 64) return;
        finish(output.trim() === "HELD" ? undefined : new NativeSessionVerificationError(output.trim() === "BUSY" ? "WRITER_ACTIVE" : "LEASE_UNAVAILABLE"));
      };
      child.stdout.on("data", onData);
      child.once("error", () => finish(new NativeSessionVerificationError("LEASE_UNAVAILABLE")));
      child.once("exit", () => finish(new NativeSessionVerificationError("LEASE_UNAVAILABLE")));
    });
  } catch (error) {
    child.stdin.destroy();
    child.kill();
    await completion;
    throw safeError(error, "LEASE_UNAVAILABLE");
  }
  return {
    async assertHeld() { if (exited || child.exitCode !== null || child.killed) refuse("LEASE_LOST"); },
    async release() {
      if (exited || child.exitCode !== null || child.killed) refuse("LEASE_LOST");
      child.stdin.end("RELEASE\n");
      const timer = setTimeout(() => child.kill(), 5000);
      await completion;
      clearTimeout(timer);
      if (child.exitCode !== 0) refuse("LEASE_RELEASE_FAILED");
    }
  };
}

async function assertPlainPath(filePath, allowedRoot) {
  if (typeof filePath !== "string" || !isAbsolute(filePath) || /[\0*?]/u.test(filePath)) refuse("UNSAFE_PATH");
  const path = resolve(filePath);
  if (allowedRoot !== undefined) {
    if (typeof allowedRoot !== "string" || !isAbsolute(allowedRoot)) refuse("UNSAFE_PATH");
    const within = relative(resolve(allowedRoot), path);
    if (!within || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) refuse("UNSAFE_PATH");
  }
  const entry = await lstat(path);
  const directory = await lstat(dirname(path));
  if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1 || !directory.isDirectory() || directory.isSymbolicLink()
    || pathKey(await realpath(path)) !== pathKey(path)) refuse("UNSAFE_PATH");
  return path;
}

async function snapshot(filePath) {
  const path = await assertPlainPath(filePath);
  const handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    if (before.size > BigInt(MAX_BYTES)) refuse("INPUT_LIMIT");
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const current = await lstat(path, { bigint: true });
    if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || current.ino !== before.ino || current.dev !== before.dev || current.nlink !== 1n || current.isSymbolicLink()
      || current.size !== before.size || current.mtimeNs !== before.mtimeNs || current.ctimeNs !== before.ctimeNs) refuse("SOURCE_CHANGED");
    return bytes;
  } finally { await handle.close(); }
}

async function acquirePosixLease(lockPath, nativeRequire) {
  const { tryLockExclusive } = await import(pathToFileURL(nativeRequire.resolve("@deepseek-ai/node-addon-system/flock")).href);
  const entry = await lstat(lockPath).catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
  if (entry && (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1)) refuse("UNSAFE_LOCK");
  const handle = await open(lockPath, fsConstants.O_RDWR | fsConstants.O_CREAT | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
  try {
    await tryLockExclusive(handle.fd);
    const held = await handle.stat({ bigint: true });
    const assertHeld = async () => {
      const current = await lstat(lockPath, { bigint: true });
      if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1n || current.ino !== held.ino || current.dev !== held.dev) refuse("LEASE_LOST");
    };
    await assertHeld();
    return { assertHeld, async release() { try { await assertHeld(); } finally { await handle.close(); } } };
  } catch (error) {
    await handle.close();
    if (error?.code === "EAGAIN" || error?.code === "EWOULDBLOCK") refuse("WRITER_ACTIVE");
    throw safeError(error, "LEASE_UNAVAILABLE");
  }
}

async function assertPrivateDirectory(sourcePath) {
  if (process.platform === "win32") return probeWindows(PRIVACY_SCRIPT, { source: sourcePath, directory: dirname(sourcePath) }, "DIRECTORY_NOT_PRIVATE");
  const source = await lstat(sourcePath);
  const directory = await lstat(dirname(sourcePath));
  if (directory.uid !== process.getuid() || (directory.mode & 0o077 & ~(source.mode & 0o077)) !== 0) refuse("DIRECTORY_NOT_PRIVATE");
  return true;
}

function encodeSegment(value) {
  if (typeof value !== "string" || !value || value === "." || value === "..") refuse("INVALID_HEADER");
  let encoded = "";
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    encoded += character !== "~" && /^[A-Za-z0-9._-]$/u.test(character) ? character : `~${value.charCodeAt(index).toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return encoded;
}

function projectKey(cwd) {
  if (cwd === undefined) return "_no-cwd";
  if (typeof cwd !== "string" || !cwd) refuse("INVALID_HEADER");
  const readable = cwd.replace(/[\\/:]+/gu, "-").split("").map(character => character !== "~" && /^[A-Za-z0-9._-]$/u.test(character) ? character : `~${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`).join("");
  return `--${(readable.replace(/^-+/u, "") || "root").slice(0, 251)}--`;
}

/** Trusted operator callbacks. No native private modules, startup, authentication, or global stores are used. */
export async function createNativeSessionRepairVerifier({ nativeManifestPath, nativeRequire, carrierExecutablePath, carrierProcessNames = ["DeepSeek Harness.exe", "DeepSeekHarness.exe", "dsh.exe", "deepseek-harness", "DeepSeek Harness", "dsh"] } = {}) {
  try {
    if (nativeManifestPath !== undefined) {
      if (nativeRequire !== undefined || !isAbsolute(nativeManifestPath)) refuse("INVALID_NATIVE_RUNTIME");
      const manifest = JSON.parse(await readFile(nativeManifestPath, "utf8"));
      if (manifest.name !== "@deepseek-ai/dsh" || manifest.version !== PINNED_VERSION) refuse("INCOMPATIBLE_NATIVE_RUNTIME");
      nativeRequire = createRequire(nativeManifestPath);
    }
    nativeRequire ??= createRequire(new URL("../package.json", import.meta.url));
    if (typeof nativeRequire?.resolve !== "function") refuse("INVALID_NATIVE_RUNTIME");
    for (const name of ["@deepseek-ai/dsh-session-persistence-jsonl", "@deepseek-ai/dsh-session"]) {
      const manifest = JSON.parse(await readFile(nativeRequire.resolve(`${name}/package.json`), "utf8"));
      if (manifest.version !== PINNED_VERSION) refuse("INCOMPATIBLE_NATIVE_RUNTIME");
    }
    const jsonlRequire = createRequire(nativeRequire.resolve("@deepseek-ai/dsh-session-persistence-jsonl/package.json"));
    const [{ Context }, { default: JsonlSessionPersistence }, { Session, SessionId }, { currentSessionMessageProjections }] = await Promise.all([
      import(pathToFileURL(nativeRequire.resolve("@deepseek-ai/cordis")).href),
      import(pathToFileURL(nativeRequire.resolve("@deepseek-ai/dsh-session-persistence-jsonl")).href),
      import(pathToFileURL(nativeRequire.resolve("@deepseek-ai/dsh-session")).href),
      import(pathToFileURL(jsonlRequire.resolve("@deepseek-ai/dsh-session-format-catalog/message-projections")).href)
    ]);
    if (!Array.isArray(carrierProcessNames) || carrierProcessNames.some(name => typeof name !== "string" || !name)
      || carrierExecutablePath !== undefined && (typeof carrierExecutablePath !== "string" || !isAbsolute(carrierExecutablePath))) refuse("INVALID_CARRIER_IDENTITY");
    const names = [...new Set(["DeepSeek Harness.exe", "DeepSeekHarness.exe", "dsh.exe", "deepseek-harness", "DeepSeek Harness", "dsh", ...carrierProcessNames].map(name => name.toLowerCase()))];
    const executable = carrierExecutablePath === undefined ? undefined : pathKey(carrierExecutablePath);
    const leases = new Map();
    const assertQuiescent = async () => {
      if (process.platform === "win32") return probeWindows(QUIESCENCE_SCRIPT, { names, executable }, "CARRIER_ACTIVE");
      if (process.platform !== "linux") refuse("QUIESCENCE_UNSUPPORTED");
      for (const name of await readdir("/proc")) {
        if (!/^\d+$/u.test(name)) continue;
        let command;
        let path;
        try {
          command = (await readFile(`/proc/${name}/comm`, "utf8")).trim().toLowerCase();
          if (executable) path = await readlink(`/proc/${name}/exe`);
        } catch (error) { if (error.code === "ENOENT" || error.code === "ESRCH") continue; throw error; }
        if (names.includes(command) || executable && pathKey(path) === executable) refuse("CARRIER_ACTIVE");
      }
      return true;
    };
    return Object.freeze({
      async acquireExclusiveWriterLease({ filePath, sourcePath = filePath, allowedRoot, expectedSha256 } = {}) {
        let held;
        try {
          const path = await assertPlainPath(sourcePath, allowedRoot);
          if (filePath !== undefined && pathKey(filePath) !== pathKey(path) || !/^[a-f0-9]{64}$/u.test(expectedSha256)) refuse("INVALID_INPUT");
          if (leases.has(pathKey(path))) refuse("WRITER_ACTIVE");
          held = process.platform === "win32" ? await acquireWindowsLease(join(dirname(path), "session.lock")) : await acquirePosixLease(join(dirname(path), "session.lock"), jsonlRequire);
          if (digest(await snapshot(path)) !== expectedSha256) refuse("SOURCE_CHANGED");
          let released = false;
          const assertHeld = async () => { if (released) refuse("LEASE_LOST"); await held.assertHeld(); };
          const lease = Object.freeze({
            async assertQuiescent() { try { await assertHeld(); await assertQuiescent(); await assertHeld(); return true; } catch (error) { throw safeError(error, "QUIESCENCE_UNVERIFIED"); } },
            async assertPrivateDirectory() { try { await assertHeld(); await assertPrivateDirectory(path); await assertHeld(); return true; } catch (error) { throw safeError(error, "DIRECTORY_NOT_PRIVATE"); } },
            async release() { if (released) return; released = true; leases.delete(pathKey(path)); try { await held.release(); } catch (error) { throw safeError(error, "LEASE_RELEASE_FAILED"); } }
          });
          leases.set(pathKey(path), { lease, expectedSha256 });
          return lease;
        } catch (error) { await held?.release(); throw safeError(error, "LEASE_UNAVAILABLE"); }
      },
      async verifyCandidate({ candidatePath, originalPath, sourcePath, header, rows, events, expectedSha256, candidateSha256, encoding } = {}) {
        let validationRoot;
        let ctx;
        let reader;
        try {
          const entry = typeof sourcePath === "string" ? leases.get(pathKey(sourcePath)) : undefined;
          if (!entry || entry.expectedSha256 !== expectedSha256) refuse("LEASE_REQUIRED");
          await entry.lease.assertQuiescent();
          await entry.lease.assertPrivateDirectory();
          if (![candidatePath, originalPath].every(path => typeof path === "string" && pathKey(dirname(path)) === pathKey(dirname(sourcePath)))) refuse("UNSAFE_PATH");
          const original = await snapshot(originalPath);
          const candidate = await snapshot(candidatePath);
          if (digest(original) !== expectedSha256 || digest(candidate) !== candidateSha256) refuse("SOURCE_CHANGED");
          const audit = auditSessionLog(original, { encoding });
          const candidateAudit = auditSessionLog(candidate, { encoding });
          if (!isDeepStrictEqual(audit.rows, rows) || !isDeepStrictEqual(audit.header, header) || !isDeepStrictEqual(audit.events, events)
            || !isDeepStrictEqual(candidateAudit.rows, rows) || candidateAudit.changedEventCount !== 0 || audit.candidateSha256 !== candidateSha256) refuse("RECORD_EQUALITY_FAILED");
          validationRoot = await mkdtemp(join(dirname(sourcePath), ".dsmm-native-verify-"));
          if (process.platform === "win32") await probeWindows(PRIVATE_ROOT_SCRIPT, { directory: validationRoot }, "DIRECTORY_NOT_PRIVATE");
          else await chmod(validationRoot, 0o700);
          const path = join(validationRoot, projectKey(header.cwd), encodeSegment(header.id), `session.v${header.version}.jsonl${encoding === "zstd" ? ".zstd" : ""}`);
          await mkdir(dirname(path), { recursive: true, mode: 0o700 });
          const target = await open(path, "wx", 0o600);
          try { await target.writeFile(candidate); await target.sync(); } finally { await target.close(); }
          ctx = new Context();
          await ctx.plugin(JsonlSessionPersistence, { root: validationRoot, compression: encoding }).await();
          reader = await ctx.sessionPersistence.open(SessionId(header.id), "read");
          const read = await reader.read();
          if (read.events.length !== events.length) refuse("NATIVE_PREFIX_MISMATCH");
          for (const event of read.events) if (event.type === "deepwork/mode" || event.type === "dsmm/role-policy") {
            if (!isDeepStrictEqual(event, events[event.seq])) refuse("NATIVE_METADATA_MISMATCH");
          }
          const restored = Session.fromRestore(reader.id, read.events, reader.header, reader.inheritedEventCount, read.eventState, currentSessionMessageProjections);
          const baseline = structuredClone(read.events).map(event => {
            if ((event.type === "deepwork/mode" || event.type === "dsmm/role-policy") && event.ignorable === true) delete event.ignorable;
            return event;
          });
          const reference = Session.fromRestore(reader.id, baseline, structuredClone(reader.header), reader.inheritedEventCount, "detached", currentSessionMessageProjections);
          if (!isDeepStrictEqual(restored.surface.nodes, reference.surface.nodes) || !isDeepStrictEqual(restored.deriveMessages(), reference.deriveMessages())) refuse("HISTORY_CHANGED");
          if (digest(await snapshot(candidatePath)) !== candidateSha256 || digest(await snapshot(originalPath)) !== expectedSha256) refuse("SOURCE_CHANGED");
          await entry.lease.assertQuiescent();
          await entry.lease.assertPrivateDirectory();
          return Object.freeze({ publicRead: true, restored: true, historyEqual: true });
        } catch (error) { throw safeError(error, "NATIVE_VERIFICATION_FAILED"); }
        finally {
          try { try { await reader?.close(); } finally { await ctx?.fiber.dispose(); } }
          catch { refuse("NATIVE_DISPOSAL_FAILED"); }
          finally { if (validationRoot) await rm(validationRoot, { recursive: true, force: true }).catch(() => refuse("VALIDATION_CLEANUP_FAILED")); }
        }
      }
    });
  } catch (error) { throw safeError(error, "NATIVE_RUNTIME_UNAVAILABLE"); }
}

export default createNativeSessionRepairVerifier;
