import assert from "node:assert/strict"
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { test } from "node:test"

const DEBUG_SKILL_PATH = join(process.cwd(), "skills", "debugging", "SKILL.md")
const GUIDE_PATH = join(process.cwd(), "skills", "debugging", "references", "tools", "playwright-cli.md")
const FRONTEND_SKILL_PATH = join(process.cwd(), "skills", "frontend", "SKILL.md")
const DESIGN_GUIDE_PATH = join(process.cwd(), "skills", "frontend", "references", "design", "README.md")
const CLONE_GUIDE_PATH = join(process.cwd(), "skills", "frontend", "references", "design", "clone-from-url.md")
const PERFECTION_GUIDE_PATH = join(process.cwd(), "skills", "frontend", "references", "perfection", "README.md")
const REACT_PERF_GUIDE_PATH = join(
  process.cwd(),
  "skills",
  "frontend",
  "references",
  "perfection",
  "react-perf-tooling.md",
)

const BROWSER_ENTRY_PATHS = [
  DEBUG_SKILL_PATH,
  GUIDE_PATH,
  FRONTEND_SKILL_PATH,
  DESIGN_GUIDE_PATH,
  CLONE_GUIDE_PATH,
  PERFECTION_GUIDE_PATH,
  REACT_PERF_GUIDE_PATH,
] as const

function extractFence(text: string, language: string, marker: string): string {
  const fencePattern = new RegExp(["```", language, String.raw`\r?\n([\s\S]*?)\r?\n`, "```"].join(""), "g")
  const fences = [...text.matchAll(fencePattern)]
  const fence = fences.find((candidate) => candidate[1]?.includes(marker))?.[1]
  assert.ok(fence, `missing ${language} fence containing ${marker}`)
  return fence
}

function extractReadOwnedCdpPort(text: string): string {
  const start = text.indexOf("async function readOwnedCdpPort")
  const end = text.indexOf("\n\nasync function launchOwnedAuditBrowser", start)
  assert.ok(start >= 0 && end > start, "missing standalone readOwnedCdpPort example")
  return text
    .slice(start, end)
    .replace(
      "userDataDir: string, launchStartedAt: number): Promise<number>",
      "userDataDir, launchStartedAt)",
    )
    .replace("let lastError: unknown;", "let lastError;")
    .replace(
      "const version = (await response.json()) as { webSocketDebuggerUrl?: string };",
      "const version = await response.json();",
    )
}

