import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

const GUIDE_PATH = join(process.cwd(), "skills", "debugging", "references", "tools", "playwright-cli.md")

function extractFence(text: string, language: string, marker: string): string {
  const fencePattern = new RegExp(["```", language, String.raw`\r?\n([\s\S]*?)\r?\n`, "```"].join(""), "g")
  const fences = [...text.matchAll(fencePattern)]
  const fence = fences.find((candidate) => candidate[1]?.includes(marker))?.[1]
  assert.ok(fence, `missing ${language} fence containing ${marker}`)
  return fence
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
  assert.match(
    guide,
    /disposable.*test account.*injected.*target-site test state/is,
    "target authentication must use disposable credentials or injected test state",
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
  for (const field of ["runRoot", "pid", "startTimeTicks", "pidFile", "stdoutLog", "stderrLog"]) {
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