test("Playwright browser debugging keeps profiles, accounts, extensions, and launches run-owned", () => {
  const guide = readFileSync(GUIDE_PATH, "utf8")

  assert.doesNotMatch(guide, /Copy-Item/, "legacy real-profile copy procedure must be absent")
  assert.doesNotMatch(guide, /reuse.*login.*state|login.*state.*reuse/is, "authentication state must not be reused")
  assert.doesNotMatch(guide, /real profile.*clone|clone.*real profile/is, "real profile cloning must be absent")

  assert.match(guide, /run-owned.*empty.*user-data directory/i, "persistent context needs an empty run-owned profile")
  assert.match(guide, /independent.*user-data directory/i, "persistent context must not target a primary browser profile")
  assert.match(guide, /never copy.*browser profile/i, "real browser profiles must never be copied")
  assert.match(guide, /--load-extension.*--disable-extensions-except.*prohibited/i, "extension loading flags must be prohibited")
  assert.match(guide, /never sign in.*browser.*vendor account.*Google.*Microsoft.*Firefox/is, "browser and vendor accounts must be prohibited")
  assert.match(guide, /personal web account/i, "personal web accounts must be prohibited")
  assert.match(guide, /(?:do not|never) sign in.*disposable.*test account/is, "disposable and test-account sign-in must be prohibited")
  assert.match(guide, /authentication.*verification limitation/is, "authentication-gated coverage must be reported as limited")
  assert.doesNotMatch(
    guide,
    /use only a disposable.*test account|use.*injected.*(?:auth|test) state/is,
    "disposable credentials and injected authentication state must not be allowed",
  )

  const launchFence = extractFence(guide, "ts", "chromium.launchPersistentContext")
  assert.match(
    launchFence,
    /chromium\.launchPersistentContext\(\s*process\.env\.PW_USER_DATA_DIR!,\s*\{[\s\S]*?channel:\s*'chrome',[\s\S]*?headless:\s*false,[\s\S]*?args:\s*\[/,
    "launchPersistentContext must use the run-owned environment directory with Chrome launch options",
  )
  assert.match(launchFence, /'--disable-extensions'/, "launch must disable extensions")
  assert.match(launchFence, /'--disable-sync'/, "launch must disable browser settings sync")
  assert.match(launchFence, /clearCookies\(\).*run-owned.*empty profile/is, "cookie clearing must be limited to the empty profile")

  assert.match(guide, /prefer.*native background task.*process tool.*actually exposes/is, "native background capability is preferred")
  const backgroundFence = extractFence(guide, "powershell", "Start-Process")
  assert.match(backgroundFence, /Start-Process/, "PowerShell fallback must launch a process")
  assert.match(backgroundFence, /-PassThru/, "PowerShell fallback must retain the process handle")
  assert.match(backgroundFence, /-RedirectStandardOutput/, "PowerShell fallback must capture stdout")
  assert.match(backgroundFence, /-RedirectStandardError/, "PowerShell fallback must capture stderr")
  assert.match(backgroundFence, /\.Id.*browser-debug\.pid|browser-debug\.pid.*\.Id/is, "PowerShell fallback must record the run-owned PID")
  assert.match(backgroundFence, /\$env:PW_BROWSER_DEBUG_SCRIPT/, "browser-debug script must be an explicit project or user input")
  assert.match(backgroundFence, /Test-Path -LiteralPath \$browserDebugScriptInput -PathType Leaf/, "browser-debug script input must exist")
  assert.match(backgroundFence, /Resolve-Path -LiteralPath \$browserDebugScriptInput -ErrorAction Stop/, "browser-debug script input must resolve")
  assert.match(backgroundFence, /\('"\{0\}"' -f \$resolvedBrowserDebugScript\)/, "browser-debug script argument must be quoted")
  assert.match(backgroundFence, /\('"\{0\}"' -f \$runRoot\)/, "run-root argument must be quoted")
  assert.match(backgroundFence, /\$launchReceipt\s*=\s*\[ordered\]@\{/, "launch must build an ordered receipt")
  for (const field of [
    "runRoot",
    "pid",
    "startTimeTicks",
    "pidFile",
    "ownershipMarker",
    "ownershipToken",
    "stdoutLog",
    "stderrLog",
  ]) {
    assert.match(backgroundFence, new RegExp(String.raw`\b${field}\s*=`), `launch receipt must include ${field}`)
  }
  assert.match(backgroundFence, /Write-Output\s*\(\$launchReceipt\s*\|\s*ConvertTo-Json -Compress\)/, "launch must emit one compressed JSON receipt")
  assert.doesNotMatch(backgroundFence, /-Wait/, "launch example must return immediately rather than wait for the browser session")
  assert.match(guide, /Start-Job.*does not.*shell.*exit/is, "Start-Job must be rejected as non-durable")
  assert.match(guide, /readiness endpoint.*bounded log polling/i, "readiness checking must be bounded")
  assert.match(guide, /no.*tool call.*wait.*browser session/is, "browser sessions must not block a tool call")

  assert.match(guide, /only.*run-owned PID.*Process object/i, "cleanup must only terminate the verified run-owned process")
  const cleanupFence = extractFence(guide, "powershell", "Get-Process")
  assert.match(cleanupFence, /\[IO\.Directory\]::GetParent\(\$resolvedRunRoot\)/, "cleanup must inspect the run root parent")
  assert.match(cleanupFence, /\$runRootParent\.FullName\s+-ne\s+\$resolvedTempRoot/, "cleanup must require the exact temp parent")
  assert.match(cleanupFence, /'\^ocmm-playwright-\[0-9a-f\]\{32\}\$'/, "cleanup must require a GUID run-root basename")
  assert.match(cleanupFence, /Get-Content -LiteralPath \$ownershipMarker/, "cleanup must read the exact ownership marker")
  assert.match(cleanupFence, /-ne \$ownershipToken/, "cleanup must reject a replaced or unowned run root")
  assert.doesNotMatch(cleanupFence, /StartsWith/, "prefix-only cleanup validation must be absent")
  const cleanupSteps = [
    ["$runOwnedProcess.StartTime.ToUniversalTime().Ticks -ne $expectedStartTicks", "StartTime ownership check"],
    ["$runOwnedProcess.Kill()", "same-object kill"],
    ["$runOwnedProcess.WaitForExit(10000)", "bounded wait"],
    ['throw "Run-owned browser process did not exit before cleanup deadline"', "cleanup deadline throw"],
    ["Remove-Item -LiteralPath $resolvedRunRoot -Recurse -Force", "run-root removal"],
  ] as const
  let previousCleanupStep = -1
  for (const [needle, label] of cleanupSteps) {
    const index = cleanupFence.indexOf(needle)
    assert.ok(index >= 0, `cleanup must contain ${label}`)
    assert.ok(index > previousCleanupStep, `cleanup must order ${label} after the preceding step`)
    previousCleanupStep = index
  }
  assert.doesNotMatch(cleanupFence, /Stop-Process -Id/, "cleanup must not readdress a PID after verification")
  assert.match(cleanupFence, /Refusing to remove a non-run-owned profile/, "cleanup must stay fail closed")
})

test("every browser entry point requires anonymous run-owned isolation", () => {
  for (const path of BROWSER_ENTRY_PATHS) {
    const guide = readFileSync(path, "utf8")
    assert.match(
      guide,
      /run-owned temporary empty browser profile or isolated empty context/i,
      `${path} must require a run-owned empty browser environment`,
    )
    assert.match(
      guide,
      /do not sign in.*including disposable or test accounts/is,
      `${path} must prohibit all account sign-in`,
    )
    assert.match(
      guide,
      /do not import, copy, reuse, or sync.*settings.*extensions.*cookies.*authentication.*storage state/is,
      `${path} must prohibit importing or synchronizing user state`,
    )
    assert.match(
      guide,
      /report authentication as a verification limitation/i,
      `${path} must require honest reporting for authentication-gated coverage`,
    )
    assert.doesNotMatch(
      guide,
      /use only a disposable.*test account|use.*injected.*(?:auth|test) state|mirror what a real returning user sees/is,
      `${path} must not retain a login or injected-state exception`,
    )
  }
})

test("Lighthouse examples use only their dynamically owned CDP endpoint", () => {
  for (const path of [PERFECTION_GUIDE_PATH, REACT_PERF_GUIDE_PATH]) {
    const guide = readFileSync(path, "utf8")
    const auditFence = extractFence(guide, "ts", "DevToolsActivePort")

    assert.match(auditFence, /mkdtemp\(/, `${path} must create a unique temporary run root`)
    assert.match(auditFence, /chromium\.launchPersistentContext\(/, `${path} must launch its own persistent context`)
    assert.match(auditFence, /'--disable-extensions'/, `${path} must disable extensions`)
    assert.match(auditFence, /'--disable-sync'/, `${path} must disable browser sync`)
    assert.match(auditFence, /'--remote-debugging-address=127\.0\.0\.1'/, `${path} must bind CDP to loopback`)
    assert.match(auditFence, /'--remote-debugging-port=0'/, `${path} must let Chrome allocate a fresh CDP port`)
    assert.match(auditFence, /Date\.now\(\).*deadline|deadline.*Date\.now\(\)/s, `${path} must bound CDP readiness polling`)
    assert.match(
      auditFence,
      /remainingMs\s*=\s*deadline\s*-\s*Date\.now\(\)/,
      `${path} must derive the request timeout from the remaining readiness budget`,
    )
    assert.match(
      auditFence,
      /fetch\([\s\S]*?signal:\s*AbortSignal\.timeout\(remainingMs\)/,
      `${path} must abort a stalled CDP response within the remaining budget`,
    )
    assert.match(auditFence, /\/json\/version/, `${path} must probe the launched CDP endpoint`)
    assert.match(auditFence, /webSocketDebuggerUrl/, `${path} must validate the browser endpoint identity`)
    assert.match(auditFence, /port:\s*ownedBrowser\.port/, `${path} must give Lighthouse only the validated dynamic port`)
    assert.match(auditFence, /ownershipMarker/, `${path} must retain run-root ownership evidence`)
    assert.match(
      auditFence,
      /(?:ownedContext|context)\.close\(\)[\s\S]*removeOwnedRunRoot/,
      `${path} must close its context before exact cleanup`,
    )
    assert.doesNotMatch(auditFence, /\b9222\b/, `${path} must not use the conventional shared CDP port`)
    assert.doesNotMatch(auditFence, /connectOverCDP/, `${path} must not attach to an existing browser`)
  }
})

test("documented CDP readiness rejects an endpoint that never responds", async () => {
  for (const path of [PERFECTION_GUIDE_PATH, REACT_PERF_GUIDE_PATH]) {
    const guide = readFileSync(path, "utf8")
    const source = extractReadOwnedCdpPort(extractFence(guide, "ts", "DevToolsActivePort"))
    assert.match(source, /AbortSignal\.timeout\(remainingMs\)/, `${path} must make the no-response probe cancellable`)
    const readOwnedCdpPort = new Function(
      "join",
      "readFile",
      "stat",
      "delay",
      "Date",
      `"use strict"; ${source}; return readOwnedCdpPort;`,
    )(join, readFile, stat, delay, {
      now: (() => {
        let call = 0
        return () => (call++ === 0 ? 0 : call < 4 ? 9_990 : 10_001)
      })(),
    }) as (userDataDir: string, launchStartedAt: number) => Promise<number>

    const runRoot = await mkdtemp(join(tmpdir(), "ocmm-cdp-timeout-contract-"))
    const server = createServer(() => {})
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject)
        server.listen(0, "127.0.0.1", resolve)
      })
      const address = server.address()
      assert.ok(address && typeof address !== "string", "hanging endpoint must expose a local port")
      await writeFile(join(runRoot, "DevToolsActivePort"), `${address.port}\n/devtools/browser/run-owned`)

      const startedAt = performance.now()
      await assert.rejects(
        readOwnedCdpPort(runRoot, 0),
        /Owned CDP endpoint was not ready before the deadline/,
        `${path} must reject a CDP endpoint that accepts but never responds`,
      )
      assert.ok(performance.now() - startedAt < 1_000, `${path} must actively abort instead of hanging`)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
      await rm(runRoot, { recursive: true, force: false })
    }
  }
})

test("React audit initialization is covered by the owned-browser cleanup guard", () => {
  const guide = readFileSync(REACT_PERF_GUIDE_PATH, "utf8")
  const auditFence = extractFence(guide, "ts", "DevToolsActivePort")
  assert.match(
    auditFence,
    /const ownedBrowser = await launchOwnedAuditBrowser\(\);\s*try\s*\{[\s\S]*?await ownedBrowser\.context\.addInitScript\([\s\S]*?\}\s*finally\s*\{\s*await ownedBrowser\.close\(\)/,
    "react-scan initialization failures must still close the owned browser",
  )
})

test("unsafe legacy Python Lighthouse runner is not an active browser entry point", () => {
  for (const path of [FRONTEND_SKILL_PATH, PERFECTION_GUIDE_PATH]) {
    const guide = readFileSync(path, "utf8")
    assert.doesNotMatch(guide, /uv run[^\n]*lighthouse-audit\.py/, `${path} must not recommend the legacy runner`)
    assert.match(
      guide,
      /lighthouse-audit\.py.*must not be used as a browser verification entry point/is,
      `${path} must explicitly disable the legacy runner and direct users to the canonical example`,
    )
  }
})
